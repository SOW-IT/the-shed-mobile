import { describe, expect, test } from "vitest";
import {
  checkInNameMatch,
  commencementForLevel,
  isCheckInYearLevel,
  levelForCommencement,
  parseCheckInDetails,
  searchMembers,
  suggestMembers,
  yearLevelLabel,
} from "./checkInMatch";

const USYD = "University of Sydney";
const UNSW = "University of New South Wales";

const members = [
  { memberId: "a", name: "Ann Lee", university: USYD },
  { memberId: "b", name: "Ann Lee", university: UNSW },
  { memberId: "c", name: "Annabel Lee", university: null },
  { memberId: "d", name: "Lee Ann", university: USYD },
  { memberId: "e", name: "Ann Marie Lee" },
  { memberId: "f", name: "Ben Ng", university: USYD },
  { memberId: "g", name: "Anne Lee", university: USYD },
  { memberId: "h", name: "Samuel Park", university: UNSW },
];

describe("year at uni", () => {
  test("only the listed levels count", () => {
    expect(["1", "5", "6+"].every(isCheckInYearLevel)).toBe(true);
    expect(["0", "6", "7", ""].some(isCheckInYearLevel)).toBe(false);
    expect(yearLevelLabel("6+")).toBe("Year 6+");
  });

  test("a level and a commencement year turn into each other for a given year", () => {
    expect(commencementForLevel("1", 2026)).toBe(2026);
    expect(commencementForLevel("3", 2026)).toBe(2024);
    expect(commencementForLevel("6+", 2026)).toBe(2021);
    expect(levelForCommencement(2025, 2026)).toBe("2");
    expect(levelForCommencement(2025, 2027)).toBe("3");
    expect(levelForCommencement(2019, 2026)).toBe("6+");
    expect(levelForCommencement(2027, 2026)).toBeNull();
    expect(levelForCommencement(2025.5, 2026)).toBeNull();
  });
});

describe("matching a typed name to members", () => {
  test("adds a lone first name or surname to the shared duplicate rules", () => {
    expect(checkInNameMatch(["ann", "lee"], ["ann", "lee"])).toBe("same");
    expect(checkInNameMatch(["ann"], ["ann", "lee"])).toBe("first");
    expect(checkInNameMatch(["lee"], ["ann", "lee"])).toBe("last");
    expect(checkInNameMatch(["kim"], ["ann", "lee"])).toBeNull();
    expect(checkInNameMatch(["ann"], ["ann"])).toBe("same");
    expect(checkInNameMatch(["ann", "lee"], ["ben", "ng"])).toBeNull();
    expect(checkInNameMatch(["ann", "smith"], ["ann", "lee"])).toBeNull();
  });

  test("puts exact names first, the typed campus ahead of others, then looser matches", () => {
    const found = suggestMembers("ann  lee", USYD, members, 10);
    expect(found.map((m) => [m.memberId, m.match])).toEqual([
      ["a", "same"],
      ["b", "same"],
      ["d", "order"],
      ["e", "middle"],
      ["g", "short"],
      ["c", "short"],
    ]);
    expect(suggestMembers("Ann Leo", null, members, 1)).toEqual([{ ...members[0], match: "typo" }]);
    expect(suggestMembers("Ann Lee", UNSW, members, 2).map((m) => m.memberId)).toEqual(["b", "a"]);
    expect(suggestMembers("Ann Lee", null, members, 2).map((m) => m.memberId)).toEqual(["a", "b"]);
  });

  test("a short name or a nickname still finds people, and nonsense finds nobody", () => {
    expect(suggestMembers("Sam Park", null, members).map((m) => m.memberId)).toEqual(["h"]);
    expect(suggestMembers("Ben", USYD, members).map((m) => m.memberId)).toEqual(["f"]);
    expect(suggestMembers("  ", USYD, members)).toEqual([]);
    expect(suggestMembers("Zed Qi", USYD, members)).toEqual([]);
    expect(suggestMembers("Ann", USYD, members)).toHaveLength(4);
  });
});

describe("searching members by name", () => {
  test("every typed word starts a word in the name; first-name starts sort ahead", () => {
    expect(searchMembers("lee", members).map((m) => m.memberId)).toEqual(["d", "a", "b", "e", "c", "g"]);
    expect(searchMembers("an le", members).map((m) => m.memberId)).toEqual(["a", "b", "e", "c", "g", "d"]);
    expect(searchMembers("sam", members).map((m) => m.memberId)).toEqual(["h"]);
    expect(searchMembers("", members)).toEqual([]);
    expect(searchMembers("ann", members, 2)).toHaveLength(2);
  });
});

describe("details remembered on a phone", () => {
  test("reads back what was saved and ignores anything else", () => {
    expect(parseCheckInDetails(JSON.stringify({ name: " Ann Lee ", campus: USYD, commencementYear: 2025 }))).toEqual({
      name: "Ann Lee",
      campus: USYD,
      commencementYear: 2025,
    });
    expect(parseCheckInDetails(JSON.stringify({ name: "Ann Lee", campus: "", commencementYear: 2025.5 }))).toEqual({
      name: "Ann Lee",
      campus: null,
      commencementYear: null,
    });
    expect(parseCheckInDetails(JSON.stringify({ name: "Ann Lee" }))).toEqual({
      name: "Ann Lee",
      campus: null,
      commencementYear: null,
    });
    expect(parseCheckInDetails(null)).toBeNull();
    expect(parseCheckInDetails("not json")).toBeNull();
    expect(parseCheckInDetails("null")).toBeNull();
    expect(parseCheckInDetails("3")).toBeNull();
    expect(parseCheckInDetails(JSON.stringify({ name: "  " }))).toBeNull();
    expect(parseCheckInDetails(JSON.stringify({ name: 4 }))).toBeNull();
  });
});
