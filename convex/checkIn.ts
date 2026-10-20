import { ConvexError, v } from "convex/values";
import { CAMPUS_FIELD_KEY, resolveUniversity } from "../shared/attendanceMemberMeta";
import {
  capitalizeMemberName,
  isOrgWideSubgroup,
  SIGN_IN_UNDO_GRACE_MS,
  subgroupLabel,
} from "../shared/rollcall";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { signInMember } from "./attendance";
import { logAttendanceAction } from "./attendanceAudit";
import { withMarkedRole } from "../shared/memberRole";
import { allMetadataFields } from "./attendanceMembers";
import { optionalProfile, requireProfile } from "./model";

const OPENS_BEFORE_MS = 2 * 60 * 60 * 1000;
const CLOSES_AFTER_MS = SIGN_IN_UNDO_GRACE_MS;
const NAME_MIN = 2;
const NAME_MAX = 80;
const PENDING_LIMIT = 300;
const MATCH_PROBE = 5;

type Ctx = QueryCtx | MutationCtx;

export const checkInWindow = (event: Pick<Doc<"events">, "dateStart" | "dateEnd">) => ({
  opensAt: event.dateStart - OPENS_BEFORE_MS,
  closesAt: event.dateEnd + CLOSES_AFTER_MS,
});

export const checkInOpen = (
  event: Pick<Doc<"events">, "dateStart" | "dateEnd">,
  now = Date.now()
): boolean => {
  const { opensAt, closesAt } = checkInWindow(event);
  return now >= opensAt && now <= closesAt;
};

export const checkInPhase = (
  event: Pick<Doc<"events">, "dateStart" | "dateEnd">,
  now = Date.now()
): "before" | "open" | "after" => {
  const { opensAt, closesAt } = checkInWindow(event);
  return now < opensAt ? "before" : now > closesAt ? "after" : "open";
};

const eventForToken = async (ctx: Ctx, token: string) => {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const event = await ctx.db
    .query("events")
    .withIndex("by_checkIn_token", (q) => q.eq("checkIn.token", trimmed))
    .unique();
  return event?.checkIn?.token === trimmed ? event : null;
};

const campusesOf = (event: Doc<"events">): string[] =>
  event.subgroups.filter((subgroup) => !isOrgWideSubgroup(subgroup));

const campusMetadata = async (
  ctx: MutationCtx,
  campus: string | undefined
): Promise<Record<string, string> | undefined> => {
  if (!campus) return undefined;
  const fields = await allMetadataFields(ctx);
  const field = fields.find((f) => f.key === CAMPUS_FIELD_KEY);
  const optionKey = field
    ? Object.entries(field.values ?? {}).find(([, label]) => label === campus)?.[0]
    : undefined;
  if (!field || !optionKey) return undefined;
  return withMarkedRole(fields, { [field._id]: optionKey }, undefined);
};

const newToken = (): string =>
  crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

export const page = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const event = await eventForToken(ctx, args.token);
    if (!event) return null;
    const { closesAt, opensAt } = checkInWindow(event);
    return {
      name: event.name,
      dateStart: event.dateStart,
      dateEnd: event.dateEnd,
      campuses: campusesOf(event).map((value) => ({ value, label: subgroupLabel(value) })),
      open: checkInOpen(event),
      phase: checkInPhase(event),
      opensAt,
      closesAt,
    };
  },
});

export const submit = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    campus: v.optional(v.string()),
    clientKey: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await eventForToken(ctx, args.token);
    if (!event) throw new ConvexError("This check-in link isn't valid any more.");
    if (!checkInOpen(event)) throw new ConvexError("Check-in for this event is closed.");
    const name = capitalizeMemberName(args.name.trim().replace(/\s+/g, " "));
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw new ConvexError("Please enter your full name.");
    }
    const clientKey = args.clientKey.trim().slice(0, 64);
    if (!clientKey) throw new ConvexError("Please reload the page and try again.");
    const campuses = campusesOf(event);
    const campus = args.campus?.trim() || (campuses.length === 1 ? campuses[0] : undefined);
    if (campus && !campuses.includes(campus)) throw new ConvexError("Pick a campus from the list.");

    const mine = await ctx.db
      .query("checkInRequests")
      .withIndex("by_event_and_clientKey", (q) => q.eq("eventId", event._id).eq("clientKey", clientKey))
      .take(10);
    const same = mine.find((r) => r.name === name && r.status !== "dismissed");
    if (same) return { status: same.status === "confirmed" ? ("confirmed" as const) : ("pending" as const) };

    const pending = await ctx.db
      .query("checkInRequests")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", event._id).eq("status", "pending"))
      .take(PENDING_LIMIT);
    if (pending.length >= PENDING_LIMIT) {
      throw new ConvexError("Lots of people are checking in right now. Please see a leader.");
    }

    const candidates = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_name", (q) => q.eq("name", name))
      .take(MATCH_PROBE);
    const memberId = candidates.length === 1 ? candidates[0]._id : undefined;
    await ctx.db.insert("checkInRequests", {
      eventId: event._id,
      clientKey,
      name,
      campus,
      memberId,
      ...(candidates.length > 1 ? { sameNameCount: candidates.length } : {}),
      status: "pending",
      requestedAt: Date.now(),
    });
    return { status: "pending" as const };
  },
});

