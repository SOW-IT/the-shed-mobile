---
name: create-pr
description: Prepare and open a PR for a finished feature or fix — bump the patch version, update the changelog, run the CI checks locally (including the coverage test), then create the GitHub PR. Use when the user asks to "make a PR", "open a PR", "ship this", or a feature is done and ready for review.
---

# Create a PR for The Shed Mobile

Release prep + PR creation for this repo. Follow the steps in order; stop and
report if any step fails rather than opening a PR with failing checks.

## 0. Preconditions

- Work must be committed on a feature branch, **not** `main`. Branch naming
  convention: `feat/<slug>` or `fix/<slug>`, optionally with the version
  (e.g. `feat/1.7.0-public-home`, `fix/role-filter-custom-roles`). If work is
  sitting on `main`, create a branch first and move the commits there.
- Working tree should contain only changes that belong in this PR. If there
  are unrelated modifications, ask the user what to include.

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

## 4. Commit the release prep

Commit the version bump + changelog (and any test fixes) on the feature
branch. Release-prep commit style used in this repo: `chore(release): vX.Y.Z`.

## 5. Open the PR

```bash
git push -u origin <branch>
gh pr create --title "<title>" --body "<body>"
```

- **Title convention:** conventional-commit prefix + summary + version in
  parentheses, matching history:
  - `feat: public Home tab + open org chart, staff tools behind sign-in (1.7.0)`
  - `fix: attendance filter/search gaps for values outside the built-in sets (1.6.13)`
- **Body:** summarize what changed and why (the changelog entry is a good
  base), list user-visible changes, and note test coverage added. There is no
  PR template.
- Base branch is `main`.

## 6. Report back

Give the user the PR URL, the new version number, and the local check results
(lint / typecheck / coverage all passing). Mention that CI will re-run the
same checks on the PR.
