# LAUNCH.md — what is still unconfigured

THE SHED is live. The web app serves from <https://theshed.sow.org.au>, the
prod Convex backend (`giant-bloodhound-191`) auto-deploys on every merge, and
both stores have received production builds. This file tracks the launch
configuration only: what is still outstanding, and — under "Already done" — the
items checked against the live deployments. It is not a statement about the
app's runtime behaviour; seasonal work such as the October 1 rollover is
covered by [ADR 0003](docs/adr/0003-october-1-staff-year-rollover.md), which
records its own unverified gaps.

Deployments: Convex dev `successful-lynx-56`, Convex prod
`giant-bloodhound-191`, web `https://theshed.sow.org.au` (Vercel `the-shed-web`),
dev web `https://the-shed-web-dev.vercel.app` (Vercel `the-shed-web-dev`).

---

## Still outstanding

- [ ] **Turn on the shared Google Calendar** (2.10.12): after the merge,
      `npx convex run --prod googleCalendar:createSharedCalendar '{"name":
      "SOW Events", "domain": "sow.org.au"}'`, then `npx convex env set --prod
      GOOGLE_CALENDAR_ID <calendarId>` and `npx convex run --prod
      googleCalendar:backfill '{"daysBack": 30}'`. Needs the Google Calendar
      API enabled in the service account's project. See the README's "Shared
      Google Calendar".

- [ ] **Confirm an over-the-air update reaches a phone.** iOS 2.9.23 and
      Android 2.9.24 are the first store builds with `expo-updates`. Check a
      publish lands with `eas update:list` and a phone on one of those builds.
      Each publish sets `EXPO_PUBLIC_CONVEX_URL` itself, since `eas update`
      ignores the build profiles' `env`.
- [ ] **Add the `CONVEX_ACCESS_TOKEN` repository secret** (a team member's
      token from `npx convex login`) so `convex-usage.yml` can read usage. On
      2026-10-20 database bandwidth was 5.49 GB against a 1 GB plan (prod 4.56,
      dev 0.93), so the first run will warn; set `CONVEX_PLAN_DB_BANDWIDTH_GB`
      if the plan changes.
- [ ] **Release 2.10.0 in this order.** It removes server code that apps
      older than 2.9.25 still call, and on 2026-10-22 54 of the 58 phones
      seen that week were older than 2.9.25.
      1. Wait until 2.9.25 or later is live on the App Store and Google Play,
         with Play's rollout at 100%. The update screen sends people to those
         listings, and anyone outside a staged rollout can't update yet.
      2. Just before merging, set `minimum` to 2.9.25 so apps from 2.9.0 to
         2.9.24 show the update screen instead of calling functions this
         release removes: `npx convex run --prod
         appInstalls:setUpdatePolicy '{"platform": "ios", "minimum":
         "2.9.25"}'`, the same for `android`. Then merge. The Convex deploy
         goes out with the merge, so setting the minimum first leaves no gap
         where old apps call missing functions; until the merge the server
         still serves them, so they only see the update screen a few minutes
         early. Apps older than 2.9.0 have no update screen, so `minimum`
         can't stop them, but 2.9.1 already dropped the server code they
         need. On 2026-10-22 production had one such install (iOS 2.5.8),
         last seen 2026-10-14, before 2.9.1 shipped.
      3. Run EAS Production and EAS Staging. 2.10.0 has a new runtime
         fingerprint (the Expo patch updates and the dropped Google Maps SDK),
         so it reaches phones as a store update, not over the air.
      4. Once 2.10.0 is live in both stores, set `recommended` to 2.10.0:
         `npx convex run --prod appInstalls:setUpdatePolicy '{"platform":
         "ios", "recommended": "2.10.0"}'`, the same for `android`.
      5. Merge main into `feat/music-form` and redeploy dev, as after every
         release.
      6. Delete `GOOGLE_MAPS_IOS_API_KEY` from the EAS environments whenever
         convenient; builds ignore it from 2.10.0. Keep the iOS key itself in
         Google Cloud until the minimum app version reaches 2.10.0, because
         2.9.25 to 2.9.29 still draw Google Maps with it.

