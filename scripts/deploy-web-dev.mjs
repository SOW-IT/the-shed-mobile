// Exports the web build against the DEV/STAGING Convex deployment and publishes
// it to the separate Vercel project `the-shed-web-dev`
// (https://the-shed-web-dev.vercel.app). This mirrors deploy-web.mjs, which
// targets prod (`the-shed-web` + the prod Convex deployment).
//
// The CONVEX URL is baked into the JS bundle at export time, so the dev site
// must be its OWN build — a separate Vercel project is the cleanest way to keep
// the dev (industrious-robin-425) and prod (outgoing-stoat-395) bundles apart.
//
// Run in CI on every push to main (see .github/workflows/deploy-web-dev.yml),
// or locally via `npm run deploy:web:dev`.
import { execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

// Dev/staging Convex deployment — same one the EAS preview/staging profiles use.
const DEV_CONVEX_URL = "https://industrious-robin-425.convex.cloud";

// The dev Vercel project differs from prod's. Its id isn't hardcoded because the
// project is created in the Vercel dashboard; the GitHub Action supplies it from
// the VERCEL_PROJECT_ID_DEV repo secret.
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID_DEV;
if (!VERCEL_PROJECT_ID) {
  throw new Error(
    "VERCEL_PROJECT_ID_DEV is required — set it to the 'the-shed-web-dev' " +
      "project id (Vercel → Project Settings → General).",
  );
}

// The Vercel CLI reads VERCEL_TOKEN from the environment to deploy
// non-interactively; without it the deploy step would prompt or fail with an
// opaque auth error in CI. Fail fast with a clear message instead.
if (!process.env.VERCEL_TOKEN) {
  throw new Error(
    "VERCEL_TOKEN is required — create one at https://vercel.com/account/tokens " +
      "(the GitHub Action passes it from the VERCEL_TOKEN repo secret).",
  );
}

const run = (command, options = {}) =>
  execSync(command, {
    stdio: "inherit",
    ...options,
    env: { ...process.env, ...(options.env ?? {}) },
  });

// Start from a clean dist/ so a stale local build can't leak removed assets
// into the deploy. -c clears Metro's cache; a real env var outranks .env files
// in Expo's loading order, so the dev URL wins.
rmSync("dist", { recursive: true, force: true });
run("npx expo export --platform web -c", {
  env: { EXPO_PUBLIC_CONVEX_URL: DEV_CONVEX_URL },
});
// Layer static files: shared first (web/), then dev-specific overrides
// (web-dev/). web-dev/.well-known/ contains the staging app's assetlinks.json
// and apple-app-site-association so Android App Links and iOS Universal Links
// verify against the-shed-web-dev.vercel.app instead of the prod domain.
cpSync("web", "dist", { recursive: true });
cpSync("web-dev", "dist", { recursive: true });
// Explicit project env vars: the CLI then needs no .vercel link files (the
// export wipes them) and can't resolve some other project from a parent dir.
// VERCEL_TOKEN (from the environment) authenticates the non-interactive deploy.
run("npx vercel deploy . --prod --yes", {
  cwd: "dist",
  env: {
    VERCEL_ORG_ID: "team_BN2cAhJhnaYsx0CBERDsYOeF",
    VERCEL_PROJECT_ID,
  },
});
