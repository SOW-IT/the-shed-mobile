import { describe, expect, test } from "vitest";
import {
  appJsonVersion,
  awaitsRelease,
  changelogVersions,
  compareVersions,
  groupNotes,
  largestBump,
  nextPatch,
  nextVersion,
  packageJsonVersion,
  parseFragment,
  parseVersion,
  releaseChangelog,
  setAppJsonVersion,
  setPackageJsonVersion,
  setPackageLockVersion,
  sydneyDate,
} from "./releaseVersion.mjs";

const PREAMBLE = "# Changelog\n\nAll notable changes.";

const changelogOf = (...sections) => `${PREAMBLE}\n\n## [Unreleased]\n\n${sections.join("\n\n")}\n`;

const released = (version, notes) => `## [${version}] - 2026-11-26\n\n${notes}`;

const OLD = released("2.13.45", "### Changed\n- **Arms swing.** Walking looks alive.");

describe("versions", () => {
  test("parses major.minor.patch and refuses anything else", () => {
    expect(parseVersion("2.13.45")).toEqual([2, 13, 45]);
    expect(() => parseVersion("2.13")).toThrow("not a major.minor.patch version");
    expect(() => parseVersion(undefined)).toThrow("not a major.minor.patch version");
  });

  test("compares numerically, not as text", () => {
    expect(compareVersions("2.13.9", "2.13.10")).toBe(-1);
    expect(compareVersions("2.14.0", "2.13.99")).toBe(1);
    expect(compareVersions("3.0.0", "3.0.0")).toBe(0);
  });

  test("a commit awaits a release unless it raised the version itself", () => {
    expect(awaitsRelease("2.13.45", "2.13.45")).toBe(true);
    expect(awaitsRelease("2.13.44", "2.13.45")).toBe(true);
    expect(awaitsRelease("2.13.46", "2.13.45")).toBe(false);
    expect(awaitsRelease("2.14.0", "2.13.45")).toBe(false);
    expect(awaitsRelease("2.13.45", null)).toBe(false);
  });

  test("the next patch follows the highest version given", () => {
    expect(nextPatch("2.13.45")).toBe("2.13.46");
    expect(nextPatch("2.13.44", "2.13.46", "2.13.45")).toBe("2.13.47");
    expect(nextPatch("2.14.0", "2.13.99")).toBe("2.14.1");
  });

  test("lists the versions the changelog has released, not Unreleased", () => {
    expect(changelogVersions(changelogOf(released("2.14.1", "- a"), OLD))).toEqual(["2.14.1", "2.13.45"]);
  });

  test("dates releases in Sydney", () => {
    expect(sydneyDate(new Date("2026-11-27T14:30:00Z"))).toBe("2026-11-28");
    expect(sydneyDate(new Date("2026-11-27T12:00:00Z"))).toBe("2026-11-27");
  });
});

describe("version files", () => {
  const packageJson = '{\n  "name": "theshed",\n  "version": "2.13.45",\n  "dependencies": {\n    "x": "^1.0.0"\n  }\n}\n';
  const appJson = '{\n  "expo": {\n    "name": "The SHED",\n    "version": "2.13.45",\n    "runtimeVersion": {\n      "policy": "fingerprint"\n    }\n  }\n}\n';
  const lock =
    '{\n  "name": "theshed",\n  "version": "2.13.45",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "theshed",\n      "version": "2.13.45",\n      "dependencies": {}\n    },\n    "node_modules/x": {\n      "version": "1.0.0"\n    }\n  }\n}\n';

  test("sets package.json's version and nothing else", () => {
    const next = setPackageJsonVersion(packageJson, "2.13.46");
    expect(packageJsonVersion(next)).toBe("2.13.46");
    expect(next).toBe(packageJson.replace("2.13.45", "2.13.46"));
  });

  test("sets app.json's expo.version and nothing else", () => {
    const next = setAppJsonVersion(appJson, "2.13.46");
    expect(appJsonVersion(next)).toBe("2.13.46");
    expect(next).toBe(appJson.replace("2.13.45", "2.13.46"));
  });

  test("sets both of package-lock.json's version lines, never a dependency's", () => {
    const next = setPackageLockVersion(lock, "2.13.46");
    const parsed = JSON.parse(next);
    expect(parsed.version).toBe("2.13.46");
    expect(parsed.packages[""].version).toBe("2.13.46");
    expect(parsed.packages["node_modules/x"].version).toBe("1.0.0");
  });

  test("refuses a file whose version line isn't where it is expected", () => {
    expect(() => setPackageJsonVersion('{\n"version": "1.0.0"\n}', "1.0.1")).toThrow("found 0");
    expect(() => setPackageLockVersion(lock.replace('"": {', '"root": {'), "2.13.46")).toThrow("found 0");
    expect(() => setAppJsonVersion(`${appJson}    "version": "9.9.9"\n`, "2.13.46")).toThrow("found 2");
  });
});