export const status = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) return null;
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return null;
    return {
      token: event.checkIn?.token ?? null,
      enabledAt: event.checkIn?.enabledAt ?? null,
      open: checkInOpen(event),
      phase: checkInPhase(event),
      ...checkInWindow(event),
    };
  },
});

export const enable = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const event = await ctx.db.get("events", args.eventId);
    if (!event) throw new ConvexError("Event not found.");
    if (event.checkIn) return event.checkIn.token;
    const token = newToken();
    await ctx.db.patch("events", event._id, { checkIn: { token, enabledAt: Date.now(), enabledBy: email } });
    await logAttendanceAction(ctx, {
      actorEmail: email,
      entityType: "event",
      action: "event.checkInEnabled",
      summary: `Turned on self check-in for ${event.name}`,
      eventId: event._id,
    });
    return token;
  },
});

export const disable = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const event = await ctx.db.get("events", args.eventId);
    if (!event) throw new ConvexError("Event not found.");
    if (!event.checkIn) return null;
    await ctx.db.patch("events", event._id, { checkIn: undefined });
    await logAttendanceAction(ctx, {
      actorEmail: email,
      entityType: "event",
      action: "event.checkInDisabled",
      summary: `Turned off self check-in for ${event.name}`,
      eventId: event._id,
    });
    return null;
  },
});

export const pending = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) return null;
    const rows = await ctx.db
      .query("checkInRequests")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", args.eventId).eq("status", "pending"))
      .take(PENDING_LIMIT);
    rows.sort((a, b) => a.requestedAt - b.requestedAt);
    const fields = await ctx.db.query("attendanceMetadata").take(200);
    return await Promise.all(
      rows.map(async (row) => {
        const member = row.memberId ? await ctx.db.get("attendanceMembers", row.memberId) : null;
        const signedIn = member
          ? (await ctx.db
              .query("attendance")
              .withIndex("by_event_and_member", (q) => q.eq("eventId", args.eventId).eq("memberId", member._id))
              .unique()) !== null
          : false;
        const choices =
          !member && (row.sameNameCount ?? 0) > 1
            ? (
                await ctx.db
                  .query("attendanceMembers")
                  .withIndex("by_name", (q) => q.eq("name", row.name))
                  .take(MATCH_PROBE)
              ).map((m) => ({ memberId: m._id, campus: resolveUniversity(fields, m.metadata) ?? null }))
            : [];
        return {
          id: row._id,
          name: row.name,
          campus: row.campus ?? null,
          requestedAt: row.requestedAt,
          choices,
          match: member
            ? {
                memberId: member._id,
                name: member.name,
                campus: resolveUniversity(fields, member.metadata) ?? null,
                alreadySignedIn: signedIn,
              }
            : null,
        };
      })
    );
  },
});

const pendingRequest = async (ctx: MutationCtx, requestId: Id<"checkInRequests">) => {
  const request = await ctx.db.get("checkInRequests", requestId);
  if (!request) throw new ConvexError("That check-in has already been handled.");
  if (request.status !== "pending") throw new ConvexError("That check-in has already been handled.");
  const event = await ctx.db.get("events", request.eventId);
  if (!event) throw new ConvexError("Event not found.");
  return { request, event };
};

export const confirm = mutation({
  args: { requestId: v.id("checkInRequests"), memberId: v.optional(v.id("attendanceMembers")) },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const { request, event } = await pendingRequest(ctx, args.requestId);
    if (!args.memberId && !request.memberId && (request.sameNameCount ?? 0) > 1) {
      throw new ConvexError(`More than one member is called ${request.name}. Pick which one.`);
    }
    let memberId = args.memberId ?? request.memberId;
    if (memberId && !(await ctx.db.get("attendanceMembers", memberId))) memberId = undefined;
    if (!memberId) {
      const metadata = await campusMetadata(ctx, request.campus);
      memberId = await ctx.db.insert("attendanceMembers", {
        name: request.name,
        ...(metadata ? { metadata } : {}),
      });
      await logAttendanceAction(ctx, {
        actorEmail: email,
        entityType: "member",
        action: "member.create",
        summary: `Created member "${request.name}" from self check-in`,
        memberId,
      });
    }
    const attendanceId = await signInMember(ctx, event, memberId, email);
    await ctx.db.patch("checkInRequests", request._id, {
      status: "confirmed",
      memberId,
      decidedAt: Date.now(),
      decidedBy: email,
    });
    return { attendanceId, memberId };
  },
});

export const dismiss = mutation({
  args: { requestId: v.id("checkInRequests") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const { request } = await pendingRequest(ctx, args.requestId);
    await ctx.db.patch("checkInRequests", request._id, {
      status: "dismissed",
      decidedAt: Date.now(),
      decidedBy: email,
    });
    return null;
  },
});
