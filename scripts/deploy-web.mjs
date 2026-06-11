// Exports the web build against the PROD Convex deployment and publishes it
// to Vercel. (Local dev — `npm run web` — keeps using .env.local's dev URL.)
import { execSync } from "node:child_process";
import { cpSync } from "node:fs";

const PROD_CONVEX_URL = "https://outgoing-stoat-395.convex.cloud";

const run = (command, options = {}) =>
  execSync(command, {
    stdio: "inherit",
    ...options,
    env: { ...process.env, ...(options.env ?? {}) },
  });

// A real environment variable outranks every .env file in Expo's loading
// order; -c clears Metro's cache, which otherwise keeps the old inlined URL.
run("npx expo export --platform web -c", {
  env: { EXPO_PUBLIC_CONVEX_URL: PROD_CONVEX_URL },
});
cpSync("web", "dist", { recursive: true });
// Explicit project env vars: the CLI then needs no .vercel link files (the
// export wipes them) and can't resolve some other project from a parent dir.
run("npx vercel deploy . --prod --yes", {
  cwd: "dist",
  env: {
    VERCEL_ORG_ID: "team_BN2cAhJhnaYsx0CBERDsYOeF",
    VERCEL_PROJECT_ID: "prj_GDhatLychoCm4yRy8b152beusHBE",
  },
});
