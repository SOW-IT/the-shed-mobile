# Insights → Attendance (metrics dashboard)

> From 2.5.0 a **campus**'s view is built from its weekly meetings instead:
> see [weekly-insights.md](weekly-insights.md). What follows now describes the
> org-wide **SOW** view, whose Snapshots are the only ones still built.

A leader-facing dashboard that turns raw sign-in data into trends and gentle
follow-up prompts for a sub-group and time range.

- **UI (server-driven):** `api.attendanceMetrics.view` returns the tab as a
  list of typed blocks (`cards`, `bars`, `breakdown`, `followUps`, `label`,
  `updated`, `empty`), laid out by `shared/attendanceMetricsView.ts`.
  `src/components/attendance/MetricsTab.tsx` only draws each block type and
  skips types it doesn't know, so what the tab shows, its wording and its
  order change with a **Convex deploy**, not an app release. The range presets
  come from `api.attendanceMetrics.rangeOptions` the same way. A brand-new
  block type still needs an app release before it appears.
- **Insights → General** works the same way: `api.generalMetrics.view({ scope })`
  returns blocks built by `shared/generalMetricsView.ts` plus the year list for
  the scope picker. All years: staff and student-leader counts, retention and
  average years served (overall / staff / student leaders) for the newest
  year, labelled once ("2027 vs 2026"), then charts of staff & student
  leaders, student leaders by campus, retention, average years served, served
  2+ years, and weekly average by campus. One year: the same cards for that
  year plus calendar-year weekly averages. Retention has no post-rollover
  grace: the newest year's rate shows from 1 October and reflects the copied
  roster until leavers are marked. Campus weekly averages are bucketed by
  Sydney calendar year. Both tabs draw through
  `src/components/attendance/InsightsBlocks.tsx`. Colours travel as theme
  tokens (`text`, `primary`, `accent`, `success`) or campus hex colours.
  `staffTrends` and `campusWeeklyAttendance` stay for apps older than 2.0.1.
- **Logic (pure, shared, tested):** `shared/attendanceMetrics.ts`
  (`shared/attendanceMetrics.test.ts`).
- **Backend precompute + read API:** `convex/attendanceMetrics.ts`
  (validators in `convex/metricsData.ts`, table in `convex/schema.ts`,
  cron in `convex/crons.ts`).

## How the data flows

The dashboard never scans attendance history on the device. Snapshots are
rebuilt by one cron, fanning out one bounded recompute per sub-group:

- **Nightly rebuild** (`attendance metrics daily rebuild`, **16:00 UTC ≈
  02:00–03:00 Sydney**) — `recomputeAll` recomputes the **SOW** sub-group for
  the current staff year (campuses are built from their weeklies since 2.5.0;
  see [weekly-insights.md](weekly-insights.md)). Roll-call and event changes therefore show up in
  Insights the next morning, not within minutes; the trade-off is that the
  backend no longer re-reads a megabyte of snapshots every 15 minutes.
- **Rollover** — the October 1 prefill job (`prefillNextStaffYear`) kicks a
  `recomputeAll` for the year that has just ended so the incoming year's
  snapshots start honest. While a current-year snapshot is missing, the
  Attendance tab shows "Not ready yet". Apps older than 2.0.1 still fall back
  to the on-demand `liveSnapshot`.
- **General tab campus chart** — the same nightly `recomputeAll` also rebuilds
  `campusAttendanceSnapshots` (`generalMetrics.recomputeCampusWeeklyAttendance`),
  so Insights → General reads one small row instead of every weekly meeting's
  attendance.

Each recompute runs as an **action** (`recomputeSubgroup`) so it can page the
large attendance read across several bounded query transactions instead of
reading every event's attendance in one mutation. It:

1. Loads that sub-group's events since the **earlier** of the staff-year start
   or 52 weeks ago (`HISTORY_WEEKS`; one bounded gather that serves every
   range — the look-back feeds the absolute-time reasons: lapsed /
   re-engaged), scanning at most `MAX_EVENT_SCAN` and keeping the sub-group's
   newest `MAX_EVENTS` (`gatherEvents`). Because the look-back equals the
   longest preset range, the **Past year** tab has no earlier period to
   compare against, so its "change vs previous period" is always blank.
2. Marks events tagged **"Weekly Meeting"** as weekly meetings.
3. Reads attendance in chunks of `ATTENDANCE_CHUNK` events per transaction
   (`gatherAttendanceChunk`), keyed by the shared `personKey`.
4. Resolves each attendee's display name / subtitle / photo and cheap breakdown
   fields (Campus, Role) (`gatherPersons`).
