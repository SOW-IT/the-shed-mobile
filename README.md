# THE SHED

Expo (React Native) + Convex app implementing the reimbursement request flow
from [REQUESTS_FLOW.md](https://github.com/SOW-IT/theshed/blob/main/REQUESTS_FLOW.md):

```
[Submit] → HOD → Budget Manager → (Director ≥ $5,000) → Finance Head → Receipt → Payment
```

## What's implemented

- **Approval chain** enforced server-side in Convex: each step can only be
  actioned by its approver, in order, never on your own request. Steps the
  submitter would review themselves are auto-approved (HOD's own request,
  Budget Manager's own, Director's own ≥ $5k, Finance Head's own; Finance
  department requests have no HOD step).
- **Per-year roles and departments** (`staffProfiles`, `departments`,
  `divisions`, keyed by year). The staff year rolls over on **September 1**:
  admins can prepare the next year in advance and it takes effect
  automatically. In-flight requests **carry over** the rollover — they stay
  visible and are approved/paid by the approvers of the request's own year.
  Roles: Staff, Head of Department, **Head of Division** (belongs directly to
  a division rather than a department; no HOD above them), Director.
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
  (Events, Missions).
- **Pre-provisioning by email**: assign a role/department to someone who has
  never signed in; it links up on their first Google sign-in.
- **Google sign-in** via Convex Auth, restricted to the `sow.org.au`
  workspace (`hd` hint + server-side domain check); name/email sync from the
  Google profile on each sign-in.
- **Email notifications** via Resend: submitter confirmation, "needs your
  approval" to the next approver at every step, declines (with reason),
  receipt-ready-to-pay to the Finance Head, paid confirmation, and a Budget
  Manager alert when the paid amount differs from the requested amount.
- **Tabs**: My Requests (submit / cancel / receipt), To Review (approve /
  decline / pay, shown to approvers), All Requests (Finance staff), Admin.

## Getting started

```bash
npm install
npx convex dev        # terminal 1 — backend
npm run web           # terminal 2 — or `npm start` for iOS/Android
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

Syncs the sow.org.au member list daily (and via the admin screen's *Sync
Directory* button) so admins assign people from a picker. Setup:

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

Until configured, the daily sync no-ops and the admin screen shows
"not synced yet". Syncing only fills the picker — assigning roles stays an
explicit admin action.

## CI/CD

- **CI** (`.github/workflows/ci.yml`): every PR and push to `main` runs the
  typecheck and backend tests.
- **EAS Build** (`.github/workflows/eas-build.yml`): every merge to `main`
  (after the same quality gate) queues **iOS + Android production builds** on
  [EAS](https://expo.dev/eas). Builds and signed artifacts appear in the Expo
  dashboard; trigger manually any time via *Actions → EAS Build → Run workflow*.
- **Deploy** (`.github/workflows/deploy.yml`): every merge to `main` (after
  the same gate) deploys the **prod Convex backend** and republishes the
  **hosted web app** against it — push-to-deploy, like the web repo. Needs
  two repo secrets: `CONVEX_DEPLOY_KEY` (Convex dashboard → prod deployment →
  Settings → Deploy key) and `VERCEL_TOKEN`
  (<https://vercel.com/account/tokens>). Until they exist it passes with a
  warning and skips. (Vercel's own git integration can't be used: Hobby plans
  can't connect private org-owned repos.) Manual fallbacks remain
  `npx convex deploy -y` and `npm run deploy:web`.

One-time setup to activate it:

```bash
npx eas init           # links the repo to an EAS project (adds projectId to app.json)
npx eas credentials    # set up Apple Developer + Android keystore (EAS manages both)
```

then create an access token at <https://expo.dev/settings/access-tokens> and
add it as the `EXPO_TOKEN` repository secret on GitHub. Until the secret
exists, the workflow passes with a warning and skips the build step. To also
auto-submit to TestFlight/Play Console, append `--auto-submit` to the
`eas build` line once store credentials are configured.

## Production backend + web hosting

Convex has two deployments: **dev** (`industrious-robin-425`, used by local
dev and the `convex dev` watcher) and **prod** (`outgoing-stoat-395`). Push
backend code to prod with:

```bash
npx convex deploy -y
```

Prod env vars are managed with `npx convex env set --prod ...` (JWT keys,
SITE_URL/APP_URL, Resend are set; Google OAuth + directory-sync vars need
`--prod` copies when configured). Re-seed prod with the real admin email via
`npx convex run --prod admin:seed '{"adminEmail":"you@sow.org.au"}'`.

The same app runs in the browser via react-native-web, hosted at
**<https://the-shed-web.vercel.app>** (Vercel project `the-shed-web`),
**pointed at the prod deployment**. Mobile production builds (eas.json) use
prod too; only local dev uses the dev deployment. Redeploy the site with:

```bash
npm run deploy:web
```

(`web/vercel.json` provides clean URLs + an SPA fallback for the dynamic
routes.) When Google sign-in is configured, also set the deployment's
`SITE_URL` to the hosted URL so web OAuth redirects return there:

```bash
npx convex env set SITE_URL https://the-shed-web.vercel.app
```

### Email links and universal links

Every notification email ends with an "Open in THE SHED" link to the hosted
web app (`APP_URL` env var, e.g. `/request/<id>`), so emails work for
everyone immediately. To make those same HTTPS links open the **native app**
when installed (iOS Universal Links / Android App Links — already configured
in app.json via `associatedDomains` and `intentFilters`):

1. After Apple enrollment: copy
   `web/.well-known/apple-app-site-association.example` to
   `web/.well-known/apple-app-site-association` (no extension) and replace
   `YOUR_APPLE_TEAM_ID` with the real Team ID.
2. After `eas credentials` creates the Android keystore: copy
   `assetlinks.json.example` to `assetlinks.json` and paste the SHA-256
   signing fingerprint (shown by `eas credentials`).
3. `npm run deploy:web` — the `.well-known/` files ship with the site, and
   the OS starts routing those links into the app on the next install.

Until then the links simply open the web app, which is the right fallback
anyway.

## Tests

```bash
npm test
```

13 `convex-test` tests cover the auto-approval matrix, approval ordering and
authorization, decline behaviour, admin permissions, the Budget
Manager-must-be-Finance rule, and the September 1 rollover.

## Not yet implemented

- Past-year request archives and a Google Workspace directory sync (profiles
  sync from Google on sign-in; org-wide user import would use the Admin SDK).