- [ ] **Send pull requests to the Data and IT space** (if wanted) through the
      **GitHub for Google Chat** app: add it to the space, then
      `/github_subscribe SOW-IT/the-shed-mobile`. EAS Production's own Chat
      post already works.

- [ ] **Copy the old web app's design requests into production**, unless it
      has been done (imported rows have a `legacyKey`): `gcloud auth login`
      (an account with access to `theshedsow`), then `node scripts/import-design-requests.mjs --dry-run`
      and `node scripts/import-design-requests.mjs --prod`. It can be re-run
      after anyone submits more on the old site; requests already acted on in
      THE SHED are left alone.

- [ ] **Add the 2025–26 and 2026–27 mentor lists** once 2.10.4 is live:
      `npx convex run --prod mentoring:setPairings` for 2026 and 2027, eight
      pairings each, from the lists given on 2026-10-23.

- [ ] **Privacy policy**: the App Store listing links SOW's general policy
      (`Privacy Policy (Final)_20240428.pdf`). Adapt it to cover Google
      sign-in (name/email), profile photos, receipt files including bank
      account details, and push tokens.
- [ ] **Confirm FCM IAM** — that `expo-dev@theshedsow.iam.gserviceaccount.com`
      holds **Firebase Cloud Messaging API Admin** on project `theshedsow`
      (Google Cloud → IAM). Push delivery depends on it.
- [ ] **Confirm `info@sow.org.au` is monitored** — the annual staff-year
      rollover summary now goes to both `info@sow.org.au` and `it@sow.org.au`,
      and is the only receipt that the rollover ran. IT keeps receiving it; this
      is just a check that the Info inbox is watched too.
- [ ] **Original logo vector** — the store icon is upscaled from a 512px PNG. A
      vector or 1024px source would sharpen it; regeneration is scripted.
- [ ] **Staging Firebase app** — no Firebase Android app exists for
      `au.org.sow.theshed.staging`, so staging builds omit `googleServicesFile`
      and staging push does not work. Production and preview are unaffected.

---

## Already done — verified

Recorded so nobody re-does them. Each was confirmed against the live
deployments, not assumed.

**2019 and 2020 called Head of Department "Department Overseer" again**:
2.10.3's `history:setRoleTitle` ran on production for both years on
2026-10-23, and `history:setPastAssignments` gave Juno Yu back his 2019
Campus Chaplain role beside Head of Department for Events. *Evidence:* the
roles rows read back with `standsFor: "Head of Department"`, Juno Yu's 2019
profile reads back with both assignments, and the live org chart at
theshed.sow.org.au shows "Department Overseer" for 2019.

**Old app's mentoring pairings copied in**: 2.10.1's one-off import ran
against production on 2026-10-23 and was removed in 2.10.3. *Evidence:* the
old app had pairings for 2023 (9), 2024 (8) and 2025 (8); 24 were inserted and
one external mentor created (Sarah Kim, who has no 2023 profile). One 2023
mentee was skipped: their old account no longer exists, so they can't be
identified.

**Typed BigQuery warehouse views**: the weekly backup builds dataset
`convex_warehouse`. *Evidence (backup run 39660287748, 2026-10-21 19:17 UTC):*
its log creates the typed table views and all ten `insights_*` views plus
`staff_assignments`, `attendance_signins`, `requests_status` and
`request_recipients`.

**Google Chat post after EAS Production**: `GOOGLE_CHAT_WEBHOOK_URL` has been
a repository secret since 2026-10-15.

**2.9.29 event head counts moved on production**: `attendanceCounts:backfill`
ran on prod on 2026-10-21 at 11:23 UTC and recounted every event into
`eventAttendanceCounts`; its own check matched each event's count to its
sign-ins. *Evidence (2026-10-21 13:52 UTC, read-only):* 282 events, 282 count
rows, no event with more than one row, no event still carrying the old
`events.attendanceCount` field, and the counts add up to 13,413 sign-ins.
2.10.0 drops that field from the schema.

