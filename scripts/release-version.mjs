#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  appJsonVersion,
  awaitsRelease,
  changelogVersions,
  nextPatch,
  packageJsonVersion,
  releaseChangelog,
  setAppJsonVersion,
  setPackageJsonVersion,
  setPackageLockVersion,
  sydneyDate,
} from "./lib/releaseVersion.mjs";

const FRAGMENT_DIR = "changelog.d";
const MAX_UNRELEASED = 50;

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const fileAt = (ref, file) => {
  try {
    return git("show", `${ref}:${file}`);
  } catch {
    return null;
  }
};

const hasParent = (ref) => {
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^`);
    return true;
  } catch {
    return false;
  }
};

const versionAt = (ref) => {
  const text = fileAt(ref, "app.json");
  if (text == null) throw new Error(`app.json is missing at ${ref}.`);
  return appJsonVersion(text);
};

const pendingAt = (ref) => hasParent(ref) && awaitsRelease(versionAt(ref), versionAt(`${ref}^`));

const unreleasedCommits = () => {
  const commits = [];
  let ref = git("rev-parse", "HEAD").trim();
  while (commits.length < MAX_UNRELEASED && pendingAt(ref)) {
    commits.unshift(ref);
    ref = git("rev-parse", `${ref}^`).trim();
  }
  return commits;
};

const wroteNotes = (sha) =>
  git("diff", "--name-only", `${sha}^`, sha)
    .split("\n")
    .some((file) => file === "CHANGELOG.md" || file.startsWith(`${FRAGMENT_DIR}/`));

const fragmentFiles = () =>
  existsSync(FRAGMENT_DIR)
    ? readdirSync(FRAGMENT_DIR)
        .filter((name) => name.endsWith(".md"))
        .sort()
        .map((name) => path.join(FRAGMENT_DIR, name))
    : [];

const output = (values) => {
  for (const [key, value] of Object.entries(values)) console.log(`${key}=${value}`);
};

const release = (date) => {
  if (!pendingAt("HEAD")) {
    console.log(`HEAD already carries its own version (${versionAt("HEAD")}), so there is nothing to release.`);
    output({ released: "false" });
    return;
  }
  const commits = unreleasedCommits();
  const packageJson = readFileSync("package.json", "utf8");
  const currentChangelog = readFileSync("CHANGELOG.md", "utf8");
  const version = nextPatch(
    versionAt("HEAD"),
    versionAt("HEAD^"),
    packageJsonVersion(packageJson),
    ...changelogVersions(currentChangelog)
  );
  const fragments = fragmentFiles();
  const changelog = releaseChangelog({
    changelog: currentChangelog,
    parentChangelog: fileAt(`${commits[0]}^`, "CHANGELOG.md"),
    version,
    date,
    fragments: fragments.map((file) => readFileSync(file, "utf8")),
    fallbackSubjects: commits.filter((sha) => !wroteNotes(sha)).map((sha) => git("log", "-1", "--format=%s", sha).trim()),
  });

  writeFileSync("package.json", setPackageJsonVersion(packageJson, version));
  writeFileSync("package-lock.json", setPackageLockVersion(readFileSync("package-lock.json", "utf8"), version));
  writeFileSync("app.json", setAppJsonVersion(readFileSync("app.json", "utf8"), version));
  writeFileSync("CHANGELOG.md", changelog);
  for (const file of fragments) rmSync(file);

  output({ released: "true", version, commits: commits.join(" ") });
};

const [command, ...args] = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

switch (command) {
  case "pending":
    console.log(String(pendingAt(args[0] ?? "HEAD")));
    break;
  case "version":
    console.log(versionAt(args[0] ?? "HEAD"));
    break;
  case "release":
    release(option("--date") ?? sydneyDate(new Date()));
    break;
  default:
    console.error("Usage: node scripts/release-version.mjs pending [ref] | version [ref] | release [--date YYYY-MM-DD]");
    process.exit(1);
}
