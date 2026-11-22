---
name: verify
description: >-
  Check a branch of The Shed Mobile the way a reviewer would, with one
  command: lint, typecheck and unit tests, then each affected screen on web
  (Playwright) and the iOS Simulator (Maestro) against a throwaway local
  Convex backend, with before and after screenshots. Use before opening or
  updating a PR, after each round of review fixes, or when asked to verify,
  screenshot or smoke-test a change.
---

# Verify a change

`docs/verification.md` is the reference: tiers, feature map, setup and
teardown, artifacts. This skill is the procedure.

## 1. Read the plan

```bash
node scripts/verify.mjs --dry-run
```

It prints the tier (`static`, `scoped`, `full` or `blocked`), the files that
chose it and every step it will run. Read it before running anything.

## 2. If it says `blocked`, fix the map

`blocked` means a changed file matches no rule in
`scripts/verify/feature-map.json`. Classify each listed file. Don't use
`--unattended` to get past it.

| The file… | Put it in |
| --- | --- |
| belongs to a screen or feature the map already has | that area's `files` |
| is a new screen or feature | a new area with its `routes` (seed holes like `{eventId}` come from `scripts/sweep-seed.mjs`) |
| changes navigation, auth, schema, the design system, deps or native config | `core` |
| changes nothing a person sees (docs, tooling, ops scripts, tests) | `static` |
| is billing or plans | an area with `"unitOnly": true` |

Commit the map change with the work, rerun `--dry-run`, and list each map
addition in the PR report. `npx vitest run scripts/lib/verifyPlan.test.mjs`
fails while any tracked file is unmapped, so CI catches a map that fell
behind.

## 3. Run it

```bash
node scripts/verify.mjs --publish
```

- It exits non-zero when any step fails. Read `summary.md` and the logs under
  `.verify/artifacts/<branch>/logs/`, fix the cause and rerun. A failure in a
  **before** step is a warning: the base is broken there, not this branch.
- `--publish` pushes the screenshots to the `verification-artifacts` branch,
  with a `README.md` there showing every pair, and writes `screenshots.md`
  (the same rows, for a PR description) and `screenshots-url.txt` (the link to
  the README). Paste the rows for the screens the change touches and link
  the rest. A PR description can't hold all of them.
- Other options: `--only <area|/route>`, `--full`, `--no-before`, `--no-web`,
  `--no-ios`, `--device <name>`, `--app <path.app>`. Android never runs.
- Never pass `--unattended` from an interactive session. It exists for CI and
  for runs nobody is watching.

## 4. Look at the screenshots

A passing step means no crash screen, no page error and no red box. It
doesn't mean the screen is right. Open every after screenshot for the areas
the diff touches and compare it with its before. Say in the PR what you
looked at.

## 5. Report

The PR description needs:

- what changed and why, in plain words;
- the `summary.md` step table (tier, reasons, each step and its result);
- the `screenshots.md` table for every screen the change affects;
- feature-map additions, if any;
- what wasn't verified (interactions the route flows don't drive, such as
  submitting a form), and how you checked them instead.

## Rules

- Only `node scripts/verify.mjs` starts and stops these processes. Never
  `pkill` by name. Other sessions on this Mac run their own Metro, Convex and
  Maestro. `--clean` stops what an earlier run of this script left behind.
- Ports belong to this repo: Convex 3270/3271, Metro 8092, web 8192.
  Daniel's Metro on 8081 is not ours. The simulator is `iPhone 17 Pro`.
- One run drives screens at a time on this Mac. When another worktree's run
  has the lock, verify says whose it is and waits its turn by itself. Just
  start it. Don't wait with `pgrep`, `ps | grep` or a loop of your own: two
  `pgrep -f` waiters once matched each other's shell text and waited
  forever. A lock left by a run that was killed outright is taken over once its
  pid has exited.
- If something other than a verify run holds a port, set
  `VERIFY_CONVEX_PORT`, `VERIFY_CONVEX_SITE_PORT`, `VERIFY_METRO_PORT` and
  `VERIFY_WEB_PORT` to free ports.
- The backend is local and seeded fresh every run. Don't point a run at the
  shared dev deployment, and never at prod.
- Don't add `npm run verify`. A change to `package.json` scripts changes the
  native fingerprint and stops over-the-air updates until a store build.
