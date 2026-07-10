# Changelog

All notable changes to **The SHED** mobile app. This project follows
[semantic versioning](https://semver.org/); the marketing version lives in
`app.json` and the build number auto-increments per EAS build.

## [Unreleased]

## [1.9.0] — 2026-07-10

### Added
- **Western Sydney University (WSU) campus.** Attendance, Insights, Org chart,
  Admin, and the public Home → Connect list now include Western Sydney
  University as a campus group, with crimson branding (`#A60F2D`) and a matching
  wordmark. Seed / ops can ensure the 2027 university row via
  `admin:ensureUniversity`.
- **Seasons on Home.** Connect explains Seasons — the biblical training course
  held at WSU — alongside REAP and the campus cards.

### Changed
- **WSU brand colour** updated from `#990033` to crimson `#A60F2D` everywhere
  campus colour is used (org chart, attendance chips, member-card outlines,
  Insights charts).

## [1.8.12] — 2026-07-10

### Fixed
- **Rollover no longer aborts on a duplicate `yearSettings` row.**
  `getYearSettings` now uses `.first()` (same as profiles/departments), so a
  stray duplicate can't throw and stop the Oct 1 cron or Finance settings reads.
- **Director lookup no longer walks every staff profile on the hot path.**
  Assigning or clearing the Director caches their email on `yearSettings`;
  `getApprovers` reads the cache (and only scans when the cache is unset).
- **Staff-year / Sydney calendar boundaries survive a broken `Intl` zone.**
  If `Intl.formatToParts` throws or returns junk (historically shaky on some
  Android Hermes builds), we fall back to fixed AEDT/AEST offset math so the
  app doesn't crash or mis-bucket around Oct 1 / Jan 1.

### Changed
- **Lists load more as you scroll — no more "Load more" buttons.** The All →
  Ongoing tab now pages 20 at a time like Completed, and every attendance list
  that used a Load more button (Events, Members, Audit, subgroup events, and
  the event roll-call roster) now reveals the next page when you scroll near
  the bottom. A small spinner shows while the next page is loading.

### Added
- **Mac feature workflow skills.** `create-feature` and an expanded
  `create-pr` skill document the local Metro / baguette / Netlify verify loop
  used on this machine before opening a PR.

## [1.8.11] — 2026-07-10

### Changed
- **Expo SDK 56 dependency alignment (safe patch bumps).** Dependabot opened
  several chore PRs that jumped individual packages to Expo SDK 57 / React
  Native 0.86 / TypeScript 7, which break `npm ci` against this app's SDK 56
  peer ranges (`react-native-reanimated` needs RN ≤0.85; `convex-helpers`
  needs TypeScript ^5.5 || ^6). This release instead runs `npx expo install
  --fix` so every Expo module stays on the SDK 56 line (e.g. `expo` →
  ~56.0.15, `expo-dev-client` → ~56.0.22, `expo-sharing` → ~56.0.21).
  Supersedes #218, #219, #220, #221, and #222.

## [1.8.10] — 2026-07-09

### Fixed

- **Staff year uses Australia/Sydney, not a hard-coded UTC offset.** Oct 1 and
  Jan 1 boundaries now go through `Intl` with the IANA zone, so DST rule changes
  can't silently drift the rollover instant.
- **A week of breathing room after Oct 1.** If your new staff-year profile isn't
  ready yet, the app reuses last year's profile for the first 7 days after
  rollover (sign-in, approvals, Admin) instead of locking you out at midnight.

### Changed

- **Documented intentional deferrals** in the rollover audit: live request-list
  caps stay bounded on purpose; leavers/delegations are not auto-copied;
  multi-day events keep the staff year of their start date.

## [1.8.9] — 2026-07-09

### Fixed

- **Staff-year rollover is idempotent.** A second Oct 1 cron run (or accidental
  re-run) no longer overwrites next-year heads, assignments, or the Budget
  Manager — completion is recorded on `yearSettings`, and the cron no-ops
  without re-emailing IT. Manual `copyYear` still works; pass `force: true` to
  intentionally redo.
- **Large orgs no longer lose rows in the annual copy.** Divisions, departments,
  universities, roles, and staff profiles are streamed for the full year instead
  of hard `take()` caps.
- **Director is found even past the 1000th profile.** Approver resolution streams
  the year instead of stopping early.
- **Failed Resend sends surface in the Convex dashboard.** HTTP errors from
  Resend now throw (so scheduled emails show as failed) instead of only logging.
  The rollover IT email also includes a Deployment URL line.

### Changed

- **Receipt purge runs an hour after rollover** (Sep 30 15:00 UTC) so the two
  heavy jobs don't share the same minute.
- **Director approval threshold is copied** into the next staff year alongside
  the Budget Manager.

### Added

- Follow-up notes in `docs/rollover-crons-audit.md` for the 1.8.9 remediations.

## [1.8.8] — 2026-07-09

### Fixed

- **Staff-year rollover no longer aborts on stray duplicate rows.** The annual
  Oct 1 copy used to throw if a destination year already had a duplicate
  division, department, or profile (e.g. mid-import). It now matches with
  `.first()` like the rest of the admin read path, so the cron can finish and
  still email IT.
- **Budget Manager picker works for next year after rollover.** Admins whose
  next-year profile is a plain staff assignment (no Data-and-IT / division-head
  role yet) can still open the Finance member list for that year — the same
  current-year admin gate already used by the rest of the Admin screen.

### Added

- **Rollover & cron audit** (`docs/rollover-crons-audit.md`): failure modes for
  `copyYear` / `rollOverStaffYear`, every job in `crons.ts`, carry-over
  requests, and an Oct 1 runbook.

## [1.8.7] — 2026-07-08

### Fixed

- **The web sign-in message now actually shows.** Signing in with a SOW email on
  the personal "Sign in with Google" option was still silent on the web app —
  React Native Web's `Alert` is a no-op, so the message never rendered. It now
  uses the browser's own dialog. (Same for the "Sign-in didn't finish" error.)
- **Attendance rows: tapping the right side reveals the sign-in arrow.** The
  tap-to-preview used the window width, not the card's actual width, so in the
  wide/column layouts the right-side sign-in reveal shrank to a sliver at the far
  edge (while the left-side edit reveal stayed generous). Cards now measure their
  real width, so both sides reveal evenly (and swipe distances are right too).

### Changed

- **Admin console uses the full width with card grids.** On wide screens the
  Users, Structure and Other tabs now lay each section's cards out left-to-right
  (360pt each, as many per row as fit — two on an iPad portrait, three on a
  desktop) instead of one 720pt column — the whole
  year's staff, departments and settings scan at a glance. The Structure sub-tab
  bar (Roles / Divisions / Departments / Universities) keeps its reading-width
  cap, and phones are unchanged (the grids collapse to a single column).
- **Event attendance page is a little wider.** The roster's container now caps
  at 840pt (was 720), giving the side-by-side signed-in / not-signed-in columns
  more room on tablets and desktop.
- **Org chart reads as a centred tree.** Every card (Director, division heads,
  departments, campuses) is now a fixed narrow width, centred, and wraps — so a
  division with one department shows a single centred card instead of one
  stretched across the screen, and several departments sit side by side as a
  centred row.
- **Not-signed-in list stays visible on finished events.** You no longer have to
  tap "Enable editing" to see who didn't sign in — the list shows read-only
  (greyed) until editing is enabled.
- **General insights charts sit side by side.** The trend charts now flow in a
  grid (as many as fit, ~440pt each) like the summary cards, rather than one full
  width chart per row. The "Needs follow-up" list is centred at a comfortable
  reading width.
- **Wide layouts no longer flicker while resizing.** The responsive grids
  (org chart, requests) are now pure flexbox instead of measuring on every layout
  tick, so dragging the window smaller reflows smoothly instead of flickering
  between column counts.

## [1.8.6] — 2026-07-08

### Changed

- **Wide screens use the space.** Beyond the attendance roster (1.8.5), more
  screens now switch to a wide, multi-column layout above a phone-portrait width
  (~700pt — tablets, landscape, web/desktop):
  - **Org chart:** each division's departments lay out as columns (as many as
    fit, ~300pt each, wrapping when there are more), and the campuses do the
    same — instead of one long stacked list.
  - **Metrics / Insights:** charts span the full screen width rather than a
    720pt column.
  - **Requests:** the Mine and All lists show as side-by-side cards. (Review and
    Bank stay a single readable column.)
  Phones in portrait are unchanged.

