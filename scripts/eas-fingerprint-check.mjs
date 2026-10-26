#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import {
  buildFingerprint,
  decidePlatform,
  easPlatformArg,
  platformName,
  requestedPlatforms,
  skipNotice,
  submissionFinished,
  summaryMarkdown,
  updateCommit,
} from "./lib/easFingerprintGate.mjs";

const profile = process.argv[2];
if (!profile) {
  console.error("Usage: node scripts/eas-fingerprint-check.mjs <build profile>");
  process.exit(1);
}

const eas = (args) =>
  JSON.parse(
    execFileSync(process.env.EAS_BIN || "eas", [...args, "--json"], {
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
  const commit = process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const channel = JSON.parse(readFileSync("eas.json", "utf8")).build?.[profile]?.channel;
  if (!channel) throw new Error(`eas.json has no channel for the ${profile} build profile.`);

  let submissions;
  const recentSubmissions = () => (submissions ??= eas(["status", "--limit", "25", "--non-interactive"]).submissions ?? []);

  const publishedCommit = (platform, runtimeVersion) => {
    try {
      const page = eas([
        "update:list",
        "--branch",
        channel,
        "--platform",
        platform,
        "--runtime-version",
        runtimeVersion,
        "--limit",
        "1",
        "--non-interactive",
      ]);
      const group = page?.currentPage?.[0]?.group;
      return group ? updateCommit(eas(["update:view", group]), platform) : null;
    } catch (error) {
      console.log(
        `::warning::Couldn't read ${channel} updates for ${platformName(platform)}, so it will be built: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  };

  const decisions = requestedPlatforms(process.env.PLATFORM_INPUT).map((platform) => {
    const current = eas(["fingerprint:generate", "--platform", platform, "--build-profile", profile, "--non-interactive"]).hash;
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
      "--non-interactive",
    ]);
    const matches = Boolean(lastBuild) && buildFingerprint(lastBuild) === current;
    return decidePlatform({
      platform,
      current,
      lastBuild,
      submitted: matches && submissionFinished(recentSubmissions(), lastBuild.id),
      publishedCommit: matches ? publishedCommit(platform, current) : null,
      commit,
      force,
    });
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
