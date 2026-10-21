import { ConvexError, v } from "convex/values";
import {
  assignmentsOf,
  eventStaffYear,
  roleNeedsUniversity,
  staffYearForDate,
  staffYearStartMs,
  sydneyCalendarYear,
} from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  metadataSubtitle,
  resolveUniversity,
  ROLE_FIELD_KEY,
} from "../shared/attendanceMemberMeta";
import { auditEventName, canReverseSignIn, reversibleOnlyByGrace, compareAttendanceFrequency, memberMatchesEventCampus, normalizeSubgroups, personKey, subgroupMatches } from "../shared/rollcall";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query } from "./_generated/server";
import { optionalProfile, requireProfile } from "./model";
import { logAttendanceAction } from "./attendanceAudit";
import { adjustEventAttendanceCount } from "./attendanceCounts";
import { memberAuditName, staffDisplayName } from "./attendanceMembers";
import { memberRoleResolver } from "./memberRoles";
import { photoFor } from "./photo";
import { frequencyScores, rosterHistory } from "./rosterHistory";
import {
  assignedProfileForEmail,
  isAssigned,
  knownMemberId,
  staffMemberForEmail,
  staffProfileOfMember,
} from "./staffMembers";

export type RosterEntry = {
  key: string;
  kind: "staff" | "member";
  email?: string;
  memberId?: string;
  name: string;
  roles: string[];
  campuses: string[];
  university?: string;
  subtitle?: string;
  photo?: string | null;
};

/** A plain member's worked-out Role, then the rest of their details. */
const memberSubtitle = (role: string | undefined, details: string): string | undefined =>
  [role, details].filter(Boolean).join(" · ") || undefined;

export const roster = query({
  args: {
    year: v.number(),
    subgroup: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { year, subgroup, eventId }) => {
    if (!(await optionalProfile(ctx))) return [];
    const event = eventId ? await ctx.db.get(eventId) : null;
    const profileYear = event ? eventStaffYear(event.dateStart) : year;
    const memberYear = event
      ? sydneyCalendarYear(new Date(event.dateStart))
      : year;
    const eventFieldSubgroups = event ? normalizeSubgroups(event.subgroups) : [];
    const metadataFields = (await ctx.db.query("attendanceMetadata").collect())
      .filter((field) => {
        if (!field.subgroup) return true;
        if (event) {
          return eventFieldSubgroups.some((sg) =>
            subgroupMatches(field.subgroup!, sg)
          );
        }
        return !subgroup || subgroupMatches(field.subgroup, subgroup);
      })
      .sort((a, b) => a.order - b.order);

    const profiles = (
      await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", profileYear))
        .collect()
    ).filter(isAssigned);
    const members = await ctx.db.query("attendanceMembers").collect();
    const memberById = new Map(members.map((m) => [m._id, m]));
    const staffMemberIds = new Set(profiles.flatMap((p) => (p.memberId ? [p.memberId] : [])));
    const pureExtras = members.filter((m) => !staffMemberIds.has(m._id));
    const roleOf = await memberRoleResolver(ctx, metadataFields);

    const staffRows: RosterEntry[] = await Promise.all(profiles.map(async (p) => {
      const shadow = p.memberId ? memberById.get(p.memberId) : undefined;
      const assignments = assignmentsOf(p);
      const roles = [...new Set(assignments.map((a) => a.role))];
      const campuses = [
        ...new Set(
          assignments.flatMap((a) =>
            a.university && roleNeedsUniversity(a.role) ? [a.university] : []
          )
        ),
      ];
      const orgSubtitle = roles.length > 0 ? roles.join(" · ") : "";
      const metaSubtitle = metadataSubtitle(metadataFields, shadow?.metadata, memberYear, [ROLE_FIELD_KEY, CAMPUS_FIELD_KEY]);
      const subtitle = [orgSubtitle, metaSubtitle].filter(Boolean).join(" · ");
      const user = p.userId ? await ctx.db.get(p.userId) : null;
      return {
        key: personKey({ email: p.email }),
        kind: "staff" as const,
        email: p.email,
        memberId: shadow?._id,
        name: staffDisplayName(p, shadow?.name),
        roles,
        campuses,
        university: campuses[0] ?? resolveUniversity(metadataFields, shadow?.metadata, campuses),
        subtitle: subtitle || undefined,
        photo: await photoFor(ctx, user, p.email),
      };
    }));

    const extraRows: RosterEntry[] = pureExtras.map((m) => ({
      key: personKey({ memberId: m._id }),
      kind: "member" as const,
      memberId: m._id,
      name: m.name,
      roles: [],
      campuses: [],
      university: resolveUniversity(metadataFields, m.metadata),
      subtitle: memberSubtitle(roleOf(m).role, metadataSubtitle(metadataFields, m.metadata, memberYear, [CAMPUS_FIELD_KEY, ROLE_FIELD_KEY])),
    }));

    const rows = [...staffRows, ...extraRows];
    if (!event) return rows.sort((a, b) => a.name.localeCompare(b.name));

    const eventSubgroups = new Set(normalizeSubgroups(event.subgroups));
    const scores = frequencyScores(await rosterHistory(ctx, year), event);

    const scoreOf = (entry: RosterEntry) =>
      scores.get(entry.memberId ? `member:${entry.memberId}` : entry.key);
    return rows.sort((a, b) =>
      compareAttendanceFrequency(
        scoreOf(a),
        scoreOf(b),
        memberMatchesEventCampus(eventSubgroups, a),
        memberMatchesEventCampus(eventSubgroups, b),
        a.name,
        b.name
      )
    );
  },
});

