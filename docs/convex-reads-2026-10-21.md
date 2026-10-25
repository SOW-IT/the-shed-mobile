# Convex database reads, 2026-10-21

Where production's database reads go, why, and what to change to cut them.
Measured on main at `dea7b1e` (2.9.26).

**Status:** fixes 1 to 6 ship in 2.9.29. Fix 5 uses a search index on
`attendanceMembers.name` rather than a `nameKey` field: a new field would add
about 25 bytes to every member row, and `roster` and the Members list read
all 1,415 rows on every run, which would have cancelled most of the saving.
Fix 8 shipped on 2026-10-23: the backup runs weekly (Sundays 15:17 UTC). Fixes 7 and 9 to 14 are not done.

## Summary

- **The cap.** The Free plan includes 1 GB of database I/O a month, shared by
  prod (`giant-bloodhound-191`) and dev (`successful-lynx-56`). This billing
  period (Oct 4 to Nov 4) had read 6.1 GB by Oct 20: 5.1 GB prod, 1.0 GB dev.
  Writes are under 0.1 GB, so reads are the whole problem.
- **The rate.** Prod read 310 MB/day on average over the last 7 days, 392 MB on
  Tuesday Oct 20 (the first full day after 2.9.12), and about 190 to 210 MB on
  the quiet weekend before it. Dev reads about 8 to 10 MB a day when nobody is testing
  on it, nearly all of it nightly cron jobs.
- **The biggest driver** is the roll call screen. Every `attendance.signIn`
  re-runs `attendance.roster` (495 KB), `attendance.listByEvent` (121 KB),
  `weeklyInsights.signInTags`, `events.listBySubgroup` and `events.get` for
  every phone that has that event's roll call open. That is about 0.7 MB per
  sign-in per viewer. The trigger since 2.9.12 is the `attendanceCount`
  patch on the event row: `roster` reads the event row, so a count change
  re-runs it even though nothing it shows has changed. On Oct 20 `roster`
  alone was 185 MB, 47% of prod's reads.
- **Second**: whole-table reads in screens that stay mounted. On phones every
  sub-tab of a tab is rendered at once and tabs never unmount, so a campus
  leader opening the app pays for the Members list (471 KB, a full scan of
  `attendanceMembers`) even if they never look at it.
- **Fixed costs**: the nightly export to GCS reads the whole prod database,
  9.5 MB a day (285 MB a month, 28% of the allowance by itself). Nightly
  rebuild crons read about 19 MB a day on prod and 8 to 10 MB a day on dev.
