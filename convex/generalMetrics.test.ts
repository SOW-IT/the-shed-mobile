/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { DEFAULT_WEEKLY_SETTINGS } from "../shared/weeklyInsights";
import { api, internal } from "./_generated/api";
import {
  avgTenureYears,
  buildEmailToImportId,
  computeStaffTrends,
  profilePersonKey,
  retentionRate,
  tenureAtLeastPct,
  turnoverRate,
} from "./generalMetrics";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
// Pinned mid staff year (still ticking) so dates a few weeks either side of
// "now" never straddle the 1 October rollover (see ADR 0003).
const PINNED_NOW = staffYearStartMs(staffYearForDate(new Date())) + 150 * 86_400_000;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});
const YEAR = staffYearForDate(new Date(PINNED_NOW));
const PREV = YEAR - 1;
const NEXT = YEAR + 1;

const CALLER = "caller@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

type Assignment = { role: string; department?: string; university?: string };
const profile = (
  email: string,
  year: number,
  assignments: Assignment[],
  extra?: { importId?: string }
) => ({
  email,
  year,
  assignments,
  ...extra,
});

const trendsOf = (t: TestConvex<typeof schema>) => t.run((ctx) => computeStaffTrends(ctx));

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const rows = [
      profile(CALLER, YEAR, [{ role: "Staff", department: "Marketing" }]),
      profile("bob@sow.org.au", YEAR, [{ role: "Student Leader", university: "USYD" }]),
      profile("carol@sow.org.au", YEAR, [{ role: "Student Leader", university: "UNSW" }]),
      profile("dave@sow.org.au", YEAR, [{ role: "Student Leader", university: "USYD" }]),
      profile(CALLER, PREV, [{ role: "Staff", department: "Marketing" }]),
      profile("bob@sow.org.au", PREV, [{ role: "Student Leader", university: "USYD" }]),
      profile("eve@sow.org.au", NEXT, [{ role: "Student Leader", university: "UNSW" }]),
    ];
    for (const row of rows) await ctx.db.insert("staffProfiles", row);
  });
}

describe("turnover and tenure helpers", () => {
  test("profilePersonKey prefers importId and normalises email", () => {
    expect(profilePersonKey({ email: "a@sow.org.au", importId: "uid-1" })).toBe(
      "import:uid-1"
    );
    expect(profilePersonKey({ email: "a@sow.org.au" })).toBe("email:a@sow.org.au");
    expect(profilePersonKey({ email: "  A@SOW.ORG.AU  " })).toBe(
      "email:a@sow.org.au"
    );
  });

  test("profilePersonKey reuses importId from other years of the same email", () => {
    const emailToImportId = buildEmailToImportId([
      { email: "a@sow.org.au", importId: "uid-1" },
      { email: "a@sow.org.au" },
    ]);
    expect(profilePersonKey({ email: "a@sow.org.au" }, emailToImportId)).toBe(
      "import:uid-1"
    );
  });

  test("turnoverRate is leavers / prior head-count", () => {
    expect(turnoverRate(new Set(["a", "b", "c"]), new Set(["a", "c"]))).toBe(
      33.3
    );
    expect(turnoverRate(new Set(["a"]), new Set(["a"]))).toBe(0);
    expect(turnoverRate(new Set(), new Set(["a"]))).toBeNull();
  });

  test("retentionRate is stayers / prior head-count (complement of turnover)", () => {
    expect(retentionRate(new Set(["a", "b", "c"]), new Set(["a", "c"]))).toBe(
      66.7
    );
    expect(retentionRate(new Set(["a"]), new Set(["a"]))).toBe(100);
    expect(retentionRate(new Set(), new Set(["a"]))).toBeNull();
  });

  test("tenureAtLeastPct counts careers spanning min years as-of a year", () => {
    const yearsByPerson = new Map<string, Set<number>>([
      ["a", new Set([2024, 2025])],
      ["b", new Set([2025])],
      ["c", new Set([2023, 2024, 2025])],
    ]);
    expect(
      tenureAtLeastPct(new Set(["a", "b", "c"]), yearsByPerson, 2025)
    ).toBe(66.7);
    expect(tenureAtLeastPct(new Set(["a", "c"]), yearsByPerson, 2024)).toBe(50);
    expect(tenureAtLeastPct(new Set(), yearsByPerson, 2025)).toBeNull();
  });

  test("avgTenureYears is the mean career length as-of a year", () => {
    const yearsByPerson = new Map<string, Set<number>>([
      ["a", new Set([2024, 2025])],
      ["b", new Set([2025])],
      ["c", new Set([2023, 2024, 2025])],
    ]);
    expect(avgTenureYears(new Set(["a", "b", "c"]), yearsByPerson, 2025)).toBe(
      2
    );
    expect(avgTenureYears(new Set(), yearsByPerson, 2025)).toBeNull();
  });
});

