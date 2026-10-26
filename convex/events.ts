import { ConvexError, v } from "convex/values";
import {
  assignmentsOf,
  eventStaffYear,
  roleNeedsUniversity,
  staffYearForDate,
  sydneyCalendarYear,
} from "../shared/flow";
import {
  auditEventName,
  eventMatchesListFilter,
  normalizeSubgroups,
  SOW_SUBGROUP,
  subgroupLabel,
  isWeekliesTagName,
  WEEKLIES_TAG_NAME,
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
import { memberAuditName } from "./attendanceMembers";
import { readSettings } from "./weeklyInsights";
import {
  termSystemFor,
  WEEK_MAX,
  type WeeklyMark,
} from "../shared/weeklyInsights";
import { notify } from "./requests";
import {
  auditStamp,
  logAttendanceAction,
  MAX_AUDIT_ATTENDANCE_LINES,
} from "./attendanceAudit";
import { paginator } from "convex-helpers/server/pagination";
import { asPaginatorCursor } from "./pagination";
import schema from "./schema";
import {
  deleteEventAttendanceCount,
  eventAttendanceCount,
  startEventAttendanceCount,
} from "./attendanceCounts";
import { deleteRollCallOrder, rankingInputsChanged, scheduleRank } from "./rollCallOrder";

const weeklyMarkArg = v.object({
  year: v.number(),
  slot: v.number(),
  week: v.number(),
});

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

async function weekliesTagIds(ctx: QueryCtx): Promise<Id<"attendanceTags">[]> {
  const tags = await ctx.db.query("attendanceTags").take(500);
  return tags.filter((t) => isWeekliesTagName(t.name)).map((t) => t._id);
}

async function weekliesTag(ctx: MutationCtx): Promise<Id<"attendanceTags">> {
  const [existing] = await weekliesTagIds(ctx);
  return existing ?? (await ctx.db.insert("attendanceTags", { name: WEEKLIES_TAG_NAME }));
}

async function validateEventFields(
  ctx: MutationCtx,
  args: {
    name: string;
    dateStart: number;
    dateEnd: number;
    subgroups: string[];
    tagIds?: Id<"attendanceTags">[];
    weekly?: WeeklyMark | null;
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
  let uniqueTagIds = args.tagIds?.length ? [...new Set(args.tagIds)] : undefined;
  const weeklyTags = new Set(await weekliesTagIds(ctx));
  const weekly = args.weekly;
  if (weekly) {
    const { settings } = await readSettings(ctx);
    const system = termSystemFor(uniqueSubgroups[0], settings);
    const { slot, week, year: termYear } = weekly;
    const dateYear = sydneyCalendarYear(new Date(args.dateStart));
    if (!Number.isInteger(week) || week < 1 || week > WEEK_MAX) {
      throw new ConvexError(`The week should be a number from 1 to ${WEEK_MAX}.`);
    }
    if (!Number.isInteger(slot) || slot < 1 || slot > (system === "terms" ? 3 : 2)) {
      throw new ConvexError(`That ${system === "terms" ? "term" : "semester"} doesn't exist here.`);
    }
    if (termYear !== dateYear) {
      throw new ConvexError(`The ${system === "terms" ? "term" : "semester"} should be in ${dateYear}, the year of the date.`);
    }
    const weeklyTag = await weekliesTag(ctx);
    uniqueTagIds = [weeklyTag, ...(uniqueTagIds ?? []).filter((id) => !weeklyTags.has(id))];
  } else if (uniqueTagIds) {
    uniqueTagIds = uniqueTagIds.filter((id) => !weeklyTags.has(id));
    if (!uniqueTagIds.length) uniqueTagIds = undefined;
  }
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
    weekly: weekly ?? undefined,
  };
}

export const listBySubgroup = query({
  args: {
    subgroup: v.string(),
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("attendanceTags"))),
    host: v.optional(v.union(v.literal("here"), v.literal("shared"))),
  },
  handler: async (ctx, { subgroup, cursor, numItems = EVENTS_PAGE_SIZE, tagIds, host }) => {
    const empty = { events: [], isDone: true, continueCursor: null } as const;
    if (!(await optionalProfile(ctx))) return empty;
    const pageSize = Math.min(
      Math.max(1, Math.floor(numItems)),
      MAX_EVENTS_PAGE_SIZE
    );
    const decodedCursor = decodeListBySubgroupCursor(cursor);
    const matches = (event: Doc<"events">) =>
      eventMatchesListFilter(event, subgroup, { tagIds, host });
    const page: Doc<"events">[] = [];
    const remainingBufferedIds: Id<"events">[] = [];
    for (const rawEventId of decodedCursor.bufferedIds) {
      const eventId = ctx.db.normalizeId("events", rawEventId);
      if (!eventId) continue;
      const event = await ctx.db.get(eventId);
      if (!event) continue;
      if (!matches(event)) continue;
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
        if (!matches(event)) continue;
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
        attendanceCount: await eventAttendanceCount(ctx, event),
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
    weekly: v.optional(weeklyMarkArg),
  },
  handler: async (ctx, { name, dateStart, dateEnd, subgroups, tagIds, weekly }) => {
    const { email } = await requireProfile(ctx);
    const eventFields = await validateEventFields(ctx, {
      name,
      dateStart,
      dateEnd,
      subgroups,
      tagIds,
      weekly,
    });
    const eventId = await ctx.db.insert("events", eventFields);
    await startEventAttendanceCount(ctx, eventId);
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
    await scheduleRank(ctx, { _id: eventId, dateStart: eventFields.dateStart });
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
    weekly: v.optional(v.union(v.null(), weeklyMarkArg)),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { eventId, name, dateStart, dateEnd, subgroups, tagIds, weekly }
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
      weekly: weekly === undefined ? existing.weekly : weekly,
    });
    await ctx.db.patch(eventId, eventFields);
    if (rankingInputsChanged(existing, { ...existing, ...eventFields })) {
      await scheduleRank(ctx, { _id: eventId, dateStart: eventFields.dateStart });
    }
    const changes: string[] = [];
    if (existing.name !== eventFields.name) changes.push("name");
    if (existing.dateStart !== eventFields.dateStart) changes.push("start date");
    if (existing.dateEnd !== eventFields.dateEnd) changes.push("end date");
    if (existing.subgroups.join() !== eventFields.subgroups.join())
      changes.push("sub-groups");
    if ((existing.tagIds ?? []).join() !== (eventFields.tagIds ?? []).join())
      changes.push("tags");
    if (JSON.stringify(existing.weekly ?? null) !== JSON.stringify(eventFields.weekly ?? null))
      changes.push("term and week");
    if (changes.length) {
      await logAttendanceAction(ctx, {
        actorEmail: email,
        entityType: "event",
        action: "event.update",
        summary: `Updated event ${auditEventName(eventFields)}`,
        eventId,
        detail: `Changed: ${changes.join(", ")}`,
      });
    }
    return null;
  },
});

