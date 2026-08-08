/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api } from "./_generated/api";
import {
  avgTenureYears,
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

/** Seed profiles across two staff years, including the caller so auth passes. */
async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const rows = [
      // Current year: 1 staff (the caller) + 3 student leaders (USYD ×2, UNSW ×1).
      profile(CALLER, YEAR, [{ role: "Staff", department: "Marketing" }]),
      profile("bob@sow.org.au", YEAR, [{ role: "Student Leader", university: "USYD" }]),
      profile("carol@sow.org.au", YEAR, [{ role: "Student Leader", university: "UNSW" }]),
      profile("dave@sow.org.au", YEAR, [{ role: "Student Leader", university: "USYD" }]),
      // Previous year: 1 staff + 1 student leader (USYD).
      profile(CALLER, PREV, [{ role: "Staff", department: "Marketing" }]),
      profile("bob@sow.org.au", PREV, [{ role: "Student Leader", university: "USYD" }]),
      // Next staff year (partially pre-assigned) — must be excluded from trends.
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
    // Case/whitespace alone must not create a distinct person.
    expect(profilePersonKey({ email: "  A@SOW.ORG.AU  " })).toBe(
      "email:a@sow.org.au"
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
    // Present in 2025: a (2y), b (1y), c (3y) → 2 of 3 have ≥2 years.
    expect(
      tenureAtLeastPct(new Set(["a", "b", "c"]), yearsByPerson, 2025)
    ).toBe(66.7);
    // As of 2024: a has only 2024 so far (1y), c has 2023+2024 (2y) → 50%.
    expect(tenureAtLeastPct(new Set(["a", "c"]), yearsByPerson, 2024)).toBe(50);
    // Empty lens → null (not 0%) so charts don't invent a reading.
    expect(tenureAtLeastPct(new Set(), yearsByPerson, 2025)).toBeNull();
  });

  test("avgTenureYears is the mean career length as-of a year", () => {
    const yearsByPerson = new Map<string, Set<number>>([
      ["a", new Set([2024, 2025])],
      ["b", new Set([2025])],
      ["c", new Set([2023, 2024, 2025])],
    ]);
    // (2 + 1 + 3) / 3 = 2.0
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
    // (2 + 1) / 2 = 1.5
    expect(lifetimeAvgTenureYears(yearsByPerson)).toBe(1.5);
  });
});

