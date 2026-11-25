import { v } from "convex/values";
import { shouldWriteAppSeen } from "../shared/appPresence";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { mutation, MutationCtx, QueryCtx } from "./_generated/server";
import { optionalEmail } from "./model";

export const SEEN_WRITE_INTERVAL_MS = 5 * 60_000;

const RECENT_SESSIONS = 20;

const touchLastSeen = async (ctx: MutationCtx, email: string, now: number, gap: number) => {
  const existing = await ctx.db
    .query("lastSeen")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (existing && now - existing.at < gap) return;
  if (existing) await ctx.db.patch("lastSeen", existing._id, { at: now });
  else await ctx.db.insert("lastSeen", { email, at: now });
};

export const appPresenceOf = (ctx: QueryCtx, email: string) =>
  ctx.db
    .query("appPresence")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

export const markSeen = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (email) await touchLastSeen(ctx, email, Date.now(), SEEN_WRITE_INTERVAL_MS);
    return null;
  },
});

export const appHeartbeat = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const now = Date.now();
    await touchLastSeen(ctx, email, now, SEEN_WRITE_INTERVAL_MS);
    const row = await appPresenceOf(ctx, email);
    if (!shouldWriteAppSeen(row?.appSeenAt, now)) return null;
    if (row) await ctx.db.patch("appPresence", row._id, { appSeenAt: now });
    else await ctx.db.insert("appPresence", { email, appSeenAt: now });
    return null;
  },
});

export const appAway = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const row = await appPresenceOf(ctx, email);
    if (!row) return null;
    await touchLastSeen(ctx, email, Date.now(), 0);
    await ctx.db.delete("appPresence", row._id);
    return null;
  },
});

const usersFor = async (ctx: QueryCtx, email: string) => {
  const users = [];
  for (const candidate of staffEmailCandidates(email)) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", candidate))
      .first();
    if (user) users.push(user);
  }
  return users;
};

export const hasSignedIn = async (ctx: QueryCtx, email: string): Promise<boolean> =>
  (await usersFor(ctx, email)).length > 0;

export async function lastOnlineAt(ctx: QueryCtx, email: string): Promise<number | null> {
  let latest: number | null = null;
  const saw = (at: number | undefined) => {
    if (at !== undefined && (latest === null || at > latest)) latest = at;
  };
  for (const candidate of staffEmailCandidates(email)) {
    const seen = await ctx.db
      .query("lastSeen")
      .withIndex("by_email", (q) => q.eq("email", candidate))
      .unique();
    saw(seen?.at);
    const installs = await ctx.db
      .query("appInstalls")
      .withIndex("by_email_and_platform", (q) => q.eq("email", candidate))
      .take(2);
    for (const install of installs) saw(install.seenAt);
  }
  for (const user of await usersFor(ctx, email)) {
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(RECENT_SESSIONS);
    for (const session of sessions) {
      saw(session._creationTime);
      const refreshed = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .order("desc")
        .first();
      saw(refreshed?._creationTime);
    }
  }
  return latest;
}