export const listByEvent = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId: rawEventId }) => {
    if (!(await optionalProfile(ctx))) return [];
    const eventId = ctx.db.normalizeId("events", rawEventId);
    if (!eventId) return [];
    const event = await ctx.db.get(eventId);
    if (!event) return [];
    const profileYear = eventStaffYear(event.dateStart);
    const calendarYear = sydneyCalendarYear(new Date(event.dateStart));
    const fieldSubgroups = normalizeSubgroups(event.subgroups);
    const metadataFields = (await ctx.db.query("attendanceMetadata").collect())
      .filter(
        (field) =>
          fieldSubgroups.length === 0 ||
          !field.subgroup ||
          fieldSubgroups.some((sg) => subgroupMatches(field.subgroup!, sg))
      )
      .sort((a, b) => a.order - b.order);
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    const roleOf = await memberRoleResolver(ctx, metadataFields);

    const withNames = await Promise.all(
      rows.map(async (row) => {
        const member = await ctx.db.get(row.memberId);
        const profile = member ? await staffProfileOfMember(ctx, member._id, profileYear) : null;
        if (profile) {
          const email = profile.email.toLowerCase();
          const assignments = assignmentsOf(profile);
          const roles = [...new Set(assignments.map((assignment) => assignment.role))];
          const campuses = [
            ...new Set(
              assignments.flatMap((assignment) =>
                assignment.university && roleNeedsUniversity(assignment.role)
                  ? [assignment.university]
                  : []
              )
            ),
          ];
          const user = profile.userId ? await ctx.db.get(profile.userId) : null;
          return {
            ...row,
            email,
            name: staffDisplayName(profile, member?.name),
            kind: "staff" as const,
            roles,
            campuses,
            university: campuses[0] ?? resolveUniversity(metadataFields, member?.metadata, campuses),
            subtitle:
              metadataSubtitle(metadataFields, member?.metadata, calendarYear, [
                ROLE_FIELD_KEY,
                CAMPUS_FIELD_KEY,
              ]) || undefined,
            photo: await photoFor(ctx, user, email),
          };
        }
        return {
          ...row,
          email: undefined,
          name: member?.name ?? "Unknown",
          kind: "member" as const,
          roles: [],
          campuses: [],
          university: resolveUniversity(metadataFields, member?.metadata),
          subtitle: memberSubtitle(
            member ? roleOf(member).role : undefined,
            metadataSubtitle(metadataFields, member?.metadata, calendarYear, [CAMPUS_FIELD_KEY, ROLE_FIELD_KEY])
          ),
          photo: null,
        };
      })
    );
    const earliestByMember = new Map<Id<"attendanceMembers">, (typeof withNames)[number]>();
    for (const row of withNames) {
      const existing = earliestByMember.get(row.memberId);
      if (!existing || row.signInTime < existing.signInTime) {
        earliestByMember.set(row.memberId, row);
      }
    }
    return [...earliestByMember.values()].sort((a, b) => b.signInTime - a.signInTime);
  },
});

export const signIn = mutation({
  args: {
    eventId: v.id("events"),
    email: v.optional(v.string()),
    memberId: v.optional(v.id("attendanceMembers")),
  },
  handler: async (ctx, { eventId, email, memberId: memberArg }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw new ConvexError("Event not found.");
    if (!!email === !!memberArg) {
      throw new ConvexError("Provide either email or memberId.");
    }
    const year = eventStaffYear(event.dateStart);
    let memberId: Id<"attendanceMembers">;
    if (email) {
      const lower = email.trim().toLowerCase();
      if (!lower) throw new ConvexError("A person's email is required.");
      const staff = await staffMemberForEmail(ctx, lower, year, actorEmail);
      if (!staff) throw new ConvexError("Staff profile not found.");
      memberId = staff.memberId;
    } else {
      memberId = memberArg!;
    }
    return await signInMember(ctx, event, memberId, actorEmail);
  },
});

