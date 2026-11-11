import { describe, expect, test, vi } from "vitest";
import {
  auditEventName,
  eventCampusLabel,
  eventFilterLabel,
  TAG_LIST_LABEL,
  tagFilterLabels,
  canonicalSubgroup,
  contrastingText,
  defaultAttendanceSubgroup,
  defaultEventInputs,
  defaultEventWindow,
  endDateAfterStartChange,
  eventWindowFromInputs,
  capitalizeMemberName,
  displayNameFromEmail,
  eventHasEnded,
  canReverseSignIn,
  reversibleOnlyByGrace,
  SIGN_IN_UNDO_GRACE_MS,
  eventIncludesSubgroup,
  eventListFilterCount,
  eventMatchesListFilter,
  EVENT_HOST_LABEL,
  formatEventRange,
  formatSignInTime,
  isMultiDayEvent,
  memberMatchesEventCampus,
  normalizeSubgroups,
  personDisplayName,
  personKey,
  SOW_SUBGROUP,
  subgroupColour,
  subgroupLabel,
  subgroupMatches,
  isWeekliesTagName,
  tagListOf,
  WEEKLIES_TAG_NAME,
} from "./rollcall";
import { UNIVERSITY_COLOURS } from "./flow";

describe("names", () => {
  test.each([
    ["jane doe", "Jane Doe"],
    ["jane", "Jane"],
    [" jane  smith", " Jane  Smith"],
    ["Jane Doe", "Jane Doe"],
    ["JANE DOE", "JANE DOE"],
    ["McDonald", "McDonald"],
    ["mary-jane smith", "Mary-jane Smith"],
    ["", ""],
  ])("capitalizeMemberName(%j) is %j", (input, expected) => {
    expect(capitalizeMemberName(input)).toBe(expected);
  });

  test.each([
    ["first.last@sow.org.au", "First Last"],
    ["JANE.DOE@sow.org.au", "Jane Doe"],
    ["mary_anne-smith@sow.org.au", "Mary Anne Smith"],
    ["u12345@sow.org.au", null],
    ["admin@sow.org.au", null],
    ["", null],
  ])("displayNameFromEmail(%j) is %j", (email, expected) => {
    expect(displayNameFromEmail(email)).toBe(expected);
  });

  test.each([
    ["Jane Doe", "first.last@sow.org.au", "Jane Doe"],
    ["first.last@sow.org.au", "first.last@sow.org.au", "First Last"],
    [null, "first.last@sow.org.au", "First Last"],
    [undefined, "first.last@sow.org.au", "First Last"],
    [null, "u12345@sow.org.au", "u12345@sow.org.au"],
    [null, null, ""],
    ["", undefined, ""],
  ])("personDisplayName(%j, %j) is %j", (name, email, expected) => {
    expect(personDisplayName(name, email)).toBe(expected);
  });
});

describe("personKey", () => {
  test.each([
    [{ email: "First.Last@SOW.org.au" }, "staff:first.last@sow.org.au"],
    [{ email: "Jane.Doe@sowaustralia.com" }, "staff:jane.doe@sow.org.au"],
    [{ email: " jane.doe@sow.org.au " }, "staff:jane.doe@sow.org.au"],
    [{ memberId: "abc123" }, "member:abc123"],
    [{ email: "a@b.co", memberId: "abc123" }, "staff:a@b.co"],
    [{ email: "not-an-email", memberId: "m1" }, "member:m1"],
    [{}, ""],
    [{ email: null, memberId: null }, ""],
  ])("%j keys as %j", (person, expected) => {
    expect(personKey(person)).toBe(expected);
  });
});

describe("subgroups", () => {
  test("legacy ALL folds into SOW wherever a sub-group is compared", () => {
    expect(canonicalSubgroup("ALL")).toBe(SOW_SUBGROUP);
    expect(canonicalSubgroup("SOW")).toBe(SOW_SUBGROUP);
    expect(canonicalSubgroup("University of Sydney")).toBe("University of Sydney");
    expect(subgroupMatches("SOW", "ALL")).toBe(true);
    expect(subgroupMatches("University of Sydney", "University of Sydney")).toBe(true);
    expect(subgroupMatches("University of Sydney", "Macquarie University")).toBe(false);
    expect(eventIncludesSubgroup(["University of Sydney", "SOW"], SOW_SUBGROUP)).toBe(true);
    expect(eventIncludesSubgroup(["University of Sydney", "ALL"], SOW_SUBGROUP)).toBe(true);
    expect(eventIncludesSubgroup(["University of Sydney"], SOW_SUBGROUP)).toBe(false);
    expect(normalizeSubgroups(["SOW", "ALL", "University of Sydney", "SOW"])).toEqual([
      SOW_SUBGROUP,
      "University of Sydney",
    ]);
  });

  test.each([
    [SOW_SUBGROUP, "SOW", UNIVERSITY_COLOURS.SOW],
    ["ALL", "SOW", UNIVERSITY_COLOURS.SOW],
    ["University of Sydney", "USYD", UNIVERSITY_COLOURS.USYD],
    ["Macquarie University", "MACQ", UNIVERSITY_COLOURS.MACQ],
    ["Western Sydney University", "WSU", UNIVERSITY_COLOURS.WSU],
    ["WSU", "WSU", UNIVERSITY_COLOURS.WSU],
    ["Some Other College", "Some Other College", "#64748b"],
  ])("%j is labelled %j in its campus colour", (subgroup, label, colour) => {
    expect(subgroupLabel(subgroup)).toBe(label);
    expect(subgroupColour(subgroup)).toBe(colour);
  });
});