describe("staff trends", () => {
  test("is public: anonymous and profile-less callers see the same org-wide trends", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const staff = await asUser(t, CALLER).query(api.generalMetrics.view, { scope: "all" });
    const stranger = await asUser(t, "stranger@sow.org.au").query(api.generalMetrics.view, {
      scope: "all",
    });
    const anon = await t.query(api.generalMetrics.view, { scope: "all" });
    expect(staff.years).toEqual([PREV, YEAR]);
    for (const r of [stranger, anon]) {
      expect(r.years).toEqual(staff.years);
      expect(r.blocks).toEqual(staff.blocks);
    }
  });

  test("aggregates head-count, staff vs student leaders, and by campus per year", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const trends = await trendsOf(t);

    expect(trends.years).toEqual([PREV, YEAR]);
    expect(trends.years).not.toContain(NEXT);
    expect(trends.allStaff).toEqual([2, 4]);
    expect(trends.staff).toEqual([1, 1]);
    expect(trends.studentLeaders).toEqual([1, 3]);
    expect(trends.campuses).toEqual(["UNSW", "USYD"]);
    expect(trends.studentLeadersByCampus).toEqual([
      { campus: "UNSW", counts: [0, 1] },
      { campus: "USYD", counts: [1, 2] },
    ]);
  });

  test("reports year-over-year turnover, retention, and multi-year tenure", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const trends = await trendsOf(t);

    expect(trends.turnover.overall).toEqual([null, 0]);
    expect(trends.turnover.staff).toEqual([null, 0]);
    expect(trends.turnover.studentLeaders).toEqual([null, 0]);
    expect(trends.retention.overall).toEqual([null, 100]);
    expect(trends.retention.staff).toEqual([null, 100]);
    expect(trends.retention.studentLeaders).toEqual([null, 100]);

    expect(trends.tenure2Plus.overall).toEqual([0, 50]);
    expect(trends.tenure2Plus.staff).toEqual([0, 100]);
    expect(trends.tenure2Plus.studentLeaders).toEqual([0, 33.3]);

    expect(trends.avgTenureYears.overall).toEqual([1, 1.5]);
    expect(trends.avgTenureYears.staff).toEqual([1, 2]);
    expect(trends.avgTenureYears.studentLeaders).toEqual([1, 1.3]);
  });

  test("averages years served up to the picked year across every role, as in the worked example", async () => {
    const t = convexTest(schema, modules);
    const leader = [{ role: "Student Leader", university: "USYD" }];
    const staff = [{ role: "Staff", department: "Ops" }];
    const careers: { email: string; from: number; roleIn: (year: number) => Assignment[] }[] = [
      { email: "leader1@sow.org.au", from: YEAR - 2, roleIn: () => leader },
      { email: "leader2@sow.org.au", from: YEAR - 1, roleIn: () => leader },
      { email: "staff3@sow.org.au", from: YEAR - 2, roleIn: () => staff },
      { email: "staff4@sow.org.au", from: YEAR - 4, roleIn: () => staff },
      { email: "staff6@sow.org.au", from: YEAR - 6, roleIn: (y) => (y < YEAR - 3 ? leader : staff) },
    ];
    await t.run(async (ctx) => {
      for (const c of careers) {
        for (let y = c.from; y <= YEAR; y++) {
          await ctx.db.insert("staffProfiles", profile(c.email, y, c.roleIn(y)));
        }
      }
      await ctx.db.insert("staffProfiles", profile("leader1@sow.org.au", NEXT, leader));
    });
    const trends = await trendsOf(t);
    const at = (year: number) => trends.years.indexOf(year);

    expect(trends.years.at(-1)).toBe(YEAR);
    expect(trends.allStaff[at(YEAR)]).toBe(5);
    expect(trends.avgTenureYears.overall[at(YEAR)]).toBe(4);
    expect(trends.avgTenureYears.studentLeaders[at(YEAR)]).toBe(2.5);
    expect(trends.avgTenureYears.staff[at(YEAR)]).toBe(5);

    expect(trends.avgTenureYears.overall[at(PREV)]).toBe(3);
    expect(trends.avgTenureYears.studentLeaders[at(PREV)]).toBe(1.5);
    expect(trends.avgTenureYears.staff[at(PREV)]).toBe(4);

    expect(trends.tenure2Plus.overall[at(YEAR)]).toBe(100);
    expect(trends.tenure2Plus.overall[at(PREV)]).toBe(80);
    expect(trends.tenure2Plus.studentLeaders[at(PREV)]).toBe(50);
    expect(trends.tenure2Plus.staff[at(PREV)]).toBe(100);
  });

  test("a student leader who becomes staff is retained, and keeps their leader years", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "staffProfiles",
        profile("sam@sow.org.au", PREV, [{ role: "Student Leader", university: "USYD" }])
      );
      await ctx.db.insert("staffProfiles", profile("sam@sow.org.au", YEAR, [{ role: "Staff", department: "Ops" }]));
      await ctx.db.insert("staffProfiles", profile("ann@sow.org.au", PREV, [{ role: "Staff", department: "Ops" }]));
    });
    const trends = await trendsOf(t);

    expect(trends.retention.studentLeaders).toEqual([null, 100]);
    expect(trends.retention.staff).toEqual([null, 0]);
    expect(trends.retention.overall).toEqual([null, 50]);
    expect(trends.turnover.studentLeaders).toEqual([null, 0]);
    expect(trends.avgTenureYears.staff).toEqual([1, 2]);
    expect(trends.tenure2Plus.staff).toEqual([0, 100]);
    expect(trends.avgTenureYears.overall).toEqual([1, 2]);
  });

  test("counts a leaver toward turnover and links a person across email renames", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "staffProfiles",
        profile("alice@sow.org.au", PREV, [{ role: "Staff", department: "Ops" }])
      );
      await ctx.db.insert(
        "staffProfiles",
        profile(
          "bob.old@sow.org.au",
          PREV,
          [{ role: "Student Leader", university: "USYD" }],
          { importId: "bob-1" }
        )
      );
      await ctx.db.insert(
        "staffProfiles",
        profile(
          "bob.new@sow.org.au",
          YEAR,
          [{ role: "Student Leader", university: "USYD" }],
          { importId: "bob-1" }
        )
      );
      await ctx.db.insert(
        "staffProfiles",
        profile(CALLER, YEAR, [{ role: "Staff", department: "Marketing" }])
      );
    });
    const trends = await trendsOf(t);

    expect(trends.turnover.overall).toEqual([null, 50]);
    expect(trends.turnover.staff).toEqual([null, 100]);
    expect(trends.turnover.studentLeaders).toEqual([null, 0]);
    expect(trends.retention.overall).toEqual([null, 50]);
    expect(trends.retention.staff).toEqual([null, 0]);
    expect(trends.retention.studentLeaders).toEqual([null, 100]);

    expect(trends.avgTenureYears.overall).toEqual([1, 1.5]);
    expect(trends.avgTenureYears.staff).toEqual([1, 1]);
    expect(trends.avgTenureYears.studentLeaders).toEqual([1, 2]);
  });

  test("partial importId backfill does not split one email into two people", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "staffProfiles",
        profile(CALLER, PREV, [{ role: "Staff", department: "Marketing" }])
      );
      await ctx.db.insert(
        "staffProfiles",
        profile(
          CALLER,
          YEAR,
          [{ role: "Staff", department: "Marketing" }],
          { importId: "caller-1" }
        )
      );
    });
    const trends = await trendsOf(t);
    expect(trends.turnover.staff).toEqual([null, 0]);
    expect(trends.retention.staff).toEqual([null, 100]);
    expect(trends.tenure2Plus.staff).toEqual([0, 100]);
    expect(trends.avgTenureYears.staff).toEqual([1, 2]);
  });

  test("leaves outsourced people out of the staff numbers", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "staffProfiles",
        profile(CALLER, YEAR, [{ role: "Staff", department: "Marketing" }])
      );
      await ctx.db.insert(
        "staffProfiles",
        profile("contractor@sow.org.au", YEAR, [{ role: "Outsource", department: "Marketing" }])
      );
      await ctx.db.insert(
        "staffProfiles",
        profile("both@sow.org.au", YEAR, [
          { role: "Outsource", department: "Marketing" },
          { role: "Staff", department: "Ops" },
        ])
      );
      await ctx.db.insert(
        "staffProfiles",
        profile("leader@sow.org.au", YEAR, [
          { role: "Outsource", department: "Marketing" },
          { role: "Student Leader", university: "USYD" },
        ])
      );
    });
    const trends = await trendsOf(t);

    expect(trends.allStaff).toEqual([3]);
    expect(trends.staff).toEqual([2]);
    expect(trends.studentLeaders).toEqual([1]);
  });

  test("counts a leader with two campus roles once per campus, not twice", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "staffProfiles",
        profile(CALLER, YEAR, [{ role: "Staff", department: "Marketing" }])
      );
      await ctx.db.insert(
        "staffProfiles",
        profile("multi@sow.org.au", YEAR, [
          { role: "Student Leader", university: "USYD" },
          { role: "Student Leader", university: "UNSW" },
        ])
      );
    });
    const trends = await trendsOf(t);

    expect(trends.studentLeaders).toEqual([1]);
    expect(trends.studentLeadersByCampus).toEqual([
      { campus: "UNSW", counts: [1] },
      { campus: "USYD", counts: [1] },
    ]);
  });
});

