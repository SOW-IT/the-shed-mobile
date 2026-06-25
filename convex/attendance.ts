import { ConvexError, v } from "convex/values";
import { assignmentsOf, roleNeedsUniversity, staffYearForDate } from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  formatMetadataFieldValue,
} from "../shared/attendanceMemberMeta";
import { compareAttendanceFrequency, memberMatchesEventCampus, normalizeSubgroups, subgroupMatches } from "../shared/rollcall";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getProfile, optionalProfile, requireProfile } from "./model";

export type RosterEntry = {
  key: string;
  kind: "staff" | "member";
  email?: string;
  memberId?: string;
  name: string;
  roles: string[];
  campuses: string[];
  university?: string;
  subtitle?: string;
  photo?: string | null;
};

type MetadataField = {
  _id: string;
  key: string;
  values?: Record<string, string>;
};

const resolveUniversity = (
  fields: MetadataField[],
  metadata: Record<string, string> | undefined,
  orgCampuses: string[] = []
): string | undefined => {
  const campusField = fields.find((field) => field.key === CAMPUS_FIELD_KEY);
  if (campusField && metadata) {
    const raw = metadata[campusField._id];
    if (raw) {
      const label = campusField.values?.[raw] ?? raw;
      if (label && label !== "Other") return label;
    }
  }
  return orgCampuses[0];
};

const personKey = (row: {
  email?: string | null;
  memberId?: string | null;
}): string =>
  row.email ? `staff:${row.email}` : row.memberId ? `member:${row.memberId}` : "";

/**
 * The shared member pool for a year: every `staffProfile` plus attendance-only
 * members. Each entry carries roles/campuses or metadata for the row subtitle.
 */
