/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api } from "./_generated/api";
import {
  avgTenureYears,
  buildEmailToImportId,
  lifetimeAvgTenureYears,
  lifetimeTenureAtLeastPct,
  profilePersonKey,
  retentionRate,
  tenureAtLeastPct,
  turnoverRate,
} from "./generalMetrics";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
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

  test("lifetimeTenureAtLeastPct is over everyone ever in the map", () => {
    const yearsByPerson = new Map<string, Set<number>>([
      ["a", new Set([2024, 2025])],
      ["b", new Set([2025])],
    ]);
    expect(lifetimeTenureAtLeastPct(yearsByPerson)).toBe(50);
    expect(lifetimeTenureAtLeastPct(new Map())).toBe(0);
    expect(lifetimeAvgTenureYears(yearsByPerson)).toBe(1.5);
  });
});

describe("staffTrends", () => {
  test("is public — anonymous and profile-less callers see the org-wide trends", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const staff = (await asUser(t, CALLER).query(api.generalMetrics.staffTrends, {}))!;
    const stranger = await asUser(t, "stranger@sow.org.au").query(
      api.generalMetrics.staffTrends,
      {}
    );
    const anon = await t.query(api.generalMetrics.staffTrends, {});
    expect(stranger).not.toBeNull();
    expect(anon).not.toBeNull();
    for (const r of [stranger!, anon!]) {
      expect(r.years).toEqual(staff.years);
      expect(r.allStaff).toEqual(staff.allStaff);
      expect(r.staff).toEqual(staff.staff);
      expect(r.studentLeaders).toEqual(staff.studentLeaders);
      expect(r.campuses).toEqual(staff.campuses);
      expect(r.studentLeadersByCampus).toEqual(staff.studentLeadersByCampus);
    }
  });

  test("aggregates head-count, staff vs student leaders, and by campus per year", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const trends = (await asUser(t, CALLER).query(api.generalMetrics.staffTrends, {}))!;

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
    const trends = (await asUser(t, CALLER).query(api.generalMetrics.staffTrends, {}))!;

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

    expect(trends.lifetimeTenure2Plus).toEqual({
      overall: 50,
      staff: 100,
      studentLeaders: 33.3,
    });
    expect(trends.lifetimeAvgTenureYears).toEqual({
      overall: 1.5,
      staff: 2,
      studentLeaders: 1.3,
    });
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
    const trends = (await asUser(t, CALLER).query(api.generalMetrics.staffTrends, {}))!;

    expect(trends.turnover.overall).toEqual([null, 50]);
    expect(trends.turnover.staff).toEqual([null, 100]);
    expect(trends.turnover.studentLeaders).toEqual([null, 0]);
    expect(trends.retention.overall).toEqual([null, 50]);
    expect(trends.retention.staff).toEqual([null, 0]);
    expect(trends.retention.studentLeaders).toEqual([null, 100]);

    expect(trends.lifetimeTenure2Plus.studentLeaders).toBe(100);
    expect(trends.lifetimeTenure2Plus.staff).toBe(0);
    expect(trends.lifetimeTenure2Plus.overall).toBe(33.3);
    expect(trends.lifetimeAvgTenureYears.overall).toBe(1.3);
    expect(trends.lifetimeAvgTenureYears.staff).toBe(1);
    expect(trends.lifetimeAvgTenureYears.studentLeaders).toBe(2);
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
    const trends = (await asUser(t, CALLER).query(api.generalMetrics.staffTrends, {}))!;
    expect(trends.turnover.staff).toEqual([null, 0]);
    expect(trends.retention.staff).toEqual([null, 100]);
    expect(trends.lifetimeTenure2Plus.staff).toBe(100);
    expect(trends.lifetimeAvgTenureYears.staff).toBe(2);
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
    const trends = (await asUser(t, CALLER).query(api.generalMetrics.staffTrends, {}))!;

    expect(trends.studentLeaders).toEqual([1]);
    expect(trends.studentLeadersByCampus).toEqual([
      { campus: "UNSW", counts: [1] },
      { campus: "USYD", counts: [1] },
    ]);
  });
});

describe("campusWeeklyAttendance", () => {
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
        name: "Weekly Meeting",
      });
      const eventId = await ctx.db.insert("events", {
        name: "Weekly Meeting",
        dateStart: opts.dateStart,
        dateEnd: opts.dateStart + 2 * 60 * 60 * 1000,
        subgroups: [opts.campus],
        tagIds: [tagId],
      });
      for (let i = 0; i < opts.count; i++) {
        await ctx.db.insert("attendance", {
          eventId,
          email: `p${i}@sow.org.au`,
          signInTime: opts.dateStart,
        });
      }
      return eventId;
    });
  }

  const IN_2025 = Date.UTC(2025, 2, 4);
  const IN_2026 = Date.UTC(2026, 2, 4);

  test("averages attendance per campus per staff year, from 2025", async () => {
    const t = convexTest(schema, modules);
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 10 });
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 20 });
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2026, count: 30 });
    await weeklyMeeting(t, { campus: "UNSW", dateStart: IN_2026, count: 8 });

    const res = await t.query(api.generalMetrics.campusWeeklyAttendance, {});
    expect(res.years).toEqual([2025, 2026]);
    expect(res.campuses).toEqual([
      { campus: "UNSW", averages: [0, 8] },
      { campus: "USYD", averages: [15, 30] },
    ]);
  });

  test("ignores events without the Weekly Meeting tag", async () => {
    const t = convexTest(schema, modules);
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 12 });
    await t.run(async (ctx) => {
      const eventId = await ctx.db.insert("events", {
        name: "Social night",
        dateStart: IN_2025,
        dateEnd: IN_2025 + 60 * 60 * 1000,
        subgroups: ["USYD"],
      });
      await ctx.db.insert("attendance", {
        eventId,
        email: "x@sow.org.au",
        signInTime: IN_2025,
      });
    });
    const res = await t.query(api.generalMetrics.campusWeeklyAttendance, {});
    expect(res.years).toEqual([2025]);
    expect(res.campuses).toEqual([{ campus: "USYD", averages: [12] }]);
  });

  test("skips org-wide (SOW) weekly meetings — they belong to no campus", async () => {
    const t = convexTest(schema, modules);
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 9 });
    await weeklyMeeting(t, { campus: "SOW", dateStart: IN_2025, count: 40 });
    const res = await t.query(api.generalMetrics.campusWeeklyAttendance, {});
    expect(res.years).toEqual([2025]);
    expect(res.campuses).toEqual([{ campus: "USYD", averages: [9] }]);
  });
});
