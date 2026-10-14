import {
  CAMPUS_FIELD_KEY,
  optionIdForLabel,
  ROLE_FIELD_KEY,
} from "../shared/attendanceMemberMeta";
import { assignmentsOf, MEMBER, staffYearForDate } from "../shared/flow";
import { mergeNotes } from "../shared/memberMerge";
import { capitalizeMemberName, personDisplayName } from "../shared/rollcall";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { logAttendanceAction } from "./attendanceAudit";
import { mergeSelectValues } from "./attendanceMetadata";
import { getProfile } from "./model";

type Ctx = QueryCtx | MutationCtx;
type Profile = Doc<"staffProfiles">;
type MemberId = Id<"attendanceMembers">;

export const isAssigned = (profile: Profile): boolean => assignmentsOf(profile).length > 0;

export async function staffProfileOfMember(
  ctx: Ctx,
  memberId: MemberId,
  year: number
): Promise<Profile | null> {
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_memberId_and_year", (q) => q.eq("memberId", memberId).eq("year", year))
    .take(10);
  return profiles.find(isAssigned) ?? null;
}

export async function profilesOfMember(ctx: Ctx, memberId: MemberId): Promise<Profile[]> {
  return await ctx.db
    .query("staffProfiles")
    .withIndex("by_memberId_and_year", (q) => q.eq("memberId", memberId))
    .take(100);
}

export async function latestProfileOfMember(ctx: Ctx, memberId: MemberId): Promise<Profile | null> {
  return (
    (await ctx.db
      .query("staffProfiles")
      .withIndex("by_memberId_and_year", (q) => q.eq("memberId", memberId))
      .order("desc")
      .first()) ?? null
  );
}

export async function assignedProfileForEmail(
  ctx: Ctx,
  email: string | undefined,
  year: number
): Promise<Profile | null> {
  for (const candidate of staffEmailCandidates(email)) {
    const profile = await getProfile(ctx, candidate, year);
    if (profile && isAssigned(profile)) return profile;
  }
  return null;
}

async function samePersonProfiles(ctx: Ctx, profile: Profile): Promise<Profile[]> {
  const byId = new Map<string, Profile>([[profile._id, profile]]);
  for (const candidate of staffEmailCandidates(profile.email)) {
    const rows = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", candidate))
      .take(50);
    for (const row of rows) byId.set(row._id, row);
  }
  if (profile.importId) {
    const rows = await ctx.db
      .query("staffProfiles")
      .withIndex("by_importId", (q) => q.eq("importId", profile.importId))
      .take(50);
    for (const row of rows) byId.set(row._id, row);
  }
  return [...byId.values()].sort((a, b) => b.year - a.year);
}

const liveMemberId = async (ctx: Ctx, memberId: MemberId | undefined) =>
  memberId && (await ctx.db.get("attendanceMembers", memberId)) ? memberId : null;

export async function knownMemberId(ctx: Ctx, profile: Profile): Promise<MemberId | null> {
  const own = await liveMemberId(ctx, profile.memberId);
  if (own) return own;
  for (const other of await samePersonProfiles(ctx, profile)) {
    const linked = await liveMemberId(ctx, other.memberId);
    if (linked) return linked;
  }
  return null;
}

export async function linkPerson(
  ctx: MutationCtx,
  profile: Profile,
  memberId: MemberId
): Promise<void> {
  for (const other of await samePersonProfiles(ctx, profile)) {
    if (other._id !== profile._id && (await liveMemberId(ctx, other.memberId))) continue;
    if (other.memberId !== memberId) {
      await ctx.db.patch("staffProfiles", other._id, { memberId });
    }
  }
}

export async function linkKnownMember(ctx: MutationCtx, profile: Profile): Promise<MemberId | null> {
  const memberId = await knownMemberId(ctx, profile);
  if (memberId) await linkPerson(ctx, profile, memberId);
  return memberId;
}

export const staffMemberName = (profile: Profile): string => {
  const shown = personDisplayName(profile.name, profile.email).trim();
  return shown.includes("@") || !shown ? profile.email.toLowerCase() : capitalizeMemberName(shown);
};

export const personName = (name: string | null | undefined): string | null => {
  const trimmed = name?.trim();
  return trimmed && !trimmed.includes("@") ? capitalizeMemberName(trimmed) : null;
};

export const profileOwnName = (profile: Profile): string | null =>
  profile.name?.trim().toLowerCase() === profile.email.toLowerCase() ? null : personName(profile.name);

export const staffRowName = (profile: Profile, ...ownNames: (string | undefined)[]): string | null =>
  profileOwnName(profile) ??
  ownNames.map(personName).find((name): name is string => name !== null) ??
  personName(staffMemberName(profile));

export async function linkOrCreateMember(
  ctx: MutationCtx,
  profile: Profile,
  actorEmail: string
): Promise<MemberId> {
  const known = await linkKnownMember(ctx, profile);
  if (known) return known;
  const name = staffMemberName(profile);
  const memberId = await ctx.db.insert("attendanceMembers", { name });
  await linkPerson(ctx, profile, memberId);
  await logAttendanceAction(ctx, {
    actorEmail,
    entityType: "member",
    action: "member.create",
    summary: `Added staff member "${name}" to the attendance pool`,
    memberId,
    subjectEmail: profile.email.toLowerCase(),
  });
  return memberId;
}

