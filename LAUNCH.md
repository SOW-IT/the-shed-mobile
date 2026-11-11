# LAUNCH.md — what is still unconfigured

THE SHED is live. The web app serves from <https://theshed.sow.org.au>, the
prod Convex backend (`giant-bloodhound-191`) auto-deploys on every merge, and
both stores have received production builds. This file tracks the launch
configuration that is still outstanding; finished items are removed, with the
evidence in the PR that finished them. It is not a statement about the
app's runtime behaviour; seasonal work such as the October 1 rollover is
covered by [ADR 0003](docs/adr/0003-october-1-staff-year-rollover.md), which
records its own unverified gaps.

Deployments: Convex dev `successful-lynx-56`, Convex prod
`giant-bloodhound-191`, web `https://theshed.sow.org.au` (Vercel `the-shed-web`),
dev web `https://the-shed-web-dev.vercel.app` (Vercel `the-shed-web-dev`).

---

## Still outstanding

- [ ] **After 2.10.18 deploys, fill the two new tables on prod** (optional,
      the nightly jobs do it): `npx convex run --prod memberCount:recount`
      makes the Members tab page by name straight away, and
      `npx convex run --prod categoryPeople:backfill` lets roles be read per
      person. Until then both read as before, nothing breaks. Once the
      minimum app version is 2.10.18 or later, drop the full list from
      `attendance.roster` (calls without a `limit`).
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

## Praise List — Indexed Duplicate Detection Migration

The Praise List uses indexed fields (`spotifyTrackId`, `normalizedSongKey`, and `isrc`) to detect duplicate music requests.

Existing music requests created before these fields were introduced must be backfilled after deploying the updated Convex schema and functions.

### Development

The development deployment was previously backfilled for 106 existing requests. Recheck the migration if necessary.

Run:

```bash
npx convex run musicBackfill:backfill '{}'
```

If `isDone` is `false`, repeat the command using the returned `continueCursor` value:

```bash
npx convex run musicBackfill:backfill '{"cursor":"PASTE_CONTINUE_CURSOR_HERE"}'
```

Continue until `isDone` is `true`.

### Production

**Do not run the migration against production until the updated schema and functions have been deployed and the production deployment has been confirmed.**

Once the production deployment is ready, run:

```bash
npx convex run --prod musicBackfill:backfill '{}'
```

If `isDone` is `false`, repeat using the returned cursor:

```bash
npx convex run --prod musicBackfill:backfill '{"cursor":"PASTE_CONTINUE_CURSOR_HERE"}'
```

Continue until `isDone` is `true`.

### Verification

- Confirm that all pages have been processed.
- Confirm the final response reports `isDone: true`.
- Verify that a previously existing Spotify song is detected as a duplicate.
- Check that approved songs remain visible and unchanged.
- Keep the backfill function internal-only.

**Important:** `checked` and `updated` are per-page counts, not totals across the migration. Record the results for each page when verifying the migration.