describe("staffTrends", () => {
  test("is public — anonymous and profile-less callers see the org-wide trends", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    // Org-wide trends are aggregate head-counts (no individuals), so they're
    // open to everyone (1.7.0). A profile-less stranger and an anonymous caller
    // get the same data a staff member does.
    const staff = (await asUser(t, CALLER).query(api.generalMetrics.staffTrends, {}))!;
    const stranger = await asUser(t, "stranger@sow.org.au").query(
      api.generalMetrics.staffTrends,
      {}
    );
    const anon = await t.query(api.generalMetrics.staffTrends, {});
    expect(stranger).not.toBeNull();
    expect(anon).not.toBeNull();
    // Same aggregates a staff member sees (`computedAt` is stamped per call).
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

    // The next-year profile is excluded — the trend stops at the current year.
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

    // PREV has no prior year → null. YEAR: everyone from PREV (caller + bob)
    // stayed, so overall / staff / SL turnover are all 0 and retention 100.
    expect(trends.turnover.overall).toEqual([null, 0]);
    expect(trends.turnover.staff).toEqual([null, 0]);
    expect(trends.turnover.studentLeaders).toEqual([null, 0]);
    expect(trends.retention.overall).toEqual([null, 100]);
    expect(trends.retention.staff).toEqual([null, 100]);
    expect(trends.retention.studentLeaders).toEqual([null, 100]);

    // As of PREV everyone is in year 1 of their career → 0% with ≥2 years.
    // As of YEAR: caller and bob have 2 years; carol and dave have 1 → overall
    // 2/4 = 50%. Staff is only the caller (2y) → 100%. SLs are bob (2y) +
    // carol/dave (1y) → 1/3 ≈ 33.3%.
    expect(trends.tenure2Plus.overall).toEqual([0, 50]);
    expect(trends.tenure2Plus.staff).toEqual([0, 100]);
    expect(trends.tenure2Plus.studentLeaders).toEqual([0, 33.3]);

    // Mean years so far: PREV all 1.0. YEAR overall (2+2+1+1)/4 = 1.5;
    // staff = 2; SLs (2+1+1)/3 ≈ 1.3.
    expect(trends.avgTenureYears.overall).toEqual([1, 1.5]);
    expect(trends.avgTenureYears.staff).toEqual([1, 2]);
    expect(trends.avgTenureYears.studentLeaders).toEqual([1, 1.3]);

    // Lifetime: 4 distinct people (caller, bob, carol, dave); 2 have ≥2 years.
    // Staff ever: just caller (2 years) → 100%. SLs ever: bob/carol/dave; only
    // bob has 2 years → 1/3 ≈ 33.3%. Avg years: overall (2+2+1+1)/4 = 1.5.
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
      // Alice leaves after PREV; Bob renames email between years but keeps importId.
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

    // PREV: alice (staff) + bob. YEAR: bob + caller.
    // Overall: alice left (1 of 2) → 50% turnover / 50% retention.
    // Staff: alice left → 100% turnover / 0% retention.
    // SLs: bob stayed → 0% turnover / 100% retention.
    expect(trends.turnover.overall).toEqual([null, 50]);
    expect(trends.turnover.staff).toEqual([null, 100]);
    expect(trends.turnover.studentLeaders).toEqual([null, 0]);
    expect(trends.retention.overall).toEqual([null, 50]);
    expect(trends.retention.staff).toEqual([null, 0]);
    expect(trends.retention.studentLeaders).toEqual([null, 100]);

    // Bob's two emails share importId, so lifetime SL tenure is 1 person with
    // 2 years (100%). Staff ever = alice (1y) + caller (1y) → 0% with ≥2y.
    // Overall people: alice, bob, caller — only bob has 2 years → 33.3%.
    expect(trends.lifetimeTenure2Plus.studentLeaders).toBe(100);
    expect(trends.lifetimeTenure2Plus.staff).toBe(0);
    expect(trends.lifetimeTenure2Plus.overall).toBe(33.3);
    // Avg years: overall (1+2+1)/3 ≈ 1.3; staff 1; SL 2.
    expect(trends.lifetimeAvgTenureYears.overall).toBe(1.3);
    expect(trends.lifetimeAvgTenureYears.staff).toBe(1);
    expect(trends.lifetimeAvgTenureYears.studentLeaders).toBe(2);
  });

  test("counts a leader with two campus roles once per campus, not twice", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "staffProfiles",
        profile(CALLER, YEAR, [{ role: "Staff", department: "Marketing" }])
      );
      // One person holding a leader role at two campuses in the same year.
      await ctx.db.insert(
        "staffProfiles",
        profile("multi@sow.org.au", YEAR, [
          { role: "Student Leader", university: "USYD" },
          { role: "Student Leader", university: "UNSW" },
        ])
      );
    });
    const trends = (await asUser(t, CALLER).query(api.generalMetrics.staffTrends, {}))!;

    // The leader is one distinct person (studentLeaders = 1) but appears under
    // each of their campuses.
    expect(trends.studentLeaders).toEqual([1]);
    expect(trends.studentLeadersByCampus).toEqual([
      { campus: "UNSW", counts: [1] },
      { campus: "USYD", counts: [1] },
    ]);
  });
});

describe("campusWeeklyAttendance", () => {
  // A weekly meeting: an event tagged "Weekly Meeting" for one campus sub-group,
  // with `count` sign-in rows. Returns the event id.
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

  // Dates that land in the 2025 and 2026 staff years (staff year rolls at Oct 1).
  const IN_2025 = Date.UTC(2025, 2, 4); // Mar 2025 → staff year 2025
  const IN_2026 = Date.UTC(2026, 2, 4); // Mar 2026 → staff year 2026

  test("averages attendance per campus per staff year, from 2025", async () => {
    const t = convexTest(schema, modules);
    // USYD: two 2025 meetings (10, 20 → avg 15) and one 2026 meeting (30).
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 10 });
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 20 });
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2026, count: 30 });
    // UNSW: one 2026 meeting only.
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
    // An untagged event with attendance must not affect the averages.
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
    expect(res.campuses).toEqual([{ campus: "USYD", averages: [12, 0] }]);
  });

  test("skips org-wide (SOW) weekly meetings — they belong to no campus", async () => {
    const t = convexTest(schema, modules);
    await weeklyMeeting(t, { campus: "USYD", dateStart: IN_2025, count: 9 });
    // A Weekly-Meeting-tagged SOW event has no campus sub-group, so it must not
    // create a campus bucket of its own.
    await weeklyMeeting(t, { campus: "SOW", dateStart: IN_2025, count: 40 });
    const res = await t.query(api.generalMetrics.campusWeeklyAttendance, {});
    expect(res.campuses).toEqual([{ campus: "USYD", averages: [9, 0] }]);
  });
});
