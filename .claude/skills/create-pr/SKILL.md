---
name: create-pr
description: >-
  Prepare and open a PR for The Shed Mobile — version bump, changelog, CI
  checks, required baguette + web verification, GitHub PR, and phone-friendly
  Netlify HTML explain page. Use when the user asks to "make a PR", "open a PR",
  "ship this", explain a PR for phone, or verify UI before sending a PR.
---

# Create a PR for The Shed Mobile

Release prep + PR creation for this repo. Follow the steps in order; stop and
report if any step fails rather than opening a PR with failing checks.

For starting the feature (branch/worktree, implement), use the `create-feature`
skill first; this skill is the ship step.

**Do not open the PR until §4 local verification is done** (or explicitly
skipped with a written reason). CI alone is not enough — this Mac has baguette
+ Metro/web; use them before sending the PR out for review.

## 0. Preconditions

- Work must be committed on a feature branch, **not** `main`. Branch naming
  convention: `feat/<slug>` or `fix/<slug>`, optionally with the version
  (e.g. `feat/1.7.0-public-home`, `fix/role-filter-custom-roles`). If work is
  sitting on `main`, create a branch first and move the commits there.
- Working tree should contain only changes that belong in this PR. If there
  are unrelated modifications, ask the user what to include.
- Prefer the **current worktree** for the change under review. Do not assume
  the main checkout at `~/GitHub/the-shed-mobile` is the branch
  being shipped — base Metro / emulator / verification on this worktree.

## 1. Bump the patch version

The marketing version lives in **three places that must stay in sync**:
`package.json`, `package-lock.json`, and `app.json` (`expo.version`).
The EAS build number auto-increments separately — never touch it.

```bash
npm version patch --no-git-tag-version   # updates package.json + package-lock.json
```

Then edit `app.json` → `expo.version` to the same new version.

Default is a **patch** bump (this repo ships features as patches too — see
1.6.4/1.6.14). Only bump minor when the user asks or the change is a major
user-facing milestone (like 1.6.0 Insights, 1.7.0 public app) — confirm first.

## 2. Update CHANGELOG.md

Format follows the existing file exactly:

