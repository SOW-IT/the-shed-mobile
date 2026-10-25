# Insights → Attendance for a campus (weeklies)

From 2.5.0 a campus's Attendance view is built around its **weekly meetings**
(events with a term and week, tagged *Weeklies*), the way leaders kept it in their attendance
sheets. The org-wide SOW view is unchanged (see
[attendance-metrics.md](attendance-metrics.md)). Why it works this way:
[ADR 0008](adr/0008-weekly-insights.md). Words: [Attendance](context/attendance.md).

## What it shows

Pick a **term** (T1–T3 at UNSW, Sem 1–2 elsewhere) or a **whole calendar
year**; the current term opens first. The picker has one row per year, newest
first, with its terms side by side and the whole year last (T1, T2, T3,
Year).

- **Turnout**: Weeklies average and People cards, then week by week against
  the term before (its bars in grey); a year has its weeklies average by term
  against last year instead.
- **Who came**: Regulars, Newcomers, Newcomers who stayed (came back for a
  second weekly) and Campus share cards, then who came each week by category
  (one chart per term on a year page). Each weekly is its own point: two in
  the same week (a special night in a week the campus didn't number, say)
  show as "W7" and "W7·2", in the charts and in a member's week grid.
- Every card has its change in a pill and last time's number ("vs 55.5"). A
  term is compared with **the term before** (T3 with T2, Sem 2 with Sem 1, T1
  with last year's T3); one still running is compared up to the same week,
  and the caption says so ("compared with Sem 1 2026 up to week 10"), since
  the term before's own page shows its whole term. A year is compared with
  last year; the year in progress up to the same term and week, and so is its
  by-term chart. Each card's (i) says what it's compared with, and Weeklies
  average and People say whether Mega and combined weeklies are counted (not
  by default; see `jointWeeklies` under Settings).
- **Needs follow-up** (current term only): people who were coming (Regular,
  or a Leader, judged on the weeklies before) but missed the last 2 held
  weeklies; then newcomers who missed the last one, while their visit is
  recent. Staff, alumni and guests are left out.
- **Visitors**: this term's visitors from other campuses, those not back in
  the last 2 first, while their visit is recent.
- **Everyone**: each person's share of the weeklies held so far ("6/8 · 75%"),
  category and last visit ("Last came T3W2 (23 Sep)"), grouped (this campus, other campuses, leaders,
  staff/alumni/guests) with Irregulars and Newcomers first. Filter by
  category or "No campus set", sort by % / name / last came, search by name.
- Long lists (follow-up, visitors, everyone, a member's events) scroll inside
  their box, with **Show all** under them to see the whole list.
- Tapping anyone opens their page (`/attendance/member/[key]`): category,
  share each term and when they last came, the week grid ("Weeklies attended
  this term"), every event they've signed in to, and Edit member.
- **Sign-in tags**: while an event is on, its sign-in screen tags Newcomers
  and Visitors from the last nightly build, so leaders can welcome them. A
  shared (multi-campus) event only tags newcomers; a finished event shows no
  tags.

## Rules (`shared/weeklyInsights.ts`)

- **Held weekly**: an event with a term and week (`weekly` mark) for
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
  last weekly: Visitor set by hand on the member → Staff, alumni & guests
  (staff profile, or Alumni set by hand) → Leader (a university leader role
  at this campus) → Visitor (another campus, fewer than 2 weeklies here this
  term) → Newcomer (first-ever weekly here was
  this term, until they've come 4+ times at the Regular share) → Regular (half
  or more of the term's weeklies, counting last term too until 4 have been
  held) → Irregular. Only Visitor and Alumni are read from a member's Role
  field: every other Role is worked out from these categories (see Role in
  [context/attendance.md](context/attendance.md)), and the latest term's
  category is what the Members list shows.
- **A year page** keeps Staff, Leader and Visitor from each person's latest
  term, but sorts students by the whole year: half or more of the year's
  weeklies is Regular, otherwise Newcomer if their latest term had them as
  one, else Irregular. The Regulars card, the Regular pill and the Regular
  filter all use this, so they always agree. A term page is unchanged.
- Who's listed: anyone who came this term or last term.

## Settings

One row in `weeklyInsightsSettings` (defaults in `DEFAULT_WEEKLY_SETTINGS`).
Change any of them without a deploy; every campus is rebuilt from its stored
facts straight away, and so are General's weeklies averages by campus (which
follow `jointWeeklies` too):

```bash
npx convex run weeklyInsights:setSettings '{"regularShare": 0.4}'
```

`regularShare`, `termGapDays`, `carryOverWeeklies`, `followUpMisses`,
`newcomerMisses`, `freshWeeklies`, `newcomerPromoteWeeklies`,
`visitorMinWeeklies`, `termCampuses`, `jointWeeklies`, `staffRoles`,
`leaderRoles`.

## Creating a weekly

New event is one screen and starts on **Weekly** (campuses only; SOW events
are always Other events). A Weekly gets a Term/Semester dropdown (only the
date's year) and a Week dropdown (1 to 14), pre-filled for the event's date by
`weeklyInsights.suggestWeekly` (the same rules as above, with the new weekly
added), and a name like "T3W5" or "S2W5" that follows them until the leader
types in it. The date defaults to a week after the campus's last weekly (or
the next same weekday if that has passed), at that weekly's times. Picking a
term and week the campus already has asks for confirmation. The event stores
`weekly: { year, slot, week }` and gets the *Weeklies* tag; switching an event
back to Other event takes both off, along with any weekly-only tags.

A weekly is defined by that mark, not by the tag ([ADR 0010](adr/0010-weekly-is-its-mark.md)).
Tags belong to one list,
Weeklies (BAM, PPN, Games Night, ...) or Other events, and the form offers
only the list for its kind.

A one-off backfill gave every existing one-campus weekly its term and week
(and tagged the ones that looked like weeklies by name but weren't tagged).

## The build (`convex/weeklyInsights.ts`)

- **Stored per campus**: who came to which weekly, one row per term
  (`weeklyTermFacts`); the finished blocks for each term and year
  (`weeklyInsightViews`); an index row with the period list, how far
  through the attendance change log it got, and recent weekly head counts
  (which the SOW view's campus comparison reads); and everyone's category in
  the latest term (`weeklyCategories`), for the sign-in tags
  (`weeklyInsights.signInTags`).
- **Nightly** (`weekly insights nightly build`, 16:30 UTC): for each campus,
  read the attendance change log and new events since the last build. Nothing
  relevant → just move the watermark. Otherwise re-read only the changed
  weeklies (or a removed member's), rewrite the terms whose facts changed,
  and redo the views from the term before the first change onwards (a term is
  compared with the one before, so a change also redoes the next), plus the
  latest term if someone in it or the term before was edited. The latest term is also redone when it stops running (no more "so far"). A settings change or a bump of
  `VIEW_VERSION` (when a deploy changes what views show) redoes every view
  from the stored facts, without reading attendance.
- **First build** reads all weekly history once.
- **By hand**: `npx convex run weeklyInsights:rebuild '{"subgroup": "University of New South Wales"}'`
  (add `"force": true` to redo every view), or `weeklyInsights:rebuildAll`.
