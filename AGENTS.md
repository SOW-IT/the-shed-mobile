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
(`convex-test` is in-memory): `npx eslint . --max-warnings 0`,
`npm run typecheck`, `npm run test:coverage`. CI runs the same three with
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
   is green, CodeRabbit has nothing open and `verify` passes, then mark it
   ready. `node scripts/pr-status.mjs <number>` says where it stands.

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
