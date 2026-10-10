import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron("stale request reminders", "0 22 * * *", internal.reminders.remindStale, {});

crons.cron("google directory sync", "0 21 * * 1", internal.directorySync.run, {});

crons.cron("staff year prefill", "0 11 30 9 *", internal.admin.prefillNextStaffYear, {});

crons.cron("purge old receipt files", "0 15 30 9 *", internal.cleanup.purgeOldReceiptFiles, {});

// 01:30 Sydney on 1 Oct, after the flip: last year's staff who aren't staff
// this year go back to being plain members.
crons.cron(
  "staff leavers to members",
  "30 15 30 9 *",
  internal.staffLeavers.convertOutgoingStaffOnRollover,
  {}
);

crons.cron("attendance metrics daily rebuild", "0 16 * * *", internal.attendanceMetrics.recomputeAll, {});

// 03:30 Sydney (AEST): each campus's weeklies Insights, redoing only what
// changed since the night before.
crons.cron("weekly insights nightly build", "30 16 * * *", internal.weeklyInsights.rebuildAll, {});

export default crons;
