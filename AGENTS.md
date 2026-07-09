# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Cursor Cloud specific instructions

This is an Expo (RN) + Convex app; the same TS serves iOS/Android/web. Standard
commands live in `README.md` and `package.json` scripts. Node 22, npm (only
`package-lock.json`). Notes below are the non-obvious bits for running it here.

**Services**
- **Convex backend** (required): start with `CONVEX_AGENT_MODE=anonymous npx convex dev`.
  Agent mode spins up an isolated *local* backend (`http://127.0.0.1:3210`) and
  writes `.env.local` (`EXPO_PUBLIC_CONVEX_URL`, etc.). Without agent mode it
  targets the shared cloud `industrious-robin-425` deployment, which needs an
  interactive Convex login — so always use agent mode here. Any `npx convex env
  set` / `npx convex run` command must also be prefixed with
  `CONVEX_AGENT_MODE=anonymous`.
- **Expo web** (required for UI): `npm run web` (Metro on `http://localhost:8081`,
  reads `.env.local`). First page load bundles for ~15s.

**Fresh local backend is empty — one-time bootstrap after `convex dev` is up:**
1. Auth keys: `node scripts/generate-auth-keys.mjs`, then
   `npx convex env set JWT_PRIVATE_KEY -- "$(cat jwt_private_key.tmp)"`,
   `npx convex env set JWKS "$(cat jwks.tmp)"` (delete the two `*.tmp` files
   after). Also `npx convex env set SITE_URL http://localhost:8081` and
   `APP_URL http://localhost:8081`. Without JWT keys, sign-in fails.
2. Sign-in without Google OAuth (dev bypass): set
   `E2E_AUTH_ENABLED=true` and `E2E_AUTH_SECRET=<secret>` on the deployment, then
   in the browser open
   `http://localhost:8081/e2e-auth?email=<name>@sow.org.au&secret=<secret>`
   — it signs in as that (org-domain) email and redirects to `/`. This bypass is
   dev/test-only and must never be enabled on prod.
3. Seed org data:
   `npx convex run admin:seed '{"adminEmail":"<name>@sow.org.au"}'`.

**Submitting a reimbursement request** is blocked until the org has a Head for
the request's department, a Head for Finance, and a **Budget Manager**. Assign
these in the app's Admin tab (Budget Manager lives under the Admin → "Other"
sub-tab and its picker only lists Finance-department members).

**Lint/typecheck/tests need no running backend** — `convex-test` runs in-memory.
Use `npm run lint`, `npm run typecheck`, `npm test`. CI (`.github/workflows/ci.yml`)
runs these three (tests with coverage thresholds).
