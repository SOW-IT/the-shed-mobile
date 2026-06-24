import { describe, expect, it } from "vitest";
import {
  canonicalImportMemberName,
  canonicalStaffEmail,
  canonicalStaffEmailFromLegacy,
  resolveImportStaffEmail,
} from "./rollcallImport";

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