export const roster = query({
  args: {
    year: v.number(),
    subgroup: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { year, subgroup, eventId }) => {
    if (!(await optionalProfile(ctx))) return [];
    const event = eventId ? await ctx.db.get(eventId) : null;
    // Members + metadata live under the event's CALENDAR year, but staff
    // roles/campus are read from the profile of the *staff* year of the event's
    // date — so Jan–Aug events use that year's profiles and Sep–Dec events use
    // the next staff year's (post-rollover) roles, matched by email. Without an
    // event in context both default to the asked-for year.
    const profileYear = event ? staffYearForDate(new Date(event.dateStart)) : year;
    const memberYear = event
      ? new Date(event.dateStart + 10 * 60 * 60 * 1000).getUTCFullYear()
      : year;
    const metadataFields = (
      await ctx.db
        .query("attendanceMetadata")
        .withIndex("by_year", (q) => q.eq("year", memberYear))
        .collect()
    )
      .filter(
        (field) =>
          !subgroup || !field.subgroup || subgroupMatches(field.subgroup, subgroup)
      )
      .sort((a, b) => a.order - b.order);

    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", profileYear))
      .collect();
    const extras = await ctx.db
      .query("attendanceMembers")
      .collect();

    // Overlay rows link to a staff profile by matching either their explicit
    // staffEmail or their stored address against the year's profile emails,
    // trying both SOW domains (older staff years use @sowaustralia.com, newer
    // @sow.org.au). The matched key is always the profile's actual email.
    const profileEmails = new Set(profiles.map((p) => p.email.toLowerCase()));
    const matchProfileEmail = (email: string | undefined): string | undefined =>
      staffEmailCandidates(email).find((c) => profileEmails.has(c));
    const shadowByEmail = new Map<string, (typeof extras)[number]>();
    const pureExtras: typeof extras = [];
    for (const m of extras) {
      const matched = matchProfileEmail(m.staffEmail) ?? matchProfileEmail(m.email);
      if (matched) {
        if (!shadowByEmail.has(matched)) shadowByEmail.set(matched, m);
        continue;
      }
      // A staffEmail that matches no profile this year stays hidden (not a pure
      // extra), preserving prior behaviour for stale overlays.
      if (m.staffEmail) {
        const key = m.staffEmail.toLowerCase();
        if (!shadowByEmail.has(key)) shadowByEmail.set(key, m);
        continue;
      }
      pureExtras.push(m);
    }

    const metadataSubtitle = (
      metadata: Record<string, string> | undefined
    ): string =>
      metadataFields
        .map((f) => {
          const raw = metadata?.[f._id];
          if (!raw) return null;
          return formatMetadataFieldValue(f.key, raw, memberYear, f.values);
        })
        .filter(Boolean)
        .join(" · ");

    const staffRows: RosterEntry[] = await Promise.all(profiles.map(async (p) => {
      const shadow = shadowByEmail.get(p.email.toLowerCase());
      const assignments = assignmentsOf(p);
      const roles = [...new Set(assignments.map((a) => a.role))];
      const campuses = [
        ...new Set(
          assignments.flatMap((a) =>
            a.university && roleNeedsUniversity(a.role) ? [a.university] : []
          )
        ),
      ];
      const orgSubtitle =
        roles.length > 0
          ? roles.join(" · ")
          : campuses.length > 0
            ? campuses.join(" · ")
            : "";
      const metaSubtitle = metadataSubtitle(shadow?.metadata);
      const subtitle = [orgSubtitle, metaSubtitle].filter(Boolean).join(" · ");
      const user = p.userId ? await ctx.db.get(p.userId) : null;
      return {
        key: `staff:${p.email}`,
        kind: "staff" as const,
        email: p.email,
        memberId: shadow?._id,
        name: p.name ?? p.email,
        roles,
        campuses,
        // The staff-year profile's campus wins over a (possibly stale) overlay.
        university: campuses[0] ?? resolveUniversity(metadataFields, shadow?.metadata, campuses),
        subtitle: subtitle || undefined,
        photo: user?.image ?? null,
      };
    }));

    const extraRows: RosterEntry[] = pureExtras.map((m) => ({
      key: `member:${m._id}`,
      kind: "member" as const,
      memberId: m._id,
      name: m.name,
      roles: [],
      campuses: [],
      university: resolveUniversity(metadataFields, m.metadata),
      subtitle: metadataFields
        .map((f) => {
          const raw = m.metadata?.[f._id];
          if (!raw) return null;
          return formatMetadataFieldValue(f.key, raw, memberYear, f.values);
        })
        .filter(Boolean)
        .join(" · "),
    }));

    const rows = [...staffRows, ...extraRows];
    if (!event) return rows.sort((a, b) => a.name.localeCompare(b.name));

    const eventTagIds = new Set((event.tagIds ?? []).map(String));
    const eventSubgroups = new Set(normalizeSubgroups(event.subgroups));
    const historyEvents = await ctx.db
      .query("events")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    const scores = new Map<
      string,
      { tagMatches: number; subgroupMatches: number; total: number; latest: number }
    >();
    for (const historyEvent of historyEvents) {
      if (historyEvent._id === event._id) continue;
      const historyAttendance = await ctx.db
        .query("attendance")
        .withIndex("by_event", (q) => q.eq("eventId", historyEvent._id))
        .collect();
      for (const row of historyAttendance) {
        const key = personKey(row);
        if (!key) continue;
        const score = scores.get(key) ?? {
          tagMatches: 0,
          subgroupMatches: 0,
          total: 0,
          latest: 0,
        };
        score.total += 1;
        if ((historyEvent.tagIds ?? []).some((tagId) => eventTagIds.has(String(tagId)))) {
          score.tagMatches += 1;
        }
        if (
          historyEvent.subgroups.some((historySubgroup) =>
            eventSubgroups.has(historySubgroup)
          )
        ) {
          score.subgroupMatches += 1;
        }
        score.latest = Math.max(score.latest, historyEvent.dateStart);
        scores.set(key, score);
      }
    }

    return rows.sort((a, b) =>
      compareAttendanceFrequency(
        scores.get(a.key),
        scores.get(b.key),
        memberMatchesEventCampus(eventSubgroups, a),
        memberMatchesEventCampus(eventSubgroups, b),
        a.name,
        b.name
      )
    );
  },
});

