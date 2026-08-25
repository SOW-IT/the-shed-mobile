import { execSync } from "node:child_process";
import { cpSync } from "node:fs";

const PROD_CONVEX_URL = "https://outgoing-stoat-395.convex.cloud";

const run = (command, options = {}) =>
  execSync(command, {
    stdio: "inherit",
    ...options,
    env: { ...process.env, ...(options.env ?? {}) },
  });

run("npx expo export --platform web -c", {
  env: { EXPO_PUBLIC_CONVEX_URL: PROD_CONVEX_URL },
});
cpSync("web", "dist", { recursive: true });
run("npx vercel deploy . --prod --yes", {
  cwd: "dist",
  env: {
    VERCEL_ORG_ID: "team_BN2cAhJhnaYsx0CBERDsYOeF",
    VERCEL_PROJECT_ID: "prj_GDhatLychoCm4yRy8b152beusHBE",
  },
});
