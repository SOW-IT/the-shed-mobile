import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx, QueryCtx } from "./_generated/server";
import { appCanOpen, APP_LINK_MARKER, isAppVersion, versionNeededFor } from "../shared/appLinks";
import { optionalEmail } from "./model";

type Ctx = QueryCtx | MutationCtx;

/** The app tells us which version it is, so links can match what it can open. */
export const report = mutation({
  args: { platform: v.union(v.literal("ios"), v.literal("android")), version: v.string() },
  handler: async (ctx, args) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    if (!isAppVersion(args.version)) throw new ConvexError("That isn't an app version.");
    const existing = await ctx.db
      .query("appInstalls")
      .withIndex("by_email_and_platform", (q) =>
        q.eq("email", email).eq("platform", args.platform)
      )
      .unique();
    const seenAt = Date.now();
    if (existing) {
      await ctx.db.patch("appInstalls", existing._id, { version: args.version, seenAt });
    } else {
      await ctx.db.insert("appInstalls", { email, ...args, seenAt });
    }
    return null;
  },
});

/**
 * Whether `email`'s app can open `path`: every phone they've used the app on
 * has a new enough version. Someone with no reports (no app, or an app too
 * old to report) can't.
 */
export async function appOpensFor(ctx: Ctx, email: string, path: string): Promise<boolean> {
  if (!versionNeededFor(path)) return true;
  const installs = await ctx.db
    .query("appInstalls")
    .withIndex("by_email_and_platform", (q) => q.eq("email", email))
    .take(2);
  return installs.length > 0 && installs.every((i) => appCanOpen(path, i.version));
}

/**
 * The link to put in an email. A page newer than some apps is marked for the
 * app only when the recipient's app can open it; otherwise their phone stays
 * on the web version.
 */
export async function emailLinkFor(ctx: Ctx, email: string, path: string): Promise<string> {
  return versionNeededFor(path) && (await appOpensFor(ctx, email, path))
    ? `${path}${APP_LINK_MARKER}`
    : path;
}