### Fixed

- **Signing in with a SOW email on the personal "Sign in with Google" option now
  explains itself on the web app.** On phones it already showed a "Use your SOW
  account" prompt; on the web it failed silently after the redirect. It now shows
  the same message.
- **Opening a link in the app no longer also opens the App Store.** On mobile
  web, tapping "Open" on the app prompt could still bounce to the store a moment
  later if the tap was slow. The store fallback now only fires when the app
  clearly didn't open (the tab is still visible and focused), so it's the app or
  the store, never both.

### Changed

- **Roster splits into two columns on wide screens.** On tablets, landscape, and
  the web/desktop app (anything wider than a phone in portrait), an event's
  attendance roster now shows side by side — not signed in on the left, signed in
  on the right — instead of stacked. Each column scrolls on its own, so scrolling
  one side never moves the other or the rest of the page. Phones in portrait are
  unchanged (single column).

## [1.8.4] — 2026-07-07

### Added

- **Receipt total.** When a receipt has more than one recipient, the submit
  sheet now shows a locked, auto-calculated "Total ($)" that sums the recipient
  amounts (read-only, so it's clearly derived), and the request card shows a
  matching **Total** line at the bottom of the receipts. Single-recipient
  receipts are unchanged — the one amount already is the total.
- **App version on your profile.** Your profile now shows the app version (e.g.
  "Version 1.8.4") under the Sign out button.

## [1.8.3] — 2026-07-07

### Fixed

- **Money fields now accept cents.** The request amount, receipt amount, paid
  amount, and the Director-approval threshold used the plain numeric keyboard,
  which on iOS has no decimal-point key — so amounts like "12.50" couldn't be
  entered. They now use the decimal keypad, and the shared input filter caps the
  entry at two fractional digits (dollars and cents), silently dropping any
  extra typed digits rather than accepting fractions of a cent.
- **Amounts with cents now display to two decimals, with thousands
  separators.** A request, receipt, paid amount, or the Director-approval
  threshold that has a fractional part is shown to exactly two decimals (e.g. an
  amount entered as "12.5" reads as "$12.50"), and dollars are grouped
  ("$1,234.50"). Whole-dollar amounts stay bare ("$12"). All money figures share
  one formatter so they read consistently.

## [1.8.2] — 2026-07-07

### Changed

- **Signed-in attendees now show their details, not just the time.** A
  signed-in roll-call row previously showed only the sign-in time (and any
  note). It now appends the same roles / metadata line an unsigned row shows —
  e.g. "5:03 PM · President · 3rd year" — so a person reads the same in either
  list, just with the time up front.
- **Campus dropped from roll-call subtitles.** Both signed-in and not-signed-in
  rows no longer repeat the campus in the subtitle line — the row's right-hand
  chip already shows it. Campus remains searchable (typing e.g. "Macquarie"
  still matches).

### Fixed

- **Switching the admin People picker to the next staff year no longer crashes
  the screen.** Admins manage both the current and next staff year, but the
  People list judged admin rights from the caller's profile _for the year being
  viewed_ — and an admin's authority usually comes from a division headship or
  Data-and-IT membership that their next-year profile doesn't carry. So picking
  next year threw "Only admins or the Finance Head can view people" and blanked
  the whole admin screen with "Something went wrong". Admin rights are now judged
  from the current staff year (the same basis as the rest of the admin screen),
  so the next year opens normally; the Finance Head still gets access for that
  year's delegation picker.
- **The full-screen error fallback now follows the theme.** "Something went
  wrong" previously always rendered on a light cream background; in dark mode it
  flashed a bright panel. It now uses the app's dark palette (deep-green
  background, light text) when the system is in dark mode.

### Changed (internal)

- **Admin reads tolerate a stray duplicate profile/department.** `getProfile`
  and `getDepartment` now use `.first()` instead of `.unique()` (matching the
  existing attendance-member lookup), so a duplicate person-year or
  department-year row that briefly exists mid-import or mid-rollover degrades
  gracefully in reads rather than throwing a hard "Server Error". Write paths
  still enforce one row per key.

## [1.8.0] — 2026-07-07

### Added

- **Sign in with Apple.** The signed-out menu now offers "Sign in with Apple"
  on iOS, below the two Google options, satisfying App Store **Guideline 4.8
  (Login Services)** — an equivalent login that limits data to name + email,
  lets users hide their email behind a private relay, and doesn't harvest
  interactions for advertising. The native system sheet returns a signed
  identity token that the backend verifies against Apple's public keys before
  creating or reusing an account. Like a personal Google account, an Apple
  account is a visitor unless its email matches a staff profile; an
  `@sow.org.au` address is redirected to "Sign in with your SOW account".
  _(Requires the Sign In with Apple capability on the App IDs and a new native
  build; the row is hidden on Android and web.)_

### Changed

- **Snappier overlay and screen animations.** The sign-in dropdown, option
  sheets, and dialogs now fade in/out quickly (and dismiss faster than they
  appear), screen push/pop transitions are shorter, and list/content entrances
  cascade in faster — so you can tap in and out without waiting on motion.
  Durations are centralised in one place (`durations` in `theme.ts`).

## [1.7.5] — 2026-07-06

### Changed

- **Signed-out visitors now default to the Home tab** instead of the Org chart.
  The web entry point (`/`) and staff-tab deep links redirect signed-out users
  to Home; signed-in accounts without a staff profile still land on the Org
  chart.

## [1.7.4] — 2026-07-06

### Added

- **Home is now a tab for everyone.** The Home button sits on the left of the
  bottom bar for all users — visitors and signed-in staff alike — so anyone can
  return to the SOW landing surface at any time.
- **Sign in with a personal Google account.** The sign-in menu now offers a
  second option alongside "Sign in with your SOW account", letting anyone sign
  in with a personal (non-staff) Google account to use the public surfaces.
  _(Requires the Google OAuth consent screen to be "External"; Sign in with
  Apple is planned once Apple Developer credentials are configured.)_

