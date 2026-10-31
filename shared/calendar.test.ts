import { describe, expect, test } from "vitest";
import {
  calendarCategoryLabel,
  entryProblem,
  normalizeEntry,
  parseDayKey,
  calendarCategoryOf,
  daysOf,
  eventsByDay,
  googleEventBody,
  googleEventId,
  monthGrid,
  monthWindow,
  shiftMonth,
  sydneyDayKey,
} from "./calendar";

const sydney = (iso: string) => new Date(`${iso}+11:00`).getTime();

describe("calendarCategoryOf", () => {
  const campus = { subgroups: ["UNSW"] };
  test("tags, then weekly, then the picked category, then where it's held", () => {
    expect(calendarCategoryOf(campus, [{ name: "TWIG" }])).toBe("twig");
    expect(calendarCategoryOf(campus, [{ name: "TWIG" }, { name: "PPN" }])).toBe("ppn");
    expect(calendarCategoryOf({ ...campus, weekly: { week: 1 } }, [])).toBe("weekly");
    expect(calendarCategoryOf({ ...campus, category: "marketing" }, [])).toBe("marketing");
    expect(calendarCategoryOf({ subgroups: ["SOW"] }, [])).toBe("sow");
    expect(calendarCategoryOf(campus, [{ name: "PPN" }])).toBe("campus");
    expect(calendarCategoryLabel("deadline")).toBe("Deadline");
  });
});

describe("month grid", () => {
  test("starts weeks on Monday and pads with the next and previous months", () => {
    const grid = monthGrid(2026, 10);
    expect(grid).toHaveLength(5);
    expect(grid[0][0]).toEqual({ key: "2026-09-28", day: 28, inMonth: false });
    expect(grid[0][3]).toEqual({ key: "2026-10-01", day: 1, inMonth: true });
    expect(grid[4][6]).toEqual({ key: "2026-11-01", day: 1, inMonth: false });
    expect(monthGrid(2027, 2)).toHaveLength(4);
  });

  test("the window covers the whole grid with a day to spare", () => {
    const { from, to } = monthWindow(2026, 10);
    expect(new Date(from).toISOString().slice(0, 10)).toBe("2026-09-27");
    expect(new Date(to).toISOString().slice(0, 10)).toBe("2026-11-03");
  });

  test("shiftMonth wraps the year", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2027, 1, -1)).toEqual({ year: 2026, month: 12 });
  });
});

describe("days", () => {
  test("uses Sydney's date", () => {
    expect(sydneyDayKey(sydney("2026-10-31T23:30:00"))).toBe("2026-10-31");
    expect(sydneyDayKey(new Date("2026-10-31T14:00:00Z").getTime())).toBe("2026-11-01");
  });

  test("an event shows on each day it runs, ending at midnight doesn't count the next", () => {
    expect(daysOf(sydney("2026-11-06T18:00:00"), sydney("2026-11-06T21:00:00"))).toEqual([
      "2026-11-06",
    ]);
    expect(daysOf(sydney("2026-11-06T18:00:00"), sydney("2026-11-09T00:00:00"))).toEqual([
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(daysOf(sydney("2026-11-06T18:00:00"), sydney("2027-02-01T00:00:00"))).toHaveLength(31);
  });

  test("eventsByDay sorts each day by start", () => {
    const late = { name: "late", dateStart: sydney("2026-11-06T19:00:00"), dateEnd: sydney("2026-11-06T20:00:00") };
    const camp = { name: "camp", dateStart: sydney("2026-11-05T09:00:00"), dateEnd: sydney("2026-11-07T12:00:00") };
    const byDay = eventsByDay([late, camp]);
    expect(byDay.get("2026-11-06")!.map((e) => e.name)).toEqual(["camp", "late"]);
    expect(byDay.get("2026-11-05")!.map((e) => e.name)).toEqual(["camp"]);
  });
});

describe("Google", () => {
  test("ids use only Google's allowed characters and are stable", () => {
    const id = googleEventId("k57ab9zx");
    expect(id).toMatch(/^[0-9a-v]+$/);
    expect(id).toBe(googleEventId("k57ab9zx"));
  });

  test("the event body", () => {
    const body = googleEventBody(
      { name: "PPN", dateStart: Date.UTC(2026, 10, 6, 8), dateEnd: Date.UTC(2026, 10, 6, 10), subgroups: ["SOW", "UNSW"] },
      "ppn",
      "https://theshed.sow.org.au/attendance/event/abc"
    );
    expect(body).toMatchObject({
      summary: "PPN",
      colorId: "2",
      start: { dateTime: "2026-11-06T08:00:00.000Z", timeZone: "Australia/Sydney" },
    });
    expect(body.description).toBe(
      "PPN\nSOW, UNSW\nOpen in THE SHED: https://theshed.sow.org.au/attendance/event/abc"
    );
  });
});

describe("calendar entries", () => {
  const valid = ["SOW", "UNSW"];
  const base = { name: "Posters due", dateStart: 1_000, dateEnd: 2_000, subgroups: ["SOW"] };
  test("normalizeEntry trims and drops repeats", () => {
    expect(normalizeEntry({ ...base, name: " Posters ", subgroups: ["SOW", "SOW"], notes: "  " })).toEqual({
      ...base,
      name: "Posters",
      notes: undefined,
    });
  });
  test.each([
    [{ name: "" }, "Give it a name."],
    [{ name: "x".repeat(121) }, "at most 120 characters"],
    [{ dateEnd: 1_000 }, "It has to end after it starts."],
    [{ dateEnd: 1_000 + 32 * 86_400_000 }, "at most 31 days"],
    [{ subgroups: [] }, "Pick at least one campus, or SOW."],
    [{ subgroups: ["Hogwarts"] }, "isn't a campus this year"],
    [{ notes: "x".repeat(1001) }, "Notes can be at most 1000 characters."],
  ])("%o → %s", (over, message) => {
    expect(entryProblem({ ...base, ...over }, valid)).toContain(message);
  });
  test("a good one passes", () => {
    expect(entryProblem({ ...base, subgroups: ["UNSW"], notes: "Print 200" }, valid)).toBeNull();
  });
  test("parseDayKey only accepts real days", () => {
    expect(parseDayKey("2026-11-20")).toBe("2026-11-20");
    expect(parseDayKey("2026-02-30")).toBeNull();
    expect(parseDayKey("tomorrow")).toBeNull();
    expect(parseDayKey(undefined)).toBeNull();
  });
});
