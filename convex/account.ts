import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import { revokeAppleTokens } from "./appleRevoke";
import { isOrgEmail } from "./model";

const accountKind = v.union(v.literal("sow"), v.literal("apple"));

const REFRESH_TOKEN_BATCH = 500;

export const sameName = (typed: string, name: string): boolean => {
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(typed) !== "" && normalize(typed) === normalize(name);
};

async function describe(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (!user) return null;
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .take(20);
  const apple = accounts.find((a) => a.provider === "apple");
  return {
    name: user.name?.trim() || user.email || "",
    kind: apple ? ("apple" as const) : ("sow" as const),
    appleSubject: apple?.providerAccountId ?? null,
  };
}

export const get = query({
  args: {},
  returns: v.union(v.null(), v.object({ name: v.string(), kind: accountKind })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const account = userId === null ? null : await describe(ctx, userId);
    return account && { name: account.name, kind: account.kind };
  },
});

export const forDeletion = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({ name: v.string(), kind: accountKind, appleSubject: v.union(v.string(), v.null()) })
  ),
  handler: async (ctx, { userId }) => await describe(ctx, userId),
});

async function deleteByEmail(ctx: MutationCtx, email: string, includeGuestData: boolean) {
  const tokens = await ctx.db
    .query("pushTokens")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(100);
  for (const row of tokens) await ctx.db.delete("pushTokens", row._id);
  const seen = await ctx.db
    .query("lastSeen")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(10);
  for (const row of seen) await ctx.db.delete("lastSeen", row._id);
  const installs = await ctx.db
    .query("appInstalls")
    .withIndex("by_email_and_platform", (q) => q.eq("email", email))
    .take(10);
  for (const row of installs) await ctx.db.delete("appInstalls", row._id);
  if (!includeGuestData) return;
  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_user", (q) => q.eq("userEmail", email))
    .take(1000);
  for (const row of notifications) await ctx.db.delete("notifications", row._id);
}

export const wipe = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return null;

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .take(1000);
    for (const session of sessions) await ctx.db.delete("authSessions", session._id);
    if (sessions.length > 0) {
      await ctx.scheduler.runAfter(0, internal.account.purgeRefreshTokens, {
        sessionIds: sessions.map((s) => s._id),
      });
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(20);
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .take(100);
      for (const code of codes) await ctx.db.delete("authVerificationCodes", code._id);
      await ctx.db.delete("authAccounts", account._id);
    }

    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(100);
    for (const profile of profiles) {
      await ctx.db.patch("staffProfiles", profile._id, { userId: undefined });
    }

    const email = user.email?.toLowerCase();
    if (email) await deleteByEmail(ctx, email, !isOrgEmail(email));

    if (user.avatarId && (await ctx.db.system.get(user.avatarId))) {
      await ctx.storage.delete(user.avatarId);
    }
    await ctx.db.delete("users", userId);
    return null;
  },
});

export const purgeRefreshTokens = internalMutation({
  args: { sessionIds: v.array(v.id("authSessions")) },
  returns: v.null(),
  handler: async (ctx, { sessionIds }) => {
    let budget = REFRESH_TOKEN_BATCH;
    const remaining = [...sessionIds];
    while (remaining.length > 0 && budget > 0) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", remaining[0]))
        .take(budget);
      for (const token of tokens) await ctx.db.delete("authRefreshTokens", token._id);
      budget -= tokens.length;
      if (budget > 0) remaining.shift();
    }
    if (remaining.length > 0) {
      await ctx.scheduler.runAfter(0, internal.account.purgeRefreshTokens, {
        sessionIds: remaining,
      });
    }
    return null;
  },
});

export const deleteMine = action({
  args: {
    confirmName: v.string(),
    apple: v.optional(v.object({ authorizationCode: v.string(), clientId: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const account =
      userId === null ? null : await ctx.runQuery(internal.account.forDeletion, { userId });
    if (userId === null || !account) throw new ConvexError("You must be signed in.");
    if (!sameName(args.confirmName, account.name)) {
      throw new ConvexError("That name doesn't match. Type your name exactly as shown.");
    }
    if (account.appleSubject && args.apple) {
      await revokeAppleTokens({ ...args.apple, subject: account.appleSubject });
    }
    await ctx.runMutation(internal.account.wipe, { userId });
    return null;
  },
});
