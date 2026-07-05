# The Shed Mobile — Maestro E2E suite

End-to-end UI tests driven by [Maestro](https://maestro.mobile.dev), generated
from [`E2E_TEST_CHECKLIST.md`](../E2E_TEST_CHECKLIST.md) (v1.7.1). Folder numbers
mirror the checklist sections.

```
.maestro/
├── config.yaml            # suite config, tags, exclude `manual`
├── .env.example           # copy → .env, fill accounts (git-ignored)
├── common/                # reusable subflows (launch, sign-in, sign-out, deep link)
├── 00-launch-and-gating/  # §0  tab gating, logo→Home
├── 01-public/             # §1  signed-out Home/Insights/Org/contact/sign-in
├── 02-auth/               # §2  sign-out, deep-link-while-out, (manual) grace window
├── 03-requests/           # §3  reimbursement lifecycle
├── 04-bank/               # §4  bank accounts
├── 05-attendance/         # §5  events, roll-call, members, tags, metadata, audit, export
├── 06-insights/           # §6  General + Attendance dashboards
├── 07-org-chart/          # §7  public org chart
├── 08-profile/            # §8  own profile / person
├── 09-admin/              # §9  admin access, structure, other
├── 10-notifications/      # §10 in-app bell (+ manual push)
├── 11-deeplinks/          # §11 routed screens
└── 12-cross-cutting/      # §12 test chip, chrome collapse, (manual) sync/cron
```

## Prerequisites

1. **Install Maestro** — `curl -fsSL https://get.maestro.mobile.dev | bash`
2. **A running build on a simulator/emulator or device.** Use the **staging**
   build so tests hit the test/dev Convex backend and the "Test Environment"
   chip shows (checklist §12.5/§12.6):
   - iOS: `APP_ID=au.org.sow.theshed.staging`, scheme `theshedmobilestaging`
   - Build & install: `eas build --profile staging` (or a local dev client).
3. **Seeded test accounts & data** in the test backend (see below).
4. `cp .maestro/.env.example .maestro/.env` and fill it in.

> On this machine, prefer **baguette** to drive the iOS simulator when launching
> the build manually — `idb tap` is broken on the installed iOS/Xcode.

## Running

### Easiest: `npm run e2e:local` (recommended locally)

```bash
npm run e2e:local                                        # whole suite
npm run e2e:local -- --include-tags smoke                # a tag subset
npm run e2e:local -- .maestro/00-launch-and-gating/live-smoke.yaml   # one flow
```

`scripts/e2e-local.sh` puts Maestro + its JRE on `PATH` (no shell-profile edits),
applies the local **dev-client defaults** (`APP_ID`/`SCHEME` for the dev build,
`DEV_CLIENT=true` so the Expo dev-menu is auto-dismissed and state is *not*
cleared), loads `.maestro/.env` if present, and forwards any extra args to
`maestro test`. Requires the app already installed/loaded on a booted simulator
(the runner drives it; it doesn't build it). Install Maestro once with
`curl -fsSL https://get.maestro.mobile.dev | bash` (and `brew install openjdk`
for the JRE).

### Raw `maestro` invocations

```bash
# Everything automatable (manual-tagged flows are excluded in config.yaml):
maestro test --env-file .maestro/.env .maestro

# Fast gate — high-value happy paths only:
maestro test --env-file .maestro/.env --include-tags smoke .maestro

# Only the no-auth public surface (no seeded accounts needed):
maestro test --env-file .maestro/.env --include-tags public .maestro

# A single flow:
maestro test --env-file .maestro/.env .maestro/01-public/home-four-pages.yaml
```

Pass `--env APP_ID=au.org.sow.theshed` (etc.) to override any `.env` value ad hoc.

> `--env-file` needs a Maestro build recent enough to support it. On older
> builds use `scripts/e2e-local.sh` (or `npm run e2e:local`), which reads
> `.maestro/.env` and forwards each line as an individual `--env` flag, so it
> works regardless of the installed Maestro version.

### Running against an Expo dev client (local)

If the simulator runs a **development build** (Expo dev client) rather than a
standalone app, launching with `clearState` drops to the dev-client launcher and
wipes app state — so the suite defaults to **non-destructive** launches. Run
with the app already loaded from Metro and signed in:

```bash
maestro test \
  --env APP_ID=au.org.sow.theshed --env SCHEME=theshedmobile \
  --env DEV_CLIENT=true \
  .maestro/00-launch-and-gating/live-smoke.yaml
```

- `DEV_CLIENT=true` auto-dismisses the Expo developer-menu overlay if it appears.
- **Do not** pass `CLEAR_STATE=true` on a dev client — it clears the bundler
  state (the Keychain auth token survives, but you land on the launcher and must
  reload the bundle). CI / standalone builds pass `CLEAR_STATE=true` to isolate.
- OAuth sign-in flows can't run against an already-signed-in dev client (there's
  no "Sign in with Google" button when a session exists). Use the signed-in
  flows that match the loaded account, or a standalone build with an auth bypass.

**Device-verified** (ran green, twice consecutively, on iPhone 17e / iOS 26.5
against the Convex dev backend via the `e2e-auth` bypass):
- `00-launch-and-gating/live-smoke.yaml`
- `04-bank/bank-details-crud.yaml`
- `05-attendance/subtabs-and-events.yaml`
- `05-attendance/create-event-wizard.yaml`
- `05-attendance/roll-call-sign-in.yaml`
- `05-attendance/members-tab.yaml`
- `05-attendance/tags-metadata-audit.yaml`
- `05-attendance/export.yaml`
- `06-insights/general-and-attendance-segments.yaml`
- `07-org-chart/org-chart.yaml`
- `08-profile/own-profile.yaml`
- `09-admin/access-and-tabs.yaml`
- `09-admin/non-admin-blocked.yaml`
- `09-admin/structure-and-other.yaml`
- `10-notifications/bell-feed.yaml`
- `11-deeplinks/routed-screens.yaml`
- `12-cross-cutting/chrome-collapse-on-scroll.yaml`
- `12-cross-cutting/test-environment-chip.yaml`

- `01-public/home-four-pages.yaml`
- `01-public/contact-form.yaml`
- `01-public/insights-general-only.yaml`
- `01-public/org-chart-and-profiles.yaml`
- `01-public/sign-in.yaml` (real Google OAuth is best-effort — see
  `common/sign-in-google.yaml`'s header; this only fully exercises staff
  chrome on a machine with working test credentials or a pre-authed build)
- `02-auth/deeplink-while-signed-out.yaml`
- `02-auth/sign-out-confirm-cancel.yaml`

(`.MANUAL.yaml`-suffixed flows — first-signin-grace-window, push, and
scheduled-and-multidevice — are excluded from automation by design; see
`config.yaml`.)

### Device-verified selector notes

Confirmed against the real iOS accessibility tree (these differ from raw visible
text and are baked into the flows):

| UI element | Matchable selector |
|---|---|
| Bottom tabs | `"<Name>, tab, N of N"` → match with regex, e.g. `.*Attendance, tab.*` |
| Requests "Review" segment | carries its badge: `"Review, 2"` → use `.*Review.*` |
| Test-env chip | its a11y label `"Test environment — what is this?"` (not "Test Environment") |
| Notifications bell | `"Notifications, N unread"` → use `.*Notifications.*` |
| Other a11y labels | exact: `"Open your profile"`, `"+ Make Request"`, `"Nudge approver"`, `"Comments"`, `"Delete or cancel request"`, `"Go to Home"` |

On iOS a container's `accessibilityLabel` **masks** its child `Text`, so match the
label, not the inner words. Maestro's `text:` selector matches iOS a11y labels
and does full-string regex — hence the `.*…*` patterns for labels with badges.

## Tags

| tag        | meaning |
|------------|---------|
| `public`   | no auth, runs on a fresh install with no fixtures |
| `auth`     | exercises the Google OAuth sign-in path |
| `staff`    | needs a signed-in plain-staff profile |
| `approver` | needs HOD / Budget / Director / Finance approver roles |
| `finance`  | needs a Finance-department / Finance-Head profile |
| `admin`    | needs an admin profile |
| `smoke`    | fast, high-value happy paths for CI gating |
| `manual`   | documented but **not** automatable here (excluded by default) |

## Auth strategy (important)

Google OAuth runs inside `ASWebAuthenticationSession`. Google actively blocks
scripted sign-in and injects 2FA/consent steps, so driving the web form
(`common/sign-in-google.yaml`) is **best-effort and flaky**. For a reliable
signed-in suite, add one of these to the **staging build only**:

- **Auth bypass via launch arg / env** — read a pre-minted session token when a
  `E2E_AUTH_TOKEN` (or similar) launch argument is present, and skip OAuth.
  Then replace the body of `common/sign-in-google.yaml` with a single
  `launchApp` + `arguments:` block or a `${SCHEME}://auth?token=…` deep link.
- **Pre-authenticated build** — ship a build whose session is already persisted
  for each role; then sign-in subflows become no-ops and flows start from
  `launch-keep-state.yaml`.

Until a bypass exists, run the `public` tag in CI and the signed-in tags
locally/manually.

### The auth bypass (implemented)

A dev/test-only bypass now ships in the app so signed-in flows run without
Google OAuth:

- **Server** — a gated `"e2e"` credentials provider in [`convex/auth.ts`](../convex/auth.ts).
  It is only registered when `E2E_AUTH_ENABLED === "true"` (must never be set on
  production) and every call must present `E2E_AUTH_SECRET`. It signs in as any
  `@sow.org.au` email; because roles resolve by email, you get that account's
  real profiles/roles.
- **Client** — a route [`src/app/e2e-auth.tsx`](../src/app/e2e-auth.tsx) that
  handles `theshedmobile://e2e-auth?email=…&secret=…`, signs in, and routes to
  the app. Inert in production (`__DEV__ || EXPO_PUBLIC_E2E==="1"`).
- **Maestro** — [`common/sign-in-e2e.yaml`](common/sign-in-e2e.yaml) opens that
  deep link. The dispatcher [`common/sign-in.yaml`](common/sign-in.yaml) picks
  the bypass automatically when `E2E_SECRET` is set, else falls back to Google.

Run signed-in flows with the bypass:

```bash
maestro test \
  --env APP_ID=au.org.sow.theshed.staging --env SCHEME=theshedmobilestaging \
  --env E2E_SECRET=<the deployment's E2E_AUTH_SECRET> \
  --env STAFF_EMAIL=e2e-staff@sow.org.au \
  --env ADMIN_EMAIL=e2e-admin@sow.org.au \
  .maestro
```

To enable it on a deployment (an **E2E deployment only** — see next section):

```bash
npx convex env set E2E_AUTH_ENABLED true
npx convex env set E2E_AUTH_SECRET "$(openssl rand -hex 24)"
# build the app with EXPO_PUBLIC_E2E=1 (or just use a dev build, where __DEV__ is true)
```

## A dedicated Convex deployment for testing (same data every run)

Yes — the clean way to get identical test data each run is a **separate Convex
deployment** seeded deterministically, so E2E never touches real dev/prod data.

**1. Create an isolated deployment.** Any of:
- a **second dev deployment** (`npx convex dev` under a separate Convex project) —
  simplest;
- a Convex **preview deployment** per branch/PR (fresh each time — ideal for CI);
- a dedicated **prod-style** deployment in its own project (e.g. `the-shed-e2e`).

Point the test build's `EXPO_PUBLIC_CONVEX_URL` / `EXPO_PUBLIC_CONVEX_SITE_URL`
at it, and set `E2E_AUTH_ENABLED=true` + `E2E_AUTH_SECRET` there (and only there).

**2. Seed deterministically.** `convex/devE2E.ts` (a **gitignored, dev-only**
harness — see `.gitignore` and commit `0ed2b17`) exports gated `setup` /
`teardown` internal mutations. `setup` provisions an **isolated** fixture set and
`teardown` removes it and **restores** the org singletons it touched (Finance
head, Budget Manager, threshold) — so a shared deployment's real staff are never
clobbered. Because it's gitignored, regenerate its API bindings once with
`npx convex dev` (or `codegen`) before running it locally.

```bash
npx convex run devE2E:setup              # provision isolated fixtures
# ...run the suite...
npx convex run devE2E:teardown           # remove them + restore singletons
# a specific staff year:
npx convex run devE2E:setup '{"year":2025}'
```

`setup` covers the full fixture set the signed-in flows expect:

- isolated structure: an "E2E Test Division" / "E2E Test Dept" / "E2E Test Campus"
  (real org data is left untouched; Finance head + Budget Manager are repointed
  at test accounts and restored on teardown)
- profiles: Director, admin/HOD, Finance Head (= Budget Manager), plain staff,
  campus leader
- **a request in every lifecycle state** (Awaiting HOD, Awaiting Director [≥
  threshold], Awaiting Receipt, Awaiting Payment, Paid, Declined), owned by the
  staff account so its Mine / the approvers' Review / Finance's Ready-to-Pay are
  all populated
- a preferred bank account, unread notifications (bell counts), a comment thread
- an `[E2E]`-prefixed attendance event with members + roll-call sign-ins, a
  Weekly Meeting tag, and metadata fields
- `e2e-noprofile@sow.org.au` is deliberately left un-profiled → no-profile card

It's verified by the gitignored `convex/devE2E.test.ts` (gating, correct
lifecycle statuses, approval-chain resolution, and snapshot/restore). Extend the
inserts there as the app grows.

