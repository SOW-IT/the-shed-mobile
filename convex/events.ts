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
import { markSubgroupsDirty } from "./attendanceMetrics";
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

const asPaginatorCursor = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    return Array.isArray(JSON.parse(value)) ? value : null;
  } catch {
    return null;
  }
};

const decodeListBySubgroupCursor = (
  cursor: string | null | undefined
): ListBySubgroupCursor => {
  if (!cursor) return { dbCursor: null, dbIsDone: false, bufferedIds: [] };
  const prefix = "event-subgroup:";
  if (!cursor.startsWith(prefix)) {
    return { dbCursor: asPaginatorCursor(cursor), dbIsDone: false, bufferedIds: [] };
  }
  const fresh = { dbCursor: null, dbIsDone: false, bufferedIds: [] };
  try {
    const parsed = JSON.parse(cursor.slice(prefix.length)) as {
      dbCursor?: unknown;
      dbIsDone?: unknown;
      bufferedIds?: unknown;
    };
    const bufferedIds = Array.isArray(parsed.bufferedIds)
      ? (parsed.bufferedIds
          .filter((id) => typeof id === "string")
          .slice(0, EVENTS_SCAN_BATCH_SIZE) as Id<"events">[])
      : [];
    const dbIsDone = parsed.dbIsDone === true;
    if (dbIsDone && bufferedIds.length === 0) return fresh;
    return { dbCursor: asPaginatorCursor(parsed.dbCursor), dbIsDone, bufferedIds };
  } catch {
    return fresh;
  }
};

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

async function resolveTags(ctx: QueryCtx, tagIds?: Id<"attendanceTags">[]) {
  if (!tagIds?.length) return [];
  const tags = await Promise.all(tagIds.map((id) => ctx.db.get(id)));
  return tags.filter((t): t is NonNullable<typeof t> => !!t);
}

const annotate = async (ctx: QueryCtx, event: Doc<"events">) => {
  const subgroups = normalizeSubgroups(event.subgroups);
  return {
    ...event,
    subgroups,
    collaborative: subgroups.length > 1,
    tags: await resolveTags(ctx, event.tagIds),
  };
};

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
  const uniqueTagIds = args.tagIds?.length ? [...new Set(args.tagIds)] : undefined;
  if (uniqueTagIds) {
    for (const tagId of uniqueTagIds) {
      const tag = await ctx.db.get(tagId);
      if (!tag) {
        throw new ConvexError("One or more selected tags no longer exist.");
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
  args: { eventId: v.string() },
  handler: async (ctx, { eventId: rawEventId }) => {
    if (!(await optionalProfile(ctx))) return null;
    const eventId = ctx.db.normalizeId("events", rawEventId);
    if (!eventId) return null;
    const event = await ctx.db.get(eventId);
    return event ? await annotate(ctx, event) : null;
  },
});

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
    if (email === actor) continue;
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
      body: `${event.name} · ${where}`,
      url: `/attendance/event/${event._id}`,
    });
  }
}

export const notifyNewEvent = internalMutation({
  args: { eventId: v.id("events"), actorEmail: v.string() },
  handler: async (ctx, { eventId, actorEmail }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    await notifyStaffOfNewEvent(ctx, event, actorEmail);
    return null;
  },
});

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
    await markSubgroupsDirty(ctx, eventFields.subgroups);
    await logAttendanceAction(ctx, {
      actorEmail: email,
      entityType: "event",
      action: "event.create",
      summary: `Created event "${eventFields.name}" (${eventFields.subgroups.join(", ")})`,
      eventId,
    });
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
    if (changes.length) {
      await markSubgroupsDirty(ctx, [
        ...existing.subgroups,
        ...eventFields.subgroups,
      ]);
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
    await markSubgroupsDirty(ctx, event.subgroups);
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
