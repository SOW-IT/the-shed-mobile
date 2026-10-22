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

- [ ] **Ship one store build of 2.9.19 or later before relying on
      over-the-air updates.** Builds before 2.9.19 have no `expo-updates` and
      no channel, so `eas-update.yml` publishes to nobody until people install
      it. Check the first publish lands with `eas update:list` and a phone on
      the new build. iOS 2.9.23 is the first such build; Android's first is
      2.9.24, because 2.9.23's Android production build failed on a
      fingerprint mismatch (see 2.9.24 in CHANGELOG.md). `fingerprint.config.js`
      now ignores the builder-only Firebase file and native folders, so the
      GitHub runner's fingerprint matches the EAS builder's: the 2.9.24
      Android production build (EAS build `25f738fc`, from `13475e1` on
      2026-10-21) passed "Configure expo-updates" and was submitted to
      Google Play (submission `46f8f1d6`). Each
      publish sets `EXPO_PUBLIC_CONVEX_URL` itself, since `eas update`
      ignores the build profiles' `env`.
- [ ] **Add the `CONVEX_ACCESS_TOKEN` repository secret** (a team member's
      token from `npx convex login`) so `convex-usage.yml` can read usage. On
      2026-10-20 database bandwidth was 5.49 GB against a 1 GB plan (prod 4.56,
      dev 0.93), so the first run will warn; set `CONVEX_PLAN_DB_BANDWIDTH_GB`
      if the plan changes.
- [ ] **Let the backup account replace the storage manifest and the
      warehouse check's state.** The nightly file copy overwrites
      `storage/manifest.json` after every page of files, and the warehouse
      check overwrites `convex/production/checks/latest.json`. Both need
      `storage.objects.delete` on the backup bucket for
      `GCP_BACKUP_SERVICE_ACCOUNT` (file objects and the database zips are
      never overwritten). Without it, new file objects and zips still upload
      and each JSON file can be created once, but replacing it fails: on
      2026-10-20 the manifest was created at 19:21:53Z and replacing it four
      minutes later failed with
      `GcsApiError('')`, so the file copy stops after its first page each
      night, and the warehouse check will fail from its second night. The
      first night with the grant downloads every file not yet in the
      manifest once.
- [ ] **Release 2.10.0 in this order.** It removes server code that apps
      older than 2.9.25 still call, and on 2026-10-22 54 of the 58 phones
      seen that week were older than 2.9.25.
      1. Before merging, check 2.9.25 or later is live on the App Store and
         Google Play, since the update screen sends people to those listings.
      2. Straight after merging (the Convex deploy goes out with the merge),
         set `minimum` to 2.9.25 so older apps show the update screen instead
         of calling functions that are gone: `npx convex run --prod
         appInstalls:setUpdatePolicy '{"platform": "ios", "minimum": "2.9.25"}'`,
         the same for `android`.
      3. Run EAS Production and EAS Staging. 2.10.0 has a new runtime
         fingerprint (the Expo patch updates), so it reaches phones as a store
         update, not over the air.
      4. Once 2.10.0 is live in both stores, set `recommended` to 2.10.0:
         `npx convex run --prod appInstalls:setUpdatePolicy '{"platform":
         "ios", "recommended": "2.10.0"}'`, the same for `android`.
      5. Merge main into `feat/music-form` and redeploy dev, as after every
         release.

- [ ] **Add the Google Chat webhook secret** so EAS Production posts its
      result to the Data and IT space: `gh secret set GOOGLE_CHAT_WEBHOOK_URL
      --repo SOW-IT/the-shed-mobile` and paste the space's incoming webhook URL
      when asked. Without it the step skips. Pull requests go to the same space
      through the **GitHub for Google Chat** app: add it to the space, then
      `/github_subscribe SOW-IT/the-shed-mobile`.

- [ ] **Reply to App Review (2.5.8, guideline 5.1.1(v))** with a physical-device
      recording: sign in with Apple, Profile, Delete account, type the name,
      the Apple prompt, "Account deleted". Put the same recording in the App
      Review Notes for later submissions.

- [ ] **Copy the old web app's design requests into production** once 2.2.0's
      backend is deployed: `gcloud auth login` (an account with access to
      `theshedsow`), then `node scripts/import-design-requests.mjs --dry-run`
      and `node scripts/import-design-requests.mjs --prod`. It can be re-run
      after anyone submits more on the old site; requests already acted on in
      THE SHED are left alone.

- [ ] **Privacy policy URL** — required by both stores. Adapt SOW's existing
      policy to cover: Google sign-in (name/email), profile photos, receipt
      files including bank account details, and push tokens.
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
- [ ] **Typed BigQuery warehouse views** — after 1.11.7/1.11.8 merges, the next
      successful `bigquery` job should create dataset `convex_warehouse`. Each
      Looker/Sheets view is published only if every table it needs was in that
      zip (`insights_*` need `attendanceMetricsSnapshots`, `attendance_signins`
      needs attendance + events + members). Confirm with
      `bq ls theshedsow:convex_warehouse`. If that dataset was pre-created, the
      backup SA needs `roles/bigquery.dataEditor` on it (same as
      `convex_production`).
- [ ] **Public store listings** (only if you want them) — iOS is currently
      distributed through TestFlight. Going public needs screenshots,
      description, App Privacy labels and a demo account in the review notes;
      **Unlisted App Distribution** is the lighter option for a staff app.
      Android likewise needs the store listing, content rating and Data safety
      form to leave the internal track.

---

## Already done — verified

Recorded so nobody re-does them. Each was confirmed against the live
deployments, not assumed.

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
