import { v } from "convex/values";
import {
  CAMPUS_FIELD_KEY,
  ROLE_FIELD_KEY,
  staffLockedMetadata,
} from "../shared/attendanceMemberMeta";
import { staffYearForDate } from "../shared/flow";
import { mergeNotes } from "../shared/memberMerge";
import { displayNameFromEmail } from "../shared/rollcall";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { isStaffAddress, latestStaffProfile } from "./attendanceMembers";
import { findMemberByEmail } from "./model";
import {
  isAssigned,
  knownMemberId,
  linkKnownMember,
  linkOrCreateMember,
  linkPerson,
  moveAttendance,
  profilesOfMember,
} from "./staffMembers";

const ACTOR = "system:member-backfill";

const STEPS = ["leftStaff", "profiles", "attendance", "members", "attach", "insights"] as const;
type Step = (typeof STEPS)[number];
const stepValidator = v.union(...STEPS.map((step) => v.literal(step)));

const PAGE_SIZE: Record<Step, number> = {
  leftStaff: 500,
  profiles: 100,
  attendance: 200,
  members: 200,
  attach: 50,
  insights: 1,
};

type StepResult = { processed: number; changed: number; isDone: boolean; cursor: string | null };

const liveMember = async (ctx: MutationCtx, memberId: Id<"attendanceMembers"> | undefined) =>
  memberId ? await ctx.db.get("attendanceMembers", memberId) : null;

async function leftStaffStep(ctx: MutationCtx, cursor: string | null): Promise<StepResult> {
  const page = await ctx.db
    .query("attendanceAuditLog")
    .paginate({ numItems: PAGE_SIZE.leftStaff, cursor });
  let changed = 0;
  for (const entry of page.page) {
    if (entry.action !== "member.leftStaff" || !entry.memberId || !entry.subjectEmail) continue;
    if (!(await liveMember(ctx, entry.memberId))) continue;
    for (const candidate of staffEmailCandidates(entry.subjectEmail)) {
      const profiles = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", candidate))
        .take(50);
      for (const profile of profiles) {
        if (await liveMember(ctx, profile.memberId)) continue;
        await ctx.db.patch("staffProfiles", profile._id, { memberId: entry.memberId });
        changed++;
      }
    }
  }
  return { processed: page.page.length, changed, isDone: page.isDone, cursor: page.continueCursor };
}

async function fold(
  ctx: MutationCtx,
  from: Doc<"attendanceMembers">,
  into: Doc<"attendanceMembers">
): Promise<void> {
  await moveAttendance(ctx, from._id, into._id);
  const current = (await ctx.db.get("attendanceMembers", into._id))!;
  await ctx.db.patch("attendanceMembers", into._id, {
    metadata: { ...(from.metadata ?? {}), ...(current.metadata ?? {}) },
    personalEmail: current.personalEmail ?? from.personalEmail,
    churchId: current.churchId ?? from.churchId,
  });
  await ctx.db.delete("attendanceMembers", from._id);
}

async function profilesStep(ctx: MutationCtx, cursor: string | null): Promise<StepResult> {
  const page = await ctx.db
    .query("staffProfiles")
    .paginate({ numItems: PAGE_SIZE.profiles, cursor });
  let changed = 0;
  for (const listed of page.page) {
    const profile = await ctx.db.get("staffProfiles", listed._id);
    if (!profile) continue;
    const rows: Doc<"attendanceMembers">[] = [];
    for (const candidate of staffEmailCandidates(profile.email)) {
      rows.push(
        ...(await ctx.db
          .query("attendanceMembers")
          .withIndex("by_email", (q) => q.eq("email", candidate))
          .take(20))
      );
    }
    const primary =
      (await liveMember(ctx, profile.memberId)) ??
      (await liveMember(ctx, (await knownMemberId(ctx, profile)) ?? undefined)) ??
      (await findMemberByEmail(ctx, profile.email)) ??
      rows[0] ??
      null;
    if (!primary) continue;
    for (const row of rows) {
      if (row._id === primary._id) continue;
      await fold(ctx, row, primary);
      changed++;
    }
    if (profile.memberId !== primary._id) changed++;
    await linkPerson(ctx, profile, primary._id);
  }
  return { processed: page.page.length, changed, isDone: page.isDone, cursor: page.continueCursor };
}

