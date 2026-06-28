import { ConvexError, v } from "convex/values";
import {
  assignmentsOf,
  eventStaffYear,
  roleNeedsUniversity,
  staffYearForDate,
} from "../shared/flow";
import {
  eventIncludesSubgroup,
  normalizeSubgroups,
  SOW_SUBGROUP,
  subgroupLabel,
} from "../shared/rollcall";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  MutationCtx,
  QueryCtx,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { optionalProfile, requireProfile } from "./model";
import { notify } from "./requests";
import { logAttendanceAction } from "./attendanceAudit";
import { paginator } from "convex-helpers/server/pagination";
import schema from "./schema";

const EVENTS_PAGE_SIZE = 20;
const MAX_EVENTS_PAGE_SIZE = 50;
const EVENTS_SCAN_BATCH_SIZE = 100;
const MAX_EVENTS_SCANNED_PER_PAGE = 1000;

type ListBySubgroupCursor = {
  dbCursor: string | null;
  dbIsDone: boolean;
  bufferedIds: Id<"events">[];
};

const encodeListBySubgroupCursor = (cursor: ListBySubgroupCursor) =>
  `event-subgroup:${JSON.stringify(cursor)}`;

// `paginator` (convex-helpers) encodes its cursor as a JSON array string, so a
// valid db cursor always starts with "[". Anything else — an opaque cursor left
// over from the old built-in `.paginate()` deploy, or junk — would make
// `paginator.paginate()` throw, so we drop it and restart from the newest row.
const asPaginatorCursor = (value: unknown): string | null =>
  typeof value === "string" && value.startsWith("[") ? value : null;

