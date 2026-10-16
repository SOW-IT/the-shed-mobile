# Insights → Attendance for SOW: TWIG and PPN

From 2.9.0, Insights → Attendance with **SOW** selected has a switcher:
**Campuses | TWIG | PPN**. Campuses is the older SOW view
([attendance-metrics.md](attendance-metrics.md)), with its range picker and
collaborative switch. TWIG and PPN have a staff-year picker instead. Why it
works this way: [ADR 0011](adr/0011-sow-twig-ppn-insights.md). Words:
[Attendance](context/attendance.md).

## Everything comes from the server

The app draws what the server sends and holds none of the content:

- **The switcher** is `sowInsights.tabs`: each tab's key, label, which picker
  it uses (`range` for the Campuses view, `years` for a staff-year view) and
  the picker's title. Change the labels, reorder or remove tabs with a Convex
  deploy. A tab with the `range` picker shows `attendanceMetrics.view`; a tab
  with `years` shows `sowInsights.view({ mode: <its key> })`.
- **Each view** is `sowInsights.view({ mode, staffYear? })`: the staff years to
  pick from and the blocks to draw, built by `shared/sowInsightsView.ts` from
  the rules in `shared/sowInsights.ts`. Cards, charts, wording, who is counted,
  follow-up rules: all a deploy.
- A mode the server no longer knows (an old tab still on screen) gets a "Not
  available" note, never an error.
- What needs an app release: a brand-new block type. The app skips block
  types it doesn't know. 2.9.0 added one, `monthRows`, for the PPN view.

Apps older than 2.9.0 don't show the switcher; they keep the Campuses view.

## Words

| Word | Meaning |
| --- | --- |
| TWIG event | An event with the Other-events **TWIG** tag and without the Other-events PPN tag. |
| PPN event | An event with both the Other-events **TWIG** and **PPN** tags. A campus event tagged PPN alone (Intercampus PPN) isn't one, and neither is a weekly's PPN tag. |
| Held | At least one sign-in. A TWIG or PPN with none is left out of every number and listed under **No roll taken**. |
| Staff year | 1 Oct to 30 Sep. A view shows one staff year, compared with the one before. |
| Campus leader | A staff profile that staff year with a university role (Student Leader, President, Vice President, Executive). Their campus is that role's university. |
| Organiser | A staff profile that staff year with at least one assignment, none of them a university role. |
| No staff profile | No staff profile that staff year, a profile with no assignments (which doesn't make anyone staff, as everywhere in the app), or a sign-in with no member. |

## TWIG

Only campus leaders count in the numbers. Organisers are listed but not
counted; people with no staff profile are listed and flagged.

- **Cards**: Average attendance (campus leaders per held TWIG), People
  (different campus leaders), Regulars (campus leaders at half or more of the
  year's held TWIGs, `regularShare`, counted once more than `followUpMisses`
  TWIGs have a roll; until then the card shows "–, After 3 TWIGs" and nobody
  is tagged Regular). The year in progress is compared with
  last staff year **up to the same date**; a past year with the whole year
  before. When last year had no TWIG with a roll by that date, the caption
  says so and the cards show no comparison.
- **TWIG by TWIG**: campus leaders at each TWIG in order, against the same
  TWIG (1st with 1st) last staff year in grey.
- **Campus leader sign-ins by campus**.
- **Needs follow-up** (year in progress only): regulars who missed the last
  `followUpMisses` (2) held TWIGs.
- **Everyone**: searchable, grouped Campus leaders / Organisers (other staff)
  / No staff profile, each with their share of held TWIGs and when they last
  came. Filters by group and Regular.
- **No roll taken**.
- A year with no TWIG (or PPN) roll yet shows an empty state with a button to
  the latest earlier staff year.

## PPN

Everyone counts; people with no staff profile are noted, never flagged.

- A caption with the year's PPNs, sign-ins and people, split campus leaders /
  other staff / others.
- **Month by month**, newest first: date and name, sign-ins, change against
  the PPN in the same calendar month last staff year, first-timers (their
  first PPN ever, across every year), split by campus and by campus leaders /
  staff / others. In the campus split, other staff with no campus count under
  SOW, and anyone else without a university role uses their member Campus
  field, else "No campus".
- **No roll taken**.

## The query

`convex/sowInsights.ts` computes on each read. There's no snapshot or cron:
prod has about 40 TWIG/PPN events and 1,500 sign-ins. It reads every event,
newest first (`MAX_EVENTS`, so if the cap is ever reached it's the oldest that
drop off), keeps the ones the tags make TWIG or PPN, and lists every staff
year that has one of that kind (plus the current year) in the picker. It
reads their sign-ins (`attendance.by_event`) and resolves people with the
weekly Insights' `resolvePeople`, by staff year. It's reactive, so a sign-in shows straight
away. If it ever gets slow, precompute per staff year the way
`weeklyInsightViews` does.

`regularShare` and `followUpMisses` come from the weekly Insights settings
(`weeklyInsights:setSettings`).
