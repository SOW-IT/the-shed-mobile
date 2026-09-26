import { ConvexError, v } from "convex/values";
import { mergeNotes } from "../shared/memberMerge";
import { SYDNEY_TIME_ZONE } from "../shared/flow";
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { logAttendanceAction } from "./attendanceAudit";
import { findMemberByEmail } from "./model";

const REPAIR_ACTOR = "system:staff-attendance-repair";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const detailValidator = v.object({
  email: v.string(),
  rowsFolded: v.number(),
  recordsMoved: v.number(),
  recordsCombined: v.number(),
});

type Detail = {
  email: string;
  rowsFolded: number;
  recordsMoved: number;
  recordsCombined: number;
};

/**
 * One-off repair for data written before Merge existed. Putting a staff email
 * on a member relabelled the row as that staff person but left its attendance
 * keyed to the row, so Insights counted them twice, and a second such row for
 * the same staff person was hidden from the members list for good.
 *
 * For each staff person with overlay rows this folds duplicate rows into the
 * one the app shows, and moves member-keyed attendance onto the staff email,
 * combining events where both records exist (earlier time, both notes) — the
 * same rules as a member → staff merge.
 *
 * Dry run by default. Processes `limit` staff per call; pass the returned
 * `next` as `after` until it comes back null. Idempotent. `email` limits it to
 * one staff person, to check a single repair before running them all.
 *
 *   npx convex run --prod memberRepair:repairStaffAttendance '{}'
 *   npx convex run --prod memberRepair:repairStaffAttendance '{"email":"a@sow.org.au","dryRun":false}'
 *   npx convex run --prod memberRepair:repairStaffAttendance '{"dryRun":false}'
 */
export const repairStaffAttendance = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    after: v.optional(v.string()),
    limit: v.optional(v.number()),
    email: v.optional(v.string()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    staff: v.number(),
    rowsFolded: v.number(),
    recordsMoved: v.number(),
    recordsCombined: v.number(),
    next: v.union(v.string(), v.null()),
    details: v.array(detailValidator),
  }),
  handler: async (ctx, { dryRun = true, after, limit = 25, email: only }) => {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new ConvexError("limit must be a positive whole number.");
    }
    const onlyKey = only === undefined ? undefined : canonicalEmailKey(only);
    // Latest staff profile per person decides the email attendance is keyed by.
    const latest = new Map<string, Doc<"staffProfiles">>();
    for (const profile of await ctx.db.query("staffProfiles").collect()) {
      const key = canonicalEmailKey(profile.email);
      if (!key) continue;
      const seen = latest.get(key);
      if (!seen || profile.year > seen.year) latest.set(key, profile);
    }

    const rowsByStaff = new Map<string, Doc<"attendanceMembers">[]>();
    for (const row of await ctx.db.query("attendanceMembers").collect()) {
      const key = canonicalEmailKey(row.email);
      if (!key || !latest.has(key)) continue;
      rowsByStaff.set(key, [...(rowsByStaff.get(key) ?? []), row]);
    }

    const keys = [...rowsByStaff.keys()]
      .filter((key) => after === undefined || key > after)
      .filter((key) => only === undefined || key === onlyKey)
      .sort();
    const batch = keys.slice(0, limit);
    const details: Detail[] = [];

    for (const key of batch) {
      const rows = rowsByStaff.get(key)!;
      const email = latest.get(key)!.email.toLowerCase();
      // The row the app already treats as this staff person's.
      const kept = (await findMemberByEmail(ctx, email)) ?? rows[0];
      const detail: Detail = { email, rowsFolded: 0, recordsMoved: 0, recordsCombined: 0 };

      // The staff person's email record per event, under any spelling —
      // including ones this run moves over, so a later duplicate combines.
      const emailRecords = new Map<string, Doc<"attendance">>();
      for (const candidate of staffEmailCandidates(email)) {
        const own = await ctx.db
          .query("attendance")
          .withIndex("by_email", (q) => q.eq("email", candidate))
          .collect();
        for (const record of own) emailRecords.set(record.eventId, record);
      }

      for (const row of rows) {
        const records = await ctx.db
          .query("attendance")
          .withIndex("by_member", (q) => q.eq("memberId", row._id))
          .collect();
        for (const record of records) {
          const existing = emailRecords.get(record.eventId);
          if (existing) {
            detail.recordsCombined++;
            const combined = {
              signInTime: Math.min(existing.signInTime, record.signInTime),
              notes: mergeNotes(existing.notes, record.notes),
            };
            emailRecords.set(record.eventId, { ...existing, ...combined });
            if (dryRun) continue;
            await ctx.db.patch(existing._id, combined);
            await ctx.db.delete(record._id);
          } else {
            detail.recordsMoved++;
            emailRecords.set(record.eventId, { ...record, email, memberId: undefined });
            if (dryRun) continue;
            await ctx.db.patch(record._id, { email, memberId: undefined });
          }
        }

        if (row._id === kept._id) continue;
        detail.rowsFolded++;
        if (dryRun) continue;
        // The kept row wins; a hidden duplicate only fills its blanks.
        const current = (await ctx.db.get(kept._id))!;
        const metadata = { ...(row.metadata ?? {}), ...(current.metadata ?? {}) };
        await ctx.db.patch(kept._id, { metadata });
        await ctx.db.delete(row._id);
      }

      const changed = detail.rowsFolded + detail.recordsMoved + detail.recordsCombined;
      if (changed === 0) continue;
      details.push(detail);
      if (dryRun) continue;
      await logAttendanceAction(ctx, {
        actorEmail: REPAIR_ACTOR,
        entityType: "member",
        action: "member.repair",
        summary: `Repaired staff attendance for ${email}`,
        memberId: kept._id,
        subjectEmail: email,
        detail: [
          `Moved ${plural(detail.recordsMoved, "sign-in")} to the staff email`,
          `combined ${plural(detail.recordsCombined, "shared event")}`,
          `folded ${plural(detail.rowsFolded, "duplicate record")}`,
        ].join("; "),
      });
    }

    const sum = (field: keyof Omit<Detail, "email">) =>
      details.reduce((total, d) => total + d[field], 0);
    return {
      dryRun,
      staff: details.length,
      rowsFolded: sum("rowsFolded"),
      recordsMoved: sum("recordsMoved"),
      recordsCombined: sum("recordsCombined"),
      next: keys.length > batch.length ? batch[batch.length - 1] : null,
      details,
    };
  },
});