**Dev runs 2.9.29, with nightly jobs paused**: `feat/music-form` merged with
main at `7c150af` (main `cbf04c0`, no conflicts) and deployed to
`successful-lynx-56` on 2026-10-21 at 13:50 UTC, then
`attendanceCounts:backfill` ran on dev. *Evidence (export at 13:51 UTC):* 273
events, 273 count rows, every count equal to that event's sign-ins (12,941 in
all), none left with the old field. `NIGHTLY_JOBS_PAUSED` prints `true`, so the
nightly jobs now skip on dev, including the roll call's order and Admin's
member-pair suggestions (see README). The dev web passed a signed-out smoke
(13 routes) and the QR check-in end-to-end against this backend.

**2.8.0 weekly migration ran on production**: every past weekly renamed to
its code ("T3W5", "S1W5") with a term and week, name labels moved into
Weeklies tags, Event and Other Events merged into Social.
*Evidence (2026-10-15): prod exported first
(`prod-2026-10-15-2.8.0-deployed.zip`); the dry run matched the approved list
(183 events, 10 tag changes, no warnings); `{"dryRun": false}` applied the
same 183 and 10; a rerun reports 0 and 0. All 195 weeklies have both a mark
and the Weeklies tag, no event points at a deleted tag, and the attendance
audit log has "Weekly names and tags tidied (2.8.0)".*

**Sign in with Apple key for account deletion** (2.7.0): `APPLE_TEAM_ID`,
`APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` are set on both Convex deployments.
*Evidence (2026-10-15): `npx convex env list` shows all three names on prod
and dev.*

