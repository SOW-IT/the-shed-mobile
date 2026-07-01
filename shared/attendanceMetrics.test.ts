import { describe, expect, it } from "vitest";
import {
  computeSubgroupMetrics,
  DAY_MS,
  METRICS_THRESHOLDS as T,
  rangeStartFor,
  STAFF_YEAR_RANGE,
  WEEK_MS,
  type ComputeInput,
  type MetricsAttendance,
  type MetricsEvent,
  type MetricsPerson,
} from "./attendanceMetrics";
import { SOW_SUBGROUP } from "./rollcall";

// A fixed "now" keeps every window deterministic.
const NOW = Date.UTC(2026, 5, 1, 3, 0, 0); // 1 Jun 2026
const weeksAgo = (w: number) => NOW - w * WEEK_MS;
const daysAgo = (d: number) => NOW - d * DAY_MS;

let seq = 0;
const weekly = (dateStart: number, subgroups = [SOW_SUBGROUP]): MetricsEvent => ({
  id: `w${seq++}`,
  name: "Weekly Meeting",
  dateStart,
  subgroups,
  collaborative: subgroups.length > 1,
  isWeeklyMeeting: true,
});
const oneOff = (dateStart: number, subgroups = [SOW_SUBGROUP]): MetricsEvent => ({
  id: `e${seq++}`,
  name: "Event",
  dateStart,
  subgroups,
  collaborative: subgroups.length > 1,
  isWeeklyMeeting: false,
});

const person = (key: string, over: Partial<MetricsPerson> = {}): MetricsPerson => ({
  key,
  name: key,
  kind: "member",
  ...over,
});

const attend = (event: MetricsEvent, key: string): MetricsAttendance => ({
  eventId: event.id,
  personKey: key,
  signInTime: event.dateStart,
});

const build = (
  events: MetricsEvent[],
  attendance: MetricsAttendance[],
  persons: MetricsPerson[],
  over: Partial<ComputeInput> = {}
): ComputeInput => ({
  now: NOW,
  subgroup: SOW_SUBGROUP,
  rangeStartMs: weeksAgo(8),
  historyStartMs: weeksAgo(20),
  events,
  attendance,
  persons,
  includeCollaborative: true,
  ...over,
});

/** A run of `count` weekly meetings, one per week, ending `endWeeksAgo` back. */
const weeklySeries = (count: number, endWeeksAgo = 0): MetricsEvent[] =>
  Array.from({ length: count }, (_, i) => weekly(weeksAgo(endWeeksAgo + count - 1 - i)));

const findReason = (data: ReturnType<typeof computeSubgroupMetrics>, key: string) =>
  data.followUps.find((f) => f.key === key);

