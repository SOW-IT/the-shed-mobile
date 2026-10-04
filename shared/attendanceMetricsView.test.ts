import { describe, expect, it } from "vitest";
import { type FollowUpPerson, type SubgroupMetricsData } from "./attendanceMetrics";
import {
  ATTENDANCE_RANGE_OPTIONS,
  buildAttendanceView,
  DEFAULT_RANGE_WEEKS,
  resolveRangeWeeks,
  FOLLOW_UP_MAX,
  FOLLOW_UP_PREVIEW,
  summaryCards,
} from "./attendanceMetricsView";

const person = (n: number): FollowUpPerson => ({
  key: `member:${n}`,
  name: `Person ${n}`,
  kind: "member",
  lastAttended: null,
  recentCount: 0,
  reasonCode: "lapsed",
  reason: "Used to attend regularly",
});

const data = (over: Partial<SubgroupMetricsData> = {}): SubgroupMetricsData => ({
  summary: {
    avgAttendance: 20,
    avgAttendancePrev: 25,
    changePct: -20,
    avgWeeklyAttendance: 30,
    avgWeeklyAttendancePrev: 24,
    weeklyChangePct: 25,
    eventsHeld: 4,
    uniqueAttendees: 60,
    newcomers: 5,
    followUpCount: 2,
    weeklyConsistency: 0.8,
  },
  attendanceByEvent: [{ at: 1, label: "1 Oct", value: 20 }],
  rollingAverage: [],
  weeklyTrend: [{ at: 1, label: "1 Oct", value: 30 }],
  uniqueByMonth: [],
  newVsReturning: [],
  followUps: [person(1), person(2)],
  breakdowns: [],
  hasEnoughHistory: true,
  hasWeeklyMeetings: true,
  ...over,
});

const snapshot = (d: SubgroupMetricsData) => ({ computedAt: 1000, data: d });

describe("summaryCards", () => {
  it("leads with the weekly average and its change when weekly meetings exist", () => {
    const [headline, people, newcomers] = summaryCards(data());
    expect(headline).toMatchObject({
      label: "Weekly avg",
      value: "30",
      delta: { text: "+25%", direction: "up" },
      hint: "vs 24",
    });
    expect(people).toMatchObject({ label: "People", value: "60" });
    expect(newcomers).toMatchObject({ label: "New people", value: "5", tone: "positive" });
  });

  it("falls back to the per-event average without weekly meetings", () => {
    const [headline] = summaryCards(
      data({
        hasWeeklyMeetings: false,
        summary: { ...data().summary, avgWeeklyAttendance: null, avgAttendancePrev: null, changePct: 0 },
      })
    );
    expect(headline).toMatchObject({
      label: "Avg / event",
      value: "20",
      delta: { text: "0%", direction: "flat" },
      hint: undefined,
    });
  });

  it("leaves out the change when there's no earlier period", () => {
    const [headline] = summaryCards(
      data({
        summary: {
          ...data().summary,
          weeklyChangePct: null,
          avgWeeklyAttendancePrev: null,
        },
      })
    );
    expect(headline.delta).toBeUndefined();
    expect(headline.hint).toBeUndefined();
  });

  it("marks a drop as down", () => {
    const [headline] = summaryCards(
      data({ summary: { ...data().summary, weeklyChangePct: -10 } })
    );
    expect(headline.delta).toEqual({ text: "-10%", direction: "down" });
  });
});

