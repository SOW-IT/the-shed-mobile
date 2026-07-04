/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const PREV = YEAR - 1;
const NEXT = YEAR + 1;

const CALLER = "caller@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

type Assignment = { role: string; department?: string; university?: string };
const profile = (email: string, year: number, assignments: Assignment[]) => ({
  email,
  year,
  assignments,
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
        year: staffYearForDate(new Date(opts.dateStart)),
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
});
