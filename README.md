# THE SHED — mobile

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
  admins can prepare the next year in advance and it takes effect automatically.
- **Admins** = members of **Human Resources** and **Data and IT**. Only they
  can assign roles/departments (for the current and next year), manage
  divisions/departments, and set the **Budget Manager** (who must be from the
  Finance department). Users can never change their own role.
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

## Tests

```bash
npm test
```

13 `convex-test` tests cover the auto-approval matrix, approval ordering and
authorization, decline behaviour, admin permissions, the Budget
Manager-must-be-Finance rule, and the September 1 rollover.

## Not yet implemented

- Receipt **file attachments** (Convex storage is available; the receipt form
  currently captures account details and amounts only).
- Past-year request archives and a Google Workspace directory sync (profiles
  sync from Google on sign-in; org-wide user import would use the Admin SDK).
