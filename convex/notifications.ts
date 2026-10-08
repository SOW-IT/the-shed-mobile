import { ConvexError, v } from "convex/values";
import { appCanOpen } from "../shared/appLinks";
import { mutation, query } from "./_generated/server";
import { optionalEmail, optionalProfile, requireProfile } from "./model";

const FEED_LIMIT = 50;
const UNREAD_PROBE = 100;

/**
 * The bell's feed. Apps from 2.3.1 send their version; an older app sends
 * none, and gets no link for pages it can't open (it would show "Unmatched
 * Route"), so tapping one just marks it read.
 */
export const list = query({
  args: { appVersion: v.optional(v.string()) },
  handler: async (ctx, args) => {
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
      url: n.url && appCanOpen(n.url, args.appVersion) ? n.url : null,
      read: n.read,
      at: n._creationTime,
    }));
  },
});

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

export const markReadForDesignRequest = mutation({
  args: { designRequestId: v.id("designRequests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    for (;;) {
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_designRequest_and_read", (q) =>
          q
            .eq("userEmail", caller.email)
            .eq("designRequestId", args.designRequestId)
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

export const markReadForEventRequest = mutation({
  args: { eventRequestId: v.id("eventRequests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    for (;;) {
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_eventRequest_and_read", (q) =>
          q
            .eq("userEmail", caller.email)
            .eq("eventRequestId", args.eventRequestId)
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

export const markReadForAnnouncement = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_announcement_and_read", (q) =>
        q
          .eq("userEmail", email)
          .eq("announcementId", args.announcementId)
          .eq("read", false)
      )
      .take(20);
    for (const notification of unread) {
      await ctx.db.patch("notifications", notification._id, { read: true });
    }
    return null;
  },
});

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
