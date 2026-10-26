import { describe, expect, test } from "vitest";
import {
  buildFingerprint,
  decidePlatform,
  easPlatformArg,
  requestedPlatforms,
  skipNotice,
  summaryMarkdown,
} from "./easFingerprintGate.mjs";

const IOS_HASH = "b28ad57ce5dfff3678d5371fee3d496c62c6b297";
const ANDROID_HASH = "5687badcbb4bbcb1f9bfe1bfe25ef78145c775c3";

const build = (hash, over = {}) => ({
  platform: "IOS",
  appVersion: "2.10.7",
  appBuildVersion: "59",
  runtime: { version: hash },
  fingerprint: { hash },
  ...over,
});

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

describe("decidePlatform", () => {
  test("skips a platform whose fingerprint matches the last store build", () => {
    expect(decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: build(IOS_HASH), force: false })).toEqual({
      platform: "ios",
      current: IOS_HASH,
      last: IOS_HASH,
      lastLabel: "2.10.7 (build 59)",
      reason: "unchanged",
      build: false,
    });
  });

  test("builds when force is ticked even though nothing changed", () => {
    expect(decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: build(IOS_HASH), force: true })).toMatchObject({
      reason: "forced",
      build: true,
    });
  });

  test("builds when the native code changed", () => {
    expect(
      decidePlatform({ platform: "android", current: "f".repeat(40), lastBuild: build(ANDROID_HASH), force: false })
    ).toMatchObject({ reason: "changed", build: true, last: ANDROID_HASH });
  });

  test("builds when there is no finished store build yet", () => {
    expect(decidePlatform({ platform: "android", current: ANDROID_HASH, lastBuild: undefined, force: false })).toMatchObject({
      reason: "no-earlier-build",
      build: true,
      last: null,
      lastLabel: null,
    });
  });

  test("builds when the last store build has no recorded fingerprint", () => {
    expect(
      decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: { appVersion: "2.9.15" }, force: false })
    ).toMatchObject({ reason: "no-recorded-fingerprint", build: true, lastLabel: "2.9.15 (build ?)" });
  });

  test.each([undefined, null, ""])("refuses a missing current fingerprint (%j)", (current) => {
    expect(() => decidePlatform({ platform: "android", current, lastBuild: build(ANDROID_HASH), force: false })).toThrow(
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
  const unchanged = decidePlatform({ platform: "ios", current: IOS_HASH, lastBuild: build(IOS_HASH), force: false });
  const changed = decidePlatform({
    platform: "android",
    current: "f".repeat(40),
    lastBuild: build(ANDROID_HASH, { appBuildVersion: "50" }),
    force: false,
  });
  const fresh = decidePlatform({ platform: "android", current: ANDROID_HASH, lastBuild: undefined, force: false });

  test("tables each platform and explains a skip", () => {
    const text = summaryMarkdown("production", [unchanged, changed]);
    expect(text).toContain("### Native fingerprint check: production");
    expect(text).toContain("| iOS | `b28ad57` | 2.10.7 (build 59), `b28ad57` | Unchanged, skipped |");
    expect(text).toContain("| Android | `fffffff` | 2.10.7 (build 50), `5687bad` | Native code changed, building |");
    expect(text).toContain("iOS has the same native code as the last store build");
    expect(text).toContain("**force**");
  });

  test("says have when both are skipped", () => {
    const androidUnchanged = decidePlatform({
      platform: "android",
      current: ANDROID_HASH,
      lastBuild: build(ANDROID_HASH),
      force: false,
    });
    expect(summaryMarkdown("staging", [unchanged, androidUnchanged])).toContain("iOS and Android have the same native code");
  });

  test("leaves out the skip note when everything builds, and shows a missing build as none", () => {
    const text = summaryMarkdown("staging", [fresh]);
    expect(text).toContain("| Android | `5687bad` | none | No finished store build to compare with, building |");
    expect(text).not.toContain("force");
  });

  test("names the build a skipped platform already matches", () => {
    expect(skipNotice("production", unchanged)).toBe(
      "iOS production skipped: main's native fingerprint b28ad57 matches 2.10.7 (build 59), which already gets main over the air. Tick force to build anyway."
    );
  });
});
