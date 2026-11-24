// The big-PR CodeRabbit rule from AGENTS.md, as pure functions for
// scripts/pr-status.mjs. A PR needs a CodeRabbit review only when it is big:
// more than 300 changed lines of app or Convex code (not tests, scripts,
// docs, config or pure moves), or it touches the schema, data deletion or
// migration, auth or permissions, or push or email notifications. A review
// of an earlier commit still covers the head when the head's app and Convex
// changes are the same, as after a clean merge of main.

/**
 * A changed file as GitHub's compare API lists it.
 * @typedef {{ filename: string, status: string, sha?: string, additions?: number, deletions?: number, changes?: number, patch?: string, previous_filename?: string }} ChangedFile
 * @typedef {{ big: boolean, lines: number, reasons: string[], overridden: boolean }} Size
 */

const BIG_LINES = 300;

const TEST = /(^|\/)(__tests__|test|tests)\/|\.test\.[cm]?[jt]sx?$/;

/** App or Convex source: what the line count and the sensitive areas look at. */
export const isAppCode = (path) =>
  /^(src|shared|convex)\//.test(path) && !path.startsWith("convex/_generated/") && /\.[cm]?[jt]sx?$/.test(path) && !TEST.test(path);

const AREAS = [
  { reason: "the Convex schema", path: /^convex\/schema\.ts$/ },
  { reason: "data deletion or migration", path: /delet|purge|cleanup|migrat|backfill/i, patch: /^[+-].*\b(?:db|storage)\.delete\(/m },
  { reason: "auth or permissions", path: /auth|permission|identity|acting-?as|roles?\b|access(?!ib)/i },
  { reason: "push or email notifications", path: /notif|push|mail|reminder/i },
];

/** The sensitive areas one file touches, as "<area> (<file>)". */
export const sensitiveReasons = (file) =>
  isAppCode(file.filename)
    ? AREAS.filter((area) => area.path.test(file.filename) || (area.patch && file.patch && area.patch.test(file.patch))).map(
        (area) => `${area.reason} (${file.filename})`,
      )
    : [];

const lineCount = (file) => file.changes ?? (file.additions ?? 0) + (file.deletions ?? 0);

/**
 * Is the PR big? `override` is true (--big) or false (--not-big) when the
 * agent has judged it differently from these path rules.
 * @param {ChangedFile[]} files
 * @param {boolean | null} [override]
 * @returns {Size}
 */
export const assessSize = (files, override = null) => {
  const lines = files.filter((f) => isAppCode(f.filename)).reduce((sum, f) => sum + lineCount(f), 0);
  const reasons = [...(lines > BIG_LINES ? [`${lines} changed lines of app or Convex code (over ${BIG_LINES})`] : []), ...files.flatMap(sensitiveReasons)];
  if (override !== null) return { big: override, lines, reasons: [override ? "--big" : "--not-big", ...reasons], overridden: true };
  return { big: reasons.length > 0, lines, reasons, overridden: false };
};

/**
 * What the PR does to app and Convex code: each such file's path, status
 * and resulting blob. A merge of main that doesn't touch those files leaves
 * it unchanged; a new commit to them, or a conflict resolved in them,
 * changes it. A PR with no app or Convex code (made big with --big) is
 * compared on every file instead.
 * @param {ChangedFile[]} files
 */
export const codeFingerprint = (files) => {
  const code = files.filter((f) => isAppCode(f.filename) || (f.previous_filename && isAppCode(f.previous_filename)));
  return (code.length > 0 ? code : files)
    .map((f) => `${f.status} ${f.previous_filename ? `${f.previous_filename} -> ` : ""}${f.filename} ${f.sha ?? ""}`)
    .sort()
    .join("\n");
};

/**
 * Which reviewed commit covers the head, if any.
 * @param {{ head: string, headFiles: ChangedFile[], reviewed: { sha: string, files: ChangedFile[] | null }[] }} input
 *   `reviewed` lists commits CodeRabbit reviewed, newest first; `files` is
 *   null when GitHub couldn't compare that commit.
 * @returns {{ commit: string, how: "reviewed head" | "same app and Convex changes" } | null}
 */
export const coveringReview = ({ head, headFiles, reviewed }) => {
  if (reviewed.some((r) => r.sha === head)) return { commit: head, how: "reviewed head" };
  const fingerprint = codeFingerprint(headFiles);
  const match = reviewed.find((r) => r.files && codeFingerprint(r.files) === fingerprint);
  return match ? { commit: match.sha, how: "same app and Convex changes" } : null;
};

/** Why CodeRabbit skipped a review, from its notice. Never empty. */
export const skipReason = (text) => text.match(/Review skipped:?\s*(.{0,100})/i)?.[1]?.trim() || "review skipped";

const RESTRICTED = /rate limited|review limit reached|review skipped/i;

/**
 * The commits CodeRabbit finished reviewing, newest first: each commit it
 * submitted a review on, then each its summary comment says it reviewed with
 * nothing to add ("No actionable comments", with the range "... and <sha>").
 * A comment that only names a range, as one does while a review is still
 * running or in a rate-limit or skip notice, doesn't count.
 * @param {{ reviews: { commit?: string | null, at?: string | null }[], comments: { text: string, body: string }[] }} activity
 *   CodeRabbit's own reviews and comments only.
 */
export const reviewedCommits = ({ reviews, comments }) => [
  ...reviews
    .filter((r) => r.commit)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .map((r) => /** @type {string} */ (r.commit)),
  ...comments
    .filter((c) => /no actionable comments/i.test(c.text) && !RESTRICTED.test(c.text))
    .flatMap((c) => [...c.body.matchAll(/\band ([0-9a-f]{40})\b/g)].map((m) => m[1])),
];
