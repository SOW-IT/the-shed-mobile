import { describe, expect, test } from "vitest";
import {
  chatMessage,
  checkUpdate,
  dashboardLink,
  publishedUpdates,
  raisedOutcome,
  recommendationFailed,
  recommendationPlan,
  stranded,
  summaryMarkdown,
} from "./easUpdateReport.mjs";

const IOS_RUNTIME = "d1da5791a67cef4d58e462cffe8ce268bbbe7bc3";
const ANDROID_RUNTIME = "ff959e96ad34947a1d94fc4014d4d61227cb222b";
const OTHER_RUNTIME = "318a7ba8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COMMIT = "1fe5e74988013ee2eb622b7e6cc68483310fb3b4";
const PROJECT = { owner: "xtectras-team", slug: "the-shed-mobile" };

const update = (platform, runtimeVersion, group) => ({
  id: `${platform}-update`,
  group,
  branch: "production",
  message: "Merge pull request #503",
  runtimeVersion,
  platform,
  gitCommitHash: COMMIT,
});

const iosUpdate = update("ios", IOS_RUNTIME, "d9471418-d611-4542-bc94-0375fb5c8404");
const androidUpdate = update("android", ANDROID_RUNTIME, "8a4e35a9-3c5a-4633-936b-114c86946317");

const build = (runtime, appBuildVersion) => ({
  appVersion: "2.11.10",
  appBuildVersion,
  runtime: { version: runtime },
});

describe("publishedUpdates", () => {
  test("reads eas update --json output, iOS first", () => {
    expect(publishedUpdates(JSON.stringify([androidUpdate, iosUpdate]))).toEqual([iosUpdate, androidUpdate]);
  });

  test("skips anything printed before the JSON", () => {
    expect(publishedUpdates(`Using eas-cli 27\n${JSON.stringify([iosUpdate])}`)).toEqual([iosUpdate]);
  });

  test.each([[undefined], [""], ["  \n"]])("treats %j as nothing published", (output) => {
    expect(publishedUpdates(output)).toEqual([]);
  });

  test("drops entries without a platform or runtime", () => {
    expect(publishedUpdates(JSON.stringify([{ id: "x" }, iosUpdate]))).toEqual([iosUpdate]);
  });

  test("refuses output that isn't a list", () => {
    expect(() => publishedUpdates(JSON.stringify({ id: "x" }))).toThrow("list of updates");
  });
});

describe("checkUpdate", () => {
  test("matches the newest store build's runtime", () => {
    expect(checkUpdate(iosUpdate, build(IOS_RUNTIME, "64"))).toEqual({
      platform: "ios",
      runtime: IOS_RUNTIME,
      group: iosUpdate.group,
      buildLabel: "2.11.10 (build 64)",
      buildRuntime: IOS_RUNTIME,
      result: "match",
    });
  });

  test("flags a runtime no store build has", () => {
    expect(checkUpdate(update("ios", OTHER_RUNTIME), build(IOS_RUNTIME, "64"))).toMatchObject({
      result: "mismatch",
      group: null,
    });
  });

  test("flags a missing store build", () => {
    expect(checkUpdate(iosUpdate, null)).toMatchObject({ result: "no-build", buildLabel: null, buildRuntime: null });
  });

  test("reads the fingerprint when the build has no runtime", () => {
    expect(checkUpdate(iosUpdate, { fingerprint: { hash: IOS_RUNTIME } })).toMatchObject({
      result: "match",
      buildLabel: "? (build ?)",
    });
  });
});

const matching = [checkUpdate(iosUpdate, build(IOS_RUNTIME, "64")), checkUpdate(androidUpdate, build(ANDROID_RUNTIME, "55"))];
const strandedIos = [
  checkUpdate(update("ios", OTHER_RUNTIME, "g1"), build(IOS_RUNTIME, "64")),
  checkUpdate(androidUpdate, build(ANDROID_RUNTIME, "55")),
];
const details = { version: "2.12.7", channel: "production", commit: COMMIT, project: PROJECT };

describe("stranded", () => {
  test("lists the platforms whose update reaches no store build", () => {
    expect(stranded(matching)).toEqual([]);
    expect(stranded(strandedIos).map((check) => check.platform)).toEqual(["ios"]);
  });
});

