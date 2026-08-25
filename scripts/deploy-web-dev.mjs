import { execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

const DEV_CONVEX_URL = "https://industrious-robin-425.convex.cloud";

const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID_DEV;
if (!VERCEL_PROJECT_ID) {
  throw new Error(
    "VERCEL_PROJECT_ID_DEV is required — set it to the 'the-shed-web-dev' " +
      "project id (Vercel → Project Settings → General).",
  );
}

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

rmSync("dist", { recursive: true, force: true });
run("npx expo export --platform web -c", {
  env: { EXPO_PUBLIC_CONVEX_URL: DEV_CONVEX_URL },
});
cpSync("web", "dist", { recursive: true });
cpSync("web-dev", "dist", { recursive: true });
run("npx vercel deploy . --prod --yes", {
  cwd: "dist",
  env: {
    VERCEL_ORG_ID: "team_BN2cAhJhnaYsx0CBERDsYOeF",
    VERCEL_PROJECT_ID,
  },
});
