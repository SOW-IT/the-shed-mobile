@AGENTS.md

## Merging to `main` is a production release

A PR merged into `main` goes live straight away. Nothing else needs running:

- **Prod web** (<https://theshed.sow.org.au>): published by Vercel's git
  integration (project `the-shed-web`).
- **Prod Convex**: `.github/workflows/convex-deploy.yml` runs `npx convex deploy`.
- **Dev web** (<https://the-shed-web-dev.vercel.app>): `deploy-web-dev.yml`.
- **Phones, JavaScript only**: `eas-update.yml` publishes an over-the-air
  update after the prod Convex deploy, to builds whose native fingerprint
  matches.

A change to native code waits for a store build. EAS builds
(`eas-production.yml`, `eas-staging.yml`) are started by hand, and skip a
platform whose native fingerprint matches its last store build unless
**force** is ticked.
