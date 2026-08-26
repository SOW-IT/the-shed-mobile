import { ConvexError, v } from "convex/values";
import {
  assignmentsOf,
  eventStaffYear,
  roleNeedsUniversity,
  staffYearStartMs,
  sydneyCalendarYear,
} from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  formatMetadataFieldValue,
  ROLE_FIELD_KEY,
} from "../shared/attendanceMemberMeta";
import { canReverseSignIn, compareAttendanceFrequency, memberMatchesEventCampus, normalizeSubgroups, personDisplayName, personKey, subgroupMatches } from "../shared/rollcall";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  displayName,
  findMemberByEmail,
  getProfile,
  optionalProfile,
  requireProfile,
} from "./model";
import { logAttendanceAction } from "./attendanceAudit";
import { markSubgroupsDirty } from "./attendanceMetrics";

const ROSTER_HISTORY_EVENT_LIMIT = 60;

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

export const roster = query({
  args: {
    year: v.number(),
    subgroup: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { year, subgroup, eventId }) => {
    if (!(await optionalProfile(ctx))) return [];
    const event = eventId ? await ctx.db.get(eventId) : null;
    const profileYear = event ? eventStaffYear(event.dateStart) : year;
    const memberYear = event
      ? sydneyCalendarYear(new Date(event.dateStart))
      : year;
    const eventFieldSubgroups = event ? normalizeSubgroups(event.subgroups) : [];
    const metadataFields = (await ctx.db.query("attendanceMetadata").collect())
      .filter((field) => {
        if (!field.subgroup) return true;
        if (event) {
          return eventFieldSubgroups.some((sg) =>
            subgroupMatches(field.subgroup!, sg)
          );
        }
        return !subgroup || subgroupMatches(field.subgroup, subgroup);
      })
      .sort((a, b) => a.order - b.order);

    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", profileYear))
      .collect();
    const extras = await ctx.db
      .query("attendanceMembers")
      .collect();

    const profileEmails = new Set(profiles.map((p) => p.email.toLowerCase()));
    const matchProfileEmail = (email: string | undefined): string | undefined =>
      staffEmailCandidates(email).find((c) => profileEmails.has(c));
    const shadowByEmail = new Map<string, (typeof extras)[number]>();
    const pureExtras: typeof extras = [];
    for (const m of extras) {
      const matched = matchProfileEmail(m.email);
      if (matched) {
        if (!shadowByEmail.has(matched)) shadowByEmail.set(matched, m);
        continue;
      }
      pureExtras.push(m);
    }

    const metadataSubtitle = (
      metadata: Record<string, string> | undefined,
      excludeKeys: Set<string> = new Set()
    ): string =>
      metadataFields
        .filter((f) => !excludeKeys.has(f.key))
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
      const orgSubtitle = roles.length > 0 ? roles.join(" · ") : "";
      const metaSubtitle = metadataSubtitle(
        shadow?.metadata,
        new Set([ROLE_FIELD_KEY, CAMPUS_FIELD_KEY])
      );
      const subtitle = [orgSubtitle, metaSubtitle].filter(Boolean).join(" · ");
      const user = p.userId ? await ctx.db.get(p.userId) : null;
      return {
        key: personKey({ email: p.email }),
        kind: "staff" as const,
        email: p.email,
        memberId: shadow?._id,
        name: personDisplayName(p.name, p.email),
        roles,
        campuses,
        university: campuses[0] ?? resolveUniversity(metadataFields, shadow?.metadata, campuses),
        subtitle: subtitle || undefined,
        photo: user?.image ?? null,
      };
    }));

    const extraRows: RosterEntry[] = pureExtras.map((m) => ({
      key: personKey({ memberId: m._id }),
      kind: "member" as const,
      memberId: m._id,
      name: m.name,
      roles: [],
      campuses: [],
      university: resolveUniversity(metadataFields, m.metadata),
      subtitle: metadataSubtitle(m.metadata, new Set([CAMPUS_FIELD_KEY])) || undefined,
    }));

    const rows = [...staffRows, ...extraRows];
    if (!event) return rows.sort((a, b) => a.name.localeCompare(b.name));

    const eventTagIds = new Set((event.tagIds ?? []).map(String));
    const eventSubgroups = new Set(normalizeSubgroups(event.subgroups));
    const historyEvents = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) =>
        q
          .gte("dateStart", staffYearStartMs(year))
          .lt("dateStart", staffYearStartMs(year + 1))
      )
      .order("desc")
      .take(ROSTER_HISTORY_EVENT_LIMIT);
    const scores = new Map<
      string,
      { tagMatches: number; subgroupMatches: number; total: number; latest: number }
    >();
    const otherHistory = historyEvents.filter((h) => h._id !== event._id);
    const historyAttendances = await Promise.all(
      otherHistory.map((h) =>
        ctx.db
          .query("attendance")
          .withIndex("by_event", (q) => q.eq("eventId", h._id))
          .collect()
      )
    );
    otherHistory.forEach((historyEvent, i) => {
      for (const row of historyAttendances[i]) {
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
          normalizeSubgroups(historyEvent.subgroups).some((historySubgroup) =>
            eventSubgroups.has(historySubgroup)
          )
        ) {
          score.subgroupMatches += 1;
        }
        score.latest = Math.max(score.latest, historyEvent.dateStart);
        scores.set(key, score);
      }
    });

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

