import { ConvexError, v } from "convex/values";
import { staffYearForDate } from "../shared/flow";
import { eventIncludesSubgroup, normalizeSubgroups, SOW_SUBGROUP } from "../shared/rollcall";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
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

async function resolveTags(ctx: QueryCtx, year: number, tagIds?: Id<"attendanceTags">[]) {
  if (!tagIds?.length) return [];
  const tags = await Promise.all(tagIds.map((id) => ctx.db.get(id)));
  return tags.filter((t): t is NonNullable<typeof t> => !!t && t.year === year);
}

const annotate = async (ctx: QueryCtx, event: Doc<"events">) => ({
  ...event,
  collaborative: event.subgroups.length > 1,
  tags: await resolveTags(ctx, event.year, event.tagIds),
});

async function validateEventFields(
  ctx: MutationCtx,
  args: {
    name: string;
    dateStart: number;
    dateEnd: number;
    subgroups: string[];
    tagIds?: Id<"attendanceTags">[];
  }
) {
  const trimmed = args.name.trim();
  if (!trimmed) throw new ConvexError("Give the event a name.");
  if (args.subgroups.length === 0) {
    throw new ConvexError("Pick at least one sub-group for the event.");
  }
  if (args.dateEnd < args.dateStart) {
    throw new ConvexError("Event end can't be before its start.");
  }
  const uniqueSubgroups = normalizeSubgroups([...new Set(args.subgroups)]);
  const year = staffYearForDate(new Date(args.dateStart));
  const universities = await ctx.db
    .query("universities")
    .withIndex("by_year_and_name", (q) => q.eq("year", year))
    .collect();
  const valid = new Set([SOW_SUBGROUP, ...universities.map((u) => u.name)]);
  for (const subgroup of uniqueSubgroups) {
    if (!valid.has(subgroup)) {
      throw new ConvexError(`Unknown sub-group "${subgroup}" for ${year}.`);
    }
  }
  if (args.tagIds?.length) {
    for (const tagId of args.tagIds) {
      const tag = await ctx.db.get(tagId);
      if (!tag || tag.year !== year) {
        throw new ConvexError("One or more tags are invalid for this year.");
      }
    }
  }
  return {
    year,
    name: trimmed,
    dateStart: args.dateStart,
    dateEnd: args.dateEnd,
    subgroups: uniqueSubgroups,
    tagIds: args.tagIds?.length ? args.tagIds : undefined,
  };
}

/**
 * Events for one sub-group in a year, newest first. A sub-group is a campus
 * (university name) or the literal "SOW"; an event appears here when its
 * `subgroups` array contains the asked-for one. Each row carries a quick
 * attendance count and a `collaborative` flag (2+ sub-groups).
 */
export const listBySubgroup = query({
  args: { year: v.number(), subgroup: v.string() },
  handler: async (ctx, { year, subgroup }) => {
    if (!(await optionalProfile(ctx))) return [];
    const events = await ctx.db
      .query("events")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    const matching = events.filter((e) =>
      eventIncludesSubgroup(e.subgroups, subgroup)
    );
    const withCounts = await Promise.all(
      matching.map(async (event) => ({
        ...(await annotate(ctx, event)),
        attendanceCount: await attendanceCount(ctx, event._id),
      }))
    );
    return withCounts.sort((a, b) => b.dateStart - a.dateStart);
  },
});

/**
 * The roll-call sub-groups for a year: org-wide "SOW" plus every campus
 * (the year's `universities` rows). Data-driven — campuses come straight from
 * the universities table, so years keep their own campus list.
 */
export const subgroups = query({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    if (!(await optionalProfile(ctx))) return [];
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();
    return [
      SOW_SUBGROUP,
      ...universities.map((u) => u.name).sort((a, b) => a.localeCompare(b)),
    ];
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    if (!(await optionalProfile(ctx))) return null;
    const event = await ctx.db.get(eventId);
    return event ? await annotate(ctx, event) : null;
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
    tagIds: v.optional(v.array(v.id("attendanceTags"))),
  },
  handler: async (ctx, { name, dateStart, dateEnd, subgroups, tagIds }) => {
    await requireProfile(ctx);
    const eventFields = await validateEventFields(ctx, {
      name,
      dateStart,
      dateEnd,
      subgroups,
      tagIds,
    });
    return await ctx.db.insert("events", eventFields);
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    dateStart: v.number(),
    dateEnd: v.number(),
    subgroups: v.array(v.string()),
    tagIds: v.optional(v.array(v.id("attendanceTags"))),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { eventId, name, dateStart, dateEnd, subgroups, tagIds }
  ) => {
    await requireProfile(ctx);
    const existing = await ctx.db.get(eventId);
    if (!existing) throw new ConvexError("Event not found.");
    const eventFields = await validateEventFields(ctx, {
      name,
      dateStart,
      dateEnd,
      subgroups,
      tagIds,
    });
    await ctx.db.patch(eventId, eventFields);
    return null;
  },
});

export const remove = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    await requireProfile(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.delete(eventId);
    return null;
  },
});
