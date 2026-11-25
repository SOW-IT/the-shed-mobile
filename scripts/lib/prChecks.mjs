const REQUIRED_CHECKS = [
  { label: "ci", test: (name) => name === "ci" },
  { label: "Web sweep", test: (name) => /^Web sweep\b/.test(name) },
];

export const requiredNotPassed = (checks, required = REQUIRED_CHECKS) =>
  required.filter((r) => !checks.some((c) => r.test(c.name) && c.state === "SUCCESS")).map((r) => r.label);
