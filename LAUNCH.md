# LAUNCH.md — what is still unconfigured

THE SHED is live. The web app serves from <https://theshed.sow.org.au>, the
prod Convex backend (`outgoing-stoat-395`) auto-deploys on every merge, and
both stores have received production builds. This file tracks the launch
configuration only: what is still outstanding, and — under "Already done" — the
items checked against the live deployments. It is not a statement about the
app's runtime behaviour; seasonal work such as the October 1 rollover is
covered by [ADR 0003](docs/adr/0003-october-1-staff-year-rollover.md), which
records its own unverified gaps.

Deployments: Convex dev `industrious-robin-425`, Convex prod
`outgoing-stoat-395`, web `https://theshed.sow.org.au` (Vercel `the-shed-web`),
dev web `https://the-shed-web-dev.vercel.app` (Vercel `the-shed-web-dev`).

---

## Still outstanding

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
theshedsow:convex_production` and those row counts on 2026-09-01. The GitHub
`bigquery` job still has to run once on `main` after 1.11.3 merges.*

**Google OAuth** — `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and
`AUTH_ALLOWED_DOMAIN` are set on **both** deployments, covering the `google`
and `googlePersonal` providers.

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

**Universal links** — real `apple-app-site-association` (Team ID above) and
`assetlinks.json` are committed and served, with `web/vercel.json` giving the
AASA file an `application/json` content type.

> ⚠️ If **Google Play App Signing** is enabled, Play re-signs with its own key.
> Add the Play Console's app-signing SHA-256 to the `sha256_cert_fingerprints`
> array in `assetlinks.json` (it takes several) or Android App Links will not
> verify for Play installs.