async function memberForEmail(ctx: MutationCtx, email: string): Promise<Id<"attendanceMembers">> {
  const profile = await latestStaffProfile(ctx, email);
  if (profile) return await linkOrCreateMember(ctx, profile, ACTOR);
  const existing = await findMemberByEmail(ctx, email);
  if (existing) return existing._id;
  return await ctx.db.insert("attendanceMembers", {
    name: displayNameFromEmail(email) ?? email,
    email: (await isStaffAddress(ctx, email)) ? undefined : email,
  });
}

async function attendanceStep(ctx: MutationCtx, cursor: string | null): Promise<StepResult> {
  const page = await ctx.db
    .query("attendance")
    .paginate({ numItems: PAGE_SIZE.attendance, cursor });
  let changed = 0;
  for (const listed of page.page) {
    const row = await ctx.db.get("attendance", listed._id);
    if (!row?.email) continue;
    const memberId = row.memberId ?? (await memberForEmail(ctx, row.email.trim().toLowerCase()));
    const others = await ctx.db
      .query("attendance")
      .withIndex("by_event_and_member", (q) => q.eq("eventId", row.eventId).eq("memberId", memberId))
      .take(10);
    const existing = others.find((other) => other._id !== row._id);
    if (existing) {
      await ctx.db.patch("attendance", existing._id, {
        signInTime: Math.min(existing.signInTime, row.signInTime),
        notes: mergeNotes(existing.notes, row.notes),
      });
      await ctx.db.delete("attendance", row._id);
    } else {
      await ctx.db.patch("attendance", row._id, { memberId, email: undefined });
    }
    changed++;
  }
  return { processed: page.page.length, changed, isDone: page.isDone, cursor: page.continueCursor };
}

async function membersStep(ctx: MutationCtx, cursor: string | null): Promise<StepResult> {
  const page = await ctx.db
    .query("attendanceMembers")
    .paginate({ numItems: PAGE_SIZE.members, cursor });
  const fields = await ctx.db.query("attendanceMetadata").collect();
  const lockedFields = fields.filter((f) => f.key === CAMPUS_FIELD_KEY || f.key === ROLE_FIELD_KEY);
  const current = staffYearForDate(new Date());
  let changed = 0;
  for (const listed of page.page) {
    const row = await ctx.db.get("attendanceMembers", listed._id);
    if (!row) continue;
    const profiles = await profilesOfMember(ctx, row._id);
    let email = row.email;
    if (profiles.length > 0 && email && (await isStaffAddress(ctx, email))) email = undefined;
    const personal = row.personalEmail?.trim().toLowerCase();
    if (!email && personal && !(await isStaffAddress(ctx, personal))) email = personal;

    const metadata = { ...(row.metadata ?? {}) };
    const staffNow = profiles
      .filter((p) => isAssigned(p) && (p.year === current || p.year === current + 1))
      .sort((a, b) => a.year - b.year)[0];
    let metadataChanged = false;
    if (staffNow) {
      const locked = staffLockedMetadata(fields, staffNow, {});
      for (const field of lockedFields) {
        if (metadata[field._id] && metadata[field._id] === locked[field._id]) {
          delete metadata[field._id];
          metadataChanged = true;
        }
      }
    }
    if (email === row.email && row.personalEmail === undefined && !metadataChanged) continue;
    await ctx.db.patch("attendanceMembers", row._id, {
      email,
      personalEmail: undefined,
      ...(metadataChanged ? { metadata } : {}),
    });
    changed++;
  }
  return { processed: page.page.length, changed, isDone: page.isDone, cursor: page.continueCursor };
}

