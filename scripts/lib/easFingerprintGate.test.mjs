import { describe, expect, test } from "vitest";
import {
  buildFingerprint,
  decidePlatform,
  easPlatformArg,
  requestedPlatforms,
  skipNotice,
  submissionFinished,
  summaryMarkdown,
  updateCommit,
} from "./easFingerprintGate.mjs";

const IOS_HASH = "b28ad57ce5dfff3678d5371fee3d496c62c6b297";
const ANDROID_HASH = "5687badcbb4bbcb1f9bfe1bfe25ef78145c775c3";
const COMMIT = "a5783c8440a908f99bf7b3a91744d1c25c5e05ed";

const build = (hash, over = {}) => ({
  id: "build-1",
  platform: "IOS",
  appVersion: "2.10.7",
  appBuildVersion: "59",
  runtime: { version: hash },
  fingerprint: { hash },
  ...over,
});

const live = { submitted: true, publishedCommit: COMMIT, commit: COMMIT, force: false };

describe("requestedPlatforms", () => {
  test.each([
    [undefined, ["ios", "android"]],
    ["", ["ios", "android"]],
    ["both", ["ios", "android"]],
    ["all", ["ios", "android"]],
    [" ios ", ["ios"]],
    ["android", ["android"]],
  ])("%j asks for %j", (input, expected) => {
    expect(requestedPlatforms(input)).toEqual(expected);
  });

  test("refuses anything else", () => {
    expect(() => requestedPlatforms("windows")).toThrow(/Unknown platform "windows"/);
  });
});

describe("buildFingerprint", () => {
  test("reads the runtime version current eas-cli returns", () => {
    expect(buildFingerprint({ runtime: { version: IOS_HASH } })).toBe(IOS_HASH);
  });

  test("reads the runtimeVersion older eas-cli returns", () => {
    expect(buildFingerprint({ runtimeVersion: IOS_HASH })).toBe(IOS_HASH);
  });

  test("falls back to the fingerprint hash", () => {
    expect(buildFingerprint({ fingerprint: { hash: IOS_HASH } })).toBe(IOS_HASH);
  });

  test("is null for a build without one", () => {
    expect(buildFingerprint({})).toBeNull();
    expect(buildFingerprint(undefined)).toBeNull();
  });
});

describe("submissionFinished", () => {
  const submissions = [
    { buildId: "build-2", status: "FINISHED" },
    { buildId: "build-1", status: "ERRORED" },
  ];

  test("needs a finished submission of that exact build", () => {
    expect(submissionFinished(submissions, "build-2")).toBe(true);
    expect(submissionFinished(submissions, "build-1")).toBe(false);
    expect(submissionFinished(submissions, "build-3")).toBe(false);
  });

  test("counts a later finished retry of the same build", () => {
    expect(submissionFinished([...submissions, { buildId: "build-1", status: "FINISHED" }], "build-1")).toBe(true);
  });

  test("is false without a list", () => {
    expect(submissionFinished(undefined, "build-1")).toBe(false);
  });
});

describe("updateCommit", () => {
  const group = [
    { platform: "android", gitCommitHash: "android-commit" },
    { platform: "ios", gitCommitHash: COMMIT },
  ];

  test("is the commit of the platform's update in the group", () => {
    expect(updateCommit(group, "ios")).toBe(COMMIT);
    expect(updateCommit(group, "android")).toBe("android-commit");
  });

  test("is null when the group has no update for the platform", () => {
    expect(updateCommit([group[0]], "ios")).toBeNull();
    expect(updateCommit(undefined, "ios")).toBeNull();
    expect(updateCommit([{ platform: "ios" }], "ios")).toBeNull();
  });
});