### Changed

- **The top-left logo** takes signed-out visitors and signed-in accounts without
  a staff profile to the Home tab; staff still land on their workspace.
- **Insights is fully available to any signed-in account.** Signing in — even
  without a staff profile — now unlocks the full org-wide General dashboard (the
  year picker and per-year breakdown), not just the public preview. The
  per-campus Attendance view, which shows individual student data, stays
  staff-only.
- Personal (non-staff) accounts never appear in the Admin → Users assignment
  lists or the people picker; those remain @sow.org.au-only.
- **Web app moving to its own domain: `theshed.sow.org.au`** (from
  `the-shed-web.vercel.app`). Email/notification links, the canonical app URL,
  and the app's universal-link config now use the new domain; the old
  `.vercel.app` address keeps working during the cutover. Requires DNS + Vercel
  domain setup and the prod `SITE_URL` env var (see LAUNCH.md § 6).
- **Universal / app links are now configured.** The real
  `web/.well-known/apple-app-site-association` and `assetlinks.json` are in place
  (served as JSON via `web/vercel.json`), so tapping a `theshed.sow.org.au` link
  opens the native app — effective once these deploy and a native build ships
  the updated `associatedDomains`.

## [1.7.2] — 2026-07-05

### Fixed

- **Attendance roll-call sign-in/out no longer gets stuck showing the wrong
  state on failure.** If a sign-in or sign-out couldn't be saved (e.g. a
  connection hiccup), the row used to keep showing the optimistic result
  forever with no explanation; it now reverts and shows what went wrong.
- The **"Sign in with your SOW account"** menu (visitor avatar → Sign in) is
  now reachable by VoiceOver and other assistive tech — its button previously
  sat behind the menu's "tap outside to close" region, which made it
  invisible to screen readers even though it displayed normally.

## [1.7.1] — 2026-07-04

### Fixed

- Insights → General → **Weekly meeting attendance**: dropped "by campus"
  from the title, and it now follows the bars/lines toggle like the other
  trend charts (bar mode draws one bar per campus side by side, since the
  values are averages rather than a stack-able total).
- Insights → Attendance now defaults to a **2-week** range instead of 8.
- **New vs returning** and **Student leaders vs everyone else** are now
  shown only for individual campuses, not for the org-wide SOW view.
- Admin → Other: moved **Sync Directory Now** to the bottom of the section.
- Tapping the top-left "THE SHED" logo now goes to the **Home** tab (it was
  incorrectly routing to Requests).

## [1.7.0] — 2026-07-04

### Added

- **The app is now open to everyone.** You no longer need to sign in to use
  THE SHED — the app launches straight into the public Org chart, where
  anyone can browse who serves across SOW and open a person's profile and
  service history. Signing in (top-right avatar → "Sign in with Google")
  reveals the staff tools in place.
- **A new Home tab**, styled to the SOW brand guidelines, with four pages:
  - **Home** — SOW's mission and values (sow.org.au/our-mission), how to
    volunteer, and links to Instagram, Facebook, LinkedIn, Spotify and email.
  - **Resources** — the helpful websites, Christian psychologists and
    helplines from THE SHED web footer, with tap-to-call helpline numbers.
  - **Connect** — the four university societies in their campus colours,
    what happens at a Weekly Meeting, and how to find your campus meetup
    (sow.org.au/students).
  - **Partner** — ways to partner with SOW: Pray, Give and Volunteer, plus
    newsletter sign-up (sow.org.au/subscriptions) and a Donate link.
- **Weekly meeting attendance by campus** in Insights → General: average
  weekly-meeting turnout per campus (USYD, UNSW, MACQ, UTS) per staff year
  from 2025 (when attendance recording began), the current year showing its
  year-to-date average. Picking a specific staff year adds per-campus cards
  comparing that year's average against the previous staff year.

### Changed

- **Chart polish in Insights:** line graphs now use a uniform y-axis (0 to a
  rounded "nice" maximum with evenly spaced steps) instead of only labelling
  the values the lines happen to hit, and the stacked bar charts thin their
  x-axis labels to keep a run of years readable.
- **Staff tools are gated to signed-in staff.** Requests, Attendance and
  Insights tabs appear only for signed-in users with a staff profile (Admin
  remains admins/Finance-head only); visitors deep-linking into them are sent
  to the Org chart. The notifications bell is hidden for visitors.
- The signed-out person view keeps the personal "local church" field private;
  the pre-provisioned next staff year remains admin-only in the public chart.

## [1.6.14] — 2026-07-03

### Added

- **Who makes up the room: two new Insights charts.** Attendance → Insights
  now shows, for each weekly meeting (or each event, for groups without a
  weekly rhythm):
  - **Student leaders vs everyone else** — stacked per meeting, with the
    period-wide share and ratio (e.g. "40% student leaders (≈1:1.5)") in the
    card's subtitle.
  - **This campus vs visitors** — attendees whose home campus is the selected
    group vs those visiting from another campus, with the same share/ratio
    line. Only people with a known home campus are counted (org-side staff
    with no campus role are left out rather than guessed), and the chart is
    hidden on the org-wide (SOW) view where "this campus" has no meaning.
  A member's home campus and student-leader tag come from their profile when
  they're staff, or from their Campus/Role metadata otherwise. Charts appear
  after the next snapshot refresh (automatic within minutes of a roll-call
  change).

## [1.6.13] — 2026-07-03

### Fixed

- **Staff with a custom role now match the "Staff" filter.** The Members-tab
  Role filter's Staff bucket only recognised the built-in role names, but the
  role catalog is data-driven — a person whose only role this year was a
  custom one (added via Admin → Roles) matched no filter option at all and
  silently disappeared from every Role-filtered view. The Staff bucket now
  counts any non-campus role other than Member, which also corrects the
  General insights "Staff" trend that undercounted the same people.
- **A Year value that can't be resolved now counts as "Unselected".** A legacy
  or out-of-range stored Year (which already displays as blank) matched no
  Year filter option — not even "Unselected" — so those members vanished from
  every Year-filtered view.
- **Roll-call search now also matches roles and member details.** The event
  sign-in screen's search only looked at name and email, while the Members tab
  also searched the subtitle (roles, year, gender, …) — the two now match the
  same fields.
- **Audit search now matches the person acted on.** Searching the Attendance →
  Audit tab by email only matched the actor, not the subject of the action
  (e.g. who was signed in).
- **Sorting members by a select field now orders by its labels.** Sorting the
  Members tab by a select-type field (Campus, Role, custom fields) compared
  internal option ids, so the order looked arbitrary.

## [1.6.12] — 2026-07-03

### Fixed

- **Auto-approved requests now show up in your Reviewed history.** When you're
  both the requester and the approver for a step (e.g. an HOD submitting a
  request for their own department), that step auto-approves on submission.
  That auto-approval was logged under a separate audit action from a manual
  approve/decline, so the Requests → Review → Reviewed section silently
  skipped those requests even though the card correctly showed you as having
  cleared that step — they only ever appeared in the Finance-wide "All" list.
  Reviewed now includes auto-approved steps too.