export const listByEvent = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId: rawEventId }) => {
    if (!(await optionalProfile(ctx))) return [];
    const eventId = ctx.db.normalizeId("events", rawEventId);
    if (!eventId) return [];
    const event = await ctx.db.get(eventId);
    if (!event) return [];
    const profileYear = eventStaffYear(event.dateStart);
    const calendarYear = sydneyCalendarYear(new Date(event.dateStart));
    const fieldSubgroups = normalizeSubgroups(event.subgroups);
    const metadataFields = (await ctx.db.query("attendanceMetadata").collect())
      .filter(
        (field) =>
          fieldSubgroups.length === 0 ||
          !field.subgroup ||
          fieldSubgroups.some((sg) => subgroupMatches(field.subgroup!, sg))
      )
      .sort((a, b) => a.order - b.order);
    const metadataSubtitle = (
      metadata: Record<string, string> | undefined,
      excludeKeys: Set<string> = new Set()
    ): string =>
      metadataFields
        .filter((field) => !excludeKeys.has(field.key))
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

    type AttendanceDoc = (typeof rows)[number];
    const staffRowFor = async (row: AttendanceDoc, email: string) => {
      let profile: Awaited<ReturnType<typeof getProfile>> = null;
      for (const candidate of staffEmailCandidates(email)) {
        profile = await getProfile(ctx, candidate, profileYear);
        if (profile) break;
      }
      const resolvedEmail = profile?.email.toLowerCase() ?? email.toLowerCase();
      const shadow = await findMemberByEmail(ctx, resolvedEmail);
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
          name: personDisplayName(profile?.name ?? shadow?.name, resolvedEmail),
          kind: profile ? ("staff" as const) : ("member" as const),
          roles,
          campuses,
          university: campuses[0] ?? resolveUniversity(metadataFields, shadow?.metadata, campuses),
          subtitle: metadataSubtitle(
            shadow?.metadata,
            profile
              ? new Set([ROLE_FIELD_KEY, CAMPUS_FIELD_KEY])
              : new Set([CAMPUS_FIELD_KEY])
          ) || undefined,
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
            subtitle: metadataSubtitle(member?.metadata, new Set([CAMPUS_FIELD_KEY])) || undefined,
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
    const byIdentity = new Map<string, (typeof withNames)[number]>();
    for (const row of withNames) {
      const identity = row.email
        ? `email:${row.email}`
        : row.memberId
          ? `member:${row.memberId}`
          : `row:${row._id}`;
      const existing = byIdentity.get(identity);
      if (!existing || row.signInTime < existing.signInTime) {
        byIdentity.set(identity, row);
      }
    }
    return [...byIdentity.values()].sort((a, b) => b.signInTime - a.signInTime);
  },
});

