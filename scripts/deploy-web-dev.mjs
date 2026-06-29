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
import { cpSync } from "node:fs";

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

const run = (command, options = {}) =>
  execSync(command, {
    stdio: "inherit",
    ...options,
    env: { ...process.env, ...(options.env ?? {}) },
  });

// A real environment variable outranks every .env file in Expo's loading
// order; -c clears Metro's cache, which otherwise keeps the old inlined URL.
run("npx expo export --platform web -c", {
  env: { EXPO_PUBLIC_CONVEX_URL: DEV_CONVEX_URL },
});
cpSync("web", "dist", { recursive: true });
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
