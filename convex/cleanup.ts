import { v } from "convex/values";
import { EARLIEST_REQUEST_YEAR, staffYearStartMs } from "../shared/flow";
import { internalMutation } from "./_generated/server";
import { currentStaffYear } from "./model";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Receipt files are kept for one year after a request is paid, then purged. */
const RETENTION_DAYS = 365;

/**
 * Yearly cron (01:00 Oct 1 Sydney time = Sep 30 15:00 UTC): deletes the
 * stored receipt/invoice files of every request that was paid more than a year
 * ago, an hour after the staff-year rollover cron so the two jobs don't share
 * the same minute. The attachment records are kept (and flagged `deleted`) so
 * historical requests still show that a file was attached — only the download
 * link stops working. Idempotent: attachments already flagged `deleted` are
 * skipped, so re-runs are harmless.
 *
 * `olderThanDays` overrides the retention window (defaults to one year); used
 * for manual runs e.g. `npx convex run cleanup:purgeOldReceiptFiles '{"olderThanDays":730}'`.
 */
export const purgeOldReceiptFiles = internalMutation({
  args: { olderThanDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanDays ?? RETENTION_DAYS) * DAY_MS;
    let filesDeleted = 0;
    let requestsTouched = 0;

    // Files this old only belong to past years' requests, so iterate the
    // bounded set of staff years rather than scanning the whole table. Stream
    // each year's requests (no fixed cap) so a busy year never leaves files
    // beyond an arbitrary limit unpurged.
    for (let year = EARLIEST_REQUEST_YEAR; year <= currentStaffYear(); year++) {
      for await (const request of ctx.db
        .query("requests")
        .withIndex("by_creation_time", (q) =>
          q
            .gte("_creationTime", staffYearStartMs(year))
            .lt("_creationTime", staffYearStartMs(year + 1))
        )) {
        if (
          request.paid !== true ||
          request.paidTime === undefined ||
          request.paidTime >= cutoff ||
          !request.receipt
        ) {
          continue;
        }

        let changed = false;
        const recipients = await Promise.all(
          request.receipt.recipients.map(async (recipient) => {
            if (!recipient.attachments?.length) return recipient;
            const attachments = await Promise.all(
              recipient.attachments.map(async (attachment) => {
                if (attachment.deleted) return attachment; // already purged
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
          requestsTouched++;
        }
      }
    }

    console.log(
      `purgeOldReceiptFiles: deleted ${filesDeleted} file(s) across ${requestsTouched} request(s) paid before ${new Date(cutoff).toISOString()}`
    );
    return null;
  },
});