export const signIn = mutation({
  args: {
    eventId: v.id("events"),
    email: v.optional(v.string()),
    memberId: v.optional(v.id("attendanceMembers")),
  },
  handler: async (ctx, { eventId, email, memberId }) => {
    const { email: actorEmail } = await requireProfile(ctx);
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
      const id = await ctx.db.insert("attendance", {
        eventId,
        email: lower,
        signInTime: Date.now(),
      });
      await markSubgroupsDirty(ctx, event.subgroups);
      const who = await displayName(ctx, lower, eventStaffYear(event.dateStart));
      await logAttendanceAction(ctx, {
        actorEmail,
        entityType: "attendance",
        action: "attendance.signIn",
        summary: `${who} signed in to "${event.name}"`,
        eventId,
        subjectEmail: lower,
      });
      return id;
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
    const id = await ctx.db.insert("attendance", {
      eventId,
      memberId,
      signInTime: Date.now(),
    });
    await markSubgroupsDirty(ctx, event.subgroups);
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "attendance",
      action: "attendance.signIn",
      summary: `${member.name} signed in to "${event.name}"`,
      eventId,
      memberId,
    });
    return id;
  },
});

export const updateRecord = mutation({
  args: {
    attendanceId: v.id("attendance"),
    notes: v.optional(v.string()),
    signInTime: v.optional(v.number()),
  },
  handler: async (ctx, { attendanceId, notes, signInTime }) => {
    const { email: actorEmail } = await requireProfile(ctx);
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
    const event = await ctx.db.get(row.eventId);
    if (patch.signInTime !== undefined && event) {
      await markSubgroupsDirty(ctx, event.subgroups);
    }
    const who = row.memberId
      ? (await ctx.db.get(row.memberId))?.name ?? "A member"
      : row.email
        ? await displayName(
            ctx,
            row.email,
            event ? eventStaffYear(event.dateStart) : sydneyCalendarYear(new Date())
          )
        : "A member";
    const fields = [
      patch.notes !== undefined ? "notes" : null,
      patch.signInTime !== undefined ? "sign-in time" : null,
    ].filter(Boolean);
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "attendance",
      action: "attendance.update",
      summary: `Edited ${who}'s record for "${event?.name ?? "an event"}"`,
      eventId: row.eventId,
      memberId: row.memberId,
      subjectEmail: row.email,
      detail: fields.length ? `Changed: ${fields.join(", ")}` : undefined,
    });
  },
});

export const signOut = mutation({
  args: {
    eventId: v.id("events"),
    email: v.optional(v.string()),
    memberId: v.optional(v.id("attendanceMembers")),
  },
  handler: async (ctx, { eventId, email, memberId }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    if (!!email === !!memberId) {
      throw new ConvexError("Provide either email or memberId.");
    }
    const event = await ctx.db.get(eventId);
    if (email) {
      const lower = email.trim().toLowerCase();
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_event_and_email", (q) =>
          q.eq("eventId", eventId).eq("email", lower)
        )
        .unique();
      if (existing) {
        if (event && !canReverseSignIn(event, existing.signInTime)) {
          throw new ConvexError(
            "This attendee was signed in during the event and can't be removed. Only sign-ins added after the event ended can be reversed."
          );
        }
        await ctx.db.delete(existing._id);
        if (event) await markSubgroupsDirty(ctx, event.subgroups);
        const who = await displayName(
          ctx,
          lower,
          event ? eventStaffYear(event.dateStart) : sydneyCalendarYear(new Date())
        );
        await logAttendanceAction(ctx, {
          actorEmail,
          entityType: "attendance",
          action: "attendance.signOut",
          summary: `${who} signed out of "${event?.name ?? "an event"}"`,
          eventId,
          subjectEmail: lower,
        });
      }
      return;
    }
    if (memberId) {
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_event_and_member", (q) =>
          q.eq("eventId", eventId).eq("memberId", memberId)
        )
        .unique();
      if (existing) {
        if (event && !canReverseSignIn(event, existing.signInTime)) {
          throw new ConvexError(
            "This attendee was signed in during the event and can't be removed. Only sign-ins added after the event ended can be reversed."
          );
        }
        await ctx.db.delete(existing._id);
        if (event) await markSubgroupsDirty(ctx, event.subgroups);
        const member = await ctx.db.get(memberId);
        await logAttendanceAction(ctx, {
          actorEmail,
          entityType: "attendance",
          action: "attendance.signOut",
          summary: `${member?.name ?? "A member"} signed out of "${event?.name ?? "an event"}"`,
          eventId,
          memberId,
        });
      }
    }
  },
});
