import { describe, expect, test } from "vitest";
import {
  ALL_SUBGROUP,
  canonicalSubgroup,
  compareAttendanceFrequency,
  contrastingText,
  defaultAttendanceSubgroup,
  defaultEventWindow,
  displayNameFromEmail,
  eventHasEnded,
  eventIncludesSubgroup,
  formatEventDate,
  formatEventRange,
  formatSignInTime,
  memberMatchesEventCampus,
  normalizeSubgroups,
  personDisplayName,
  nextDateForWeekday,
  SOW_SUBGROUP,
  subgroupColour,
  subgroupLabel,
  subgroupMatches,
  weeklyMeetingSlot,
} from "./rollcall";

describe("displayNameFromEmail", () => {
  test("title-cases a first.last local part", () => {
    expect(displayNameFromEmail("first.last@sow.org.au")).toBe("First Last");
    expect(displayNameFromEmail("JANE.DOE@sow.org.au")).toBe("Jane Doe");
    expect(displayNameFromEmail("mary_anne-smith@sow.org.au")).toBe("Mary Anne Smith");
  });

  test("returns null for non-name-shaped addresses", () => {
    expect(displayNameFromEmail("u12345@sow.org.au")).toBeNull();
    expect(displayNameFromEmail("admin@sow.org.au")).toBeNull();
    expect(displayNameFromEmail("")).toBeNull();
  });
});

describe("personDisplayName", () => {
  test("keeps a real stored name", () => {
    expect(personDisplayName("Jane Doe", "first.last@sow.org.au")).toBe("Jane Doe");
  });

  test("derives a name when the stored name is the email", () => {
    expect(personDisplayName("first.last@sow.org.au", "first.last@sow.org.au")).toBe(
      "First Last"
    );
    expect(personDisplayName(null, "first.last@sow.org.au")).toBe("First Last");
    expect(personDisplayName(undefined, "first.last@sow.org.au")).toBe("First Last");
  });

  test("falls back to the raw email when no name can be derived", () => {
    expect(personDisplayName(null, "u12345@sow.org.au")).toBe("u12345@sow.org.au");
  });

  test("returns an empty string when there is neither a name nor an email", () => {
    expect(personDisplayName(null, null)).toBe("");
    expect(personDisplayName("", undefined)).toBe("");
  });
});

describe("weeklyMeetingSlot", () => {
  test("maps each campus to its weekly meeting slot", () => {
    expect(weeklyMeetingSlot("Macquarie University")).toEqual({
      weekday: 3,
      startHour: 16,
      endHour: 18,
    });
    expect(weeklyMeetingSlot("University of New South Wales")).toEqual({
      weekday: 3,
      startHour: 17,
      endHour: 19,
    });
    expect(weeklyMeetingSlot("University of Technology, Sydney")).toEqual({
      weekday: 2,
      startHour: 17,
      endHour: 19,
    });
    expect(weeklyMeetingSlot("University of Sydney")).toEqual({
      weekday: 2,
      startHour: 17,
      endHour: 19,
    });
  });

  test("returns null for sub-groups without a slot", () => {
    expect(weeklyMeetingSlot(SOW_SUBGROUP)).toBeNull();
    expect(weeklyMeetingSlot("Unknown University")).toBeNull();
  });
});

describe("nextDateForWeekday", () => {
  test("returns the same day when the weekday already matches", () => {
    // 2026-06-24 is a Wednesday (getDay() === 3).
    const wed = new Date(2026, 5, 24);
    const next = nextDateForWeekday(3, wed);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(5);
    expect(next.getDate()).toBe(24);
  });

  test("advances to the next matching weekday otherwise", () => {
    // From Wed 2026-06-24, the next Tuesday (2) is 2026-06-30.
    const next = nextDateForWeekday(2, new Date(2026, 5, 24));
    expect(next.getDate()).toBe(30);
    expect(next.getDay()).toBe(2);
  });
});

describe("subgroupMatches", () => {
  test("same canonical form matches", () => {
    expect(subgroupMatches("SOW", "ALL")).toBe(true);
    expect(subgroupMatches("University of Sydney", "University of Sydney")).toBe(true);
    expect(subgroupMatches("University of Sydney", "Macquarie University")).toBe(false);
  });
});

describe("canonicalSubgroup", () => {
  test("folds legacy ALL to SOW", () => {
    expect(canonicalSubgroup("ALL")).toBe(SOW_SUBGROUP);
    expect(canonicalSubgroup("SOW")).toBe(SOW_SUBGROUP);
    expect(canonicalSubgroup("University of Sydney")).toBe("University of Sydney");
  });
});

describe("eventIncludesSubgroup", () => {
  test("matches org-wide events whether stored as SOW or ALL", () => {
    expect(eventIncludesSubgroup(["University of Sydney", "SOW"], SOW_SUBGROUP)).toBe(
      true
    );
    expect(eventIncludesSubgroup(["University of Sydney", "ALL"], SOW_SUBGROUP)).toBe(
      true
    );
    expect(eventIncludesSubgroup(["University of Sydney"], SOW_SUBGROUP)).toBe(false);
  });
});

