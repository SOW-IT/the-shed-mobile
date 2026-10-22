import { describe, expect, it } from "vitest";
import { type ViewBlock } from "./attendanceMetricsView";
import {
  buildGeneralView,
  campusAcronym,
  fmtAvg,
  ppDelta,
  type StaffTrendsData,
  yearsDelta,
  yoyDelta,
} from "./generalMetricsView";

const series = (overall: (number | null)[], staff: (number | null)[], sl: (number | null)[]) => ({
  overall,
  staff,
  studentLeaders: sl,
});

const trends = (over: Partial<StaffTrendsData> = {}): StaffTrendsData => ({
  years: [2025, 2026, 2027],
  allStaff: [10, 12, 13],
  staff: [6, 7, 8],
  studentLeaders: [4, 5, 5],
  campuses: ["University of Sydney", "E2E Test Campus"],
  studentLeadersByCampus: [
    { campus: "University of Sydney", counts: [4, 5, 5] },
    { campus: "E2E Test Campus", counts: [1, 1, 1] },
  ],
  turnover: series([null, 20, 15], [null, 10, 5], [null, 25, 30]),
  retention: series([null, 80, 85], [null, 90, 95], [null, 75, 70]),
  tenure2Plus: series([10, 30, 30], [20, 40, 40], [null, 20, 20]),
  avgTenureYears: series([1, 1.5, 1.6], [1.2, 1.8, 1.9], [null, 1.1, 1.2]),
  ...over,
});

const campusAttendance = {
  years: [2025, 2026],
  campuses: [
    { campus: "University of Sydney", averages: [40, 44] },
    { campus: "Macquarie University", averages: [0, 0] },
    { campus: "E2E Test Campus", averages: [5, 6] },
  ],
};

const types = (blocks: ViewBlock[]) => blocks.map((b) => b.type);
const cardsBlocks = (blocks: ViewBlock[]) =>
  blocks.filter((b): b is Extract<ViewBlock, { type: "cards" }> => b.type === "cards");
const chart = (blocks: ViewBlock[], title: string) =>
  blocks.find(
    (b): b is Extract<ViewBlock, { type: "multiBars" | "stacked" }> =>
      (b.type === "multiBars" || b.type === "stacked") && b.title === title
  );

