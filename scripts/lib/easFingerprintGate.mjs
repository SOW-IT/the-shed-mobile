const PLATFORMS = ["ios", "android"];
const PLATFORM_NAMES = { ios: "iOS", android: "Android" };

const RESULTS = {
  changed: "Native code changed, building",
  "no-earlier-build": "No finished store build to compare with, building",
  "no-recorded-fingerprint": "The last store build has no recorded fingerprint, building",
  "not-submitted": "Unchanged, but that build has no finished store submission, building again",
  "not-published": "Unchanged, publishing this commit over the air instead of building",
  forced: "Unchanged, building because force was ticked",
  unchanged: "Unchanged, skipped",
};

export const platformName = (platform) => PLATFORM_NAMES[platform] ?? platform;

export const requestedPlatforms = (input) => {
  const value = (input ?? "").trim() || "both";
  if (value === "both" || value === "all") return [...PLATFORMS];
  if (PLATFORMS.includes(value)) return [value];
  throw new Error(`Unknown platform "${input}"; expected both, ios or android.`);
};

export const buildFingerprint = (build) =>
  build?.runtime?.version ?? build?.runtimeVersion ?? build?.fingerprint?.hash ?? null;

export const submissionFinished = (submissions, buildId) =>
  Array.isArray(submissions) &&
  submissions.some((submission) => submission?.buildId === buildId && submission?.status === "FINISHED");

export const updateCommit = (updates, platform) =>
  (Array.isArray(updates) ? updates : []).find((update) => update?.platform === platform)?.gitCommitHash ?? null;

const buildLabel = (build) => `${build.appVersion ?? "?"} (build ${build.appBuildVersion ?? "?"})`;

export const decidePlatform = ({ platform, current, lastBuild, submitted, publishedCommit, commit, force }) => {
  if (typeof current !== "string" || current === "") {
    throw new Error(`EAS returned no fingerprint for ${platformName(platform)}.`);
  }
  const last = lastBuild ? buildFingerprint(lastBuild) : null;
  let reason;
  if (!lastBuild) reason = "no-earlier-build";
  else if (!last) reason = "no-recorded-fingerprint";
  else if (last !== current) reason = "changed";
  else if (!submitted) reason = "not-submitted";
  else if (force) reason = "forced";
  else if (!commit || publishedCommit !== commit) reason = "not-published";
  else reason = "unchanged";
  return {
    platform,
    current,
    last,
    lastLabel: lastBuild ? buildLabel(lastBuild) : null,
    reason,
    build: reason !== "unchanged" && reason !== "not-published",
    update: reason === "not-published",
  };
};

const platformArg = (decisions, key) => {
  const chosen = decisions.filter((decision) => decision[key]).map((decision) => decision.platform);
  if (chosen.length === 0) return "none";
  return chosen.length === PLATFORMS.length ? "all" : chosen[0];
};

export const easPlatformArg = (decisions) => platformArg(decisions, "build");

export const updatePlatformArg = (decisions) => platformArg(decisions, "update");

const shortHash = (hash) => (hash ? `\`${hash.slice(0, 7)}\`` : "none");

export const summaryMarkdown = (profile, decisions) => {
  const rows = decisions.map(
    (decision) =>
      `| ${platformName(decision.platform)} | ${shortHash(decision.current)} | ${
        decision.lastLabel ? `${decision.lastLabel}, ${shortHash(decision.last)}` : "none"
      } | ${RESULTS[decision.reason]} |`
  );
  const skipped = decisions.filter((decision) => decision.reason === "unchanged");
  const updated = decisions.filter((decision) => decision.update);
  const lines = [
    `### Native fingerprint check: ${profile}`,
    "",
    "| Platform | main | Last finished store build | Result |",
    "| --- | --- | --- | --- |",
    ...rows,
  ];
  if (skipped.length > 0) {
    lines.push(
      "",
      `${skipped.map((decision) => platformName(decision.platform)).join(" and ")} ${
        skipped.length === 1 ? "has" : "have"
      } the same native code as the last store build, which reached the store, and this commit is already published over the air to it. Run the workflow again with **force** ticked to build anyway.`
    );
  }
  if (updated.length > 0) {
    lines.push(
      "",
      `${updated.map((decision) => platformName(decision.platform)).join(" and ")} ${
        updated.length === 1 ? "has" : "have"
      } the same native code as the last store build, which reached the store, so this commit goes out over the air to it with \`eas update\` instead of a new store build. Run the workflow again with **force** ticked to build anyway.`
    );
  }
  return lines.join("\n");
};

export const updateNotice = (profile, decision) =>
  `${platformName(decision.platform)} ${profile} not built: main's native fingerprint ${decision.current.slice(0, 7)} matches ${
    decision.lastLabel
  }, so this commit is published over the air to it instead. Tick force to build anyway.`;

export const skipNotice = (profile, decision) =>
  `${platformName(decision.platform)} ${profile} skipped: main's native fingerprint ${decision.current.slice(0, 7)} matches ${
    decision.lastLabel
  }, which already gets this commit over the air. Tick force to build anyway.`;
