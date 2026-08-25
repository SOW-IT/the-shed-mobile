import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 22:00 UTC ≈ 8am Sydney (AEST): nudge whoever stale requests are waiting on.
crons.cron("stale request reminders", "0 22 * * *", internal.reminders.remindStale, {});

// Weekly, Monday 21:00 UTC (≈ Tue 7am AEST / 8am AEDT Sydney): refresh the
// Google Workspace directory and cache staff profile photos (no-ops gracefully
// until the service-account env vars are configured). Admins can still sync on
// demand from the admin screen. Expressed with crons.cron per the project's
// Convex guidelines (no crons.weekly/daily helpers).
crons.cron("google directory sync", "0 21 * * 1", internal.directorySync.run, {});

// 21:00 Sydney 30 Sep = 11:00 UTC (AEST, UTC+10). Prefill copies the incoming
// staff year into the year after it (on 2026-09-30 that is 2027 -> 2028) and
// writes incoming-year Insights so the tab is ready at midnight. The clock,
// not this job, is the rollover. See docs/adr/0003.
crons.cron("staff year prefill", "0 11 30 9 *", internal.admin.prefillNextStaffYear, {});

// 01:00 Sydney 1 Oct = 15:00 UTC 30 Sep. After the flip, so currentStaffYear()
// is already the new year. Deletes receipt files on requests from
// previous-previous staff year and older (on 2026-10-01: through 30 Sep 2025).
// Attachment records (and names) stay — only the download dies.
crons.cron("purge old receipt files", "0 15 30 9 *", internal.cleanup.purgeOldReceiptFiles, {});

// Weekly, Thursday 03:00 UTC (≈ Thu 1–2pm Sydney): refresh the Attendance →
// Insights dashboard snapshots for every sub-group so leaders open a ready,
// pre-aggregated view instead of scanning attendance history on the client.
// recomputeAll fans out one bounded recompute per sub-group (see
// convex/attendanceMetrics.ts). Expressed with crons.cron per the project's
// Convex guidelines (no crons.weekly helper).
crons.cron(
  "attendance metrics recompute",
  "0 3 * * 4",
  internal.attendanceMetrics.recomputeAll,
  {}
);

// Every 15 minutes: recompute only the sub-groups flagged dirty by a roll-call
// or event change since the last run (see markSubgroupsDirty), so insights track
// attendance within minutes instead of waiting for the weekly cron above. A
// no-op when nothing has changed.
crons.cron(
  "attendance metrics dirty recompute",
  "*/15 * * * *",
  internal.attendanceMetrics.recomputeDirty,
  {}
);

export default crons;
