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
import { auditEventName, canReverseSignIn, reversibleOnlyByGrace, memberMatchesEventCampus, normalizeSubgroups, personKey, subgroupMatches } from "../shared/rollcall";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { optionalProfile, requireProfile } from "./model";
import { logAttendanceAction } from "./attendanceAudit";
import { adjustEventAttendanceCount } from "./attendanceCounts";
import { memberAuditName, staffDisplayName } from "./attendanceMembers";
import { eventCampuses, memberRoleResolver, memberRolesFor } from "./memberRoles";
import { photoFor } from "./photo";
import { compareLikelihood, LIKELIHOOD } from "../shared/rollCallLikelihood";
import { storedOrder } from "./rollCallOrder";
import {
  assignedProfileForEmail,
  isAssigned,
  knownMemberId,
  profileOwnName,
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

const memberSubtitle = (role: string | undefined, details: string): string | undefined =>
  [role, details].filter(Boolean).join(" · ") || undefined;

export const ROSTER_LIMIT_MAX = 200;
const SEARCH_MEMBER_LIMIT = 25;
const SEARCH_STAFF_LIMIT = 25;
const NAME_LOOKUP_LIMIT = 20;
const NAME_LOOKUP_MEMBER_LIMIT = 10;

type MetadataField = Doc<"attendanceMetadata">;

const staffCampuses = (profile: Doc<"staffProfiles">): string[] => [
  ...new Set(
    assignmentsOf(profile).flatMap((a) =>
      a.university && roleNeedsUniversity(a.role) ? [a.university] : []
    )
  ),
];

const staffUniversity = (
  profile: Doc<"staffProfiles">,
  fields: readonly MetadataField[],
  shadow: Doc<"attendanceMembers"> | null | undefined
): string | undefined => {
  const campuses = staffCampuses(profile);
  return campuses[0] ?? resolveUniversity(fields, shadow?.metadata, campuses);
};

async function staffEntry(
  ctx: QueryCtx,
  profile: Doc<"staffProfiles">,
  shadow: Doc<"attendanceMembers"> | null | undefined,
  fields: readonly MetadataField[],
  memberYear: number
): Promise<RosterEntry> {
  const roles = [...new Set(assignmentsOf(profile).map((a) => a.role))];
  const orgSubtitle = roles.length > 0 ? roles.join(" · ") : "";
  const metaSubtitle = metadataSubtitle(fields, shadow?.metadata, memberYear, [ROLE_FIELD_KEY, CAMPUS_FIELD_KEY]);
  const subtitle = [orgSubtitle, metaSubtitle].filter(Boolean).join(" · ");
  const user = profile.userId ? await ctx.db.get(profile.userId) : null;
  return {
    key: personKey({ email: profile.email }),
    kind: "staff",
    email: profile.email,
    memberId: shadow?._id,
    name: staffDisplayName(profile, shadow?.name),
    roles,
    campuses: staffCampuses(profile),
    university: staffUniversity(profile, fields, shadow),
    subtitle: subtitle || undefined,
    photo: await photoFor(ctx, user, profile.email),
  };
}

const memberEntry = (
  member: Doc<"attendanceMembers">,
  fields: readonly MetadataField[],
  memberYear: number,
  role: string | undefined
): RosterEntry => ({
  key: personKey({ memberId: member._id }),
  kind: "member",
  memberId: member._id,
  name: member.name,
  roles: [],
  campuses: [],
  university: resolveUniversity(fields, member.metadata),
  subtitle: memberSubtitle(role, metadataSubtitle(fields, member.metadata, memberYear, [CAMPUS_FIELD_KEY, ROLE_FIELD_KEY])),
});

const fieldsForEvent = async (ctx: QueryCtx, event: Doc<"events">) => {
  const eventFieldSubgroups = normalizeSubgroups(event.subgroups);
  return (await ctx.db.query("attendanceMetadata").collect())
    .filter(
      (field) =>
        !field.subgroup || eventFieldSubgroups.some((sg) => subgroupMatches(field.subgroup!, sg))
    )
    .sort((a, b) => a.order - b.order);
};

type Candidate = {
  key: string;
  name: string;
  likelihood: number;
  member: Doc<"attendanceMembers"> | null;
  profile: Doc<"staffProfiles"> | null;
};

const byLikelihood = (a: Candidate, b: Candidate) =>
  compareLikelihood(a.likelihood, b.likelihood, a.name, b.name);

type SearchCandidate = Candidate & { exact: boolean };

const bySearchMatch = (a: SearchCandidate, b: SearchCandidate) =>
  Number(b.exact) - Number(a.exact) || byLikelihood(a, b);

async function candidateEntries(
  ctx: QueryCtx,
  event: Doc<"events">,
  fields: readonly MetadataField[],
  memberYear: number,
  candidates: readonly Candidate[]
): Promise<RosterEntry[]> {
  const members = candidates.flatMap((c) => (c.profile || !c.member ? [] : [c.member]));
  const roleOf = await memberRolesFor(ctx, fields, members, eventCampuses(event.subgroups));
  return await Promise.all(
    candidates.map((c) =>
      c.profile
        ? staffEntry(ctx, c.profile, c.member, fields, memberYear)
        : memberEntry(c.member!, fields, memberYear, roleOf(c.member!).role)
    )
  );
}

const assignedProfiles = async (ctx: QueryCtx, year: number) =>
  (
    await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect()
  ).filter(isAssigned);

async function likelyRoster(
  ctx: QueryCtx,
  event: Doc<"events">,
  limit: number
): Promise<RosterEntry[]> {
  const profileYear = eventStaffYear(event.dateStart);
  const memberYear = sydneyCalendarYear(new Date(event.dateStart));
  const fields = await fieldsForEvent(ctx, event);
  const eventSubgroups = new Set(normalizeSubgroups(event.subgroups));
  const campusBonus = (place: { university?: string; campuses: string[] }) =>
    memberMatchesEventCampus(eventSubgroups, place) ? LIKELIHOOD.campus : 0;
  const order = await storedOrder(ctx, event._id);
  const picked: Candidate[] = [];
  const seen = new Set<string>();
  const cutoff = () => [...picked].sort(byLikelihood)[limit - 1].likelihood;
  const ranked = order?.memberIds ?? [];
  for (let i = 0; i < ranked.length; i++) {
    const score = order!.scores[i] ?? 0;
    if (picked.length >= limit && score + LIKELIHOOD.campus < cutoff()) break;
    const member = await ctx.db.get("attendanceMembers", ranked[i]);
    if (!member) continue;
    const profile = await staffProfileOfMember(ctx, member._id, profileYear);
    const key = profile ? personKey({ email: profile.email }) : personKey({ memberId: member._id });
    if (seen.has(key)) continue;
    seen.add(key);
    const place = profile
      ? { university: staffUniversity(profile, fields, member), campuses: staffCampuses(profile) }
      : { university: resolveUniversity(fields, member.metadata), campuses: [] };
    picked.push({
      key,
      name: profile ? staffDisplayName(profile, member.name) : member.name,
      likelihood: score + campusBonus(place),
      member,
      profile,
    });
  }
  // Staff nobody ranked score only the campus bonus, so they can also pass a
  // last place that scores no more than that.
  if (picked.length < limit || cutoff() <= LIKELIHOOD.campus) {
    const staff: Candidate[] = [];
    for (const profile of await assignedProfiles(ctx, profileYear)) {
      const key = personKey({ email: profile.email });
      if (seen.has(key)) continue;
      seen.add(key);
      const member = profile.memberId ? await ctx.db.get("attendanceMembers", profile.memberId) : null;
      staff.push({
        key,
        name: staffDisplayName(profile, member?.name),
        likelihood: campusBonus({
          university: staffUniversity(profile, fields, member),
          campuses: staffCampuses(profile),
        }),
        member,
        profile,
      });
    }
    picked.push(...staff.sort(byLikelihood).slice(0, limit));
  }
  return await candidateEntries(ctx, event, fields, memberYear, picked.sort(byLikelihood).slice(0, limit));
}

export const roster = query({
  args: {
    year: v.number(),
    subgroup: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { year, subgroup, eventId, limit }) => {
    if (!(await optionalProfile(ctx))) return [];
    const event = eventId ? await ctx.db.get(eventId) : null;
    if (event && limit !== undefined) {
      return await likelyRoster(ctx, event, Math.max(1, Math.min(ROSTER_LIMIT_MAX, Math.floor(limit))));
    }
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

    const profiles = await assignedProfiles(ctx, profileYear);
    const members = await ctx.db.query("attendanceMembers").collect();
    const memberById = new Map(members.map((m) => [m._id, m]));
    const staffMemberIds = new Set(profiles.flatMap((p) => (p.memberId ? [p.memberId] : [])));
    const pureExtras = members.filter((m) => !staffMemberIds.has(m._id));
    const roleOf = await memberRoleResolver(
      ctx,
      metadataFields,
      event ? eventCampuses(event.subgroups) : undefined
    );

    const staffRows: RosterEntry[] = await Promise.all(
      profiles.map((p) =>
        staffEntry(ctx, p, p.memberId ? memberById.get(p.memberId) : undefined, metadataFields, memberYear)
      )
    );
    const extraRows: RosterEntry[] = pureExtras.map((m) =>
      memberEntry(m, metadataFields, memberYear, roleOf(m).role)
    );

    const rows = [...staffRows, ...extraRows];
    if (!event) return rows.sort((a, b) => a.name.localeCompare(b.name));

    const eventSubgroups = new Set(normalizeSubgroups(event.subgroups));
    const order = await storedOrder(ctx, event._id);
    const scores = new Map<string, number>(
      (order?.memberIds ?? []).map((memberId, i) => [memberId, order!.scores[i] ?? 0])
    );
    const likelihood = new Map(
      rows.map((entry) => [
        entry.key,
        (entry.memberId ? (scores.get(entry.memberId) ?? 0) : 0) +
          (memberMatchesEventCampus(eventSubgroups, entry) ? LIKELIHOOD.campus : 0),
      ])
    );
    return rows.sort((a, b) =>
      compareLikelihood(likelihood.get(a.key)!, likelihood.get(b.key)!, a.name, b.name)
    );
  },
});

const searchHit = (needle: string, ...haystack: (string | undefined)[]) =>
  haystack.some((text) => text?.toLowerCase().includes(needle));

type StaffToSearch = {
  profile: Doc<"staffProfiles">;
  name: string;
  shadow: Doc<"attendanceMembers"> | null;
};

// What every search of an event's roll call needs, read once however many
// names are looked up.
async function searchScope(ctx: QueryCtx, event: Doc<"events">) {
  const fields = await fieldsForEvent(ctx, event);
  const eventSubgroups = new Set(normalizeSubgroups(event.subgroups));
  const order = await storedOrder(ctx, event._id);
  const scores = new Map<string, number>(
    (order?.memberIds ?? []).map((memberId, i) => [memberId, order!.scores[i] ?? 0])
  );
  const profiles = await assignedProfiles(ctx, eventStaffYear(event.dateStart));
  const staff: StaffToSearch[] = await Promise.all(
    profiles.map(async (profile) => {
      const shadow =
        profile.memberId && profileOwnName(profile) === null
          ? await ctx.db.get("attendanceMembers", profile.memberId)
          : null;
      return { profile, shadow, name: staffDisplayName(profile, shadow?.name) };
    })
  );
  const members = new Map<Id<"attendanceMembers">, Promise<Doc<"attendanceMembers"> | null>>();
  return {
    fields,
    memberYear: sydneyCalendarYear(new Date(event.dateStart)),
    staff,
    profileOfMember: new Map(profiles.flatMap((p) => (p.memberId ? [[p.memberId, p] as const] : []))),
    likelihood: (memberId: Id<"attendanceMembers"> | undefined, place: { university?: string; campuses: string[] }) =>
      (memberId ? (scores.get(memberId) ?? 0) : 0) +
      (memberMatchesEventCampus(eventSubgroups, place) ? LIKELIHOOD.campus : 0),
    member: (id: Id<"attendanceMembers">) => {
      if (!members.has(id)) members.set(id, ctx.db.get("attendanceMembers", id));
      return members.get(id)!;
    },
  };
}

type SearchScope = Awaited<ReturnType<typeof searchScope>>;

async function searchCandidates(
  ctx: QueryCtx,
  scope: SearchScope,
  text: string,
  memberLimit: number
): Promise<SearchCandidate[]> {
  const needle = text.toLowerCase();
  const found = new Map<string, SearchCandidate>();
  const add = (profile: Doc<"staffProfiles"> | null, member: Doc<"attendanceMembers"> | null) => {
    const key = profile ? personKey({ email: profile.email }) : personKey({ memberId: member!._id });
    if (found.has(key)) return;
    const place = profile
      ? { university: staffUniversity(profile, scope.fields, member), campuses: staffCampuses(profile) }
      : { university: resolveUniversity(scope.fields, member!.metadata), campuses: [] };
    const name = profile ? staffDisplayName(profile, member?.name) : member!.name;
    found.set(key, {
      key,
      name,
      exact: searchHit(needle, name, profile?.email),
      likelihood: scope.likelihood(member?._id, place),
      member,
      profile,
    });
  };
  // Every matching staffer is ranked before the cap, names and emails first,
  // so a name match is never dropped for one that only matched a role or campus.
  const staffHits = scope.staff
    .filter(({ profile, name }) =>
      searchHit(needle, name, profile.email, ...assignmentsOf(profile).map((a) => a.role), ...staffCampuses(profile))
    )
    .map((hit) => ({
      ...hit,
      exact: searchHit(needle, hit.name, hit.profile.email),
      likelihood: scope.likelihood(hit.profile.memberId, { campuses: staffCampuses(hit.profile) }),
    }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || compareLikelihood(a.likelihood, b.likelihood, a.name, b.name))
    .slice(0, SEARCH_STAFF_LIMIT);
  for (const { profile, shadow } of staffHits) {
    add(profile, shadow ?? (profile.memberId ? await scope.member(profile.memberId) : null));
  }
  const members = await ctx.db
    .query("attendanceMembers")
    .withSearchIndex("search_name", (q) => q.search("name", text))
    .take(memberLimit);
  for (const member of members) add(scope.profileOfMember.get(member._id) ?? null, member);
  return [...found.values()].sort(bySearchMatch);
}

export const searchRoster = query({
  args: { eventId: v.id("events"), search: v.string() },
  handler: async (ctx, { eventId, search }): Promise<RosterEntry[]> => {
    if (!(await optionalProfile(ctx))) return [];
    const text = search.trim();
    const event = text ? await ctx.db.get(eventId) : null;
    if (!event) return [];
    const scope = await searchScope(ctx, event);
    const found = await searchCandidates(ctx, scope, text, SEARCH_MEMBER_LIMIT);
    return await candidateEntries(ctx, event, scope.fields, scope.memberYear, found);
  },
});

// Self check-in looks up the typed names that matched no one in one call, so
// the year's staff are read once and not once per name. Only the first 20 are
// looked up, oldest first; later ones move up as those are signed in or dismissed.
export const searchRosterNames = query({
  args: { eventId: v.id("events"), names: v.array(v.string()) },
  handler: async (ctx, { eventId, names }): Promise<RosterEntry[]> => {
    if (!(await optionalProfile(ctx))) return [];
    const texts = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, NAME_LOOKUP_LIMIT);
    const event = texts.length > 0 ? await ctx.db.get(eventId) : null;
    if (!event) return [];
    const scope = await searchScope(ctx, event);
    const found = new Map<string, SearchCandidate>();
    for (const text of texts) {
      for (const hit of await searchCandidates(ctx, scope, text, NAME_LOOKUP_MEMBER_LIMIT)) {
        if (!found.has(hit.key)) found.set(hit.key, hit);
      }
    }
    return await candidateEntries(ctx, event, scope.fields, scope.memberYear, [...found.values()]);
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
    const roleOf = await memberRoleResolver(ctx, metadataFields, eventCampuses(event.subgroups));

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
