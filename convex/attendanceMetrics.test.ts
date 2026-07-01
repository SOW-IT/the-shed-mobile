/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { STAFF_YEAR_RANGE } from "../shared/attendanceMetrics";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const STAFF = "staff@sow.org.au";
const USYD = "University of Sydney";
const DAY = 24 * 60 * 60 * 1000;

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await admin.mutation(api.admin.setStaffProfile, {
    email: LEADER,
    year: YEAR,
    roles: ["Student Leader"],
    university: USYD,
  });
  await admin.mutation(api.admin.setStaffProfile, {
    email: STAFF,
    year: YEAR,
    roles: ["Student Leader"],
    university: USYD,
  });
  const leader = asUser(t, LEADER);
  return { t, leader };
}

const window = (offsetDays = 0) => {
  const dateStart = Date.now() - offsetDays * DAY;
  return { dateStart, dateEnd: dateStart + 2 * 60 * 60 * 1000 };
};

describe("attendanceMetrics", () => {
  test("snapshot returns null when not signed in", async () => {
    const { t } = await setup();
    expect(
      await t.query(api.attendanceMetrics.snapshot, {
        subgroup: USYD,
        rangeWeeks: 4,
      })
    ).toBeNull();
  });

  test("snapshot is null before a recompute, populated after", async () => {
    const { leader } = await setup();
    const before = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(before).toBeNull();

    const e1 = await leader.mutation(api.events.create, {
      name: "Meeting 1",
      ...window(3),
      subgroups: [USYD],
    });
    const e2 = await leader.mutation(api.events.create, {
      name: "Meeting 2",
      ...window(1),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId: e1, email: LEADER });
    await leader.mutation(api.attendance.signIn, { eventId: e1, email: STAFF });
    await leader.mutation(api.attendance.signIn, { eventId: e2, email: LEADER });

    // Run the same bounded recompute the cron fans out (call directly rather
    // than via the scheduler so it completes within the test).
    await leader.mutation(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });

    const after = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(after).not.toBeNull();
    expect(after!.data.summary.eventsHeld).toBe(2);
    expect(after!.data.summary.uniqueAttendees).toBe(2);
    // avg of 2 attendees + 1 attendee across two events = 1.5
    expect(after!.data.summary.avgAttendance).toBe(1.5);
    expect(after!.data.attendanceByEvent).toHaveLength(2);
  });

  test("recompute writes every range + collaborative variant", async () => {
    const { leader } = await setup();
    const e = await leader.mutation(api.events.create, {
      name: "Meeting",
      ...window(2),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId: e, email: LEADER });
    await leader.mutation(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });

    for (const rangeWeeks of [4, 8, 12, STAFF_YEAR_RANGE]) {
      for (const includeCollaborative of [true, false]) {
        const snap = await leader.query(api.attendanceMetrics.snapshot, {
          subgroup: USYD,
          rangeWeeks,
          includeCollaborative,
        });
        expect(snap, `range ${rangeWeeks} collab ${includeCollaborative}`).not.toBeNull();
      }
    }
  });

  test("recomputeNow requires an attendance manager", async () => {
    const { t } = await setup();
    const outsider = asUser(t, "nobody@sow.org.au");
    await expect(
      outsider.mutation(api.attendanceMetrics.recomputeNow, { subgroup: USYD })
    ).rejects.toThrow();
  });

  test("recomputeNow (manager) schedules a refresh per-subgroup and for all", async () => {
    const { leader } = await setup();
    // With a sub-group: schedules that sub-group's recompute.
    await expect(
      leader.mutation(api.attendanceMetrics.recomputeNow, { subgroup: USYD })
    ).resolves.toBeNull();
    // Without a sub-group: fans out to every sub-group via recomputeAll.
    await expect(
      leader.mutation(api.attendanceMetrics.recomputeNow, {})
    ).resolves.toBeNull();
  });

  test("recomputeAll (cron entry) fans out without error", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(internal.attendanceMetrics.recomputeAll, {})
    ).resolves.toBeNull();
  });

  test("resolves attendance-only members and their Role breakdown", async () => {
    const { t, leader } = await setup();
    const memberId = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Pat Member" })
    );
    const e = await leader.mutation(api.events.create, {
      name: "Members welcome",
      ...window(2),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId: e, memberId });
    await leader.mutation(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const snap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(snap!.data.summary.uniqueAttendees).toBe(1);
    const role = snap!.data.breakdowns.find((b) => b.field === "Role");
    expect(role?.rows.some((r) => r.label === "Member")).toBe(true);
  });

  test("resolves a staff sign-in that has no profile for the year", async () => {
    const { leader } = await setup();
    const e = await leader.mutation(api.events.create, {
      name: "Guest visit",
      ...window(2),
      subgroups: [USYD],
    });
    // An email with no staffProfile this year — matchProfile finds nothing and
    // the person is resolved from their email alone.
    await leader.mutation(api.attendance.signIn, {
      eventId: e,
      email: "ghost@sow.org.au",
    });
    await leader.mutation(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const snap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(snap!.data.summary.uniqueAttendees).toBe(1);
  });

  test("detects Weekly Meeting tagged events", async () => {
    const { t, leader } = await setup();
    const tagId = await t.run((ctx) =>
      ctx.db.insert("attendanceTags", { year: YEAR, name: "Weekly Meeting" })
    );
    const e = await leader.mutation(api.events.create, {
      name: "Weekly Meeting",
      ...window(2),
      subgroups: [USYD],
      tagIds: [tagId],
    });
    await leader.mutation(api.attendance.signIn, { eventId: e, email: LEADER });
    await leader.mutation(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const snap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(snap!.data.weeklyTrend).toHaveLength(1);
    expect(snap!.data.summary.weeklyConsistency).not.toBeNull();
  });

  test("re-running recompute patches the existing snapshot in place", async () => {
    const { t, leader } = await setup();
    const e = await leader.mutation(api.events.create, {
      name: "Once",
      ...window(2),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId: e, email: LEADER });
    await leader.mutation(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    await leader.mutation(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const rows = await t.run((ctx) =>
      ctx.db
        .query("attendanceMetricsSnapshots")
        .withIndex("by_subgroup_and_range", (q) =>
          q
            .eq("subgroup", USYD)
            .eq("rangeWeeks", 4)
            .eq("includeCollaborative", true)
        )
        .collect()
    );
    expect(rows).toHaveLength(1); // patched, never duplicated
  });

  test("snapshot ignores a stale previous-staff-year row", async () => {
    const { t, leader } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("attendanceMetricsSnapshots", {
        subgroup: USYD,
        rangeWeeks: 4,
        includeCollaborative: true,
        staffYear: YEAR - 1,
        computedAt: Date.now(),
        data: EMPTY_DATA,
      })
    );
    const snap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(snap).toBeNull();
  });
});

/** A minimal, validator-shaped snapshot payload for the stale-year test. */
const EMPTY_DATA = {
  summary: {
    avgAttendance: 0,
    avgAttendancePrev: null,
    changePct: null,
    eventsHeld: 0,
    uniqueAttendees: 0,
    newcomers: 0,
    followUpCount: 0,
    weeklyConsistency: null,
  },
  attendanceByEvent: [],
  rollingAverage: [],
  weeklyTrend: [],
  uniqueByMonth: [],
  newVsReturning: [],
  followUps: [],
  breakdowns: [],
  hasEnoughHistory: false,
};