describe("summaryMarkdown", () => {
  test("says the update is on its way and how phones pick it up", () => {
    const summary = summaryMarkdown({ ...details, checks: matching });
    expect(summary).toContain("### Over the air: The SHED 2.12.7 is on its way to phones");
    expect(summary).toContain("| iOS | `d1da579` | 2.11.10 (build 64), `d1da579` | Reaches the store build |");
    expect(summary).toContain(`[d9471418](${dashboardLink(PROJECT, iosUpdate.group)})`);
    expect(summary).toContain("after 10 minutes away");
  });

  test("names the stranded platform and what to do", () => {
    const summary = summaryMarkdown({ ...details, checks: strandedIos });
    expect(summary).toContain("reaches no iOS store build");
    expect(summary).toContain("| iOS | `318a7ba` | 2.11.10 (build 64), `d1da579` | Reaches no store build |");
    expect(summary).toContain("iOS phones won't get this update");
    expect(summary).toContain("EAS Production");
  });

  test("shows a missing store build and a missing group", () => {
    const summary = summaryMarkdown({ ...details, checks: [checkUpdate(update("android", ANDROID_RUNTIME), null)] });
    expect(summary).toContain("| Android | `ff959e9` | none | No finished store build to compare with | ? |");
  });

  test("says when nothing was published", () => {
    const summary = summaryMarkdown({ ...details, checks: [] });
    expect(summary).toContain("failed to publish");
    expect(summary).toContain("for `1fe5e74`");
  });
});