const decodeListBySubgroupCursor = (
  cursor: string | null | undefined
): ListBySubgroupCursor => {
  if (!cursor) return { dbCursor: null, dbIsDone: false, bufferedIds: [] };
  const prefix = "event-subgroup:";
  if (!cursor.startsWith(prefix)) {
    return { dbCursor: asPaginatorCursor(cursor), dbIsDone: false, bufferedIds: [] };
  }
  try {
    const parsed = JSON.parse(cursor.slice(prefix.length)) as {
      dbCursor?: unknown;
      dbIsDone?: unknown;
      bufferedIds?: unknown;
    };
    return {
      dbCursor: asPaginatorCursor(parsed.dbCursor),
      dbIsDone: parsed.dbIsDone === true,
      bufferedIds: Array.isArray(parsed.bufferedIds)
        ? (parsed.bufferedIds
            .filter((id) => typeof id === "string")
            .slice(0, EVENTS_SCAN_BATCH_SIZE) as Id<"events">[])
        : [],
    };
  } catch {
    return { dbCursor: null, dbIsDone: false, bufferedIds: [] };
  }
};

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
    const pageSize = Math.min(
      Math.max(1, Math.floor(numItems)),
      MAX_EVENTS_PAGE_SIZE
    );
    const decodedCursor = decodeListBySubgroupCursor(cursor);
    const page: Doc<"events">[] = [];
    const remainingBufferedIds: Id<"events">[] = [];
    for (const rawEventId of decodedCursor.bufferedIds) {
      const eventId = ctx.db.normalizeId("events", rawEventId);
      if (!eventId) continue;
      const event = await ctx.db.get(eventId);
      if (!event) continue;
      if (!eventIncludesSubgroup(event.subgroups, subgroup)) continue;
      if (page.length < pageSize) {
        page.push(event);
      } else {
        remainingBufferedIds.push(eventId);
      }
    }
    let continueCursor = decodedCursor.dbCursor;
    let isDone = decodedCursor.dbIsDone;
    let scanned = 0;
    while (
      page.length < pageSize &&
      remainingBufferedIds.length === 0 &&
      !isDone &&
      scanned < MAX_EVENTS_SCANNED_PER_PAGE
    ) {
      const batchSize = Math.min(
        EVENTS_SCAN_BATCH_SIZE,
        MAX_EVENTS_SCANNED_PER_PAGE - scanned
      );
      // Use convex-helpers' `paginator` rather than the built-in
      // `ctx.db...paginate()`: a single Convex function may only call the
      // built-in `.paginate()` once, but a sparse subgroup forces this loop to
      // scan several batches, which threw "multiple paginated queries in a
      // single function call". `paginator` has no such limit.
      const batch = await paginator(ctx.db, schema)
        .query("events")
        .withIndex("by_dateStart")
        .order("desc")
        .paginate({
          cursor: continueCursor,
          numItems: batchSize,
        });
      continueCursor = batch.continueCursor;
      isDone = batch.isDone;
      scanned += batch.page.length;
      for (const event of batch.page) {
        if (!eventIncludesSubgroup(event.subgroups, subgroup)) continue;
        if (page.length < pageSize) {
          page.push(event);
        } else {
          remainingBufferedIds.push(event._id);
        }
      }
      if (batch.page.length === 0) break;
    }
    const withCounts = await Promise.all(
      page.map(async (event) => ({
        ...(await annotate(ctx, event)),
        attendanceCount: await attendanceCount(ctx, event._id),
      }))
    );
    const hasMore = remainingBufferedIds.length > 0 || !isDone;
    return {
      events: withCounts,
      isDone: !hasMore,
      continueCursor: hasMore
        ? encodeListBySubgroupCursor({
            dbCursor: continueCursor,
            dbIsDone: isDone,
            bufferedIds: remainingBufferedIds,
          })
        : null,
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
 * Push + in-app notify the staff in an event's group(s) that it was created.
 * A campus sub-group notifies staff whose assignment includes that campus; the
 * org-wide "SOW" sub-group notifies every staff member of the event's year.
 * No email — a fan-out blast would be spam — and never the creator themselves.
 */
async function notifyStaffOfNewEvent(
  ctx: MutationCtx,
  event: { _id: Id<"events">; name: string; dateStart: number; subgroups: string[] },
  actorEmail: string
) {
  const year = eventStaffYear(event.dateStart);
  const subgroupSet = new Set(event.subgroups);
  const orgWide = subgroupSet.has(SOW_SUBGROUP);
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))
    .collect();
  const actor = actorEmail.toLowerCase();
  const recipients = new Set<string>();
  for (const p of profiles) {
    const email = p.email.toLowerCase();
    if (email === actor) continue; // don't notify the creator
    const inGroup =
      orgWide ||
      assignmentsOf(p).some(
        (a) =>
          a.university && roleNeedsUniversity(a.role) && subgroupSet.has(a.university)
      );
    if (inGroup) recipients.add(email);
  }
  const where = event.subgroups.map(subgroupLabel).join(", ");
  for (const to of recipients) {
    await notify(ctx, {
      to,
      actor: actorEmail,
      email: false,
      subject: `New event: ${event.name}`,
      pushTitle: "New event",
      body: `${event.name} — ${where}`,
      url: `/attendance/event/${event._id}`,
    });
  }
}

/**
 * Background fan-out for {@link notifyStaffOfNewEvent}, scheduled by `create`
 * so the (potentially org-wide) notification work runs off the event-creation
 * request path — a transient failure here never aborts the event insert.
 */
export const notifyNewEvent = internalMutation({
  args: { eventId: v.id("events"), actorEmail: v.string() },
  handler: async (ctx, { eventId, actorEmail }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    await notifyStaffOfNewEvent(ctx, event, actorEmail);
    return null;
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
    // Fan out the staff notifications off the request path (see notifyNewEvent).
    await ctx.scheduler.runAfter(0, internal.events.notifyNewEvent, {
      eventId,
      actorEmail: email,
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
    // Only log a genuine change, matching the tag/metadata saveAll paths — a
    // no-op save shouldn't flood the trail with misleading "Updated" rows.
    if (changes.length) {
      await logAttendanceAction(ctx, {
        actorEmail: email,
        entityType: "event",
        action: "event.update",
        summary: `Updated event "${eventFields.name}"`,
        eventId,
        detail: `Changed: ${changes.join(", ")}`,
      });
    }
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
