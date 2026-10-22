import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron("stale request reminders", "0 22 * * *", internal.reminders.remindStale, {});

crons.cron("google directory sync", "0 21 * * 1", internal.directorySync.run, {});

crons.cron("staff year prefill", "0 11 30 9 *", internal.admin.prefillNextStaffYear, {});

crons.cron("purge old receipt files", "0 15 30 9 *", internal.cleanup.purgeOldReceiptFiles, {});

crons.cron(
  "staff rollover members",
  "30 15 30 9 *",
  internal.staffLeavers.staffRolloverOnOct1,
  {}
);

crons.cron("attendance metrics daily rebuild", "0 16 * * *", internal.attendanceMetrics.recomputeAll, { nightly: true });

crons.cron("church map locations", "0 17 * * *", internal.churches.locateAll, { nightly: true });

crons.cron("weekly insights nightly build", "30 16 * * *", internal.weeklyInsights.rebuildAll, { nightly: true });

crons.cron("purge old app errors", "45 17 * * *", internal.appErrors.purgeOld, {});

export default crons;