const RESTORE_ACTOR = "system:attendance-restore";

const restoreRecord = v.object({
  eventId: v.id("events"),
  memberId: v.optional(v.id("attendanceMembers")),
  email: v.optional(v.string()),
  signInTime: v.number(),
  notes: v.optional(v.string()),
  /** Why this record is coming back, e.g. which audit entry it came from. */
  reason: v.string(),
});

const restoreStatus = v.union(
  v.literal("restored"),
  v.literal("already there"),
  v.literal("event missing"),
  v.literal("member missing"),
  v.literal("needs one of memberId or email")
);

const stamp = (ms: number): string =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));

/**
 * Puts back attendance records that were deleted by mistake, e.g. with a
 * member who was deleted instead of merged. Each record names its event, the
 * person (a member id, or a staff email), and the original sign-in time taken
 * from the audit log or a backup.
 *
 * Dry run by default. Idempotent: a person already signed in to that event is
 * left alone, so it is safe to run twice. Every restored record is written to
 * the attendance audit log with its reason.
 *
 *   npx convex run --prod memberRepair:restoreAttendance "$(cat plan.json)"
 */
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
      const existing = email
        ? await ctx.db
            .query("attendance")
            .withIndex("by_event_and_email", (q) =>
              q.eq("eventId", record.eventId).eq("email", email)
            )
            .first()
        : await ctx.db
            .query("attendance")
            .withIndex("by_event_and_member", (q) =>
              q.eq("eventId", record.eventId).eq("memberId", record.memberId!)
            )
            .first();
      const name = member?.name ?? email!;
      if (existing) {
        results.push({ eventId: record.eventId, who: name, status: "already there" as const });
        continue;
      }
      results.push({ eventId: record.eventId, who: name, status: "restored" as const });
      restored++;
      if (dryRun) continue;
      await ctx.db.insert("attendance", {
        eventId: record.eventId,
        ...(email ? { email } : { memberId: record.memberId }),
        signInTime: record.signInTime,
        notes: record.notes,
      });
      await logAttendanceAction(ctx, {
        actorEmail: RESTORE_ACTOR,
        entityType: "attendance",
        action: "attendance.restore",
        summary: `${name} restored to "${event.name}"`,
        eventId: record.eventId,
        memberId: record.memberId,
        subjectEmail: email,
        detail: `${record.reason}\nOriginal sign-in: ${stamp(record.signInTime)}`,
      });
    }
    return { dryRun, restored, results };
  },
});
