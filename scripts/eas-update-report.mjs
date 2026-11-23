#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { platformName } from "./lib/easFingerprintGate.mjs";
import { chatMessage, checkUpdate, publishedUpdates, stranded, summaryMarkdown } from "./lib/easUpdateReport.mjs";

const eas = (args) =>
  JSON.parse(
    execFileSync(process.env.EAS_BIN || "eas", [...args, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    })
  );

const git = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const newestStoreBuild = (platform, profile) => {
  const [build] = eas([
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
  return build ?? null;
};

const postToChat = async (message) => {
  const webhookUrl = (process.env.GOOGLE_CHAT_WEBHOOK_URL ?? "").replace(/\s+/g, "");
  if (!webhookUrl) {
    console.log("GOOGLE_CHAT_WEBHOOK_URL is not set, so no Google Chat message was sent.");
    return;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.log(
      `::warning::Couldn't post the EAS Update result to Google Chat: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const run = async () => {
  const updatesFile = process.env.UPDATES_FILE;
  const channel = process.env.CHANNEL || "production";
  const profile = process.env.BUILD_PROFILE || channel;
  const commit = process.env.DEPLOYED_SHA || git(["rev-parse", "HEAD"]);
  const expo = JSON.parse(readFileSync("app.json", "utf8")).expo;
  const project = { owner: expo.owner, slug: expo.slug };

  const updates = updatesFile && existsSync(updatesFile) ? publishedUpdates(readFileSync(updatesFile, "utf8")) : [];
  const checks = updates.map((update) => checkUpdate(update, newestStoreBuild(update.platform, profile)));

  const details = { version: expo.version, channel, commit, project, checks };
  const summary = summaryMarkdown(details);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  await postToChat(
    chatMessage({
      ...details,
      subject: git(["log", "-1", "--format=%s", commit]),
      commitUrl: process.env.COMMIT_URL ?? "",
      runUrl: process.env.RUN_URL ?? "",
    })
  );

  const missing = stranded(checks);
  if (checks.length > 0 && missing.length > 0) {
    for (const check of missing) {
      console.log(
        `::error title=Over-the-air update stranded::${platformName(check.platform)} update runtime ${check.runtime.slice(0, 7)} doesn't match the newest ${profile} store build, ${
          check.buildLabel ?? "none"
        }, so no phone on that build gets it.`
      );
    }
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
