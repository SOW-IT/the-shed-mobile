import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { resolveUniversity, ROLE_FIELD_KEY } from "../shared/attendanceMemberMeta";
import {
  duplicatePairs,
  memberNameMatch,
  type NameMatch,
  nameWords,
  sameCampus,
} from "../shared/mergeSuggestions";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { logAttendanceAction } from "./attendanceAudit";
import { staffYearsOf } from "./attendanceMembers";
import { currentStaffYear, optionalEmail, requireAdmin } from "./model";

const MEMBER_PAGE = 500;
const PAIRS_PER_WRITE = 10;
const MAX_SIGN_INS = 400;
const MAX_LISTED = 200;
const PRUNE_BATCH = 200;
const MAX_DISMISSED = 1000;
const MAX_FIELDS = 100;

type Ctx = QueryCtx | MutationCtx;
type MemberId = Id<"attendanceMembers">;
type MetadataField = Doc<"attendanceMetadata">;

export type MemberPairSide = {
  memberId: MemberId;
  name: string;
  email?: string;
  campus?: string;
  role?: string;
  signIns: number;
  lastSignIn: number | null;
};

export type MemberPairSuggestion = {
  id: Id<"memberPairSuggestions">;
  match: NameMatch;
  a: MemberPairSide;
  b: MemberPairSide;
};

type MemberPage = {
  isDone: boolean;
  continueCursor: string;
  page: { id: MemberId; words: string[]; campus?: string }[];
};

const orderPair = (x: MemberId, y: MemberId): [MemberId, MemberId] => (x < y ? [x, y] : [y, x]);

const pairRow = (ctx: Ctx, memberA: MemberId, memberB: MemberId) =>
  ctx.db
    .query("memberPairSuggestions")
    .withIndex("by_members", (q) => q.eq("memberA", memberA).eq("memberB", memberB))
    .unique();

const signInsOf = (ctx: Ctx, memberId: MemberId) =>
  ctx.db
    .query("attendance")
    .withIndex("by_member", (q) => q.eq("memberId", memberId))
    .take(MAX_SIGN_INS);

const metadataFields = (ctx: Ctx) => ctx.db.query("attendanceMetadata").take(MAX_FIELDS);

const roleLabel = (
  roleField: MetadataField | undefined,
  metadata: Record<string, string> | undefined
): string | undefined => {
  if (!roleField) return undefined;
  const raw = metadata?.[roleField._id];
  return raw ? (roleField.values?.[raw] ?? raw) : undefined;
};

export const memberPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }): Promise<MemberPage> => {
    const fields = await metadataFields(ctx);
    const result = await ctx.db.query("attendanceMembers").paginate(paginationOpts);
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map((m) => ({
        id: m._id,
        words: nameWords(m.name),
        campus: resolveUniversity(fields, m.metadata),
      })),
    };
  },
});

export const rebuild = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const builtAt = Date.now();
    const members: MemberPage["page"] = [];
    let cursor: string | null = null;
    do {
      const result: MemberPage = await ctx.runQuery(internal.memberPairSuggestions.memberPage, {
        paginationOpts: { numItems: MEMBER_PAGE, cursor },
      });
      members.push(...result.page);
      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor !== null);
    const pairs = duplicatePairs(members).map(({ a, b }) => ({ memberA: a.id, memberB: b.id }));
    for (let i = 0; i < pairs.length; i += PAIRS_PER_WRITE) {
      await ctx.runMutation(internal.memberPairSuggestions.writePairs, {
        builtAt,
        pairs: pairs.slice(i, i + PAIRS_PER_WRITE),
      });
    }
    await ctx.runMutation(internal.memberPairSuggestions.prune, { builtAt });
    return null;
  },
});

const neverAtOneEvent = async (
  ctx: Ctx,
  memberA: MemberId,
  memberB: MemberId
): Promise<boolean> => {
  const eventsOfA = new Set((await signInsOf(ctx, memberA)).map((r) => r.eventId));
  return !(await signInsOf(ctx, memberB)).some((r) => eventsOfA.has(r.eventId));
};

const staffRecently = async (ctx: Ctx, memberId: MemberId, year: number): Promise<boolean> => {
  const years = await staffYearsOf(ctx, memberId);
  return years.has(year) || years.has(year - 1);
};