- Insert a new section under `## [Unreleased]`:
  `## [X.Y.Z] - YYYY-MM-DD` (hyphen, today's date).
- If `## [Unreleased]` already has entries, move them into the new section.
- Group entries under `### Added` / `### Removed` / `### Changed` /
  `### Fixed` (only the headings you need, in that order).
- Write entries in the file's voice: **bold user-facing summary sentence**,
  followed by plain-English detail of what changed and why. Describe behavior
  from the user's point of view, not the implementation diff.
- Leave an empty `## [Unreleased]` section at the top.

## 2b. Keep the docs true (required)

The docs drift because nothing checks them. These four claims go stale every
time we ship, so re-read them against **this** change before moving on:

- **`README.md` → "What's in it"** — did this PR add or remove a whole area?
  Smaller changes belong in `CHANGELOG.md`, not here.
- **`README.md` → CI/CD table** — did this PR add, rename or delete anything in
  `.github/workflows/`? The table names files; a rename makes it a lie. Check
  with `ls .github/workflows/`.
- **`LAUNCH.md`** — did this PR finish something listed under "Still
  outstanding", or newly require a credential, env var or dashboard step? Delete
  completed items and put the evidence that proves them in the PR body.
- **`CONTEXT-MAP.md` and `docs/context/*.md`** — did this PR introduce a domain
  term, or use an existing one in a new way? New vocabulary belongs in the
  glossary for its context while it is still fresh. If the change is a decision
  that is hard to reverse, surprising without context, and the result of a real
  trade-off, add an ADR under `docs/adr/` (next number, see existing files).

None of this is optional-if-busy: a PR that changes behaviour and no docs is
the normal way the drift happens.

## 3. Run the CI checks locally

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, the
coverage test and the offline Expo version check (plus a web sweep job). Run
these locally before opening the PR:

```bash
npx eslint . --max-warnings 0   # not `npm run lint`, which only lints src/
npx knip
npx tsc --noEmit
npm run test:coverage
EXPO_OFFLINE=1 npx expo install --check
```

`test:coverage` enforces thresholds (100% lines, 92% branches on the covered
convex/shared suite) — a new backend function without tests **will fail CI**,
not just lower a number. If any check fails, fix it (add tests for new
convex/shared code) and rerun. Do not open the PR until all three pass.

## 4. Verify on this Mac before opening the PR (required)

CI and unit tests are necessary but **not sufficient**. Run the `verify`
skill (`.claude/skills/verify/SKILL.md`):

```bash
node scripts/verify.mjs --dry-run   # read the tier and steps first
node scripts/verify.mjs --publish   # run it; screenshots go to the verification-artifacts branch
```

It opens every affected screen on web and the iOS Simulator against a
throwaway local backend, before and after, and writes `summary.md` and
`screenshots.md` for the PR body. Route flows open screens; they don't fill in
forms. For every interaction the change adds **or changes** (a message, a
form, a confirmation), drive it by hand with **baguette** on the simulator and
Playwright on web, and record what you saw. If you can't reach it, say so
under "Not verified".

### 4d. What to record

In the PR body (and Netlify explain page), be honest:

| Bucket | Examples |
| --- | --- |
| **Verified** | lint/typecheck/coverage; baguette screens hit; web screenshot; specific behavior observed |
| **Not verified** | Oct 1 cron dry-run, paths you did not open |
| **Ops notes** | deploy footguns, known gaps |

Only skip baguette/web when the PR is pure docs/CI/deps with **no** runtime UI
or backend behavior change — and say so explicitly in the PR body. If the sim
or Metro is down, fix/restart it or ask the user; do not silently ship UI
changes on CI alone.

## 5. Commit the release prep

Commit the version bump + changelog (and any test fixes) on the feature
branch. Release-prep commit style used in this repo: `chore(release): vX.Y.Z`.

## 6. Open the PR

```bash
git push -u origin <branch>
gh pr create --title "<title>" --body "<body>"
```

- **Never open as draft** — ready for review by default (`draft: false` /
  no `--draft`). Only draft if the user explicitly asks.
- **Title convention:** conventional-commit prefix + summary + version in
  parentheses, matching history:
  - `feat: public Home tab + open org chart, staff tools behind sign-in (1.7.0)`
  - `fix: attendance filter/search gaps for values outside the built-in sets (1.6.13)`
- **Body:** summarize what changed and why (changelog is a good base), list
  user-visible changes, note tests added, and include a **Verification**
  section from §4d (what baguette/web showed + what was skipped).
- Base branch is `main`.

## 7. Phone-friendly PR explanation (Netlify HTML)

Publish a mobile-first HTML page the user can open on their phone (same idea
as cloud “explain using HTML”). Include screenshots from §4 when you have them.

### Auth

```bash
set -a && source "$HOME/.hermes/.env" && set +a
# uses NETLIFY_AUTH_TOKEN — never print it
```

### Deploy

1. Write `index.html` in a temp dir (e.g. `/tmp/pr-<n>-explain/`) with: title +
   version, what changed, user-visible bullets, **Verification** (verified /
   not verified), how to try it, PR URL. Large type, short sections.
2. Put screenshots under e.g. `shots/` and reference them relatively.
3. **Always deploy with `--prod`** and hand the user the production HTTPS URL
   — never a draft/unique `https://<hash>--….netlify.app` link. Auth via the
   sourced `NETLIFY_AUTH_TOKEN` env var (do not pass `--auth` on the CLI — it
   exposes the token in the process list):

```bash
# PR-specific explain site (preferred when handing a dedicated URL)
npx --yes netlify-cli deploy \
  --dir /tmp/pr-<n>-explain \
  --site-name the-shed-pr-<n>-explain \
  --no-build \
  --prod

# Or update the shared explain site
npx --yes netlify-cli deploy \
  --dir /tmp/pr-<n>-explain \
  --site the-shed-pr-verify-explain \
  --no-build \
  --prod
```

4. Confirm the **production** URL returns HTTP 200 before handing it to the user
   (e.g. `https://the-shed-pr-<n>-explain.netlify.app`).
5. Give the user the **production HTTPS URL** plus the GitHub PR URL.

## 8. Shepherd it

Follow the `pr-shepherd` skill until the PR is ready (CI and verify green;
a CodeRabbit review only when the PR is big, see AGENTS.md), then report.

## 9. Report back

Give the user:

1. PR URL + new version  
2. Local CI results (lint / typecheck / coverage)  
3. What baguette / web verified (and screenshots or Netlify link)  
4. What was **not** verified  

Mention that GitHub CI will re-run the same automated checks on the PR.
