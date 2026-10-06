import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import { designRequestName } from "../shared/designRequests";
import { accessTo, tellRequester, tellTeam } from "./designRequests";
import { displayName, optionalProfile, requireProfile } from "./model";

const COMMENTS_LIMIT = 500;
const MAX_COMMENT_LENGTH = 2000;

const commentsFor = (ctx: QueryCtx, id: Id<"designRequests">, after = -1) =>
  ctx.db
    .query("designRequestComments")
    .withIndex("by_designRequest_and_postedAt", (q) =>
      q.eq("designRequestId", id).gt("postedAt", after)
    );

export const list = query({
  args: { id: v.id("designRequests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const request = await ctx.db.get("designRequests", args.id);
    if (!request || !(await accessTo(ctx, caller, request)).canView) return null;
    const comments = await commentsFor(ctx, args.id).take(COMMENTS_LIMIT);
    const names = new Map<string, Promise<string>>();
    return await Promise.all(
      comments.map(async (comment) => {
        let name = names.get(comment.authorEmail);
        if (!name) {
          name = displayName(ctx, comment.authorEmail, request.year);
          names.set(comment.authorEmail, name);
        }
        return {
          id: comment._id,
          authorEmail: comment.authorEmail,
          authorName: await name,
          body: comment.body,
          at: comment.postedAt,
          isMine: comment.authorEmail === caller.email,
        };
      })
    );
  },
});

export const add = mutation({
  args: { id: v.id("designRequests"), body: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const body = args.body.trim();
    if (!body) throw new ConvexError("Write a comment first.");
    if (body.length > MAX_COMMENT_LENGTH) throw new ConvexError("That comment is too long.");
    const request = await ctx.db.get("designRequests", args.id);
    if (!request) throw new ConvexError("Design request not found.");
    if (!(await accessTo(ctx, caller, request)).canComment) {
      throw new ConvexError(
        "Only the requester and the Marketing team can comment on a design request."
      );
    }
    const commentId = await ctx.db.insert("designRequestComments", {
      designRequestId: request._id,
      authorEmail: caller.email,
      body,
      postedAt: Date.now(),
    });
    const author = await displayName(ctx, caller.email, request.year);
    const subject = `New comment on ${designRequestName(request)}`;
    const message = `${author} commented:\n"${body}"`;
    if (request.requesterEmail !== caller.email) {
      await tellRequester(ctx, request, {
        actor: caller.email,
        subject,
        pushTitle: "New comment",
        body: message,
        thread: true,
      });
    }
    await tellTeam(ctx, request, {
      actor: caller.email,
      subject,
      pushTitle: "New comment",
      body: message,
      thread: true,
    });
    return commentId;
  },
});

/**
 * Unread comments per design request for the caller: ones written since they
 * last opened the thread, by someone else. Comments imported from the old
 * app never count, so the import doesn't light up every old request.
 */
export const unreadCounts = query({
  args: { ids: v.array(v.id("designRequests")) },
  handler: async (ctx, args): Promise<Record<Id<"designRequests">, number>> => {
    const counts: Record<Id<"designRequests">, number> = {};
    const caller = await optionalProfile(ctx);
    if (!caller) return counts;
    for (const id of new Set(args.ids)) {
      const read = await ctx.db
        .query("designRequestCommentReads")
        .withIndex("by_designRequest_and_user", (q) =>
          q.eq("designRequestId", id).eq("userEmail", caller.email)
        )
        .unique();
      const unread = (
        await commentsFor(ctx, id, read?.lastReadAt ?? 0).take(COMMENTS_LIMIT)
      ).filter((c) => c.authorEmail !== caller.email && c.legacyKey === undefined);
      if (unread.length > 0) counts[id] = unread.length;
    }
    return counts;
  },
});

export const markRead = mutation({
  args: { id: v.id("designRequests") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    if (!(await ctx.db.get("designRequests", args.id))) {
      throw new ConvexError("Design request not found.");
    }
    const newest = await ctx.db
      .query("designRequestComments")
      .withIndex("by_designRequest_and_postedAt", (q) =>
        q.eq("designRequestId", args.id)
      )
      .order("desc")
      .first();
    const lastReadAt = Math.max(Date.now(), newest?.postedAt ?? 0);
    const existing = await ctx.db
      .query("designRequestCommentReads")
      .withIndex("by_designRequest_and_user", (q) =>
        q.eq("designRequestId", args.id).eq("userEmail", email)
      )
      .unique();
    if (existing) {
      await ctx.db.patch("designRequestCommentReads", existing._id, { lastReadAt });
    } else {
      await ctx.db.insert("designRequestCommentReads", {
        designRequestId: args.id,
        userEmail: email,
        lastReadAt,
      });
    }
    return null;
  },
});