**2.9.2 clean-up ran on production** (2026-10-16, after #367's Convex deploy).
*Evidence: backup ~/Documents/the-shed-backups/prod-2026-10-16-2.9.2-deployed.zip
taken first; `fieldCleanup:linkTypedChurches` added and linked Redeemer
Presbyterian Church, Sydney Elim Presbyterian Church and New Life Christian
Church (name only) for their three staff; `fieldCleanup:clearImportIds`
cleared 220 events and 1,200 members; every rerun found 0. 2.9.3 then dropped
the fields and the clean-up module.*

**Old event forms copied in, and the old pages redirect** — 2.3.0's import
ran against production after the Convex deploy, and the old web app's Event
Forms pages now send people to `/event-requests` (SOW-IT/theshed#3).
*Evidence (2026-10-07): `import-event-requests.mjs --prod` inserted 20 events
(13 approved, 5 cancelled, SAF26 and SOW Camp 2027 in progress) with 60 forms;
`theshedsow.web.app/event-form` and an old `/event-sub-form/…` link both land
on theshed.sow.org.au. The import script was removed in 2.9.1.*

**Accounts and signing** — Apple Developer (Team ID `4FH642K7X2`), Google Play
and Expo accounts all exist; EAS holds the iOS credentials and the Android
keystore. *Evidence: EAS Production last succeeded 2026-08-12, EAS Staging
2026-07-30, both building `ios` and `android`.*

**GitHub secrets** — `CONVEX_DEPLOY_KEY`, `CONVEX_PREVIEW_DEPLOY_KEY`,
`EXPO_TOKEN`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID_DEV` are all set, and the
backup's three repository *variables* (`GCP_WORKLOAD_IDENTITY_PROVIDER`,
`GCP_BACKUP_SERVICE_ACCOUNT`, `GCS_BACKUP_BUCKET`) point at
`theshedsow-convex-backups`. *Evidence: Convex Deploy, Deploy web (dev) and
Backup Convex to GCS all succeeded on their latest runs; the backup has run
daily and cleanly.*

**Convex snapshot in BigQuery** — dataset `convex_production` exists in
`australia-southeast1`. The backup SA has `roles/bigquery.user` on the
project, `roles/storage.objectViewer` on the backup bucket, and WRITER on
the dataset. A load of the 31 Aug production zip published 26 tables
(attendance 11556, requests 345, staffProfiles 845, users 57). Auth sessions
and push tokens are not in the dataset. *Evidence: `bq ls
theshedsow:convex_production` and those row counts on 2026-09-01.*

**The backup account can replace its two state files** — and no other
objects. The nightly file copy overwrites `storage/manifest.json` and the
warehouse check overwrites `convex/production/checks/latest.json`, which needs
`storage.objects.delete`. `roles/storage.objectCreator` doesn't include it,
so replacing them failed with `GcsApiError('')`: the manifest from
2026-10-21, so the file copy stopped after its first page each night, and the
check state from 2026-10-22, which failed the warehouse check.
The SA now also has `roles/storage.objectUser` on the bucket, under the IAM
condition `replace-backup-state`, which matches only those two object names.
It still can't delete or overwrite the database zips or the copied files.
*Evidence: the manual Backup Convex to GCS run on 2026-10-22 (run
39851160632) passed both jobs. It copied 68 new files ("170 file(s) in
Convex, 68 new, 102 already in GCS, 0 failed"), replaced the manifest at
20:46:09Z and the check state at 21:01:26Z, and logged "Warehouse checks
passed."*

**Google OAuth** — `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and
`AUTH_ALLOWED_DOMAIN` are set on **both** deployments, for the `google`
provider (SOW accounts only; the `googlePersonal` provider was removed in
2.4.7).

**Workspace directory sync** — `GOOGLE_SA_CLIENT_EMAIL`,
`GOOGLE_SA_PRIVATE_KEY` and `GOOGLE_ADMIN_IMPERSONATE` are set on **both**
deployments, so the weekly sync is live rather than no-opping.

**Auth keys and email** — `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL` set on both; prod also has `APP_URL`.

**The dev-only sign-in bypass is not on prod.** `E2E_AUTH_ENABLED` and
`E2E_AUTH_SECRET` exist on dev only. Keep it that way — it grants a session
from a URL.

**Custom domain** — `theshed.sow.org.au` resolves and serves, with `SITE_URL`
pointed at it.

**Universal links**: real `apple-app-site-association` (Team ID above) and
`assetlinks.json` are committed and served. Until 2.9.25 the production build
never copied `web/.well-known`, so production returned the app's HTML for them
and Apple's CDN had "Not Found"; the root `vercel.json` now copies both into
`dist`. Evidence, 2026-10-21 02:44 UTC after the 2.9.25 deploy (`382a82e`):
`theshed.sow.org.au/.well-known/apple-app-site-association` and
`assetlinks.json` both return 200 `application/json`, and
`https://app-site-association.cdn-apple.com/a/v1/theshed.sow.org.au` returns
the file for `4FH642K7X2.au.org.sow.theshed`. The dev web serves the staging
pair: checked 2026-10-21 04:26 UTC, after the 2.9.26 dev deploy (`aaf3c82`),
`the-shed-web-dev.vercel.app/.well-known/apple-app-site-association` and
`assetlinks.json` both return 200 `application/json` (for
`au.org.sow.theshed.staging`), and
`https://app-site-association.cdn-apple.com/a/v1/the-shed-web-dev.vercel.app`
returns the file for `4FH642K7X2.au.org.sow.theshed.staging`.

> ⚠️ **Google Play App Signing** re-signs Play installs with Play's own key.
> Each `assetlinks.json` lists Play's app-signing key first, then the EAS
> keystores the builds are signed with (`eas credentials`, the default build
> credentials). If Play's key ever changes (a key upgrade in Play Console),
> update it there too, or Android App Links stop verifying for Play installs.

**Android App Links verified**: 2.9.28 (`828786a`) added Google Play's
app-signing keys. Google's `assetlinks:check` returned `"linked": true` for
every key the two files list (the same lists `shared/appLinks.test.ts` pins):
The SHED on `theshed.sow.org.au` (Play `BC:05:F0:8B:…:0E:62`, EAS default
`35:E8:D8:3F:…:E6:43`, both checked 07:50 UTC, and the older EAS key
`6A:BC:70:E5:…:99:94`, checked 11:29 UTC, all 2026-10-21) and The SHED Staging
on `the-shed-web-dev.vercel.app` (Play `1B:05:5E:47:…:94:C8` and EAS
`B5:96:8D:48:…:80:B9`, 07:50 UTC). Android verifies when the app is installed or updated,
so Play installs open links in the app after their next update. On Android 14
and older, an old app's "Open on the web" and a web sign-in on a phone with the
app can land in the app, because those versions ignore the `#noapp` and
`?code=` rules.
