import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import { getProfile, optionalProfile, requireProfile } from "./model";
import { actionOwnerEmail, appUrl, notify } from "./requests";
import { ALLOWED_REACTIONS } from "../shared/flow";

/** Display name for an email: staff profile first, directory fallback, else null. */
async function resolveName(
  ctx: QueryCtx,
  email: string,
  year: number
): Promise<string | null> {
  const profile = await getProfile(ctx, email, year);
  if (profile?.name) return profile.name;
  const dirUser = await ctx.db
    .query("directoryUsers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return dirUser?.name ?? null;
}

/**
 * Post a comment on a request's clarification thread. Notifies whoever the
 * request currently needs action from; if the commenter IS that person (or the
 * request is no longer awaiting anyone), the requester is notified instead.
 */
export const add = mutation({
  args: { requestId: v.id("requests"), body: v.string() },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const body = args.body.trim();
    if (!body) throw new ConvexError("Write a comment first.");
    if (body.length > 2000) throw new ConvexError("That comment is too long.");
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) throw new ConvexError("Request not found.");

    const commentId = await ctx.db.insert("requestComments", {
      requestId: args.requestId,
      authorEmail: email,
      body,
    });

    // Route the notification: the current action owner, unless that's the
    // commenter — then fall back to the requester.
    const owner = await actionOwnerEmail(ctx, request);
    const recipient =
      owner && owner !== email
        ? owner
        : request.requesterEmail !== email
          ? request.requesterEmail
          : undefined;
    if (recipient) {
      await notify(
        ctx,
        recipient,
        `New comment on the $${request.amount} ${request.department} request`,
        `${email} commented:\n"${body}"`,
        `/request/${request._id}`
      );
    }
    return commentId;
  },
});

type ReactionGroup = {
  emoji: string;
  count: number;
  mine: boolean;
};

/** The full comment thread for a request, with reactions grouped per emoji. */
export const list = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;

    // collect() (not take(N)) so long threads are never truncated; a single
    // request's comments are a naturally small set.
    const comments = (
      await ctx.db
        .query("requestComments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).sort((a, b) => a._creationTime - b._creationTime);

    const result = [];
    for (const comment of comments) {
      const reactions = await ctx.db
        .query("commentReactions")
        .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
        .collect();
      const byEmoji = new Map<string, ReactionGroup>();
      for (const reaction of reactions) {
        const group =
          byEmoji.get(reaction.emoji) ??
          { emoji: reaction.emoji, count: 0, mine: false };
        group.count++;
        if (reaction.userEmail === caller.email) group.mine = true;
        byEmoji.set(reaction.emoji, group);
      }
      result.push({
        id: comment._id,
        authorEmail: comment.authorEmail,
        authorName: await resolveName(ctx, comment.authorEmail, request.year),
        body: comment.body,
        at: comment._creationTime,
        isMine: comment.authorEmail === caller.email,
        reactions: [...byEmoji.values()].sort((a, b) => b.count - a.count),
      });
    }
    return result;
  },
});

/** Comments by others on one request the given user hasn't read yet. */
async function unreadCountFor(
  ctx: QueryCtx,
  requestId: Id<"requests">,
  email: string
): Promise<number> {
  const read = await ctx.db
    .query("commentReads")
    .withIndex("by_request_and_user", (q) =>
      q.eq("requestId", requestId).eq("userEmail", email)
    )
    .unique();
  const lastReadAt = read?.lastReadAt ?? 0;
  const comments: Doc<"requestComments">[] = await ctx.db
    .query("requestComments")
    .withIndex("by_request", (q) => q.eq("requestId", requestId))
    .collect(); // small per-request set; never truncate the count
  return comments.filter(
    (c) => c.authorEmail !== email && c._creationTime > lastReadAt
  ).length;
}

/** How many comments by others the caller hasn't seen yet (for the badge). */
export const unreadCount = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    return await unreadCountFor(ctx, args.requestId, caller.email);
  },
});

/**
 * Total unread comments across a set of requests — used to fold unread counts
 * into the Mine / To Review segment badges. Deduplicates the ids.
 */
export const unreadTotalForRequests = query({
  args: { requestIds: v.array(v.id("requests")) },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return 0;
    let total = 0;
    for (const requestId of new Set(args.requestIds)) {
      total += await unreadCountFor(ctx, requestId, caller.email);
    }
    return total;
  },
});

/**
 * Total unread comments the caller has across all their own requests.
 * Used for the tab-level unread indicator in the navigation bar.
 */
export const myUnreadTotal = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return 0;
    const { email, year } = caller;
    const fetch = (y: number) =>
      ctx.db
        .query("requests")
        .withIndex("by_year_and_requester", (q) =>
          q.eq("year", y).eq("requesterEmail", email)
        )
        .take(200);
    const current = await fetch(year);
    const prev = await fetch(year - 1);
    let total = 0;
    for (const req of [...current, ...prev]) {
      total += await unreadCountFor(ctx, req._id, email);
    }
    return total;
  },
});


/** Marks the caller as having read this request's comments up to now. */
export const markRead = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found.");
    const existing = await ctx.db
      .query("commentReads")
      .withIndex("by_request_and_user", (q) =>
        q.eq("requestId", args.requestId).eq("userEmail", email)
      )
      .unique();
    if (existing) {
      await ctx.db.patch("commentReads", existing._id, { lastReadAt: Date.now() });
    } else {
      await ctx.db.insert("commentReads", {
        requestId: args.requestId,
        userEmail: email,
        lastReadAt: Date.now(),
      });
    }
    return null;
  },
});

/** Adds the caller's emoji reaction to a comment, or removes it if already set. */
export const toggleReaction = mutation({
  args: { commentId: v.id("requestComments"), emoji: v.string() },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const emoji = args.emoji.trim();
    if (!emoji || !ALLOWED_REACTIONS.has(emoji)) {
      throw new ConvexError("Pick a single emoji.");
    }
    const comment = await ctx.db.get("requestComments", args.commentId);
    if (!comment) throw new ConvexError("Comment not found.");
    const existing = await ctx.db
      .query("commentReactions")
      .withIndex("by_comment_user_emoji", (q) =>
        q.eq("commentId", args.commentId).eq("userEmail", email).eq("emoji", emoji)
      )
      .unique();
    if (existing) {
      await ctx.db.delete("commentReactions", existing._id);
      return false; // removed
    }
    await ctx.db.insert("commentReactions", {
      commentId: args.commentId,
      userEmail: email,
      emoji,
    });
    return true; // added
  },
});