describe("weekly tags", () => {
  test("only a tag named Weeklies is the weekly tag", () => {
    expect(WEEKLIES_TAG_NAME).toBe("Weeklies");
    expect(isWeekliesTagName("Weeklies")).toBe(true);
    expect(isWeekliesTagName("Weekly Meeting")).toBe(false);
    expect(isWeekliesTagName("weeklies")).toBe(false);
    expect(isWeekliesTagName("Social")).toBe(false);
  });

  test("a tag with no list is an Other events tag", () => {
    expect(tagListOf({})).toBe("events");
    expect(tagListOf({ list: "events" })).toBe("events");
    expect(tagListOf({ list: "weeklies" })).toBe("weeklies");
  });
});

describe("contrastingText", () => {
  test("picks black on light backgrounds and white on dark ones", () => {
    expect(contrastingText("#ffffff")).toBe("#000000");
    expect(contrastingText("#000000")).toBe("#ffffff");
  });
});

describe("defaultEventWindow", () => {
  const at = (h: number, m: number, sec = 0) => new Date(2026, 10, 3, h, m, sec).getTime();

  test("starts at the nearest half hour and runs exactly two hours", () => {
    expect(defaultEventWindow(at(13, 37))).toEqual({ dateStart: at(13, 30), dateEnd: at(15, 30) });
    expect(defaultEventWindow(at(13, 44, 59)).dateStart).toBe(at(13, 30));
    expect(defaultEventWindow(at(13, 45)).dateStart).toBe(at(14, 0));
    expect(defaultEventWindow(at(13, 0)).dateStart).toBe(at(13, 0));
    expect(defaultEventWindow(at(13, 14, 59)).dateStart).toBe(at(13, 0));
    expect(defaultEventWindow(at(13, 15)).dateStart).toBe(at(13, 30));
  });

  test("rounds up into the next day just before midnight", () => {
    expect(defaultEventWindow(at(23, 50)).dateStart).toBe(new Date(2026, 10, 4, 0, 0).getTime());
  });
});

describe("defaultEventInputs", () => {
  test("fills today's date, the nearest half hour and two hours later", () => {
    const now = new Date(2026, 10, 3, 14, 37, 52).getTime();
    expect(defaultEventInputs(now)).toEqual({
      startDate: "2026-11-03",
      startTime: "14:30",
      endDate: "2026-11-03",
      endTime: "16:30",
    });
  });

  test("ends the next day when it starts after 10 pm", () => {
    const now = new Date(2026, 11, 31, 23, 5).getTime();
    expect(defaultEventInputs(now)).toEqual({
      startDate: "2026-12-31",
      startTime: "23:00",
      endDate: "2027-01-01",
      endTime: "01:00",
    });
  });

  test("starts now when no time is given", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 3, 9, 10) });
    try {
      expect(defaultEventInputs()).toMatchObject({ startDate: "2026-11-03", startTime: "09:00", endTime: "11:00" });
      expect(defaultEventWindow().dateStart).toBe(new Date(2026, 10, 3, 9, 0).getTime());
    } finally {
      vi.useRealTimers();
    }
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

