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

// Sep 30 14:01 UTC = 00:01 Oct 1 Sydney time: the staff year rolls over at
// Sydney midnight Oct 1 (see staffYearForDate — midnight Oct 1 is AEST, UTC+10),
// so by 00:01 currentStaffYear() is already the new year. Prefill the next staff
// year (2 calendar years out) from the new current staff year, e.g. on 2026-10-01
// copy 2027 -> 2028, then email IT a summary. Admins can then configure the new
// year from a populated copy.
crons.cron("staff year rollover", "1 14 30 9 *", internal.admin.rollOverStaffYear, {});

// Sep 30 15:00 UTC = 01:00 Oct 1 Sydney (AEST, UTC+10) — one hour after the
// staff-year rollover cron (14:01 UTC) so the two heavy jobs don't share the
// same minute. Purges receipt/invoice files attached to requests paid more
// than a year ago. Attachment records (and names) are kept so history still
// shows a file was there — only the download link dies.
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