describe("computeSubgroupMetrics — classification", () => {
  it("flags a regular attendee who missed the last N weekly meetings as at_risk", () => {
    const meetings = weeklySeries(10); // 10 consecutive weekly meetings
    // Alice attended the first 7, then vanished for the final 3.
    const attendance = meetings
      .slice(0, 7)
      .map((m) => attend(m, "alice"));
    const data = computeSubgroupMetrics(
      build(meetings, attendance, [person("alice", { name: "Alice" })])
    );
    const alice = findReason(data, "alice");
    expect(alice?.reasonCode).toBe("at_risk");
    expect(alice?.reason).toContain(`last ${T.atRiskMissedWeeklies}`);
  });

  it("does not flag a regular who is still showing up", () => {
    const meetings = weeklySeries(10);
    const attendance = meetings.map((m) => attend(m, "bob")); // attends all
    const data = computeSubgroupMetrics(
      build(meetings, attendance, [person("bob")])
    );
    expect(findReason(data, "bob")).toBeUndefined();
  });

  it("flags a former regular with no recent attendance as lapsed", () => {
    // Attended 4 events, all more than lapsedDays ago.
    const events = [
      oneOff(daysAgo(80)),
      oneOff(daysAgo(72)),
      oneOff(daysAgo(65)),
      oneOff(daysAgo(50)),
    ];
    const attendance = events.map((e) => attend(e, "carol"));
    const data = computeSubgroupMetrics(
      build(events, attendance, [person("carol")], {
        historyStartMs: daysAgo(120),
      })
    );
    const carol = findReason(data, "carol");
    expect(carol?.reasonCode).toBe("lapsed");
    expect(carol?.reason).toMatch(/absent for/);
  });

  it("flags a one-time newcomer who has not returned", () => {
    const meetings = weeklySeries(4); // weekly meetings over the last 4 weeks
    // Dave came to the FIRST of those and never again; later meetings existed.
    const data = computeSubgroupMetrics(
      build(meetings, [attend(meetings[0], "dave")], [person("dave")])
    );
    const dave = findReason(data, "dave");
    expect(dave?.reasonCode).toBe("newcomer_no_return");
    expect(dave?.reason).toMatch(/^Newcomer/);
  });

  it("counts a genuine newcomer in the summary", () => {
    const meetings = weeklySeries(4);
    const data = computeSubgroupMetrics(
      build(meetings, [attend(meetings[3], "erin")], [person("erin")])
    );
    expect(data.summary.newcomers).toBe(1);
  });

  it("does not count months-old joiners as newcomers over a long range", () => {
    // Staff-year range: someone whose first attendance was ~60 days ago is not
    // a newcomer (outside the 30-day window), but a 10-day-ago joiner is.
    const oldStart = oneOff(daysAgo(60));
    const oldRecent = oneOff(daysAgo(5));
    const fresh = oneOff(daysAgo(10));
    const data = computeSubgroupMetrics(
      build(
        [oldStart, oldRecent, fresh],
        [attend(oldStart, "old"), attend(oldRecent, "old"), attend(fresh, "new")],
        [person("old"), person("new")],
        { rangeStartMs: daysAgo(300), historyStartMs: daysAgo(320) }
      )
    );
    expect(data.summary.newcomers).toBe(1);
  });

  it("flags someone who returned after a long gap as reengaged", () => {
    const old = oneOff(daysAgo(90));
    const recent = oneOff(daysAgo(3));
    const data = computeSubgroupMetrics(
      build([old, recent], [attend(old, "frank"), attend(recent, "frank")], [
        person("frank"),
      ], { historyStartMs: daysAgo(120) })
    );
    const frank = findReason(data, "frank");
    expect(frank?.reasonCode).toBe("reengaged");
    expect(frank?.reason).toMatch(/Returned after/);
  });

  it("flags declining attendance for someone tapering off (not yet lapsed)", () => {
    // Prior half of the 8-week window: 3 attendances. Recent half: 1.
    const events = [
      oneOff(weeksAgo(7)),
      oneOff(weeksAgo(6)),
      oneOff(weeksAgo(5)),
      oneOff(weeksAgo(1)),
    ];
    const attendance = events.map((e) => attend(e, "gina"));
    const data = computeSubgroupMetrics(
      build(events, attendance, [person("gina")])
    );
    const gina = findReason(data, "gina");
    expect(gina?.reasonCode).toBe("declining");
  });
});

describe("computeSubgroupMetrics — summary & trends", () => {
  it("computes average attendance and change vs the previous period", () => {
    // Previous 8-week period: 2 events, 1 attendee each → avg 1.
    // Current 8-week period: 2 events, 3 attendees each → avg 3.
    const prevA = oneOff(weeksAgo(15));
    const prevB = oneOff(weeksAgo(12));
    const curA = oneOff(weeksAgo(6));
    const curB = oneOff(weeksAgo(2));
    const attendance = [
      attend(prevA, "p1"),
      attend(prevB, "p1"),
      ...["a", "b", "c"].flatMap((k) => [attend(curA, k), attend(curB, k)]),
    ];
    const persons = ["p1", "a", "b", "c"].map((k) => person(k));
    const data = computeSubgroupMetrics(
      build([prevA, prevB, curA, curB], attendance, persons, {
        historyStartMs: weeksAgo(20),
      })
    );
    expect(data.summary.avgAttendance).toBe(3);
    expect(data.summary.avgAttendancePrev).toBe(1);
    expect(data.summary.changePct).toBe(200);
    expect(data.summary.eventsHeld).toBe(2);
    expect(data.summary.uniqueAttendees).toBe(3);
  });

  it("splits new vs returning attendees per event", () => {
    const e1 = oneOff(weeksAgo(6));
    const e2 = oneOff(weeksAgo(2));
    const data = computeSubgroupMetrics(
      build(
        [e1, e2],
        [attend(e1, "x"), attend(e2, "x"), attend(e2, "y")],
        [person("x"), person("y")]
      )
    );
    expect(data.newVsReturning[0]).toMatchObject({ fresh: 1, returning: 0 });
    expect(data.newVsReturning[1]).toMatchObject({ fresh: 1, returning: 1 });
  });

  it("reports a weekly consistency score between 0 and 1", () => {
    const meetings = weeklySeries(3);
    // Turnout 2, 2, 4 → avg 2.67 / peak 4 = 0.7.
    const attendance = [
      attend(meetings[0], "a"),
      attend(meetings[0], "b"),
      attend(meetings[1], "a"),
      attend(meetings[1], "b"),
      attend(meetings[2], "a"),
      attend(meetings[2], "b"),
      attend(meetings[2], "c"),
      attend(meetings[2], "d"),
    ];
    const data = computeSubgroupMetrics(
      build(meetings, attendance, ["a", "b", "c", "d"].map((k) => person(k)))
    );
    expect(data.summary.weeklyConsistency).toBeGreaterThan(0);
    expect(data.summary.weeklyConsistency).toBeLessThanOrEqual(1);
  });

  it("says there isn't enough history when events are sparse", () => {
    const e = oneOff(weeksAgo(1));
    const data = computeSubgroupMetrics(build([e], [attend(e, "a")], [person("a")]));
    expect(data.hasEnoughHistory).toBe(false);
  });
});