const attendeesToList = async (
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  rows: Doc<"attendance">[]
) => {
  const year = eventStaffYear(event.dateStart);
  const listed = rows
    .slice()
    .sort((a, b) => b.signInTime - a.signInTime)
    .slice(0, MAX_AUDIT_ATTENDANCE_LINES);
  const people = [];
  for (const row of listed) {
    const member = await ctx.db.get(row.memberId);
    const name = member ? (await memberAuditName(ctx, member, year)).name : "Deleted member";
    people.push({ attendanceId: row._id, name, signInTime: row.signInTime });
  }
  return people;
};

export const deletePreview = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    if (!(await optionalProfile(ctx))) return null;
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    return { total: rows.length, people: await attendeesToList(ctx, event, rows) };
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
    const people = await attendeesToList(ctx, event, rows);
    for (const row of rows) await ctx.db.delete(row._id);
    const checkIns = await ctx.db
      .query("checkInRequests")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", eventId))
      .collect();
    for (const request of checkIns) await ctx.db.delete(request._id);
    await deleteEventAttendanceCount(ctx, eventId);
    await deleteRollCallOrder(ctx, eventId);
    await ctx.db.delete(eventId);
    const hidden = rows.length - people.length;
    await logAttendanceAction(ctx, {
      actorEmail: email,
      entityType: "event",
      action: "event.delete",
      summary: `Deleted event ${auditEventName(event)}`,
      eventId,
      detail: rows.length
        ? [
            `Removed ${rows.length} attendance record${rows.length === 1 ? "" : "s"}:`,
            ...people.map((p) => `${p.name} · ${auditStamp(p.signInTime)}`),
            ...(hidden > 0 ? [`and ${hidden} more`] : []),
          ].join("\n")
        : "Removed no attendance records",
    });
    return null;
  },
});