async function attachStep(ctx: MutationCtx): Promise<StepResult> {
  const current = staffYearForDate(new Date());
  const pending: Doc<"staffProfiles">[] = [];
  for (const year of [current, current + 1]) {
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    for (const profile of profiles) {
      if (!isAssigned(profile) || (await liveMember(ctx, profile.memberId))) continue;
      if (year === current || (await knownMemberId(ctx, profile))) pending.push(profile);
    }
  }
  const batch = pending.slice(0, PAGE_SIZE.attach);
  for (const profile of batch) {
    if (profile.year === current) await linkOrCreateMember(ctx, profile, ACTOR);
    else await linkKnownMember(ctx, profile);
  }
  return {
    processed: batch.length,
    changed: batch.length,
    isDone: pending.length <= batch.length,
    cursor: null,
  };
}

async function insightsStep(ctx: MutationCtx): Promise<StepResult> {
  const indexes = await ctx.db.query("weeklyInsightIndex").take(200);
  for (const index of indexes) await ctx.db.delete("weeklyInsightIndex", index._id);
  await ctx.scheduler.runAfter(0, internal.weeklyInsights.rebuildAll, { force: true });
  await ctx.scheduler.runAfter(0, internal.attendanceMetrics.recomputeAll, {});
  return { processed: indexes.length, changed: indexes.length, isDone: true, cursor: null };
}

async function runStep(ctx: MutationCtx, step: Step, cursor: string | null): Promise<StepResult> {
  switch (step) {
    case "leftStaff":
      return await leftStaffStep(ctx, cursor);
    case "profiles":
      return await profilesStep(ctx, cursor);
    case "attendance":
      return await attendanceStep(ctx, cursor);
    case "members":
      return await membersStep(ctx, cursor);
    case "attach":
      return await attachStep(ctx);
    case "insights":
      return await insightsStep(ctx);
  }
}

