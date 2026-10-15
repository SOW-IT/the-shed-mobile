import { describe, expect, test } from "vitest";
import {
  churchAcronym,
  churchCampuses,
  churchPagePath,
  churchPeopleMatching,
  cleanInstagram,
  cleanWebsite,
  formatClock,
  formatServices,
  instagramUrl,
  isChurchFilterActive,
  isServiceTime,
  mainCampus,
  NO_CHURCH_FILTER,
  sortServices,
  websiteLabel,
} from "./churches";

describe("churchAcronym", () => {
  test("the first letter of each word, without what's in brackets", () => {
    expect(churchAcronym("Harbour City Church")).toBe("HCC");
    expect(churchAcronym("Sydney Young Nak Church")).toBe("SYNC");
    expect(churchAcronym("Sydney Sae Soon Presbyterian Church (New Life)")).toBe("SSSPC");
    expect(churchAcronym("Living Hope Presbyterian Church")).toBe("LHPC");
  });

  test("skips small words, keeps letters and numbers from any script", () => {
    expect(churchAcronym("Church of the Good Shepherd")).toBe("CGS");
    expect(churchAcronym("St. Paul's Anglican - Carlingford")).toBe("SPAC");
    expect(churchAcronym("새순 장로교회")).toBe("새장");
    expect(churchAcronym("3rd Street Chapel")).toBe("3SC");
  });

  test("falls back to the name when nothing is left", () => {
    expect(churchAcronym(" (New Life) ")).toBe("(New Life)");
  });
});

test("churchPagePath opens the Churches page on one church", () => {
  expect(churchPagePath("abc123")).toBe("/churches?church=abc123");
});

describe("service times", () => {
  test("a day of the week and a 24-hour time", () => {
    expect(isServiceTime({ day: 0, time: "10:30" })).toBe(true);
    expect(isServiceTime({ day: 6, time: "23:59" })).toBe(true);
    expect(isServiceTime({ day: 7, time: "10:00" })).toBe(false);
    expect(isServiceTime({ day: 1.5, time: "10:00" })).toBe(false);
    expect(isServiceTime({ day: 0, time: "24:00" })).toBe(false);
    expect(isServiceTime({ day: 0, time: "9:00" })).toBe(false);
  });

  test("are sorted by day then time, without repeats", () => {
    expect(
      sortServices([
        { day: 0, time: "12:00" },
        { day: 6, time: "18:00" },
        { day: 0, time: "10:00" },
        { day: 0, time: "12:00" },
      ])
    ).toEqual([
      { day: 0, time: "10:00" },
      { day: 0, time: "12:00" },
      { day: 6, time: "18:00" },
    ]);
  });

  test("read like people write them", () => {
    expect(formatClock("00:00")).toBe("12am");
    expect(formatClock("10:30")).toBe("10:30am");
    expect(formatClock("12:00")).toBe("12pm");
    expect(formatClock("13:05")).toBe("1:05pm");
    expect(formatServices([])).toBeNull();
    expect(formatServices([{ day: 0, time: "10:30" }])).toBe("Sunday 10:30am");
    expect(formatServices([{ day: 0, time: "12:00" }, { day: 0, time: "10:00" }])).toBe("Sunday 10am and 12pm");
    expect(
      formatServices([
        { day: 0, time: "09:00" },
        { day: 0, time: "11:00" },
        { day: 0, time: "18:00" },
        { day: 6, time: "18:30" },
      ])
    ).toBe("Sunday 9am, 11am and 6pm · Saturday 6:30pm");
  });
});

describe("website and Instagram", () => {
  test("a website gets https:// when it's left off, and must look like a site", () => {
    expect(cleanWebsite(undefined)).toBeUndefined();
    expect(cleanWebsite("  ")).toBeUndefined();
    expect(cleanWebsite("harbourcitychurch.com")).toBe("https://harbourcitychurch.com/");
    expect(cleanWebsite(" http://www.example.org/sunday ")).toBe("http://www.example.org/sunday");
    expect(cleanWebsite("not a site")).toBeNull();
    expect(cleanWebsite("localhost")).toBeNull();
    expect(cleanWebsite("https://")).toBeNull();
    expect(websiteLabel("https://www.harbourcitychurch.com/")).toBe("harbourcitychurch.com");
    expect(websiteLabel("http://example.org/sunday")).toBe("example.org/sunday");
  });

  test("Instagram is kept as the handle, from a handle or a link", () => {
    expect(cleanInstagram(undefined)).toBeUndefined();
    expect(cleanInstagram("")).toBeUndefined();
    expect(cleanInstagram("@harbourcitychurch")).toBe("harbourcitychurch");
    expect(cleanInstagram("sae.soon_youth")).toBe("sae.soon_youth");
    expect(cleanInstagram("https://www.instagram.com/harbourcity/?hl=en")).toBe("harbourcity");
    expect(cleanInstagram("instagram.com/harbourcity")).toBe("harbourcity");
    expect(cleanInstagram("@not a handle")).toBeNull();
    expect(instagramUrl("harbourcity")).toBe("https://www.instagram.com/harbourcity/");
  });
});

describe("church filters", () => {
  const people = [
    { name: "Lia", group: "leader" as const, campus: "UNSW" },
    { name: "Lou", group: "leader" as const, campus: "USYD" },
    { name: "Sam", group: "staff" as const, campus: null },
    { name: "Sue", group: "staff" as const, campus: "USYD" },
    { name: "Max", group: "member" as const, campus: "UNSW" },
    { name: "Mia", group: "member" as const, campus: null },
  ];
  const names = (filter: Parameters<typeof churchPeopleMatching>[1]) =>
    churchPeopleMatching(people, filter).map((p) => p.name);

  test("each audience keeps its people", () => {
    expect(names(NO_CHURCH_FILTER)).toEqual(["Lia", "Lou", "Sam", "Sue", "Max", "Mia"]);
    expect(names({ audience: "volunteers", campuses: [] })).toEqual(["Lia", "Lou", "Sam", "Sue"]);
    expect(names({ audience: "leaders", campuses: [] })).toEqual(["Lia", "Lou"]);
    expect(names({ audience: "staff", campuses: [] })).toEqual(["Sam", "Sue"]);
  });

  test("campuses narrow any audience and drop people with no campus", () => {
    expect(names({ audience: "everyone", campuses: ["UNSW"] })).toEqual(["Lia", "Max"]);
    expect(names({ audience: "volunteers", campuses: ["USYD", "UNSW"] })).toEqual(["Lia", "Lou", "Sue"]);
    expect(names({ audience: "staff", campuses: ["UNSW"] })).toEqual([]);
  });

  test("a filter is active once it leaves Everyone or picks a campus", () => {
    expect(isChurchFilterActive(NO_CHURCH_FILTER)).toBe(false);
    expect(isChurchFilterActive({ audience: "staff", campuses: [] })).toBe(true);
    expect(isChurchFilterActive({ audience: "everyone", campuses: ["UNSW"] })).toBe(true);
  });

  test("campuses are listed once, by label", () => {
    expect(churchCampuses(people, (c) => (c === "UNSW" ? "Z" : "A"))).toEqual(["USYD", "UNSW"]);
    expect(churchCampuses([], (c) => c)).toEqual([]);
  });

  test("the main campus is the most common one, ties broken by name", () => {
    expect(mainCampus(people)).toBe("UNSW");
    expect(mainCampus([...people, { group: "member", campus: "USYD" }])).toBe("USYD");
    expect(mainCampus([{ group: "staff", campus: null }])).toBeNull();
    expect(mainCampus([])).toBeNull();
  });
});
