import { ConvexError, v } from "convex/values";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { personDisplayName } from "../shared/rollcall";
import { canonicalEmailKey } from "../shared/rollcallImport";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
  isAssigned,
  knownMemberId,
  leaveStaff,
  linkOrCreateMember,
} from "./staffMembers";

const ROLLOVER_ACTOR = "system:staff-rollover";

const detailValidator = v.object({
  email: v.string(),
  name: v.string(),
  action: v.union(v.literal("linked"), v.literal("created"), v.literal("left")),
});

type Detail = typeof detailValidator.type;

const resultValidator = v.object({
  dryRun: v.boolean(),
  year: v.number(),
  linked: v.number(),
  created: v.number(),
  left: v.number(),
  remaining: v.number(),
  details: v.array(detailValidator),
});

const profilesIn = async (ctx: MutationCtx, year: number) =>
  (
    await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect()
  ).filter(isAssigned);

async function unlinkedStaff(ctx: MutationCtx, year: number): Promise<Doc<"staffProfiles">[]> {
  const pending: Doc<"staffProfiles">[] = [];
  for (const profile of await profilesIn(ctx, year)) {
    const linked = profile.memberId ? await ctx.db.get("attendanceMembers", profile.memberId) : null;
    if (!linked) pending.push(profile);
  }
  return pending.sort((a, b) => a.email.localeCompare(b.email));
}

async function pendingLeavers(
  ctx: MutationCtx,
  year: number
): Promise<{ profile: Doc<"staffProfiles">; memberId: Id<"attendanceMembers"> }[]> {
  const staying = await profilesIn(ctx, year);
  const stayingKeys = new Set(staying.map((p) => canonicalEmailKey(p.email)));
  const stayingMembers = new Set(staying.flatMap((p) => (p.memberId ? [p.memberId] : [])));
  const since = staffYearStartMs(year);
  const pending: { profile: Doc<"staffProfiles">; memberId: Id<"attendanceMembers"> }[] = [];
  const seen = new Set<Id<"attendanceMembers">>();
  for (const profile of await profilesIn(ctx, year - 1)) {
    if (!profile.memberId || stayingMembers.has(profile.memberId) || seen.has(profile.memberId)) continue;
    if (stayingKeys.has(canonicalEmailKey(profile.email))) continue;
    if (!(await ctx.db.get("attendanceMembers", profile.memberId))) continue;
    const left = await ctx.db
      .query("attendanceAuditLog")
      .withIndex("by_member_and_action", (q) =>
        q.eq("memberId", profile.memberId).eq("action", "member.leftStaff")
      )
      .order("desc")
      .first();
    if (left && left._creationTime >= since) continue;
    seen.add(profile.memberId);
    pending.push({ profile, memberId: profile.memberId });
  }
  return pending.sort((a, b) => a.profile.email.localeCompare(b.profile.email));
}

async function rolloverBatch(
  ctx: MutationCtx,
  opts: { dryRun: boolean; year: number; limit: number }
) {
  if (!Number.isInteger(opts.limit) || opts.limit < 1) {
    throw new ConvexError("limit must be a positive whole number.");
  }
  const unlinked = await unlinkedStaff(ctx, opts.year);
  const returning = new Set<Id<"attendanceMembers">>();
  const knownByProfile = new Map<Id<"staffProfiles">, Id<"attendanceMembers"> | null>();
  for (const profile of unlinked) {
    const known = await knownMemberId(ctx, profile);
    knownByProfile.set(profile._id, known);
    if (known) returning.add(known);
  }
  const details: Detail[] = [];
  let budget = opts.limit;
  for (const profile of unlinked.slice(0, budget)) {
    if (!opts.dryRun) await linkOrCreateMember(ctx, profile, ROLLOVER_ACTOR);
    details.push({
      email: profile.email.toLowerCase(),
      name: personDisplayName(profile.name, profile.email),
      action: knownByProfile.get(profile._id) ? "linked" : "created",
    });
  }
  budget -= Math.min(budget, unlinked.length);
  const leavers = (await pendingLeavers(ctx, opts.year)).filter((l) => !returning.has(l.memberId));
  for (const { profile, memberId } of leavers.slice(0, budget)) {
    if (!opts.dryRun) await leaveStaff(ctx, memberId, profile, opts.year, ROLLOVER_ACTOR);
    details.push({
      email: profile.email.toLowerCase(),
      name: personDisplayName(profile.name, profile.email),
      action: "left",
    });
  }
  const count = (action: Detail["action"]) => details.filter((d) => d.action === action).length;
  return {
    dryRun: opts.dryRun,
    year: opts.year,
    linked: count("linked"),
    created: count("created"),
    left: count("left"),
    remaining: unlinked.length + leavers.length - details.length,
    details,
  };
}

export const staffRollover = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    year: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: resultValidator,
  handler: async (ctx, { dryRun = true, year, limit = 25 }) =>
    await rolloverBatch(ctx, {
      dryRun,
      year: year ?? staffYearForDate(new Date()),
      limit,
    }),
});

export const staffRolloverOnOct1 = internalMutation({
  args: { year: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { year }) => {
    const staffYear = year ?? staffYearForDate(new Date());
    const result = await rolloverBatch(ctx, { dryRun: false, year: staffYear, limit: 25 });
    if (result.remaining > 0) {
      await ctx.scheduler.runAfter(0, internal.staffLeavers.staffRolloverOnOct1, {
        year: staffYear,
      });
    }
    return null;
  },
});