5. Runs `computeSubgroupMetrics` for every preset range (**past week / month /
   year** — `RANGE_WEEKS` = 1 / 4 / 52) × collaborative-included/excluded, and
   upserts one `attendanceMetricsSnapshots` row per combination
   (`writeSnapshots`, resilient to duplicate rows so racing recomputes can't
   wedge later reads). Alongside each snapshot it writes one tiny
   `attendanceMetricsWeeklyAverages` row (the weekly-meeting average). Since
   2.5.0 the SOW campus comparison reads each campus's recent weekly head
   counts from its `weeklyInsightIndex` row instead.
   **Custom** date ranges were removed in 2.0.1: they recomputed everything
   from raw attendance on each view. `liveSnapshot` stays only for older apps. The whole-**staff-year** range is supported by
   the pure logic (`STAFF_YEAR_RANGE`) but is **not** currently precomputed
   (`ALL_RANGES = [...RANGE_WEEKS]`).

The view reads the snapshot (the same lookup as `api.attendanceMetrics.snapshot`, still served for older apps), which tolerates a
stale prior-staff-year row (treated as "not ready") and a rare duplicate row
(takes the newest). Because the nightly cron keeps snapshots current
automatically, **there is no manual refresh control in the UI**. A server-side
recovery path still exists — `api.attendanceMetrics.recomputeNow` (gated by
`requireAttendanceManager`) — but it is not wired to a button today. For SOW
it's throttled to once per week via `MANUAL_REFRESH_COOLDOWN_MS`; for a campus
it runs that campus's weeklies rebuild with no cooldown; with no sub-group it
does both for everything. The
cooldown is measured from the last *manual* refresh
(`attendanceMetricsRuns.lastManualRefreshAt`), never from the nightly rebuild's
`computedAt`, otherwise the cron would keep the manual path permanently
throttled.

Authorization is server-side and identical to the rest of Attendance: any
provisioned staff member of the current staff year can read; only campus leaders
/ admins can trigger `recomputeNow`.

## Definitions & thresholds

All thresholds live in `METRICS_THRESHOLDS` (`shared/attendanceMetrics.ts`) so
they can be tuned in one place. Current values:

| Concept | Rule | Constant |
| --- | --- | --- |
| **Regular** | Attended ≥ 3 relevant events in the **selected range**, **or** ≥ 50% of the recent weekly meetings | `regularMinEvents`, `regularWeeklyRate`, `recentWeeklyWindow` |
| **At risk** | A regular who attended **0** of the last 3 weekly meetings held → *"Missed the last 3 weekly meetings"* | `atRiskMissedWeeklies` |
| **Lapsed** | Attended enough historically to be a regular, but nothing in the last 30 days → *"Used to attend regularly, absent for N"* | `lapsedDays` |
| **Newcomer** | First-ever attendance within the **more recent** of the period start and the last 30 days — so a short range uses the period, and a long range (e.g. staff year) still only counts people new in the last 30 days (counted in the summary) | `newcomerDays` |
| **Newcomer needs follow-up** | First attended once, a relevant weekly meeting has since occurred, and they haven't returned → *"Newcomer: first attended N ago, hasn't returned"* | `newcomerDays` |
| **Re-engaged** | Attended within the last 30 days after a prior gap of ≥ 30 days → *"Returned after N away"* | `reengagedGapDays` |
| **Weekly average** | Mean sign-ins per Weekly Meeting **that happened**: a Weekly Meeting with no sign-ins (cancelled or holiday week) is left out of the average and the weekly chart; the General/SOW per-campus averages use the same rule | — |
| **Declining** | Fewer attendances in the recent half of the **selected range** than in the half before it → *"Attending less than before"* | — (splits the range in half) |

A person appears in **Needs follow-up** at most once, using the most pressing
reason (at risk → lapsed → declining → newcomer-no-return → re-engaged).

### What the tab shows

- **SOW:** the weekly-meeting average for each campus over the chosen range
  (from each campus's recent weeklies), then SOW events' three numbers.
  There's no follow-up list at org level.
- **A campus (before 2.5.0, historical):** three numbers, one chart and Needs
  follow-up, from these Snapshots. A campus is now its weeklies view; see
  [weekly-insights.md](weekly-insights.md).

Charts are plain React Native `View`s (no charting dependency). The pure
module still computes the older series (rolling average, unique by month, new
vs returning, breakdowns) because apps older than 2.0.1 read them from the
snapshot; drop them once nobody is on those versions.

## Language

Follow-up copy is deliberately pastoral and non-judgemental ("Follow-up
suggested", "A gentle prompt … No judgement implied"). These are people, not
scores.

## Notes / future extensions

- Breakdowns currently cover **Campus** and **Role** (cheap to derive without
  metadata-id resolution). Metadata-field breakdowns (Year, Gender) can be added
  by resolving those fields in `resolvePersons` and attaching them to
  `MetricsPerson.breakdown` — `computeSubgroupMetrics` already renders any fields
  it's given.
- Person identity uses the shared `personKey` (`staff:<email>` / `member:<id>`).
