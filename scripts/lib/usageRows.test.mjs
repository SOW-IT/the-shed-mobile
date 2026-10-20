import { describe, expect, test } from "vitest";
import { databaseBandwidthByDeployment } from "./usageRows.mjs";

const row = (bandwidth, deployment) => {
  const cells = Array(15).fill("0.0");
  cells[5] = bandwidth;
  cells[12] = deployment;
  return cells;
};

describe("databaseBandwidthByDeployment", () => {
  test("sums bandwidth per deployment from strings and numbers", () => {
    const totals = databaseBandwidthByDeployment([row("6.0E8", "prod"), row(4e8, "prod"), row("1.5E8", " dev ")]);
    expect(Object.fromEntries(totals)).toEqual({ prod: 1e9, dev: 1.5e8 });
  });

  test("an empty response is no usage", () => {
    expect(databaseBandwidthByDeployment([]).size).toBe(0);
  });

  test.each([
    ["a blank bandwidth", row("", "prod")],
    ["a whitespace bandwidth", row("   ", "prod")],
    ["a non-numeric bandwidth", row("lots", "prod")],
    ["a negative bandwidth", row("-5", "prod")],
    ["an infinite bandwidth", row("Infinity", "prod")],
    ["a missing bandwidth", row(undefined, "prod")],
    ["a null bandwidth", row(null, "prod")],
    ["a blank deployment", row("1", "   ")],
    ["a missing deployment", row("1", undefined)],
    ["a row that is not a list", { bandwidth: 1 }],
  ])("refuses %s", (_label, bad) => {
    expect(() => databaseBandwidthByDeployment([row("1", "prod"), bad])).toThrow(/Usage row 1/);
  });
});