describe("notes", () => {
  test("groups bullets under their headings, unheaded ones as Changed", () => {
    const groups = groupNotes("- loose line\n\n### Fixed\n- a fix\n  wrapped\n\n### Added\n- a thing\n");
    expect([...groups]).toEqual([
      ["Changed", "- loose line"],
      ["Fixed", "- a fix\n  wrapped"],
      ["Added", "- a thing"],
    ]);
  });
});

describe("releasing the changelog", () => {
  const release = (options) =>
    releaseChangelog({ version: "2.13.46", date: "2026-11-27", parentChangelog: changelogOf(OLD), ...options });

  test("turns fragments into the new version's section, in the usual heading order", () => {
    const next = release({
      changelog: changelogOf(OLD),
      fragments: ["### Fixed\n- **Mahjong counts kongs.** Fixed.\n", "### Added\n- **Eight eye shapes.** New.\n"],
    });
    expect(next).toBe(
      changelogOf(
        released("2.13.46", "### Added\n- **Eight eye shapes.** New.\n\n### Fixed\n- **Mahjong counts kongs.** Fixed.").replace(
          "2026-11-26",
          "2026-11-27"
        ),
        OLD
      )
    );
  });

  test("merges two fragments under the same heading", () => {
    const next = release({ changelog: changelogOf(OLD), fragments: ["### Fixed\n- one\n", "### Fixed\n- two\n"] });
    expect(next).toContain("## [2.13.46] - 2026-11-27\n\n### Fixed\n- one\n- two\n\n## [2.13.45]");
  });

  test("moves notes someone left under Unreleased into the release", () => {
    const changelog = `${PREAMBLE}\n\n## [Unreleased]\n\n### Changed\n- written the old way\n\n${OLD}\n`;
    const next = release({ changelog, fragments: ["### Changed\n- from a fragment\n"] });
    expect(next).toContain("## [Unreleased]\n\n## [2.13.46] - 2026-11-27\n\n### Changed\n- written the old way\n- from a fragment\n\n## [2.13.45]");
  });

  test("falls back to the merge's subject when a merge wrote no notes", () => {
    const next = release({ changelog: changelogOf(OLD), fallbackSubjects: ["chore(deps): bump expo (#469)"] });
    expect(next).toContain("## [2.13.46] - 2026-11-27\n\n### Changed\n- chore(deps): bump expo (#469)\n\n## [2.13.45]");
  });

  test("still writes a section when there is nothing to say", () => {
    const next = release({ changelog: changelogOf(OLD) });
    expect(next).toContain("## [2.13.46] - 2026-11-27\n\n### Changed\n- Maintenance release.\n\n## [2.13.45]");
  });

  test("renumbers a section a merge added under a number main already used", () => {
    const stale = released("2.13.45", "### Added\n- **Sleeves.** Long and short.").replace("2026-11-26", "2026-11-25");
    const changelog = changelogOf(stale, OLD);
    const next = release({ changelog });
    expect(next).toBe(
      changelogOf(released("2.13.46", "### Added\n- **Sleeves.** Long and short.").replace("2026-11-26", "2026-11-27"), OLD)
    );
  });

  test("renumbers the merge's copy when its heading line duplicates main's exactly", () => {
    const theirs = released("2.13.45", "### Fixed\n- **Theirs.** Fixed.");
    const next = release({ changelog: changelogOf(theirs, OLD) });
    expect(next).toContain("## [2.13.46] - 2026-11-27\n\n### Fixed\n- **Theirs.** Fixed.\n\n## [2.13.45] - 2026-11-26\n\n### Changed\n- **Arms swing.**");
    expect(next.match(/## \[2\.13\.45\]/g)).toHaveLength(1);
  });

  test("leaves a released section alone when a merge only corrected its wording", () => {
    const corrected = OLD.replace("looks alive", "looks lively");
    const next = release({ changelog: changelogOf(corrected), fallbackSubjects: [] });
    expect(next).toContain(corrected);
    expect(next).toContain("- Maintenance release.");
  });

  test("refuses a changelog without an Unreleased heading or one that already has the version", () => {
    expect(() => release({ changelog: `${PREAMBLE}\n\n${OLD}\n` })).toThrow("no \"## [Unreleased]\" heading");
    expect(() => release({ changelog: changelogOf(OLD), version: "2.13.45" })).toThrow("already has a 2.13.45 section");
  });

  test("without a parent changelog, nothing counts as added by hand", () => {
    const next = releaseChangelog({ changelog: changelogOf(OLD), parentChangelog: null, version: "2.13.46", date: "2026-11-27" });
    expect(next).toContain(OLD);
  });
});

describe("bumps", () => {
  test("raises minor or major, resetting what follows", () => {
    expect(nextVersion("patch", "2.14.2")).toBe("2.14.3");
    expect(nextVersion("minor", "2.14.2", "2.13.9")).toBe("2.15.0");
    expect(nextVersion("major", "2.14.2")).toBe("3.0.0");
    expect(() => nextVersion("huge", "2.14.2")).toThrow("not patch, minor or major");
  });

  test("a note without front matter asks for a patch and keeps its text", () => {
    expect(parseFragment("### Fixed\n- a fix\n")).toEqual({ bump: "patch", notes: "### Fixed\n- a fix\n" });
  });

  test("front matter asks for a minor or major and is left out of the notes", () => {
    expect(parseFragment("---\nbump: minor\n---\n### Added\n- a game\n")).toEqual({ bump: "minor", notes: "### Added\n- a game\n" });
    expect(parseFragment("---\r\nbump: major\r\n---\r\n- big\r\n").bump).toBe("major");
  });

  test("CRLF notes come out with plain line endings", () => {
    expect(parseFragment("### Fixed\r\n- first\r\n- second\r\n").notes).toBe("### Fixed\n- first\n- second\n");
    expect(parseFragment("---\r\nbump: minor\r\n---\r\n- a\r\n- b\r\n")).toEqual({ bump: "minor", notes: "- a\n- b\n" });
    expect([...groupNotes("### Fixed\r\n- first\r\n- second\r\n")]).toEqual([["Fixed", "- first\n- second"]]);
  });

  test("fences may have trailing spaces and the front matter may be empty", () => {
    expect(parseFragment("--- \nbump: major\n---\t\n- big\n")).toEqual({ bump: "major", notes: "- big\n" });
    expect(parseFragment("---\n---\n- plain\n")).toEqual({ bump: "patch", notes: "- plain\n" });
  });

  test("refuses front matter that is never closed, rather than leaking it into the changelog", () => {
    expect(() => parseFragment("---\nbump: minor\n- x\n", "changelog.d/a.md")).toThrow("changelog.d/a.md starts front matter");
  });

  test("refuses front matter it doesn't understand, naming the file", () => {
    expect(() => parseFragment("---\nbump: huge\n---\n- x\n", "changelog.d/a.md")).toThrow('changelog.d/a.md has front matter "bump: huge"');
    expect(() => parseFragment("---\ntitle: x\n---\n- x\n")).toThrow("the only field is bump");
  });

  test("the largest bump wins, and no notes means a patch", () => {
    expect(largestBump([])).toBe("patch");
    expect(largestBump(["patch", "minor", "patch"])).toBe("minor");
    expect(largestBump(["minor", "major"])).toBe("major");
  });
});

describe("a manual bump's own section", () => {
  test("is completed when a merge since the parent added it, and still refused otherwise", () => {
    const manual = released("2.14.0", "### Added\n- **Big.** New.").replace("2026-11-26", "2026-11-27");
    const next = releaseChangelog({
      changelog: changelogOf(manual, OLD),
      parentChangelog: changelogOf(OLD),
      version: "2.14.0",
      date: "2026-11-27",
      fragments: ["### Fixed\n- **Overtaken.** Fixed.\n"],
    });
    expect(next).toBe(changelogOf(released("2.14.0", "### Added\n- **Big.** New.\n\n### Fixed\n- **Overtaken.** Fixed.").replace("2026-11-26", "2026-11-27"), OLD));
    expect(() =>
      releaseChangelog({ changelog: changelogOf(manual, OLD), parentChangelog: changelogOf(manual, OLD), version: "2.14.0", date: "2026-11-27" })
    ).toThrow("already has a 2.14.0 section");
  });
});
