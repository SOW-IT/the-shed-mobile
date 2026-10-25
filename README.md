# THE SHED

Expo (React Native) + Convex app implementing the reimbursement request flow
from [REQUESTS_FLOW.md](https://github.com/SOW-IT/theshed/blob/main/REQUESTS_FLOW.md):

```
[Submit] → HOD → Budget Manager → (Director ≥ $5,000) → Finance Head → Receipt → Payment
```

The repo's domain vocabulary and the decisions behind it live in
[CONTEXT-MAP.md](CONTEXT-MAP.md) and [docs/adr/](docs/adr/). Read those before
changing anything seasonal, the October 1 staff-year rollover in particular
([ADR 0003](docs/adr/0003-october-1-staff-year-rollover.md)).

## What's implemented

- **Approval chain** enforced server-side in Convex: each step can only be
  actioned by its approver, in order, never on your own request. Steps the
  submitter would review themselves are auto-approved (HOD's own request,
  Budget Manager's own, Director's own ≥ $5k, Finance Head's own; Finance
  department requests have no HOD step).
- **Reminders**: a morning job (`convex/reminders.ts`) chases whatever has
  not moved, a day after the last movement, then three days later, then
  weekly: reimbursement requests (the next approver, the requester's receipt,
  Finance's payment), design requests (the Marketing Head's approval, the
  team's unfinished work) and event forms (the requester's side for forms not
  submitted, the requester's side and whoever submitted it for forms sent
  back, the reviewer for forms waiting). Each person gets
  one notification, push and email a morning listing everything waiting on
  them; nobody with nothing waiting hears anything, and weekends are not
  skipped. Reminder emails can be turned off on Profile. Home lists what is
  waiting on you (`convex/waitingOnMe.ts`); Review, the Marketing queue and
  To review say how long each item has waited and list the longest waiting
  first. Admin, Other shows step timing (`convex/stepTiming.ts`): the typical
  and longest wait at each step and who actioned it most, from the audit
  trail. Pushes carry the unread count as the app icon badge on iOS; Android
  syncs the count while the app is open, on launchers that show badges.
- **Per-year roles and departments** (`staffProfiles`, `departments`,
  `divisions`, keyed by year). The staff year rolls over on **October 1**.
  Admins prepare next year in advance; a 21:00 30 Sep prefill copies the
  incoming year into the one after it so next is never blank. In-flight
  requests **carry over** the rollover. They stay visible and are
  approved/paid by the approvers of the request's own year. Receipt files
  are kept for the current and previous staff years.
  Roles: Staff, Head of Department, **Head of Division** (belongs directly to
  a division rather than a department; no HOD above them), Director. Each
  year keeps its own **role titles**: 2019 and 2020 show Head of Department
  as "Department Overseer", and a future rename leaves earlier years as they
  were (`history:setRoleTitle`, ADR 0015).
- **Deadlock prevention**: submitting is rejected with a clear message while
  the year is missing an approver the request would need (department head,
  Budget Manager, Director for ≥ $5k, Finance head), and removing the Budget
  Manager's profile clears the assignment. Receipts/payments require
  positive amounts.
- **Admins** = the **Data and IT** department plus every department in the
  **Human Resources** division (People and Culture, Training and Development).
  Only they can assign roles/departments (for the current and next year),
  manage divisions/departments, and set the **Budget Manager** (who must be
  from the Finance department). Users can never change their own role.
- **Org structure** (seeded, editable per-year by admins): Governance (Data
  and IT, Finance, Compliance), Engagement (Marketing, Alumni), Human
  Resources (People and Culture, Training and Development), Operations
  (Events, Missions). A university, department, division or role that's still
  assigned to someone can't be removed until they're reassigned.
- **Pre-provisioning by email**: assign a role/department to someone who has
  never signed in; it links up on their first Google sign-in. People who
  were staff in an earlier year and are back in the Workspace directory
  show as **Previously staff** on Admin → Users. Assigning them reuses the
  old identity so they are not treated as a new person.
  Admin → Users marks staff who have **never signed in** to The SHED, with a
  count and a filter to list only them.
- **Local church**: staff pick their church in Profile from a shared list
  (`churches`) that any staff member can add to or fill in: each church has
  where it meets (tap to open the map) and its service times, shown on their
  profile to signed-in staff. Plain attendance members get one too, from the
  same list in Edit member. The **Churches** page (side menu) lists every
  church with the staff and members who go there.
  Each person shows their role, leaders first, and a map pins every church
  with an address (see [Church map](#church-map-optional)), each pin sized by
  how many people go there and ringed in the colour of their main campus. Two rows of
  filter chips narrow the page and the map: who (campus leaders, staff,
  members) and which campus (plus "no campus"). Nothing picked shows everyone;
  picking chips in a row shows only those, and each chip counts who it covers.
  Only people with a staff profile this year add or edit churches.
  `churches:remindToSetChurch` reminds this year's staff who haven't picked
  one (in-app notification and push). Members (no staff assignment this year)
  are only listed for staff and campus leaders, along with their emails and
  member ids: anyone else, signed in or not, sees each church with the names,
  roles, campuses and staff emails of the staff and campus leaders who go
  there. The church pickers say who will see the church before it's set.
- **Look**: one theme (`src/theme.ts`) in SOW's evergreen and cream, light and
  dark. Titles, headings and big numbers use Familjen Grotesk (bundled in
  `assets/fonts`, OFL, loaded in the root layout); everything else is the
  system font. Resting surfaces are flat with a hairline edge
  (`surfaceEdge`); only floating things (sheets, the footer button) get a
  shadow.
- **Last online**: someone else's profile shows when they last had The SHED
  open (staff viewers only), or that they haven't signed in yet. The app
  and website report it while open, at most every 5 minutes
  (`convex/presence.ts`); before that, sign-in session refreshes and the
  phone app's version check stand in.
- **Design requests** to the Marketing team, from the side menu (staff who
  aren't campus leaders). The questions are defined on the server
  (`convex/designRequestForm.ts`) and rendered by the app as sent; answers
  are checked against them server-side. Only the **Marketing Head** (or
  their delegate) approves or declines; anyone in Marketing marks approved
  requests complete. Requesters can edit or cancel until a request closes,
  and everyone on it can comment. Marketing staff get in-app/push
  notifications and the team's emails go to marketing@sow.org.au. Lists:
  Mine, the Marketing queue (open requests) and an All archive, each running
  back through earlier staff years as you scroll; the Marketing Head opens on the queue when something waits on them.
  A request's page shows its progress as Submitted, Approved (or Declined)
  and Complete, with who and when. Any request can be downloaded as a PDF (built on the device with
  pdf-lib). Old requests from the web app are copied in with
  `scripts/import-design-requests.mjs` (safe to re-run). Design requests
  aren't for events: those go through Event Requests.
- **Event requests**, from the side menu (staff who aren't campus leaders).
  The event itself (`convex/eventRequestForm.ts`), then three forms, each
  reviewed by its team: **Marketing** (design and promotion; the Marketing
  Head approves), **Risk** (risks rated with SOW's Risk Management Standard;
  the Compliance Head approves, or not required when there are no notable
  risks) and **Finance** (income and expense lines; the Finance Head
  approves, after the Director when expenses are over the event threshold set
  in Admin → Other, or not required at $0). The event is approved once all
  three are approved or not required. The requester's department fills the
  forms in; reviewers can ask for changes; each form has its own comment
  thread. The Events department, the three teams, the Director and admins can
  see every event. Team emails go to marketing@, compliance@ and
  finance@sow.org.au. Any event downloads as a PDF whose Risk and Finance
  pages follow the Governance Review Form.
- **Announcements** (`convex/announcements.ts`, rules in
  `shared/announcements.ts`), from the side menu for admins (the Human
  Resources division among them). A title and message go to **all leaders**
  (everyone with a staff profile this year) or to chosen campuses, divisions
  and departments, narrowed by role. The screen shows a lock-screen preview
  and how many people it reaches (and how many have the app), and asks for
  confirmation with that count. Each recipient gets it in the bell, a push if
  they have the app, and an email with a link into the app when "Also send as
  an email" is ticked (Resend batch, replies to the sender). It can go now or
  at a chosen time at least 5 minutes away; any admin can cancel a scheduled
  one. Rate limits per
  sender: 3 an hour, 10 a day, 10 waiting, and the same words twice within 10
  minutes is refused. Tapping it opens `/announcements/[id]`.
  Once it has gone out, admins see on that page how many of its recipients
  have seen it (opened it, or opened their notifications since it arrived)
  and can list who hasn't.
- **Mentoring** (`convex/mentoring.ts`, rules in `shared/mentoring.ts`),
  from the side menu for admins (the Human Resources division among them) and
  for anyone mentoring someone this year. Admins pair each **Campus leader**
  with one mentor a year: a leader with a profile that year who isn't a
  Campus leader, or an **external mentor** from a reusable list (name, email,
  phone, notes). Pairings are per staff year, don't carry over, and only the
  current and next year can change; the list flags a mentee or leader mentor
  who no longer qualifies. A leader mentor sees just their own current-year
  mentees. Pairings from the old app were copied in once, in 2.10.1. A list
  of pairings for any year can be added from the command line
  (`mentoring:setPairings`) under the same rules.
- **Side menu**: Reimbursements, Event Requests and Design Requests sit in a
  collapsible **Requests** group that opens itself on those pages, shows
  their combined count while closed, and remembers being open or closed on
  the device.
- **Editable Home tab**: Home, Resources, Connect and Partner are typed
  blocks served by `homeContent.view` (one `homeTabs` row per edited tab,
  else the built-in content in `shared/homeContent.ts`). Admins, anyone in
  the **Marketing** department and the **Engagement** division head edit
  them in the app via the Edit button.
- **Google sign-in** via Convex Auth: "Sign in with your SOW account" is the
  `google` provider, for `sow.org.au` staff accounts only (`hd` hint +
  server-side domain check). Personal Google accounts can't sign in (the
  `googlePersonal` provider was removed in 2.4.7); **guests** (accounts with
  no staff profile) can sign in with Apple, which is offered on iOS only.
  Name/email sync from the Google profile on each sign-in.
- **Delete account** (`convex/account.ts`): from your own Profile, after
  typing your name. A SOW account loses its sign-in, sessions, push tokens,
  uploaded photo and church, and keeps its staff profiles and directory data
  (signing in again relinks them). An Apple account is deleted entirely and
  its Apple tokens are revoked (`convex/appleRevoke.ts`, needs
  `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY`).
- **Email notifications** via Resend: submitter confirmation, "needs your
  approval" to the next approver at every step, declines (with reason),
  receipt-ready-to-pay to the Finance Head, paid confirmation, and a Budget
  Manager alert when the paid amount differs from the requested amount.
- **Reimbursements** (opened from the side menu, at `/`): Mine (submit /
  cancel / receipt), Review (approve / decline / pay, shown to approvers and
  to anyone who has reviewed a request before), All (Finance staff), Bank.
  Each tab runs back through earlier staff years as you scroll, newest first
  under a heading per year: on Mine your own requests, on Review everything
  you approved or declined, on All (under Completed) every completed request;
  a request sits under the year it was made in. The New
  Request sheet shows who the request will go to as you type
  (`requests.approvalPreview`), including the Director from the threshold and
  any step your own role skips; image receipts show a thumbnail before you
  submit. An approver with requests waiting and nothing of their own to act on
  opens on Review, and a request link opens the tab that holds it (Mine,
  Review, or All for Finance staff). Each request's clock button opens its
  timeline: every step from submitted to paid with who did it and when, the
  gaps between steps, what it is waiting on now and how many reminders have
  gone out for that wait, and how long submitted-to-paid took.
  A request, its timeline and its comments are visible only to the
  requester, Finance staff, the approvers on its chain and their delegates
  (in the request's staff year or the current one), and anyone who has
  already acted on it (`canSeeRequest` in `convex/requests.ts`).
- **Notifications** (the bell): everything sent to you, unread first, loading
  older ones as you scroll (`notifications.feed`, 30 a page). Opening the
  screen marks everything read.
- **Navigation**: bottom tabs Home, Attendance (staff), Insights and Org
  Chart. On phones the top-left avatar, or a swipe from the left edge, opens
  a side menu with Profile, Reimbursements (staff other than campus leaders),
  Admin (admins and the Finance Head) and Sign out. Screens 700pt and wider
  (iPad, desktop web) swap the top bar, bottom tabs and drawer for one
  permanent sidebar holding all of them (`src/components/nav/`,
  rules in `src/lib/navMenu.ts`).

### Attendance

A second feature area (ported from *time-to-rollcall*) for running roll-call at
SOW events. SOW is the org; its **sub-groups** are the campuses (per-year
`universities`) plus org-wide "SOW", all sharing one member pool.

- **Events & roll-call**: create events tagged with one or more sub-groups
  (multi-sub-group = a *collaborative* event that appears under each), then sign
  people in/out. Everyone signed in is a **member**; staff are members with
  that year's staff profile on top.
  An event can run over several days (a camp or conference); each person
  signs in once for the whole event.
  Post-event sign-ins can be reversed; sign-ins made during an event can't,
  except within 10 minutes of being made.
  "Not signed in" lists the people most likely to come first: a score from
  the last 180 days of sign-ins (weight halving every 45 days, most for the
  same campus's weeklies) plus a campus bonus, stored per event in
  `rollCallOrders` (ADR 0014).
- **Tags & metadata**: event tags in two lists, **Weeklies** (labels like BAM
  or PPN) and **Other events**, plus the automatic **Weeklies** tag on every
  weekly (a weekly is defined by its term and week, which drive the
  weekly-meeting analytics), and configurable member metadata fields (Year,
  Gender, Campus, Role, Other Information, …). **Role is worked out**, not
  typed: a staff person's role from their profile, otherwise Regular,
  Irregular, Newcomer or Visitor from last night's Insights build, else
  Member. Leaders can still set Visitor or Alumni by hand. The edit sheet
  shows it locked, with an info button that explains the rules
  (`shared/memberRole.ts`). Notes about one event are kept on that sign-in
  ("Notes for this event", exported as Event notes).
- **Merge duplicates**: fold two records for one person into one, moving every
  attendance record across (shared events collapse to one record). Someone who
  is staff this year can't be merged away, and two people who were both staff
  in the same year can't merge. Typing a staff email onto a member points to
  merging instead of relabelling the record.
  **Admin → Merges** (current and next staff year, shown only while there are
  any) lists staff who look like a member not yet linked to anyone's profile
  (a similar name on the same campus, typically new leaders who signed in as
  members before joining staff) with Merge or "Not the same" for each. Merging
  a staff person who has no member record yet just links their profile to the
  member.
  Only admins (Data and IT, HR, the Governance head, the Director) can delete
  a member; the sheet
  lists every event whose attendance goes with them and points to merging.
- **Staff and leavers**: every person, staff included, has one member record
  for good, and each year's staff profile points at it. Staff assigned for the
  current year get their record when they're assigned; next year's staff get
  theirs on October 1 unless they're already linked. Leaving staff moves
  nothing: from October 1 they read as the plain member underneath, with an
  empty Campus filled from their last role (their Role is worked out; leaders
  set Alumni when someone graduates). A member's own email
  can't be an SOW address or anyone's staff email.
  Member names are capitalised as they're typed.
- **Audit log**: an immutable trail of every attendance-area action (event /
  member / tag / metadata edits, merges and deletes, and each
  sign-in/edit/sign-out), read by the Attendance → Audit tab.
- **CSV export**: export attendance.
- **Insights** (a dedicated bottom tab): for a campus, its **weekly meetings**
  by term (T1–T3 / Sem 1–2) or calendar year: cards against the term before
  (a year against last year), a
  follow-up list (people who were coming but stopped, newcomers who haven't
  come back) and a visitors list, charts, and everyone's attendance % and
  category (Regular, Irregular, Newcomer, Visitor, Leader, Staff/alumni/guests)
  with filters, sorting and search; tapping someone opens their attendance
  page. For SOW, a Campuses / TWIG / PPN switcher: each campus's weekly
  average with past week / month / year ranges, then TWIG (campus leaders
  only) and PPN (everyone, as cards and charts) by staff year. Layout, charts,
  wording and the SOW tabs come from the backend (`weeklyInsights.view`,
  `generalMetrics.view`, `attendanceMetrics.view`, `sowInsights.tabs`,
  `sowInsights.view`), so
  they change with a Convex deploy rather than an app release. A nightly build
  redoes only what changed since the night before, so roll-call changes show
  the next morning (TWIG and PPN are live). See
  [docs/weekly-insights.md](docs/weekly-insights.md),
  [docs/sow-insights.md](docs/sow-insights.md) and
  [docs/attendance-metrics.md](docs/attendance-metrics.md).
- **Self check-in**: on an event, the QR button turns on a check-in page
  (`/checkin/<token>`, `convex/checkIn.ts`) and shows its code. People scan
  it and type their full name, and can add their university and year; the
  page never shows the member list, and the phone remembers the details
  (`src/lib/checkInDevice.ts`). A first check-in waits on the event until a
  leader matches it: matched people come first with "Sign in all", the rest
  show same and similar names (`shared/checkInMatch.ts`), Find member and New
  member. After that, the same phone signs that person straight in. A leader
  who opens the link in the app is signed in at once. Sign-ins keep the time
  people checked in. The page works from two hours before the event until ten
  minutes after it ends, and turning it off (after a confirm) kills the link.
  The app takes check-in links (ADR 0012); the web never bounces them.
- **Over-the-air updates**: phone builds from 2.9.19 carry `expo-updates`
  with a fingerprint runtime, so a JavaScript-only change reaches them after
  a merge without a store build. A banner offers a restart once an update has
  downloaded.
- **App errors**: a screen that crashes, or an unhandled error, is reported
  (`convex/appErrors.ts`) with the route, platform, version and who hit it,
  grouped by fingerprint. Admins see the last seven days on Admin, Other and
  clear them there.
- **Update prompt**: phones ask for the store version when it's older than the
  server's policy (`appUpdatePolicy`, per platform). Below `recommended`, a
  banner that can be dismissed; below `minimum`, a full screen with only the
  store button. Nothing is asked until a policy is set:
  `npx convex run --prod appInstalls:setUpdatePolicy '{"platform": "ios", "minimum": "2.9.25", "recommended": "2.10.0"}'`
  (`minimum`, and an optional `message` to replace the default text; `null`
  clears one). Staging builds and the web are never asked.

## Getting started

```bash
npm install
npx convex dev        # terminal 1: backend
npm run web           # terminal 2 (or `npm start` for iOS/Android)
```

Bootstrap data (departments, divisions, your admin profile):

```bash
npx convex run admin:seed '{"adminEmail":"you@sow.org.au"}'
```

## One-time auth setup

JWT keys, `SITE_URL`, and Resend keys are already set on the dev deployment.
To enable Google sign-in you still need an OAuth client in the
[Google Cloud console](https://console.cloud.google.com/apis/credentials)
(type *Web application*, authorized redirect URI
`https://<your-deployment>.convex.site/api/auth/callback/google`), then:

```bash
npx convex env set AUTH_GOOGLE_ID <client-id>
npx convex env set AUTH_GOOGLE_SECRET <client-secret>
# optional, defaults to sow.org.au:
npx convex env set AUTH_ALLOWED_DOMAIN sow.org.au
```

For a fresh deployment, regenerate the JWT keys with
`node scripts/generate-auth-keys.mjs` and set `JWT_PRIVATE_KEY` / `JWKS` /
`SITE_URL` (see the script), plus `RESEND_API_KEY` / `RESEND_FROM_EMAIL`.

### Workspace directory sync (optional)

Syncs the sow.org.au member list weekly (Mondays 21:00 UTC, and via the
admin screen's *Sync directory now* button) so admins assign people from a
picker, and copies each staff member's Workspace photo. Setup:

1. In the Google Cloud console, create a **service account** (no roles
   needed), create a JSON key, and enable the **Admin SDK API**.
2. In the Workspace Admin console → *Security → API controls → Domain-wide
   delegation*, add the service account's client ID with scope
   `https://www.googleapis.com/auth/admin.directory.user.readonly`.
3. Set the deployment env vars:

```bash
npx convex env set GOOGLE_SA_CLIENT_EMAIL <sa>@<project>.iam.gserviceaccount.com
npx convex env set GOOGLE_SA_PRIVATE_KEY -- "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
npx convex env set GOOGLE_ADMIN_IMPERSONATE <a-workspace-admin>@sow.org.au
```

Until configured, the weekly sync no-ops and the admin screen shows
"Never synced." Syncing fills the picker and staff photos. Assigning
roles stays an explicit admin action.

A person's photo is, in order: the one they uploaded in The SHED, their
Workspace directory photo, the picture Google sent at their last sign-in,
then their initials. The app resizes a picked photo to 512 px before it
uploads it (a JPEG, or a PNG when the picked file is one, so see-through
areas stay see-through until the server puts them on white). An uploaded photo
over 64 KB is shrunk on the server to a 256 px JPEG a moment after upload
(`avatars:shrinkAll` does older ones), skipping any too big to decode in an
action's memory: JPEGs over 16 million colour samples (about 10 MP for a
typical phone photo, 5 MP for a full-colour one) and PNGs over 10 MP. Phones
keep each photo in the app's cache folder after the first download,
showing the web copy until it lands.
The directory photo outranks the sign-in picture
because Google sends a letter placeholder to anyone who had no photo when
they signed in, and that placeholder only changes when they sign in again. A directory email that matches a previous staff year
is listed under Previously staff rather than as a brand-new person.

### Church map (optional)

The Churches page draws a map of every church with an address. iPhone always
uses Apple Maps, which needs no key: since 2.10.0 the app leaves the Google
Maps SDK for iOS out to keep the download small
([ADR 0013](docs/adr/0013-apple-maps-on-iphone.md)). On the web and Android
the map is Google Maps and is hidden without a key. Create keys in the Google
Cloud console, each restricted to its one API:

| Key | Where it goes | API | Restrict to |
| --- | --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | `npx convex env set` | Geocoding API | (server key) |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Vercel env (web build) | Maps JavaScript API | the web origins |
| `GOOGLE_MAPS_ANDROID_API_KEY` | EAS env (app build) | Maps SDK for Android | package + SHA-1 |

Dev and prod have separate keys: the DEVELOPMENT - The SHED project
(`sowwebsite-50dec`) for the dev deployment, dev web, local runs and
preview/staging builds, and PRODUCTION - The SHED (`theshedsow`) for prod.
In EAS the `development` and `preview` environments hold the dev keys and
`production` the prod ones; the `staging` build profile uses `preview`.

`EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID` (web, optional) replaces Google's demo map
ID. Addresses are looked up when a church is added or moved and again daily
for any older than 25 days (Google lets coordinates be kept for 30). To fill
them in straight after setting the key:

```bash
npx convex run churches:locateAll '{}'
```

## CI/CD

Eight workflows, in `.github/workflows/`:

| Workflow | File | Trigger |
| --- | --- | --- |
| Lint, Typecheck & Test | `ci.yml` | every PR and push to `main` (tests run with coverage thresholds). Also runs `expo install --check` with `EXPO_OFFLINE=1`, so an Expo package that drifts from the versions the installed `expo` lists fails here rather than in an iOS release build. Offline, the check reads that list from the locked `expo` package instead of Expo's server, so a new Expo patch release can't turn `main` red on its own; patches move with a deliberate `npx expo install --fix`. A second job, **Web sweep**, starts a throwaway local Convex backend, seeds it (`scripts/sweep-backend.sh`, `scripts/sweep-seed.mjs`), serves the web app and opens every screen signed out and as a leader, a Head and an admin (`scripts/sweep.mjs`, Playwright). It fails on a crash screen or a page error and keeps the screenshots as a run artifact |
| Convex Deploy | `convex-deploy.yml` | merges to `main` → deploys the **prod** backend. `workflow_dispatch` deploys prod **only when run from `main`**. From any other ref it deploys a *preview* named after the branch (`--preview-name`), not prod |
| Deploy web (dev) | `deploy-web-dev.yml` | merges to `main` → publishes the dev web app to `the-shed-web-dev` |
| Backup Convex to GCS | `convex-backup.yml` | weekly, Sundays at 15:17 UTC (Monday 01:17 AEST / 02:17 AEDT), and by hand. Weekly because each export reads the whole prod database, about 9.5 MB of database bandwidth a run. Database export as a zip, then Convex file storage (receipts, event attachments, avatars) copied incrementally to `storage/files/<sha256>` in the same bucket: each file is downloaded once, on the first run after it exists, and `storage/manifest.json` records what is there and which files Convex has since deleted. After the zip lands, business tables replace the previous snapshot in dataset `convex_production`, then eligible typed views and Looker/Sheets report views replace `convex_warehouse`. A report view is rebuilt only if every table it needs was in that zip; otherwise it is dropped. The BigQuery job then checks the warehouse against the previous run (`scripts/warehouse-checks.mjs`): a core table missing or empty, a table that shrank by more than a fifth, or a report view missing posts to Google Chat and fails the step |
| EAS Update | `eas-update.yml` | after each successful Convex Deploy of `main` (and by hand) → publishes the JavaScript bundle over the air to the `production` and `staging` channels. Only builds whose native fingerprint matches receive it, so a change to native code waits for the next store build |
| Convex usage check | `convex-usage.yml` | Sundays 22:00 UTC, Monday morning in Sydney (and by hand) → reads this billing period's usage and posts to Google Chat when database bandwidth or file storage passes 70% of the plan, or bandwidth is on track to exceed it (`scripts/convex-usage-alert.mjs`) |
| EAS Staging | `eas-staging.yml` | **manual only**. Builds and submits the staging app |
| EAS Production | `eas-production.yml` | **manual only**. Builds and submits the production app, then posts the result (version, build numbers, commit, links) to the Data and IT space in Google Chat (`.github/scripts/eas-production-chat.sh`) |

Both EAS workflows take a **platform** input (`both` / `ios` / `android`,
default `both`) and are never triggered by a PR or a merge.

The **prod web app** is published by Vercel's own git integration on merges to
`main`, so it has no workflow of its own. The dev web app does need one,
because the Convex URL is inlined at build time. A separate backend means a
separate build, not a re-pointed domain.

Repository secrets these need: `CONVEX_DEPLOY_KEY` (prod backend deploys and
the GCS backup), `VERCEL_TOKEN` + `VERCEL_PROJECT_ID_DEV` +
`GOOGLE_MAPS_WEB_KEY_DEV` (dev web), `EXPO_TOKEN` (EAS Update and both EAS
builds), `CONVEX_ACCESS_TOKEN` (the usage check) and `GOOGLE_CHAT_WEBHOOK_URL`
(the Data and IT space's incoming webhook, for EAS Production's Chat post).
Only **Deploy web (dev)** and the Chat post degrade gracefully when their
secrets are missing. They skip. Convex Deploy, the backup, EAS Update, the
usage check and both EAS builds have no such guard and will **fail** the run,
which is the right behaviour for a deploy but worth knowing before you add a
workflow to a fork. The backup also
needs the repository *variables*
`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_BACKUP_SERVICE_ACCOUNT` and
`GCS_BACKUP_BUCKET`. The BigQuery load uses the same identity and defaults to
dataset `convex_production` in `theshedsow` (`australia-southeast1`). Override
with repository variables `BQ_DATASET`, `BQ_WAREHOUSE_DATASET`, `BQ_LOCATION`
and `GCP_PROJECT` if needed. After the JSON snapshot publishes, typed views
are created in `convex_warehouse` (override with `BQ_WAREHOUSE_DATASET`),
then flat Looker/Sheets views (`insights_*`, `staff_assignments`,
`attendance_signins`, `requests_status`, `request_recipients`). Connect
Looker Studio or Connected Sheets to that dataset; pick those views, not the
JSON `document` tables. `request_recipients` has BSB and account numbers.
The BigQuery job reads the zip, so the backup service account needs
`storage.objects.get` on the backup bucket, `roles/bigquery.user` on the
project (jobs and `datasets.create` for staging and, if missing, the
warehouse dataset), and `roles/bigquery.dataEditor` on `convex_production`
**and** on the warehouse dataset (`convex_warehouse`, or whatever
`BQ_WAREHOUSE_DATASET` is set to). A dataset the job itself creates is owned
by the backup SA; a pre-created warehouse dataset still needs that
`dataEditor` grant. Without those grants the zip still uploads and the
BigQuery job fails on its own. A local zip converts
with `node scripts/convex-export-to-bigquery.mjs --zip snapshot.zip --out bq-ndjson`.
Manual fallbacks remain `npx convex deploy -y` and `npm run deploy:web`.

### Releasing to TestFlight and the App Store

Builds and store submissions are **manual**, driven from GitHub Actions and run
from `main`. Staging and production are **separate workflows**, not one workflow
with a profile input:

- *Actions → EAS Staging → Run workflow*
- *Actions → EAS Production → Run workflow*

Each takes a single **platform** input: `both` (default), `ios` or `android`.
It builds then submits in one run (EAS performs the submit server-side once the
build finishes).

There are two app variants (defined in `app.config.js` + `eas.json`) that
install side-by-side, so testers can keep production while testing staging:

| Profile      | App name           | Icon                        | Bundle id / package          | Convex backend                  |
| ------------ | ------------------ | --------------------------- | ---------------------------- | ------------------------------- |
| `staging`    | The SHED Staging   | dark (cream logo on green)  | `au.org.sow.theshed.staging` | dev (`successful-lynx-56`)      |
| `production` | The SHED           | light (green logo on cream) | `au.org.sow.theshed`         | prod (`giant-bloodhound-191`)   |

**Ship staging first, then production:**

1. **Staging**: run **EAS Staging**. It builds and, when done, submits to the
   *The SHED Staging* app's TestFlight.
2. **Test** on TestFlight against the dev backend.
3. **Production**: run **EAS Production**. It builds and submits to
   *The SHED*'s TestFlight. To put it on the public App
   Store, open App Store Connect, attach the build to an App Store version,
   complete the metadata, and **Submit for Review** (TestFlight is just where
   uploaded builds live; promotion to the App Store is a separate manual step
   there).

> **First staging release only**, otherwise Google sign-in fails in the staging
> app: run `npx eas credentials` for `au.org.sow.theshed.staging`; add the
> staging Convex callback
> `https://successful-lynx-56.ap-southeast-2.convex.site/api/auth/callback/google` to the
> Google OAuth web client; and set the Google auth env vars on the dev/staging
> Convex deployment (`npx convex env set ...`).

## Production backend + web hosting

Both deployments run in **Sydney** (`aws-ap-southeast-2`); their URLs carry the
region, e.g. `https://giant-bloodhound-191.ap-southeast-2.convex.cloud`. They
replaced the US deployments `industrious-robin-425` (dev) and
`outgoing-stoat-395` (prod) in 2.0.0. A deployment's region can't change, so
moving one means a new deployment plus a data export/import; usage outside the
US is billed at 1.3x.

Convex has two deployments: **dev** (`successful-lynx-56`, used by local
dev and the `convex dev` watcher) and **prod** (`giant-bloodhound-191`). Push
backend code to prod with:

```bash
npx convex deploy -y
```

Prod env vars are managed with `npx convex env set --prod ...` (JWT keys,
SITE_URL/APP_URL, Resend are set; Google OAuth + directory-sync vars need
`--prod` copies when configured). Re-seed prod with the real admin email via
`npx convex run --prod admin:seed '{"adminEmail":"you@sow.org.au"}'`.
`NIGHTLY_JOBS_PAUSED=true` (for the shared dev deployment) makes the nightly
Insights, attendance metrics and church map crons do nothing. The paused
attendance-metrics run also skips what it schedules: the campus weekly chart,
staff trends, the roll call's member order (roster history) and Admin's
member-pair suggestions. Run them by hand with
`npx convex run attendanceMetrics:recomputeAll` or
`npx convex run weeklyInsights:rebuildAll` when you need fresh numbers.

The same app runs in the browser via react-native-web, hosted at
**<https://theshed.sow.org.au>** (Vercel project `the-shed-web`, served on the
custom domain `theshed.sow.org.au` in the `sow.org.au` DNS zone),
**pointed at the prod deployment**. Mobile production builds (eas.json) use
prod too; local dev, the staging and preview app builds and the dev web
app use the dev deployment. Redeploy the site with:

```bash
npm run deploy:web
```

(`web/vercel.json` provides clean URLs + an SPA fallback for the dynamic
routes.) When Google sign-in is configured, also set the deployment's
`SITE_URL` to the hosted URL so web OAuth redirects return there:

```bash
npx convex env set SITE_URL https://theshed.sow.org.au
```

A parallel **dev web** runs at **<https://the-shed-web-dev.vercel.app>** (a
separate Vercel project `the-shed-web-dev`), built against the **dev** Convex
deployment (`successful-lynx-56`). Because the Convex URL is inlined at
build time, the dev site is its own build/project rather than a re-pointed
domain. It auto-deploys on every merge to `main` via the
`Deploy web (dev)` GitHub Action, which needs two repo secrets: `VERCEL_TOKEN`
and `VERCEL_PROJECT_ID_DEV` (the `the-shed-web-dev` project id). You can also
build/publish it on demand with:

```bash
VERCEL_PROJECT_ID_DEV=<dev-project-id> VERCEL_TOKEN=<token> npm run deploy:web:dev
```

### Email links and universal links

Every notification email ends with an "Open in THE SHED" link to the hosted
web app (`APP_URL` env var, e.g. `/request/<id>`), so emails work for
everyone immediately. To make those same HTTPS links open the **native app**
when installed (iOS Universal Links / Android App Links, already configured
in app.json via `associatedDomains` and `intentFilters`), Vercel's build
(root `vercel.json`) copies `web/.well-known/apple-app-site-association` and
`web/.well-known/assetlinks.json` into the site. If Play's app-signing key or
the EAS Android keystore changes, add its SHA-256 fingerprint to
`assetlinks.json` (see LAUNCH.md).

## Tests

```bash
npm test
```

The `convex-test` + shared-logic suite (run in CI with coverage thresholds)
covers the reimbursement flow (the auto-approval matrix, approval ordering and
authorization, decline behaviour, admin permissions, the Budget
Manager-must-be-Finance rule, and the October 1 rollover) as well as the
Attendance area: roll-call, events, members, tags, metadata, audit, and
the Insights metrics precompute.

## Not yet implemented

- The whole-**staff-year** range for the SOW Insights view: supported by the
  shared logic (`STAFF_YEAR_RANGE`) but not precomputed or offered (campuses
  get whole calendar years from their weeklies instead).
