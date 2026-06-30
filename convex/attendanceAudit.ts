import { paginationOptsValidator } from "convex/server";
import { paginator } from "convex-helpers/server/pagination";
import { v } from "convex/values";
import { staffYearForDate } from "../shared/flow";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, query } from "./_generated/server";
import { displayName, optionalProfile } from "./model";
import schema from "./schema";

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

// Safety bound on how many underlying rows a single list() call will read while
// hunting for `numItems` matches, so a sparse filter can't scan unbounded rows
// in one call. If hit before the page fills, we return what we have with a live
// cursor and the client resumes — completeness is preserved across calls.
const MAX_ROWS_SCANNED_PER_CALL = 2000;

/**
 * Paginated, filterable, searchable audit feed for the Attendance → Audit tab.
 * Visible to any signed-in staff member. Newest first.
 *
 * Reads the most selective index for the active filter (`by_event` when an event
 * is chosen, else `by_actor` when only an actor is, else the default order) and
 * walks it with convex-helpers' `paginator`, applying every other dimension — a
 * residual `actorEmail` alongside an `eventId`, the `entityType`, and free-text
 * `search` — in TypeScript (Convex queries should not use `.filter()`). It
 * accumulates matches page-by-page until it has `numItems` of them or the index
 * is exhausted, so combining filters always matches the UI selection and no
 * matching row is ever skipped.
 *
 * `paginator` (not the built-in `ctx.db...paginate()`) because a single Convex
 * function may call the built-in `.paginate()` only ONCE: a sparse filter forces
 * this accumulation loop to scan several pages, which threw "ran multiple
 * paginated queries" and crashed the Audit tab. Same pattern as
 * `events.listBySubgroup`.
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
    const { numItems } = args.paginationOpts;

    // A fresh paginator for the active filter's most selective index (query
    // builders are single-use, so we rebuild it each pagination step).
    const indexed = () => {
      const q = paginator(ctx.db, schema).query("attendanceAuditLog");
      if (eventId) return q.withIndex("by_event", (i) => i.eq("eventId", eventId));
      if (actorEmail)
        return q.withIndex("by_actor", (i) => i.eq("actorEmail", actorEmail));
      return q;
    };
    const matchesResidual = (r: {
      actorEmail: string;
      entityType: string;
      summary: string;
    }) =>
      (!actorEmail || r.actorEmail === actorEmail) &&
      (!entityType || r.entityType === entityType) &&
      (!search ||
        r.summary.toLowerCase().includes(search) ||
        r.actorEmail.toLowerCase().includes(search));

    const matched: Doc<"attendanceAuditLog">[] = [];
    let cursor = args.paginationOpts.cursor;
    let isDone = false;
    let scanned = 0;
    // Walk the index page-by-page until we have `numItems` matches or the index
    // is exhausted. `paginator` (unlike the built-in `.paginate()`) may be
    // called repeatedly in one query, so the loop is safe.
    while (matched.length < numItems) {
      const batch = await indexed()
        .order("desc")
        .paginate({ numItems: numItems - matched.length, cursor: cursor ?? null });
      for (const r of batch.page) if (matchesResidual(r)) matched.push(r);
      scanned += batch.page.length;
      cursor = batch.continueCursor;
      if (batch.isDone) {
        isDone = true;
        break;
      }
      if (scanned >= MAX_ROWS_SCANNED_PER_CALL) break;
    }
    const rows = matched;
    const continueCursor = isDone ? "" : cursor;

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