describe("campus weekly attendance in General", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 1)));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function weeklyMeeting(
    t: TestConvex<typeof schema>,
    opts: { campus: string; dateStart: number; count: number }
  ) {
    return t.run(async (ctx) => {
      const tagId = await ctx.db.insert("attendanceTags", {
        name: "Weeklies",
      });
      const eventId = await ctx.db.insert("events", {
        name: "T1W3",
        dateStart: opts.dateStart,
        dateEnd: opts.dateStart + 2 * 60 * 60 * 1000,
        subgroups: [opts.campus],
        tagIds: [tagId],
        weekly: { year: new Date(opts.dateStart).getUTCFullYear(), slot: 1, week: 3 },
      });
      for (let i = 0; i < opts.count; i++) {
        const memberId = await ctx.db.insert("attendanceMembers", { name: `Person ${i}` });
        await ctx.db.insert("attendance", {
          eventId,
          memberId,
          signInTime: opts.dateStart,
        });
      }
      return eventId;
    });
  }

  async function withStaffHistory() {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert(
        "staffProfiles",
        profile(CALLER, staffYearForDate(new Date()), [{ role: "Staff", department: "Marketing" }])
      )
    );
    return t;
  }

  async function campusWeekly(t: TestConvex<typeof schema>) {
    const { blocks } = await t.query(api.generalMetrics.view, { scope: "all" });
    const chart = blocks.find((b) => b.type === "multiBars" && b.title === "Weeklies average by campus");
    if (chart?.type !== "multiBars") return { years: [], campuses: [] };
    return {
      years: chart.points.map((p) => p.at),
      campuses: chart.legend.map(({ key }) => ({
        campus: key,
        averages: chart.points.map((p) => p.segments.find((s) => s.key === key)?.value),
      })),
    };
  }

  const IN_2025 = Date.UTC(2025, 2, 4);
  const IN_2026 = Date.UTC(2026, 2, 4);

  test("averages attendance per campus per staff year, from 2025", async () => {
    const t = await withStaffHistory();
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 10 });
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 20 });
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2026, count: 30 });
    await weeklyMeeting(t, { campus: "UNSW", dateStart: IN_2026, count: 8 });

    const res = await campusWeekly(t);
    expect(res.years).toEqual([2025, 2026]);
    expect(res.campuses).toEqual([
      { campus: "UNSW", averages: [0, 8] },
      { campus: "USYD", averages: [15, 30] },
    ]);
  });

  test("ignores events that aren't weeklies, whatever their tags", async () => {
    const t = await withStaffHistory();
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 12 });
    await t.run(async (ctx) => {
      const weekliesTag = await ctx.db.insert("attendanceTags", { name: "Weeklies" });
      const social = await ctx.db.insert("events", {
        name: "Social night",
        dateStart: IN_2025,
        dateEnd: IN_2025 + 60 * 60 * 1000,
        subgroups: ["USYD"],
      });
      const tagOnly = await ctx.db.insert("events", {
        name: "Weekly Meeting",
        dateStart: IN_2025,
        dateEnd: IN_2025 + 60 * 60 * 1000,
        subgroups: ["USYD"],
        tagIds: [weekliesTag],
      });
      const memberId = await ctx.db.insert("attendanceMembers", { name: "Not Weekly" });
      for (const eventId of [social, tagOnly]) {
        await ctx.db.insert("attendance", {
          eventId,
          memberId,
          signInTime: IN_2025,
        });
      }
    });
    const res = await campusWeekly(t);
    expect(res.years).toEqual([2025]);
    expect(res.campuses).toEqual([{ campus: "USYD", averages: [12] }]);
  });

  test("a marked weekly counts even without the Weeklies tag", async () => {
    const t = await withStaffHistory();
    await t.run(async (ctx) => {
      const eventId = await ctx.db.insert("events", {
        name: "S1W2",
        dateStart: IN_2025,
        dateEnd: IN_2025 + 60 * 60 * 1000,
        subgroups: ["USYD"],
        weekly: { year: 2025, slot: 1, week: 2 },
      });
      for (let i = 0; i < 7; i++) {
        const memberId = await ctx.db.insert("attendanceMembers", { name: `Person ${i}` });
        await ctx.db.insert("attendance", { eventId, memberId, signInTime: IN_2025 });
      }
    });
    const res = await campusWeekly(t);
    expect(res.campuses).toEqual([{ campus: "USYD", averages: [7] }]);
  });

  test("skips org-wide (SOW) weekly meetings — they belong to no campus", async () => {
    const t = await withStaffHistory();
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 9 });
    await weeklyMeeting(t, { campus: "SOW", dateStart: IN_2025, count: 40 });
    const res = await campusWeekly(t);
    expect(res.years).toEqual([2025]);
    expect(res.campuses).toEqual([{ campus: "USYD", averages: [9] }]);
  });

  test("a weekly shared by several campuses counts only when joint weeklies are switched on", async () => {
    const t = await withStaffHistory();
    await weeklyMeeting(t, { campus: "UNSW", dateStart: IN_2025, count: 20 });
    await weeklyMeeting(t, { campus: "UNSW", dateStart: IN_2025, count: 30 });
    await t.run(async (ctx) => {
      const eventId = await ctx.db.insert("events", {
        name: "Mega Weeklies",
        dateStart: IN_2025,
        dateEnd: IN_2025 + 60 * 60 * 1000,
        subgroups: ["UNSW", "USYD"],
        weekly: { year: 2025, slot: 1, week: 5 },
      });
      for (let i = 0; i < 100; i++) {
        const memberId = await ctx.db.insert("attendanceMembers", { name: `Mega ${i}` });
        await ctx.db.insert("attendance", { eventId, memberId, signInTime: IN_2025 });
      }
    });
    expect((await campusWeekly(t)).campuses).toEqual([{ campus: "UNSW", averages: [25] }]);

    await t.run((ctx) =>
      ctx.db.insert("weeklyInsightsSettings", { ...DEFAULT_WEEKLY_SETTINGS, jointWeeklies: true, version: 1 })
    );
    expect((await campusWeekly(t)).campuses).toEqual([
      { campus: "UNSW", averages: [50] },
      { campus: "USYD", averages: [100] },
    ]);
  });

  test("a weekly meeting nobody signed in to isn't averaged in", async () => {
    const t = await withStaffHistory();
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 20 });
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 0 });
    const res = await campusWeekly(t);
    expect(res.campuses).toEqual([{ campus: "USYD", averages: [20] }]);
  });

  test("serves the nightly snapshot until the next rebuild", async () => {
    const t = await withStaffHistory();
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2026, count: 10 });
    await t.mutation(internal.generalMetrics.recomputeCampusWeeklyAttendance, {});

    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2026, count: 30 });
    const cached = await campusWeekly(t);
    expect(cached.campuses).toEqual([{ campus: "USYD", averages: [0, 10] }]);

    await t.mutation(internal.generalMetrics.recomputeCampusWeeklyAttendance, {});
    const rebuilt = await campusWeekly(t);
    expect(rebuilt.years).toEqual([2025, 2026]);
    expect(rebuilt.campuses).toEqual([{ campus: "USYD", averages: [0, 20] }]);
  });

  test("a rebuild leaves exactly one snapshot row", async () => {
    const t = await withStaffHistory();
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 5 });
    await t.run((ctx) =>
      ctx.db.insert("campusAttendanceSnapshots", {
        computedAt: 0,
        years: [2025],
        campuses: [{ campus: "STALE", averages: [99] }],
      })
    );
    await t.run((ctx) =>
      ctx.db.insert("campusAttendanceSnapshots", {
        computedAt: 1,
        years: [2025],
        campuses: [{ campus: "STALE", averages: [98] }],
      })
    );
    await t.mutation(internal.generalMetrics.recomputeCampusWeeklyAttendance, {});

    const rows = await t.run((ctx) =>
      ctx.db.query("campusAttendanceSnapshots").collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].campuses).toEqual([{ campus: "USYD", averages: [5] }]);
    const res = await campusWeekly(t);
    expect(res.campuses).toEqual([{ campus: "USYD", averages: [5] }]);
  });
});

