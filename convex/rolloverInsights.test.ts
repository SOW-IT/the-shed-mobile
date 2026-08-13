/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RANGE_WEEKS } from "../shared/attendanceMetrics";
import { staffYearStartMs } from "../shared/flow";
import { SOW_SUBGROUP } from "../shared/rollcall";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * What the October staff-year rollover does to the Insights tabs.
 *
 * The boundary is real, not notional: staff year 2027 begins at Sydney midnight
 * Oct 1 2026 (= Sep 30 14:00 UTC, `staffYearStartMs(2027)`), which is the
 * instant `currentStaffYear()` flips for every query, cron and recompute. These
 * tests hold data still and move only the clock across that instant.
 */
const modules = import.meta.glob("./**/*.ts");

const ROLLOVER = staffYearStartMs(2027);
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au"; // provisioned for 2026 AND 2027
const LAPSED = "lapsed.staffer@sow.org.au"; // 2026 only — no 2027 assignment yet
const USYD = "University of Sydney";
const UNSW = "University of New South Wales";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

/** An identity-scoped test client (what `withIdentity` hands back). */
type AsUser = ReturnType<typeof asUser>;

const at = (ms: number) => vi.setSystemTime(new Date(ms));

/** The sub-groups a mutation just fanned recomputes out to, in order. */
const scheduledSubgroups = async (t: TestConvex<typeof schema>) =>
  await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs
      .filter((j) => j.name === "attendanceMetrics:recomputeSubgroup")
      .map((j) => (j.args[0] as { subgroup: string }).subgroup);
  });

const snap = (u: AsUser, subgroup = USYD, rangeWeeks = 4) =>
  u.query(api.attendanceMetrics.snapshot, { subgroup, rangeWeeks });

const roleRows = (data: { breakdowns: { field: string; rows: unknown[] }[] }) =>
  data.breakdowns.find((b) => b.field === "Role")?.rows;

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Sit two weeks before the rollover with the deployment in its real shape:
 * 2026 fully provisioned, 2027 provisioned except for one person who hasn't
 * been re-assigned, two September events inside the trailing metrics windows,
 * and snapshots freshly computed with every dirty flag drained (the steady
 * state the 15-minute cron leaves behind).
 */
async function setupBeforeRollover() {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(ROLLOVER - 14 * DAY);

  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN }); // seeds year 2026
  const admin = asUser(t, ADMIN);

  for (const year of [2026, 2027]) {
    await admin.mutation(api.admin.upsertUniversity, { year, name: USYD });
    await admin.mutation(api.admin.upsertUniversity, { year, name: UNSW });
    await admin.mutation(api.admin.setStaffProfile, {
      email: LEADER,
      year,
      roles: ["Student Leader"],
      university: USYD,
    });
  }
  // The leaver: staff in 2026, no 2027 row (11 real people are in this state).
  await admin.mutation(api.admin.setStaffProfile, {
    email: LAPSED,
    year: 2026,
    roles: ["Staff"],
    department: "Finance",
  });

  const leader = asUser(t, LEADER);
  const event = async (daysBefore: number, name: string, subgroup = USYD) =>
    await leader.mutation(api.events.create, {
      name,
      dateStart: ROLLOVER - daysBefore * DAY,
      dateEnd: ROLLOVER - daysBefore * DAY + 2 * HOUR,
      subgroups: [subgroup],
    });

  for (const eventId of [
    await event(13, "September week 1"),
    await event(10, "September week 2"),
  ]) {
    await leader.mutation(api.attendance.signIn, { eventId, email: LEADER });
    await leader.mutation(api.attendance.signIn, { eventId, email: LAPSED });
  }
  await leader.mutation(api.attendance.signIn, {
    eventId: await event(9, "UNSW September", UNSW),
    email: LEADER,
  });

  // The crons' steady state an hour before midnight: every sub-group computed,
  // every dirty flag cleared by its own successful recompute.
  at(ROLLOVER - HOUR);
  for (const subgroup of [USYD, UNSW, SOW_SUBGROUP]) {
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, { subgroup });
  }
  return { t, admin, leader };
}

