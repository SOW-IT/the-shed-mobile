import { buildFingerprint, platformName } from "./easFingerprintGate.mjs";

const PLATFORM_ORDER = ["ios", "android"];

const RESULTS = {
  match: "Reaches the store build",
  mismatch: "Reaches no store build",
  "no-build": "No finished store build to compare with",
};

export const publishedUpdates = (output) => {
  const text = (output ?? "").trim();
  if (!text) return [];
  const start = text.indexOf("[");
  const parsed = JSON.parse(start > 0 ? text.slice(start) : text);
  if (!Array.isArray(parsed)) throw new Error("eas update --json printed something other than a list of updates.");
  return parsed
    .filter((update) => typeof update?.platform === "string" && typeof update?.runtimeVersion === "string")
    .sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
};

const buildLabel = (build) => `${build.appVersion ?? "?"} (build ${build.appBuildVersion ?? "?"})`;

export const checkUpdate = (update, lastBuild) => {
  const buildRuntime = lastBuild ? buildFingerprint(lastBuild) : null;
  let result;
  if (!buildRuntime) result = "no-build";
  else if (buildRuntime === update.runtimeVersion) result = "match";
  else result = "mismatch";
  return {
    platform: update.platform,
    runtime: update.runtimeVersion,
    group: update.group ?? null,
    buildLabel: lastBuild ? buildLabel(lastBuild) : null,
    buildRuntime,
    result,
  };
};

export const stranded = (checks) => checks.filter((check) => check.result !== "match");

const PRODUCTION_DEPLOY_KEY_PREFIX = "prod:";

export const recommendationPlan = ({ checks, published, deployKey }) => {
  if (!published) return [];
  const production = (deployKey ?? "").startsWith(PRODUCTION_DEPLOY_KEY_PREFIX);
  return checks.map((check) => ({
    platform: check.platform,
    action: check.result !== "match" ? "stranded" : production ? "raise" : "no-key",
  }));
};

export const raisedOutcome = (platform, output) => {
  const text = (output ?? "").trim();
  const start = text.indexOf("{");
  const result = JSON.parse(start > 0 ? text.slice(start) : text);
  if (typeof result?.raised !== "boolean" || typeof result?.recommended !== "string") {
    throw new Error("appInstalls:raiseRecommended returned something other than a recommended version.");
  }
  return {
    platform,
    action: result.raised ? "raised" : "kept",
    previous: typeof result.previous === "string" ? result.previous : null,
    recommended: result.recommended,
  };
};

export const recommendationFailed = (outcomes) => outcomes.filter((outcome) => outcome.action === "failed");

const recommendationText = (version, outcome) => {
  switch (outcome.action) {
    case "raised":
      return outcome.previous ? `raised from ${outcome.previous} to ${outcome.recommended}` : `set to ${outcome.recommended}`;
    case "kept":
      return `stays ${outcome.recommended}, already at or past ${version}`;
    case "stranded":
      return "not changed, because this update reaches no store build";
    case "no-key":
      return "not changed, because the workflow has no production Convex deploy key";
    default:
      return `not changed: ${outcome.error ?? "appInstalls:raiseRecommended failed"}`;
  }
};

const shortHash = (hash) => (hash ? `\`${hash.slice(0, 7)}\`` : "none");

const headline = (version, checks) => {
  if (checks.length === 0) return `The SHED ${version} over-the-air update failed to publish`;
  const missing = stranded(checks);
  if (missing.length === 0) return `The SHED ${version} is on its way to phones`;
  const names = missing.map((check) => platformName(check.platform)).join(" and ");
  return `The SHED ${version} over the air reaches no ${names} store build`;
};

const APPLY_NOTE =
  "Phones download it the next time the app opens and switch to it on the launch after that, or when someone comes back to the app after 10 minutes away.";

