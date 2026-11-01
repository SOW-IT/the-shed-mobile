const PLATFORMS = ["ios", "android"];
const PLATFORM_NAMES = { ios: "iOS", android: "Android" };

const RESULTS = {
  changed: "Native code changed, building",
  "no-earlier-build": "No finished store build to compare with, building",
  "no-recorded-fingerprint": "The last store build has no recorded fingerprint, building",
  "not-submitted": "Unchanged, but that build has no finished store submission, building again",
  "not-published": "Unchanged, but this commit isn't published over the air for it yet, building",
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
  else if (!commit || publishedCommit !== commit) reason = "not-published";
  else if (force) reason = "forced";
  else reason = "unchanged";
  return {
    platform,
    current,
    last,
    lastLabel: lastBuild ? buildLabel(lastBuild) : null,
    reason,
    build: reason !== "unchanged",
  };
};

export const easPlatformArg = (decisions) => {
  const built = decisions.filter((decision) => decision.build).map((decision) => decision.platform);
  if (built.length === 0) return "none";
  return built.length === PLATFORMS.length ? "all" : built[0];
};

const shortHash = (hash) => (hash ? `\`${hash.slice(0, 7)}\`` : "none");

export const summaryMarkdown = (profile, decisions) => {
  const rows = decisions.map(
    (decision) =>
      `| ${platformName(decision.platform)} | ${shortHash(decision.current)} | ${
        decision.lastLabel ? `${decision.lastLabel}, ${shortHash(decision.last)}` : "none"
      } | ${RESULTS[decision.reason]} |`
  );
  const skipped = decisions.filter((decision) => !decision.build);
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
  return lines.join("\n");
};

export const skipNotice = (profile, decision) =>
  `${platformName(decision.platform)} ${profile} skipped: main's native fingerprint ${decision.current.slice(0, 7)} matches ${
    decision.lastLabel
  }, which already gets this commit over the air. Tick force to build anyway.`;
