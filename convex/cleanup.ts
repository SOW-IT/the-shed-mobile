import { EARLIEST_REQUEST_YEAR } from "../shared/flow";
import { internalMutation } from "./_generated/server";
import { currentStaffYear } from "./model";

/** Receipt files are kept for one year after a request is paid, then purged. */
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Yearly cron (Sept 1, 01:00 UTC): deletes the stored receipt/invoice files of
 * every request that was paid more than a year ago. The attachment records are
 * kept (and flagged `deleted`) so historical requests still show that a file
 * was attached — only the download link stops working. Idempotent: attachments
 * already flagged `deleted` are skipped, so re-runs are harmless.
 */
export const purgeOldReceiptFiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_MS;
    let filesDeleted = 0;
    let requestsTouched = 0;

    // Files this old only belong to past years' requests, so iterate the
    // bounded set of staff years rather than scanning the whole table.
    for (let year = EARLIEST_REQUEST_YEAR; year <= currentStaffYear(); year++) {
      const requests = await ctx.db
        .query("requests")
        .withIndex("by_year", (q) => q.eq("year", year))
        .take(500);

      for (const request of requests) {
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
