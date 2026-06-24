import { ConvexError, v } from "convex/values";
import { staffYearForDate } from "../shared/flow";
import { ALL_SUBGROUP } from "../shared/rollcall";
import { Doc } from "./_generated/dataModel";
import { QueryCtx, mutation, query } from "./_generated/server";
import { optionalProfile, requireProfile } from "./model";

/** Quick attendance count for an event, without loading the rows themselves. */
async function attendanceCount(
  ctx: QueryCtx,
  eventId: Doc<"events">["_id"]
): Promise<number> {
  const rows = await ctx.db
    .query("attendance")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  return rows.length;
}

const annotate = (event: Doc<"events">) => ({
  ...event,
  collaborative: event.subgroups.length > 1,
});

/**
 * Events for one sub-group in a year, newest first. A sub-group is a campus
 * (university name) or the literal "ALL"; an event appears here when its
 * `subgroups` array contains the asked-for one. Each row carries a quick
 * attendance count and a `collaborative` flag (2+ sub-groups).
 */
export const listBySubgroup = query({
  args: { year: v.number(), subgroup: v.string() },
  handler: async (ctx, { year, subgroup }) => {
    // Staff-only: an authenticated user without a staff profile sees nothing.
    if (!(await optionalProfile(ctx))) return [];
    const events = await ctx.db
      .query("events")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    const matching = events.filter((e) => e.subgroups.includes(subgroup));
    const withCounts = await Promise.all(
      matching.map(async (event) => ({
        ...annotate(event),
        attendanceCount: await attendanceCount(ctx, event._id),
      }))
    );
    return withCounts.sort((a, b) => b.dateStart - a.dateStart);
  },
});

/**
 * The roll-call sub-groups for a year: the synthetic "ALL" plus every campus
 * (the year's `universities` rows). Data-driven — campuses come straight from
 * the universities table, so years keep their own campus list.
 */
export const subgroups = query({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    // Staff-only: an authenticated user without a staff profile sees nothing.
    if (!(await optionalProfile(ctx))) return [];
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();
    return [
      ALL_SUBGROUP,
      ...universities.map((u) => u.name).sort((a, b) => a.localeCompare(b)),
    ];
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Staff-only: an authenticated user without a staff profile sees nothing.
    if (!(await optionalProfile(ctx))) return null;
    const event = await ctx.db.get(eventId);
    return event ? annotate(event) : null;
  },
});

/**
 * Create an event tagged with one or more sub-groups. Any signed-in staff
 * member may run a roll-call, so this only requires a profile. The year is the
 * staff year of the start date, derived server-side so it always matches the
 * roster the roll-call loads (the roster is keyed by the same staff year).
 */
export const create = mutation({
  args: {
    name: v.string(),
    dateStart: v.number(),
    dateEnd: v.number(),
    subgroups: v.array(v.string()),
  },
  handler: async (ctx, { name, dateStart, dateEnd, subgroups }) => {
    await requireProfile(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError("Give the event a name.");
    if (subgroups.length === 0) {
      throw new ConvexError("Pick at least one sub-group for the event.");
    }
    // De-dupe so ["USYD","USYD"] can't falsely mark an event collaborative.
    const uniqueSubgroups = [...new Set(subgroups)];
    if (dateEnd < dateStart) {
      throw new ConvexError("Event end can't be before its start.");
    }
    const year = staffYearForDate(new Date(dateStart));
    // Guard: every sub-group must be "ALL" or a real campus for this year.
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();
    const valid = new Set([ALL_SUBGROUP, ...universities.map((u) => u.name)]);
    for (const subgroup of uniqueSubgroups) {
      if (!valid.has(subgroup)) {
        throw new ConvexError(`Unknown sub-group "${subgroup}" for ${year}.`);
      }
    }
    return await ctx.db.insert("events", {
      year,
      name: trimmed,
      dateStart,
      dateEnd,
      subgroups: uniqueSubgroups,
    });
  },
});

export const remove = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireProfile(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) return;
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.delete(eventId);
  },
});
