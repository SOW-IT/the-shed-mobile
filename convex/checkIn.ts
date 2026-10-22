import { ConvexError, v } from "convex/values";
import { CAMPUS_FIELD_KEY, resolveUniversity, STUDENT_YEAR_FIELD_KEY } from "../shared/attendanceMemberMeta";
import { commencementForLevel, isCheckInYearLevel } from "../shared/checkInMatch";
import { checkInOpen, checkInPhase, checkInWindow } from "../shared/checkInWindow";
import { eventStaffYear, sydneyCalendarYear } from "../shared/flow";
import { capitalizeMemberName, isOrgWideSubgroup, subgroupLabel } from "../shared/rollcall";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { signInMember, signOutMember } from "./attendance";
import { logAttendanceAction } from "./attendanceAudit";
import { withMarkedRole } from "../shared/memberRole";
import { allMetadataFields, staffDisplayName } from "./attendanceMembers";
import { optionalEmail, optionalProfile, optionalUser, requireEmail, requireProfile } from "./model";
import { assignedProfileForEmail, knownMemberId, personName, staffMemberForEmail } from "./staffMembers";

export { checkInOpen, checkInPhase, checkInWindow };

const NAME_MIN = 2;
const NAME_MAX = 80;
const PENDING_LIMIT = 300;
const MATCH_PROBE = 5;
const UNIVERSITY_LIMIT = 50;
const DEVICE_PROBE = 20;
export const SELF_CHECK_IN_ACTOR = "system:self-check-in";

type Ctx = QueryCtx | MutationCtx;

const eventForToken = async (ctx: Ctx, token: string) => {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const event = await ctx.db
    .query("events")
    .withIndex("by_checkIn_token", (q) => q.eq("checkIn.token", trimmed))
    .unique();
  return event?.checkIn?.token === trimmed ? event : null;
};

const openEventForToken = async (ctx: Ctx, token: string) => {
  const event = await eventForToken(ctx, token);
  if (!event) throw new ConvexError("This check-in link isn't valid any more.");
  if (!checkInOpen(event)) throw new ConvexError("Check-in for this event is closed.");
  return event;
};

const campusesOf = (event: Doc<"events">): string[] =>
  event.subgroups.filter((subgroup) => !isOrgWideSubgroup(subgroup));

const campusChoices = async (ctx: Ctx, event: Doc<"events">): Promise<string[]> => {
  const own = campusesOf(event);
  if (own.length > 0) return own;
  const universities = await ctx.db
    .query("universities")
    .withIndex("by_year_and_name", (q) => q.eq("year", eventStaffYear(event.dateStart)))
    .take(UNIVERSITY_LIMIT);
  return universities.map((u) => u.name);
};

const calendarYearOf = (event: Doc<"events">) => sydneyCalendarYear(new Date(event.dateStart));

const newMemberMetadata = async (
  ctx: MutationCtx,
  request: Doc<"checkInRequests">,
  event: Doc<"events">
): Promise<Record<string, string> | undefined> => {
  const fields = await allMetadataFields(ctx);
  const metadata: Record<string, string> = {};
  const campusField = fields.find((f) => f.key === CAMPUS_FIELD_KEY);
  const campusOption = campusField
    ? Object.entries(campusField.values ?? {}).find(([, label]) => label === request.campus)?.[0]
    : undefined;
  if (campusField && campusOption) metadata[campusField._id] = campusOption;
  const yearField = fields.find((f) => f.key === STUDENT_YEAR_FIELD_KEY);
  if (yearField && request.yearLevel && isCheckInYearLevel(request.yearLevel)) {
    metadata[yearField._id] = String(commencementForLevel(request.yearLevel, calendarYearOf(event)));
  }
  if (Object.keys(metadata).length === 0) return undefined;
  return withMarkedRole(fields, metadata, undefined);
};

const attendanceOf = (ctx: Ctx, eventId: Id<"events">, memberId: Id<"attendanceMembers">) =>
  ctx.db
    .query("attendance")
    .withIndex("by_event_and_member", (q) => q.eq("eventId", eventId).eq("memberId", memberId))
    .unique();

const viewerFor = async (ctx: QueryCtx, event: Doc<"events">) => {
  const email = await optionalEmail(ctx);
  const user = await optionalUser(ctx);
  if (!email && !user) return null;
  const profile = email ? await assignedProfileForEmail(ctx, email, eventStaffYear(event.dateStart)) : null;
  if (!profile) return { leader: false, eventId: null, name: personName(user?.name), signedIn: false };
  const memberId = await knownMemberId(ctx, profile);
  const member = memberId ? await ctx.db.get("attendanceMembers", memberId) : null;
  return {
    leader: true,
    eventId: event._id,
    name: staffDisplayName(profile, member?.name),
    signedIn: memberId ? (await attendanceOf(ctx, event._id, memberId)) !== null : false,
  };
};

const stillSignedIn = async (ctx: Ctx, request: Doc<"checkInRequests">) =>
  !!request.memberId && (await attendanceOf(ctx, request.eventId, request.memberId)) !== null;

