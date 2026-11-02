import { v } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { nightlyJobsPaused } from "./model";

const storedCount = (ctx: QueryCtx) => ctx.db.query("attendanceMemberCount").first();

export async function memberCount(ctx: QueryCtx): Promise<number | null> {
  return (await storedCount(ctx))?.count ?? null;
}

async function adjustMemberCount(ctx: MutationCtx, delta: number) {
  const row = await storedCount(ctx);
  if (row) await ctx.db.patch("attendanceMemberCount", row._id, { count: row.count + delta });
}

export async function insertMember(
  ctx: MutationCtx,
  fields: WithoutSystemFields<Doc<"attendanceMembers">>
): Promise<Id<"attendanceMembers">> {
  const memberId = await ctx.db.insert("attendanceMembers", fields);
  await adjustMemberCount(ctx, 1);
  return memberId;
}

export async function deleteMember(ctx: MutationCtx, memberId: Id<"attendanceMembers">) {
  await ctx.db.delete("attendanceMembers", memberId);
  await adjustMemberCount(ctx, -1);
}

export const recount = internalMutation({
  args: { nightly: v.optional(v.boolean()) },
  returns: v.union(v.object({ count: v.number(), was: v.union(v.number(), v.null()) }), v.null()),
  handler: async (ctx, { nightly }) => {
    if (nightly && nightlyJobsPaused()) return null;
    const count = (await ctx.db.query("attendanceMembers").collect()).length;
    const row = await storedCount(ctx);
    const countedAt = Date.now();
    if (row) await ctx.db.replace("attendanceMemberCount", row._id, { count, countedAt });
    else await ctx.db.insert("attendanceMemberCount", { count, countedAt });
    return { count, was: row?.count ?? null };
  },
});