**Alternative — snapshot instead of code seed.** For high-fidelity data, curate a
dataset once and reload it each run:

```bash
npx convex export --path e2e-snapshot.zip     # capture a curated dataset
npx convex import --replace e2e-snapshot.zip   # restore before each run (E2E deploy)
```

Snapshots are schema-valid by construction and realistic, but are a binary blob
to maintain; the `setup`/`teardown` code path is easier to review and evolve. Use
whichever fits — many teams do a code seed for structure + a snapshot for bulk
history.

**3. Wire it into a run.** A typical CI/local invocation:

```bash
npx convex run devE2E:setup                          # 1. isolated fixtures
maestro test --env-file .maestro/.env \
  --env E2E_SECRET=$E2E_AUTH_SECRET .maestro           # 2. run against it
npx convex run devE2E:teardown                       # 3. restore singletons
```

## Fixtures the signed-in flows expect

Seed the test backend so these are true for the accounts in `.env`:

- `STAFF_EMAIL` — a plain-staff profile with ≥1 request in **Mine**, one in
  **AWAITING RECEIPT**, a preferred bank account, and access to
  `FOCUS_REQUEST_ID`.
- `APPROVER_EMAIL` — has ≥1 request awaiting their approval in **Review**.
- `FINANCE_EMAIL` — Finance Head with a request in **AWAITING PAYMENT** (Ready
  to Pay) and access to the **All** segment.
- `ADMIN_EMAIL` — admin (Director / HR / Data & IT).
- `CAMPUS_LEADER_EMAIL` — campus-only roles.
- `NOPROFILE_EMAIL` — signed-in account with **no** profile for the current year.

## Targeting notes

The app has almost no `testID`s, so flows target **visible text** and the
~40 `accessibilityLabel`s (e.g. `"Open admin tools"`, `"Submit receipt"`,
`"Nudge approver"`). Where a flow is flaky, the highest-leverage fix is to add a
`testID` in the component and switch the step to `id:`. Regex text matchers
(`.*…`) are used where copy is dynamic; exact strings are used where the
checklist pins them (validation messages, empty states).

## Not automatable here (tracked as `manual`)

Fault injection (optimistic rollback, upload failures, ErrorBoundary),
multi-device real-time sync, scheduled crons (year rollover, receipt purge,
directory sync, stale reminders), push delivery/registration, OS file/photo
pickers, and release-build startup — see the `*.MANUAL.yaml` files and checklist
§12. Several of these are already covered by unit tests
(`convex/contact.test.ts`, `src/lib/attendanceCsv.test.ts`,
`shared/deepLinks.ts`).