export async function signInMember(
  ctx: MutationCtx,
  event: Doc<"events">,
  memberId: Id<"attendanceMembers">,
  actorEmail: string,
  signInTime?: number
): Promise<Id<"attendance">> {
  const now = Date.now();
  const eventId = event._id;
  const year = eventStaffYear(event.dateStart);
  const member = await ctx.db.get(memberId);
  if (!member) throw new ConvexError("Member not found.");
  const existing = await ctx.db
    .query("attendance")
    .withIndex("by_event_and_member", (q) =>
      q.eq("eventId", eventId).eq("memberId", memberId)
    )
    .unique();
  if (existing) return existing._id;
  const id = await ctx.db.insert("attendance", {
    eventId,
    memberId,
    signInTime: signInTime ?? now,
    ...(signInTime !== undefined && signInTime !== now ? { addedAt: now } : {}),
  });
  await adjustEventAttendanceCount(ctx, eventId, 1);
  const { name, email: subjectEmail } = await memberAuditName(ctx, member, year);
  await logAttendanceAction(ctx, {
    actorEmail,
    entityType: "attendance",
    action: "attendance.signIn",
    summary: `${name} signed in to ${auditEventName(event)}`,
    eventId,
    memberId,
    subjectEmail,
  });
  return id;
}

export const updateRecord = mutation({
  args: {
    attendanceId: v.id("attendance"),
    notes: v.optional(v.string()),
    signInTime: v.optional(v.number()),
  },
  handler: async (ctx, { attendanceId, notes, signInTime }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const row = await ctx.db.get(attendanceId);
    if (!row) throw new ConvexError("Attendance record not found.");
    if (
      signInTime !== undefined &&
      (!Number.isFinite(signInTime) || Number.isNaN(new Date(signInTime).getTime()))
    ) {
      throw new ConvexError("That sign-in time isn't a valid date.");
    }
    const nextNotes = notes === undefined ? row.notes : notes.trim() || undefined;
    const notesChanged = nextNotes !== row.notes;
    const timeChanged = signInTime !== undefined && signInTime !== row.signInTime;
    if (!notesChanged && !timeChanged) return;
    await ctx.db.patch(attendanceId, {
      ...(notesChanged ? { notes: nextNotes } : {}),
      ...(timeChanged ? { signInTime } : {}),
    });
    const event = await ctx.db.get(row.eventId);
    const member = await ctx.db.get(row.memberId);
    const who = member
      ? await memberAuditName(
          ctx,
          member,
          event ? eventStaffYear(event.dateStart) : staffYearForDate(new Date())
        )
      : { name: "A member", email: undefined };
    const fields = [notesChanged ? "notes" : null, timeChanged ? "sign-in time" : null].filter(
      Boolean
    );
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "attendance",
      action: "attendance.update",
      summary: `Edited ${who.name}'s record for ${auditEventName(event)}`,
      eventId: row.eventId,
      memberId: row.memberId,
      subjectEmail: who.email,
      detail: `Changed: ${fields.join(", ")}`,
    });
  },
});

/** Audit note for a sign-in undone only because of the 10-minute grace. */
const undoDetail = (
  event: { dateEnd: number } | null,
  addedAt: number
): string | undefined =>
  event && reversibleOnlyByGrace(event, addedAt)
    ? "Undone within 10 minutes of signing in, after the event ended"
    : undefined;

export const signOut = mutation({
  args: {
    eventId: v.id("events"),
    email: v.optional(v.string()),
    memberId: v.optional(v.id("attendanceMembers")),
  },
  handler: async (ctx, { eventId, email, memberId: memberArg }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    if (!!email === !!memberArg) {
      throw new ConvexError("Provide either email or memberId.");
    }
    const event = await ctx.db.get(eventId);
    const year = event ? eventStaffYear(event.dateStart) : staffYearForDate(new Date());
    let memberId = memberArg ?? null;
    if (email) {
      const profile = await assignedProfileForEmail(ctx, email.trim().toLowerCase(), year);
      memberId = profile ? await knownMemberId(ctx, profile) : null;
    }
    if (!memberId) return;
    await signOutMember(ctx, eventId, event, memberId, actorEmail);
  },
});

export async function signOutMember(
  ctx: MutationCtx,
  eventId: Id<"events">,
  event: Doc<"events"> | null,
  memberId: Id<"attendanceMembers">,
  actorEmail: string
): Promise<boolean> {
  const year = event ? eventStaffYear(event.dateStart) : staffYearForDate(new Date());
  const existing = await ctx.db
    .query("attendance")
    .withIndex("by_event_and_member", (q) =>
      q.eq("eventId", eventId).eq("memberId", memberId)
    )
    .unique();
  if (!existing) return false;
  const addedAt = existing.addedAt ?? existing.signInTime;
  if (event && !canReverseSignIn(event, addedAt)) {
    throw new ConvexError(
      "This sign-in can't be undone. After an event ends, only sign-ins from the last 10 minutes or added after it ended can be removed."
    );
  }
  await ctx.db.delete(existing._id);
  await adjustEventAttendanceCount(ctx, eventId, -1);
  const member = await ctx.db.get(memberId);
  const who = member
    ? await memberAuditName(ctx, member, year)
    : { name: "A member", email: undefined };
  await logAttendanceAction(ctx, {
    actorEmail,
    entityType: "attendance",
    action: "attendance.signOut",
    summary: `${who.name} signed out of ${auditEventName(event)}`,
    eventId,
    memberId,
    subjectEmail: who.email,
    detail: undoDetail(event, addedAt),
  });
  return true;
}
