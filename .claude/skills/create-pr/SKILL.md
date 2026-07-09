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
  the main checkout at `/Users/xtectra/GitHub/the-shed-mobile` is the branch
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
  `## [X.Y.Z] — YYYY-MM-DD` (em dash, today's date).
- If `## [Unreleased]` already has entries, move them into the new section.
- Group entries under `### Added` / `### Changed` / `### Fixed` (only the
  headings you need, in that order).
- Write entries in the file's voice: **bold user-facing summary sentence**,
  followed by plain-English detail of what changed and why. Describe behavior
  from the user's point of view, not the implementation diff.
- Leave an empty `## [Unreleased]` section at the top.

## 3. Run the CI checks locally

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, and the
coverage test — run all three locally before opening the PR:

```bash
npm run lint
npx tsc --noEmit
npm run test:coverage
```

`test:coverage` enforces thresholds (100% lines, 92% branches on the covered
convex/shared suite) — a new backend function without tests **will fail CI**,
not just lower a number. If any check fails, fix it (add tests for new
convex/shared code) and rerun. Do not open the PR until all three pass.

## 4. Verify on this Mac before opening the PR (required)

CI + unit tests are necessary but **not sufficient**. Before `gh pr create`,
exercise the change the way a reviewer would: baguette on the sim and/or web.

### 4a. Point Metro at this worktree

```bash
curl -s http://localhost:8081/status   # expect packager-status:running
# If wrong tree / stale: from THIS worktree
npx expo start --dev-client --port 8081 --clear
```

For a dedicated web smoke (avoids fighting the native dev client), also:

```bash
npx expo start --web --port 8082
```

### 4b. Native — baguette + simulator

- Prefer **baguette** over `idb` (see `.maestro/README.md`).
- `baguette list` → use the `Booted` sim (The SHED: `au.org.sow.theshed`).
- Tap API needs screen points + size, e.g.:

```bash
UDID=$(baguette list | rg Booted | head -1 | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["udid"])')
baguette tap --udid "$UDID" --x <x> --y <y> --width 390 --height 844
xcrun simctl io "$UDID" screenshot /tmp/pr-verify/sim-<screen>.png
```

- Walk the screens the PR touches (and a quick adjacent smoke: Home / Requests /
  Insights / Org / Admin as relevant). Reload after JS changes.
- Capture screenshots of the paths you actually hit.

### 4c. Web — Chrome / Playwright

- Prefer Playwright for reliable screenshots of RN-web (headless Chrome
  `--screenshot` often captures a blank compositor frame):

```bash
npx --yes playwright screenshot --wait-for-timeout=8000 \
  --viewport-size=1280,900 \
  "http://localhost:8082" /tmp/pr-verify/web-home.png
```

- Optional signed-in smoke: e2e-auth when `E2E_AUTH_ENABLED` is set on the
  deployment — see `.maestro/README.md`. Never enable that bypass on prod.
- Do **not** print `E2E_AUTH_SECRET` or Netlify tokens in chat or HTML.

### 4d. What to record

In the PR body (and Netlify explain page), be honest:

| Bucket | Examples |
| --- | --- |
| **Verified** | lint/typecheck/coverage; baguette screens hit; web screenshot; specific behavior observed |
| **Not verified** | Oct 1 cron dry-run, Maestro suite, paths you did not open |
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

## 8. Report back

Give the user:

1. PR URL + new version  
2. Local CI results (lint / typecheck / coverage)  
3. What baguette / web verified (and screenshots or Netlify link)  
4. What was **not** verified  

Mention that GitHub CI will re-run the same automated checks on the PR.
