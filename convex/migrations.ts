import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * One-off backfill for dropping the `attendanceMembers.staffEmail` column.
 *
 * A member now links to a staff profile purely by its `email`, so every row that
 * still carries `staffEmail` has that value moved into `email` (the staff link
 * is preserved; any distinct personal email on a linked row is discarded, per
 * the agreed rule) and `staffEmail` is cleared.
 *
 * Deploy order (widen → migrate → narrow):
 *   1. Deploy the schema that still has `staffEmail` optional (this commit).
 *   2. `npx convex run migrations:dropStaffEmail '{"dryRun": true}'` to preview,
 *      then `npx convex run migrations:dropStaffEmail` to apply. Verify
 *      `remaining` is 0.
 *   3. Deploy the schema that removes `staffEmail` + the `by_staff_email` index,
 *      and delete this file.
 *
 * `attendanceMembers` is a small table (one row per person), so a single
 * transaction with `.collect()` is safe — no batching component needed.
 */
export const dropStaffEmail = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    scanned: v.number(),
    migrated: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, { dryRun }) => {
    const members = await ctx.db.query("attendanceMembers").collect();
    let migrated = 0;
    let remaining = 0;
    for (const m of members) {
      if (!m.staffEmail) continue;
      const linkEmail = m.staffEmail.trim().toLowerCase();
      if (dryRun) {
        remaining++;
        continue;
      }
      await ctx.db.patch(m._id, {
        // Overwrite `email` with the staff link (skip if the staffEmail is blank
        // — keep whatever email the row already had); clearing a field is done by
        // patching it to `undefined`.
        ...(linkEmail.includes("@") ? { email: linkEmail } : {}),
        staffEmail: undefined,
      });
      migrated++;
    }
    return { scanned: members.length, migrated, remaining };
  },
});
