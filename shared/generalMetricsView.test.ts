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
  years: [2025, 2026],
  allStaff: [10, 12],
  staff: [6, 7],
  studentLeaders: [4, 5],
  campuses: ["University of Sydney", "E2E Test Campus"],
  studentLeadersByCampus: [
    { campus: "University of Sydney", counts: [4, 5] },
    { campus: "E2E Test Campus", counts: [1, 1] },
  ],
  turnover: series([null, 20], [null, 10], [null, 25]),
  retention: series([null, 80], [null, 90], [null, 75]),
  tenure2Plus: series([10, 30], [20, 40], [null, 20]),
  avgTenureYears: series([1, 1.5], [1.2, 1.8], [null, 1.1]),
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
const find = <T extends ViewBlock["type"]>(blocks: ViewBlock[], type: T, title?: string) =>
  blocks.find(
    (b): b is Extract<ViewBlock, { type: T }> =>
      b.type === type && (title === undefined || ("title" in b && b.title === title))
  );

describe("buildGeneralView: all years", () => {
  it("shows lifetime tenure, then the charts, when signed in", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: null, signedIn: true });
    expect(types(blocks)).toEqual([
      "heading",
      "caption",
      "cards",
      "stacked",
      "multiBars",
      "multiBars",
      "multiBars",
      "multiBars",
      "multiBars",
    ]);
    const lifetime = find(blocks, "cards");
    expect(lifetime?.layout).toBe("grid");
    expect(lifetime?.cards.map((c) => c.value)).toEqual(["25%", "30%", "15%", "1.4", "1.6", "1.1"]);
    expect(find(blocks, "stacked")?.subtitle).toBe("Staff + student leaders · 2025–2026");
  });

  it("hides lifetime tenure from signed-out viewers and ignores a picked year", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2026, signedIn: false });
    expect(blocks[0].type).toBe("stacked");
  });

  it("drops the test campus and colours campuses by their colour", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: null, signedIn: false });
    const byCampus = find(blocks, "multiBars", "Student leaders by campus");
    expect(byCampus?.legend.map((l) => l.label)).toEqual(["USYD"]);
    expect(byCampus?.points[0].segments[0].colour).toMatch(/^#/);
  });

  it("charts weekly attendance only for campuses that had any", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: null, signedIn: false });
    const weekly = find(blocks, "multiBars", "Weekly meeting attendance");
    expect(weekly?.legend.map((l) => l.key)).toEqual(["USYD"]);
    expect(weekly?.points.map((p) => p.segments[0].value)).toEqual([40, 44]);
  });

  it("leaves out empty rate charts and an empty weekly chart", () => {
    const blocks = buildGeneralView({
      trends: trends({
        retention: series([null, null], [null, null], [null, null]),
        tenure2Plus: series([null, null], [null, null], [null, null]),
        avgTenureYears: series([null, null], [null, null], [null, null]),
        allStaff: [0, 0],
        staff: [0, 0],
        studentLeaders: [0, 0],
      }),
      campusAttendance: { years: [2025], campuses: [{ campus: "Macquarie University", averages: [0] }] },
      scope: null,
      signedIn: true,
    });
    expect(types(blocks)).toEqual(["stacked", "multiBars"]);
  });

  it("shows the last five years by default and every year for All history", () => {
    const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
    const n = years.length;
    const t = trends({
      years,
      allStaff: Array(n).fill(1),
      staff: Array(n).fill(1),
      studentLeaders: Array(n).fill(0),
      studentLeadersByCampus: [],
      campuses: [],
      turnover: series(Array(n).fill(null), Array(n).fill(null), Array(n).fill(null)),
      retention: series(Array(n).fill(null), Array(n).fill(null), Array(n).fill(null)),
      tenure2Plus: series(Array(n).fill(null), Array(n).fill(null), Array(n).fill(null)),
      avgTenureYears: series(Array(n).fill(null), Array(n).fill(null), Array(n).fill(null)),
    });
    const recent = buildGeneralView({ trends: t, campusAttendance: null, scope: null, signedIn: false });
    const all = buildGeneralView({ trends: t, campusAttendance: null, scope: "all", signedIn: false });
    expect(find(recent, "stacked")?.points).toHaveLength(5);
    expect(find(all, "stacked")?.points).toHaveLength(7);
  });

  it("says there's no history yet without any staff year", () => {
    const blocks = buildGeneralView({
      trends: trends({ years: [] }),
      campusAttendance: null,
      scope: null,
      signedIn: true,
    });
    expect(blocks).toEqual([expect.objectContaining({ type: "empty", title: "No staff history yet" })]);
  });
});

