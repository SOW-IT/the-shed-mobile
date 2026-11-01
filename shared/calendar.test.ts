import { describe, expect, test } from "vitest";
import { universityColour } from "./flow";
import {
  calendarCategoryLabel,
  campusColourOf,
  clockTime,
  entryProblem,
  normalizeEntry,
  parseDayKey,
  runsSeveralDays,
  calendarCategoryOf,
  daysOf,
  dayBlocks,
  eventsByDay,
  googleEventBody,
  googleEventId,
  hourAfter,
  monthGrid,
  monthWindow,
  shiftDay,
  shiftMonth,
  sydneyDayKey,
  sydneyMinutes,
  weekLayout,
  weekOf,
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

describe("campusColourOf", () => {
  test("a Weekly or Campus event at one campus wears its colour", () => {
    expect(campusColourOf("weekly", ["USYD"])).toBe(universityColour("USYD"));
    expect(campusColourOf("campus", ["University of New South Wales"])).toBe(universityColour("UNSW"));
  });

  test("otherwise the category's colour stays", () => {
    expect(campusColourOf("weekly", ["USYD", "UNSW"])).toBeUndefined();
    expect(campusColourOf("campus", ["SOW"])).toBeUndefined();
    expect(campusColourOf("campus", ["ALL"])).toBeUndefined();
    expect(campusColourOf("campus", ["Somewhere new"])).toBeUndefined();
    expect(campusColourOf("twig", ["USYD"])).toBeUndefined();
    expect(campusColourOf("deadline", ["USYD"])).toBeUndefined();
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
    const long = daysOf(sydney("2026-11-06T18:00:00"), sydney("2027-02-01T00:00:00"));
    expect(long).toHaveLength(87);
    expect(long.at(-1)).toBe("2027-01-31");
    // A 31-day entry can touch 32 Sydney dates; all of them show.
    expect(daysOf(sydney("2026-11-01T18:00:00"), sydney("2026-12-02T18:00:00"))).toHaveLength(32);
    expect(daysOf(0, 2 * 366 * 86_400_000)).toHaveLength(366);
  });

  test("eventsByDay sorts each day by start", () => {
    const late = { name: "late", dateStart: sydney("2026-11-06T19:00:00"), dateEnd: sydney("2026-11-06T20:00:00") };
    const camp = { name: "camp", dateStart: sydney("2026-11-05T09:00:00"), dateEnd: sydney("2026-11-07T12:00:00") };
    const byDay = eventsByDay([late, camp]);
    expect(byDay.get("2026-11-06")!.map((e) => e.name)).toEqual(["camp", "late"]);
    expect(byDay.get("2026-11-05")!.map((e) => e.name)).toEqual(["camp"]);
  });
});

describe("week view", () => {
  test("weekOf is Monday to Sunday, across months and years", () => {
    expect(weekOf("2026-11-04")).toEqual(monthGrid(2026, 11)[1].map((d) => d.key));
    expect(weekOf("2026-11-08")[0]).toBe("2026-11-02");
    expect(weekOf("2026-11-02")[0]).toBe("2026-11-02");
    expect(weekOf("2027-01-01")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(shiftDay("2026-11-30", 7)).toBe("2026-12-07");
    expect(shiftDay("2026-11-02", -7)).toBe("2026-10-26");
  });

  test("runsSeveralDays goes by Sydney dates", () => {
    expect(runsSeveralDays({ dateStart: sydney("2026-11-06T18:00:00"), dateEnd: sydney("2026-11-07T00:00:00") })).toBe(false);
    expect(runsSeveralDays({ dateStart: sydney("2026-11-06T18:00:00"), dateEnd: sydney("2026-11-07T00:30:00") })).toBe(true);
  });

  test("sydneyMinutes counts from Sydney's midnight", () => {
    expect(sydneyMinutes(sydney("2026-11-06T18:30:00"))).toBe(18 * 60 + 30);
    expect(sydneyMinutes(sydney("2026-11-06T00:00:00"))).toBe(0);
    // 3 pm in Sydney in winter (UTC+10).
    expect(sydneyMinutes(Date.parse("2026-07-01T05:00:00Z"))).toBe(15 * 60);
  });

  test("dayBlocks puts overlapping events side by side and the rest full width", () => {
    const at = (name: string, from: string, to: string) => ({
      name,
      dateStart: sydney(`2026-11-04T${from}:00`),
      dateEnd: sydney(`2026-11-04T${to}:00`),
    });
    const blocks = dayBlocks([
      at("lunch", "12:00", "14:00"),
      at("weekly", "17:00", "19:00"),
      at("twig", "18:30", "21:00"),
      at("prep", "17:30", "18:00"),
      at("late", "19:30", "20:00"),
      at("deadline", "23:50", "23:59"),
    ]);
    expect(blocks.map(({ event, from, to, col, cols }) => [event.name, from, to, col, cols])).toEqual([
      ["lunch", 720, 840, 0, 1],
      // prep and then twig take the second column; late reuses the first once weekly ends.
      ["weekly", 1020, 1140, 0, 2],
      ["prep", 1050, 1080, 1, 2],
      ["twig", 1110, 1260, 1, 2],
      ["late", 1170, 1200, 0, 2],
      // At least half an hour tall, but not past midnight.
      ["deadline", 1430, 1440, 0, 1],
    ]);
    const three = dayBlocks([at("a", "18:00", "20:00"), at("b", "18:00", "19:00"), at("c", "18:30", "19:30")]);
    expect(three.map((b) => [b.event.name, b.col, b.cols])).toEqual([
      ["a", 0, 3],
      ["b", 1, 3],
      ["c", 2, 3],
    ]);
  });

  test("clockTime reads like the rest of the app", () => {
    expect(clockTime(0)).toBe("12:00 am");
    expect(clockTime(9 * 60)).toBe("9:00 am");
    expect(clockTime(12 * 60)).toBe("12:00 pm");
    expect(clockTime(23 * 60 + 59)).toBe("11:59 pm");
  });

  test("hourAfter is an hour on, or the last minute of the day", () => {
    expect(hourAfter("09:00")).toBe("10:00");
    expect(hourAfter("18:00")).toBe("19:00");
    expect(hourAfter("23:00")).toBe("23:59");
  });
});

describe("weekLayout", () => {
  // Monday 2 to Sunday 8 November 2026.
  const week = monthGrid(2026, 11)[1].map((d) => d.key);
  const at = (name: string, from: string, to: string) => ({
    name,
    dateStart: sydney(from),
    dateEnd: sydney(to),
  });
  const layout = (events: ReturnType<typeof at>[], rows = 3) => {
    const { bars, more } = weekLayout(week, eventsByDay(events), rows);
    return {
      bars: bars.map(({ event, ...bar }) => ({ name: event.name, ...bar })),
      more,
    };
  };

  test("an event running several days is one bar across them", () => {
    expect(week[0]).toBe("2026-11-02");
    const { bars, more } = layout([
      at("evening", "2026-11-06T18:00:00", "2026-11-06T21:00:00"),
      at("camp", "2026-11-05T09:00:00", "2026-11-07T12:00:00"),
      at("holiday", "2026-10-30T09:00:00", "2026-11-04T00:00:00"),
      at("retreat", "2026-11-08T09:00:00", "2026-11-10T12:00:00"),
    ]);
    expect(bars).toEqual([
      { name: "holiday", start: 0, span: 2, row: 0, fromBefore: true, toAfter: false },
      { name: "camp", start: 3, span: 3, row: 0, fromBefore: false, toAfter: false },
      { name: "evening", start: 4, span: 1, row: 1, fromBefore: false, toAfter: false },
      { name: "retreat", start: 6, span: 1, row: 0, fromBefore: false, toAfter: true },
    ]);
    expect(more).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test("a bar takes the first row free on every day it covers", () => {
    const { bars } = layout([
      at("tue", "2026-11-03T09:00:00", "2026-11-03T10:00:00"),
      at("mon-wed", "2026-11-02T09:00:00", "2026-11-04T10:00:00"),
      at("wed-thu", "2026-11-04T12:00:00", "2026-11-05T10:00:00"),
    ]);
    expect(bars.map((b) => [b.name, b.row])).toEqual([
      ["mon-wed", 0],
      ["tue", 1],
      ["wed-thu", 1],
    ]);
  });

  test("a crowded day shows the rows that fit and how many more there are", () => {
    const { bars, more } = layout([
      at("one", "2026-11-02T08:00:00", "2026-11-02T09:00:00"),
      at("two", "2026-11-02T09:00:00", "2026-11-02T10:00:00"),
      at("three", "2026-11-02T10:00:00", "2026-11-02T11:00:00"),
      at("four", "2026-11-02T11:00:00", "2026-11-02T12:00:00"),
      at("thu", "2026-11-05T09:00:00", "2026-11-05T10:00:00"),
    ]);
    expect(bars.map((b) => b.name)).toEqual(["one", "two", "thu"]);
    expect(more).toEqual([2, 0, 0, 0, 0, 0, 0]);
  });

  test("a last-row bar touching a crowded day gives way on every day it covers", () => {
    const { bars, more } = layout([
      at("mon-tue 1", "2026-11-02T08:00:00", "2026-11-03T09:00:00"),
      at("mon-tue 2", "2026-11-02T09:00:00", "2026-11-03T10:00:00"),
      at("tue-thu", "2026-11-03T12:00:00", "2026-11-05T10:00:00"),
      at("wed 1", "2026-11-04T12:00:00", "2026-11-04T13:00:00"),
      at("wed 2", "2026-11-04T13:00:00", "2026-11-04T14:00:00"),
      at("wed 3", "2026-11-04T14:00:00", "2026-11-04T15:00:00"),
    ]);
    // tue-thu lands on the last row, but Wednesday has a fourth row, so it's counted instead.
    expect(bars.map((b) => [b.name, b.row])).toEqual([
      ["mon-tue 1", 0],
      ["mon-tue 2", 1],
      ["wed 1", 0],
      ["wed 2", 1],
    ]);
    expect(more).toEqual([0, 1, 2, 1, 0, 0, 0]);
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

  test("a Weekly or Campus event at one campus takes the nearest Google colour to the campus's", () => {
    const colour = (category: "weekly" | "campus", subgroups: string[]) =>
      googleEventBody({ name: "x", dateStart: 0, dateEnd: 1, subgroups }, category, "link").colorId;
    expect(colour("weekly", ["USYD"])).toBe("4");
    expect(colour("campus", ["UNSW"])).toBe("2");
    expect(colour("weekly", ["UTS"])).toBe("9");
    expect(colour("weekly", ["MACQ"])).toBe("5");
    expect(colour("campus", ["ACU"])).toBe("3");
    expect(colour("campus", ["Western Sydney University"])).toBe("11");
    expect(colour("weekly", ["USYD", "UNSW"])).toBe("7");
    expect(colour("campus", ["SOW"])).toBe("9");
  });

  test("a deadline is an all-day event on its Sydney day, with any time in its title", () => {
    const due = sydney("2026-11-20T23:59:00");
    const deadline = (kind: "day" | "time") =>
      googleEventBody(
        { name: "Applications close", dateStart: due, dateEnd: due, subgroups: ["SOW"], due: kind },
        "deadline",
        "link"
      );
    expect(deadline("time")).toMatchObject({
      summary: "Applications close · 11:59 pm",
      start: { date: "2026-11-20" },
      end: { date: "2026-11-21" },
    });
    expect(deadline("day")).toMatchObject({ summary: "Applications close", start: { date: "2026-11-20" } });
    expect(deadline("day").start).not.toHaveProperty("dateTime");
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
      due: undefined,
    });
    // Present even when it's not a deadline, so saving an event clears an old one.
    expect(Object.keys(normalizeEntry(base))).toContain("due");
  });
  test.each([
    [{ name: "" }, "Give it a name."],
    [{ name: "x".repeat(121) }, "at most 120 characters"],
    [{ dateEnd: 1_000 }, "It has to end after it starts."],
    [{ dateEnd: 1_000 + 32 * 86_400_000 }, "at most 31 days"],
    [{ subgroups: [] }, "Pick at least one campus, or SOW."],
    [{ subgroups: ["Hogwarts"] }, "isn't a campus this year"],
    [{ notes: "x".repeat(1001) }, "Notes can be at most 1000 characters."],
    [{ due: "time" as const }, "A deadline is one moment, with no end."],
  ])("%o → %s", (over, message) => {
    expect(entryProblem({ ...base, ...over }, valid)).toContain(message);
  });
  test("a good one passes", () => {
    expect(entryProblem({ ...base, subgroups: ["UNSW"], notes: "Print 200" }, valid)).toBeNull();
    expect(entryProblem({ ...base, dateEnd: base.dateStart, due: "day" }, valid)).toBeNull();
    expect(entryProblem({ ...base, dateEnd: base.dateStart, due: "time" }, valid)).toBeNull();
  });
  test("parseDayKey only accepts real days", () => {
    expect(parseDayKey("2026-11-20")).toBe("2026-11-20");
    expect(parseDayKey("2026-02-30")).toBeNull();
    expect(parseDayKey("tomorrow")).toBeNull();
    expect(parseDayKey(undefined)).toBeNull();
  });
});