const trustedRequests = (ctx: Ctx, clientKey: string, limit: number) =>
  ctx.db
    .query("checkInRequests")
    .withIndex("by_clientKey_and_status_and_forSomeoneElse", (q) =>
      q.eq("clientKey", clientKey).eq("status", "confirmed").eq("forSomeoneElse", undefined)
    )
    .order("desc")
    .take(limit);

const memberKnownToDevice = async (ctx: Ctx, clientKey: string, name: string) => {
  for (const request of await trustedRequests(ctx, clientKey, DEVICE_PROBE)) {
    if (!(await stillSignedIn(ctx, request))) continue;
    const member = await ctx.db.get("attendanceMembers", request.memberId!);
    if (member && (request.name === name || capitalizeMemberName(member.name) === name)) return member._id;
  }
  return null;
};

const deviceRequests = (ctx: Ctx, eventId: Id<"events">, clientKey: string, name: string) =>
  ctx.db
    .query("checkInRequests")
    .withIndex("by_event_and_clientKey_and_name", (q) =>
      q.eq("eventId", eventId).eq("clientKey", clientKey).eq("name", name)
    )
    .order("desc")
    .take(DEVICE_PROBE);

const typedName = (raw: string) => capitalizeMemberName(raw.trim().replace(/\s+/g, " "));

const deviceKey = (raw: string) => raw.trim().slice(0, 64);

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
      calendarYear: calendarYearOf(event),
      universities: (await campusChoices(ctx, event)).map((value) => ({ value, label: subgroupLabel(value) })),
      open: checkInOpen(event),
      phase: checkInPhase(event),
      opensAt,
      closesAt,
      viewer: await viewerFor(ctx, event),
    };
  },
});

export const submit = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    campus: v.optional(v.string()),
    yearLevel: v.optional(v.string()),
    forSomeoneElse: v.optional(v.boolean()),
    clientKey: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await openEventForToken(ctx, args.token);
    const name = typedName(args.name);
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw new ConvexError("Please enter your full name.");
    }
    const clientKey = deviceKey(args.clientKey);
    if (!clientKey) throw new ConvexError("Please reload the page and try again.");
    const campuses = await campusChoices(ctx, event);
    const campus = args.campus?.trim() || (campuses.length === 1 ? campuses[0] : undefined);
    if (campus && !campuses.includes(campus)) throw new ConvexError("Pick a campus from the list.");
    const yearLevel = args.yearLevel?.trim() || undefined;
    if (yearLevel && !isCheckInYearLevel(yearLevel)) throw new ConvexError("Pick your year from the list.");

    const forSomeoneElse = args.forSomeoneElse === true;
    let turnedAwayHere = false;
    for (const earlier of await deviceRequests(ctx, event._id, clientKey, name)) {
      if (earlier.status === "pending") return { status: "pending" as const, automatic: false };
      if (earlier.status === "confirmed" && (await stillSignedIn(ctx, earlier))) {
        return { status: "confirmed" as const, automatic: false };
      }
      if (earlier.status === "confirmed") {
        await ctx.db.patch("checkInRequests", earlier._id, { status: "dismissed", decidedAt: Date.now() });
      }
      turnedAwayHere = true;
    }

    const known = forSomeoneElse || turnedAwayHere ? null : await memberKnownToDevice(ctx, clientKey, name);
    if (known) {
      const now = Date.now();
      const already = await attendanceOf(ctx, event._id, known);
      const attendanceId = already?._id ?? (await signInMember(ctx, event, known, SELF_CHECK_IN_ACTOR, now));
      await ctx.db.insert("checkInRequests", {
        eventId: event._id,
        clientKey,
        name,
        campus,
        ...(yearLevel ? { yearLevel } : {}),
        memberId: known,
        ...(already ? {} : { attendanceId }),
        status: "confirmed",
        requestedAt: now,
        decidedAt: now,
        decidedBy: SELF_CHECK_IN_ACTOR,
      });
      return { status: "confirmed" as const, automatic: !already };
    }

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
    const fields = await ctx.db.query("attendanceMetadata").take(200);
    const only = candidates.length === 1 ? candidates[0] : undefined;
    const onlyCampus = only ? resolveUniversity(fields, only.metadata) : undefined;
    const memberId = only && (!campus || !onlyCampus || onlyCampus === campus) ? only._id : undefined;
    await ctx.db.insert("checkInRequests", {
      eventId: event._id,
      clientKey,
      name,
      campus,
      ...(yearLevel ? { yearLevel } : {}),
      ...(forSomeoneElse ? { forSomeoneElse } : {}),
      memberId,
      ...(!memberId && candidates.length > 0 ? { sameNameCount: candidates.length } : {}),
      status: "pending",
      requestedAt: Date.now(),
    });
    return { status: "pending" as const, automatic: false };
  },
});

export const mine = query({
  args: { token: v.string(), clientKey: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const event = await eventForToken(ctx, args.token);
    const clientKey = deviceKey(args.clientKey);
    if (!event || !clientKey) return null;
    const [latest] = await deviceRequests(ctx, event._id, clientKey, typedName(args.name));
    if (!latest) return null;
    if (latest.status === "confirmed" && !(await stillSignedIn(ctx, latest))) return "dismissed" as const;
    return latest.status;
  },
});