describe("October rollover → Attendance Insights", () => {
  test("every precomputed snapshot goes 'not ready' the instant the year flips", async () => {
    const { leader } = await setupBeforeRollover();

    const before = await snap(leader);
    expect(before).not.toBeNull();
    expect(before!.staffYear).toBe(2026);
    expect(before!.data.summary.eventsHeld).toBe(2);

    // One minute past Sydney midnight Oct 1 — the same instant the staff-year
    // rollover cron fires. No data changed; only the clock.
    at(ROLLOVER + 60_000);
    for (const subgroup of [USYD, UNSW, SOW_SUBGROUP]) {
      for (const rangeWeeks of RANGE_WEEKS) {
        for (const includeCollaborative of [true, false]) {
          expect(
            await leader.query(api.attendanceMetrics.snapshot, {
              subgroup,
              rangeWeeks,
              includeCollaborative,
            }),
            `${subgroup} range ${rangeWeeks} collab ${includeCollaborative}`
          ).toBeNull();
        }
      }
    }
    // The org-wide campus comparison drops out with them.
    expect(
      await leader.query(api.attendanceMetrics.campusWeeklyAverages, {
        rangeWeeks: 4,
      })
    ).toEqual([]);
  });

  test("the 15-minute dirty cron rebuilds every current-year campus, including a new one", async () => {
    const { t, admin, leader } = await setupBeforeRollover();
    at(ROLLOVER + 60_000);

    // Steady state: successful recomputes cleared every flag. The year flip
    // itself does not mark anything dirty.
    await t.run(async (ctx) => {
      expect(await ctx.db.query("attendanceMetricsDirty").collect()).toEqual([]);
    });

    // A campus that exists only from 2027 (the real 2027 row adds Western Sydney).
    const newCampus = "Western Sydney University";
    await admin.mutation(api.admin.upsertUniversity, { year: 2027, name: newCampus });

    await t.mutation(internal.attendanceMetrics.recomputeDirty, {});
    expect([...(await scheduledSubgroups(t))].sort()).toEqual(
      [SOW_SUBGROUP, USYD, UNSW, newCampus].sort()
    );

    for (const subgroup of await scheduledSubgroups(t)) {
      await leader.action(internal.attendanceMetrics.recomputeSubgroup, { subgroup });
    }
    const after = await snap(leader);
    expect(after!.staffYear).toBe(2027);
    expect(after!.data.summary.eventsHeld).toBe(2); // September still in the 4-week window
    // The new campus gets a real (empty) snapshot, not a "not ready" hole.
    const fresh = await snap(leader, newCampus);
    expect(fresh!.staffYear).toBe(2027);
    expect(fresh!.data.hasEnoughHistory).toBe(false);
  });

  test("the rollover cron itself kicks a full Insights recompute", async () => {
    const { t } = await setupBeforeRollover();
    at(ROLLOVER + 60_000);

    await t.mutation(internal.admin.rollOverStaffYear, {});
    const jobs = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    expect(
      jobs.some((j) => j.name === "attendanceMetrics:recomputeAll")
    ).toBe(true);
  });

  test("September's numbers keep 2026 identities after the flip", async () => {
    const { leader } = await setupBeforeRollover();

    const before = await snap(leader);
    expect(roleRows(before!.data)).toEqual(
      expect.arrayContaining([
        { label: "Staff", value: 1 },
        { label: "Student Leader", value: 1 },
      ])
    );

    at(ROLLOVER + 60_000);
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const after = await snap(leader);

    // Same two September events, same attendance rows, same trailing window.
    expect(after!.data.summary.eventsHeld).toBe(2);
    expect(after!.data.summary.uniqueAttendees).toBe(2);
    // People are classified against the event's staff year (2026), so the
    // leaver stays Staff — they are not rewritten as Member just because
    // they have no 2027 profile yet.
    expect(roleRows(after!.data)).toEqual(
      expect.arrayContaining([
        { label: "Staff", value: 1 },
        { label: "Student Leader", value: 1 },
      ])
    );
    expect(roleRows(after!.data)).not.toContainEqual({ label: "Member", value: 1 });
  });
});

describe("October rollover → General Insights", () => {
  test("campus weekly averages omit the empty new year instead of plotting zero", async () => {
    const { t, leader } = await setupBeforeRollover();
    // Tag September's events as Weekly Meetings so they feed the General chart.
    await t.run(async (ctx) => {
      const tag = await ctx.db
        .query("attendanceTags")
        .filter((q) => q.eq(q.field("name"), "Weekly Meeting"))
        .first();
      const tagId =
        tag?._id ?? (await ctx.db.insert("attendanceTags", { name: "Weekly Meeting" }));
      for (const e of await ctx.db.query("events").collect()) {
        await ctx.db.patch(e._id, { tagIds: [tagId] });
      }
    });

    const before = await leader.query(api.generalMetrics.campusWeeklyAttendance, {});
    expect(before.years.at(-1)).toBe(2026);
    expect(before.campuses[0].averages.at(-1)).toBeGreaterThan(0);

    at(ROLLOVER + 60_000);
    const after = await leader.query(api.generalMetrics.campusWeeklyAttendance, {});
    // No meetings in 2027 yet — don't add a floor of zeros that makes every
    // campus look like it collapsed overnight.
    expect(after.years.at(-1)).toBe(2026);
    expect(after.years).not.toContain(2027);
    for (const campus of after.campuses) {
      expect(campus.averages).toHaveLength(after.years.length);
      expect(campus.averages.at(-1)).toBeGreaterThan(0);
    }
  });

  test("staff trends pick up the new current year the instant the clock flips", async () => {
    const { leader } = await setupBeforeRollover();

    const before = await leader.query(api.generalMetrics.staffTrends, {});
    expect(before!.years).not.toContain(2027);
    expect(before!.years.at(-1)).toBe(2026);

    at(ROLLOVER + 60_000);
    const after = await leader.query(api.generalMetrics.staffTrends, {});
    // Upcoming-year hide no longer applies: 2027 is current, so the last-5y
    // window can slide forward. Partial 2027 assignments still show — the
    // live roster, not last year's freeze.
    expect(after!.years.at(-1)).toBe(2027);
    expect(after!.years).toContain(2026);
    expect(after!.staff.at(-1)!).toBeLessThan(before!.staff.at(-1)!);
  });
});
