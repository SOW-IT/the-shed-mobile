import { describe, expect, test } from "vitest";
import {
  commencementStaffYearFromLevel,
  encodeYearMetadataValue,
  formatMetadataFieldValue,
  isCommencementStaffYear,
  metadataFieldAllowsCustomOptions,
  orderedSelectOptions,
  partitionSelectOptions,
  resolveCommencementStaffYear,
  sanitizeGenderValues,
  studentYearLevelFromCommencement,
  yearMetadataSortKey,
  yearOptionIdForStoredValue,
} from "./attendanceMemberMeta";

const YEAR_OPTIONS: Record<string, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "Alumni",
};

describe("student year from commencement", () => {
  test("level increments each staff year", () => {
    expect(studentYearLevelFromCommencement(2024, 2024)).toBe("1");
    expect(studentYearLevelFromCommencement(2024, 2025)).toBe("2");
    expect(studentYearLevelFromCommencement(2024, 2028)).toBe("5");
    expect(studentYearLevelFromCommencement(2024, 2029)).toBe("Alumni");
  });

  test("picking a level stores the implied commencement year", () => {
    expect(commencementStaffYearFromLevel("1", 2026)).toBe(2026);
    expect(commencementStaffYearFromLevel("3", 2026)).toBe(2024);
    expect(commencementStaffYearFromLevel("Alumni", 2026)).toBe(2021);
    expect(
      encodeYearMetadataValue("3", 2026, YEAR_OPTIONS)
    ).toBe("2024");
  });

  test("legacy option ids migrate on read", () => {
    expect(resolveCommencementStaffYear("3", 2026, YEAR_OPTIONS)).toBe(2024);
    expect(formatMetadataFieldValue("Year", "2024", 2026, YEAR_OPTIONS)).toBe(
      "3"
    );
    expect(formatMetadataFieldValue("Year", "2024", 2028, YEAR_OPTIONS)).toBe(
      "5"
    );
  });

  test("round-trips through option id for filters", () => {
    expect(
      yearOptionIdForStoredValue("2024", 2026, YEAR_OPTIONS)
    ).toBe("3");
  });
});

describe("partitionSelectOptions", () => {
  test("lists locked org options before custom ones", () => {
    const values = {
      "1": "University of Sydney",
      "2": "UNSW",
      "10": "Online",
    };
    const locked = ["University of Sydney", "UNSW"];
    const { locked: lockedOpts, custom } = partitionSelectOptions(values, locked);
    expect(lockedOpts.map((o) => o.label)).toEqual([
      "University of Sydney",
      "UNSW",
    ]);
    expect(custom.map((o) => o.label)).toEqual(["Online"]);
    expect(orderedSelectOptions(values, locked).map((o) => o.label)).toEqual([
      "University of Sydney",
      "UNSW",
      "Online",
    ]);
  });
});

describe("gender and field helpers", () => {
  test("sanitizeGenderValues removes Other", () => {
    expect(
      sanitizeGenderValues({ "1": "Male", "2": "Female", "3": "Other" })
    ).toEqual({ "1": "Male", "2": "Female" });
  });

  test("metadataFieldAllowsCustomOptions", () => {
    expect(metadataFieldAllowsCustomOptions("Campus", true)).toBe(true);
    expect(metadataFieldAllowsCustomOptions("Notes", true)).toBe(false);
    expect(metadataFieldAllowsCustomOptions("Notes", false)).toBe(true);
  });

  test("isCommencementStaffYear and yearMetadataSortKey", () => {
    expect(isCommencementStaffYear("2024")).toBe(true);
    expect(isCommencementStaffYear("3")).toBe(false);
    expect(yearMetadataSortKey("2024", 2028, YEAR_OPTIONS)).toBe("5");
    expect(yearMetadataSortKey("2021", 2028, YEAR_OPTIONS)).toBe("6");
    expect(
      resolveCommencementStaffYear("not-a-year", 2026, YEAR_OPTIONS)
    ).toBeNull();
    expect(formatMetadataFieldValue("Notes", "hello", 2026)).toBe("hello");
  });

  test("partitionSelectOptions respects locked id and numeric custom order", () => {
    const { locked, custom } = partitionSelectOptions(
      { USYD: "University of Sydney", "9": "Online", "10": "Hybrid" },
      ["University of Sydney"]
    );
    expect(locked.map((o) => o.id)).toEqual(["USYD"]);
    expect(custom.map((o) => o.id)).toEqual(["9", "10"]);
    const mixed = partitionSelectOptions(
      { z: "Zeta", a: "Alpha", b: "Beta" },
      ["Alpha", "Gamma"]
    );
    expect(mixed.locked.map((o) => o.label)).toEqual(["Alpha"]);
    expect(
      partitionSelectOptions(
        { x: "Extra", y: "Alpha" },
        ["Alpha"]
      ).locked.map((o) => o.label)
    ).toEqual(["Alpha"]);
    expect(
      partitionSelectOptions(
        { z: "Zulu", a: "Alpha" },
        ["z", "Alpha"]
      ).locked.map((o) => o.label)
    ).toEqual(["Alpha", "Zulu"]);
    expect(
      partitionSelectOptions(
        { z: "Zulu", m: "Mike" },
        ["z", "m"]
      ).locked.map((o) => o.label)
    ).toEqual(["Mike", "Zulu"]);
    expect(
      yearOptionIdForStoredValue("2024", 2028, { "1": "1", "2": "2" })
    ).toBe("");
  });
});