/**
 * The roll-call for an event: who's signed in, newest first, each joined with
 * the person's display name for that year (falls back to the email).
 */
export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    if (!(await optionalProfile(ctx))) return [];
    const event = await ctx.db.get(eventId);
    if (!event) return [];
    // Staff roles/campus come from the profile of the event date's *staff* year
    // (Sep 1 rollover); member fields (Year, Gender, …) and the attendance-member
    // overlays come from the event's CALENDAR year, which for a Sep–Dec event is
    // one less than its staff year.
    const profileYear = staffYearForDate(new Date(event.dateStart));
    const calendarYear = new Date(
      event.dateStart + 10 * 60 * 60 * 1000
    ).getUTCFullYear();
    const metadataFields = (
      await ctx.db
        .query("attendanceMetadata")
        .withIndex("by_year", (q) => q.eq("year", calendarYear))
        .collect()
    )
      .filter(
        (field) =>
          !event.subgroups[0] ||
          !field.subgroup ||
          subgroupMatches(field.subgroup, event.subgroups[0])
      )
      .sort((a, b) => a.order - b.order);
    const metadataSubtitle = (
      metadata: Record<string, string> | undefined
    ): string =>
      metadataFields
        .map((field) => {
          const raw = metadata?.[field._id];
          if (!raw) return null;
          return formatMetadataFieldValue(field.key, raw, calendarYear, field.values);
        })
        .filter(Boolean)
        .join(" · ");
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Shape a signed-in row from a staff profile. The person's email is matched
    // against the staff-year profiles trying both SOW domains, and the row is
    // keyed by the profile's actual email so it lines up with the roster.
    type AttendanceDoc = (typeof rows)[number];
    const staffRowFor = async (row: AttendanceDoc, email: string) => {
      let profile: Awaited<ReturnType<typeof getProfile>> = null;
      for (const candidate of staffEmailCandidates(email)) {
        profile = await getProfile(ctx, candidate, profileYear);
        if (profile) break;
      }
      const resolvedEmail = profile?.email.toLowerCase() ?? email.toLowerCase();
      // The attendance member overlay for the event's calendar year (either SOW
      // domain), used as the fallback identity when no staff profile applies for
      // the event-date staff year (e.g. a Sep–Dec event by someone who was staff
      // last staff year but isn't this one).
      let shadow: Doc<"attendanceMembers"> | null = null;
      for (const candidate of staffEmailCandidates(resolvedEmail)) {
        shadow = await ctx.db
          .query("attendanceMembers")
          .withIndex("by_staff_email", (q) => q.eq("staffEmail", candidate))
          .unique();
        if (shadow) break;
      }
      const assignments = profile ? assignmentsOf(profile) : [];
      const roles = [...new Set(assignments.map((assignment) => assignment.role))];
      const campuses = [
        ...new Set(
          assignments.flatMap((assignment) =>
            assignment.university && roleNeedsUniversity(assignment.role)
              ? [assignment.university]
              : []
          )
        ),
      ];
      const user = profile?.userId ? await ctx.db.get(profile.userId) : null;
      return {
        profile,
        row: {
          ...row,
          email: resolvedEmail,
          // Staff profile name wins; otherwise fall back to the calendar-year
          // attendance member's name rather than showing a bare email.
          name: profile?.name ?? shadow?.name ?? resolvedEmail,
          // Without a staff profile for this staff year, this person is shown as
          // the calendar-year attendance member, not staff.
          kind: profile ? ("staff" as const) : ("member" as const),
          roles,
          campuses,
          // The staff-year profile's campus wins over a (possibly stale) overlay.
          university: campuses[0] ?? resolveUniversity(metadataFields, shadow?.metadata, campuses),
          subtitle: metadataSubtitle(shadow?.metadata) || undefined,
          photo: user?.image ?? null,
        },
      };
    };

    const withNames = await Promise.all(
      rows.map(async (row) => {
        if (row.email) {
          return (await staffRowFor(row, row.email)).row;
        }
        if (row.memberId) {
          const member = await ctx.db.get(row.memberId);
          // A staff member whose email (either SOW domain) belongs to a profile
          // this year is shown (and de-duplicated) as that staff member.
          if (member?.email) {
            const built = await staffRowFor(row, member.email);
            if (built.profile) return built.row;
          }
          return {
            ...row,
            name: member?.name ?? "Unknown",
            kind: "member" as const,
            roles: [],
            campuses: [],
            university: resolveUniversity(metadataFields, member?.metadata),
            subtitle: metadataSubtitle(member?.metadata) || undefined,
            photo: null,
          };
        }
        return {
          ...row,
          name: "Unknown",
          kind: "staff" as const,
          roles: [],
          campuses: [],
          university: undefined,
          subtitle: undefined,
          photo: null,
        };
      })
    );
    return withNames.sort((a, b) => b.signInTime - a.signInTime);
  },
});