describe("computeSubgroupMetrics — filters & scoping", () => {
  it("excludes collaborative events when includeCollaborative is false", () => {
    const solo = weekly(weeksAgo(2), [SOW_SUBGROUP]);
    const collab = weekly(weeksAgo(1), [SOW_SUBGROUP, "University of Sydney"]);
    const data = computeSubgroupMetrics(
      build([solo, collab], [attend(solo, "a"), attend(collab, "a")], [person("a")], {
        includeCollaborative: false,
      })
    );
    expect(data.summary.eventsHeld).toBe(1);
  });

  it("only considers events in the asked-for sub-group", () => {
    const mine = weekly(weeksAgo(2), ["University of Sydney"]);
    const other = weekly(weeksAgo(1), ["University of New South Wales"]);
    const data = computeSubgroupMetrics(
      build([mine, other], [attend(mine, "a"), attend(other, "b")], [
        person("a"),
        person("b"),
      ], { subgroup: "University of Sydney" })
    );
    expect(data.summary.eventsHeld).toBe(1);
    expect(data.summary.uniqueAttendees).toBe(1);
  });

  it("builds metadata breakdowns from unique period attendees", () => {
    const e = weekly(weeksAgo(2));
    const data = computeSubgroupMetrics(
      build(
        [e],
        [attend(e, "a"), attend(e, "b")],
        [
          person("a", { breakdown: { Campus: "USYD" } }),
          person("b", { breakdown: { Campus: "USYD" } }),
        ]
      )
    );
    const campus = data.breakdowns.find((b) => b.field === "Campus");
    expect(campus?.rows[0]).toEqual({ label: "USYD", value: 2 });
  });

  it("ranks breakdown values by count, most first", () => {
    const e = weekly(weeksAgo(2));
    const data = computeSubgroupMetrics(
      build(
        [e],
        [attend(e, "a"), attend(e, "b"), attend(e, "c")],
        [
          person("a", { breakdown: { Campus: "USYD" } }),
          person("b", { breakdown: { Campus: "USYD" } }),
          person("c", { breakdown: { Campus: "UNSW" } }),
        ]
      )
    );
    const campus = data.breakdowns.find((b) => b.field === "Campus");
    expect(campus?.rows).toEqual([
      { label: "USYD", value: 2 },
      { label: "UNSW", value: 1 },
    ]);
  });
});

describe("computeSubgroupMetrics — follow-up ordering", () => {
  it("orders follow-ups by urgency, then longest-absent within a reason", () => {
    const meetings = weeklySeries(10);
    const attendance = [
      // At risk: a regular (first 7 weekly meetings) who missed the last 3.
      ...meetings.slice(0, 7).map((m) => attend(m, "risk")),
      // Two lapsed regulars with different last-seen dates (tiebreak).
      attend(meetings[0], "lapEarly"),
      attend(meetings[1], "lapEarly"),
      attend(meetings[2], "lapEarly"), // last seen ~7 weeks ago
      attend(meetings[0], "lapLater"),
      attend(meetings[1], "lapLater"),
      attend(meetings[3], "lapLater"), // last seen ~6 weeks ago
    ];
    const data = computeSubgroupMetrics(
      build(meetings, attendance, [
        person("risk"),
        person("lapEarly"),
        person("lapLater"),
      ])
    );
    expect(data.followUps.map((f) => f.reasonCode)).toEqual([
      "at_risk",
      "lapsed",
      "lapsed",
    ]);
    // Within the lapsed pair, the one absent longer (lapEarly) comes first.
    const lapsed = data.followUps.filter((f) => f.reasonCode === "lapsed");
    expect(lapsed.map((f) => f.key)).toEqual(["lapEarly", "lapLater"]);
  });
});

describe("rangeStartFor", () => {
  it("returns a trailing window for a week count", () => {
    expect(rangeStartFor(NOW, 4, 0)).toBe(NOW - 4 * WEEK_MS);
  });
  it("returns the staff-year start for the staff-year sentinel", () => {
    const start = weeksAgo(30);
    expect(rangeStartFor(NOW, STAFF_YEAR_RANGE, start)).toBe(start);
  });
});
