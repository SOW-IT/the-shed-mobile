---
name: create-feature
description: >-
  Start and ship a feature on this Mac for The Shed Mobile — worktree/branch,
  implement against local Metro + baguette simulator, run CI checks, then hand
  off to create-pr. Use when the user asks to build a feature, start a fix,
  "work on", or set up a branch for new work on this machine.
---

# Create a feature (local Mac)

End-to-end feature workflow on this Mac. Mirror the cloud agent loop: isolated
branch, verify against running services, then open a PR via the `create-pr`
skill.

## 0. Preconditions (already set up here)

| Piece | Expectation |
| --- | --- |
| Node | 22 + npm (`package-lock.json` only) |
| Deps | `node_modules` present; `npm install` if a fresh worktree |
| Convex | Shared cloud **dev** deployment via `.env.local` (`EXPO_PUBLIC_CONVEX_*`). Do **not** use `CONVEX_AGENT_MODE=anonymous` on this Mac unless the user asks for an isolated local backend. |
| Metro | `http://localhost:8081` — usually `expo start --dev-client`. Restart from **this worktree** if the wrong tree is serving. |
| Simulator | iOS sim with **The SHED** (`au.org.sow.theshed`); drive with **baguette** |
| Chrome | Open Expo web at `http://localhost:8082` for web smoke |
| Netlify | `NETLIFY_AUTH_TOKEN` in `~/.hermes/.env` for phone HTML explain pages |
| Checks | `npm run lint`, `npm run typecheck`, `npm test` / `npm run test:coverage` (no backend required) |

Read `AGENTS.md` (Expo v58 docs link + Convex guidelines + Mac section) before
coding. For Convex API patterns, read `convex/_generated/ai/guidelines.md` first.

## 1. Branch / worktree

Never implement on `main`. Prefer an isolated worktree under
`~/GitHub/worktrees/`:

```bash
git fetch origin main --prune
git worktree add -b feat/<slug> \
  ~/GitHub/worktrees/the-shed-mobile-<slug> \
  origin/main
cd ~/GitHub/worktrees/the-shed-mobile-<slug>
npm install   # if node_modules missing
```

Branch names: `feat/<slug>`, `fix/<slug>`, optionally with version
(`feat/1.8.9-whatever`). Keep unrelated WIP out of the branch.

If already inside a feature worktree, stay there — do not bounce to the main
checkout at `~/GitHub/the-shed-mobile`.

## 2. Implement

- Match existing patterns (Expo Router under `src/app`, Convex under `convex/`,
  shared helpers, theme).
- New Convex/shared behavior needs tests — `test:coverage` thresholds will fail
  CI otherwise.
- User-facing copy and changelog voice: plain English, behavior-first (see
  `CHANGELOG.md`).
- Do not bump version / changelog until ready to open the PR (`create-pr` skill).

## 3. Verify while building

```bash
npm run lint
npm run typecheck
npm test                 # or npm run test:coverage before PR
```

**UI (when the change is visible):** `node scripts/verify.mjs --only <area>`
opens that area's screens on web and the simulator with screenshots (see the
`verify` skill). For interactions, drive the simulator with baguette and web
with Playwright. Point Metro at this worktree first
(`curl -s http://localhost:8081/status`; restart from the worktree if needed).

## 4. Ship

When the feature is done, follow the **`create-pr`** skill. That skill
**requires baguette + web verification before `gh pr create`** (CI alone is
not enough). It also covers version bump, changelog, coverage, and the
Netlify phone explain page.

Do not open a PR with failing lint/typecheck/coverage, and do not skip the
create-pr verification section for UI or runtime behavior changes.
