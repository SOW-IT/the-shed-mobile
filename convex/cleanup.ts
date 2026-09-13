import { v } from "convex/values";
import { EARLIEST_REQUEST_YEAR, staffYearStartMs } from "../shared/flow";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { currentStaffYear } from "./model";

const purgeRequestReceiptFiles = async (
  ctx: MutationCtx,
  request: Doc<"requests">
): Promise<{ filesDeleted: number }> => {
  if (!request.receipt) return { filesDeleted: 0 };
  let filesDeleted = 0;
  let changed = false;
  const recipients = await Promise.all(
    request.receipt.recipients.map(async (recipient) => {
      if (!recipient.attachments?.length) return recipient;
      const attachments = await Promise.all(
        recipient.attachments.map(async (attachment) => {
          if (attachment.deleted) return attachment;
          await ctx.storage.delete(attachment.storageId);
          filesDeleted++;
          changed = true;
          return { ...attachment, deleted: true };
        })
      );
      return { ...recipient, attachments };
    })
  );
  if (changed) {
    await ctx.db.patch("requests", request._id, {
      receipt: { ...request.receipt, recipients },
    });
  }
  return { filesDeleted };
};

const PURGE_BATCH_SIZE = 100;

/**
 * Annual cron: delete receipt files for requests created before the previous
 * staff year. Walks the requests table one page per transaction and
 * reschedules itself, so the job finishes however many requests exist rather
 * than failing once a single transaction would be too large.
 */
export const purgeOldReceiptFiles = internalMutation({
  args: {
    beforeMs: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    batch: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.beforeMs ?? staffYearStartMs(currentStaffYear() - 1);
    const batch = args.batch ?? PURGE_BATCH_SIZE;
    const page = await ctx.db
      .query("requests")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", staffYearStartMs(EARLIEST_REQUEST_YEAR)).lt("_creationTime", cutoff)
      )
      .paginate({ numItems: batch, cursor: args.cursor ?? null });

    let filesDeleted = 0;
    let requestsTouched = 0;
    for (const request of page.page) {
      const purged = await purgeRequestReceiptFiles(ctx, request);
      filesDeleted += purged.filesDeleted;
      if (purged.filesDeleted > 0) requestsTouched++;
    }

    console.log(
      `purgeOldReceiptFiles: deleted ${filesDeleted} file(s) across ${requestsTouched} request(s) created before ${new Date(cutoff).toISOString()} (done=${page.isDone})`
    );
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.cleanup.purgeOldReceiptFiles, {
        beforeMs: cutoff,
        cursor: page.continueCursor,
        batch,
      });
    }
    return null;
  },
});

export const purgeReceiptFilesCreatedBefore = internalMutation({
  args: {
    beforeMs: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    batch: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batch = args.batch ?? 50;
    const page = await ctx.db
      .query("requests")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", args.beforeMs))
      .paginate({ numItems: batch, cursor: args.cursor ?? null });

    let filesDeleted = 0;
    let requestsTouched = 0;
    for (const request of page.page) {
      const purged = await purgeRequestReceiptFiles(ctx, request);
      filesDeleted += purged.filesDeleted;
      if (purged.filesDeleted > 0) requestsTouched++;
    }

    console.log(
      `purgeReceiptFilesCreatedBefore: deleted ${filesDeleted} file(s) across ${requestsTouched} request(s) created before ${new Date(args.beforeMs).toISOString()} (done=${page.isDone})`
    );
    return {
      filesDeleted,
      requestsTouched,
      scanned: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
