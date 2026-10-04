import { describe, expect, it } from "vitest";
import { type ViewBlock } from "./attendanceMetricsView";
import {
  buildGeneralView,
  campusAcronym,
  fmtAvg,
  ppDelta,
  type StaffTrendsData,
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
  turnover: series([null, 20, null], [null, 10, null], [null, 25, null]),
  retention: series([null, 80, null], [null, 90, null], [null, 75, null]),
  tenure2Plus: series([10, 30, 30], [20, 40, 40], [null, 20, 20]),
  avgTenureYears: series([1, 1.5, 1.6], [1.2, 1.8, 1.9], [null, 1.1, 1.2]),
  lifetimeTenure2Plus: { overall: 25, staff: 30, studentLeaders: 15 },
  lifetimeAvgTenureYears: { overall: 1.4, staff: 1.6, studentLeaders: 1.1 },
  ...over,
});

const campusAttendance = {
  years: [2025, 2026],
  campuses: [
    { campus: "University of Sydney", averages: [40, 44] },
    { campus: "Macquarie University", averages: [0, 0] },
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
  it("leads with headcount and retention, then four charts with titles only", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: null, signedIn: true });
    expect(types(blocks)).toEqual(["cards", "label", "cards", "stacked", "multiBars", "multiBars", "multiBars"]);
    const [headcount, retention] = cardsBlocks(blocks);
    expect(headcount.cards).toEqual([
      expect.objectContaining({ label: "Staff", value: "8", hint: "2027 vs 2026", delta: { text: "+14%", direction: "up" } }),
      expect.objectContaining({ label: "Student leaders", value: "5", tone: "positive" }),
    ]);
    expect(blocks[1]).toEqual({ type: "label", text: "Retention" });
    expect(retention.cards.map((c) => [c.label, c.value, c.hint])).toEqual([
      ["Overall", "80%", "2026 vs 2025"],
      ["Staff", "90%", "2026 vs 2025"],
      ["Student leaders", "75%", "2026 vs 2025"],
    ]);
    expect(blocks.some((b) => "subtitle" in b && b.subtitle)).toBe(false);
    expect(blocks.some((b) => b.type === "caption" || b.type === "heading")).toBe(false);
  });

  it("is the same for signed-out viewers, and ignores a picked year for them", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2026, signedIn: false });
    expect(types(blocks)[0]).toBe("cards");
    expect(chart(blocks, "Staff & student leaders")).toBeDefined();
  });

  it("drops the test campus and colours campuses by their colour", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: null, signedIn: false });
    const byCampus = chart(blocks, "Student leaders by campus");
    expect(byCampus?.legend.map((l) => l.label)).toEqual(["USYD"]);
    expect(byCampus?.type === "multiBars" && byCampus.points[0].segments[0].colour).toMatch(/^#/);
  });

  it("charts retention and weekly attendance only where there's data", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: null, signedIn: false });
    const retention = chart(blocks, "Retention");
    expect(retention?.type === "multiBars" && retention.points.map((p) => p.at)).toEqual([2026]);
    const weekly = chart(blocks, "Weekly avg by campus");
    expect(weekly?.legend.map((l) => l.key)).toEqual(["USYD"]);
  });

  it("leaves out retention and weekly attendance when there's none", () => {
    const blocks = buildGeneralView({
      trends: trends({ years: [2025], staff: [3], studentLeaders: [1], studentLeadersByCampus: [], campuses: [], retention: series([null], [null], [null]) }),
      campusAttendance: { years: [2025], campuses: [{ campus: "Macquarie University", averages: [0] }] },
      scope: null,
      signedIn: true,
    });
    expect(types(blocks)).toEqual(["cards", "stacked", "multiBars"]);
    expect(cardsBlocks(blocks)[0].cards[0]).toMatchObject({ hint: "2025", delta: undefined });
  });

  it("shows a first-year retention without a comparison", () => {
    const blocks = buildGeneralView({
      trends: trends({ retention: series([70, null, null], [null, null, null], [null, null, null]) }),
      campusAttendance: null,
      scope: null,
      signedIn: true,
    });
    expect(cardsBlocks(blocks)[1].cards).toEqual([
      expect.objectContaining({ label: "Overall", value: "70%", hint: "2025", delta: undefined }),
    ]);
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
    });
    const recent = buildGeneralView({ trends: t, campusAttendance: null, scope: null, signedIn: false });
    const all = buildGeneralView({ trends: t, campusAttendance: null, scope: "all", signedIn: false });
    const points = (b: ViewBlock[]) => {
      const c = chart(b, "Staff & student leaders");
      return c?.type === "stacked" ? c.points.length : 0;
    };
    expect(points(recent)).toBe(5);
    expect(points(all)).toBe(7);
  });

  it("says there's no history yet without any staff year", () => {
    const blocks = buildGeneralView({ trends: trends({ years: [] }), campusAttendance: null, scope: null, signedIn: true });
    expect(blocks).toEqual([expect.objectContaining({ type: "empty", title: "No staff history yet" })]);
  });
});

describe("buildGeneralView: one staff year", () => {
  it("shows headcount, retention and weekly averages for that year", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2026, signedIn: true });
    expect(types(blocks)).toEqual(["cards", "label", "cards", "label", "cards"]);
    const [headcount, retention, weekly] = cardsBlocks(blocks);
    expect(headcount.layout).toBe("grid");
    expect(headcount.cards.map((c) => c.label)).toEqual(["Staff", "Student leaders", "USYD"]);
    expect(headcount.cards[0]).toMatchObject({ value: "7", hint: "vs 2025", delta: { text: "+17%", direction: "up" } });
    expect(retention.cards.map((c) => c.label)).toEqual(["Overall", "Staff", "Student leaders"]);
    expect(weekly.cards).toEqual([
      expect.objectContaining({ label: "USYD", value: "44", delta: { text: "+10%", direction: "up" } }),
    ]);
    expect(blocks[3]).toEqual({ type: "label", text: "Weekly avg" });
  });

  it("has no comparison in the first year", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2025, signedIn: true });
    expect(types(blocks)).toEqual(["cards", "label", "cards"]);
    expect(cardsBlocks(blocks)[0].cards[0]).toMatchObject({ hint: undefined, delta: undefined });
    expect(cardsBlocks(blocks)[1].cards[0]).toMatchObject({ label: "USYD", value: "40" });
  });

  it("leaves out weekly averages for a year without attendance data", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance: null, scope: 2027, signedIn: true });
    expect(types(blocks)).toEqual(["cards"]);
  });

  it("falls back to all years for a year with no data", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2031, signedIn: true });
    expect(types(blocks).slice(0, 2)).toEqual(["cards", "label"]);
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
    expect(fmtAvg(2)).toBe("2");
    expect(fmtAvg(2.25)).toBe("2.3");
    expect(campusAcronym("Somewhere New")).toBe("Somewhere New");
  });
});