describe("normalizeSubgroups", () => {
  test("dedupes and canonicalizes", () => {
    expect(
      normalizeSubgroups(["SOW", "ALL", "University of Sydney", "SOW"])
    ).toEqual([SOW_SUBGROUP, "University of Sydney"]);
  });
});

describe("subgroupLabel", () => {
  test("the synthetic ALL sub-group displays as SOW", () => {
    expect(subgroupLabel(SOW_SUBGROUP)).toBe("SOW");
    expect(subgroupLabel("ALL")).toBe("SOW");
    expect(ALL_SUBGROUP).toBe(SOW_SUBGROUP);
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
  test("SOW uses the whole-org colour", () => {
    expect(subgroupColour(SOW_SUBGROUP)).toBe("#000000");
    expect(subgroupColour("ALL")).toBe("#000000");
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
  const subgroups = [SOW_SUBGROUP, "University of Sydney", "Macquarie University"];

  test("picks the profile campus when present in the year's list", () => {
    expect(
      defaultAttendanceSubgroup(subgroups, [
        { role: "Student Leader", university: "University of Sydney" },
      ])
    ).toBe("University of Sydney");
  });

  test("falls back to SOW when the profile has no campus", () => {
    expect(defaultAttendanceSubgroup(subgroups, [{ role: "Staff" }])).toBe(
      SOW_SUBGROUP
    );
  });

  test("returns null for an empty list", () => {
    expect(defaultAttendanceSubgroup([], [])).toBeNull();
  });

  test("returns first subgroup when assignments is undefined", () => {
    expect(defaultAttendanceSubgroup(subgroups, undefined)).toBe(SOW_SUBGROUP);
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

describe("memberMatchesEventCampus", () => {
  const usyd = new Set([SOW_SUBGROUP, "University of Sydney"]);

  test("matches metadata university or org campuses", () => {
    expect(
      memberMatchesEventCampus(usyd, {
        university: "University of Sydney",
        campuses: [],
      })
    ).toBe(true);
    expect(
      memberMatchesEventCampus(usyd, {
        campuses: ["University of Sydney"],
      })
    ).toBe(true);
    expect(
      memberMatchesEventCampus(usyd, {
        university: "Macquarie University",
        campuses: [],
      })
    ).toBe(false);
  });
});

describe("compareAttendanceFrequency", () => {
  test("prioritises tag history, then subgroup, campus, total, and recency", () => {
    const frequent = {
      tagMatches: 3,
      subgroupMatches: 2,
      total: 10,
      latest: 100,
    };
    const sameTag = {
      tagMatches: 3,
      subgroupMatches: 1,
      total: 20,
      latest: 200,
    };
    const campusPeer = {
      tagMatches: 0,
      subgroupMatches: 0,
      total: 1,
      latest: 50,
    };

    expect(
      compareAttendanceFrequency(frequent, sameTag, true, true, "A", "B")
    ).toBeLessThan(0);
    expect(
      compareAttendanceFrequency(sameTag, frequent, true, true, "B", "A")
    ).toBeGreaterThan(0);
    expect(
      compareAttendanceFrequency(campusPeer, undefined, true, false, "C", "D")
    ).toBeLessThan(0);
    expect(
      compareAttendanceFrequency(
        { tagMatches: 0, subgroupMatches: 0, total: 5, latest: 1 },
        { tagMatches: 0, subgroupMatches: 0, total: 2, latest: 9 },
        false,
        false,
        "E",
        "F"
      )
    ).toBeLessThan(0);

    // latestDelta branch: same total, higher latest wins (a comes first → negative)
    expect(
      compareAttendanceFrequency(
        { tagMatches: 0, subgroupMatches: 0, total: 5, latest: 200 },
        { tagMatches: 0, subgroupMatches: 0, total: 5, latest: 100 },
        false,
        false,
        "G",
        "H"
      )
    ).toBeLessThan(0);

    // localeCompare branch: all scores identical, sort by name
    expect(
      compareAttendanceFrequency(
        { tagMatches: 0, subgroupMatches: 0, total: 5, latest: 100 },
        { tagMatches: 0, subgroupMatches: 0, total: 5, latest: 100 },
        false,
        false,
        "Alice",
        "Bob"
      )
    ).toBeLessThan(0);
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

  test("formatEventRange shows a dotted start date then a lowercased time span", () => {
    const label = formatEventRange(
      new Date(2026, 5, 24, 17, 0).getTime(),
      new Date(2026, 5, 24, 19, 0).getTime()
    );
    // Date is built from local components, so it's stable across timezones:
    // zero-padded day.month and a two-digit year.
    expect(label).toMatch(/^24\.06\.26, /);
    // Start and end times joined by a hyphen, and the whole label lowercased.
    expect(label).toContain(" - ");
    expect(label).toBe(label.toLowerCase());
  });
});
