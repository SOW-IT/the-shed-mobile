import { v } from "convex/values";
import { CAMPUS_FIELD_KEY, ROLE_FIELD_KEY } from "../shared/attendanceMemberMeta";
import { internalMutation } from "./_generated/server";
import { auditStamp, logAttendanceAction } from "./attendanceAudit";
import { recountEventAttendance } from "./attendanceCounts";
import { latestStaffProfile } from "./attendanceMembers";
import { knownMemberId } from "./staffMembers";

const RESTORE_ACTOR = "system:attendance-restore";

const restoreRecord = v.object({
  eventId: v.id("events"),
  memberId: v.optional(v.id("attendanceMembers")),
  email: v.optional(v.string()),
  signInTime: v.number(),
  notes: v.optional(v.string()),
  reason: v.string(),
});

const restoreStatus = v.union(
  v.literal("restored"),
  v.literal("already there"),
  v.literal("event missing"),
  v.literal("member missing"),
  v.literal("needs one of memberId or email")
);

export const restoreAttendance = internalMutation({
  args: { records: v.array(restoreRecord), dryRun: v.optional(v.boolean()) },
  returns: v.object({
    dryRun: v.boolean(),
    restored: v.number(),
    results: v.array(
      v.object({ eventId: v.id("events"), who: v.string(), status: restoreStatus })
    ),
  }),
  handler: async (ctx, { records, dryRun = true }) => {
    const results = [];
    let restored = 0;
    for (const record of records) {
      const email = record.email?.trim().toLowerCase() || undefined;
      const who = email ?? record.memberId ?? "?";
      if (!!email === !!record.memberId) {
        results.push({ eventId: record.eventId, who, status: "needs one of memberId or email" as const });
        continue;
      }
      const event = await ctx.db.get(record.eventId);
      if (!event) {
        results.push({ eventId: record.eventId, who, status: "event missing" as const });
        continue;
      }
      const member = record.memberId ? await ctx.db.get(record.memberId) : null;
      if (record.memberId && !member) {
        results.push({ eventId: record.eventId, who, status: "member missing" as const });
        continue;
      }
      const staff = email ? await latestStaffProfile(ctx, email) : null;
      const memberId = record.memberId ?? (staff ? await knownMemberId(ctx, staff) : null);
      if (!memberId) {
        results.push({ eventId: record.eventId, who, status: "member missing" as const });
        continue;
      }
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_event_and_member", (q) =>
          q.eq("eventId", record.eventId).eq("memberId", memberId)
        )
        .first();
      const name = member?.name ?? (await ctx.db.get(memberId))?.name ?? email!;
      if (existing) {
        results.push({ eventId: record.eventId, who: name, status: "already there" as const });
        continue;
      }
      results.push({ eventId: record.eventId, who: name, status: "restored" as const });
      restored++;
      if (dryRun) continue;
      await ctx.db.insert("attendance", {
        eventId: record.eventId,
        memberId,
        signInTime: record.signInTime,
        notes: record.notes,
      });
      await recountEventAttendance(ctx, record.eventId);
      await logAttendanceAction(ctx, {
        actorEmail: RESTORE_ACTOR,
        entityType: "attendance",
        action: "attendance.restore",
        summary: `${name} restored to "${event.name}"`,
        eventId: record.eventId,
        memberId,
        subjectEmail: email,
        detail: `${record.reason}\nOriginal sign-in: ${auditStamp(record.signInTime)}`,
      });
    }
    return { dryRun, restored, results };
  },
});

const CAMPUS_ACTOR = "system:campus-restore";

const campusStatus = v.union(
  v.literal("filled"),
  v.literal("already set"),
  v.literal("member missing"),
  v.literal("unknown campus")
);

export const restoreCampus = internalMutation({
  args: {
    fills: v.array(
      v.object({ memberId: v.id("attendanceMembers"), campus: v.string(), reason: v.string() })
    ),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    filled: v.number(),
    results: v.array(
      v.object({ memberId: v.id("attendanceMembers"), who: v.string(), status: campusStatus })
    ),
  }),
  handler: async (ctx, { fills, dryRun = true }) => {
    const campusField = (await ctx.db.query("attendanceMetadata").take(200)).find(
      (f) => f.key === CAMPUS_FIELD_KEY
    );
    const results = [];
    let filled = 0;
    for (const fill of fills) {
      const member = await ctx.db.get(fill.memberId);
      if (!member) {
        results.push({ memberId: fill.memberId, who: fill.memberId, status: "member missing" as const });
        continue;
      }
      const optionId = Object.entries(campusField?.values ?? {}).find(
        ([, label]) => label === fill.campus
      )?.[0];
      if (!campusField || !optionId) {
        results.push({ memberId: fill.memberId, who: member.name, status: "unknown campus" as const });
        continue;
      }
      if (member.metadata?.[campusField._id]) {
        results.push({ memberId: fill.memberId, who: member.name, status: "already set" as const });
        continue;
      }
      results.push({ memberId: fill.memberId, who: member.name, status: "filled" as const });
      filled++;
      if (dryRun) continue;
      await ctx.db.patch(fill.memberId, {
        metadata: { ...(member.metadata ?? {}), [campusField._id]: optionId },
      });
      await logAttendanceAction(ctx, {
        actorEmail: CAMPUS_ACTOR,
        entityType: "member",
        action: "member.update",
        summary: `Restored "${member.name}"'s Campus (${fill.campus})`,
        memberId: fill.memberId,
        detail: fill.reason,
      });
    }
    return { dryRun, filled, results };
  },
});

