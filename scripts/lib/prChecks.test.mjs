import { describe, expect, it } from "vitest";
import { requiredNotPassed } from "./prChecks.mjs";

const SWEEP = "Web sweep (every screen, signed out and as three roles)";

describe("requiredNotPassed", () => {
  it("is empty once both CI jobs have succeeded", () => {
    expect(requiredNotPassed([{ name: "ci", state: "SUCCESS" }, { name: SWEEP, state: "SUCCESS" }, { name: "CodeRabbit", state: "SKIPPED" }])).toEqual([]);
  });

  it("names a job that hasn't appeared yet, even when another check has passed", () => {
    expect(requiredNotPassed([{ name: "Vercel", state: "SUCCESS" }])).toEqual(["ci", "Web sweep"]);
    expect(requiredNotPassed([{ name: "ci", state: "SUCCESS" }])).toEqual(["Web sweep"]);
  });

  it("doesn't count a skipped, neutral or running job as passed", () => {
    expect(requiredNotPassed([{ name: "ci", state: "SKIPPED" }, { name: SWEEP, state: "NEUTRAL" }])).toEqual(["ci", "Web sweep"]);
    expect(requiredNotPassed([{ name: "ci", state: "IN_PROGRESS" }, { name: SWEEP, state: "SUCCESS" }])).toEqual(["ci"]);
  });
});
