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
import { APPLE_FALLBACK_NAME } from "./appleIdentity";
import { revokeAppleTokens } from "./appleRevoke";
import { isOrgEmail } from "./model";
import { typedMatches } from "../shared/typedConfirm";

const accountKind = v.union(v.literal("sow"), v.literal("apple"));

const REFRESH_TOKEN_BATCH = 500;

export const WIPE_BATCH = 500;

export const sameName = typedMatches;

async function describe(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (!user) return null;
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .take(20);
  const apple = accounts.find((a) => a.provider === "apple");
  return {
    name: user.name?.trim() || user.email || "DELETE",
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

async function deleteBatch<T extends { _id: string }>(
  rows: T[],
  remove: (row: T) => Promise<void>
): Promise<boolean> {
  for (const row of rows) await remove(row);
  return rows.length === WIPE_BATCH;
}

async function deleteByEmail(
  ctx: MutationCtx,
  email: string,
  includeGuestData: boolean
): Promise<boolean> {
  const more = [
    await deleteBatch(
      await ctx.db.query("pushTokens").withIndex("by_email", (q) => q.eq("email", email)).take(WIPE_BATCH),
      (row) => ctx.db.delete("pushTokens", row._id)
    ),
    await deleteBatch(
      await ctx.db.query("lastSeen").withIndex("by_email", (q) => q.eq("email", email)).take(WIPE_BATCH),
      (row) => ctx.db.delete("lastSeen", row._id)
    ),
    await deleteBatch(
      await ctx.db
        .query("appInstalls")
        .withIndex("by_email_and_platform", (q) => q.eq("email", email))
        .take(WIPE_BATCH),
      (row) => ctx.db.delete("appInstalls", row._id)
    ),
  ];
  if (includeGuestData) {
    more.push(
      await deleteBatch(
        await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userEmail", email))
          .take(WIPE_BATCH),
        (row) => ctx.db.delete("notifications", row._id)
      )
    );
  }
  return more.some(Boolean);
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
      .take(WIPE_BATCH);
    for (const session of sessions) await ctx.db.delete("authSessions", session._id);
    if (sessions.length > 0) {
      await ctx.scheduler.runAfter(0, internal.account.purgeRefreshTokens, {
        sessionIds: sessions.map((s) => s._id),
      });
    }

    const email = user.email?.toLowerCase();
    const moreByEmail = email ? await deleteByEmail(ctx, email, !isOrgEmail(email)) : false;
    if (sessions.length === WIPE_BATCH || moreByEmail) {
      await ctx.scheduler.runAfter(0, internal.account.wipe, { userId });
      return null;
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

    if (user.avatarId && (await ctx.db.system.get(user.avatarId))) {
      await ctx.storage.delete(user.avatarId);
    }
    await ctx.db.delete("users", userId);
    return null;
  },
});

export const fillFromApple = internalMutation({
  args: { userId: v.id("users"), email: v.union(v.string(), v.null()), name: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { userId, email, name }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    const patch: { email?: string; name?: string } = {};
    if (email && !user.email) {
      const taken = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();
      if (!taken) patch.email = email;
    }
    if (name && (!user.name || user.name === APPLE_FALLBACK_NAME)) patch.name = name;
    if (patch.email !== undefined || patch.name !== undefined) {
      await ctx.db.patch("users", userId, patch);
    }
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