const LINK_ACTOR = "system:profile-link";

const linkStatus = v.union(
  v.literal("linked"),
  v.literal("already linked"),
  v.literal("linked elsewhere"),
  v.literal("profile missing"),
  v.literal("member missing")
);

export const linkProfiles = internalMutation({
  args: {
    links: v.array(
      v.object({
        profileId: v.id("staffProfiles"),
        memberId: v.id("attendanceMembers"),
        reason: v.string(),
      })
    ),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    linked: v.number(),
    results: v.array(
      v.object({ profileId: v.id("staffProfiles"), who: v.string(), status: linkStatus })
    ),
  }),
  handler: async (ctx, { links, dryRun = true }) => {
    const results = [];
    let linked = 0;
    for (const link of links) {
      const profile = await ctx.db.get(link.profileId);
      if (!profile) {
        results.push({ profileId: link.profileId, who: link.profileId, status: "profile missing" as const });
        continue;
      }
      const member = await ctx.db.get(link.memberId);
      if (!member) {
        results.push({ profileId: link.profileId, who: profile.email, status: "member missing" as const });
        continue;
      }
      if (profile.memberId === link.memberId) {
        results.push({ profileId: link.profileId, who: member.name, status: "already linked" as const });
        continue;
      }
      if (profile.memberId && (await ctx.db.get(profile.memberId))) {
        results.push({ profileId: link.profileId, who: member.name, status: "linked elsewhere" as const });
        continue;
      }
      results.push({ profileId: link.profileId, who: member.name, status: "linked" as const });
      linked++;
      if (dryRun) continue;
      await ctx.db.patch(link.profileId, { memberId: link.memberId });
      await logAttendanceAction(ctx, {
        actorEmail: LINK_ACTOR,
        entityType: "member",
        action: "member.linkStaff",
        summary: `Linked ${profile.email}'s ${profile.year} staff profile to "${member.name}"`,
        memberId: link.memberId,
        subjectEmail: profile.email.toLowerCase(),
        detail: link.reason,
      });
    }
    return { dryRun, linked, results };
  },
});

const ROLE_ACTOR = "system:role-repair";

const roleStatus = v.union(
  v.literal("changed"),
  v.literal("already set"),
  v.literal("role differs"),
  v.literal("member missing"),
  v.literal("unknown role")
);

export const replaceRole = internalMutation({
  args: {
    changes: v.array(
      v.object({
        memberId: v.id("attendanceMembers"),
        from: v.string(),
        to: v.string(),
        reason: v.string(),
      })
    ),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    changed: v.number(),
    results: v.array(
      v.object({ memberId: v.id("attendanceMembers"), who: v.string(), status: roleStatus })
    ),
  }),
  handler: async (ctx, { changes, dryRun = true }) => {
    const roleField = (await ctx.db.query("attendanceMetadata").take(200)).find(
      (f) => f.key === ROLE_FIELD_KEY
    );
    const optionFor = (label: string) =>
      Object.entries(roleField?.values ?? {}).find(([, value]) => value === label)?.[0];
    const results = [];
    let changed = 0;
    for (const change of changes) {
      const member = await ctx.db.get(change.memberId);
      if (!member) {
        results.push({ memberId: change.memberId, who: change.memberId, status: "member missing" as const });
        continue;
      }
      const toId = optionFor(change.to);
      if (!roleField || !toId) {
        results.push({ memberId: change.memberId, who: member.name, status: "unknown role" as const });
        continue;
      }
      const current = member.metadata?.[roleField._id];
      const currentLabel = current ? (roleField.values?.[current] ?? current) : undefined;
      if (currentLabel === change.to) {
        results.push({ memberId: change.memberId, who: member.name, status: "already set" as const });
        continue;
      }
      if (currentLabel !== change.from) {
        results.push({ memberId: change.memberId, who: member.name, status: "role differs" as const });
        continue;
      }
      results.push({ memberId: change.memberId, who: member.name, status: "changed" as const });
      changed++;
      if (dryRun) continue;
      await ctx.db.patch(change.memberId, {
        metadata: { ...(member.metadata ?? {}), [roleField._id]: toId },
      });
      await logAttendanceAction(ctx, {
        actorEmail: ROLE_ACTOR,
        entityType: "member",
        action: "member.update",
        summary: `Changed "${member.name}"'s Role from ${change.from} to ${change.to}`,
        memberId: change.memberId,
        detail: change.reason,
      });
    }
    return { dryRun, changed, results };
  },
});
