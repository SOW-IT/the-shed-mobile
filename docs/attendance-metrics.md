# Insights → Attendance (metrics dashboard)

A leader-facing dashboard that turns raw sign-in data into trends and gentle
follow-up prompts for a sub-group and time range.

- **UI:** `src/components/attendance/MetricsTab.tsx` (+ `MetricsCharts.tsx`),
  hosted in its own **Insights** bottom tab (`src/app/(tabs)/insights.tsx`) under
  the **Attendance** top-bar segment. A second **General** segment is scaffolded
  for future cross-cutting insights.
- **Logic (pure, shared, tested):** `shared/attendanceMetrics.ts`
  (`shared/attendanceMetrics.test.ts`).
- **Backend precompute + read API:** `convex/attendanceMetrics.ts`
  (validators in `convex/metricsData.ts`, table in `convex/schema.ts`,
  cron in `convex/crons.ts`).

## How the data flows

The dashboard never scans attendance history on the device. Snapshots are
rebuilt by one cron, fanning out one bounded recompute per sub-group:

- **Nightly rebuild** (`attendance metrics daily rebuild`, **16:00 UTC ≈
  02:00–03:00 Sydney**) — `recomputeAll` recomputes every sub-group for the
  current staff year. Roll-call and event changes therefore show up in
  Insights the next morning, not within minutes; the trade-off is that the
  backend no longer re-reads a megabyte of snapshots every 15 minutes.
- **Rollover** — the October 1 prefill job (`prefillNextStaffYear`) kicks a
  `recomputeAll` for the year that has just ended so the incoming year's
  snapshots start honest. While a current-year snapshot is missing, the
  Attendance tab falls back to the same on-demand `liveSnapshot` used for
  custom ranges.

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
   wedge later reads). **Custom** date ranges are computed on demand via
   `liveSnapshot` (not stored). The whole-**staff-year** range is supported by
   the pure logic (`STAFF_YEAR_RANGE`) but is **not** currently precomputed
   (`ALL_RANGES = [...RANGE_WEEKS]`).

The tab reads a snapshot via `api.attendanceMetrics.snapshot`, which tolerates a
stale prior-staff-year row (treated as "not ready") and a rare duplicate row
(takes the newest). Because the nightly cron keeps snapshots current
automatically, **there is no manual refresh control in the UI**. A server-side
recovery path still exists — `api.attendanceMetrics.recomputeNow` (gated by
`requireAttendanceManager`, throttled to once per week per sub-group via
`MANUAL_REFRESH_COOLDOWN_MS`) — but it is not wired to a button today. The
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
| **Declining** | Fewer attendances in the recent half of the **selected range** than in the half before it → *"Attending less than before"* | — (splits the range in half) |

A person appears in **Needs follow-up** at most once, using the most pressing
reason (at risk → lapsed → declining → newcomer-no-return → re-engaged).

### Summary cards

- **Avg / event** — mean unique attendees per event in the period, with the
  **change vs the previous comparable period** shown as a delta.
- **Events held**, **Unique attendees**, **Newcomers**, **Follow-up suggested**.
- **Weekly consistency** — steadiness of weekly-meeting turnout: mean attendance
  ÷ peak attendance across the period's weekly meetings (1.0 = rock steady).

### Trends

Attendance over time (per event), rolling average (`rollingAvgWindow` events),
weekly-meeting trend, unique attendees by month, new vs returning per event, and
optional Campus/Role breakdowns of the period's unique attendees. Charts are
plain React Native `View`s (no charting dependency).

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
