import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import { SUB_FORM_KINDS, SUB_FORM_TEAMS, type SubFormKind } from "../shared/eventRequests";
import { subFormKindValidator } from "./eventRequestData";
import {
  accessTo,
  canCommentOn,
  directorOf,
  eventUrl,
  formName,
  optionalEventStaff,
  recipientsFor,
  requireEvent,
  requireEventStaff,
  stepApprover,
  subFormsOf,
  teamOf,
  tell,
} from "./eventRequestAccess";
import { displayName } from "./model";

const COMMENTS_LIMIT = 500;
const MAX_COMMENT_LENGTH = 2000;

const commentsFor = (
  ctx: QueryCtx,
  id: Id<"eventRequests">,
  form: SubFormKind,
  after = -1
) =>
  ctx.db
    .query("eventRequestComments")
    .withIndex("by_eventRequest_and_form_and_postedAt", (q) =>
      q.eq("eventRequestId", id).eq("form", form).gt("postedAt", after)
    );

/** A form's thread. Anyone who can see the event can read it. */
export const list = query({
  args: { id: v.id("eventRequests"), form: subFormKindValidator },
  handler: async (ctx, args) => {
    const caller = await optionalEventStaff(ctx);
    if (!caller) return null;
    const event = await ctx.db.get("eventRequests", args.id);
    if (!event || !(await accessTo(ctx, caller, event)).canView) return null;
    const comments = await commentsFor(ctx, args.id, args.form).take(COMMENTS_LIMIT);
    const names = new Map<string, Promise<string>>();
    return await Promise.all(
      comments.map(async (comment) => {
        let name = names.get(comment.authorEmail);
        if (!name) {
          name = displayName(ctx, comment.authorEmail, event.year);
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

/**
 * Posts to a form's thread and tells the others in it: the requester and
 * whoever submitted the form (by email too), whoever approves it now (by email
 * too), and the rest of the reviewing team in-app.
 */
export const add = mutation({
  args: { id: v.id("eventRequests"), form: subFormKindValidator, body: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const body = args.body.trim();
    if (!body) throw new ConvexError("Write a comment first.");
    if (body.length > MAX_COMMENT_LENGTH) throw new ConvexError("That comment is too long.");
    const event = await requireEvent(ctx, args.id);
    if (!canCommentOn(await accessTo(ctx, caller, event), args.form)) {
      throw new ConvexError(
        `Only the requester's department and the ${SUB_FORM_TEAMS[args.form]} team can comment on this form.`
      );
    }
    const commentId = await ctx.db.insert("eventRequestComments", {
      eventRequestId: event._id,
      form: args.form,
      authorEmail: caller.email,
      body,
      postedAt: Date.now(),
    });
    const form = (await subFormsOf(ctx, event._id))[args.form];
    const author = await displayName(ctx, caller.email, event.year);
    const note = {
      actor: caller.email,
      subject: `New comment on the ${formName(args.form)} for ${event.name}`,
      pushTitle: "New comment",
      body: `${author} commented:\n"${body}"`,
      url: eventUrl(event, { form: args.form, thread: true }),
    };
    const approvers = await recipientsFor(
      ctx,
      await stepApprover(ctx, event, args.form, form.step)
    );
    const emailed = [event.requesterEmail, form.submittedBy, ...approvers].filter(
      (e) => e !== caller.email
    );
    await tell(ctx, event, emailed, note);
    const team = await teamOf(ctx, SUB_FORM_TEAMS[args.form]);
    // The Director is in a Finance thread once the budget has needed them.
    const director =
      args.form === "finance" && form.directorApprovedBy
        ? await recipientsFor(ctx, await directorOf(ctx, event))
        : [];
    await tell(
      ctx,
      event,
      [...team, ...director].filter((e) => e !== caller.email && !emailed.includes(e)),
      note,
      { email: false }
    );
    return commentId;
  },
});

/**
 * Unread comments per event, per form, for the caller: ones written since
 * they last opened that thread, by someone else.
 */
export const unreadCounts = query({
  args: { ids: v.array(v.id("eventRequests")) },
  handler: async (ctx, args) => {
    const counts: Record<string, Partial<Record<SubFormKind, number>>> = {};
    const caller = await optionalEventStaff(ctx);
    if (!caller) return counts;
    for (const id of new Set(args.ids)) {
      for (const form of SUB_FORM_KINDS) {
        const read = await ctx.db
          .query("eventRequestCommentReads")
          .withIndex("by_eventRequest_and_form_and_user", (q) =>
            q.eq("eventRequestId", id).eq("form", form).eq("userEmail", caller.email)
          )
          .unique();
        const unread = (
          await commentsFor(ctx, id, form, read?.lastReadAt ?? 0).take(COMMENTS_LIMIT)
        ).filter((c) => c.authorEmail !== caller.email).length;
        if (unread > 0) (counts[id] ??= {})[form] = unread;
      }
    }
    return counts;
  },
});

export const markRead = mutation({
  args: { id: v.id("eventRequests"), form: subFormKindValidator },
  handler: async (ctx, args) => {
    const { email } = await requireEventStaff(ctx);
    await requireEvent(ctx, args.id);
    const newest = await ctx.db
      .query("eventRequestComments")
      .withIndex("by_eventRequest_and_form_and_postedAt", (q) =>
        q.eq("eventRequestId", args.id).eq("form", args.form)
      )
      .order("desc")
      .first();
    const lastReadAt = Math.max(Date.now(), newest?.postedAt ?? 0);
    const existing = await ctx.db
      .query("eventRequestCommentReads")
      .withIndex("by_eventRequest_and_form_and_user", (q) =>
        q.eq("eventRequestId", args.id).eq("form", args.form).eq("userEmail", email)
      )
      .unique();
    if (existing) {
      await ctx.db.patch("eventRequestCommentReads", existing._id, { lastReadAt });
    } else {
      await ctx.db.insert("eventRequestCommentReads", {
        eventRequestId: args.id,
        form: args.form,
        userEmail: email,
        lastReadAt,
      });
    }
    return null;
  },
});
