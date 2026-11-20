# Verifying a change

Daniel confirmed the unmapped-file rule, the platforms and the billing rule
on 2026-11-20. The runtimes below are measured where marked.

One command checks a branch the way a reviewer would. It checks only what the
diff can break, and takes before and after screenshots of every screen it
opens:

```bash
node scripts/verify.mjs            # scoped to git diff against origin/main
node scripts/verify.mjs --dry-run  # print the plan and stop
node scripts/verify.mjs --full     # everything, whatever the diff
node scripts/verify.mjs --only calendar      # one area of the feature map
```

It exits non-zero if any step fails. Two steps only warn and never fail the
run: a changed native fingerprint, and a failure while checking the **base**.
A zero exit doesn't mean the fingerprint is unchanged, so read the summary.
The agent skill that drives it is
`.claude/skills/verify/SKILL.md`.

`npm run verify` doesn't exist on purpose. The app's runtime version is its
native fingerprint, and the fingerprint hashes `package.json` → `scripts` and
the root `.gitignore`. Changing either one means phones stop getting
over-the-air updates until the next store build. Add the alias in a release
that already needs a store build.

## How a run is scoped

`scripts/verify/feature-map.json` maps file globs to **areas**. Each area
lists the web routes and iOS routes that show it. The diff (`git diff
--name-only <merge-base>`, plus uncommitted and untracked files) picks one of
three tiers:

| Tier | When | What runs |
| --- | --- | --- |
| **static** | every changed file matches `static` (docs, skills, lint config, CI workflows, tests only) | lint, typecheck, unit tests |
| **scoped** | every code file belongs to an area | lint, typecheck, `vitest related` on the changed files, then each matched area's routes on web and iOS, plus the smoke routes |
| **full** | any file matches `core` (navigation, auth, schema, design system, deps, native config), or `--full` | lint, typecheck, all unit tests with coverage, every route on web (four roles) and iOS |

Scoped and full runs cover iOS and web. Android never runs unless someone
asks for it.

**Billing and plans** (RevenueCat, subscriptions): unit tests only. The plan
output says so whenever a billing file is in the diff. The app has no billing
code today. A future billing area goes in the map with `"unitOnly": true`.

**Unmapped files.** A changed file that matches no rule in the map stops the
run before anything starts, and the script lists those files. Whoever is
running it, usually an agent, classifies each one:

- it belongs to an existing area: add the glob to that area;
- it is a new area: add the area with its routes, and its tests if it has any;
- it is core: add it to `core`;
- it changes nothing a person sees: add it to `static`.

The map change goes in the same branch, and the PR report lists it. Then
rerun `verify`, which picks the tier from the updated map. Unattended runs
(`--unattended`, or `CI` set) can't edit the map. They run the full tier and
report the unmapped files, so the map gets fixed afterwards.

Before running anything, the script prints the tier, the files that decided
it, and the exact steps.

Whenever screens are opened (the scoped and full tiers), the **smoke** routes
run on web and iOS too: the app launches and the signed-out landing page and
Home render.

## Setup and teardown

Everything a run starts lives under `.verify/`, which ignores itself
(`.verify/.gitignore` is `*`). The run:

1. Clears whatever a crashed earlier run left behind. It kills the PIDs
   recorded in `.verify/pids/` and nothing else. Daniel's Metro on 8081 is
   never touched.
2. Starts a fresh local Convex backend from the binary the Convex CLI caches
   (`~/.cache/convex/binaries`), on ports 3270/3271, with its database in
   `.verify/run/<before|after>/convex/`. It doesn't read or write `.env.local`, so the shared
   dev deployment is never used.
3. Pushes the functions, sets JWT keys and `E2E_AUTH_*`, and seeds the sweep
   data (`scripts/sweep-seed.mjs`). Events are seeded around the top of the
   next hour, the same instant for both phases, so their times read the same
   in before and after and in a rerun within the hour.
4. Serves the web app on 8192 and Metro for iOS on 8092, both pointed at the
   local backend.
5. Boots the simulator `iPhone 17 Pro` (`--device` to change it) and waits
   until it can launch apps. Then it terminates the app, empties its data
   container, marks the dev menu as already seen, and opens the app in the
   dev client against Metro. The flow signs out first, which clears the
   session the app keeps in the keychain. The simulator keychain is not
   reset: `simctl keychain reset` left the simulator unable to launch apps.
6. Runs the routes: Playwright (`scripts/sweep.mjs --routes`) on web and, on
   iOS, a Maestro flow generated from the same routes
   (`.verify/run/<before|after>/ios-flow.yaml`). iOS signs in as the admin through
   the `e2e-auth` deep link.

   A screenshot waits until the screen has stopped moving: it keeps taking
   frames until two in a row are identical, up to ten
   (`scripts/lib/stableFrames.mjs`). On iOS the Maestro flow asks verify
   after each frame whether that screen has settled. The simulator's status
   bar reads 9:41 with full signal and battery for the whole run and goes
   back to normal afterwards. A screen still moving after ten frames, like
   one with a spinner, is kept as it was and named in the step's detail.
7. Stops everything it started and frees the ports, even when a step fails.

For **before** screenshots it does the same against the merge base. That
tree comes from `git archive` into a folder under `$TMPDIR` named after the
checkout (`theshed-verify-base-<hash>`), with `node_modules` symlinked, and gets its own fresh backend. Pass `--no-before` to skip it.

## Artifacts

```
.verify/artifacts/<branch>/
  plan.json                    base, merge base, changed files, tier, reasons, routes
  summary.md                   each step and its result
  before/web/<role>-<route>.png
  after/web/<role>-<route>.png
  before/ios/<out|admin>-<route>.png
  after/ios/<out|admin>-<route>.png
  logs/                        before-* and after-* logs: convex, web, sweep, metro, maestro
```

`node scripts/verify.mjs --publish` copies the screenshots to the
`verification-artifacts` branch under `<branch>/`, with a `README.md` there
that shows every pair, so a PR can show them without adding images to
`main`. It also writes `screenshots.md`, the same table with image links that
work in a PR description. Paste the rows for the screens the change touches;
all of them together overflow GitHub's limit on a PR description.
`--publish-only` publishes the last finished run again without rerunning it.

## Requirements on this Mac

- Maestro at `~/.maestro/bin` and Homebrew OpenJDK. The script sets
  `JAVA_HOME` and `PATH` itself.
- A dev-client build of `au.org.sow.theshed` on the simulator. If its native
  code is older than the branch, build one locally with
  `npx expo run:ios --no-bundler`. It goes to the gitignored `ios/`. Never use
  EAS for this.
- Playwright's Chromium (`npx playwright install chromium`).

## Expected runtime (estimates, to be measured)

| Tier | Before + after | After only |
| --- | --- | --- |
| static | 3 to 4 min | same |
| scoped, one area | 8 to 12 min | 5 to 7 min |
| full | 25 to 35 min | 15 to 20 min |

## Still open

- Before and after pairs of an unchanged screen still differ where the
  server writes the time (an attendance sign-in, a request's submission)
  or the app shows a time relative to now ("7m ago"). Both phases seed at
  the same round hour, but the backend stamps writes with the real clock and
  the phases run minutes apart.

- iOS signs in as admin only, while web runs all four roles.
- The scoped tier runs `vitest related`, not the whole suite.
