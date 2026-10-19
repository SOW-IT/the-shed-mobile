import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx, QueryCtx } from "./_generated/server";

const BACKFILL_BATCH_SIZE = 25;

async function countRows(ctx: QueryCtx, eventId: Id<"events">): Promise<number> {
  const rows = await ctx.db
    .query("attendance")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  return rows.length;
}

export async function eventAttendanceCount(
  ctx: QueryCtx,
  event: Doc<"events">
): Promise<number> {
  return event.attendanceCount ?? (await countRows(ctx, event._id));
}

export async function recountEventAttendance(
  ctx: MutationCtx,
  eventId: Id<"events">
): Promise<void> {
  const event = await ctx.db.get("events", eventId);
  if (!event) return;
  const count = await countRows(ctx, eventId);
  if (event.attendanceCount !== count) {
    await ctx.db.patch("events", eventId, { attendanceCount: count });
  }
}

export async function adjustEventAttendanceCount(
  ctx: MutationCtx,
  eventId: Id<"events">,
  delta: number
): Promise<void> {
  const event = await ctx.db.get("events", eventId);
  if (!event) return;
  if (event.attendanceCount === undefined) {
    await recountEventAttendance(ctx, eventId);
    return;
  }
  await ctx.db.patch("events", eventId, {
    attendanceCount: Math.max(0, event.attendanceCount + delta),
  });
}

export const backfill = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const batch = await ctx.db
      .query("events")
      .paginate({ cursor: cursor ?? null, numItems: BACKFILL_BATCH_SIZE });
    for (const event of batch.page) await recountEventAttendance(ctx, event._id);
    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.attendanceCounts.backfill, {
        cursor: batch.continueCursor,
      });
    }
    return null;
  },
});