export const writePairs = internalMutation({
  args: {
    builtAt: v.number(),
    pairs: v.array(
      v.object({ memberA: v.id("attendanceMembers"), memberB: v.id("attendanceMembers") })
    ),
  },
  returns: v.null(),
  handler: async (ctx, { builtAt, pairs }) => {
    const year = currentStaffYear();
    for (const { memberA, memberB } of pairs) {
      const [a, b] = await Promise.all([ctx.db.get(memberA), ctx.db.get(memberB)]);
      if (!a || !b) continue;
      if ((await staffRecently(ctx, memberA, year)) || (await staffRecently(ctx, memberB, year))) {
        continue;
      }
      if (!(await neverAtOneEvent(ctx, memberA, memberB))) continue;
      const existing = await pairRow(ctx, memberA, memberB);
      if (existing?.status === "dismissed") continue;
      if (existing) {
        await ctx.db.patch(existing._id, { builtAt });
      } else {
        await ctx.db.insert("memberPairSuggestions", { memberA, memberB, status: "open", builtAt });
      }
    }
    return null;
  },
});

export const prune = internalMutation({
  args: { builtAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { builtAt }) => {
    for (;;) {
      const stale = await ctx.db
        .query("memberPairSuggestions")
        .withIndex("by_status_and_builtAt", (q) => q.eq("status", "open").lt("builtAt", builtAt))
        .take(PRUNE_BATCH);
      for (const row of stale) await ctx.db.delete(row._id);
      if (stale.length < PRUNE_BATCH) break;
    }
    const dismissed = await ctx.db
      .query("memberPairSuggestions")
      .withIndex("by_status_and_builtAt", (q) => q.eq("status", "dismissed"))
      .take(MAX_DISMISSED);
    for (const row of dismissed) {
      const [a, b] = await Promise.all([ctx.db.get(row.memberA), ctx.db.get(row.memberB)]);
      if (!a || !b) await ctx.db.delete(row._id);
    }
    return null;
  },
});

const sideOf = async (
  ctx: Ctx,
  row: Doc<"attendanceMembers">,
  campus: string | undefined,
  roleField: MetadataField | undefined
): Promise<MemberPairSide> => {
  const records = await signInsOf(ctx, row._id);
  return {
    memberId: row._id,
    name: row.name,
    email: row.email,
    campus,
    role: roleLabel(roleField, row.metadata),
    signIns: records.length,
    lastSignIn: records.length ? Math.max(...records.map((r) => r.signInTime)) : null,
  };
};

export const list = query({
  args: {},
  handler: async (ctx): Promise<MemberPairSuggestion[] | null> => {
    if ((await optionalEmail(ctx)) === null) return null;
    await requireAdmin(ctx);
    const fields = await metadataFields(ctx);
    const roleField = fields.find((f) => f.key === ROLE_FIELD_KEY);
    const rows = await ctx.db
      .query("memberPairSuggestions")
      .withIndex("by_status_and_builtAt", (q) => q.eq("status", "open"))
      .take(MAX_LISTED);
    const suggestions: MemberPairSuggestion[] = [];
    for (const row of rows) {
      const [a, b] = await Promise.all([ctx.db.get(row.memberA), ctx.db.get(row.memberB)]);
      if (!a || !b) continue;
      const match = memberNameMatch(nameWords(a.name), nameWords(b.name));
      if (!match) continue;
      const campusA = resolveUniversity(fields, a.metadata);
      const campusB = resolveUniversity(fields, b.metadata);
      if (!sameCampus(campusA, campusB)) continue;
      suggestions.push({
        id: row._id,
        match,
        a: await sideOf(ctx, a, campusA, roleField),
        b: await sideOf(ctx, b, campusB, roleField),
      });
    }
    return suggestions.sort(
      (x, y) => x.a.name.localeCompare(y.a.name) || x.b.name.localeCompare(y.b.name)
    );
  },
});

export const dismiss = mutation({
  args: { memberA: v.id("attendanceMembers"), memberB: v.id("attendanceMembers") },
  handler: async (ctx, args) => {
    const { email: actorEmail } = await requireAdmin(ctx);
    const [memberA, memberB] = orderPair(args.memberA, args.memberB);
    if (memberA === memberB) throw new ConvexError("Pick two different people.");
    const [a, b] = await Promise.all([ctx.db.get(memberA), ctx.db.get(memberB)]);
    if (!a || !b) throw new ConvexError("That member no longer exists.");
    const existing = await pairRow(ctx, memberA, memberB);
    if (existing?.status === "dismissed") return null;
    const now = Date.now();
    const dismissal = { status: "dismissed" as const, dismissedBy: actorEmail, dismissedAt: now };
    if (existing) {
      await ctx.db.patch(existing._id, dismissal);
    } else {
      await ctx.db.insert("memberPairSuggestions", { memberA, memberB, builtAt: now, ...dismissal });
    }
    for (const [self, other] of [
      [a, b],
      [b, a],
    ]) {
      await logAttendanceAction(ctx, {
        actorEmail,
        entityType: "member",
        action: "member.notSame",
        summary: `Marked "${self.name}" as not the same person as "${other.name}"`,
        memberId: self._id,
        detail: `${other.name} (${other._id})`,
      });
    }
    return null;
  },
});