describe("formatters", () => {
  test("formatSignInTime renders a clock time", () => {
    const label = formatSignInTime(new Date(2026, 5, 24, 17, 3).getTime());
    expect(label).toMatch(/^5:03\s?pm$/);
  });

  test("formatSignInTime puts the day in front for a multi-day event", () => {
    const ms = new Date(2026, 5, 24, 17, 3).getTime();
    const label = formatSignInTime(ms, true);
    expect(label).toMatch(/24/);
    expect(label.endsWith(formatSignInTime(ms))).toBe(true);
  });

  test("isMultiDayEvent compares calendar days, not hours", () => {
    expect(
      isMultiDayEvent(
        new Date(2026, 5, 24, 9, 0).getTime(),
        new Date(2026, 5, 24, 23, 0).getTime()
      )
    ).toBe(false);
    expect(
      isMultiDayEvent(
        new Date(2026, 5, 24, 22, 0).getTime(),
        new Date(2026, 5, 25, 1, 0).getTime()
      )
    ).toBe(true);
  });

  test("formatEventRange shows a dotted start date then a lowercased time span", () => {
    const label = formatEventRange(
      new Date(2026, 5, 24, 17, 0).getTime(),
      new Date(2026, 5, 24, 19, 0).getTime()
    );
    expect(label).toMatch(/^24\.06\.26, 5:00\s?pm - 7:00\s?pm$/);
    expect(label).toContain(" - ");
    expect(label).not.toContain("26.06.26");
    expect(label).toBe(label.toLowerCase());
  });

  test("formatEventRange names the end date when the event runs over several days", () => {
    const label = formatEventRange(
      new Date(2026, 5, 24, 17, 0).getTime(),
      new Date(2026, 5, 26, 12, 0).getTime()
    );
    expect(label).toMatch(/^24\.06\.26, .+ - 26\.06\.26, /);
  });
});

describe("multi-day schedule", () => {
  test("builds a window that ends on a later day", () => {
    expect(
      eventWindowFromInputs({
        startDate: "2026-10-10",
        startTime: "17:00",
        endDate: "2026-10-12",
        endTime: "12:00",
      })
    ).toEqual({
      dateStart: new Date(2026, 9, 10, 17, 0).getTime(),
      dateEnd: new Date(2026, 9, 12, 12, 0).getTime(),
    });
  });

  test("an overnight event ends the next morning", () => {
    const window = eventWindowFromInputs({
      startDate: "2026-10-10",
      startTime: "20:00",
      endDate: "2026-10-11",
      endTime: "01:00",
    });
    expect(window).toEqual({
      dateStart: new Date(2026, 9, 10, 20, 0).getTime(),
      dateEnd: new Date(2026, 9, 11, 1, 0).getTime(),
    });
  });

  test("rejects an end that isn't after the start", () => {
    expect(
      eventWindowFromInputs({
        startDate: "2026-10-12",
        startTime: "17:00",
        endDate: "2026-10-10",
        endTime: "19:00",
      })
    ).toEqual({ error: "The event has to end after it starts." });
    expect(
      eventWindowFromInputs({
        startDate: "2026-10-10",
        startTime: "17:00",
        endDate: "2026-10-10",
        endTime: "17:00",
      })
    ).toEqual({ error: "The event has to end after it starts." });
  });

  test("rejects dates or times it can't read", () => {
    expect(
      eventWindowFromInputs({
        startDate: "2026-10-10",
        startTime: "17:00",
        endDate: "",
        endTime: "19:00",
      })
    ).toEqual({ error: "Enter valid dates (YYYY-MM-DD) and times (HH:MM)." });
  });

  test("moving the start keeps a one-day event on one day", () => {
    expect(endDateAfterStartChange("2026-10-10", "2026-10-17", "2026-10-10")).toBe(
      "2026-10-17"
    );
  });

  test("moving the start keeps a multi-day event the same length", () => {
    expect(endDateAfterStartChange("2026-10-10", "2026-10-30", "2026-10-12")).toBe(
      "2026-11-01"
    );
    expect(endDateAfterStartChange("2026-10-10", "2026-10-08", "2026-10-12")).toBe(
      "2026-10-10"
    );
  });

  test("an end already before the start snaps to the new start unless it now fits", () => {
    expect(endDateAfterStartChange("2026-10-10", "2026-10-12", "2026-10-09")).toBe(
      "2026-10-12"
    );
    expect(endDateAfterStartChange("2026-10-10", "2026-10-05", "2026-10-09")).toBe(
      "2026-10-09"
    );
    expect(endDateAfterStartChange("bad", "2026-10-05", "2026-10-09")).toBe(
      "2026-10-09"
    );
    expect(endDateAfterStartChange("2026-10-10", "2026-10-12", "")).toBe("2026-10-12");
  });

  test("an unreadable new start leaves the end alone", () => {
    expect(endDateAfterStartChange("2026-10-10", "", "2026-10-12")).toBe("2026-10-12");
  });
});

describe("undo grace", () => {
  const event = { dateEnd: 10_000_000 };
  test("during the event anything can be undone", () => {
    expect(canReverseSignIn(event, 1, 9_000_000)).toBe(true);
    expect(reversibleOnlyByGrace(event, 1, 9_000_000)).toBe(false);
  });
  test("after it ends, sign-ins made during it can be undone for 10 minutes", () => {
    const signIn = event.dateEnd - 60_000;
    const withinGrace = signIn + SIGN_IN_UNDO_GRACE_MS;
    expect(canReverseSignIn(event, signIn, withinGrace)).toBe(true);
    expect(reversibleOnlyByGrace(event, signIn, withinGrace)).toBe(true);
    expect(canReverseSignIn(event, signIn, withinGrace + 1)).toBe(false);
  });
  test("retroactive sign-ins after the end stay undoable and aren't a grace case", () => {
    const signIn = event.dateEnd + 1;
    expect(canReverseSignIn(event, signIn, signIn + 3 * SIGN_IN_UNDO_GRACE_MS)).toBe(true);
    expect(reversibleOnlyByGrace(event, signIn, signIn + 1)).toBe(false);
  });
});

