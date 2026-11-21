import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// No job starts at minute 0 UTC, the busiest minute on the clock.

crons.cron("stale request reminders", "7 22 * * *", internal.reminders.remindStale, {});

crons.cron("google directory sync", "11 21 * * 1", internal.directorySync.run, {});

crons.cron("staff year prefill", "3 11 30 9 *", internal.admin.prefillNextStaffYear, {});

crons.cron("purge old receipt files", "4 15 30 9 *", internal.cleanup.purgeOldReceiptFiles, {});

crons.cron(
  "staff rollover members",
  "30 15 30 9 *",
  internal.staffLeavers.staffRolloverOnOct1,
  {}
);

// 00:01 on 1 October in Sydney, just after the staff year changes.
crons.cron("carry open grievances into the new staff year", "1 14 30 9 *", internal.grievances.carryForward, {});
crons.cron("carry finance settings into the new staff year", "1 14 30 9 *", internal.admin.carryFinanceSettingsForward, {});
crons.cron("remind last year's grievance handlers", "1 13 30 11 *", internal.grievances.remindOutgoingHandlers, {});

crons.cron("attendance metrics daily rebuild", "6 16 * * *", internal.attendanceMetrics.recomputeAll, { nightly: true });

crons.cron("church map locations", "8 17 * * *", internal.churches.locateAll, { nightly: true });

crons.cron("weekly insights nightly build", "30 16 * * *", internal.weeklyInsights.rebuildAll, { nightly: true });

crons.cron("purge old app errors", "45 17 * * *", internal.appErrors.purgeOld, {});

crons.cron("recount attendance members", "15 17 * * *", internal.memberCount.recount, { nightly: true });

export default crons;
