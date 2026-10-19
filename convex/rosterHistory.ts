import { v } from "convex/values";
import { staffYearStartMs } from "../shared/flow";
import { type AttendanceFrequencyScore, normalizeSubgroups } from "../shared/rollcall";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, QueryCtx } from "./_generated/server";
import { currentStaffYear } from "./model";

const ROSTER_HISTORY_EVENT_LIMIT = 60;

type HistoryEvent = {
  eventId: Id<"events">;
  dateStart: number;
  tagIds: string[];
  subgroups: string[];
};

type RosterHistory = {
  events: HistoryEvent[];
  attendees: Id<"attendanceMembers">[][];
};

async function liveHistory(ctx: QueryCtx, year: number): Promise<RosterHistory> {
  const events = await ctx.db
    .query("events")
    .withIndex("by_dateStart", (q) =>
      q.gte("dateStart", staffYearStartMs(year)).lt("dateStart", staffYearStartMs(year + 1))
    )
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
    })),
    attendees,
  };
}

export async function rosterHistory(ctx: QueryCtx, year: number): Promise<RosterHistory> {
  const snapshot = await ctx.db
    .query("rosterHistorySnapshots")
    .withIndex("by_year", (q) => q.eq("year", year))
    .first();
  if (!snapshot) return await liveHistory(ctx, year);
  const attendees = snapshot.events.map((): Id<"attendanceMembers">[] => []);
  for (const member of snapshot.members) {
    for (const index of member.events) attendees[index]?.push(member.memberId);
  }
  return { events: snapshot.events, attendees };
}

export function frequencyScores(
  history: RosterHistory,
  event: Doc<"events">
): Map<string, AttendanceFrequencyScore> {
  const eventTagIds = new Set((event.tagIds ?? []).map(String));
  const eventSubgroups = new Set(normalizeSubgroups(event.subgroups));
  const scores = new Map<string, AttendanceFrequencyScore>();
  history.events.forEach((historyEvent, i) => {
    if (historyEvent.eventId === event._id) return;
    const tagMatch = historyEvent.tagIds.some((tagId) => eventTagIds.has(tagId));
    const subgroupMatch = normalizeSubgroups(historyEvent.subgroups).some((subgroup) =>
      eventSubgroups.has(subgroup)
    );
    for (const memberId of history.attendees[i]) {
      const key = `member:${memberId}`;
      const score = scores.get(key) ?? { tagMatches: 0, subgroupMatches: 0, total: 0, latest: 0 };
      score.total += 1;
      if (tagMatch) score.tagMatches += 1;
      if (subgroupMatch) score.subgroupMatches += 1;
      score.latest = Math.max(score.latest, historyEvent.dateStart);
      scores.set(key, score);
    }
  });
  return scores;
}

export const rebuild = internalMutation({
  args: { year: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const year = args.year ?? currentStaffYear();
    const live = await liveHistory(ctx, year);
    const eventsByMember = new Map<Id<"attendanceMembers">, number[]>();
    live.attendees.forEach((memberIds, index) => {
      for (const memberId of memberIds) {
        const attended = eventsByMember.get(memberId) ?? [];
        attended.push(index);
        eventsByMember.set(memberId, attended);
      }
    });
    const doc = {
      year,
      builtAt: Date.now(),
      events: live.events,
      members: [...eventsByMember].map(([memberId, events]) => ({ memberId, events })),
    };
    const existing = await ctx.db
      .query("rosterHistorySnapshots")
      .withIndex("by_year", (q) => q.eq("year", year))
      .take(10);
    if (existing.length === 0) {
      await ctx.db.insert("rosterHistorySnapshots", doc);
    } else {
      await ctx.db.replace("rosterHistorySnapshots", existing[0]._id, doc);
      for (const extra of existing.slice(1)) {
        await ctx.db.delete("rosterHistorySnapshots", extra._id);
      }
    }
    return null;
  },
});