export async function attachMember(
  ctx: MutationCtx,
  profileId: Id<"staffProfiles">,
  actorEmail: string
): Promise<MemberId | null> {
  const profile = await ctx.db.get("staffProfiles", profileId);
  if (!profile || !isAssigned(profile)) return null;
  if (profile.year === staffYearForDate(new Date())) {
    return await linkOrCreateMember(ctx, profile, actorEmail);
  }
  return await linkKnownMember(ctx, profile);
}

export async function staffMemberForEmail(
  ctx: MutationCtx,
  email: string,
  year: number,
  actorEmail: string
): Promise<{ profile: Profile; memberId: MemberId } | null> {
  const profile = await assignedProfileForEmail(ctx, email, year);
  if (!profile) return null;
  return { profile, memberId: await linkOrCreateMember(ctx, profile, actorEmail) };
}

export async function memberRoleOption(
  ctx: MutationCtx,
  dryRun = false
): Promise<{ fieldId: Id<"attendanceMetadata">; optionId: string } | null> {
  const field = (await ctx.db.query("attendanceMetadata").collect()).find(
    (f) => f.key === ROLE_FIELD_KEY
  );
  if (!field) return null;
  const values = mergeSelectValues(field.values ?? {}, [MEMBER]);
  if (!dryRun && Object.keys(values).length !== Object.keys(field.values ?? {}).length) {
    await ctx.db.patch("attendanceMetadata", field._id, { values });
  }
  return { fieldId: field._id, optionId: optionIdForLabel(values, MEMBER) };
}

export async function leaveStaff(
  ctx: MutationCtx,
  memberId: MemberId,
  lastProfile: Profile,
  notStaffIn: number,
  actorEmail: string
): Promise<boolean> {
  const row = await ctx.db.get("attendanceMembers", memberId);
  if (!row) return false;
  const metadata = { ...(row.metadata ?? {}) };
  const filled: string[] = [];
  const campusField = (await ctx.db.query("attendanceMetadata").collect()).find(
    (f) => f.key === CAMPUS_FIELD_KEY
  );
  const campus = assignmentsOf(lastProfile).find((a) => a.university)?.university;
  if (campusField && campus && !metadata[campusField._id]) {
    metadata[campusField._id] = optionIdForLabel(campusField.values, campus);
    filled.push(`Campus set to ${campus}, from their last staff role`);
  }
  const role = await memberRoleOption(ctx);
  if (role && !metadata[role.fieldId]) {
    metadata[role.fieldId] = role.optionId;
    filled.push(`Role set to ${MEMBER}`);
  }
  const name = row.name;
  await ctx.db.patch("attendanceMembers", memberId, { metadata });
  await logAttendanceAction(ctx, {
    actorEmail,
    entityType: "member",
    action: "member.leftStaff",
    summary: `"${name}" left staff and is now a member`,
    memberId,
    subjectEmail: lastProfile.email.toLowerCase(),
    detail: [`Not staff in ${notStaffIn}`, ...filled].join("\n"),
  });
  return true;
}

export async function memberDisplayName(
  ctx: Ctx,
  member: Doc<"attendanceMembers">,
  year: number
): Promise<{ name: string; email: string | undefined }> {
  const profile = await staffProfileOfMember(ctx, member._id, year);
  if (!profile) return { name: member.name, email: undefined };
  return {
    name: personDisplayName(profile.name ?? member.name, profile.email),
    email: profile.email.toLowerCase(),
  };
}

export async function moveAttendance(
  ctx: MutationCtx,
  from: MemberId,
  into: MemberId
): Promise<{ moved: number; combined: number }> {
  const byEvent = new Map(
    (
      await ctx.db
        .query("attendance")
        .withIndex("by_member", (q) => q.eq("memberId", into))
        .collect()
    ).map((r) => [r.eventId, r])
  );
  const records = await ctx.db
    .query("attendance")
    .withIndex("by_member", (q) => q.eq("memberId", from))
    .collect();
  let moved = 0;
  let combined = 0;
  for (const record of records) {
    const existing = byEvent.get(record.eventId);
    if (existing) {
      const merged = {
        signInTime: Math.min(existing.signInTime, record.signInTime),
        notes: mergeNotes(existing.notes, record.notes),
      };
      await ctx.db.patch("attendance", existing._id, merged);
      byEvent.set(record.eventId, { ...existing, ...merged });
      await ctx.db.delete("attendance", record._id);
      combined++;
    } else {
      await ctx.db.patch("attendance", record._id, { memberId: into });
      byEvent.set(record.eventId, record);
      moved++;
    }
  }
  for (const profile of await profilesOfMember(ctx, from)) {
    await ctx.db.patch("staffProfiles", profile._id, { memberId: into });
  }
  return { moved, combined };
}