export const returning = query({
  args: { token: v.string(), clientKey: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const event = await eventForToken(ctx, args.token);
    const clientKey = deviceKey(args.clientKey);
    const name = typedName(args.name);
    if (!event || !clientKey || name.length < NAME_MIN) return false;
    return (await memberKnownToDevice(ctx, clientKey, name)) !== null;
  },
});

export const undoMine = mutation({
  args: { token: v.string(), clientKey: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const event = await eventForToken(ctx, args.token);
    if (!event) throw new ConvexError("This check-in link isn't valid any more.");
    const clientKey = deviceKey(args.clientKey);
    const requests = await deviceRequests(ctx, event._id, clientKey, typedName(args.name));
    const automatic = requests.find((r) => r.status === "confirmed" && r.decidedBy === SELF_CHECK_IN_ACTOR);
    const memberId = automatic?.memberId;
    if (!automatic || !memberId || !automatic.attendanceId) return false;
    const current = await attendanceOf(ctx, event._id, memberId);
    if (current?._id !== automatic.attendanceId) return false;
    await signOutMember(ctx, event._id, event, memberId, SELF_CHECK_IN_ACTOR);
    await ctx.db.patch("checkInRequests", automatic._id, { status: "dismissed", decidedAt: Date.now() });
    for (const request of await trustedRequests(ctx, clientKey, PENDING_LIMIT)) {
      if (request.memberId === memberId) {
        await ctx.db.patch("checkInRequests", request._id, { forSomeoneElse: true });
      }
    }
    return true;
  },
});

export const signInLeader = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const event = await openEventForToken(ctx, args.token);
    const staff = await staffMemberForEmail(ctx, email, eventStaffYear(event.dateStart), email);
    if (!staff) throw new ConvexError("Only leaders can sign themselves in. Fill in the form instead.");
    const already = (await attendanceOf(ctx, event._id, staff.memberId)) !== null;
    if (!already) await signInMember(ctx, event, staff.memberId, email);
    const member = await ctx.db.get("attendanceMembers", staff.memberId);
    return { name: staffDisplayName(staff.profile, member?.name), alreadySignedIn: already };
  },
});

export const signOutLeader = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const event = await eventForToken(ctx, args.token);
    if (!event) throw new ConvexError("This check-in link isn't valid any more.");
    const profile = await assignedProfileForEmail(ctx, email, eventStaffYear(event.dateStart));
    const memberId = profile ? await knownMemberId(ctx, profile) : null;
    if (!memberId) return false;
    return await signOutMember(ctx, event._id, event, memberId, email);
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
        const signedIn = member ? (await attendanceOf(ctx, args.eventId, member._id)) !== null : false;
        const choices =
          !member && (row.sameNameCount ?? 0) > 0
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
          yearLevel: row.yearLevel ?? null,
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

const signInRequest = async (
  ctx: MutationCtx,
  request: Doc<"checkInRequests">,
  event: Doc<"events">,
  memberId: Id<"attendanceMembers">,
  email: string
) => {
  const attendanceId = await signInMember(ctx, event, memberId, email, request.requestedAt);
  await ctx.db.patch("checkInRequests", request._id, {
    status: "confirmed",
    memberId,
    attendanceId,
    decidedAt: Date.now(),
    decidedBy: email,
  });
  return attendanceId;
};

export const confirm = mutation({
  args: {
    requestId: v.id("checkInRequests"),
    memberId: v.optional(v.id("attendanceMembers")),
    asNew: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const { request, event } = await pendingRequest(ctx, args.requestId);
    if (!args.asNew && !args.memberId && !request.memberId && (request.sameNameCount ?? 0) > 0) {
      throw new ConvexError(`A member is already called ${request.name}. Pick them, or add a new member.`);
    }
    let memberId = args.asNew ? undefined : (args.memberId ?? request.memberId);
    if (memberId && !(await ctx.db.get("attendanceMembers", memberId))) memberId = undefined;
    if (!memberId) {
      const metadata = await newMemberMetadata(ctx, request, event);
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
    const attendanceId = await signInRequest(ctx, request, event, memberId, email);
    return { attendanceId, memberId };
  },
});

export const confirmMatched = mutation({
  args: { requestIds: v.array(v.id("checkInRequests")) },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    if (args.requestIds.length > PENDING_LIMIT) throw new ConvexError("Confirm fewer at once.");
    let confirmed = 0;
    for (const requestId of new Set(args.requestIds)) {
      const request = await ctx.db.get("checkInRequests", requestId);
      if (request?.status !== "pending" || !request.memberId) continue;
      const event = await ctx.db.get("events", request.eventId);
      const member = await ctx.db.get("attendanceMembers", request.memberId);
      if (!event || !member) continue;
      await signInRequest(ctx, request, event, member._id, email);
      confirmed++;
    }
    return { confirmed };
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
