# Insights → Attendance for a campus (weeklies)

From 2.5.0 a campus's Attendance view is built around its **weekly meetings**
(events tagged *Weekly Meeting*), the way leaders kept it in their attendance
sheets. The org-wide SOW view is unchanged (see
[attendance-metrics.md](attendance-metrics.md)). Why it works this way:
[ADR 0008](adr/0008-weekly-insights.md). Words: [Attendance](context/attendance.md).

## What it shows

Pick a **term** (T1–T3 at UNSW, Sem 1–2 elsewhere) or a **whole calendar
year**; the current term opens first.

- **Cards**, each against last year: Weekly avg, People, Regulars, Newcomers,
  Newcomers who stayed (came 2+ times), Campus share. A term still running is
  compared with last year's same term up to the same week; the current year
  with last year up to the same day.
- **Needs follow-up** (current term only): people who were coming (Regular,
  or a Leader, judged on the weeklies before) but missed the last 2 held
  weeklies; then newcomers who missed the last one, while their visit is
  recent. Staff, alumni and guests are left out.
- **Visitors**: this term's visitors from other campuses, those not back in
  the last 2 first, while their visit is recent.
- **Charts**: week by week against last year's term, and who came each week
  by category.
- **Everyone**: each person's share of the weeklies held so far ("6/8 · 75%"),
  category and last visit, grouped (this campus, other campuses, leaders,
  staff/alumni/guests) with Irregulars and Newcomers first. Filter by
  category or "No campus set", sort by % / name / last came, search by name.
- Tapping anyone opens their page (`/attendance/member/[key]`): category and
  share each term, the week grid, every event they've signed in to, and Edit
  member.

## Rules (`shared/weeklyInsights.ts`)

- **Held weekly**: a Weekly Meeting event (or one created as a Weekly) for
  one campus that someone signed in to. A weekly shared with other campuses
  (a Mega or combined weekly) doesn't count: it would start terms early and
  fill a campus's numbers with other campuses' people (setting
  `jointWeeklies`, off).
- **Term**: held weeklies grouped where there's a gap of 18+ days, named by
  the month the run starts (terms: Jan–May T1, Jun–Aug T2, Sep–Dec T3;
  semesters: Jan–Jun, Jul–Dec). Runs that land on the same name are one term,
  so a cancelled week next to a break doesn't split it. A weekly's own term
  (set when it was created as a Weekly) always wins.
- **Week**: the week the weekly was created with; else the week in its name
  ("T2W8", "S1W8", "WM #9", "WK #13"); else Monday-to-Sunday weeks on from the
  last weekly that had one (or from the term's first). Semesters don't number
  the mid-semester break, which is why names come before dates.
- **Categories**, first match wins, using roles and campus as of the term's
  last weekly: Staff, alumni & guests (staff profile or those Role options) →
  Leader (a university leader role at this campus) → Visitor (another campus,
  fewer than 2 weeklies here this term) → Newcomer (first-ever weekly here was
  this term, until they've come 4+ times at the Regular share) → Regular (half
  or more of the term's weeklies, counting last term too until 4 have been
  held) → Irregular.
- Who's listed: anyone who came this term or last term.

## Settings

One row in `weeklyInsightsSettings` (defaults in `DEFAULT_WEEKLY_SETTINGS`).
Change any of them without a deploy; every campus is rebuilt from its stored
facts straight away:

```bash
npx convex run weeklyInsights:setSettings '{"regularShare": 0.4}'
```

`regularShare`, `termGapDays`, `carryOverWeeklies`, `followUpMisses`,
`newcomerMisses`, `freshWeeklies`, `newcomerPromoteWeeklies`,
`visitorMinWeeklies`, `termCampuses`, `jointWeeklies`, `staffRoles`,
`leaderRoles`.

## Creating a weekly

New event asks **Weekly or Other event** first (campuses only, not SOW). A
Weekly gets a Term/Semester dropdown and a Week number, pre-filled for the
event's date by `weeklyInsights.suggestWeekly` (the same rules as above, with
the new weekly added), and a name like "Weeklies T3W5". Changing the date
updates the suggestion until the leader edits a field. The event stores
`weekly: { year, slot, week }` and gets the Weekly Meeting tag; switching an
event back to Other event takes both off.

`weeklyInsights:backfillWeeklies` gave every existing one-campus weekly its
term and week (and tagged the ones that looked like weeklies by name but
weren't tagged). Run it with `'{"dryRun": true}'` first to see the result;
it's safe to run again.

## The build (`convex/weeklyInsights.ts`)

- **Stored per campus**: who came to which weekly, one row per term
  (`weeklyTermFacts`); the finished blocks for each term and year
  (`weeklyInsightViews`); and an index row with the period list, how far
  through the attendance change log it got, and recent weekly head counts
  (which the SOW view's campus comparison reads).
- **Nightly** (`weekly insights nightly build`, 16:30 UTC): for each campus,
  read the attendance change log and new events since the last build. Nothing
  relevant → just move the watermark. Otherwise re-read only the changed
  weeklies (or a removed member's), rewrite the terms whose facts changed,
  and redo the views from the term before the first change onwards, plus the
  latest term if someone in it was edited. The year view is also redone when
  last year's comparison date passes. A settings change or a bump of
  `VIEW_VERSION` (when a deploy changes what views show) redoes every view
  from the stored facts, without reading attendance.
- **First build** reads all weekly history once.
- **By hand**: `npx convex run weeklyInsights:rebuild '{"subgroup": "University of New South Wales"}'`
  (add `"force": true` to redo every view), or `weeklyInsights:rebuildAll`.
  The app's refresh (`attendanceMetrics.recomputeNow`) uses the same path.
