import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { optionalProfile, requireProfile } from "./model";

/** How many notifications the feed loads (newest first). */
const FEED_LIMIT = 50;
/** Cap for the unread badge count probe. */
const UNREAD_PROBE = 100;

/**
 * The caller's notification feed, newest first. Returns null while auth is
 * still attaching (so the screen shows a spinner rather than "empty").
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userEmail", caller.email))
      .order("desc")
      .take(FEED_LIMIT);
    return rows.map((n) => ({
      id: n._id,
      title: n.title,
      body: n.body,
      url: n.url ?? null,
      read: n.read,
      at: n._creationTime,
    }));
  },
});

/** Unread count for the top-bar bell badge (probed, capped at UNREAD_PROBE). */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userEmail", caller.email).eq("read", false)
      )
      .take(UNREAD_PROBE);
    return unread.length;
  },
});

/** Marks one of the caller's notifications read. */
export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const notification = await ctx.db.get("notifications", args.id);
    if (!notification || notification.userEmail !== email) {
      throw new ConvexError("Notification not found.");
    }
    if (!notification.read) {
      await ctx.db.patch("notifications", args.id, { read: true });
    }
    return null;
  },
});

/**
 * Marks the caller's notifications for one request read — called when they open
 * that request (or its comment thread), so a notification clears once they've
 * actually seen what it was about. No-ops gracefully while auth is attaching.
 */
export const markReadForRequest = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    for (;;) {
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_request_and_read", (q) =>
          q
            .eq("userEmail", caller.email)
            .eq("requestId", args.requestId)
            .eq("read", false)
        )
        .take(200);
      if (unread.length === 0) break;
      for (const notification of unread) {
        await ctx.db.patch("notifications", notification._id, { read: true });
      }
    }
    return null;
  },
});

/** Marks all of the caller's notifications read, in bounded batches. */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const { email } = await requireProfile(ctx);
    for (;;) {
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_read", (q) =>
          q.eq("userEmail", email).eq("read", false)
        )
        .take(200);
      if (unread.length === 0) break;
      for (const notification of unread) {
        await ctx.db.patch("notifications", notification._id, { read: true });
      }
    }
    return null;
  },
});
