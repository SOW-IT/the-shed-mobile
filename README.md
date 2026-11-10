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

## What's in it

Each area's rules and vocabulary are in [CONTEXT-MAP.md](CONTEXT-MAP.md) and
`docs/context/`; what changed and when is in [CHANGELOG.md](CHANGELOG.md).

- **Reimbursements** (`convex/requests.ts`, rules in `shared/flow.ts`): submit,
  approve in order (HOD, Budget Manager, Director for $5,000 or more, Finance
  Head), receipt, payment. Steps the submitter would review themselves are
  auto-approved, and submitting is refused while the year is missing an
  approver the request needs. Finance settings at `/finance-settings`.
- **Design requests** and **event requests** (`convex/designRequests.ts`,
  `convex/eventRequests.ts`): asks of Marketing, and an event with its
  Marketing, Risk and Finance forms, each with comments and a timeline.
- **Grievances** (`convex/grievances.ts`): confidential, seen only by the
  submitter and the People and Culture and Compliance teams.
- **Praise List** (`convex/musicRequests.ts`, `/music`): songs requested and
  approved or declined by a Praise Manager, with Spotify search.
- **Attendance** (`convex/attendance*.ts`, rules in `shared/rollcall.ts`): events,
  roll-call, self check-in by QR, members, tags and metadata, merging
  duplicates, an audit log and CSV export. **Insights** builds per-campus
  weekly metrics from it (`docs/weekly-insights.md`,
  `docs/attendance-metrics.md`, `docs/sow-insights.md`).
- **Calendar** (`convex/calendar.ts`), mirrored to a shared Google Calendar.
- **Org**: per-year roles, departments and divisions (`staffProfiles`); the
  staff year rolls over on October 1 (ADR 0003). Admins are the Director, the
  always-admin department's team and anyone admins choose (ADR 0018), and can
  act as another role to see the app as it does (ADR 0017). Org chart,
  Teams, Mentoring, Announcements, Churches and an editable Home tab.
- **Reminders** (`convex/reminders.ts`): one morning digest per person of
  everything waiting on them, by push and email.
- **Accounts**: Google and Apple sign-in through Convex Auth, delete account
  from Profile, push notifications and the in-app bell.
- **Releases**: over-the-air updates (`expo-updates`), an update prompt driven
  by `appUpdatePolicy`, and app errors reported to the `appErrors` table.

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

### Shared Google Calendar (optional)

Every attendance event and calendar entry, and each change to them, is
copied to one Google Calendar by the same service account. Nothing comes back
from Google. It needs `GOOGLE_SA_CLIENT_EMAIL` and `GOOGLE_SA_PRIVATE_KEY`
(set up in the Workspace directory sync steps above) and the **Google Calendar
API** enabled in the service account's Google Cloud project. Without the
service-account variables, copying stays off even when `GOOGLE_CALENDAR_ID`
is set, and the commands below fail.

The service account can make the calendar itself, owned by it and readable by
everyone at the domain; the result has its ID and a link for adding it in
Google Calendar:

```bash
npx convex run googleCalendar:createSharedCalendar '{"name": "SOW Events", "domain": "sow.org.au"}'
npx convex env set GOOGLE_CALENDAR_ID <calendarId from the result>
npx convex run googleCalendar:backfill '{"daysBack": 365}'
```

The backfill copies everything that starts from `daysBack` days ago onwards,
a page at a time, and is safe to run again.

Or use an existing calendar: share it with the service account's email with
**Make changes to events** and set its ID (*Settings → Integrate calendar →
Calendar ID*) the same way.

Leave it unset on dev unless dev has its own test calendar: dev's events are
test data.

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
| EAS Staging | `eas-staging.yml` | **manual only**. Builds and submits the staging app. A platform whose native code hasn't changed since its last store build gets the commit over the air (`eas update`) instead, or is skipped if it already has it |
| EAS Production | `eas-production.yml` | **manual only**. Builds and submits the production app. A platform whose native code hasn't changed since its last store build gets the commit over the air (`eas update`, from `main` only) instead, or is skipped if it already has it. Then posts the result (version, build numbers, commit, links) to the Data and IT space in Google Chat (`.github/scripts/eas-production-chat.sh`) |

Both EAS workflows take a **platform** input (`both` / `ios` / `android`,
default `both`) and are never triggered by a PR or a merge. Before building,
they compare the commit's native fingerprint (`eas fingerprint:generate` for
the profile) with the last finished store build for that profile and platform
(`scripts/eas-fingerprint-check.mjs`). A platform needs no store build when
the fingerprints match and that build has a finished store submission, because
phones on that build can take the commit over the air. If the newest
over-the-air update for that fingerprint on the profile's channel was
published from the same commit, the platform is skipped. Otherwise (a run
before EAS Update has finished, or a staging run from another branch) the
workflow runs `eas update` to that channel for it instead of building.
Production only publishes `main`: from another branch it warns and sends
nothing over the air, though any platform that needs a store build still
builds. It also publishes nothing if `main` has moved on since the run
started, since that newer merge's own EAS Update run sends it.
A changed fingerprint, no earlier build, or a build whose submission failed
still builds. The run's summary shows both fingerprints and the reason. Tick
**force** to build anyway, for example to refresh the JavaScript bundled into
the store download.

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

(`web/vercel.json`, like the root `vercel.json` that Vercel's own build
uses, provides an SPA fallback for the dynamic routes. Missing files under
`/_expo/` and `/assets/` are left out of it so they 404: a tab still running
an older release then gets a clean chunk-load error and reloads, instead of
being handed the HTML page as JavaScript.) When Google sign-in is configured, also set the deployment's
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
npm run test:coverage
```

`convex-test` runs the backend in memory, so the suite needs no deployment.
CI fails below 100% line and function coverage of `convex/` and `shared/`.
The **web sweep** in CI (`scripts/sweep-backend.sh`, `scripts/sweep.mjs`) opens
every screen against a seeded local backend, signed out and as three roles.

Signed-in testing uses the `e2e-auth` bypass: `src/app/e2e-auth.tsx` handles
`/e2e-auth?email=…&secret=…` in dev builds (or with `EXPO_PUBLIC_E2E=1`), and
the backend accepts it only when `E2E_AUTH_ENABLED` is `true` and the secret
matches `E2E_AUTH_SECRET`. Never set either on prod.

## Not yet implemented

- The whole-**staff-year** range for the SOW Insights view: supported by the
  shared logic (`STAFF_YEAR_RANGE`) but not precomputed or offered (campuses
  get whole calendar years from their weeklies instead).
