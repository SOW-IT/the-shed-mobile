import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx, QueryCtx } from "./_generated/server";
import { currentStaffYear } from "./model";
import { rankUpcomingEvents } from "./rollCallOrder";

const DAY_MS = 86_400_000;
const SNAPSHOT_DAYS = 400;
const SNAPSHOT_REACH_MS = 30 * DAY_MS;
const FULL_REBUILD_MS = 7 * DAY_MS;
const ROSTER_HISTORY_EVENT_LIMIT = 500;

type HistoryEvent = {
  eventId: Id<"events">;
  dateStart: number;
  tagIds: string[];
  subgroups: string[];
  weekly?: boolean;
  count?: number;
};

export type RosterHistory = {
  events: HistoryEvent[];
  attendees: Id<"attendanceMembers">[][];
};

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
  if (!snapshot || dateStart < snapshot.builtAt - SNAPSHOT_REACH_MS) return null;
  return snapshotHistory(snapshot);
}

const attendeesOf = async (ctx: MutationCtx, eventId: Id<"events">) =>
  (
    await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
  ).map((row) => row.memberId);

export const rebuild = internalMutation({
  args: { full: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const previous = await latestSnapshot(ctx);
    const full = args.full === true || !previous?.fullAt || now - previous.fullAt >= FULL_REBUILD_MS;
    const known = new Map<string, { count?: number; attendees: Id<"attendanceMembers">[] }>();
    if (previous && !full) {
      const cached = snapshotHistory(previous);
      previous.events.forEach((event, i) =>
        known.set(event.eventId, { count: event.count, attendees: cached.attendees[i] })
      );
    }
    const events = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", now - SNAPSHOT_DAYS * DAY_MS).lt("dateStart", now))
      .order("desc")
      .take(ROSTER_HISTORY_EVENT_LIMIT);
    const history: RosterHistory = { events: [], attendees: [] };
    for (const event of events) {
      const counted = await ctx.db
        .query("eventAttendanceCounts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .first();
      const cached = known.get(event._id);
      history.events.push({
        eventId: event._id,
        dateStart: event.dateStart,
        tagIds: (event.tagIds ?? []).map(String),
        subgroups: event.subgroups,
        weekly: event.weekly != null,
        ...(counted ? { count: counted.count } : {}),
      });
      history.attendees.push(
        cached && counted && cached.count === counted.count ? cached.attendees : await attendeesOf(ctx, event._id)
      );
    }
    const eventsByMember = new Map<Id<"attendanceMembers">, number[]>();
    history.attendees.forEach((memberIds, index) => {
      for (const memberId of memberIds) {
        const attended = eventsByMember.get(memberId) ?? [];
        attended.push(index);
        eventsByMember.set(memberId, attended);
      }
    });
    const doc = {
      year: currentStaffYear(),
      builtAt: now,
      fullAt: full ? now : previous!.fullAt,
      events: history.events,
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
    await rankUpcomingEvents(ctx, history, now);
    return null;
  },
});
