# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

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
(`convex-test` is in-memory): `npm run lint`, `npm run typecheck`,
`npm run test:coverage` — CI runs the same three with coverage thresholds.

Submitting a reimbursement request needs a Head for its department, a Finance
Head, and a Budget Manager (Admin → "Other"; picker lists Finance members only).

## Feature workflow

1. **Clarify first** — ask the user about anything unclear (scope, UX, edge
   cases, permissions, data) before implementing. Then follow
   `.claude/skills/create-feature/SKILL.md`.
2. **Verify** — run the checks, then exercise the change on the iOS Simulator
   (baguette) and web. Take before/after screenshots of UI changes.
3. **Open the PR** per `.claude/skills/create-pr/SKILL.md`, and add a link to a
   Netlify HTML explainer (with before/after screenshots when visible) to the
   PR description.
4. **Babysit the PR** until merged or told to stop — fix failing CI, address
   every review comment (fix or reply), re-verify UI changes on sim + web.

## This Mac

- `.env.local` points at the shared Convex **dev** deployment
  (`successful-lynx-56`). Don't use `CONVEX_AGENT_MODE=anonymous` unless the
  user wants an isolated empty backend — it replaces `.env.local`.
- Metro on `http://localhost:8081` — confirm it serves the **current
  worktree**. Worktrees live under `/Users/xtectra/GitHub/worktrees/`.
- iOS Simulator app `au.org.sow.theshed`: drive with **baguette** (not `idb`).
- `NETLIFY_AUTH_TOKEN` is in `~/.hermes/.env`.
- Sign-in: Google OAuth, or the dev-only `e2e-auth` bypass when
  `E2E_AUTH_ENABLED` is set (`.maestro/README.md`). Never enable on prod.