describe("buildGeneralView: one staff year", () => {
  it("compares the year with the one before", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2026, signedIn: true });
    expect(blocks[0]).toEqual({
      type: "caption",
      text: "Staff year 2026, change vs 2025. Staff profiles only.",
    });
    const headcount = find(blocks, "cards");
    expect(headcount?.cards.map((c) => c.label)).toEqual(["All staff", "Staff", "Student leaders", "USYD"]);
    expect(headcount?.cards[0]).toMatchObject({ value: "12", delta: { text: "+20%", direction: "up" }, hint: "vs 2025" });

    const headings = blocks.filter((b) => b.type === "heading").map((b) => b.type === "heading" && b.text);
    expect(headings).toEqual([
      "Retention",
      "Serve at least 2 years",
      "Average years served so far",
      "Avg weekly meeting attendance",
    ]);
    const cards = blocks.filter((b): b is Extract<ViewBlock, { type: "cards" }> => b.type === "cards");
    expect(cards[1].cards[0]).toMatchObject({
      label: "Overall retention",
      value: "80%",
      hint: "vs 2025 · n=10 · 20% left",
    });
    expect(cards[2].cards.map((c) => c.label)).toEqual([
      "Overall ≥2 years",
      "Staff ≥2 years",
      "Student leaders ≥2 years",
    ]);
    expect(cards[3].cards[0]).toMatchObject({ value: "1.5", delta: { text: "+0.5y", direction: "up" } });
    expect(cards[4].cards).toEqual([
      expect.objectContaining({ label: "USYD", value: "44", delta: { text: "+10%", direction: "up" } }),
    ]);
  });

  it("has no baseline in the first year", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2025, signedIn: true });
    expect(blocks[0]).toMatchObject({ text: expect.stringContaining("No earlier year") });
    expect(find(blocks, "cards")?.cards[0]).toMatchObject({ hint: "no baseline", delta: undefined });
    expect(blocks.some((b) => b.type === "heading" && b.text === "Retention")).toBe(false);
    const tenure = blocks.filter((b): b is Extract<ViewBlock, { type: "cards" }> => b.type === "cards")[1];
    expect(tenure.cards.map((c) => c.label)).toEqual(["Overall ≥2 years", "Staff ≥2 years"]);
  });

  it("says a retention rate needs a prior year when the year before is missing from the data", () => {
    const blocks = buildGeneralView({
      trends: trends({ retention: series([70, 80], [null, 90], [null, 75]) }),
      campusAttendance: null,
      scope: 2025,
      signedIn: true,
    });
    const retention = blocks.filter((b): b is Extract<ViewBlock, { type: "cards" }> => b.type === "cards")[1];
    expect(retention.cards[0]).toMatchObject({ label: "Overall retention", hint: "needs a prior year" });
    expect(blocks.some((b) => b.type === "heading" && b.text === "Avg weekly meeting attendance")).toBe(false);
  });

  it("falls back to all years for a year with no data", () => {
    const blocks = buildGeneralView({ trends: trends(), campusAttendance, scope: 2031, signedIn: true });
    expect(blocks[0]).toEqual({ type: "heading", text: "Tenure (staff profiles)" });
  });

  it("leaves the retention hint's left share out when turnover is unknown", () => {
    const blocks = buildGeneralView({
      trends: trends({ turnover: series([null, null], [null, 10], [null, 25]) }),
      campusAttendance,
      scope: 2026,
      signedIn: true,
    });
    const retention = blocks.filter((b): b is Extract<ViewBlock, { type: "cards" }> => b.type === "cards")[1];
    expect(retention.cards[0].hint).toBe("vs 2025 · n=10");
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
    expect(ppDelta(null, 50)).toBeUndefined();
    expect(ppDelta(50, null)).toBeUndefined();
    expect(yearsDelta(2, 2)).toEqual({ text: "0y", direction: "flat" });
    expect(fmtAvg(2)).toBe("2");
    expect(fmtAvg(2.25)).toBe("2.3");
    expect(campusAcronym("Somewhere New")).toBe("Somewhere New");
  });
});