describe("view", () => {
  test("lays out General with the year list for the scope picker", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const all = await asUser(t, CALLER).query(api.generalMetrics.view, { scope: null });
    expect(all.years).toContain(YEAR);
    const hasPeopleChart = (blocks: typeof all.blocks) =>
      blocks.some((b) => b.type === "multiBars" && b.title === "Staff & student leaders");
    expect(all.blocks[0]).toMatchObject({ type: "label" });
    expect(all.blocks[1]).toMatchObject({ type: "heading", text: "People serving" });
    expect(all.blocks[2]).toMatchObject({ type: "cards" });
    expect(hasPeopleChart(all.blocks)).toBe(true);
    const retention = (blocks: typeof all.blocks) =>
      blocks.find((b) => b.type === "multiBars" && b.title === "Retention");
    expect(retention(all.blocks)).toMatchObject({ unit: "%" });
    expect(retention(all.blocks)).not.toHaveProperty("line");
    const withLines = await asUser(t, CALLER).query(api.generalMetrics.view, { scope: null, lines: true });
    expect(retention(withLines.blocks)).toMatchObject({ unit: "%", line: { key: "Overall" } });

    const year = await asUser(t, CALLER).query(api.generalMetrics.view, { scope: YEAR });
    expect(year.blocks[2]).toMatchObject({ type: "cards" });
    expect(year.blocks[1]).toMatchObject({ type: "heading", text: "People serving" });
    expect(hasPeopleChart(year.blocks)).toBe(false);
  });

  test("signed-out viewers always get the all-years view", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const anon = await t.query(api.generalMetrics.view, { scope: YEAR });
    expect(anon.blocks.some((b) => b.type === "multiBars" && b.title === "Staff & student leaders")).toBe(true);
  });
});