export const run = internalMutation({
  args: {
    step: v.optional(stepValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
    once: v.optional(v.boolean()),
  },
  returns: v.object({
    step: stepValidator,
    processed: v.number(),
    changed: v.number(),
    next: v.union(v.null(), v.object({ step: stepValidator, cursor: v.union(v.string(), v.null()) })),
  }),
  handler: async (ctx, { step = "leftStaff", cursor = null, once = false }) => {
    const result = await runStep(ctx, step, cursor);
    const following = STEPS[STEPS.indexOf(step) + 1];
    const next = !result.isDone
      ? { step, cursor: result.cursor }
      : following
        ? { step: following, cursor: null }
        : null;
    console.log(`memberBackfill ${step}: ${result.processed} read, ${result.changed} changed`);
    if (next && !once) await ctx.scheduler.runAfter(0, internal.memberBackfill.run, next);
    return { step, processed: result.processed, changed: result.changed, next };
  },
});

const reportValidator = v.object({
  attendanceWithEmail: v.number(),
  attendanceWithoutMember: v.number(),
  attendanceMemberMissing: v.number(),
  membersWithPersonalEmail: v.number(),
  linkedMembersWithStaffEmail: v.number(),
  duplicateSignIns: v.number(),
  currentStaffUnlinked: v.number(),
  nextStaffUnlinked: v.number(),
  profilesLinkedToMissingMember: v.number(),
  membersLinkedToTwoStaffInOneYear: v.number(),
});

export const reportPeople = internalQuery({
  args: {},
  returns: v.object({
    memberIds: v.array(v.string()),
    membersWithPersonalEmail: v.number(),
    linkedMembersWithStaffEmail: v.number(),
    currentStaffUnlinked: v.number(),
    nextStaffUnlinked: v.number(),
    profilesLinkedToMissingMember: v.number(),
    membersLinkedToTwoStaffInOneYear: v.number(),
  }),
  handler: async (ctx) => {
    const current = staffYearForDate(new Date());
    const members = await ctx.db.query("attendanceMembers").collect();
    const memberIds = new Set<string>(members.map((m) => m._id));
    const profiles = await ctx.db.query("staffProfiles").collect();
    const linkedIds = new Set<string>(profiles.flatMap((p) => (p.memberId ? [p.memberId] : [])));
    const staffEmails = new Set(profiles.flatMap((p) => staffEmailCandidates(p.email)));
    const staffPerMemberYear = new Map<string, number>();
    for (const p of profiles) {
      if (!p.memberId || !isAssigned(p)) continue;
      const key = `${p.memberId}|${p.year}`;
      staffPerMemberYear.set(key, (staffPerMemberYear.get(key) ?? 0) + 1);
    }
    const unlinked = (year: number) =>
      profiles.filter(
        (p) => p.year === year && isAssigned(p) && !(p.memberId && memberIds.has(p.memberId))
      ).length;
    return {
      memberIds: [...memberIds],
      membersWithPersonalEmail: members.filter((m) => m.personalEmail !== undefined).length,
      linkedMembersWithStaffEmail: members.filter(
        (m) =>
          linkedIds.has(m._id) &&
          staffEmailCandidates(m.email).some((candidate) => staffEmails.has(candidate))
      ).length,
      currentStaffUnlinked: unlinked(current),
      nextStaffUnlinked: unlinked(current + 1),
      profilesLinkedToMissingMember: profiles.filter(
        (p) => p.memberId && !memberIds.has(p.memberId)
      ).length,
      membersLinkedToTwoStaffInOneYear: [...staffPerMemberYear.values()].filter((n) => n > 1).length,
    };
  },
});

export const reportAttendancePage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), pageSize: v.number() },
  returns: v.object({
    withEmail: v.number(),
    withoutMember: v.number(),
    signIns: v.array(v.object({ eventId: v.string(), memberId: v.string() })),
    isDone: v.boolean(),
    cursor: v.string(),
  }),
  handler: async (ctx, { cursor, pageSize }) => {
    const page = await ctx.db.query("attendance").paginate({ numItems: pageSize, cursor });
    return {
      withEmail: page.page.filter((r) => r.email !== undefined).length,
      withoutMember: page.page.filter((r) => !r.memberId).length,
      signIns: page.page.flatMap((r) => (r.memberId ? [{ eventId: r.eventId, memberId: r.memberId }] : [])),
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

export const report = internalAction({
  args: { pageSize: v.optional(v.number()) },
  returns: reportValidator,
  handler: async (ctx, { pageSize = 4000 }): Promise<typeof reportValidator.type> => {
    const people: {
      memberIds: string[];
      membersWithPersonalEmail: number;
      linkedMembersWithStaffEmail: number;
      currentStaffUnlinked: number;
      nextStaffUnlinked: number;
      profilesLinkedToMissingMember: number;
      membersLinkedToTwoStaffInOneYear: number;
    } = await ctx.runQuery(internal.memberBackfill.reportPeople, {});
    const memberIds = new Set(people.memberIds);
    let withEmail = 0;
    let withoutMember = 0;
    let memberMissing = 0;
    const signIns = new Map<string, number>();
    let cursor: string | null = null;
    for (;;) {
      const page: {
        withEmail: number;
        withoutMember: number;
        signIns: { eventId: string; memberId: string }[];
        isDone: boolean;
        cursor: string;
      } = await ctx.runQuery(internal.memberBackfill.reportAttendancePage, {
        cursor,
        pageSize,
      });
      withEmail += page.withEmail;
      withoutMember += page.withoutMember;
      for (const { eventId, memberId } of page.signIns) {
        if (!memberIds.has(memberId)) memberMissing++;
        const key = `${eventId}|${memberId}`;
        signIns.set(key, (signIns.get(key) ?? 0) + 1);
      }
      if (page.isDone) break;
      cursor = page.cursor;
    }
    return {
      membersWithPersonalEmail: people.membersWithPersonalEmail,
      linkedMembersWithStaffEmail: people.linkedMembersWithStaffEmail,
      currentStaffUnlinked: people.currentStaffUnlinked,
      nextStaffUnlinked: people.nextStaffUnlinked,
      profilesLinkedToMissingMember: people.profilesLinkedToMissingMember,
      membersLinkedToTwoStaffInOneYear: people.membersLinkedToTwoStaffInOneYear,
      attendanceWithEmail: withEmail,
      attendanceWithoutMember: withoutMember,
      attendanceMemberMissing: memberMissing,
      duplicateSignIns: [...signIns.values()].filter((n) => n > 1).length,
    };
  },
});
