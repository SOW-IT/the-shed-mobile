import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 22:00 UTC ≈ 8am Sydney (AEST): nudge whoever stale requests are waiting on.
crons.cron("stale request reminders", "0 22 * * *", internal.reminders.remindStale, {});

// 21:00 UTC ≈ 7am Sydney: refresh the Google Workspace directory (no-ops
// gracefully until the service-account env vars are configured).
crons.cron("google directory sync", "0 21 * * *", internal.directorySync.run, {});

// Sep 30 14:01 UTC = 00:01 Oct 1 Sydney time: the staff year rolls over at
// Sydney midnight Oct 1 (see staffYearForDate — midnight Oct 1 is AEST, UTC+10),
// so by 00:01 currentStaffYear() is already the new year. Prefill the next staff
// year (2 calendar years out) from the new current staff year, e.g. on 2026-10-01
// copy 2027 -> 2028, then email IT a summary. Admins can then configure the new
// year from a populated copy.
crons.cron("staff year rollover", "1 14 30 9 *", internal.admin.rollOverStaffYear, {});

// Midnight Oct 1 Sydney time = Sep 30 14:00 UTC (midnight Oct 1 is AEST, UTC+10 —
// DST doesn't start until 2am on the first Sunday of October). Purge
// receipt/invoice files attached to requests paid more than a year ago. The
// attachment records (and names) are kept so history still shows a file was
// there — only the download link dies.
crons.cron("purge old receipt files", "0 14 30 9 *", internal.cleanup.purgeOldReceiptFiles, {});

export default crons;
