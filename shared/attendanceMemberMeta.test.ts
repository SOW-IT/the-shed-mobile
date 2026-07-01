import { describe, expect, test } from "vitest";
import {
  commencementYearFromLevel,
  encodeYearMetadataValue,
  formatMetadataFieldValue,
  isCommencementYear,
  isLockedSelectOption,
  metadataFieldAllowsCustomOptions,
  orderedRoleFilterOptions,
  orderedSelectOptions,
  partitionSelectOptions,
  resolveCommencementYear,
  roleFilterMatches,
  canonicalizeGenderOptionId,
  canonicalizeGenderValues,
  GENDER_VALUES,
  sanitizeGenderValues,
  studentYearLevelFromCommencement,
  STUDENT_YEAR_LEVELS,
  STUDENT_YEAR_VALUES,
  yearMetadataSortKey,
  yearOptionIdForStoredValue,
} from "./attendanceMemberMeta";

const YEAR_OPTIONS: Record<string, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6+",
};

describe("student year from commencement", () => {
  test("level increments each staff year, uncapped past the sixth", () => {
    expect(studentYearLevelFromCommencement(2024, 2024)).toBe("1");
    expect(studentYearLevelFromCommencement(2024, 2025)).toBe("2");
    expect(studentYearLevelFromCommencement(2024, 2028)).toBe("5");
    // No "6+" cap any more — show the actual number of years since commencement.
    expect(studentYearLevelFromCommencement(2024, 2029)).toBe("6");
    expect(studentYearLevelFromCommencement(2024, 2034)).toBe("11");
  });

  test("picking a level stores the implied commencement year", () => {
    expect(commencementYearFromLevel("1", 2026)).toBe(2026);
    expect(commencementYearFromLevel("3", 2026)).toBe(2024);
    // Levels now go up to 15.
    expect(commencementYearFromLevel("7", 2026)).toBe(2020);
    expect(commencementYearFromLevel("15", 2026)).toBe(2012);
    expect(commencementYearFromLevel("16", 2026)).toBeNull();
    // Legacy labels still resolve to a sixth year.
    expect(commencementYearFromLevel("6+", 2026)).toBe(2021);
    expect(commencementYearFromLevel("Alumni", 2026)).toBe(2021);
    expect(
      encodeYearMetadataValue("3", 2026, YEAR_OPTIONS)
    ).toBe("2024");
  });

  test("legacy option ids migrate on read", () => {
    expect(resolveCommencementYear("3", 2026, YEAR_OPTIONS)).toBe(2024);
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

  test("dropdown offers levels 1 through 15", () => {
    expect(STUDENT_YEAR_LEVELS).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8",
      "9", "10", "11", "12", "13", "14", "15",
    ]);
    expect(STUDENT_YEAR_VALUES["15"]).toBe("15");
    expect(STUDENT_YEAR_VALUES["6"]).toBe("6");
    expect(Object.keys(STUDENT_YEAR_VALUES)).toHaveLength(15);
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

  test("role filters are consolidated into Staff and Student Leader buckets", () => {
    const values = {
      "1": "Staff",
      "2": "Student Leader",
      "3": "President",
      "4": "Vice President",
      "5": "Executive",
      "6": "Head of Department",
      "7": "Member",
      "8": "Newcomer",
      "9": "Alumni",
      "10": "Volunteer",
    };
    expect(
      orderedRoleFilterOptions(values, [
        "Staff",
        "Student Leader",
        "President",
        "Vice President",
        "Executive",
        "Head of Department",
        "Volunteer",
      ]).map((o) => o.label)
    ).toEqual(["Staff", "Student Leader", "Member", "Newcomer", "Alumni"]);
    expect(roleFilterMatches("Student Leader", ["President"], null)).toBe(true);
    expect(roleFilterMatches("Student Leader", ["Executive"], null)).toBe(true);
    expect(roleFilterMatches("Student Leader", ["Staff"], null)).toBe(false);
    expect(roleFilterMatches("Staff", ["Head of Department"], null)).toBe(true);
    expect(roleFilterMatches("Staff", ["President"], null)).toBe(false);
    expect(roleFilterMatches("Staff", [], "Staff")).toBe(false);
    expect(roleFilterMatches("Staff", [], "Member")).toBe(false);
    expect(roleFilterMatches("Head of Department", [], "Head of Department")).toBe(
      true
    );
    expect(roleFilterMatches("Head of Department", [], "Staff")).toBe(false);
  });
});

describe("gender and field helpers", () => {
  test("sanitizeGenderValues removes Other by label only", () => {
    expect(
      sanitizeGenderValues({ "1": "Male", "2": "Female", "3": "Other" })
    ).toEqual({ "1": "Male", "2": "Female" });
    expect(
      sanitizeGenderValues({ "2": "Male", "3": "Female" })
    ).toEqual({ "2": "Male", "3": "Female" });
  });

  test("canonicalizeGenderValues normalises import ids", () => {
    expect(canonicalizeGenderValues({ "2": "Male", "3": "Female" })).toEqual(
      GENDER_VALUES
    );
    // Value that is neither "male" nor "female" — exercises the implicit else branch
    expect(canonicalizeGenderValues({ "5": "Custom" })).toEqual(GENDER_VALUES);
  });

  test("isLockedSelectOption returns false when lockedValues is undefined", () => {
    expect(isLockedSelectOption("id", "Label", undefined)).toBe(false);
    expect(isLockedSelectOption("id", "Label", ["Label"])).toBe(true);
    expect(isLockedSelectOption("id", "Other", ["id"])).toBe(true);
  });

  test("canonicalizeGenderOptionId maps legacy Female id", () => {
    expect(canonicalizeGenderOptionId("3", { "3": "Female" })).toBe("2");
    expect(canonicalizeGenderOptionId("2", { "2": "Male" })).toBe("1");
    // stored id is "1" or "2" but label is not male/female — pass through
    expect(canonicalizeGenderOptionId("1", { "1": "Other" })).toBe("1");
    // stored id is not "1" or "2" and label doesn't match — pass through
    expect(canonicalizeGenderOptionId("99", {})).toBe("99");
  });

  test("metadataFieldAllowsCustomOptions", () => {
    expect(metadataFieldAllowsCustomOptions("Campus", true)).toBe(true);
    expect(metadataFieldAllowsCustomOptions("Notes", true)).toBe(false);
    expect(metadataFieldAllowsCustomOptions("Notes", false)).toBe(true);
  });

  test("isCommencementYear and yearMetadataSortKey", () => {
    expect(isCommencementYear("2024")).toBe(true);
    expect(isCommencementYear("3")).toBe(false);
    // Zero-padded so a string compare orders levels numerically (e.g. "05" < "08").
    expect(yearMetadataSortKey("2024", 2028, YEAR_OPTIONS)).toBe("05");
    expect(yearMetadataSortKey("2021", 2028, YEAR_OPTIONS)).toBe("08");
    expect(yearMetadataSortKey("2021", 2028, YEAR_OPTIONS) < yearMetadataSortKey("2014", 2028, YEAR_OPTIONS)).toBe(
      true
    );
    expect(
      resolveCommencementYear("not-a-year", 2026, YEAR_OPTIONS)
    ).toBeNull();
    expect(formatMetadataFieldValue("Notes", "hello", 2026)).toBe("hello");
  });

  test("partitionSelectOptions sort covers bi-in-order branch", () => {
    // Alpha (ai=0) and Beta (ai=1) are label-matched; Xenon (ai=-1) is id-matched.
    // Placing Xenon last in the object ensures it is inserted last by the sort's
    // internal pass, so it gets compared as `a` against Alpha (bi=0) and Beta
    // (bi=1), triggering the `if (bi >= 0) return 1` branch (line 220).
    const { locked } = partitionSelectOptions(
      { a: "Alpha", b: "Beta", x: "Xenon" },
      ["Alpha", "Beta", "x"]
    );
    expect(locked.map((o) => o.label)).toEqual(["Alpha", "Beta", "Xenon"]);
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