describe("buildGeneralView: all years", () => {
  it("groups each section's cards with its charts: people, retention, years served, weeklies", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: null, signedIn: true });
    expect(types(blocks)).toEqual([
      "label", "heading", "cards", "multiBars", "multiBars",
      "heading", "cards", "multiBars",
      "heading", "label", "cards", "multiBars", "multiBars",
      "heading", "multiBars",
    ]);
    expect(blocks[0]).toEqual({ type: "label", text: "2027 vs 2026" });
    expect(blocks.filter((b) => b.type === "heading").map((b) => "text" in b && b.text)).toEqual([
      "People serving",
      "Retention",
      "Years served",
      "Weeklies",
    ]);
    const [headcount, retention, avgYears] = cardsBlocks(blocks);
    expect(headcount.cards).toEqual([
      { label: "Overall", value: "13", delta: { text: "+8%", direction: "up" } },
      { label: "Staff", value: "8", delta: { text: "+14%", direction: "up" } },
      { label: "Student leaders", value: "5", delta: { text: "0%", direction: "flat" } },
    ]);
    expect(cardsBlocks(blocks).flatMap((b) => b.cards).every((c) => c.tone === undefined)).toBe(true);
    expect(retention.cards.map((c) => [c.label, c.value])).toEqual([
      ["Overall", "85%"],
      ["Staff", "95%"],
      ["Student leaders", "70%"],
    ]);
    expect(retention.cards[0].delta).toEqual({ text: "+5pp", direction: "up" });
    expect(avgYears.cards.map((c) => [c.label, c.value, c.delta?.text])).toEqual([
      ["Overall", "1.6", "+0.1y"],
      ["Staff", "1.9", "+0.1y"],
      ["Student leaders", "1.2", "+0.1y"],
    ]);
    expect(blocks.some((b) => b.type === "cards" && b.cards.some((c) => c.hint))).toBe(false);
    expect(blocks.flatMap((b) => ("subtitle" in b && b.subtitle ? [b.subtitle] : []))).toEqual([
      "Calendar years, Jan–Dec",
    ]);
    expect(blocks.filter((b) => b.type === "multiBars").map((b) => "title" in b && b.title)).toEqual([
      "Staff & student leaders",
      "Student leaders by campus",
      "Retention",
      "Average years served",
      "Served 2+ years",
      "Weeklies average by campus",
    ]);
  });

  it("draws staff and student leaders as side-by-side bars with overall as a line over them", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: null, signedIn: true });
    const multi = (title: string) => {
      const c = chart(blocks, title);
      if (c?.type !== "multiBars") throw new Error(`no ${title}`);
      return c;
    };
    const people = multi("Staff & student leaders");
    expect(people.stacked).toBe(false);
    expect(people.line).toEqual({ key: "Overall", colour: "text", values: [10, 12, 13] });
    expect(people.points.map((p) => p.segments.map((s) => [s.key, s.value]))).toEqual([
      [["Staff", 6], ["SLs", 4]],
      [["Staff", 7], ["SLs", 5]],
      [["Staff", 8], ["SLs", 5]],
    ]);
    expect(people.legend[0]).toMatchObject({ key: "Overall", shape: "line" });
    expect(people.unit).toBeUndefined();

    const retention = multi("Retention");
    expect(retention).toMatchObject({ unit: "%", axisMax: 100, stacked: false });
    expect(retention.points.map((p) => p.at)).toEqual([2026, 2027]);
    expect(retention.line?.values).toEqual([80, 85]);

    expect(multi("Served 2+ years")).toMatchObject({ unit: "%", axisMax: 100 });
    expect(multi("Served 2+ years").points[0].segments.map((s) => s.key)).toEqual(["Staff"]);
    expect(multi("Average years served").unit).toBeUndefined();
    expect(multi("Average years served").line?.values).toEqual([1, 1.5, 1.6]);
    expect(multi("Student leaders by campus")).toMatchObject({ stacked: true });
    expect(multi("Student leaders by campus").line).toBeUndefined();
  });

  it("is the same for signed-out viewers, and ignores a picked year for them", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2026, signedIn: false });
    expect(chart(blocks, "Staff & student leaders")).toBeDefined();
  });

  it("drops the test campus and campuses with no leaders in the window, and colours campuses by their colour", () => {
    const blocks = buildGeneralView({
      trends: trends({
        campuses: ["Australian Catholic University", "University of Sydney", "E2E Test Campus"],
        studentLeadersByCampus: [
          { campus: "Australian Catholic University", counts: [0, 0, 0] },
          { campus: "University of Sydney", counts: [4, 5, 5] },
          { campus: "E2E Test Campus", counts: [1, 1, 1] },
        ],
      }),
      campusAttendance,
      scope: null,
      signedIn: false,
    });
    const byCampus = chart(blocks, "Student leaders by campus");
    expect(byCampus?.legend.map((l) => l.label)).toEqual(["USYD"]);
    expect(byCampus?.type === "multiBars" && byCampus.points[0].segments[0].colour).toMatch(/^#/);
    expect(chart(blocks, "Weeklies average by campus")?.legend.map((l) => l.key)).toEqual(["USYD"]);
  });

  it("leaves out rate sections and charts with no data", () => {
    const none = series([null], [null], [null]);
    const blocks = buildGeneralView({
      trends: trends({
        years: [2025], allStaff: [4], staff: [3], studentLeaders: [1], studentLeadersByCampus: [], campuses: [],
        retention: none, avgTenureYears: none, tenure2Plus: none,
      }),
      campusAttendance: { years: [2025], campuses: [{ campus: "Macquarie University", averages: [0] }] },
      scope: null,
      signedIn: true,
    });
    expect(types(blocks)).toEqual(["label", "heading", "cards", "multiBars"]);
    expect(blocks[0]).toEqual({ type: "label", text: "2025" });
    expect(cardsBlocks(blocks)[0].cards[0].delta).toBeUndefined();
  });

  it("shows the last five years by default and every year for All history", () => {
    const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
    const n = years.length;
    const none = Array(n).fill(null);
    const t = trends({
      years,
      allStaff: Array(n).fill(1),
      staff: Array(n).fill(1),
      studentLeaders: Array(n).fill(0),
      studentLeadersByCampus: [],
      campuses: [],
      retention: series(none, none, none),
      avgTenureYears: series(none, none, none),
      tenure2Plus: series(none, none, none),
    });
    const points = (b: ViewBlock[]) => {
      const c = chart(b, "Staff & student leaders");
      return c?.type === "multiBars" ? c.points.length : 0;
    };
    expect(points(buildGeneralView({ trends: t, campusAttendance: null, scope: null, signedIn: false }))).toBe(5);
    expect(points(buildGeneralView({ trends: t, campusAttendance: null, scope: "all", signedIn: false }))).toBe(7);
  });

  it("says there's no history yet without any staff year", () => {
    const blocks = buildGeneralView({ trends: trends({ years: [] }), campusAttendance: null, scope: null, signedIn: true });
    expect(blocks).toEqual([expect.objectContaining({ type: "empty", title: "No staff history yet" })]);
  });
});