const strandedNote = (checks) =>
  `${stranded(checks)
    .map((check) => platformName(check.platform))
    .join(" and ")} phones won't get this update: its runtime isn't the newest store build's, so native code (or a fingerprint input such as \`.gitignore\` or \`package.json\` scripts) changed since that build. Start **EAS Production** to build and submit, or revert the change that moved the fingerprint.`;

export const dashboardLink = ({ owner, slug }, group) =>
  `https://expo.dev/accounts/${owner}/projects/${slug}/updates/${group}`;

const recommendationLines = (version, recommendations) =>
  recommendations.map((outcome) => `${platformName(outcome.platform)} ${recommendationText(version, outcome)}`);

export const summaryMarkdown = ({ version, channel, commit, project, checks, recommendations = [] }) => {
  const lines = [`### Over the air: ${headline(version, checks)}`, ""];
  if (checks.length === 0) {
    lines.push(`Nothing was published to the ${channel} channel for \`${commit.slice(0, 7)}\`; the publish step's log says why.`);
    return lines.join("\n");
  }
  lines.push(
    `Channel \`${channel}\`, commit \`${commit.slice(0, 7)}\`.`,
    "",
    "| Platform | Update runtime | Newest finished store build | Result | Update |",
    "| --- | --- | --- | --- | --- |",
    ...checks.map(
      (check) =>
        `| ${platformName(check.platform)} | ${shortHash(check.runtime)} | ${
          check.buildLabel ? `${check.buildLabel}, ${shortHash(check.buildRuntime)}` : "none"
        } | ${RESULTS[check.result]} | ${check.group ? `[${check.group.slice(0, 8)}](${dashboardLink(project, check.group)})` : "?"} |`
    ),
    ""
  );
  lines.push(stranded(checks).length > 0 ? strandedNote(checks) : APPLY_NOTE);
  if (recommendations.length > 0) {
    lines.push(
      "",
      "**Recommended version** (phones below it see the update prompt):",
      "",
      ...recommendationLines(version, recommendations).map((line) => `- ${line}`)
    );
  }
  return lines.join("\n");
};

const html = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const chatMessage = ({ version, channel, commit, subject, commitUrl, runUrl, project, checks, recommendations = [] }) => {
  const title = headline(version, checks);
  const missing = stranded(checks);
  const detail =
    checks.length === 0
      ? "Nothing was published. Open the workflow run for the error."
      : missing.length > 0
        ? strandedNote(checks).replaceAll("**", "").replaceAll("`", "")
        : APPLY_NOTE;
  return {
    text: title,
    cardsV2: [
      {
        cardId: "eas-update",
        card: {
          header: { title, subtitle: `EAS Update, ${channel} channel` },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: "Commit",
                    text: `<a href="${commitUrl}">${commit.slice(0, 7)}</a> ${html(subject)}`,
                    wrapText: true,
                  },
                },
                ...checks.map((check) => ({
                  decoratedText: {
                    topLabel: platformName(check.platform),
                    text: `${RESULTS[check.result]}: runtime ${check.runtime.slice(0, 7)}, store build ${
                      check.buildLabel ? `${check.buildLabel} ${(check.buildRuntime ?? "").slice(0, 7)}` : "none"
                    }`,
                    wrapText: true,
                  },
                })),
                ...(recommendations.length > 0
                  ? [
                      {
                        decoratedText: {
                          topLabel: "Recommended version",
                          text: html(recommendationLines(version, recommendations).join("; ")),
                          wrapText: true,
                        },
                      },
                    ]
                  : []),
                { textParagraph: { text: html(detail) } },
                {
                  buttonList: {
                    buttons: [
                      { text: "Workflow run", onClick: { openLink: { url: runUrl } } },
                      ...checks
                        .filter((check) => check.group)
                        .map((check) => ({
                          text: `${platformName(check.platform)} update`,
                          onClick: { openLink: { url: dashboardLink(project, check.group) } },
                        })),
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
};
