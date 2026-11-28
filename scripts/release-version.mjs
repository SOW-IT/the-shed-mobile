#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  appJsonVersion,
  awaitsRelease,
  changelogVersions,
  largestBump,
  nextVersion,
  packageJsonVersion,
  parseFragment,
  releaseChangelog,
  setAppJsonVersion,
  setPackageJsonVersion,
  setPackageLockVersion,
  sydneyDate,
} from "./lib/releaseVersion.mjs";

const FRAGMENT_DIR = "changelog.d";
// changelog.d/README.md says how to write a note; it is never one.
const isFragment = (name) => name.endsWith(".md") && name !== "README.md";
const MAX_UNRELEASED = 50;

// CHANGELOG.md is already 400 KB; Node's default 1 MiB would soon cut it off.
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });

const exists = (ref, file) => {
  try {
    git("cat-file", "-e", `${ref}:${file}`);
    return true;
  } catch {
    return false;
  }
};

// null only when the file isn't there; any other failure (a huge file, a bad
// ref) throws rather than quietly passing as "no file".
const fileAt = (ref, file) => (exists(ref, file) ? git("show", `${ref}:${file}`) : null);

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

const RELEASE_SUBJECT = "chore(release): ";

// The workflow's own commits. A release that completes a manual bump's section
// keeps the version, so the subject is what marks it as numbered.
const isReleaseCommit = (ref) => git("log", "-1", "--format=%s", ref).startsWith(RELEASE_SUBJECT);

const pendingAt = (ref) =>
  hasParent(ref) && !isReleaseCommit(ref) && awaitsRelease(versionAt(ref), versionAt(`${ref}^`));

/** The merges from `start` back that are still waiting for a number, oldest first. */
const unreleasedCommits = (start) => {
  const commits = [];
  if (!hasParent(start)) return commits;
  let ref = git("rev-parse", start).trim();
  while (commits.length < MAX_UNRELEASED && pendingAt(ref)) {
    commits.unshift(ref);
    if (!hasParent(ref)) break;
    ref = git("rev-parse", `${ref}^`).trim();
  }
  return commits;
};

const wroteNotes = (sha) =>
  git("diff", "--name-only", `${sha}^`, sha)
    .split("\n")
    .some((file) => file === "CHANGELOG.md" || (file.startsWith(`${FRAGMENT_DIR}/`) && isFragment(path.basename(file))));

// Every note file under changelog.d, nested ones too (a branch name whose `/`
// wasn't turned into `-`), so what counts as writing notes above and what
// gets released here agree.
const fragmentFiles = () =>
  existsSync(FRAGMENT_DIR)
    ? readdirSync(FRAGMENT_DIR, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && isFragment(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort()
    : [];

const output = (values) => {
  for (const [key, value] of Object.entries(values)) console.log(`${key}=${value}`);
};

const subjectOf = (sha) => git("log", "-1", "--format=%s", sha).trim();

const release = (date) => {
  const fragments = fragmentFiles().map((file) => ({ file, ...parseFragment(readFileSync(file, "utf8"), file) }));
  const currentChangelog = readFileSync("CHANGELOG.md", "utf8");
  const headPending = pendingAt("HEAD");
  let commits;
  let version;
  let bump;

  if (headPending) {
    commits = unreleasedCommits("HEAD");
    bump = largestBump(fragments.map((fragment) => fragment.bump));
    version = nextVersion(
      bump,
      versionAt("HEAD"),
      versionAt("HEAD^"),
      packageJsonVersion(readFileSync("package.json", "utf8")),
      ...changelogVersions(currentChangelog)
    );
  } else {
    // HEAD is a release commit, or a merge that set its own version. Merges
    // below a manual bump that were never numbered (the bump merged before
    // their run), and any notes left behind, go into the manual version's
    // section, so none are orphaned for a later release.
    commits = isReleaseCommit("HEAD") || !hasParent("HEAD") ? [] : unreleasedCommits("HEAD^");
    version = versionAt("HEAD");
    if (isReleaseCommit("HEAD") || (commits.length === 0 && fragments.length === 0)) {
      console.log(`HEAD already carries its own version (${version}), so there is nothing to release.`);
      output({ released: "false" });
      return;
    }
    bump = "manual";
    console.log(
      `HEAD set its own version (${version}); its section takes ${commits.length} earlier merge(s) and ${fragments.length} note(s) still waiting for one.`
    );
  }

  const changelog = releaseChangelog({
    changelog: currentChangelog,
    parentChangelog: fileAt(`${commits[0] ?? "HEAD"}^`, "CHANGELOG.md"),
    version,
    date,
    fragments: fragments.map((fragment) => fragment.notes),
    fallbackSubjects: commits.filter((sha) => !wroteNotes(sha)).map(subjectOf),
  });

  if (headPending) {
    writeFileSync("package.json", setPackageJsonVersion(readFileSync("package.json", "utf8"), version));
    writeFileSync("package-lock.json", setPackageLockVersion(readFileSync("package-lock.json", "utf8"), version));
    writeFileSync("app.json", setAppJsonVersion(readFileSync("app.json", "utf8"), version));
  }
  writeFileSync("CHANGELOG.md", changelog);
  for (const { file } of fragments) rmSync(file);

  output({ released: "true", version, bump, commits: commits.join(" ") });
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
