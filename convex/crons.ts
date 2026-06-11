import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 22:00 UTC ≈ 8am Sydney (AEST): nudge whoever stale requests are waiting on.
crons.cron("stale request reminders", "0 22 * * *", internal.reminders.remindStale, {});

// 21:00 UTC ≈ 7am Sydney: refresh the Google Workspace directory (no-ops
// gracefully until the service-account env vars are configured).
crons.cron("google directory sync", "0 21 * * *", internal.directorySync.run, {});

export default crons;
