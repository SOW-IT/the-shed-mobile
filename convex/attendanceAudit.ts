import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { staffYearForDate } from "../shared/flow";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, query } from "./_generated/server";
import { displayName, optionalProfile } from "./model";

/** The coarse subject kinds an audit row can describe (mirrors the schema). */
export type AuditEntityType =
  | "event"
  | "member"
  | "tag"
  | "metadata"
  | "attendance";

const entityTypeValidator = v.union(
  v.literal("event"),
  v.literal("member"),
  v.literal("tag"),
  v.literal("metadata"),
  v.literal("attendance")
);

/**
 * Append one immutable audit row (timestamp = _creationTime). A plain helper —
 * called directly from the attendance mutations, mirroring `logEvent` in
 * convex/requests.ts. Rows are never updated or deleted, so `summary` should
 * snapshot any names it references in case the subject is later removed.
 */
export async function logAttendanceAction(
  ctx: MutationCtx,
  entry: {
    actorEmail: string;
    entityType: AuditEntityType;
    action: string;
    summary: string;
    eventId?: Id<"events">;
    memberId?: Id<"attendanceMembers">;
    subjectEmail?: string;
    detail?: string;
  }
): Promise<void> {
  await ctx.db.insert("attendanceAuditLog", entry);
}

// Free-text search scans at most this many of the most-recent matching rows.
// More than enough for an audit convenience search; keeps the read bounded.
const SEARCH_SCAN_LIMIT = 1000;

/**
 * Paginated, filterable, searchable audit feed for the Attendance → Audit tab.
 * Visible to any signed-in staff member. Newest first.
 *
 * Browse/filter (no `search`) uses Convex cursor pagination over the most
 * specific index for the active filter. Free-text `search` instead scans the
 * most-recent {@link SEARCH_SCAN_LIMIT} matching rows and paginates them with a
 * numeric offset cursor (same approach as `attendanceMembers.list`), so a query
 * that filters most rows out still returns full pages.
 */
export const list = query({
  args: {
    search: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    entityType: v.optional(entityTypeValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const { eventId, actorEmail, entityType } = args;
    const search = args.search?.trim().toLowerCase();

    // The most specific index for the active filter, newest-first, with the
    // optional entity-type narrowing applied in the query.
    const base = eventId
      ? ctx.db
          .query("attendanceAuditLog")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
      : actorEmail
        ? ctx.db
            .query("attendanceAuditLog")
            .withIndex("by_actor", (q) => q.eq("actorEmail", actorEmail))
        : ctx.db.query("attendanceAuditLog");
    const ordered = base
      .order("desc")
      .filter((q) =>
        entityType ? q.eq(q.field("entityType"), entityType) : true
      );

    let rows: Doc<"attendanceAuditLog">[];
    let isDone: boolean;
    let continueCursor: string;

    if (search) {
      const scanned = await ordered.take(SEARCH_SCAN_LIMIT);
      const matched = scanned.filter(
        (r) =>
          r.summary.toLowerCase().includes(search) ||
          r.actorEmail.toLowerCase().includes(search)
      );
      const start = args.paginationOpts.cursor
        ? Number(args.paginationOpts.cursor)
        : 0;
      const end = start + args.paginationOpts.numItems;
      rows = matched.slice(start, end);
      isDone = end >= matched.length;
      continueCursor = isDone ? "" : String(end);
    } else {
      const result = await ordered.paginate(args.paginationOpts);
      rows = result.page;
      isDone = result.isDone;
      continueCursor = result.continueCursor;
    }

    // Resolve actor display names once per distinct actor in the page. Names are
    // looked up against the current staff year — close enough for a label.
    const year = staffYearForDate(new Date());
    const names = new Map<string, string>();
    const page = await Promise.all(
      rows.map(async (row) => {
        let actorName = names.get(row.actorEmail);
        if (actorName === undefined) {
          actorName = await displayName(ctx, row.actorEmail, year);
          names.set(row.actorEmail, actorName);
        }
        return {
          id: row._id,
          at: row._creationTime,
          actorEmail: row.actorEmail,
          actorName,
          entityType: row.entityType,
          action: row.action,
          summary: row.summary,
          eventId: row.eventId ?? null,
          detail: row.detail ?? null,
        };
      })
    );

    return { page, isDone, continueCursor };
  },
});

/**
 * The distinct actors and recent events present in the log, to populate the
 * Audit tab's filter dropdowns.
 */
export const filterOptions = query({
  args: {},
  handler: async (ctx) => {
    if (!(await optionalProfile(ctx))) return { actors: [], events: [] };

    // Cap the scan: the dropdowns only need the people/events seen recently.
    const recent = await ctx.db
      .query("attendanceAuditLog")
      .order("desc")
      .take(1000);

    const year = staffYearForDate(new Date());
    const actorEmails = [...new Set(recent.map((r) => r.actorEmail))];
    const actors = await Promise.all(
      actorEmails.map(async (email) => ({
        email,
        name: await displayName(ctx, email, year),
      }))
    );
    actors.sort((a, b) => a.name.localeCompare(b.name));

    const eventIds = [
      ...new Set(recent.flatMap((r) => (r.eventId ? [r.eventId] : []))),
    ];
    const events = (
      await Promise.all(eventIds.map((id) => ctx.db.get(id)))
    )
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .map((e) => ({ id: e._id, name: e.name, dateStart: e.dateStart }))
      .sort((a, b) => b.dateStart - a.dateStart);

    return { actors, events };
  },
});
