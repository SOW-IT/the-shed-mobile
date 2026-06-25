import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { staffYearForDate } from "../shared/flow";
import { Id } from "./_generated/dataModel";
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

// The list reads newest-first from the most selective index, bounded to this
// many recent rows; residual filters and free-text search are applied in code.
const AUDIT_SCAN_LIMIT = 1000;

/**
 * Paginated, filterable, searchable audit feed for the Attendance → Audit tab.
 * Visible to any signed-in staff member. Newest first.
 *
 * Reads the most selective index for the active filter (`by_event` when an event
 * is chosen, else `by_actor` when only an actor is, else the default order),
 * bounded to the most recent {@link AUDIT_SCAN_LIMIT} rows. Every other
 * dimension — a residual `actorEmail` alongside an `eventId`, the `entityType`,
 * and free-text `search` — is then narrowed in TypeScript (Convex queries should
 * not use `.filter()`), so combining filters always matches the UI selection.
 * Pagination is a numeric offset cursor over the filtered rows, mirroring
 * `attendanceMembers.list`.
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

    const scanned = eventId
      ? await ctx.db
          .query("attendanceAuditLog")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .order("desc")
          .take(AUDIT_SCAN_LIMIT)
      : actorEmail
        ? await ctx.db
            .query("attendanceAuditLog")
            .withIndex("by_actor", (q) => q.eq("actorEmail", actorEmail))
            .order("desc")
            .take(AUDIT_SCAN_LIMIT)
        : await ctx.db
            .query("attendanceAuditLog")
            .order("desc")
            .take(AUDIT_SCAN_LIMIT);

    // Residual narrowing in code: `actorEmail` is applied even when `by_event`
    // is the chosen index, so the Event + Performed-by filters combine.
    const matched = scanned.filter(
      (r) =>
        (!actorEmail || r.actorEmail === actorEmail) &&
        (!entityType || r.entityType === entityType) &&
        (!search ||
          r.summary.toLowerCase().includes(search) ||
          r.actorEmail.toLowerCase().includes(search))
    );

    const start = args.paginationOpts.cursor
      ? Number(args.paginationOpts.cursor)
      : 0;
    const end = start + args.paginationOpts.numItems;
    const rows = matched.slice(start, end);
    const isDone = end >= matched.length;
    const continueCursor = isDone ? "" : String(end);

    // Resolve each distinct actor's display name once (looked up against the
    // current staff year — close enough for a label), then label the rows.
    const year = staffYearForDate(new Date());
    const nameByActor: Record<string, string> = {};
    for (const email of new Set(rows.map((r) => r.actorEmail))) {
      nameByActor[email] = await displayName(ctx, email, year);
    }
    const page = rows.map((row) => ({
      id: row._id,
      at: row._creationTime,
      actorEmail: row.actorEmail,
      actorName: nameByActor[row.actorEmail],
      entityType: row.entityType,
      action: row.action,
      summary: row.summary,
      eventId: row.eventId ?? null,
      detail: row.detail ?? null,
    }));

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