describe("chatMessage", () => {
  const extra = { subject: "Merge <b>#503</b> & more", commitUrl: "https://c", runUrl: "https://r" };

  test("builds a card with a row and a button per platform", () => {
    const message = chatMessage({ ...details, ...extra, checks: matching });
    expect(message.text).toBe("The SHED 2.12.7 is on its way to phones");
    const widgets = message.cardsV2[0].card.sections[0].widgets;
    expect(widgets[0].decoratedText.text).toBe('<a href="https://c">1fe5e74</a> Merge &lt;b&gt;#503&lt;/b&gt; &amp; more');
    expect(widgets[1].decoratedText).toMatchObject({
      topLabel: "iOS",
      text: "Reaches the store build: runtime d1da579, store build 2.11.10 (build 64) d1da579",
    });
    expect(widgets.at(-1).buttonList.buttons.map((button) => button.text)).toEqual([
      "Workflow run",
      "iOS update",
      "Android update",
    ]);
  });

  test("explains a stranded update without markdown", () => {
    const message = chatMessage({ ...details, ...extra, checks: strandedIos });
    const paragraph = message.cardsV2[0].card.sections[0].widgets.find((widget) => widget.textParagraph);
    expect(paragraph.textParagraph.text).toContain("iOS phones won't get this update");
    expect(paragraph.textParagraph.text).not.toMatch(/[*`]/);
  });

  test("reports a failed publish", () => {
    const message = chatMessage({ ...details, ...extra, checks: [] });
    expect(message.text).toBe("The SHED 2.12.7 over-the-air update failed to publish");
    const widgets = message.cardsV2[0].card.sections[0].widgets;
    expect(widgets.find((widget) => widget.textParagraph).textParagraph.text).toContain("Nothing was published");
    expect(widgets.at(-1).buttonList.buttons).toHaveLength(1);
  });

  test("shows no store build", () => {
    const message = chatMessage({ ...details, ...extra, checks: [checkUpdate(androidUpdate, null)] });
    expect(message.cardsV2[0].card.sections[0].widgets[1].decoratedText.text).toBe(
      "No finished store build to compare with: runtime ff959e9, store build none"
    );
  });
});

const PROD_KEY = "prod:giant-bloodhound-191|secret";

describe("recommendationPlan", () => {
  test("raises every platform whose update reaches its store build", () => {
    expect(recommendationPlan({ checks: matching, published: true, deployKey: PROD_KEY })).toEqual([
      { platform: "ios", action: "raise" },
      { platform: "android", action: "raise" },
    ]);
  });

  test("leaves a stranded platform alone", () => {
    expect(recommendationPlan({ checks: strandedIos, published: true, deployKey: PROD_KEY })).toEqual([
      { platform: "ios", action: "stranded" },
      { platform: "android", action: "raise" },
    ]);
  });

  test("does nothing when the production publish didn't succeed", () => {
    expect(recommendationPlan({ checks: matching, published: false, deployKey: PROD_KEY })).toEqual([]);
  });

  test.each([[undefined], [""], ["dev:successful-lynx-56|secret"], ["preview:sow:the-shed|secret"]])(
    "won't raise with deploy key %j",
    (deployKey) => {
      expect(
        recommendationPlan({ checks: matching, published: true, deployKey }).map((step) => step.action)
      ).toEqual(["no-key", "no-key"]);
    }
  );
});

describe("raisedOutcome", () => {
  test("reads convex run output", () => {
    const output = JSON.stringify({ raised: true, previous: "2.12.9", latestOta: "2.12.10" }, null, 2);
    expect(raisedOutcome("ios", output)).toEqual({
      platform: "ios",
      action: "raised",
      previous: "2.12.9",
      latestOta: "2.12.10",
    });
  });

  test("skips anything printed before the JSON and keeps a version already past", () => {
    const output = `Running...\n${JSON.stringify({ raised: false, previous: "2.12.40", latestOta: "2.12.40" })}`;
    expect(raisedOutcome("android", output)).toMatchObject({ action: "kept", latestOta: "2.12.40" });
  });

  test("reads a first latest over-the-air version", () => {
    expect(raisedOutcome("ios", JSON.stringify({ raised: true, previous: null, latestOta: "2.12.10" }))).toMatchObject({
      previous: null,
    });
  });

  test("refuses output without a latest over-the-air version", () => {
    expect(() => raisedOutcome("ios", "null")).toThrow("latest over-the-air version");
    expect(() => raisedOutcome("ios", JSON.stringify({ raised: true }))).toThrow("latest over-the-air version");
  });
});

describe("latest over-the-air version in the report", () => {
  const recommendations = [
    { platform: "ios", action: "raised", previous: "2.12.6", latestOta: "2.12.7" },
    { platform: "android", action: "raised", previous: null, latestOta: "2.12.7" },
  ];

  test("lists what each platform's latest over-the-air version is now", () => {
    const summary = summaryMarkdown({ ...details, checks: matching, recommendations });
    expect(summary).toContain(
      "**Latest over-the-air version** (phones below it fetch it and restart; the store prompt follows the recommended version set by hand):"
    );
    expect(summary).toContain("- iOS raised from 2.12.6 to 2.12.7");
    expect(summary).toContain("- Android set to 2.12.7");
  });

  test("says why a version wasn't raised", () => {
    const summary = summaryMarkdown({
      ...details,
      checks: strandedIos,
      recommendations: [
        { platform: "ios", action: "stranded" },
        { platform: "android", action: "kept", previous: "2.12.8", latestOta: "2.12.8" },
      ],
    });
    expect(summary).toContain("- iOS not changed, because this update reaches no store build");
    expect(summary).toContain("- Android stays 2.12.8, already at or past 2.12.7");
    expect(
      summaryMarkdown({ ...details, checks: matching, recommendations: [{ platform: "ios", action: "no-key" }] })
    ).toContain("- iOS not changed, because the workflow has no production Convex deploy key");
    expect(
      summaryMarkdown({
        ...details,
        checks: matching,
        recommendations: [{ platform: "ios", action: "failed", error: "Command failed" }],
      })
    ).toContain("- iOS not changed: Command failed");
    expect(
      summaryMarkdown({ ...details, checks: matching, recommendations: [{ platform: "ios", action: "failed" }] })
    ).toContain("- iOS not changed: appInstalls:raiseLatestOta failed");
  });

  test("leaves the section out when nothing was planned", () => {
    expect(summaryMarkdown({ ...details, checks: matching })).not.toContain("Latest over-the-air version");
  });

  test("adds a row to the Chat card", () => {
    const message = chatMessage({
      ...details,
      subject: "Merge",
      commitUrl: "https://c",
      runUrl: "https://r",
      checks: matching,
      recommendations,
    });
    const row = message.cardsV2[0].card.sections[0].widgets.find(
      (widget) => widget.decoratedText?.topLabel === "Latest over-the-air version"
    );
    expect(row.decoratedText.text).toBe("iOS raised from 2.12.6 to 2.12.7; Android set to 2.12.7");
  });

  test("picks out the failures", () => {
    expect(
      recommendationFailed([...recommendations, { platform: "ios", action: "failed", error: "x" }]).map(
        (outcome) => outcome.platform
      )
    ).toEqual(["ios"]);
  });
});
