import { describe, expect, it } from "vitest";
import {
  canonicalImportMemberName,
  previousStaffYearByEmailKey,
  previousStaffYearForEmail,
  staffEmailCandidates,
  uniqueStaffByEmail,
} from "./rollcallImport";

describe("staffEmailCandidates", () => {
  it("returns both SOW domains for a SOW email", () => {
    expect(staffEmailCandidates("jane.doe@sowaustralia.com")).toEqual([
      "jane.doe@sow.org.au",
      "jane.doe@sowaustralia.com",
    ]);
    expect(staffEmailCandidates("jane.doe@sow.org.au")).toEqual([
      "jane.doe@sow.org.au",
      "jane.doe@sowaustralia.com",
    ]);
  });

  it("returns a personal email unchanged and nothing for blanks", () => {
    expect(staffEmailCandidates("jane@gmail.com")).toEqual(["jane@gmail.com"]);
    expect(staffEmailCandidates(undefined)).toEqual([]);
    expect(staffEmailCandidates("not-an-email")).toEqual([]);
  });
});

describe("canonicalImportMemberName", () => {
  it("normalises Daniel Kim Snr", () => {
    expect(canonicalImportMemberName("Daniel Kim Snr")).toBe("Daniel Kim");
    expect(canonicalImportMemberName("  daniel   kim   snr ")).toBe("Daniel Kim");
  });

  it("passes through an ordinary name unchanged", () => {
    expect(canonicalImportMemberName("Normal Name")).toBe("Normal Name");
    expect(canonicalImportMemberName("  Jane   Doe  ")).toBe("Jane Doe");
  });
});

describe("previousStaffYearByEmailKey", () => {
  it("keeps the latest other year and matches both SOW domains", () => {
    const map = previousStaffYearByEmailKey(
      [
        { email: "jane.doe@sowaustralia.com", year: 2024 },
        { email: "jane.doe@sow.org.au", year: 2025 },
        { email: "jane.doe@sow.org.au", year: 2027 },
        { email: "other@sow.org.au", year: 2023 },
      ],
      2027
    );
    expect(previousStaffYearForEmail(map, "jane.doe@sow.org.au")).toBe(2025);
    expect(previousStaffYearForEmail(map, "jane.doe@sowaustralia.com")).toBe(2025);
    expect(previousStaffYearForEmail(map, "other@sow.org.au")).toBe(2023);
    expect(previousStaffYearForEmail(map, "nobody@sow.org.au")).toBeUndefined();
  });

  it("ignores later years than the viewed year", () => {
    const map = previousStaffYearByEmailKey(
      [
        { email: "jane.doe@sow.org.au", year: 2025 },
        { email: "jane.doe@sow.org.au", year: 2027 },
      ],
      2026
    );
    expect(previousStaffYearForEmail(map, "jane.doe@sow.org.au")).toBe(2025);
    expect(previousStaffYearForEmail(map, "jane.doe@sowaustralia.com")).toBe(2025);
  });
});

describe("uniqueStaffByEmail", () => {
  it("keeps one row for the two SOW spellings", () => {
    expect(
      uniqueStaffByEmail([
        { email: "jane.doe@sow.org.au", name: "Jane" },
        { email: "jane.doe@sowaustralia.com", name: "Jane AU" },
        { email: "other@sow.org.au", name: "Other" },
      ])
    ).toEqual([
      { email: "jane.doe@sow.org.au", name: "Jane" },
      { email: "other@sow.org.au", name: "Other" },
    ]);
  });
});
