import { describe, expect, test } from "vitest";
import { type MetadataFieldLike } from "./attendanceMemberMeta";
import {
  insightsRoleOf,
  markedRoleIn,
  markedRoleOf,
  memberRole,
  roleRules,
  withMarkedRole,
} from "./memberRole";

const UNSW = "University of New South Wales";
const USYD = "University of Sydney";
const fields: MetadataFieldLike[] = [
  { _id: "role", key: "Role", values: { "2": "Member", "8": "Alumni", "9": "Guest", "10": "Newcomer" } },
  { _id: "campus", key: "Campus", values: { "1": UNSW } },
];

describe("hand-set Roles", () => {
  test("only Visitor and Alumni count", () => {
    expect(markedRoleOf("Visitor")).toBe("Visitor");
    expect(markedRoleOf(" Alumni ")).toBe("Alumni");
    expect(markedRoleOf("Guest")).toBeNull();
    expect(markedRoleOf("Newcomer")).toBeNull();
    expect(markedRoleOf(undefined)).toBeNull();
  });

  test("reads the Role saved on a member, as an option or a label", () => {
    expect(markedRoleIn(fields, { role: "8" })).toBe("Alumni");
    expect(markedRoleIn(fields, { role: "Visitor" })).toBe("Visitor");
    expect(markedRoleIn(fields, { role: "10" })).toBeNull();
    expect(markedRoleIn(fields, { role: "9" })).toBeNull();
    expect(markedRoleIn(fields, {})).toBeNull();
    expect(markedRoleIn([], { role: "8" })).toBeNull();
  });

  test("saving keeps a Visitor or Alumni (as its option when there is one) and drops anything else", () => {
    expect(withMarkedRole(fields, { role: "Alumni", campus: "1" }, {})).toEqual({ role: "8", campus: "1" });
    expect(withMarkedRole(fields, { role: "Visitor" }, {})).toEqual({ role: "Visitor" });
    expect(withMarkedRole(fields, { role: "10" }, {})).toEqual({});
    expect(withMarkedRole(fields, { role: "Newcomer" }, undefined)).toEqual({});
    expect(withMarkedRole(fields, {}, { role: "8" })).toEqual({});
  });

  test("a Role saved before is left alone until it's changed", () => {
    expect(withMarkedRole(fields, { role: "2", campus: "1" }, { role: "2" })).toEqual({ role: "2", campus: "1" });
    expect(withMarkedRole([], { role: "2" }, {})).toEqual({ role: "2" });
  });
});

describe("Role from Insights", () => {
  test("their home campus's category comes first", () => {
    const seen = [
      { subgroup: USYD, category: "regular" as const },
      { subgroup: UNSW, category: "irregular" as const },
    ];
    expect(insightsRoleOf(seen, UNSW)).toBe("Irregular");
  });

  test("otherwise the campus where they come most", () => {
    expect(
      insightsRoleOf(
        [
          { subgroup: USYD, category: "visitor" },
          { subgroup: UNSW, category: "newcomer" },
        ],
        undefined
      )
    ).toBe("Newcomer");
    expect(insightsRoleOf([{ subgroup: USYD, category: "regular" }], UNSW)).toBe("Regular");
  });

  test("leader and staff categories aren't Insights Roles, and nothing seen is none", () => {
    expect(insightsRoleOf([{ subgroup: UNSW, category: "leader" }], UNSW)).toBeNull();
    expect(insightsRoleOf([{ subgroup: UNSW, category: "staff" }], UNSW)).toBeNull();
    expect(insightsRoleOf([], UNSW)).toBeNull();
  });

  test("staff role, then a hand-set one, then Insights, then Member", () => {
    expect(memberRole({ staffRole: "Student Leader", marked: "Alumni", insights: "Regular" })).toEqual({
      role: "Student Leader",
      source: "staff",
    });
    expect(memberRole({ marked: "Alumni", insights: "Regular" })).toEqual({ role: "Alumni", source: "marked" });
    expect(memberRole({ insights: "Regular" })).toEqual({ role: "Regular", source: "insights" });
    expect(memberRole({})).toEqual({ role: "Member", source: "none" });
  });
});

describe("the rules the info button shows", () => {
  test("quote the campus's settings", () => {
    const rules = roleRules({
      regularShare: 0.6,
      carryOverWeeklies: 3,
      newcomerPromoteWeeklies: 5,
      visitorMinWeeklies: 4,
    });
    expect(rules.map((r) => r.role)).toEqual([
      "Staff and leaders",
      "Regular",
      "Newcomer",
      "Irregular",
      "Visitor",
      "Alumni",
      "Member",
    ]);
    const rule = (role: string) => rules.find((r) => r.role === role)!.rule;
    expect(rule("Regular")).toContain("60% or more");
    expect(rule("Regular")).toContain("until 3 have been held");
    expect(rule("Newcomer")).toContain("After 5 or more");
    expect(rule("Visitor")).toContain("fewer than 4");
  });

  test("say half for the default share", () => {
    expect(roleRules().find((r) => r.role === "Regular")!.rule).toContain("half or more");
  });
});
