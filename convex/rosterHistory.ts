import { v } from "convex/values";
import { LIKELIHOOD } from "../shared/rollCallLikelihood";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx, QueryCtx } from "./_generated/server";
import { currentStaffYear } from "./model";
import { rankUpcomingEvents } from "./rollCallOrder";

const DAY_MS = 86_400_000;
const SNAPSHOT_REACH_MS = 30 * DAY_MS;
const SNAPSHOT_MS = LIKELIHOOD.windowDays * DAY_MS + SNAPSHOT_REACH_MS;
const FULL_REBUILD_MS = 14 * DAY_MS;
const REFRESH_MS = 14 * DAY_MS;
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

type PackedMembers = { memberIds: Id<"attendanceMembers">[]; memberEvents: string[] };

const unpackEvents = (packed: string) => (packed ? packed.split(".").map((index) => parseInt(index, 36)) : []);

function packedMembers(snapshot: Doc<"rosterHistorySnapshots">): PackedMembers {
  if (snapshot.memberIds) return { memberIds: snapshot.memberIds, memberEvents: snapshot.memberEvents ?? [] };
  const members = snapshot.members ?? [];
  return {
    memberIds: members.map((member) => member.memberId),
    memberEvents: members.map((member) => member.events.map((index) => index.toString(36)).join(".")),
  };
}

function snapshotHistory(snapshot: Doc<"rosterHistorySnapshots">): RosterHistory {
  const attendees = snapshot.events.map((): Id<"attendanceMembers">[] => []);
  const { memberIds, memberEvents } = packedMembers(snapshot);
  memberIds.forEach((memberId, i) => {
    for (const index of unpackEvents(memberEvents[i] ?? "")) attendees[index]?.push(memberId);
  });
  return { events: snapshot.events, attendees };
}

export async function historyBefore(ctx: QueryCtx, dateStart: number): Promise<RosterHistory | null> {
  const snapshot = await latestSnapshot(ctx);
  if (!snapshot || dateStart < snapshot.builtAt - SNAPSHOT_REACH_MS) return null;
  return snapshotHistory(snapshot);
}

const eventKey = (e: HistoryEvent) =>
  [e.eventId, e.dateStart, e.tagIds.join(","), e.subgroups.join(","), e.weekly ? 1 : 0, e.count ?? ""].join("|");

const sameHistory = (a: Doc<"rosterHistorySnapshots">, b: { events: HistoryEvent[] } & PackedMembers) => {
  const members = packedMembers(a);
  return (
    a.events.length === b.events.length &&
    members.memberIds.length === b.memberIds.length &&
    a.events.every((event, i) => eventKey(event) === eventKey(b.events[i])) &&
    members.memberIds.every((id, i) => id === b.memberIds[i] && members.memberEvents[i] === b.memberEvents[i])
  );
};

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
    const windowStart = now - SNAPSHOT_MS;
    const refreshFrom = full ? windowStart : Math.max(windowStart, previous!.builtAt - REFRESH_MS);
    const known = new Map<string, { count?: number; attendees: Id<"attendanceMembers">[] }>();
    const history: RosterHistory = { events: [], attendees: [] };
    if (previous && !full) {
      const cached = snapshotHistory(previous);
      previous.events.forEach((event, i) => {
        if (event.dateStart >= refreshFrom) {
          known.set(event.eventId, { count: event.count, attendees: cached.attendees[i] });
        } else if (event.dateStart >= windowStart) {
          history.events.push(event);
          history.attendees.push(cached.attendees[i]);
        }
      });
    }
    const events = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", refreshFrom).lt("dateStart", now))
      .order("desc")
      .take(ROSTER_HISTORY_EVENT_LIMIT);
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
    const order = history.events
      .map((event, i) => ({ event, attendees: history.attendees[i] }))
      .sort((a, b) => b.event.dateStart - a.event.dateStart || a.event.eventId.localeCompare(b.event.eventId));
    history.events = order.map((row) => row.event);
    history.attendees = order.map((row) => row.attendees);
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
      memberIds: [...eventsByMember.keys()],
      memberEvents: [...eventsByMember.values()].map((indexes) => indexes.map((index) => index.toString(36)).join(".")),
    };
    const existing = full || !previous ? await ctx.db.query("rosterHistorySnapshots").take(20) : [previous];
    const unchanged = !full && sameHistory(previous!, doc);
    if (!unchanged && existing.length === 0) {
      await ctx.db.insert("rosterHistorySnapshots", doc);
    } else if (!unchanged) {
      await ctx.db.replace("rosterHistorySnapshots", existing[0]._id, doc);
      for (const extra of existing.slice(1)) {
        await ctx.db.delete("rosterHistorySnapshots", extra._id);
      }
    }
    await rankUpcomingEvents(ctx, history, now);
    return null;
  },
});
