import { ConvexError, v } from "convex/values";
import { assignmentsOf, roleNeedsUniversity } from "../shared/flow";
import { formatMetadataFieldValue } from "../shared/attendanceMemberMeta";
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
  subtitle?: string;
};

/**
 * The shared member pool for a year: every `staffProfile` plus attendance-only
 * members. Each entry carries roles/campuses or metadata for the row subtitle.
 */
export const roster = query({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    if (!(await optionalProfile(ctx))) return [];
    const metadataFields = (
      await ctx.db
        .query("attendanceMetadata")
        .withIndex("by_year", (q) => q.eq("year", year))
        .collect()
    ).sort((a, b) => a.order - b.order);

    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    const extras = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();

    const shadowByEmail = new Map(
      extras
        .filter((m) => m.staffEmail)
        .map((m) => [m.staffEmail!.toLowerCase(), m])
    );
    const pureExtras = extras.filter((m) => !m.staffEmail);

    const metadataSubtitle = (
      metadata: Record<string, string> | undefined
    ): string =>
      metadataFields
        .map((f) => {
          const raw = metadata?.[f._id];
          if (!raw) return null;
          return formatMetadataFieldValue(f.key, raw, year, f.values);
        })
        .filter(Boolean)
        .join(" · ");

    const staffRows: RosterEntry[] = profiles.map((p) => {
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
      return {
        key: `staff:${p.email}`,
        kind: "staff" as const,
        email: p.email,
        memberId: shadow?._id,
        name: p.name ?? p.email,
        roles,
        campuses,
        subtitle: subtitle || undefined,
      };
    });

    const extraRows: RosterEntry[] = pureExtras.map((m) => ({
      key: `member:${m._id}`,
      kind: "member" as const,
      memberId: m._id,
      name: m.name,
      roles: [],
      campuses: [],
      subtitle: metadataFields
        .map((f) => {
          const raw = m.metadata?.[f._id];
          if (!raw) return null;
          return formatMetadataFieldValue(f.key, raw, year, f.values);
        })
        .filter(Boolean)
        .join(" · "),
    }));

    return [...staffRows, ...extraRows].sort((a, b) =>
      a.name.localeCompare(b.name)
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
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    const withNames = await Promise.all(
      rows.map(async (row) => {
        if (row.email) {
          const profile = await getProfile(ctx, row.email, event.year);
          return {
            ...row,
            name: profile?.name ?? row.email,
            kind: "staff" as const,
          };
        }
        if (row.memberId) {
          const member = await ctx.db.get(row.memberId);
          return {
            ...row,
            name: member?.name ?? "Unknown",
            kind: "member" as const,
          };
        }
        return { ...row, name: "Unknown", kind: "staff" as const };
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
        year: event.year,
        signInTime: Date.now(),
      });
    }

    const member = memberId ? await ctx.db.get(memberId) : null;
    if (!member || member.year !== event.year) {
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
      year: event.year,
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
