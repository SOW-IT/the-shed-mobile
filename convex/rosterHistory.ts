import { v } from "convex/values";
import { likelihoodWindowStart } from "../shared/rollCallLikelihood";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, QueryCtx } from "./_generated/server";
import { currentStaffYear } from "./model";

const DAY_MS = 86_400_000;
const SNAPSHOT_DAYS = 400;
const SNAPSHOT_REACH_MS = 30 * DAY_MS;
const ROSTER_HISTORY_EVENT_LIMIT = 500;

type HistoryEvent = {
  eventId: Id<"events">;
  dateStart: number;
  tagIds: string[];
  subgroups: string[];
  weekly?: boolean;
};

export type RosterHistory = {
  events: HistoryEvent[];
  attendees: Id<"attendanceMembers">[][];
};

async function liveHistory(ctx: QueryCtx, from: number, to: number): Promise<RosterHistory> {
  const events = await ctx.db
    .query("events")
    .withIndex("by_dateStart", (q) => q.gte("dateStart", from).lt("dateStart", to))
    .order("desc")
    .take(ROSTER_HISTORY_EVENT_LIMIT);
  const attendees = await Promise.all(
    events.map(async (event) =>
      (
        await ctx.db
          .query("attendance")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect()
      ).map((row) => row.memberId)
    )
  );
  return {
    events: events.map((event) => ({
      eventId: event._id,
      dateStart: event.dateStart,
      tagIds: (event.tagIds ?? []).map(String),
      subgroups: event.subgroups,
      weekly: event.weekly != null,
    })),
    attendees,
  };
}

const latestSnapshot = (ctx: QueryCtx) =>
  ctx.db.query("rosterHistorySnapshots").withIndex("by_year").order("desc").first();

function snapshotHistory(snapshot: Doc<"rosterHistorySnapshots">): RosterHistory {
  const attendees = snapshot.events.map((): Id<"attendanceMembers">[] => []);
  for (const member of snapshot.members) {
    for (const index of member.events) attendees[index]?.push(member.memberId);
  }
  return { events: snapshot.events, attendees };
}

export async function historyBefore(ctx: QueryCtx, dateStart: number): Promise<RosterHistory | null> {
  const snapshot = await latestSnapshot(ctx);
  if (!snapshot) return null;
  if (dateStart >= snapshot.builtAt - SNAPSHOT_REACH_MS) return snapshotHistory(snapshot);
  return await liveHistory(ctx, likelihoodWindowStart(dateStart), dateStart);
}

export async function cachedHistory(ctx: QueryCtx, dateStart: number): Promise<RosterHistory> {
  const snapshot = await latestSnapshot(ctx);
  if (snapshot) return snapshotHistory(snapshot);
  return await liveHistory(ctx, likelihoodWindowStart(dateStart), dateStart);
}

export const rebuild = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const live = await liveHistory(ctx, now - SNAPSHOT_DAYS * DAY_MS, now);
    const eventsByMember = new Map<Id<"attendanceMembers">, number[]>();
    live.attendees.forEach((memberIds, index) => {
      for (const memberId of memberIds) {
        const attended = eventsByMember.get(memberId) ?? [];
        attended.push(index);
        eventsByMember.set(memberId, attended);
      }
    });
    const doc = {
      year: currentStaffYear(),
      builtAt: now,
      events: live.events,
      members: [...eventsByMember].map(([memberId, events]) => ({ memberId, events })),
    };
    const existing = await ctx.db.query("rosterHistorySnapshots").take(20);
    if (existing.length === 0) {
      await ctx.db.insert("rosterHistorySnapshots", doc);
    } else {
      await ctx.db.replace("rosterHistorySnapshots", existing[0]._id, doc);
      for (const extra of existing.slice(1)) {
        await ctx.db.delete("rosterHistorySnapshots", extra._id);
      }
    }
    await ctx.scheduler.runAfter(0, internal.rollCallOrder.rankUpcoming, {});
    return null;
  },
});
