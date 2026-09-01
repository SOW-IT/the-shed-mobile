import { describe, expect, it } from "vitest";
import {
  canonicalImportMemberName,
  canonicalStaffEmail,
  canonicalStaffEmailFromLegacy,
  previousStaffYearByEmailKey,
  previousStaffYearForEmail,
  resolveImportStaffEmail,
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

describe("canonicalStaffEmail", () => {
  it("maps a dotted legacy address to the staff domain", () => {
    expect(canonicalStaffEmail("jane.doe@sowaustralia.com")).toBe(
      "jane.doe@sow.org.au"
    );
    expect(canonicalStaffEmail("  Jane.Doe@SOWAUSTRALIA.com ")).toBe(
      "jane.doe@sow.org.au"
    );
  });

  it("leaves canonical, dotless, and non-email values alone", () => {
    expect(canonicalStaffEmail("jane.doe@sow.org.au")).toBe("jane.doe@sow.org.au");
    expect(canonicalStaffEmail("leader@sowaustralia.com")).toBe(
      "leader@sowaustralia.com"
    );
    expect(canonicalStaffEmail(undefined)).toBeUndefined();
    expect(canonicalStaffEmail("not-an-email")).toBeUndefined();
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

describe("canonicalStaffEmailFromLegacy", () => {
  it("maps sowaustralia.com to sow.org.au", () => {
    expect(
      canonicalStaffEmailFromLegacy({
        name: "Jacquie Liu",
        email: "jacquie.liu@sowaustralia.com",
      })
    ).toBe("jacquie.liu@sow.org.au");
  });

  it("maps Daniel Kim Snr by name", () => {
    expect(
      canonicalStaffEmailFromLegacy({
        name: "Daniel Kim Snr",
        email: "daniel.kim@sowaustralia.com",
      })
    ).toBe("daniel.kim@sow.org.au");
  });

  it("ignores non-legacy emails", () => {
    expect(
      canonicalStaffEmailFromLegacy({
        name: "Someone",
        email: "daniel.kim@sow.org.au",
      })
    ).toBeNull();
  });
});

describe("resolveImportStaffEmail", () => {
  it("prefers mapped staff email", () => {
    expect(
      resolveImportStaffEmail({
        name: "Nathan Shi",
        email: "nathan.shi@sowaustralia.com",
      })
    ).toBe("nathan.shi@sow.org.au");
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
