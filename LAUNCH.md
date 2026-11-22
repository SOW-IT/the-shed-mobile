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
- [ ] **Delete `GOOGLE_MAPS_IOS_API_KEY` from the EAS environments** whenever
      convenient; builds ignore it from 2.10.0. Keep the iOS key itself in
      Google Cloud until the minimum app version reaches 2.10.0, because
      2.9.25 to 2.9.29 still draw Google Maps with it.

- [ ] **Send pull requests to the Data and IT space** (if wanted) through the
      **GitHub for Google Chat** app: add it to the space, then
      `/github_subscribe SOW-IT/the-shed-mobile`. EAS Production's own Chat
      post already works.

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

