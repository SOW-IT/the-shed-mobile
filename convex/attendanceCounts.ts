import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx, QueryCtx } from "./_generated/server";

const BACKFILL_BATCH_SIZE = 25;

const signInsQuery = (ctx: QueryCtx, eventId: Id<"events">) =>
  ctx.db
    .query("attendance")
    .withIndex("by_event_and_member", (q) => q.eq("eventId", eventId));

// An event's sign-ins in the order they were recorded. The index sorts by
// member, so this puts them back; callers that dedupe or break ties on time
// depend on that order.
export async function eventSignIns(
  ctx: QueryCtx,
  eventId: Id<"events">,
  limit?: number
): Promise<Doc<"attendance">[]> {
  const rows =
    limit === undefined
      ? await signInsQuery(ctx, eventId).collect()
      : await signInsQuery(ctx, eventId).take(limit);
  return rows.sort((a, b) => a._creationTime - b._creationTime);
}

async function countRows(ctx: QueryCtx, eventId: Id<"events">): Promise<number> {
  const rows = await signInsQuery(ctx, eventId).collect();
  return rows.length;
}

const storedCountOf = (ctx: QueryCtx, eventId: Id<"events">) =>
  ctx.db
    .query("eventAttendanceCounts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();

export async function eventAttendanceCount(
  ctx: QueryCtx,
  event: Doc<"events">
): Promise<number> {
  const stored = await storedCountOf(ctx, event._id);
  return stored?.count ?? (await countRows(ctx, event._id));
}

async function storeCount(
  ctx: MutationCtx,
  eventId: Id<"events">,
  count: number
): Promise<void> {
  const stored = await storedCountOf(ctx, eventId);
  if (!stored) {
    await ctx.db.insert("eventAttendanceCounts", { eventId, count });
  } else if (stored.count !== count) {
    await ctx.db.patch("eventAttendanceCounts", stored._id, { count });
  }
}

export async function startEventAttendanceCount(
  ctx: MutationCtx,
  eventId: Id<"events">
): Promise<void> {
  await storeCount(ctx, eventId, 0);
}

export async function deleteEventAttendanceCount(
  ctx: MutationCtx,
  eventId: Id<"events">
): Promise<void> {
  const stored = await storedCountOf(ctx, eventId);
  if (stored) await ctx.db.delete("eventAttendanceCounts", stored._id);
}

export async function recountEventAttendance(
  ctx: MutationCtx,
  eventId: Id<"events">
): Promise<void> {
  const event = await ctx.db.get("events", eventId);
  if (!event) return;
  await storeCount(ctx, eventId, await countRows(ctx, eventId));
}

export async function adjustEventAttendanceCount(
  ctx: MutationCtx,
  eventId: Id<"events">,
  delta: number
): Promise<void> {
  const stored = await storedCountOf(ctx, eventId);
  if (!stored) {
    await recountEventAttendance(ctx, eventId);
    return;
  }
  await ctx.db.patch("eventAttendanceCounts", stored._id, {
    count: Math.max(0, stored.count + delta),
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
