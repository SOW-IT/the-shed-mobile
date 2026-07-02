import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
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
    // staffEmail moved into email (row cleared).
    migrated: v.number(),
    // email lowercased/trimmed in place (no staffEmail to move).
    normalized: v.number(),
    // staffEmail present but not an email (no "@") — left UNTOUCHED for manual
    // review, never silently discarded.
    invalid: v.number(),
    // Rewriting `email` would collide with another row's existing email (two
    // docs sharing one canonical address) — left UNTOUCHED for manual merge
    // rather than silently creating the duplicate this migration exists to fix.
    collisions: v.number(),
    // dryRun only: rows that would change (migrated + normalized).
    remaining: v.number(),
  }),
  handler: async (ctx, { dryRun }) => {
    const members = await ctx.db.query("attendanceMembers").collect();
    let migrated = 0;
    let normalized = 0;
    let invalid = 0;
    let collisions = 0;
    let remaining = 0;
    const norm = (e: string) => e.trim().toLowerCase();
    // Would writing `email = target` on `selfId` produce two rows with the same
    // canonical email? The by_email lookup is exact, so a collision would leave
    // findMemberByEmail picking one non-deterministically — refuse and report.
    const wouldCollide = async (target: string, selfId: Id<"attendanceMembers">) => {
      const other = await ctx.db
        .query("attendanceMembers")
        .withIndex("by_email", (q) => q.eq("email", target))
        .filter((q) => q.neq(q.field("_id"), selfId))
        .first();
      return other !== null;
    };
    for (const m of members) {
      if (m.staffEmail) {
        const linkEmail = norm(m.staffEmail);
        if (!linkEmail.includes("@")) {
          // Malformed staff link — moving it would lose the value silently, so
          // leave the row as-is and report it for an operator to fix by hand.
          invalid++;
          continue;
        }
        if (m.email !== linkEmail && (await wouldCollide(linkEmail, m._id))) {
          collisions++;
          continue;
        }
        if (dryRun) {
          remaining++;
          continue;
        }
        await ctx.db.patch(m._id, { email: linkEmail, staffEmail: undefined });
        migrated++;
        continue;
      }
      // No staffEmail: just ensure any existing email is normalised so the
      // exact-match by_email lookup in findMemberByEmail can't miss it.
      if (!m.email) continue;
      const lower = norm(m.email);
      if (lower === m.email) continue;
      if (await wouldCollide(lower, m._id)) {
        collisions++;
        continue;
      }
      if (dryRun) {
        remaining++;
        continue;
      }
      await ctx.db.patch(m._id, { email: lower });
      normalized++;
    }
    return { scanned: members.length, migrated, normalized, invalid, collisions, remaining };
  },
});
