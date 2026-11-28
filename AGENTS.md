# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Project

Expo (RN) + Convex; the same TS serves iOS/Android/web. Node 22, npm only.
Commands are in `README.md` / `package.json`. Checks need no backend
(`convex-test` is in-memory): `npx eslint . --max-warnings 0`, `npx knip`,
`npm run typecheck`, `npm run test:coverage`. CI runs the same four with
coverage thresholds, plus `EXPO_OFFLINE=1 npx expo install --check` and the
web sweep. `npm run lint` (`expo lint`) only covers `src/`, and changing that
script changes the native fingerprint; it moves to the full command with the
next release that needs a store build.

The lint rules encode mistakes that past reviews kept catching; the PR that
added each rule cites them. Fix what a rule reports. When a site
really is the exception, disable the rule on that line with a reason after
`--`; a disable with no reason fails lint.

No formatter runs on this code, and `.prettierignore` turns Prettier off so an
editor's format-on-save can't rewrite a whole file (the music-form merge
reformatted about 20 files it didn't otherwise change). Keep the style of the
file you're editing.

Submitting a reimbursement request needs a Head for its department, a Finance
Head, and a Budget Manager (Admin → "Other"; picker lists Finance members only).

## Feature workflow

1. **Clarify first** — ask the user about anything unclear (scope, UX, edge
   cases, permissions, data) before implementing. Then follow
   `.claude/skills/create-feature/SKILL.md`.
2. **Verify** — `node scripts/verify.mjs` (the `verify` skill,
   `docs/verification.md`): lint, typecheck and unit tests, then each
   affected screen on the iOS Simulator and web with before/after
   screenshots. Drive new interactions by hand with baguette and Playwright.
3. **Open the PR** per `.claude/skills/create-pr/SKILL.md`, and add a link to a
   Netlify HTML explainer (with before/after screenshots when visible) to the
   PR description.
4. **Shepherd the PR** per `.claude/skills/pr-shepherd/SKILL.md` until CI
   and `verify` are green, and for a big PR (see CodeRabbit reviews below)
   CodeRabbit has reviewed the head with nothing left open, then mark it
   ready. `node scripts/pr-status.mjs <number>` says where it stands.

## Versions and the changelog

PRs never change the version. After each merge, `release-version.yml` gives
`main` its next version (`package.json`, both `package-lock.json` version
lines, `app.json`), turns the merged notes into a `## [x.y.z] - date` section
of `CHANGELOG.md`, and pushes that as `chore(release): x.y.z`. The deploys
(dev and prod Convex, EAS Update, dev web) run from that commit, once per
merge, so phones and the Chat post see the new version.

- Write the PR's notes in a new file, `changelog.d/<branch name, / as ->.md`
  (e.g. `changelog.d/feat-more-eye-shapes.md`), in `CHANGELOG.md`'s voice
  under its headings (`### Added`, `### Removed`, `### Changed`,
  `### Fixed`), with no version heading. A file per PR is what keeps PRs from
  conflicting; never edit `CHANGELOG.md`. A merge with no note gets its title
  as the entry.
- Leave the `package.json`, `package-lock.json` and `app.json` versions
  alone, and keep the version out of the PR title and branch name. The number
  isn't known until the PR merges.
- Patch by default. For a minor or major release (only when the user asks),
  start the note with front matter `---`, `bump: minor` (or `major`), `---`.
  Setting the version by hand in all three files, with its own
  `## [x.y.0] - date` section, still works: a merge that raised the version
  itself keeps it, and any earlier merges it overtook before they were
  numbered (and any notes left in `changelog.d/`) go into its section.
- Two merges close together can share one version. If a release run fails
  (say a `changelog.d` note's front matter is wrong), nothing deploys: fix it
  and rerun the run from Actions; it numbers everything merged since the
  last release.

## CodeRabbit reviews

Automatic CodeRabbit reviews are off. Comment `@coderabbitai review` only
when the PR is **big**:

- more than 300 changed lines in app source or Convex code, not counting
  tests, scripts, docs, config, or pure moves, or
- it touches the Convex schema, data deletion or migration, auth or
  permissions, or push or email notification sending.

Do not request a review on any other PR. A commit that only merges `main`
in cleanly, without conflicts and without `main` changing the same files or
functions as the PR, does not need a new review. Non-big PRs are ready once
CI and `verify` are green and no CodeRabbit threads are left open.

## This Mac

- `.env.local` points at the shared Convex **dev** deployment
  (`successful-lynx-56`). Don't use `CONVEX_AGENT_MODE=anonymous` unless the
  user wants an isolated empty backend — it replaces `.env.local`.
- Metro on `http://localhost:8081` — confirm it serves the **current
  worktree**. Worktrees live under `~/GitHub/worktrees/`.
- iOS Simulator app `au.org.sow.theshed`: drive with **baguette** (not `idb`).
- `NETLIFY_AUTH_TOKEN` is in `~/.hermes/.env`.
- Sign-in: Google OAuth, or the dev-only `e2e-auth` bypass when
  `E2E_AUTH_ENABLED` is set (README → Tests). Never enable on prod.