- **What the fixes buy.** The fix list below should take a month from roughly
  5 to 6 GB (the post-2.9.12 run rate) to roughly 1.5 to 2 GB. Getting under
  1 GB on the Free plan also needs the roster cached on the device, or a
  decision to pay for usage: the Starter plan bills database I/O beyond 1 GB at
  $0.22/GB ([limits](https://docs.convex.dev/production/state/limits)).

## How this was measured

**Per-function usage (daily, both deployments).** The dashboard's usage API,
called without the dashboard:

```
GET https://api.convex.dev/api/dashboard/teams/519695/usage/query
    ?queryId=76c86baa-418e-4d7f-ac21-46f397030595&projectId=2236890&from=YYYY-MM-DD&to=YYYY-MM-DD
Authorization: Bearer <accessToken from ~/.convex/config.json>
Origin: https://dashboard.convex.dev
```

Each row is `[team, function, project, calls, dbWriteBytes, dbReadBytes,
textSearch, vectorSearch, queryMutationSecs, actionSecs, nodeActionSecs,
egressBytes, "prod"|"dev", component, aiCost]` (column names from
`npm-packages/dashboard/src/hooks/usageMetrics.ts` in convex-backend). One
call per day with `from` = `to` gives a daily series. `calls` counts every
execution, including re-runs of a subscribed query.

**Per-execution detail.** `npx convex logs --prod --success --jsonl` (run with
`CONVEX_DEPLOYMENT=dev:successful-lynx-56` from the repo) prints each
execution with `usageStats.databaseIoReadBytes`, `databaseReadDocuments`,
`cachedResult` and a timestamp. `--history N` replays roughly the last 1,000
executions. That is how the sign-in fan-out below was seen directly.

**Table sizes (prod, JSON bytes).** `npx convex data <table> --prod --format jsonl`:

| Table | Rows | Size | Note |
|---|---:|---:|---|
| attendanceMembers | 1,415 | 394 KB | 274 B a row; 1,383 have a `metadata` record keyed by 32-char field ids |
| staffProfiles | 908 | 287 KB | 77 in staff year 2027 (28.6 KB) |
| weeklyCategories | 4 | 84 KB | one row per campus, 131 to 335 people each |
| rosterHistorySnapshots | 1 | 23 KB | 15 events, 282 members |
| users | 101 | 32 KB | |
| directoryUsers | 113 | 27 KB | |
| attendance | ~13,000 | | not read whole by any screen since 2.9.12 |

The whole prod export is about 9.5 MB.

## Where the reads go

### Totals

| Window | Prod reads | Dev reads |
|---|---:|---:|
| Last 30 days (Sep 21 to Oct 20) | 6.96 GB (232 MB/day) | 1.82 GB |
| Billing period so far (Oct 4 to Oct 20) | 5.11 GB | 1.02 GB |
| Last 7 days (Oct 14 to Oct 20) | 2.17 GB (310 MB/day) | 0.24 GB (34 MB/day) |
| Oct 20 (first full day on 2.9.12+) | 392 MB | 25 MB |

Daily prod reads, last two weeks (MB): Oct 7: 311, Oct 8: 325, Oct 9: 687,
Oct 10: 307, Oct 11: 235, Oct 12: 383, Oct 13: 424, Oct 14: 531, Oct 15: 323,
Oct 16: 215, Oct 17: 189, Oct 18: 210, Oct 19: 309, Oct 20: 392.

### Prod, last 7 days

| Function | Calls | MB | Share | KB/call | MB/day |
|---|---:|---:|---:|---:|---:|
| attendance.roster | 952 | 531.9 | 24.5% | 559 | 76.0 |
| attendanceMembers.list | 775 | 338.5 | 15.6% | 437 | 48.4 |
| events.listBySubgroup | 1,456 | 319.1 | 14.7% | 219 | 45.6 |
| _system_job/snapshot_export (nightly backup) | | 157.5 | 7.3% | | 22.5 |
| attendanceAudit.filterOptions | 478 | 144.5 | 6.7% | 302 | 20.6 |
| generalMetrics.view | 591 | 110.2 | 5.1% | 187 | 15.7 |
| directory.orgChart | 838 | 67.4 | 3.1% | 80 | 9.6 |
| attendance.listByEvent | 969 | 63.9 | 2.9% | 66 | 9.1 |
| weeklyInsights.view | 446 | 44.4 | 2.0% | 100 | 6.3 |
| directory.me | 1,713 | 26.5 | 1.2% | 15 | 3.8 |
| attendanceMetrics.gatherAttendanceChunk (cron) | 45 | 25.7 | 1.2% | 571 | 3.7 |
| requests.reviewed | 182 | 24.6 | 1.1% | 135 | 3.5 |
| attendanceMembers.byName | 79 | 23.5 | 1.1% | 297 | 3.4 |
| generalMetrics.recomputeCampusWeeklyAttendance (cron) | 9 | 22.5 | 1.0% | 2,502 | 3.2 |
| weeklyInsights.signInTags | 762 | 20.7 | 1.0% | 27 | 3.0 |

`listBySubgroup`, `generalMetrics.view` and `filterOptions` were cut by
2.9.12 on Oct 19 and are now much smaller (next table). The export line is
inflated by one-off manual exports on Oct 13 to 15; a normal day is one
export of about 9.5 MB.

### Prod, Oct 20 (after 2.9.12)

| Function | Calls | MB | Share | KB/call |
|---|---:|---:|---:|---:|
| attendance.roster | 359 | 184.6 | 47.1% | 514 |
| attendanceMembers.list | 116 | 51.8 | 13.2% | 446 |
| attendance.listByEvent | 347 | 32.7 | 8.4% | 94 |
| events.listBySubgroup | 372 | 12.6 | 3.2% | 34 |
| directory.orgChart | 145 | 12.1 | 3.1% | 83 |
| snapshot_export | | 9.6 | 2.4% | |
| weeklyInsights.view | 73 | 7.2 | 1.8% | 99 |
| attendanceAudit.filterOptions | 25 | 7.2 | 1.8% | 288 |
| attendanceMembers.byName | 28 | 7.2 | 1.8% | 256 |
| directory.me | 421 | 6.3 | 1.6% | 15 |
| requests.reviewed | 39 | 6.2 | 1.6% | 158 |
| weeklyInsights.signInTags | 341 | 6.1 | 1.6% | 18 |

That day had 144 `attendance.signIn` calls, 5 sign-outs and 5 new members.

### Background jobs

| Job | Prod MB/day | Dev MB/day |
|---|---:|---:|
| Nightly export (`convex-backup.yml`) | 9.5 (one run) | 0 (one manual run in 7 days) |
| `attendanceMetrics.recomputeAll` (gather chunks, persons, snapshots) | 6.9 | 5.8 |
| `weeklyInsights.rebuildAll` (saveView, saveIndex, attendanceFor, gatherPeople, ...) | 8.2 | 4.2 |
| `generalMetrics.recomputeCampusWeeklyAttendance` (2.5 MB a run) | 3.2 | 2.9 |
| everything else (reminders, directory sync, churches, app errors) | < 0.5 | < 0.5 |

Exports do count: `_system_job/snapshot_export` shows up in the per-function
breakdown with the same database read bytes as everything else.

### Dev

Dev read 34 MB/day over the last 7 days, but on quiet days (Oct 17 to 19) it
reads 8 to 10 MB, almost all from the nightly crons above. Dev runs Natalie's
`feat/music-form` merged with main, deployed by hand, so its code (including
its `generalMetrics.view`, which at 239 KB a run looks like the pre-2.9.12
version) changes only
when that branch is redeployed. Her `musicRequests.approved` is about 0.8
MB/day while she is testing.

## Why

### 1. One sign-in re-runs the whole roll call screen

Convex re-runs a subscribed query whenever any document it read changes. The
roll call screen (`src/app/attendance/event/[eventId].tsx:151-169`) subscribes
to `events.get`, `attendance.listByEvent`, `attendance.roster`,
`checkIn.pending` and `weeklyInsights.signInTags`, and the Attendance tab
stays mounted underneath it with `events.listBySubgroup` and
`attendanceMembers.list` live.

`signInMember` calls `adjustEventAttendanceCount`
(`convex/attendanceCounts.ts:35-49`), which patches the event row. `roster`
(`convex/attendance.ts:59`), `signInTags` (`convex/weeklyInsights.ts:1088`),
`events.get`, `checkIn.page` and `checkIn.status` all read that row, so all of
them re-run on every sign-in, for every phone showing that event. Production
logs from this morning, one leader signing people in:

```
04:03:31 Mut attendance:signIn               1.7 KB
04:03:31 Que events:get                      1.0 KB
04:03:31 Que weeklyInsights:signInTags      21.5 KB
04:03:31 Que events:listBySubgroup          35.2 KB
04:03:31 Que attendance:listByEvent        121.6 KB
04:03:32 Que attendance:roster             495.3 KB
04:03:45 Mut attendance:signIn               1.7 KB
04:03:45 Que weeklyInsights:signInTags      21.5 KB
...                                       (the same five again)
```

In that 2.5-hour window, 12 of 14 `roster` runs came within 3 seconds of a
sign-in or member write. Before 2.9.12 the trigger was different but the
effect the same: the roster history was read live from `attendance`, so a new
sign-in row re-ran it. `roster` has re-run on every sign-in for weeks.

Nothing `roster` returns depends on the count. Its ordering comes from the
nightly `rosterHistorySnapshots` row.

### 2. Screens that read whole tables

| Query | What it reads every run | KB/run |
|---|---|---:|
| `attendance.roster` (`convex/attendance.ts:51`) | all 1,415 members, all 4 `weeklyCategories` rows, the year's staff profiles plus each one's `users` and `directoryUsers` row, `rosterHistorySnapshots`, metadata fields | 495 |
| `attendanceMembers.list` (`convex/attendanceMembers.ts:105`) | the same, minus roster history; then sorts and returns 30 rows | 437 to 471 |
| `attendanceMembers.byName` (`convex/attendanceMembers.ts:367`) | all members whenever there is no exact-case match | 256 to 297 |
| `mergeSuggestions.list` | all staff profiles and all members | 570 to 650 |
| `admin.listUnassignedUsers`, `directorySync.list` | | 260 to 300 |
| `attendanceAudit.filterOptions` (`convex/attendanceAudit.ts:180`) | the newest 1,000 audit rows | 288 to 313 |
| `directory.orgChart` (`convex/directory.ts:138`) | every division of every year, all `directoryUsers`, a `users` lookup per profile | 67 to 87 |

`attendanceMembers.list` is "paginated" but each page re-reads everything,
and `usePagedQuery` keeps every loaded page subscribed. Scrolling to page 3
leaves three 450 KB subscriptions live, each re-running on any member change.

### 3. Every member list reads all of `weeklyCategories`

`memberRoleResolver` (`convex/memberRoles.ts:17`) reads all four campus rows
(82 KB) to work out plain members' Roles. `roster`, `listByEvent`,
`attendanceMembers.list` and `attendanceMembers.get` all call it. For
`listByEvent` it is about two thirds of each 121 KB run, and `listByEvent`
re-runs on every sign-in by design.

### 4. Phones mount every sub-tab at once, and never unmount

`src/components/PagerCarousel.native.tsx:60` renders every page
(`tabs.map(...)`), and the tab layout sets no `lazy`, `unmountOnBlur` or
`freezeOnBlur`. So on iOS and Android:

- Attendance mounts Events, Members, Audit, Metadata and Tags together:
  `attendanceMembers.list` (471 KB) runs on every app open by anyone who has
  visited Attendance, which includes campus leaders, who land there.
- Admin mounts `mergeSuggestions.list`, `listUnassignedUsers`,
  `directorySync.list`, `admin.people` and `listStaffProfiles` together,
  about 1.3 MB per open.
- Reimbursements mounts My requests, To review, Reviewed and All requests.

The web only renders the active page (`PagerCarousel.tsx`), so this is a
phone-only cost. In the log window, all 10 `attendanceMembers.list` runs were
app opens; none followed a write.

### 5. Reading the clock turns off the query cache

Convex caches a query's result per argument set (and per auth token when the
query reads auth) and serves the cache when the same subscription comes back,
for example after an app reopen or a reconnect. A query that reads the clock
is only cached for a few seconds ([best practices](https://docs.convex.dev/understanding/best-practices/)).
`optionalProfile` calls `currentStaffYear()`, which calls `new Date()`
(`convex/model.ts:65`), so nearly every signed-in query reads the clock. In
the log window, signed-in runs of `roster`, `attendanceMembers.list`,
`orgChart`, `profile.get` and `directory.me` hit the cache 1 time in 139.
Queries that never read auth or the clock (`appInstalls.updateStatus`,
`attendanceMetrics.rangeOptions`) hit it 62% and 72% of the time, and
signed-out runs of `directory.me`, which return before reading the clock, 80%. How much this costs is not measured: it depends on how often
the same person resubscribes with an unchanged token and unchanged data.

### 6. Fixed nightly costs

- **Backup export.** `.github/workflows/convex-backup.yml` runs `npx convex
  export --prod` daily. Each export reads the whole database: 9.5 MB a day,
  285 MB a month. The Oct 20 run failed (separate issue).
- **`recomputeCampusWeeklyAttendance`** (`convex/generalMetrics.ts:364`)
  collects every weekly meeting's attendance rows just to count them, 2.5 MB
  a run, even though events now carry a count. It runs from both
  `attendanceMetrics.recomputeAll` and `weeklyInsights.rebuildAll`.
- **`attendanceMetrics.recomputeAll` and `weeklyInsights.rebuildAll`** run
  every night on both deployments whether or not anything changed. On dev,
  where nobody signs anyone in, they are the whole bill on a quiet day.

### 7. Smaller things checked

- Notifications (`feed`, `unreadCount`), the request timeline, announcement
  seen-by counts, reimbursement visibility checks, self check-in
  (`page`/`pending`/`mine`/`returning`), member pair suggestions and app
  error reports are each under 0.5 MB/day on prod. Self check-in's `page`
  reads the event row, so every phone on the check-in page re-runs it on each
  sign-in; it is tiny (0.4 KB) but goes away with fix 1 anyway.
- `presence.markSeen` runs on mount, on foreground and every 5 minutes, but
  reads 0.5 KB and writes at most every 5 minutes.
- `directory.me` is mounted everywhere but shares one subscription per client
  and reads about 15 KB.
- `events.listBySubgroup` scans the newest events until it finds 20 for the
  campus (35 KB a run) and re-runs on each sign-in because the count is on
  the page.
- Investigation itself costs: CLI table reads (`_system/cli/tableData`) were
  2.3 MB/day this week, and dashboard test queries 1 MB a run.

## Fix list

Ranked quick wins first. Savings are estimates for a month like the last one
(about 1,140 sign-ins, 15 event days), measured from the numbers above;
"busy day" is Oct 20.

| # | Change | Where | Ships by | Busy day | Per month | Effort |
|---|---|---|---|---:|---:|---|
| 1 | Move `attendanceCount` off the event row into its own `eventAttendanceCounts` table, so sign-ins stop changing what `roster`, `signInTags`, `events.get` and `checkIn.page` read | `convex/attendanceCounts.ts`, `schema.ts`, `events.ts`; backfill | Convex deploy | -130 MB | -1.0 GB | S |
| 2 | Gate the nightly crons on an env var and set it on dev | the six nightly handlers; `npx convex env set` on dev; Natalie merges main | Convex deploy (dev redeploy by hand) | | -0.27 GB | S |
| 3 | `recomputeCampusWeeklyAttendance`: use the stored count instead of collecting rows | `convex/generalMetrics.ts:360` | Convex deploy | -3 MB | -0.17 GB (prod and dev) | XS |
| 4 | `filterOptions`: newest 200 audit rows instead of 1,000 | `convex/attendanceAudit.ts:188` | Convex deploy | -5 MB | -0.1 GB | XS |
| 5 | `byName`: look a miss up through an index instead of scanning the table (shipped as a search index on `name`, see Status) | schema | Convex deploy | -7 MB | -0.1 GB | S |
| 6 | Role lookups on the roll call read only the event campus's `weeklyCategories` row (23 KB, not 82 KB) | `memberRoles.ts`, `attendance.ts` | Convex deploy | -25 MB | -0.2 GB | S |
| 7 | Phones: mount a sub-tab only once it has been shown (and pass `"skip"` on Members/Admin pages until then) | `PagerCarousel.native.tsx` | OTA (2.9.19+) or store build | -40 MB | -0.8 to 1.2 GB | S |
| 8 | Back up weekly (or every few days) instead of daily | `convex-backup.yml` cron | GitHub | -8 MB | -0.24 GB | XS |
| 9 | Members tab: real pagination on the `by_name` index for the default view, full scan only when searching or filtering (on top of 7) | `attendanceMembers.list` | Convex deploy | -15 MB | -0.3 GB | M |
| 10 | Skip the nightly rebuilds when no attendance, event or member changed since the last build | `attendanceMetrics.recomputeAll`, `weeklyInsights.rebuildAll` | Convex deploy | | -0.2 GB | M |
| 11 | Roster: send staff plus people seen in recent events, and search the rest on the server | `attendance.roster`, roll call search | Convex deploy plus app release | -30 MB | -0.4 GB | M |
| 12 | Read the staff year from a document the rollover cron writes instead of the clock, so signed-in queries can be cached | `model.ts`, `shared/flow.ts` callers | Convex deploy | ? | unmeasured | M |
| 13 | Event list counts as small per-row queries so the list stops re-running on each sign-in | `EventsTab.tsx`, `events.listBySubgroup` | app release | -6 MB | -0.1 GB | S |
| 14 | `orgChart`: read only the needed years' divisions and the year's directory rows | `convex/directory.ts:153-177` | Convex deploy | -4 MB | -0.08 GB | S |

Notes on the top items:

1. **Count table.** `eventAttendanceCount`, `adjustEventAttendanceCount` and
   `recountEventAttendance` already centralise every read and write of the
   count, so the change is confined to `attendanceCounts.ts`, the event
   insert in `events.ts:370`, the schema and a backfill that copies the 278
   stored counts. `events.listBySubgroup` keeps returning `attendanceCount`,
   so the app does not change. It still re-runs on each sign-in (fix 13), but
   `roster`, the most expensive query in the app, stops doing so.
2. **Dev crons.** Dev's crons send nothing anyone needs, and on a quiet day
   they are 8 to 10 MB of the 1 GB. Because dev runs Natalie's branch, the
   guard reaches dev only after she merges main and redeploys.
7. **Lazy sub-tabs.** The cheapest change with the widest reach. The first
   swipe to a sub-tab shows a loading state once. Web already behaves this
   way.
11. **Roster scope.** A product call: today the roll call lists everyone ever
   recorded (1,415 people), sorted by how often they come. Sending only staff
   and people from the last 60 events (282 people in the snapshot) cuts each
   run by about 70%, but someone new to the screen would need to be found by
   search.

## Where this leaves the month

| | Per month |
|---|---:|
| Last 30 days (mostly before 2.9.12) | 8.8 GB (prod 7.0, dev 1.8) |
| Run rate on 2.9.12+ (estimate) | 5 to 6 GB |
| After fixes 1 to 8 | about 2 to 3 GB |
| After all fixes | about 1.5 to 2 GB |

The remaining 1.5 GB is mostly roll call opens, insights views, request lists
and the weekly backup. To get under 1 GB on the Free plan the roster would
need to be cached on the device (a small version query, and a one-off fetch
only when that version changes). On Starter, 1.5 to 2 GB a month would cost
about $0.10 to $0.25 in database I/O.

## Decisions needed

1. Which fixes to implement. Suggested first PR: 1, 3, 4, 5, 6 (server only,
   one Convex deploy, no app release) plus 2. Then 7 as an OTA update.
2. Backup frequency (fix 8): is the BigQuery warehouse needed daily?
3. Roster scope (fix 11): is search-to-find acceptable for people who have
   not come recently?
4. Whether to stay on the Free plan, given the realistic floor above.
