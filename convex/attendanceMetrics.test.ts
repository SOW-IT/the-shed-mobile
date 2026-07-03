/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { SOW_SUBGROUP } from "../shared/rollcall";
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
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
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
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });

    for (const rangeWeeks of [1, 2, 4, 8, 12]) {
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

  test("flags sub-groups dirty on attendance/event changes; recomputeDirty drains", async () => {
    const { t, leader } = await setup();
    const e = await leader.mutation(api.events.create, {
      name: "Meet",
      ...window(2),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId: e, email: LEADER });
    // A second change to the same sub-groups is de-duped (no extra rows).
    await leader.mutation(api.attendance.signIn, { eventId: e, email: STAFF });
    await leader.mutation(api.events.update, {
      eventId: e,
      name: "Meet+",
      ...window(2),
      subgroups: [USYD],
    });
    const dirty = await t.run((ctx) =>
      ctx.db.query("attendanceMetricsDirty").collect()
    );
    // The event's sub-group plus the org-wide SOW aggregate, de-duped.
    expect(new Set(dirty.map((r) => r.subgroup))).toEqual(
      new Set([SOW_SUBGROUP, USYD])
    );

    // Draining schedules a recompute per dirty sub-group but LEAVES the flags in
    // place — each recompute clears its own only after it succeeds (see
    // clearDirty), so a failed recompute keeps its retry signal.
    await t.mutation(internal.attendanceMetrics.recomputeDirty, {});
    expect(
      await t.run((ctx) => ctx.db.query("attendanceMetricsDirty").collect())
    ).toHaveLength(2);
    // Running the scheduled recomputes acks (clears) their flags.
    for (const subgroup of [SOW_SUBGROUP, USYD]) {
      await t.action(internal.attendanceMetrics.recomputeSubgroup, { subgroup });
    }
    expect(
      await t.run((ctx) => ctx.db.query("attendanceMetricsDirty").collect())
    ).toHaveLength(0);

    // A later change re-flags them.
    await leader.mutation(api.events.remove, { eventId: e });
    expect(
      (await t.run((ctx) => ctx.db.query("attendanceMetricsDirty").collect()))
        .length
    ).toBeGreaterThan(0);
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
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
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

  test("composition charts: leaders vs others and this campus vs visitors", async () => {
    const { t, leader } = await setup();
    const admin = asUser(t, ADMIN);
    // A visiting student leader from another campus, and an org-side Director
    // with no home campus at all.
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "UNSW" });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "visitor@sow.org.au",
      year: YEAR,
      roles: ["Student Leader"],
      university: "UNSW",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "director@sow.org.au",
      year: YEAR,
      roles: ["Director"],
    });
    // An attendance-only member whose home campus comes from Campus metadata.
    await leader.mutation(api.attendanceMetadata.ensureDefaults, {});
    const fields = await leader.query(api.attendanceMetadata.list, {});
    const campusField = fields.find((f) => f.key === "Campus")!;
    const usydOptionId = Object.entries(campusField.values ?? {}).find(
      ([, label]) => label === USYD
    )![0];
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Local Member",
      metadata: { [campusField._id]: usydOptionId },
    });

    const e = await leader.mutation(api.events.create, {
      name: "Campus night",
      ...window(2),
      subgroups: [USYD],
    });
    for (const email of [LEADER, "visitor@sow.org.au", "director@sow.org.au"]) {
      await leader.mutation(api.attendance.signIn, { eventId: e, email });
    }
    await leader.mutation(api.attendance.signIn, { eventId: e, memberId });
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });

    const snap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    // Leaders: LEADER + the visiting UNSW leader; others: director + member.
    expect(snap!.data.leadersVsOthers).toEqual([
      expect.objectContaining({ primary: 2, rest: 2 }),
    ]);
    expect(snap!.data.summary.leaderShare).toBe(0.5);
    // Campus: LEADER + member are USYD, visitor is UNSW; the campus-less
    // director is excluded rather than guessed onto either side.
    expect(snap!.data.campusMix).toEqual([
      expect.objectContaining({ primary: 2, rest: 1 }),
    ]);
    expect(snap!.data.summary.homeCampusShare).toBe(0.667);

    // The org-wide view never gets a campus mix.
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: SOW_SUBGROUP,
    });
    const orgSnap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: SOW_SUBGROUP,
      rangeWeeks: 4,
    });
    expect(orgSnap!.data.campusMix).toBeUndefined();
    expect(orgSnap!.data.leadersVsOthers).toBeDefined();
  });

  test("resolves a staff sign-in that has no profile for the year", async () => {
    const { leader } = await setup();
    const e = await leader.mutation(api.events.create, {
      name: "Guest visit",
      ...window(2),
      subgroups: [USYD],
    });
    // An email with no staffProfile this year — matchProfile finds nothing, so
    // the person is treated as a Member (no current-year role), resolved from
    // their email alone.
    await leader.mutation(api.attendance.signIn, {
      eventId: e,
      email: "ghost@sow.org.au",
    });
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const snap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(snap!.data.summary.uniqueAttendees).toBe(1);
    // No current-year role ⇒ listed under the Member role breakdown.
    const role = snap!.data.breakdowns.find((b) => b.field === "Role");
    expect(role?.rows.some((r) => r.label === "Member")).toBe(true);
  });

  test("treats a staff profile with no assignment this year as a Member", async () => {
    const { t, leader } = await setup();
    // A profile that exists for the year but carries no assignment (e.g. someone
    // who was staff previously and has no role this staff year).
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "former@sow.org.au",
        year: YEAR,
        name: "Former Staff",
        assignments: [],
      })
    );
    const e = await leader.mutation(api.events.create, {
      name: "Gathering",
      ...window(2),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, {
      eventId: e,
      email: "former@sow.org.au",
    });
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const snap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    const role = snap!.data.breakdowns.find((b) => b.field === "Role");
    // Classified as Member, not under any staff role.
    expect(role?.rows.map((r) => r.label)).toEqual(["Member"]);
  });

  test("recomputeNow is throttled to once per week per sub-group", async () => {
    const { t, leader } = await setup();
    // A fresh current-year snapshot blocks a manual refresh for a week.
    await t.run((ctx) =>
      ctx.db.insert("attendanceMetricsSnapshots", {
        subgroup: USYD,
        rangeWeeks: 4,
        includeCollaborative: true,
        staffYear: YEAR,
        computedAt: Date.now(),
        data: EMPTY_DATA,
      })
    );
    await expect(
      leader.mutation(api.attendanceMetrics.recomputeNow, { subgroup: USYD })
    ).rejects.toThrow(/refresh/i);
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
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
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
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
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

  test("recompute heals duplicate snapshot rows and reads the newest", async () => {
    const { t, leader } = await setup();
    // Two rows for the same (subgroup, range, collaborative) — the state a race
    // between the weekly cron, the dirty cron and a manual refresh could leave.
    for (const computedAt of [Date.now() - 1000, Date.now()]) {
      await t.run((ctx) =>
        ctx.db.insert("attendanceMetricsSnapshots", {
          subgroup: USYD,
          rangeWeeks: 4,
          includeCollaborative: true,
          staffYear: YEAR,
          computedAt,
          data: EMPTY_DATA,
        })
      );
    }
    // The query tolerates the duplicate (never `.unique()`), returning one row.
    expect(
      await leader.query(api.attendanceMetrics.snapshot, {
        subgroup: USYD,
        rangeWeeks: 4,
      })
    ).not.toBeNull();
    // A recompute patches one and deletes the extra, leaving a single row.
    await t.action(internal.attendanceMetrics.recomputeSubgroup, {
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
    expect(rows).toHaveLength(1);
  });
});

/** A minimal, validator-shaped snapshot payload for the stale-year test. */
const EMPTY_DATA = {
  summary: {
    avgAttendance: 0,
    avgAttendancePrev: null,
    changePct: null,
    avgWeeklyAttendance: null,
    avgWeeklyAttendancePrev: null,
    weeklyChangePct: null,
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
  hasWeeklyMeetings: false,
};

describe("campusWeeklyAverages", () => {
  const snap = (avgWeekly: number | null) => ({
    ...EMPTY_DATA,
    summary: { ...EMPTY_DATA.summary, avgWeeklyAttendance: avgWeekly },
  });

  test("returns null when not signed in", async () => {
    const { t } = await setup();
    expect(
      await t.query(api.attendanceMetrics.campusWeeklyAverages, { rangeWeeks: 8 })
    ).toBeNull();
  });

  test("returns each campus's newest current-year weekly avg, sorted desc; omits missing/stale/null", async () => {
    const { t, leader } = await setup(); // setup() already creates the USYD campus
    const admin = asUser(t, ADMIN);
    const UNSW = "UNSW";
    for (const name of [UNSW, "Macquarie", "NoSnap Uni", "Stale Uni"]) {
      await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name });
    }
    await t.run(async (ctx) => {
      const mk = (
        subgroup: string,
        avgWeekly: number | null,
        opts?: { staffYear?: number; computedAt?: number }
      ) =>
        ctx.db.insert("attendanceMetricsSnapshots", {
          subgroup,
          rangeWeeks: 8,
          includeCollaborative: true,
          staffYear: opts?.staffYear ?? YEAR,
          computedAt: opts?.computedAt ?? Date.now(),
          data: snap(avgWeekly),
        });
      // USYD keeps an older and a newer row — the newest (12) should win.
      await mk(USYD, 5, { computedAt: 1000 });
      await mk(USYD, 12, { computedAt: 2000 });
      await mk(UNSW, 20);
      await mk("Macquarie", null); // no weekly meetings in range → omitted
      await mk("Stale Uni", 99, { staffYear: YEAR - 1 }); // prior year → omitted
      // "NoSnap Uni" has no snapshot at all → omitted
    });

    expect(
      await leader.query(api.attendanceMetrics.campusWeeklyAverages, { rangeWeeks: 8 })
    ).toEqual([
      { campus: UNSW, avgWeekly: 20 },
      { campus: USYD, avgWeekly: 12 },
    ]);
  });
});
