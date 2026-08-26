import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron("stale request reminders", "0 22 * * *", internal.reminders.remindStale, {});

crons.cron("google directory sync", "0 21 * * 1", internal.directorySync.run, {});

crons.cron("staff year prefill", "0 11 30 9 *", internal.admin.prefillNextStaffYear, {});

crons.cron("purge old receipt files", "0 15 30 9 *", internal.cleanup.purgeOldReceiptFiles, {});

crons.cron(
  "attendance metrics recompute",
  "0 3 * * 4",
  internal.attendanceMetrics.recomputeAll,
  {}
);

crons.cron(
  "attendance metrics dirty recompute",
  "*/15 * * * *",
  internal.attendanceMetrics.recomputeDirty,
  {}
);

export default crons;
