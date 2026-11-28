@AGENTS.md

## Merging to `main` is a production release

A PR merged into `main` goes live straight away. Nothing else needs running:

- **Prod web** (<https://theshed.sow.org.au>): published by Vercel's git
  integration (project `the-shed-web`).
- **Prod Convex**: `.github/workflows/convex-deploy.yml` runs `npx convex deploy`.
- **Dev Convex** (`successful-lynx-56`, used by the staging app and dev web):
  `convex-deploy-dev.yml`, with the `CONVEX_DEPLOY_KEY_DEV` secret. Sending a
  branch to the staging app? Run that workflow from the branch too, or the app
  may call functions dev doesn't have.
- **Dev web** (<https://the-shed-web-dev.vercel.app>): `deploy-web-dev.yml`.
- **Phones, JavaScript only**: `eas-update.yml` publishes an over-the-air
  update after the prod Convex deploy, to builds whose native fingerprint
  matches, then raises the update policy's `latestOta` to it so phones on
  older versions that ask about over-the-air updates restart into it. The
  recommended and minimum versions (the store prompt) are only set by hand.

A change to native code waits for a store build. EAS builds
(`eas-production.yml`, `eas-staging.yml`) are started by hand, and skip a
platform whose native fingerprint matches its last store build unless
**force** is ticked.

The fingerprint also hashes `package.json` → `scripts` and the root
`.gitignore`, so editing either cuts phones off from over-the-air updates
until the next store build. `node scripts/verify.mjs` reports when a branch
changes the fingerprint.

## Every PR is shepherded to green

After opening a PR, follow `.claude/skills/pr-shepherd/SKILL.md`: fix CI at
the root, answer every CodeRabbit comment, wait out its rate limit, rerun
`node scripts/verify.mjs` after each round, then mark the PR ready with a
change report (summary, verification results, before and after
screenshots). Never merge or deploy.
