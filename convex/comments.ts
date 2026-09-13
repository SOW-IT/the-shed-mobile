import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import {
  currentStaffYear,
  getApprovers,
  optionalProfile,
  requireProfile,
  resolveName,
  withDelegatesForYear,
} from "./model";
import {
  actionOwnerEmail,
  involvedApproverEmails,
  notify,
  requesterRequestsInYear,
  requestUrl,
} from "./requests";
import { ALLOWED_REACTIONS, APPROVED, eventStaffYear } from "../shared/flow";
import { formatAmount } from "../shared/money";

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

    const recipients = new Set<string>();
    const owner = await actionOwnerEmail(ctx, request);
    const reqYear = eventStaffYear(request._creationTime);
    if (owner && owner !== email) {
      for (const year of new Set([reqYear, currentStaffYear()])) {
        for (const to of await withDelegatesForYear(ctx, year, owner)) {
          if (to !== email) recipients.add(to);
        }
      }
    } else if (request.requesterEmail !== email) {
      recipients.add(request.requesterEmail);
    }
    const approvers = await getApprovers(ctx, reqYear, request.department);
    for (const approver of involvedApproverEmails(request, approvers, [APPROVED])) {
      if (approver !== email) recipients.add(approver);
    }
    if (recipients.size > 0) {
      const authorName = (await resolveName(ctx, email, reqYear)) ?? email;
      for (const to of recipients) {
        await notify(ctx, {
          to,
          actor: email,
          subject: `New comment on the $${formatAmount(request.amount)} ${request.department} request`,
          pushTitle: "New comment",
          body: `${authorName} commented:\n"${body}"`,
          url: requestUrl(to, request, { thread: true }),
          requestId: request._id,
        });
      }
    }
    return commentId;
  },
});

type ReactionGroup = {
  emoji: string;
  count: number;
  mine: boolean;
};

export const list = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;

    const comments = (
      await ctx.db
        .query("requestComments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).sort((a, b) => a._creationTime - b._creationTime);

    const threadYear = eventStaffYear(request._creationTime);
    const nameByEmail = new Map<string, Promise<string | null>>();
    const nameFor = (email: string): Promise<string | null> => {
      let name = nameByEmail.get(email);
      if (!name) {
        name = resolveName(ctx, email, threadYear);
        nameByEmail.set(email, name);
      }
      return name;
    };

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
        authorName: await nameFor(comment.authorEmail),
        body: comment.body,
        at: comment._creationTime,
        isMine: comment.authorEmail === caller.email,
        reactions: [...byEmoji.values()].sort((a, b) => b.count - a.count),
      });
    }
    return result;
  },
});

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
  // `by_request` implicitly ends with `_creationTime`, so only the comments
  // newer than the read marker are read at all.
  const unread = await ctx.db
    .query("requestComments")
    .withIndex("by_request", (q) =>
      q.eq("requestId", requestId).gt("_creationTime", lastReadAt)
    )
    .collect();
  return unread.filter((c) => c.authorEmail !== email).length;
}

export const unreadCount = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;
    return await unreadCountFor(ctx, args.requestId, caller.email);
  },
});

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

export const unreadCountsForRequests = query({
  args: { requestIds: v.array(v.id("requests")) },
  handler: async (ctx, args): Promise<Record<Id<"requests">, number>> => {
    const caller = await optionalProfile(ctx);
    const counts: Record<Id<"requests">, number> = {};
    if (!caller) return counts;
    for (const requestId of new Set(args.requestIds)) {
      const unread = await unreadCountFor(ctx, requestId, caller.email);
      if (unread > 0) counts[requestId] = unread;
    }
    return counts;
  },
});

export const myUnreadTotal = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return 0;
    const { email, year } = caller;
    const fetch = (y: number) => requesterRequestsInYear(ctx, email, y).collect();
    const current = await fetch(year);
    const prev = await fetch(year - 1);
    let total = 0;
    for (const req of [...current, ...prev]) {
      total += await unreadCountFor(ctx, req._id, email);
    }
    return total;
  },
});

export const markRead = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) throw new ConvexError("Request not found.");
    const newest = await ctx.db
      .query("requestComments")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .order("desc")
      .first();
    const lastReadAt = Math.max(Date.now(), newest?._creationTime ?? 0);
    const existing = await ctx.db
      .query("commentReads")
      .withIndex("by_request_and_user", (q) =>
        q.eq("requestId", args.requestId).eq("userEmail", email)
      )
      .unique();
    if (existing) {
      await ctx.db.patch("commentReads", existing._id, { lastReadAt });
    } else {
      await ctx.db.insert("commentReads", {
        requestId: args.requestId,
        userEmail: email,
        lastReadAt,
      });
    }
    return null;
  },
});

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
      return false;
    }
    await ctx.db.insert("commentReactions", {
      commentId: args.commentId,
      userEmail: email,
      emoji,
    });
    return true;
  },
});