describe("tag filter labels", () => {
  test("name the list only for tags whose name is in both lists", () => {
    expect(
      tagFilterLabels([
        { name: "BAM", list: "weeklies" },
        { name: "bam ", list: "events" },
        { name: "Camp" },
        { name: "PPN", list: "weeklies" },
      ])
    ).toEqual(["BAM (Weeklies)", "bam  (Other events)", "Camp", "PPN"]);
    expect(TAG_LIST_LABEL).toEqual({ weeklies: "Weeklies", events: "Other events" });
    expect(tagFilterLabels([])).toEqual([]);
  });
});

describe("event campus labels", () => {
  test("short campus labels, de-duplicated", () => {
    expect(eventCampusLabel(["University of Sydney", "ALL", "SOW"])).toBe("USYD, SOW");
    expect(eventCampusLabel([])).toBe("");
  });

  test("audit names quote the event and add its campus", () => {
    expect(auditEventName({ name: "S2W5", subgroups: ["University of Sydney"] })).toBe(
      '"S2W5" (USYD)'
    );
    expect(auditEventName({ name: "Camp", subgroups: [] })).toBe('"Camp"');
    expect(auditEventName(null)).toBe('"an event"');
  });

  test("filter labels add the campus and the Sydney date", () => {
    const lateUtc = Date.UTC(2026, 7, 11, 15, 30);
    expect(
      eventFilterLabel({ name: "S2W5", subgroups: ["University of Sydney"], dateStart: lateUtc })
    ).toBe("S2W5 · USYD · 12 Aug 2026");
    expect(eventFilterLabel({ name: "Camp", subgroups: [], dateStart: Date.UTC(2026, 0, 5) })).toBe(
      "Camp · 5 Jan 2026"
    );
  });
});

describe("event list filter", () => {
  const USYD = "University of Sydney";
  const MACQ = "Macquarie University";
  const hostedHere = { subgroups: [USYD], tagIds: ["twig", "weeklies"] };
  const sharedIn = { subgroups: [MACQ, USYD], tagIds: ["ppn"] };
  const untagged = { subgroups: [USYD] };

  test("no filter keeps every event of the campus and nothing else", () => {
    expect(eventMatchesListFilter(hostedHere, USYD, {})).toBe(true);
    expect(eventMatchesListFilter(sharedIn, USYD, {})).toBe(true);
    expect(eventMatchesListFilter(untagged, USYD, { tagIds: [] })).toBe(true);
    expect(eventMatchesListFilter(hostedHere, MACQ, {})).toBe(false);
    expect(eventMatchesListFilter({ subgroups: [] }, USYD, {})).toBe(false);
  });

  test("tags match when the event carries any picked tag", () => {
    expect(eventMatchesListFilter(hostedHere, USYD, { tagIds: ["ppn", "twig"] })).toBe(true);
    expect(eventMatchesListFilter(sharedIn, USYD, { tagIds: ["ppn", "twig"] })).toBe(true);
    expect(eventMatchesListFilter(sharedIn, USYD, { tagIds: ["twig"] })).toBe(false);
    expect(eventMatchesListFilter(untagged, USYD, { tagIds: ["twig"] })).toBe(false);
  });

  test("host splits events this campus runs from ones shared in", () => {
    expect(eventMatchesListFilter(hostedHere, USYD, { host: "here" })).toBe(true);
    expect(eventMatchesListFilter(hostedHere, USYD, { host: "shared" })).toBe(false);
    expect(eventMatchesListFilter(sharedIn, USYD, { host: "shared" })).toBe(true);
    expect(eventMatchesListFilter(sharedIn, USYD, { host: "here" })).toBe(false);
    expect(eventMatchesListFilter({ subgroups: ["ALL"] }, SOW_SUBGROUP, { host: "here" })).toBe(true);
    expect(
      eventMatchesListFilter(sharedIn, USYD, { host: "shared", tagIds: ["twig"] })
    ).toBe(false);
  });

  test("counts each picked tag and the host choice", () => {
    expect(eventListFilterCount({})).toBe(0);
    expect(eventListFilterCount({ tagIds: ["a", "b"] })).toBe(2);
    expect(eventListFilterCount({ tagIds: ["a"], host: "shared" })).toBe(2);
    expect(EVENT_HOST_LABEL).toEqual({ here: "Hosted here", shared: "Shared with us" });
  });
});
