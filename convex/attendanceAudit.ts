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

/**
 * Paginated, filterable, searchable audit feed for the Attendance → Audit tab.
 * Visible to any signed-in staff member. Newest first.
 *
 * Reads the most selective index for the active filter (`by_event` when an event
 * is chosen, else `by_actor` when only an actor is, else the default order) and
 * paginates it ONCE with Convex cursor pagination, then applies every other
 * dimension — a residual `actorEmail` alongside an `eventId`, the `entityType`,
 * and free-text `search` — in TypeScript (Convex queries should not use
 * `.filter()`). Convex permits only a single `.paginate()` per query, so a
 * filtered page may return fewer than `numItems` rows (the ones that matched
 * this page); `isDone`/`continueCursor` come straight from the underlying page,
 * and the client keeps requesting pages via "Load more" until `isDone`. No
 * matching row is ever skipped — narrow filters just spread matches across more
 * pages.
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

    // The active filter's most selective index.
    const indexed = () => {
      const q = ctx.db.query("attendanceAuditLog");
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

    // Convex allows only ONE `.paginate()` per query, so paginate a single page
    // off the index and filter it in memory. A narrow filter may leave few (or
    // zero) matches on a page; the client paginates with "Load more" until the
    // index is exhausted (`isDone`), so nothing is skipped. (Previously this
    // looped `.paginate()` to fill `numItems`, which threw "ran multiple
    // paginated queries" the moment a filter narrowed the first page.)
    const result = await indexed().order("desc").paginate(args.paginationOpts);
    const rows = result.page.filter(matchesResidual);
    const isDone = result.isDone;
    const continueCursor = result.continueCursor;

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