/** Sign a person in by staff email or attendance member id. Idempotent. */
export const signIn = mutation({
  args: {
    eventId: v.id("events"),
    email: v.optional(v.string()),
    memberId: v.optional(v.id("attendanceMembers")),
  },
  handler: async (ctx, { eventId, email, memberId }) => {
    await requireProfile(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw new ConvexError("Event not found.");
    if (!!email === !!memberId) {
      throw new ConvexError("Provide either email or memberId.");
    }

    if (email) {
      const lower = email.trim().toLowerCase();
      if (!lower) throw new ConvexError("A person's email is required.");
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_event_and_email", (q) =>
          q.eq("eventId", eventId).eq("email", lower)
        )
        .unique();
      if (existing) return existing._id;
      return await ctx.db.insert("attendance", {
        eventId,
        email: lower,
        signInTime: Date.now(),
      });
    }

    const member = memberId ? await ctx.db.get(memberId) : null;
    if (!member) {
      throw new ConvexError("Member not found.");
    }
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_and_member", (q) =>
        q.eq("eventId", eventId).eq("memberId", memberId!)
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("attendance", {
      eventId,
      memberId,
      signInTime: Date.now(),
    });
  },
});

/** Update per-event fields for a signed-in member (notes, sign-in time). */
export const updateRecord = mutation({
  args: {
    attendanceId: v.id("attendance"),
    notes: v.optional(v.string()),
    signInTime: v.optional(v.number()),
  },
  handler: async (ctx, { attendanceId, notes, signInTime }) => {
    await requireProfile(ctx);
    const row = await ctx.db.get(attendanceId);
    if (!row) throw new ConvexError("Attendance record not found.");
    const patch: { notes?: string; signInTime?: number } = {};
    if (notes !== undefined) {
      const trimmed = notes.trim();
      patch.notes = trimmed || undefined;
    }
    if (signInTime !== undefined) patch.signInTime = signInTime;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(attendanceId, patch);
  },
});

/** Remove a person from an event's roll-call. */
export const signOut = mutation({
  args: {
    eventId: v.id("events"),
    email: v.optional(v.string()),
    memberId: v.optional(v.id("attendanceMembers")),
  },
  handler: async (ctx, { eventId, email, memberId }) => {
    await requireProfile(ctx);
    // Mirror signIn's contract: exactly one identifier, so an ambiguous call
    // can't silently leave the member row behind when email lookup misses.
    if (!!email === !!memberId) {
      throw new ConvexError("Provide either email or memberId.");
    }
    if (email) {
      const lower = email.trim().toLowerCase();
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_event_and_email", (q) =>
          q.eq("eventId", eventId).eq("email", lower)
        )
        .unique();
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (memberId) {
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_event_and_member", (q) =>
          q.eq("eventId", eventId).eq("memberId", memberId)
        )
        .unique();
      if (existing) await ctx.db.delete(existing._id);
    }
  },
});
