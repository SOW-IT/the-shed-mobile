import { describe, expect, test } from "vitest";
import {
  ALL_SUBGROUP,
  defaultEventWindow,
  formatEventDate,
  formatSignInTime,
  subgroupLabel,
} from "./rollcall";

describe("subgroupLabel", () => {
  test("the synthetic ALL sub-group is left unchanged", () => {
    expect(subgroupLabel(ALL_SUBGROUP)).toBe("ALL");
  });

  test("a known campus collapses to its acronym", () => {
    expect(subgroupLabel("University of Sydney")).toBe("USYD");
    expect(subgroupLabel("Macquarie University")).toBe("MACQ");
  });

  test("an unknown name passes through verbatim", () => {
    expect(subgroupLabel("Some Other College")).toBe("Some Other College");
  });
});

describe("defaultEventWindow", () => {
  test("starts ~now and runs exactly two hours", () => {
    const before = Date.now();
    const { dateStart, dateEnd } = defaultEventWindow();
    const after = Date.now();
    expect(dateStart).toBeGreaterThanOrEqual(before);
    expect(dateStart).toBeLessThanOrEqual(after);
    expect(dateEnd - dateStart).toBe(2 * 60 * 60 * 1000);
  });
});

describe("formatters", () => {
  test("formatEventDate joins a date and a time with a separator", () => {
    const label = formatEventDate(new Date(2026, 5, 24, 17, 0).getTime());
    expect(label).toContain("·");
    expect(label).toMatch(/\d/);
  });

  test("formatSignInTime renders a clock time", () => {
    const label = formatSignInTime(new Date(2026, 5, 24, 17, 3).getTime());
    expect(label).toMatch(/\d/);
  });
});
