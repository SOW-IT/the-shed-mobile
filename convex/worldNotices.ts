import { ConvexError, v } from "convex/values";
import { NOTICE_TEXT_MAX, NOTICE_TITLE_MAX, NOTICES_MAX } from "../shared/worldNotices";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { displayName, isAdminProfile, optionalProfile, requireAdmin } from "./model";
import { blockedEither } from "./world";

const noticeRow = v.object({
  id: v.id("worldNotices"),
  title: v.union(v.string(), v.null()),
  text: v.string(),
  authorName: v.string(),
  at: v.number(),
  editedAt: v.union(v.number(), v.null()),
});

const rowOf = (notice: Doc<"worldNotices">) => ({
  id: notice._id,
  title: notice.title ?? null,
  text: notice.text,
  authorName: notice.authorName,
  at: notice._creationTime,
  editedAt: notice.editedAt ?? null,
});

const cleanNotice = (raw: { title?: string; text: string }) => {
  const title = raw.title?.trim() || undefined;
  const text = raw.text.trim();
  if (!text) throw new ConvexError("Write the notice first.");
  if (text.length > NOTICE_TEXT_MAX) throw new ConvexError(`Keep a notice to ${NOTICE_TEXT_MAX} characters.`);
  if (title && title.length > NOTICE_TITLE_MAX) throw new ConvexError(`Keep the heading to ${NOTICE_TITLE_MAX} characters.`);
  return { title, text };
};

/**
 * The notices pinned to the World's board, newest first, for anyone the
 * notifications screen would show notifications to. A notice from someone
 * you've blocked in the World, or who has blocked you, isn't shown.
 * `canPin` says whether the caller may pin, edit and take notices down.
 */
export const list = query({
  args: {},
  returns: v.union(v.null(), v.object({ canPin: v.boolean(), notices: v.array(noticeRow) })),
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const notices = await ctx.db.query("worldNotices").order("desc").take(NOTICES_MAX);
    const shown: Doc<"worldNotices">[] = [];
    for (const notice of notices) {
      if (!(await blockedEither(ctx, caller.email, notice.authorEmail))) shown.push(notice);
    }
    return { canPin: await isAdminProfile(ctx, caller.profile), notices: shown.map(rowOf) };
  },
});

export const pin = mutation({
  args: { title: v.optional(v.string()), text: v.string() },
  returns: v.id("worldNotices"),
  handler: async (ctx, args) => {
    const caller = await requireAdmin(ctx);
    const notice = cleanNotice(args);
    const pinned = await ctx.db.query("worldNotices").take(NOTICES_MAX);
    if (pinned.length >= NOTICES_MAX) {
      throw new ConvexError(`The board holds ${NOTICES_MAX} notices. Take one down first.`);
    }
    return await ctx.db.insert("worldNotices", {
      authorEmail: caller.email,
      authorName: await displayName(ctx, caller.email, caller.year),
      ...notice,
    });
  },
});

export const edit = mutation({
  args: { id: v.id("worldNotices"), title: v.optional(v.string()), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, ...raw }) => {
    const caller = await requireAdmin(ctx);
    const existing = await ctx.db.get("worldNotices", id);
    if (!existing) throw new ConvexError("That notice has been taken down.");
    const notice = cleanNotice(raw);
    await ctx.db.patch("worldNotices", id, { title: notice.title, text: notice.text, editedAt: Date.now(), editedBy: caller.email });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("worldNotices") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    if (await ctx.db.get("worldNotices", id)) await ctx.db.delete("worldNotices", id);
    return null;
  },
});
