#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import {
  decidePlatform,
  easPlatformArg,
  platformName,
  requestedPlatforms,
  skipNotice,
  summaryMarkdown,
} from "./lib/easFingerprintGate.mjs";

const profile = process.argv[2];
if (!profile) {
  console.error("Usage: node scripts/eas-fingerprint-check.mjs <build profile>");
  process.exit(1);
}

const eas = (args) =>
  JSON.parse(
    execFileSync(process.env.EAS_BIN || "eas", [...args, "--json", "--non-interactive"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    })
  );

const appendLine = (path, text) => {
  if (path) appendFileSync(path, `${text}\n`);
};

const run = () => {
  const force = process.env.FORCE === "true";
  const decisions = requestedPlatforms(process.env.PLATFORM_INPUT).map((platform) => {
    const current = eas(["fingerprint:generate", "--platform", platform, "--build-profile", profile]).hash;
    const [lastBuild] = eas([
      "build:list",
      "--platform",
      platform,
      "--build-profile",
      profile,
      "--status",
      "finished",
      "--limit",
      "1",
    ]);
    return decidePlatform({ platform, current, lastBuild, force });
  });

  const easPlatform = easPlatformArg(decisions);
  const summary = summaryMarkdown(profile, decisions);
  console.log(summary);
  appendLine(process.env.GITHUB_STEP_SUMMARY, summary);
  for (const decision of decisions.filter((decision) => !decision.build)) {
    console.log(`::notice title=${platformName(decision.platform)} skipped::${skipNotice(profile, decision)}`);
  }
  appendLine(process.env.GITHUB_OUTPUT, `eas_platform=${easPlatform}`);
  if (easPlatform === "none") {
    console.log(`::notice title=Nothing to build::No ${profile} store build needed. Run again with force ticked to build anyway.`);
  }
};

try {
  run();
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
