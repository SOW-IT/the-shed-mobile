import { ConvexError, v } from "convex/values";
import { eventStaffYear, staffYearForDate } from "../shared/flow";
import { eventIncludesSubgroup, normalizeSubgroups, SOW_SUBGROUP } from "../shared/rollcall";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { optionalProfile, requireProfile } from "./model";
import { logAttendanceAction } from "./attendanceAudit";

const EVENTS_PAGE_SIZE = 20;

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
  tags: await resolveTags(ctx, eventStaffYear(event.dateStart), event.tagIds),
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
  // Staff year of the start date — used here only to validate sub-groups and
  // tags against that year's catalog; it is NOT stored (derived on read).
  const year = eventStaffYear(args.dateStart);
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
  // Dedupe so the same tag can't be stored twice (which would surface duplicate
  // pills and duplicate React keys in the events list).
  const uniqueTagIds = args.tagIds?.length ? [...new Set(args.tagIds)] : undefined;
  if (uniqueTagIds) {
    for (const tagId of uniqueTagIds) {
      const tag = await ctx.db.get(tagId);
      if (!tag || tag.year !== year) {
        throw new ConvexError("One or more tags are invalid for this year.");
      }
    }
  }
  return {
    name: trimmed,
    dateStart: args.dateStart,
    dateEnd: args.dateEnd,
    subgroups: uniqueSubgroups,
    tagIds: uniqueTagIds,
  };
}

/**
 * Events for one sub-group across all years, newest first, paginated.
 * Returns the first `numItems` (default 20) events plus a `continueCursor`
 * for subsequent pages. Annotates only the current page to keep reads cheap.
 */
export const listBySubgroup = query({
  args: {
    subgroup: v.string(),
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, { subgroup, cursor, numItems = EVENTS_PAGE_SIZE }) => {
    const empty = { events: [], isDone: true, continueCursor: null } as const;
    if (!(await optionalProfile(ctx))) return empty;
    const all = await ctx.db.query("events").collect();
    const matching = all
      .filter((e) => eventIncludesSubgroup(e.subgroups, subgroup))
      .sort((a, b) => b.dateStart - a.dateStart);
    const start = cursor ? Number(cursor) : 0;
    const page = matching.slice(start, start + numItems);
    const withCounts = await Promise.all(
      page.map(async (event) => ({
        ...(await annotate(ctx, event)),
        attendanceCount: await attendanceCount(ctx, event._id),
      }))
    );
    const next = start + numItems;
    return {
      events: withCounts,
      isDone: next >= matching.length,
      continueCursor: next >= matching.length ? null : String(next),
    };
  },
});

/**
 * The roll-call sub-groups: org-wide "SOW" plus every campus in the current
 * staff year's `universities` table.
 */
export const subgroups = query({
  args: {},
  handler: async (ctx) => {
    if (!(await optionalProfile(ctx))) return [];
    const year = staffYearForDate(new Date());
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
    const { email } = await requireProfile(ctx);
    const eventFields = await validateEventFields(ctx, {
      name,
      dateStart,
      dateEnd,
      subgroups,
      tagIds,
    });
    const eventId = await ctx.db.insert("events", eventFields);
    await logAttendanceAction(ctx, {
      actorEmail: email,
      entityType: "event",
      action: "event.create",
      summary: `Created event "${eventFields.name}" (${eventFields.subgroups.join(", ")})`,
      eventId,
    });
    return eventId;
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
    const { email } = await requireProfile(ctx);
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
    const changes: string[] = [];
    if (existing.name !== eventFields.name) changes.push("name");
    if (existing.dateStart !== eventFields.dateStart) changes.push("start date");
    if (existing.dateEnd !== eventFields.dateEnd) changes.push("end date");
    if (existing.subgroups.join() !== eventFields.subgroups.join())
      changes.push("sub-groups");
    if ((existing.tagIds ?? []).join() !== (eventFields.tagIds ?? []).join())
      changes.push("tags");
    await logAttendanceAction(ctx, {
      actorEmail: email,
      entityType: "event",
      action: "event.update",
      summary: `Updated event "${eventFields.name}"`,
      eventId,
      detail: changes.length ? `Changed: ${changes.join(", ")}` : undefined,
    });
    return null;
  },
});

export const remove = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const { email } = await requireProfile(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.delete(eventId);
    await logAttendanceAction(ctx, {
      actorEmail: email,
      entityType: "event",
      action: "event.delete",
      summary: `Deleted event "${event.name}"`,
      detail:
        rows.length > 0 ? `Removed ${rows.length} attendance record(s)` : undefined,
    });
    return null;
  },
});
