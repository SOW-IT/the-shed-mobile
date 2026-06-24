import { describe, expect, test } from "vitest";
import {
  ALL_SUBGROUP,
  contrastingText,
  defaultAttendanceSubgroup,
  defaultEventWindow,
  eventHasEnded,
  formatEventDate,
  formatSignInTime,
  subgroupColour,
  subgroupLabel,
} from "./rollcall";

describe("subgroupLabel", () => {
  test("the synthetic ALL sub-group displays as SOW", () => {
    expect(subgroupLabel(ALL_SUBGROUP)).toBe("SOW");
  });

  test("a known campus collapses to its acronym", () => {
    expect(subgroupLabel("University of Sydney")).toBe("USYD");
    expect(subgroupLabel("Macquarie University")).toBe("MACQ");
  });

  test("an unknown name passes through verbatim", () => {
    expect(subgroupLabel("Some Other College")).toBe("Some Other College");
  });
});

describe("subgroupColour", () => {
  test("ALL uses the whole-org SOW colour", () => {
    expect(subgroupColour(ALL_SUBGROUP)).toBe("#000000");
  });

  test("a known campus uses its brand colour", () => {
    expect(subgroupColour("University of Sydney")).toBe("#B5403D");
    expect(subgroupColour("University of New South Wales")).toBe("#619445");
  });

  test("an unknown campus falls back to slate", () => {
    expect(subgroupColour("Unknown Uni")).toBe("#64748b");
  });
});

describe("contrastingText", () => {
  test("picks black on light backgrounds and white on dark ones", () => {
    expect(contrastingText("#ffffff")).toBe("#000000");
    expect(contrastingText("#000000")).toBe("#ffffff");
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

describe("defaultAttendanceSubgroup", () => {
  const subgroups = [ALL_SUBGROUP, "University of Sydney", "Macquarie University"];

  test("picks the profile campus when present in the year's list", () => {
    expect(
      defaultAttendanceSubgroup(subgroups, [
        { role: "Student Leader", university: "University of Sydney" },
      ])
    ).toBe("University of Sydney");
  });

  test("falls back to ALL when the profile has no campus", () => {
    expect(defaultAttendanceSubgroup(subgroups, [{ role: "Staff" }])).toBe(
      ALL_SUBGROUP
    );
  });

  test("returns null for an empty list", () => {
    expect(defaultAttendanceSubgroup([], [])).toBeNull();
  });
});

describe("eventHasEnded", () => {
  test("is false before dateEnd and true after", () => {
    const end = 1_700_000_000_000;
    expect(eventHasEnded(end, end - 1)).toBe(false);
    expect(eventHasEnded(end, end)).toBe(false);
    expect(eventHasEnded(end, end + 1)).toBe(true);
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
