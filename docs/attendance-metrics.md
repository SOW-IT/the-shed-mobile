# Attendance → Insights (metrics dashboard)

A leader-facing dashboard inside the Attendance area that turns raw sign-in data
into trends and gentle follow-up prompts for a sub-group and time range.

- **UI:** `src/components/attendance/MetricsTab.tsx` (+ `MetricsCharts.tsx`),
  wired in as the **Insights** tab after Events in `src/app/(tabs)/attendance.tsx`.
- **Logic (pure, shared, tested):** `shared/attendanceMetrics.ts`
  (`shared/attendanceMetrics.test.ts`).
- **Backend precompute + read API:** `convex/attendanceMetrics.ts`
  (validators in `convex/metricsData.ts`, table in `convex/schema.ts`,
  cron in `convex/crons.ts`).

## How the data flows

The dashboard never scans attendance history on the device. A weekly cron
(`attendance metrics recompute`, **Thursdays 03:00 UTC ≈ Thu ~1pm Sydney**) fans
out one bounded recompute per sub-group. Each recompute:

1. Loads that sub-group's events since the later of the staff-year start or
   ~26 weeks ago (capped at `MAX_EVENTS`), plus their attendance.
2. Marks events tagged **"Weekly Meeting"** as weekly meetings.
3. Resolves each attendee's display name / subtitle / photo and cheap breakdown
   fields (Campus, Role).
4. Runs `computeSubgroupMetrics` for every range (**4 / 8 / 12 weeks** and the
   whole **staff year**) × collaborative-included/excluded, and upserts one
   `attendanceMetricsSnapshots` row per combination.

The tab reads a snapshot via `api.attendanceMetrics.snapshot`. Campus leaders and
admins can rebuild on demand (`api.attendanceMetrics.recomputeNow`, gated by
`requireAttendanceManager`) using the tab's **Refresh** action — handy for the
first run before any Thursday has passed.

Authorization is server-side and identical to the rest of Attendance: any
provisioned staff member of the current staff year can read; only campus leaders
/ admins can trigger a refresh.

## Definitions & thresholds

All thresholds live in `METRICS_THRESHOLDS` (`shared/attendanceMetrics.ts`) so
they can be tuned in one place. Current values:

| Concept | Rule | Constant |
| --- | --- | --- |
| **Regular** | Attended ≥ 3 relevant events in the last 8 weeks, **or** ≥ 50% of recent weekly meetings | `regularMinEvents`, `regularWindowWeeks`, `regularWeeklyRate` |
| **At risk** | A regular who attended **0** of the last 3 weekly meetings held → *"Missed the last 3 weekly meetings"* | `atRiskMissedWeeklies` |
| **Lapsed** | Attended enough historically to be a regular, but nothing in the last 30 days → *"Used to attend regularly, absent for N"* | `lapsedDays` |
| **Newcomer** | First-ever attendance within the period / last 30 days (counted in the summary) | `newcomerDays` |
| **Newcomer needs follow-up** | First attended once, a relevant weekly meeting has since occurred, and they haven't returned → *"Newcomer: first attended N ago, hasn't returned"* | `newcomerDays` |
| **Re-engaged** | Attended within the last 30 days after a prior gap of ≥ 30 days → *"Returned after N away"* | `reengagedGapDays` |
| **Declining** | Fewer attendances in the recent half of the window than the half before it → *"Attending less than before"* | `regularWindowWeeks` |

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
