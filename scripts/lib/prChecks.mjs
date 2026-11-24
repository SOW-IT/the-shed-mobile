// Which CI checks a PR must pass before pr-status.mjs calls it done.

/**
 * The jobs in .github/workflows/ci.yml, by the name GitHub shows for each.
 * Each must appear on the PR and succeed: one that hasn't started yet, or
 * was skipped, doesn't count.
 */
export const REQUIRED_CHECKS = [
  { label: "ci", test: (name) => name === "ci" },
  { label: "Web sweep", test: (name) => /^Web sweep\b/.test(name) },
];

/**
 * The required checks that haven't passed on this head, by label.
 * @param {{ name: string, state: string }[]} checks
 */
export const requiredNotPassed = (checks, required = REQUIRED_CHECKS) =>
  required.filter((r) => !checks.some((c) => r.test(c.name) && c.state === "SUCCESS")).map((r) => r.label);
