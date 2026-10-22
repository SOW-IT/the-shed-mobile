import { v } from "convex/values";
import {
  likelihoodInputKey,
  likelihoodScores,
  rankedLikelihood,
  type LikelihoodEvent,
} from "../shared/rollCallLikelihood";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx, QueryCtx } from "./_generated/server";
import { historyBefore, type RosterHistory } from "./rosterHistory";

const DAY_MS = 86_400_000;
const MAX_RANKED_MEMBERS = 150;
const UPCOMING_MS = 7 * DAY_MS;
const LONGEST_EVENT_MS = 14 * DAY_MS;

export const likelihoodTarget = (event: Doc<"events">): LikelihoodEvent => ({
  eventId: event._id,
  dateStart: event.dateStart,
  tagIds: (event.tagIds ?? []).map(String),
  subgroups: event.subgroups,
  weekly: event.weekly != null,
});

export const storedOrder = (ctx: QueryCtx, eventId: Id<"events">) =>
  ctx.db
    .query("rollCallOrders")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();

export const rankingInputsChanged = (before: Doc<"events">, after: Doc<"events">): boolean => {
  const a = likelihoodTarget(before);
  const b = likelihoodTarget(after);
  return (
    a.dateStart !== b.dateStart ||
    a.weekly !== b.weekly ||
    [...a.subgroups].sort().join() !== [...b.subgroups].sort().join() ||
    [...a.tagIds].sort().join() !== [...b.tagIds].sort().join()
  );
};

export async function scheduleRank(ctx: MutationCtx, event: Pick<Doc<"events">, "_id" | "dateStart">) {
  if (event.dateStart >= Date.now() + UPCOMING_MS) return;
  await ctx.scheduler.runAfter(0, internal.rollCallOrder.rank, { eventId: event._id });
}

type RankResult = "unchanged" | "same order" | "saved";

async function rankEvent(
  ctx: MutationCtx,
  event: Doc<"events">,
  history: RosterHistory
): Promise<RankResult> {
  const target = likelihoodTarget(event);
  const inputKey = likelihoodInputKey(target, history);
  const existing = await storedOrder(ctx, event._id);
  if (existing?.inputKey === inputKey) return "unchanged";
  const ranked = rankedLikelihood(likelihoodScores(target, history)).slice(0, MAX_RANKED_MEMBERS);
  const memberIds = ranked.map((entry) => entry.memberId as Id<"attendanceMembers">);
  const scores = ranked.map((entry) => entry.score);
  if (
    existing &&
    existing.memberIds.length === memberIds.length &&
    existing.memberIds.every((id, i) => id === memberIds[i] && existing.scores[i] === scores[i])
  ) {
    return "same order";
  }
  const doc = { eventId: event._id, inputKey, builtAt: Date.now(), memberIds, scores };
  if (existing) await ctx.db.replace("rollCallOrders", existing._id, doc);
  else await ctx.db.insert("rollCallOrders", doc);
  return "saved";
}

export const rank = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.union(v.literal("unchanged"), v.literal("same order"), v.literal("saved"), v.null()),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("events", eventId);
    if (!event) return null;
    const history = await historyBefore(ctx, event.dateStart);
    if (!history) return null;
    return await rankEvent(ctx, event, history);
  },
});

export async function rankUpcomingEvents(ctx: MutationCtx, history: RosterHistory, now: number) {
  const events = await ctx.db
    .query("events")
    .withIndex("by_dateStart", (q) => q.gte("dateStart", now - LONGEST_EVENT_MS).lt("dateStart", now + UPCOMING_MS))
    .take(200);
  for (const event of events) {
    if (event.dateEnd >= now) await rankEvent(ctx, event, history);
  }
}

export async function deleteRollCallOrder(ctx: MutationCtx, eventId: Id<"events">) {
  const existing = await storedOrder(ctx, eventId);
  if (existing) await ctx.db.delete("rollCallOrders", existing._id);
}
