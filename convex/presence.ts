import { staffEmailCandidates } from "../shared/rollcallImport";
import { mutation, QueryCtx } from "./_generated/server";
import { optionalEmail } from "./model";

/** The app says it's open about this often; writes are never closer. */
export const SEEN_WRITE_INTERVAL_MS = 5 * 60_000;

/** Older sign-in sessions add nothing once a newer one has been refreshed. */
const RECENT_SESSIONS = 20;

/** The signed-in person has The SHED open (web or app). */
export const markSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const now = Date.now();
    const existing = await ctx.db
      .query("lastSeen")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing && now - existing.at < SEEN_WRITE_INTERVAL_MS) return null;
    if (existing) await ctx.db.patch("lastSeen", existing._id, { at: now });
    else await ctx.db.insert("lastSeen", { email, at: now });
    return null;
  },
});

/** The SHED accounts for `email`, under either staff email spelling. */
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

/**
 * When `email` last had The SHED open. Going forward that's the app's own
 * report (markSeen); before it existed, a sign-in session being refreshed
 * (about hourly while open) or a phone app checking in says the same.
 */
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