describe("buildGeneralView: one staff year", () => {
  it("shows that year's people, retention, years served and calendar-year weeklies, each under a heading", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2026, signedIn: true });
    expect(types(blocks)).toEqual([
      "label", "heading", "cards", "label", "cards",
      "heading", "cards",
      "heading", "label", "cards", "label", "cards",
      "heading", "label", "cards",
    ]);
    expect(blocks[0]).toEqual({ type: "label", text: "2026 vs 2025" });
    const [headcount, byCampus, retention, avgYears, twoPlus, weekly] = cardsBlocks(blocks);
    expect(headcount.layout).toBeUndefined();
    expect(byCampus.layout).toBe("grid");
    expect(headcount.cards.map((c) => [c.label, c.value])).toEqual([
      ["Overall", "12"],
      ["Staff", "7"],
      ["Student leaders", "5"],
    ]);
    expect(byCampus.cards.map((c) => c.label)).toEqual(["USYD"]);
    expect(cardsBlocks(blocks).flatMap((b) => b.cards).every((c) => c.tone === undefined)).toBe(true);
    expect(retention.cards.map((c) => c.label)).toEqual(["Overall", "Staff", "Student leaders"]);
    expect(avgYears.cards[0]).toMatchObject({ value: "1.5", delta: { text: "+0.5y", direction: "up" } });
    expect(twoPlus.cards[0]).toMatchObject({ label: "Overall", value: "30%", delta: { text: "+20pp" } });
    expect(blocks[13]).toEqual({ type: "label", text: "Weeklies average by campus · Jan–Dec 2026" });
    expect(weekly.cards).toEqual([
      { label: "USYD", value: "44", delta: { text: "+10%", direction: "up" } },
    ]);
  });

  it("has no comparison in the first year", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2025, signedIn: true });
    expect(blocks[0]).toEqual({ type: "label", text: "2025" });
    expect(cardsBlocks(blocks)[0].cards[0].delta).toBeUndefined();
    expect(cardsBlocks(blocks).at(-1)?.cards[0]).toMatchObject({ label: "USYD", value: "40", delta: undefined });
  });

  it("leaves out sections with no data for that year", () => {
    const none = series([null, null, null], [null, null, null], [null, null, null]);
    const blocks = buildGeneralView({
      trends: trends({ retention: none, avgTenureYears: none, tenure2Plus: none }),
      campusAttendance: null,
      scope: 2027,
      signedIn: true,
    });
    expect(types(blocks)).toEqual(["label", "heading", "cards", "label", "cards"]);
  });

  it("falls back to all years for a year with no data", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2031, signedIn: true });
    expect(chart(blocks, "Retention")).toBeDefined();
  });
});

describe("formatting helpers", () => {
  it("formats deltas and averages", () => {
    expect(yoyDelta(5, 0)).toEqual({ text: "new", direction: "up" });
    expect(yoyDelta(0, 0)).toBeUndefined();
    expect(yoyDelta(4, 5)).toEqual({ text: "-20%", direction: "down" });
    expect(yoyDelta(5, 5)).toEqual({ text: "0%", direction: "flat" });
    expect(ppDelta(50, 50)).toEqual({ text: "0pp", direction: "flat" });
    expect(ppDelta(40, 50)).toEqual({ text: "-10pp", direction: "down" });
    expect(ppDelta(60, 50)).toEqual({ text: "+10pp", direction: "up" });
    expect(ppDelta(null, 50)).toBeUndefined();
    expect(ppDelta(50, null)).toBeUndefined();
    expect(yearsDelta(2, 2)).toEqual({ text: "0y", direction: "flat" });
    expect(yearsDelta(1.5, 2)).toEqual({ text: "-0.5y", direction: "down" });
    expect(fmtAvg(2)).toBe("2");
    expect(fmtAvg(2.25)).toBe("2.3");
    expect(campusAcronym("Somewhere New")).toBe("Somewhere New");
  });
});