describe("decidePlatform", () => {
  test("skips a platform whose store build matches, reached the store and has this commit over the air", () => {
    expect(decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: build(IOS_HASH), ...live })).toEqual({
      platform: "ios",
      current: IOS_HASH,
      last: IOS_HASH,
      lastLabel: "2.10.7 (build 59)",
      reason: "unchanged",
      build: false,
    });
  });

  test("builds when force is ticked even though nothing changed", () => {
    expect(
      decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: build(IOS_HASH), ...live, force: true })
    ).toMatchObject({ reason: "forced", build: true });
  });

  test("builds when the native code changed", () => {
    expect(
      decidePlatform({ platform: "android", current: "f".repeat(40), lastBuild: build(ANDROID_HASH), ...live })
    ).toMatchObject({ reason: "changed", build: true, last: ANDROID_HASH });
  });

  test("builds again when the matching build never finished its store submission", () => {
    expect(
      decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: build(IOS_HASH), ...live, submitted: false })
    ).toMatchObject({ reason: "not-submitted", build: true });
  });

  test.each([
    ["no update for this fingerprint yet", null],
    ["an update from an older commit", "0".repeat(40)],
  ])("builds when there is %s", (_label, publishedCommit) => {
    expect(
      decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: build(IOS_HASH), ...live, publishedCommit })
    ).toMatchObject({ reason: "not-published", build: true });
  });

  test("builds when the commit being checked is unknown", () => {
    expect(
      decidePlatform({
        platform: "ios",
        current: IOS_HASH,
        lastBuild: build(IOS_HASH),
        ...live,
        commit: "",
        publishedCommit: "",
      })
    ).toMatchObject({ reason: "not-published", build: true });
  });

  test("builds when there is no finished store build yet", () => {
    expect(decidePlatform({ platform: "android", current: ANDROID_HASH, lastBuild: undefined, ...live })).toMatchObject({
      reason: "no-earlier-build",
      build: true,
      last: null,
      lastLabel: null,
    });
  });

  test("builds when the last store build has no recorded fingerprint", () => {
    expect(
      decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: { appVersion: "2.9.15" }, ...live })
    ).toMatchObject({ reason: "no-recorded-fingerprint", build: true, lastLabel: "2.9.15 (build ?)" });
  });

  test.each([undefined, null, ""])("refuses a missing current fingerprint (%j)", (current) => {
    expect(() => decidePlatform({ platform: "android", current, lastBuild: build(ANDROID_HASH), ...live })).toThrow(
      /no fingerprint for Android/
    );
  });
});

describe("easPlatformArg", () => {
  const decision = (platform, build) => ({ platform, build });

  test("is none when nothing needs building", () => {
    expect(easPlatformArg([decision("ios", false), decision("android", false)])).toBe("none");
    expect(easPlatformArg([])).toBe("none");
  });

  test("is the one platform that changed", () => {
    expect(easPlatformArg([decision("ios", false), decision("android", true)])).toBe("android");
    expect(easPlatformArg([decision("ios", true)])).toBe("ios");
  });

  test("is all when both changed", () => {
    expect(easPlatformArg([decision("ios", true), decision("android", true)])).toBe("all");
  });
});

describe("summaryMarkdown and skipNotice", () => {
  const unchanged = decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: build(IOS_HASH), ...live });
  const changed = decidePlatform({
    platform: "android",
    current: "f".repeat(40),
    lastBuild: build(ANDROID_HASH, { appBuildVersion: "50" }),
    ...live,
  });
  const fresh = decidePlatform({ platform: "android", current: ANDROID_HASH, lastBuild: undefined, ...live });

  test("tables each platform and explains a skip", () => {
    const text = summaryMarkdown("production", [unchanged, changed]);
    expect(text).toContain("### Native fingerprint check: production");
    expect(text).toContain("| iOS | `b28ad57` | 2.10.7 (build 59), `b28ad57` | Unchanged, skipped |");
    expect(text).toContain("| Android | `fffffff` | 2.10.7 (build 50), `5687bad` | Native code changed, building |");
    expect(text).toContain("iOS has the same native code as the last store build");
    expect(text).toContain("**force**");
  });

  test("names why a matching build is rebuilt", () => {
    const unsubmitted = decidePlatform({
      platform: "ios",
      current: IOS_HASH,
      lastBuild: build(IOS_HASH),
      ...live,
      submitted: false,
    });
    const unpublished = decidePlatform({
      platform: "android",
      current: ANDROID_HASH,
      lastBuild: build(ANDROID_HASH),
      ...live,
      publishedCommit: null,
    });
    const text = summaryMarkdown("staging", [unsubmitted, unpublished]);
    expect(text).toContain("no finished store submission, building again");
    expect(text).toContain("isn't published over the air for it yet, building");
    expect(text).not.toContain("force");
  });

  test("says have when both are skipped", () => {
    const androidUnchanged = decidePlatform({
      platform: "android",
      current: ANDROID_HASH,
      lastBuild: build(ANDROID_HASH),
      ...live,
    });
    expect(summaryMarkdown("staging", [unchanged, androidUnchanged])).toContain("iOS and Android have the same native code");
  });

  test("shows a missing build as none", () => {
    expect(summaryMarkdown("staging", [fresh])).toContain(
      "| Android | `5687bad` | none | No finished store build to compare with, building |"
    );
  });

  test("names the build a skipped platform already matches", () => {
    expect(skipNotice("production", unchanged)).toBe(
      "iOS production skipped: main's native fingerprint b28ad57 matches 2.10.7 (build 59), which already gets this commit over the air. Tick force to build anyway."
    );
  });
});