describe("buildAttendanceView", () => {
  it("says it's not ready when there's no snapshot", () => {
    const blocks = buildAttendanceView({ snapshot: null, orgWide: false, campusWeekly: [] });
    expect(blocks).toEqual([expect.objectContaining({ type: "empty", title: "Not ready yet" })]);
  });

  it("shows a campus as numbers, the weekly trend, then follow-ups", () => {
    const blocks = buildAttendanceView({
      snapshot: snapshot(data()),
      orgWide: false,
      campusWeekly: [],
    });
    expect(blocks.map((b) => b.type)).toEqual(["updated", "cards", "bars", "followUps"]);
    expect(blocks[2]).toMatchObject({ title: "Weekly meetings", colour: "success" });
    expect(blocks[3]).toMatchObject({
      title: "Needs follow-up",
      total: 2,
      preview: FOLLOW_UP_PREVIEW,
    });
  });

  it("charts every event when the campus has no weekly meetings", () => {
    const blocks = buildAttendanceView({
      snapshot: snapshot(data({ hasWeeklyMeetings: false, weeklyTrend: [] })),
      orgWide: false,
      campusWeekly: [],
    });
    expect(blocks[2]).toMatchObject({ type: "bars", title: "Events", colour: "primary" });
  });

  it("caps the follow-up list but keeps the real total", () => {
    const many = Array.from({ length: FOLLOW_UP_MAX + 5 }, (_, i) => person(i));
    const blocks = buildAttendanceView({
      snapshot: snapshot(data({ followUps: many })),
      orgWide: false,
      campusWeekly: [],
    });
    const followUps = blocks.find((b) => b.type === "followUps");
    expect(followUps).toMatchObject({ total: FOLLOW_UP_MAX + 5 });
    expect(followUps?.type === "followUps" && followUps.people).toHaveLength(FOLLOW_UP_MAX);
  });

  it("says there were no events when a campus range is empty", () => {
    const blocks = buildAttendanceView({
      snapshot: snapshot(data({ hasEnoughHistory: false })),
      orgWide: false,
      campusWeekly: [],
    });
    expect(blocks.map((b) => b.type)).toEqual(["updated", "empty"]);
  });

  it("shows SOW as the campus comparison, then SOW events' numbers", () => {
    const blocks = buildAttendanceView({
      snapshot: snapshot(data()),
      orgWide: true,
      campusWeekly: [{ campus: "University of Sydney", avgWeekly: 40 }],
    });
    expect(blocks.map((b) => b.type)).toEqual(["updated", "breakdown", "label", "cards"]);
    expect(blocks[1]).toMatchObject({
      title: "Weekly avg by campus",
      rows: [{ label: "University of Sydney", value: 40 }],
    });
    expect(blocks[2]).toEqual({ type: "label", text: "SOW events" });
  });

  it("keeps the SOW comparison even with no SOW events in range", () => {
    const blocks = buildAttendanceView({
      snapshot: snapshot(data({ hasEnoughHistory: false })),
      orgWide: true,
      campusWeekly: [{ campus: "UNSW", avgWeekly: 12 }],
    });
    expect(blocks.map((b) => b.type)).toEqual(["updated", "breakdown"]);
  });

  it("says there were no events when SOW has nothing to show", () => {
    const blocks = buildAttendanceView({
      snapshot: snapshot(data({ hasEnoughHistory: false })),
      orgWide: true,
      campusWeekly: [],
    });
    expect(blocks.map((b) => b.type)).toEqual(["updated", "empty"]);
  });
});

it("offers the precomputed ranges, past month by default", () => {
  expect(ATTENDANCE_RANGE_OPTIONS).toEqual([
    { weeks: 1, label: "Past week", isDefault: false },
    { weeks: 4, label: "Past month", isDefault: true },
    { weeks: 52, label: "Past year", isDefault: false },
  ]);
});

describe("resolveRangeWeeks", () => {
  const options = [
    { weeks: 2, label: "2 weeks" },
    { weeks: 8, label: "8 weeks", isDefault: true },
  ];
  it("keeps the picked range while the server offers it", () => {
    expect(resolveRangeWeeks(2, options)).toBe(2);
  });
  it("falls back to the server default when the pick is gone", () => {
    expect(resolveRangeWeeks(DEFAULT_RANGE_WEEKS, options)).toBe(8);
  });
  it("falls back to the first option without a default", () => {
    expect(resolveRangeWeeks(4, [{ weeks: 12 }, { weeks: 26 }])).toBe(12);
  });
  it("keeps the pick until the options load", () => {
    expect(resolveRangeWeeks(4, undefined)).toBe(4);
    expect(resolveRangeWeeks(4, [])).toBe(4);
  });
});
