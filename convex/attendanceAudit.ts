import { paginator } from "convex-helpers/server/pagination";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { staffYearForDate } from "../shared/flow";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, query } from "./_generated/server";
import { displayName, optionalProfile } from "./model";
import schema from "./schema";

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

const MAX_ROWS_SCANNED_PER_CALL = 2000;

const asPaginatorCursor = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    return Array.isArray(JSON.parse(value)) ? value : null;
  } catch {
    return null;
  }
};

export const list = query({
  args: {
    search: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    actorEmails: v.optional(v.array(v.string())),
    eventId: v.optional(v.id("events")),
    eventIds: v.optional(v.array(v.id("events"))),
    entityType: v.optional(entityTypeValidator),
    entityTypes: v.optional(v.array(entityTypeValidator)),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const eventIds = args.eventIds?.length
      ? args.eventIds
      : args.eventId
        ? [args.eventId]
        : [];
    const actorEmails = args.actorEmails?.length
      ? args.actorEmails
      : args.actorEmail
        ? [args.actorEmail]
        : [];
    const entityTypes = args.entityTypes?.length
      ? args.entityTypes
      : args.entityType
        ? [args.entityType]
        : [];
    const search = args.search?.trim().toLowerCase();
    const { numItems } = args.paginationOpts;
    const eventIdSet = new Set(eventIds);
    const actorEmailSet = new Set(actorEmails);
    const entityTypeSet = new Set(entityTypes);

    const indexed = () => {
      const q = paginator(ctx.db, schema).query("attendanceAuditLog");
      if (eventIds.length === 1)
        return q.withIndex("by_event", (i) => i.eq("eventId", eventIds[0]));
      if (actorEmails.length === 1)
        return q.withIndex("by_actor", (i) => i.eq("actorEmail", actorEmails[0]));
      return q;
    };
    const matchesResidual = (r: {
      actorEmail: string;
      entityType: string;
      eventId?: Id<"events">;
      summary: string;
      subjectEmail?: string;
    }) =>
      (actorEmailSet.size === 0 || actorEmailSet.has(r.actorEmail)) &&
      (entityTypeSet.size === 0 || entityTypeSet.has(r.entityType as AuditEntityType)) &&
      (eventIdSet.size === 0 || (r.eventId != null && eventIdSet.has(r.eventId))) &&
      (!search ||
        r.summary.toLowerCase().includes(search) ||
        r.actorEmail.toLowerCase().includes(search) ||
        (r.subjectEmail?.toLowerCase().includes(search) ?? false));

    const matched: Doc<"attendanceAuditLog">[] = [];
    let cursor = asPaginatorCursor(args.paginationOpts.cursor);
    let isDone = false;
    let scanned = 0;
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

export const filterOptions = query({
  args: {},
  handler: async (ctx) => {
    if (!(await optionalProfile(ctx))) return { actors: [], events: [] };

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
