import { describe, expect, test } from "vitest";
import {
  campusLeaderLine,
  cleanExternalMentor,
  EXTERNAL_NAME_MAX,
  EXTERNAL_NOTES_MAX,
  externalMentorError,
  isCampusLeaderProfile,
  matchesSearch,
  nameKey,
  pairingsText,
  profileLine,
  sameEmailExternal,
  sameNameExternal,
} from "./mentoring";

const campusLeader = {
  assignments: [
    { role: "Student Leader", university: "Macquarie University" },
    { role: "Staff", department: "Marketing" },
  ],
};
const staff = { assignments: [{ role: "Staff", department: "Marketing" }] };
const draft = (over: Partial<Record<"name" | "email" | "phone" | "notes", string>> = {}) => ({
  name: "Pastor Paul",
  email: "",
  phone: "",
  notes: "",
  ...over,
});

describe("Campus leaders", () => {
  test("are anyone holding a university role", () => {
    expect(isCampusLeaderProfile(campusLeader)).toBe(true);
    expect(isCampusLeaderProfile(staff)).toBe(false);
    expect(isCampusLeaderProfile({})).toBe(false);
  });

  test("show only their campus roles, or every role for other leaders", () => {
    expect(campusLeaderLine(campusLeader)).toBe("Student Leader → MACQ");
    expect(campusLeaderLine(staff)).toBeNull();
    expect(profileLine(campusLeader)).toBe("Student Leader → MACQ  ·  Staff → Marketing");
    expect(profileLine({})).toBeNull();
  });
});

describe("search", () => {
  test("matches every word, in any field, ignoring case", () => {
    expect(matchesSearch("cara mac", "Cara Chen", "Student Leader → MACQ")).toBe(true);
    expect(matchesSearch("cara unsw", "Cara Chen", "Student Leader → MACQ")).toBe(false);
    expect(matchesSearch("  ", "anyone", null, undefined)).toBe(true);
  });

  test("name keys ignore case and spacing", () => {
    expect(nameKey("  Pastor   PAUL ")).toBe("pastor paul");
  });
});

describe("external mentor drafts", () => {
  test("are trimmed, lower-case their email and drop blanks", () => {
    expect(
      cleanExternalMentor(draft({ name: " Pastor  Paul ", email: " Paul@X.org ", phone: " 04 ", notes: " " }))
    ).toEqual({ name: "Pastor Paul", email: "paul@x.org", phone: "04", notes: undefined });
  });

  test("need a name, a valid email when given, and short text", () => {
    expect(externalMentorError(draft())).toBeNull();
    expect(externalMentorError(draft({ name: "  " }))).toBe("Enter their name.");
    expect(externalMentorError(draft({ name: "x".repeat(EXTERNAL_NAME_MAX + 1) }))).toMatch(
      "Keep the name under"
    );
    expect(externalMentorError(draft({ email: "paul@" }))).toBe(
      "Enter a valid email, or leave it blank."
    );
    expect(externalMentorError(draft({ email: "paul@church.org" }))).toBeNull();
    expect(externalMentorError(draft({ notes: "x".repeat(EXTERNAL_NOTES_MAX + 1) }))).toMatch(
      "Keep notes under"
    );
  });

  test("spot another mentor with the same email or name, but not the one being edited", () => {
    const externals = [
      { id: "a", name: "Pastor Paul", email: "paul@church.org" },
      { id: "b", name: "Grace Kim", email: null },
    ];
    expect(sameEmailExternal(draft({ email: "PAUL@church.org" }), externals)?.id).toBe("a");
    expect(sameEmailExternal(draft({ email: "paul@church.org" }), externals, "a")).toBeNull();
    expect(sameEmailExternal(draft(), externals)).toBeNull();
    expect(sameNameExternal(draft({ name: "grace  kim" }), externals)?.id).toBe("b");
    expect(sameNameExternal(draft({ name: "Grace Kim" }), externals, "b")).toBeNull();
    expect(sameNameExternal(draft({ name: " " }), externals)).toBeNull();
    expect(sameNameExternal(draft({ name: "Someone" }), externals)).toBeNull();
  });

  test("pairing counts read naturally", () => {
    expect(pairingsText(1)).toBe("1 pairing");
    expect(pairingsText(3)).toBe("3 pairings");
  });
});