## [1.6.11] — 2026-07-03

### Fixed

- **The footer button no longer shoots up when a modal's keyboard opens.** A
  pinned footer (e.g. "+ Make Request") sits on the screen *behind* a modal like
  the comments sheet. Keyboard events are app-wide, so when the modal's own text
  field opened the keyboard the occluded footer rode up with it — appearing to
  "shoot up" into view behind the dimmed backdrop. Footers now stay put whenever
  a modal is open and let the modal handle its own keyboard avoidance; they still
  follow the keyboard normally on their own screens (e.g. the event member
  search).
- **The comments sheet now hugs the keyboard instead of floating too high.** The
  sheet stays centred at rest, but once the keyboard opens it drops to sit just
  above it — a short thread no longer floats halfway up the screen with a large
  empty gap below it. This is handled independently of the footer button.
- **The comments thread stays pinned to the bottom.** The composer is now pinned
  below the scrolling thread (rather than scrolling away with it), so the text
  box stays in view no matter how long the conversation gets — even with the
  sheet at its maximum height and the keyboard up. Opening the thread, posting a
  comment, and the keyboard opening all keep the newest comment and the composer
  in view.
- **Adding an attendance member field no longer spams the audit trail.** Adding
  or deleting a field re-numbers every field's position, and the Campus/Role
  fields fold in the live universities/roles when read — both made an untouched
  field look edited or reordered, logging bogus "Updated Campus", "Updated Role"
  and "Reordered…" entries. The save now diffs against the same normalised values
  it writes and only logs a reorder when the fields' relative order actually
  changed, matching the Tags save path. (UAT report #1)
- **New Request surfaces the description error first.** With the amount left at
  its default, submitting a blank form flagged the amount error before the empty
  description — even though Description is the first field on screen. Validation
  now reports in on-screen order (Description → Amount → Department). (UAT report #2)
- **Notifications are grouped into Unread and Read sections.** The feed now shows
  "Unread" and "Read" section headers instead of one flat, inline-highlighted
  list, so what still needs attention is clear at a glance. (UAT report #3)
- **Nudge cooldown copy always shows minutes.** "You can nudge again in …" now
  reads consistently as `Xh Ym` (e.g. "24h 0m", "5h 23m") instead of dropping the
  minutes on a whole-hour boundary. (UAT report #4)

## [1.6.10] — 2026-07-03

### Changed

- **Create-event drafts reset when you switch attendance groups**, so a part-
  filled new event doesn't carry over to a different group.
- **New events default to today, 5–7pm.**
- **Tag colour selection moved into a sheet-style modal/dropdown.**
- **Disabled footer action buttons stay solid** instead of turning translucent.

## [1.6.9] — 2026-07-03

### Fixed

- **Receipt-waiting reviewed requests stay visible to the approver who cleared
  them**, instead of dropping out of the Review tab.
- **The Review tab's unread-comment badge now counts reviewed requests too.**

## [1.6.8] — 2026-07-03

### Changed

- **Improved reimbursement comment/thread deep-link reopen behaviour** and the
  sheet's keyboard/backdrop handling.
- **Attendance CSV export gained a selectable Notes column.**
- Aligned dependencies for Expo SDK 56 compatibility.

## [1.6.7] — 2026-07-02

### Fixed

- **Creating an event then cancelling froze the app.** Cancelling a part-filled
  new event popped a "Discard changes?" confirmation *inside* the create sheet —
  two stacked modals, which locks up the UI on iOS. New events no longer confirm
  on cancel: like the Make Request sheet, cancelling just closes and keeps the
  draft, so reopening resumes where you left off (the draft clears once the event
  is created). Editing an existing event still confirms before dropping unsaved
  changes, but now dismisses that dialog before the sheet so it can't lock up.

### Changed

- **Chaplaincy role labels drop the redundant department.** A chaplaincy role is
  scoped to a campus, so it now reads e.g. "Intern Chaplain → USYD" instead of
  "Intern Chaplain → Chaplaincy · USYD".
- **Admin → Users: Director at the top, no double stripe.** The Director now sits
  at the top of the list (like the Org Chart), and the redundant coloured bar
  around each group is removed — the cards inside already carry the group's
  accent stripe.

## [1.6.6] — 2026-07-02

### Added

- **Insights charts: y-axis labels, fullscreen expand, and bar tooltips.** All
  bar charts gained a left y-axis with five tick labels (max/75%/50%/25%/0), and
  x-axis year labels are shortened (e.g. `'24`) with smart label-skipping so they
  never overlap. Tap any chart card to open it fullscreen — on a portrait phone
  it rotates to landscape with taller bars; when the device is already landscape,
  or on web, it fills the screen in its natural orientation. In fullscreen, tap a
  bar for a tooltip pill showing its value(s) and year — single-value for trend
  charts, multi-value (with colour dots) for stacked leader/staff and per-campus
  charts.

### Changed

- **Campus legend labels use acronyms** (ACU, MACQ, UNSW, USYD, UTS, E2E) so they
  fit without truncation, in both the legend and the fullscreen tooltip.
- **Bar chart container height is now fixed** whether or not value labels are
  showing, so charts no longer jump as selection changes.
- **Insights defaults to the General tab** on first load.

## [1.6.5] — 2026-07-02

### Changed

- **Dropped the `attendanceMembers.staffEmail` column.** Members now link to a
  staff profile solely by `email` (the widen + `dropStaffEmail` backfill from
  1.6.3, now run everywhere). Removes the `staffEmail` field and its
  `by_staff_email` index, the migration-window dual-index fallback in
  `findMemberByEmail`, and the one-off `migrations.dropStaffEmail`. No behaviour
  change for linked people. One consequence: a pool member whose email is a SOW
  address with no staff profile for the viewed year now shows as a plain member
  in the Members list and roster, rather than being hidden — without the
  `staffEmail` flag there's nothing left to mark it as a "stale overlay" to hide.

## [1.6.4] — 2026-07-02

### Added

- **Insights → General: org-wide staff trends.** A new "General" segment (to the
  left of "Attendance") charts cross-cutting numbers, one point per staff year:
  total staff head-count, staff vs student leaders (the same split as the
  attendance member filter), and student leaders by campus. A bottom-right
  selector switches between "All years" (the trend charts) and a specific staff
  year, which shows that year's numbers as summary cards with the change vs the
  previous year.
- **SOW: average weekly attendance by campus.** When the org-wide (SOW) group is
  selected in the Attendance dashboard, a new chart shows each campus's average
  weekly-meeting turnout, drawn from each campus's own snapshot.

### Changed

- **No follow-up list on the org-wide (SOW) view.** The "Needs follow-up" list is
  a per-campus pastoral tool, so it's now hidden when SOW is selected.
- **Insights filters moved to a bottom-right selector.** The Attendance
  dashboard's time range and "Collaborative events" toggle now live in a
  bottom-right button that opens a selector sheet, rather than a top filter bar.

## [1.6.3] — 2026-07-02

### Fixed

- **Spinner date/time picker couldn't be tapped or dragged.** After 1.6.2
  switched to the `spinner` (wheel) display, the picker rendered inside its
  sheet but ignored all touches. The SwiftUI host that backs the wheel only
  sizes itself to its content vertically, so in the horizontally-centered
  container it collapsed to a 0-width frame — the wheel still *drew* (SwiftUI
  overflows its bounds) but every tap and drag landed outside the hittable
  frame. The picker now stretches to fill the sheet width, restoring
  interaction.
- **Attendance → Members over-counted and could show a person twice.** The
  Staff + Student Leader filters could total more than the staff-profile count.
  Two causes: a staff profile and its attendance-member row weren't always
  linked (the member side was normalised but the profile side wasn't), so the
  same person could appear as two rows; and the Student Leader bucket is
  deliberately dual-representable (a leader can be a staff profile OR an
  attendance-only member tagged with a campus role), which inflated the count
  when duplicates weren't collapsed. Members now link to staff profiles by a
  single canonical email (both SOW-domain spellings, case- and
  whitespace-insensitive), so a profile + member pair always counts as one.
- **Attendance export had two "Notes" columns.** The export always appends a
  reserved trailing "Notes" column for the per-sign-in note; a metadata field
  also named "Notes" produced a second, identically-named column. The builder
  now drops any metadata field whose name collides with the reserved "Notes"
  column (and the export picker no longer offers it), so the sign-in note is the
  single "Notes" column.
- **Tapping a "new comment" notification now opens the conversation.** Since
  1.6.2, comment notifications deep-linked only to the recipient's Requests tab
  (not the specific request or its thread), so following one left you hunting
  for the comment — and the focus-driven mark-read cleared the unread badge that
  would have pointed to it. Comment notifications again focus the request and
  open its comment thread (`&focus=…&thread=1`); approval/state notifications
  keep landing on the tab.
- **First Google sign-in bounced back to the login screen.** On a cold iOS
  `ASWebAuthenticationSession` the session can resolve as `dismiss`/`cancel`
  even though the OAuth redirect fired, with the OS delivering the
  `theshedmobile://…?code=` deep link a beat later. The recovery `Linking`
  listener existed but lost the race: the session's `dismiss` settled the
  redirect promise with `null` first, removing the listener before the deep
  link arrived, so the first attempt dropped the code and the user had to tap
  Sign in twice. The non-`code` session outcome now waits a short grace window
  for the deep link before giving up.

### Changed

- **Attendance members link to staff profiles by `email` only.** Groundwork for
  removing the redundant `staffEmail` column: a member is a staff overlay when
  its `email` matches a `staffProfiles.email`. New writes no longer set
  `staffEmail`, and a `migrations.dropStaffEmail` backfill moves any existing
  `staffEmail` into `email`. The column itself is retained (deprecated) this
  release and removed in a follow-up once the backfill has run.

## [1.6.2] — 2026-07-02

### Fixed

- **Export date picker overlapped other fields on native.** The iOS date picker
  used the inline calendar, whose month/year expander is a native overlay that
  spilled out of the picker sheet and over the surrounding fields. Both the date
  and time pickers now use the `spinner` (wheel) display on iOS and Android,
  which has no such overlay.

### Changed

- **Request notifications open the relevant top-bar tab directly.** Tapping a
  request notification (or its push/email link) now lands on the relevant
  Requests segment — "Mine" for the requester, "Review" for approvers/Finance —
  in general, instead of routing through a per-request focus or the legacy
  `/request/<id>` lookup screen. Opening the request still clears its
  notification (the link is now carried by `requestId` rather than the URL).

### Added

- **Stale-request reminders now appear in the in-app feed.** The daily reminder
  cron already emailed and pushed whoever a request was waiting on; those
  reminders now also create an in-app notification (with an unread bell badge),
  so they show up in the notifications feed like every other update.

## [1.6.1] — 2026-07-02

### Fixed

- **Startup crash on iOS release builds.** 1.6.0 could abort on launch
  (`SIGABRT` via `RCTFatal`) on TestFlight/App Store builds — an unhandled
  JavaScript error during startup, which Hermes turns into a hard crash in a
  release build (no red box, unlike dev). The Reanimated 4 worklets init path
  was compiling worklet source at runtime under Hermes. This adds an explicit
  `babel.config.js` (`babel-preset-expo`) so the `react-native-worklets` Babel
  plugin always runs and worklets are precompiled rather than evaluated at
  runtime — build 1.6.1 with a clean cache (`eas build --clear-cache`) so the
  transform is regenerated. The root `ErrorBoundary` is also hoisted to the
  outermost position so a render error in the gesture-handler/theme/auth
  providers shows the fallback screen instead of a blank screen or crash.
- **Blank screen when Convex config is missing.** If `EXPO_PUBLIC_CONVEX_URL`
  was unset in a build, the root layout rendered nothing — a blank screen
  indistinguishable from the startup crash above. It now shows a
  `Configuration error` diagnostic screen so a misconfigured build is obvious.

## [1.6.0] — 2026-07-01

### Added

- **Attendance → Insights: an attendance metrics dashboard for leaders.** A new
  tab (after Events) surfaces trends for the selected sub-group and time range so
  leaders can see how their events are tracking and who might need a caring
  check-in. It shows summary cards (average attendance and change vs the previous
  comparable period, events held, unique attendees, newcomers, follow-up count,
  and a weekly-meeting consistency score), lightweight native trend charts
  (attendance over time, rolling average, weekly-meeting trend, unique attendees
  by month, new vs returning, plus Campus/Role breakdowns), and a gentle "Needs
  follow-up" list with explainable, non-judgemental reasons ("Missed the last 3
  weekly meetings", "Newcomer: first attended 2 weeks ago, hasn't returned",
  "Returned after 8 weeks away"). Filters cover sub-group, trailing time range
  (1 / 2 / 4 / 8 / 12 weeks), and include/exclude collaborative events. The
  layout is responsive — a multi-column grid on a big screen, a comfortable
  single/two-column stack on mobile.
- **Auto-refreshed pre-computed insights.** Dashboard-ready snapshots are built
  per sub-group by two crons — a weekly full refresh (`attendance metrics
  recompute`, Thursdays) and a 15-minute dirty recompute (`attendance metrics
  dirty recompute`) that rebuilds only the sub-groups changed by a roll-call or
  event edit — so Insights reflects new attendance within minutes and the tab
  reads one small document instead of scanning history on the device. Each
  recompute runs as an action that pages its attendance reads in bounded chunks,
  keeping every transaction within Convex's limits even for the org-wide view.
  Snapshots refresh automatically, so the tab has no manual refresh control (a
  throttled `recomputeNow` recovery path exists server-side but isn't surfaced).
  The classification thresholds (regular / at-risk / lapsed / newcomer /
  re-engaged / declining) live in `shared/attendanceMetrics.ts` and are
  documented in `docs/attendance-metrics.md`.

## [1.5.3] — 2026-07-01

### Fixed

- **Tapping a request push notification now opens the request.** Request
  notifications deep-link to `/?tab=review&focus=<id>` (the live Requests
  screen), but the push-tap handler's allow-list still only accepted the old
  `/request/` and `/review` paths, so tapping a request push on a device routed
  nowhere (attendance pushes were unaffected). The allow-list now accepts the
  `/?tab=…&focus=…` home deep-link, and it lives in `shared/deepLinks.ts` with a
  test asserting every URL the backend emits is followable, so this can't
  silently regress again.
- **Admin → Roles no longer offers edit/delete on app-managed roles.** The
  system roles (Head of Department/Division, Director, Staff, Member) showed
  edit and trash buttons whose delete dialog claimed they could be removed; the
  backend rejected the mutation but only after a thrown `ConvexError` surfaced a
  dev-overlay. Those roles now show a lock icon instead of the buttons, and the
  shared `SYSTEM_ROLES`/`isSystemRole` helper in `shared/flow.ts` is the single
  source of truth for both the UI and the backend guards.
- **Admin → Approver Delegation removal now asks for confirmation.** Tapping the
  × removed a delegation immediately; it now shows a "Remove delegation?" confirm
  first, so an approver's stand-in can't be revoked by a stray tap.

- **Attendance → Audit no longer crashes when filtered or searched.** Applying
  an action-type/actor/event filter, or typing in the audit search, could crash
  the tab with a Convex "ran multiple paginated queries" error whenever the
  first page of rows didn't already contain enough matches. The feed now walks
  the log with convex-helpers' `paginator` (which allows the multi-page scan a
  sparse filter needs), the same approach the events list already uses.
- **Editing event tags no longer floods the audit trail.** Saving the Tags tab
  re-sends every tag, and each one was logged as an "Updated tag" regardless of
  whether it changed — so adding or editing a single tag wrote a spurious update
  row for every other tag. Tag saves now log only the tags that actually
  changed (matching how member-field saves already behave).
- **Staff no longer show a doubled role in roll-call and roster subtitles.** The
  subtitle for staff rows combined both the org-assignment role (e.g. "President")
  and the synced metadata "Role" field, producing "President · President · …".
  The metadata subtitle for staff rows now excludes the Role field, since the
  org-assignment already provides it.
- **Audit actor names now resolve correctly for legacy-domain emails.** The
  display-name lookup in the Audit feed tried only the literal email; a staff
  member who signed in with their `@sowaustralia.com` address but whose profile
  is registered under `@sow.org.au` would appear as a raw email instead of their
  name. The lookup now tries all known SOW domains before falling back to the
  directory.

## [1.5.2] — 2026-06-30

### Fixed

- **Admin → Departments no longer keeps a deleted division selected.** The
  "New department" form holds onto its chosen division across adds; if that
  division was later deleted it lingered as an invalid selection that the
  server would reject on submit. The picker now reconciles against the live
  division list (falling back to the placeholder), and "Add Department" is
  disabled until a name and a valid division are set.

## [1.5.1] — 2026-06-30

### Fixed

- **Test-environment emails now link to the test app, not production.** "Open in
  THE SHED" links in emails are now derived from each deployment's own
  `SITE_URL` (the same per-deployment web URL sign-in already uses), so emails
  from the dev/staging backend link to the dev web build instead of production.
  Previously a stale `APP_URL` override could send test emails to the live app.
- **Declining a request without a reason gives a clean prompt.** The decline
  sheet now checks for an empty reason before submitting, so you get the inline
  "Please give a reason…" message instead of also triggering a raw server-error
  notice.

## [1.5.0] — 2026-06-30

### Added

- **A "Test Environment" badge on test builds.** The staging app and dev web
  build now show a warning-coloured "Test Environment" chip in the top bar.
  Tapping it explains that this is the development environment — a separate test
  database where nothing affects the live app or real staff data.

### Changed

- **Email links from the test environment open the test app.** "Open in THE
  SHED" links in emails sent from the dev/staging backend now point at the dev
  web build (the-shed-web-dev.vercel.app) instead of production, so test
  notifications stay within the test environment.

## [1.4.0] — 2026-06-30

### Changed

- **The next staff year is admin-only on the org chart.** The org chart's year
  picker now offers the pre-provisioned next staff year only to admins (Data and
  IT / Human Resources), labelled "· Next year", so other staff don't see a
  half-built future chart. Everyone keeps the current and past years.

## [1.3.0] — 2026-06-30

### Added

- **Staff faces show on the org chart before they sign in.** The weekly Google
  Workspace sync now also caches each staff member's Google profile photo, so
  the org chart and profile pages show their picture even if they've never
  opened the app. A person's own uploaded photo still takes precedence.

### Changed

- **Directory sync now runs once a week instead of daily.** The automatic
  Google Workspace sync (people picker + profile photos) moved to a weekly
  schedule; admins can still sync on demand from the admin screen.

## [1.2.2] — 2026-06-29

### Fixed

- **You now get told when a member's details can't be opened.** On an event's
  roll-call, if opening someone's edit sheet failed (e.g. a dropped connection),
  nothing happened and no message appeared. It now shows an error toast instead
  of silently doing nothing.
- **Notification links only go to real screens.** Tapping a push notification
  now follows its link only when it points to a known in-app screen, ignoring
  anything unexpected or malformed.

### Changed

- **Roll-call rosters open a little faster.** An event's roster now loads its
  attendance history in parallel rather than one past event at a time, so the
  list appears sooner on events with a long history.
- **Internal maintainability cleanup.** Split the large shared UI component file
  into a `components/ui/` directory, extracted admin-screen hooks, unified the
  roll-call identity key into one shared case-insensitive helper, and added
  `@convex`/`@shared` import aliases. No change to behaviour.

## [1.2.1] — 2026-06-29

### Fixed

- **Tap to sign someone in or out.** On the roll-call roster, tapping a person's
  card to reveal the sign-in/out arrow and then tapping that arrow now signs them
  in or out — previously only a swipe committed the action and tapping the arrow
  did nothing.

### Changed

- **CSV "Year" is the year during the event.** The attendance CSV export's
  **Year** column now shows each person's year level *at the time of the event*
  (e.g. "3"), matching the member card and Edit Member sheet, instead of the
  staff year they commenced. Sixth-year-and-beyond is no longer capped at "6+" —
  it shows the actual number (6, 7, 8, …) of years since they started.
- **Year picker goes up to 15.** The member **Year** dropdown now offers years 1
  through 15 (was 1–5 and "6+"). Members past year 15 still display their real
  year everywhere; they just can't be re-picked from the dropdown.
- **Search bars stay put while you scroll.** On the Members tab, the Audit tab,
  and an event's attendance roster, the member/activity search bar now pins to
  the top as the list scrolls under it, so it's always reachable. On the Members
  and Audit tabs the filter controls pin alongside the search bar.
- **Top chrome gets out of the way while scrolling.** The home/profile top bar
  (and, on the attendance tabs, the logo/profile row above the tab bar) floats
  above the page and hides as you scroll down, reappearing as you scroll back
  toward the top, so the content beneath fills the freed space instead of
  leaving an empty strip. It now collapses in step with the scroll position, so
  its edge stays flush with the pinned search bar below it rather than sliding
  over it when you scroll back up mid-list. Switching attendance tabs keeps the
  bar's state — it reflects the tab you land on (collapsed if that tab is
  scrolled, shown if it's at the top) instead of popping back open every time.
- **Consistent footer height across the attendance tabs.** The Tags ("Save
  tags") and Metadata ("Save metadata") footers now sit at the same distance
  from the bottom as the "+ Make Request" button, matching the Events and
  Members footers.

## [1.2.0] — 2026-06-29

Attendance footer polish, plus a fix for the events list server error on
quieter groups.

### Changed

- **Staff show as staff in attendance chips.** Attendance group chips now label
  people with non-campus staff-profile roles as **STAFF** instead of falling back
  to **OTHER** when they do not have a campus, while campus leaders still show
  their campus chip.
- **Reversed sign-ins stay where they land.** Signing out (reversing) a roll-call
  attendee now pins them to the top of the "Not signed in" list and keeps them
  there after the change saves, instead of letting the row jump back down into
  its ranked position a moment later. (#141)
- **No grey flash on roll-call cards.** A member card is no longer greyed out
  while its sign-in/out is still saving — it stays full-strength but can't be
  swiped again until the change settles. (#141)
- **Event attendance footer rises with the keyboard.** On the event attendance
  page the action button now lifts at the same speed as the keyboard instead of
  trailing behind it, and sits a little higher so it clears the bottom edge on a
  screen with no tab bar. (#142)
- **Smoother footer on fast tab swipes.** Swiping quickly between the attendance
  tabs no longer leaves the footer button frozen mid-way and then snapping into
  place — it now slides with the page the whole way, including the release
  glide. (#143)
- **Steadier group picker.** Selecting a group under Events no longer nudges the
  logos — the selection ring is always reserved and just colours in. In dark
  mode the SOW ring now shows in its cream logo colour instead of an invisible
  black. (#146)
- **Reversed members are immediately actionable.** After signing a roll-call
  attendee back out, their card (pinned to the top of the not-signed-in list) can
  now be acted on right away, instead of staying locked until another sign-in
  refreshed the roster. The card also no longer replays a reappear animation once
  the change finishes saving — it settles in place. (#144)
- **Steadier attendance layout.** The not-signed-in list keeps its three-card
  height even when no one is signed in yet, the Members tab uses the same spacing
  between cards as the roll-call lists, and the footer action buttons sit a little
  higher off the bottom. (#145)
- **Only the active tab's footer follows the keyboard.** On the Attendance
  screen, just the action button for the tab you're on (e.g. "+ Create member"
  on Members) now lifts above the software keyboard; the other tabs' hidden
  footers stay put instead of riding up into view. The lift also keeps a
  consistent gap above the keyboard regardless of how high the footer normally
  rests, so every footer lines up at the same height once the keyboard is open —
  including the event roster's "Create …" button, which otherwise keeps its
  higher resting position. The footer also snaps between its keyboard-up and
  keyboard-down positions faster than the keyboard's own animation.
- **Consistent footer height for the create buttons.** The "+ Create event"
  (Events tab) and "+ Create member" (Members tab) footers now sit at the same
  distance from the bottom as the "+ Make Request" button, instead of resting a
  little higher.

### Fixed

- **Events list no longer errors for quieter groups.** Opening the Events tab for
  a group with no recent events (e.g. a campus whose latest events are far down
  the list) no longer triggers a `events:listBySubgroup` server error. The scan
  now pages through the events table via `convex-helpers`' `paginator`, which —
  unlike the built-in `.paginate()` — can be called more than once per query, so
  sparse groups are found without crashing.

## [1.1.1] — 2026-06-28

A wave of attendance/roll-call polish, request reminders, and sign-in and
date-picker fixes on top of the 1.1.0 attendance release.

### Added

- **Attendance audit trail.** Every attendance-area change is now recorded with
  who did it and when — events created/updated/deleted, members
  created/updated/deleted, tags and member fields changed, and every roll-call
  sign-in, record edit and sign-out. A new **Audit** tab in the Attendance area
  shows the activity newest-first, searchable and filterable by action type, the
  person who performed it, and the event it relates to. Log entries are immutable
  and snapshot names so they stay readable after the subject is deleted. (#117)
- **Reviewed history for approvers.** A new **Reviewed** section on the Review tab
  lists the requests you have already approved or declined, newest-first, and
  approving now asks you to confirm first. The "To Review" tab is now just
  "Review". (#136)
- **Request reminders & manual nudge.** Pending approvals now send tiered
  reminders that escalate over time, with a manual **nudge** (and a cooldown) to
  ping the current approver, plus notifications when an attendance event is
  created. (#119, #122)
- **Create a member straight from roll-call.** Searching roll-call for someone who
  isn't a member yet lets you create them and sign them in in one step. (#130)
- **Native date/time pickers.** Date and time selection on device now opens the
  native picker in its own sheet with a Done button, used by event create/edit and
  CSV export. (#137)
- **Weekly Meeting schedule pre-fill.** Creating a Weekly Meeting event now
  pre-fills its schedule. (#120)

### Changed

- **Staff-year rollover moved to October 1** (from September 1), to match SOW's
  calendar. (#108)
- **Make Request keeps your draft.** Closing the Make Request sheet no longer asks
  to discard — your in-progress request is preserved and only cleared after a
  successful submit. Type-to-confirm delete prompts now **bold** the exact text
  you need to type. (#139, #121)
- **Attendance roll-call interactions.** Row swipes are edge-anchored and work from
  anywhere on a card while vertical scrolling passes through; past-event sign-in is
  gated behind an explicit edit, sign-out is protected on past events, and locked
  attendees are greyed out. (#124, #125, #126, #127, #128, #129)
- **Attendance layout & motion.** Actions moved into the header row with a 3-card
  list and section count chips, tidier header meta, and a Reanimated SowSpinner
  with staggered group-picker animations. (#131, #133, #135)
- **Attendance metadata is global.** Member metadata and tag scopes now apply
  across staff years rather than per-year, with tag scope defaulting to all
  groups. (#111, #114, #115, #116)

### Fixed

- **iOS first sign-in.** Fixed a fresh-install case where the first Google sign-in
  could drop the OAuth redirect and leave you signed out until a second
  attempt. (#138)
- **Reminder schedule resets** when a request advances to the next step, so the
  next approver starts on a fresh schedule. (#123)
- **Web date/time pickers** no longer overflow on narrow screens. (#134)
- **Web vertical scroll** no longer gets stuck when it starts on a member
  card. (#132)
- **Sydney calendar year** correctness and hardened staff-profile provisioning for
  attendance. (#107, #112)

## [1.1.0] — 2026-06-25

Attendance (roll-call) arrives — a full attendance tab ported from
time-to-rollcall for tracking who turns up to events, per campus and staff year.

### Added

- **Attendance tab.** Run events under one or more sub-groups (each campus, plus
  org-wide "SOW"), sign people in from a live roster, and manage a shared member
  pool. Collaborative events span several campuses and appear under each; events
  load 20 at a time with a "Load more" button. (#103)
- **Member metadata & tags.** Per-staff-year fields (Year, Gender, Campus, Role)
  describe each member, with an admin editor; Year is captured as the university
  level. Events can be labelled with colour-coded category tags. (#103)
- **CSV export.** Export roll-call attendance for a date range to CSV, using
  native date pickers on device and a web date picker in the browser. (#105)
- **Duplicate-name guard.** Creating a member whose name already exists now shows
  an inline warning and a confirmation step that lists the existing member(s) and
  their metadata, so you can be sure before adding another person with that name.
  (#105)

### Changed

- **Members are one consolidated, year-less list.** A person is a single member
  reused across every staff year (same id), instead of a separate row per year.
  Staff members map to their staff profile for the event's year. (#103)
- **Role/Campus locked values stay synced.** The non-removable options for the
  Role and Campus fields are read live from that staff year's roles/universities
  tables, so removing one there unlocks it here instead of sticking around. (#106)

### Removed

- **Unused template assets.** Dropped Expo starter art and other unreferenced
  images to slim the bundle. (#104)

## [1.0.4] — 2026-06-22

Approvals flexibility (configurable Director cutoff, delegation), an in-app
notification center, admin "Not serving" management, and swipe/receipt fixes.

### Added

- **Configurable Director-approval threshold.** The amount at or above which a
  request also needs the Director's approval is now a per-year Finance setting,
  editable from Admin → Other, instead of a hardcoded $5,000. Only new requests
  are affected; existing requests keep the steps they were created with. (#92)
- **Approver delegation (out-of-office cover).** An admin can delegate one
  person's approver authority to a stand-in for a staff year — the delegate can
  approve, decline and pay everything the approver could. Self-review stays
  blocked. Managed from Admin → Other. (#93)
- **In-app notification center.** A bell in the top bar (with an unread badge)
  opens a Notifications feed of every flow event that pinged you — newest first;
  tap one to mark it read and jump to its target, or "Mark all read". (#94)
- **Admin "Not serving" list.** Admins can park people who are no longer assigned
  for a staff year in a "Not serving" pool in Admin → Users — deleting a profile
  moves them there automatically, and (re)assigning clears the mark. (#96)
- **Receipt scanning (OCR).** Attaching a receipt reads the amount, vendor and
  date off the image and pre-fills the recipient's amount when it's blank — you
  always review before submitting. A hint shows what was read and flags when it's
  over the approved amount. Off until a Gemini key is configured. (#99)

### Changed

- **Make Request button slides with the swipe.** The `+ Make Request` footer now
  slides down off-screen as the swipe leaves the "Mine" tab and back up on return,
  tracking the pager, instead of hard mounting/unmounting. (#89)
- **Notifications auto-mark read.** Opening a request (or its comment thread) now
  clears that request's notifications — you no longer have to tap them in the feed.
  Read notifications stay in the feed as history. (#95)

### Fixed

- **Sub tab bar:** the selected-tab underline no longer flickers to its end-state
  mid-swipe — it stays glued to the finger throughout the drag. (#89)
- **Bottom tab bar:** icons now sit centered on devices with a home indicator,
  instead of low with a gap above them. (#89)
- **Receipt form:** entering recipient/amount/file for one request, cancelling, and
  opening another request's receipt form no longer carries the first request's draft
  over. (#91)

## [1.0.3] — 2026-06-20

UI polish for request cards and the tab bars, plus web fixes. (#87)

### Added

- **Animated request cards.** Completed/finance cards now expand and collapse with
  a smooth height animation; tapping the card header (or the centered chevron)
  toggles it. (#87)
- **Loading placeholders.** While an expanded card loads approver names/times and
  receipt files, soft blurred placeholders show in their place instead of a gap. (#87)

### Changed

- **Bottom tab bar:** icons now give the same press feedback as the rest of the app,
  the bar is slimmer, and the admin (cog) tab matches the other tabs. (#87)
- **Sub tab bar (Mine / To Review):** the selected-tab underline slides — tracking the
  swipe on device, animating on tab change on web. (#87)
- **Full-width chrome:** the top bar and sub tab bar span the full screen width like the
  bottom bar. (#87)
- **Consistent control heights:** the bottom tab bar and the footer buttons (Make Request,
  info) now share a single 50px height, and the tab icons sit centered without a padding
  offset. (#90)

### Fixed

- Switching bottom tabs on the web app no longer triggers a full-page reload. (#87)
- Cancelling the "open in app" prompt on mobile web no longer leaves a blank,
  non-interactive screen. (#87)

## [1.0.2] — 2026-06-19

User-facing features and polish on top of the 1.0.1 release tooling.

### Added

- **Comments notify previous approvers.** A new comment now also pushes everyone
  who has already approved the request, not just whoever it currently waits on. (#83)
- **Unread badge on the "All" tab.** Finance sees a count of unread comments across
  the year's requests, and requests with unread discussion float to the top of the list. (#83)
- **Profile back button** in the top-left, plus a native interactive **swipe-back**
  gesture that reveals the previous screen as you drag. (#83, #84)
- **Tap-to-expand request cards.** Completed/finance cards expand when tapped anywhere,
  with a centered down-arrow hint, instead of a separate "View More" link. (#80)
- **Close (X) button** on list/option dialogs. (#83)
- **Open-in-app redirect:** visiting the web build on a phone bounces into the native
  app (path-preserving), falling back to the App Store / Play Store. (#79)

### Changed

- **Push notifications**
  - You no longer get a push for your own action (e.g. submitting your own request);
    the confirmation email is your acknowledgement. (#80)
  - Concise push titles (e.g. "Approval needed", "Request approved", "New comment");
    the full detail stays in the email. (#80)
  - People are referred to by **name** instead of raw email throughout notifications. (#80)
- **Consistent press feedback:** buttons (including all icon buttons and the top-bar
  home/profile buttons) shrink slightly while pressed and held. (#81)
- **Haptics** are now reserved for the bottom navigation bar only. (#81)
- **Detail screens** (profile, a person, a request) push as cards over the tabs via a
  native stack, giving them the swipe-back gesture. (#84)
- Tighter bottom tab-bar padding, and shorter list/option dialogs so there's always a
  clear area to tap out. (#81, #83)

### Fixed

- Sign-in (Google OAuth): the button stays in its loading state through the whole flow,
  and the redirect allowlist was corrected for the renamed web project. (#77, #78)

## [1.0.1] — 2026-06-19

Release & build tooling — the milestone that makes store submission repeatable.

### Added

- **EAS build + submit workflows** triggered from the Actions tab, with an
  **iOS / Android / both** platform choice on manual dispatch. (#75)
- Separate **manual staging and production** build → submit workflows. (#76)
- `autoIncrement` build numbers so each EAS build gets a fresh build number. (#75)

## [1.0.0] — 2026-06-11

Initial release of **The SHED** — a staff reimbursement app for SOW.

### Added

- Submit reimbursement requests and track them to completion.
- Multi-step approval chain: HOD → Budget Manager → Director → Finance Head, with
  steps auto-approved where the approver is the submitter.
- Receipt / invoice submission and Finance Head payment, including saved bank accounts.
- Per-staff-year **org chart and directory**, with admin management of departments,
  divisions, roles and the Budget Manager.
- **Clarification comment threads** on requests, with emoji reactions and unread tracking.
- **Push and email notifications** across the request lifecycle.
- Profiles with multi-year service history; CSV export of requests for Finance.
- Google sign-in, with light and dark themes.
