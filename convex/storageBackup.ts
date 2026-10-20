import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

export const listFiles = internalQuery({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  returns: v.object({
    files: v.array(
      v.object({
        storageId: v.id("_storage"),
        sha256: v.string(),
        size: v.number(),
        contentType: v.union(v.string(), v.null()),
        url: v.union(v.string(), v.null()),
      })
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const numItems = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(args.numItems ?? DEFAULT_PAGE_SIZE))
    );
    const page = await ctx.db.system
      .query("_storage")
      .paginate({ numItems, cursor: args.cursor ?? null });
    const files = await Promise.all(
      page.page.map(async (file) => ({
        storageId: file._id,
        sha256: file.sha256,
        size: file.size,
        contentType: file.contentType ?? null,
        url: await ctx.storage.getUrl(file._id),
      }))
    );
    return { files, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});
