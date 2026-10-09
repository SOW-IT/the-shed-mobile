@AGENTS.md

## Merging to `main` is a production release

A PR merged into `main` goes live straight away. Nothing else needs running:

- **Prod web** (<https://theshed.sow.org.au>): published by Vercel's git
  integration (project `the-shed-web`).
- **Prod Convex**: `.github/workflows/convex-deploy.yml` runs `npx convex deploy`.
- **Dev web** (<https://the-shed-web-dev.vercel.app>): `deploy-web-dev.yml`.

Only the phone apps wait. EAS builds (`eas-production.yml`, `eas-staging.yml`)
are started by hand, so a new screen reaches phones only after a store build.
