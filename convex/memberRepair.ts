import { v } from "convex/values";
import { mergeNotes } from "../shared/memberMerge";
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { logAttendanceAction } from "./attendanceAudit";
import { findMemberByEmail } from "./model";

const REPAIR_ACTOR = "system:staff-attendance-repair";

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
        detail:
          `Moved ${detail.recordsMoved} member sign-in(s) to the staff email; ` +
          `combined ${detail.recordsCombined}; folded ${detail.rowsFolded} duplicate row(s)`,
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
