// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

// Runs scripts/release-version.mjs against a throwaway git repository, the
// way release-version.yml does on main's tip.
const SCRIPT = path.resolve(import.meta.dirname, "../release-version.mjs");

let repo;

const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const write = (file, text) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
};

const read = (file) => readFileSync(path.join(repo, file), "utf8");

const versionFiles = (version) => {
  write("package.json", `{\n  "name": "theshed",\n  "version": "${version}"\n}\n`);
  write(
    "package-lock.json",
    `{\n  "name": "theshed",\n  "version": "${version}",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "theshed",\n      "version": "${version}"\n    }\n  }\n}\n`
  );
  write("app.json", `{\n  "expo": {\n    "name": "The SHED",\n    "version": "${version}"\n  }\n}\n`);
};

const BOT = ["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com"];

const commit = (subject, identity = []) => {
  git("add", "-A");
  git(...identity, "commit", "--quiet", "--allow-empty", "-m", subject);
  return git("rev-parse", "HEAD");
};

const release = () => {
  const out = execFileSync("node", [SCRIPT, "release", "--date", "2026-11-29"], { cwd: repo, encoding: "utf8" });
  return Object.fromEntries(
    out
      .split("\n")
      .filter((line) => /^\w+=/.test(line))
      .map((line) => line.split(/=(.*)/s).slice(0, 2))
  );
};

const run = (command, ref) => execFileSync("node", [SCRIPT, command, ref], { cwd: repo, encoding: "utf8" }).trim();
const pending = (ref) => run("pending", ref);
const folded = (ref) => run("folded", ref);

// What the workflow does after a release that printed released=true.
const commitRelease = (version) => commit(`chore(release): ${version}`, BOT);

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "release-version-"));
  git("init", "--quiet", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  versionFiles("2.14.2");
  write("CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n## [2.14.2] - 2026-11-28\n\n### Changed\n- Old.\n");
  write("changelog.d/README.md", "# Notes\n");
  commit("chore(release): 2.14.2", BOT);
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("release-version.mjs", () => {
  test("numbers a merge with a note and deletes the note", () => {
    write("changelog.d/fix-a.md", "### Fixed\n- **A.** Fixed.\n");
    const merge = commit("fix: a (#1)");
    expect(release()).toEqual({ released: "true", version: "2.14.3", bump: "patch", commits: merge });
    expect(read("app.json")).toContain('"version": "2.14.3"');
    expect(read("CHANGELOG.md")).toContain("## [2.14.3] - 2026-11-29\n\n### Fixed\n- **A.** Fixed.\n\n## [2.14.2]");
    expect(existsSync(path.join(repo, "changelog.d/fix-a.md"))).toBe(false);
    expect(existsSync(path.join(repo, "changelog.d/README.md"))).toBe(true);
    commitRelease("2.14.3");
    expect(release()).toEqual({ released: "false" });
  });

  test("a manual bump that overtakes an unnumbered merge takes its note and posts it", () => {
    write("changelog.d/fix-a.md", "### Fixed\n- **A.** Fixed.\n");
    const normal = commit("fix: a (#1)");
    versionFiles("2.15.0");
    write("CHANGELOG.md", read("CHANGELOG.md").replace("## [Unreleased]\n", "## [Unreleased]\n\n## [2.15.0] - 2026-11-29\n\n### Added\n- **Big.** New.\n"));
    const manual = commit("feat: big (2.15.0) (#2)");
    expect(folded(manual)).toBe("false");

    expect(release()).toEqual({ released: "true", version: "2.15.0", bump: "manual", commits: `${normal} ${manual}` });
    expect(read("app.json")).toContain('"version": "2.15.0"');
    const changelog = read("CHANGELOG.md");
    expect(changelog).toContain("## [2.15.0] - 2026-11-29\n\n### Added\n- **Big.** New.\n\n### Fixed\n- **A.** Fixed.\n\n## [2.14.2]");
    expect(changelog.match(/## \[2\.15\.0\]/g)).toHaveLength(1);
    expect(existsSync(path.join(repo, "changelog.d/fix-a.md"))).toBe(false);

    const release2150 = commitRelease("2.15.0");
    expect(pending(release2150)).toBe("false");
    // The manual bump's own run, if it comes, sees it was already posted.
    expect(folded(manual)).toBe("true");
    expect(folded(normal)).toBe("false");
    expect(release()).toEqual({ released: "false" });
  });

  test("an overtaken merge without a note gets its title in the manual section", () => {
    const normal = commit("chore(deps): bump x (#1)");
    versionFiles("2.15.0");
    const manual = commit("feat: big, version set by hand (#2)");
    expect(release()).toMatchObject({ released: "true", version: "2.15.0", commits: `${normal} ${manual}` });
    expect(read("CHANGELOG.md")).toContain(
      "## [2.15.0] - 2026-11-29\n\n### Changed\n- chore(deps): bump x (#1)\n- feat: big, version set by hand (#2)\n\n## [2.14.2]"
    );
  });

  test("a manual bump with nothing waiting is left as it is", () => {
    versionFiles("2.15.0");
    write("CHANGELOG.md", read("CHANGELOG.md").replace("## [Unreleased]\n", "## [Unreleased]\n\n## [2.15.0] - 2026-11-29\n\n- Big.\n"));
    commit("feat: big (#2)");
    expect(release()).toEqual({ released: "false" });
  });

  test("a manual bump that also left a note gets the note in its own section", () => {
    versionFiles("2.15.0");
    write("changelog.d/feat-big.md", "### Added\n- **Big.** New.\n");
    const manual = commit("feat: big (#2)");
    expect(release()).toEqual({ released: "true", version: "2.15.0", bump: "manual", commits: manual });
    expect(read("CHANGELOG.md")).toContain("## [2.15.0] - 2026-11-29\n\n### Added\n- **Big.** New.");
  });

  test("a note nested under changelog.d is released and deleted, not orphaned", () => {
    write("changelog.d/feat/nested.md", "### Added\n- **Nested.** Found.\n");
    commit("feat: nested (#3)");
    expect(release()).toMatchObject({ released: "true", version: "2.14.3" });
    expect(read("CHANGELOG.md")).toContain("### Added\n- **Nested.** Found.");
    expect(read("CHANGELOG.md")).not.toContain("feat: nested (#3)");
    expect(existsSync(path.join(repo, "changelog.d/feat/nested.md"))).toBe(false);
  });

  test("a pull request merged with a chore(release) title is still numbered", () => {
    write("changelog.d/chore-x.md", "### Changed\n- **X.** Changed.\n");
    const merge = commit("chore(release): tidy the release notes (#5)");
    expect(pending(merge)).toBe("true");
    expect(release()).toMatchObject({ released: "true", version: "2.14.3", commits: merge });
  });

  test("a directory named like a note is not read as one", () => {
    mkdirSync(path.join(repo, "changelog.d/odd.md"));
    write("changelog.d/odd.md/real.md", "### Fixed\n- **Real.** Fixed.\n");
    commit("fix: odd (#4)");
    expect(release()).toMatchObject({ released: "true" });
    expect(read("CHANGELOG.md")).toContain("- **Real.** Fixed.");
  });
});
