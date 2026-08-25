/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
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
  afterEach(() => vi.useRealTimers());

  test("recomputeDirty in the prefill window schedules current and incoming years", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T11:00:00Z"));
    const { t } = await setup();
    await t.mutation(internal.attendanceMetrics.recomputeDirty, {});
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    const years = jobs
      .filter((j) => j.name === "attendanceMetrics:recomputeSubgroup")
      .map((j) => (j.args[0] as { staffYear?: number }).staffYear);
    expect(years).toContain(2026);
    expect(years).toContain(2027);
  });

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

    for (const rangeWeeks of [1, 4, 52]) {
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

  test("liveSnapshot returns null when not signed in", async () => {
    const { t } = await setup();
    const end = Date.now();
    const start = end - 14 * DAY;
    expect(
      await t.action(api.attendanceMetrics.liveSnapshot, {
        subgroup: USYD,
        rangeStartMs: start,
        rangeEndMs: end,
        includeCollaborative: true,
      })
    ).toBeNull();
  });

  test("liveSnapshot computes a custom range on demand", async () => {
    const { leader } = await setup();
    const e1 = await leader.mutation(api.events.create, {
      name: "Custom A",
      ...window(10),
      subgroups: [USYD],
    });
    const e2 = await leader.mutation(api.events.create, {
      name: "Custom B",
      ...window(2),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId: e1, email: LEADER });
    await leader.mutation(api.attendance.signIn, { eventId: e2, email: LEADER });
    await leader.mutation(api.attendance.signIn, { eventId: e2, email: STAFF });

    const end = Date.now();
    const start = end - 5 * DAY;
    const live = await leader.action(api.attendanceMetrics.liveSnapshot, {
      subgroup: USYD,
      rangeStartMs: start,
      rangeEndMs: end,
      includeCollaborative: true,
    });
    expect(live).not.toBeNull();
    expect(live!.data.summary.eventsHeld).toBe(1);
    expect(live!.data.summary.uniqueAttendees).toBe(2);
    expect(live!.computedAt).toBeGreaterThan(0);
  });

  test("liveSnapshot rejects inverted or over-long ranges", async () => {
    const { leader } = await setup();
    const end = Date.now();
    await expect(
      leader.action(api.attendanceMetrics.liveSnapshot, {
        subgroup: USYD,
        rangeStartMs: end,
        rangeEndMs: end - DAY,
        includeCollaborative: true,
      })
    ).rejects.toThrow(/start before the end/i);
    await expect(
      leader.action(api.attendanceMetrics.liveSnapshot, {
        subgroup: USYD,
        rangeStartMs: end - 3 * 365 * DAY,
        rangeEndMs: end,
        includeCollaborative: true,
      })
    ).rejects.toThrow(/two years/i);
  });

  test("liveSnapshot still finds range events when many later events exist", async () => {
    const { t, leader } = await setup();
    const rangeEnd = Date.now() - 30 * DAY;
    const rangeStart = rangeEnd - 14 * DAY;
    const inRangeAt = rangeStart + 3 * DAY;

    const inRangeId = await t.run(async (ctx) =>
      ctx.db.insert("events", {
        name: "In-range meeting",
        dateStart: inRangeAt,
        dateEnd: inRangeAt + 2 * 60 * 60 * 1000,
        subgroups: [USYD],
      })
    );
    await leader.mutation(api.attendance.signIn, {
      eventId: inRangeId,
      email: LEADER,
    });

    await t.run(async (ctx) => {
      for (let i = 0; i < 4001; i++) {
        const at = rangeEnd + (i + 1) * 60_000;
        await ctx.db.insert("events", {
          name: `Later ${i}`,
          dateStart: at,
          dateEnd: at + 60_000,
          subgroups: [USYD],
        });
      }
    });

    const live = await leader.action(api.attendanceMetrics.liveSnapshot, {
      subgroup: USYD,
      rangeStartMs: rangeStart,
      rangeEndMs: rangeEnd,
      includeCollaborative: true,
    });
    expect(live).not.toBeNull();
    expect(live!.data.summary.eventsHeld).toBe(1);
    expect(live!.data.summary.uniqueAttendees).toBe(1);
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
    await expect(
      leader.mutation(api.attendanceMetrics.recomputeNow, { subgroup: USYD })
    ).resolves.toBeNull();
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
    expect(new Set(dirty.map((r) => r.subgroup))).toEqual(
      new Set([SOW_SUBGROUP, USYD])
    );

    await t.mutation(internal.attendanceMetrics.recomputeDirty, {});
    expect(
      await t.run((ctx) => ctx.db.query("attendanceMetricsDirty").collect())
    ).toHaveLength(2);
    for (const subgroup of [SOW_SUBGROUP, USYD]) {
      await t.action(internal.attendanceMetrics.recomputeSubgroup, { subgroup });
    }
    expect(
      await t.run((ctx) => ctx.db.query("attendanceMetricsDirty").collect())
    ).toHaveLength(0);

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
    const roleField = fields.find((f) => f.key === "Role")!;
    const slOptionId = Object.entries(roleField.values ?? {}).find(
      ([, label]) => label === "Student Leader"
    )![0];
    const taggedLeaderId = await leader.mutation(api.attendanceMembers.create, {
      name: "Tagged Leader",
      metadata: { [roleField._id]: slOptionId },
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
    await leader.mutation(api.attendance.signIn, { eventId: e, memberId: taggedLeaderId });
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });

    const snap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(snap!.data.leadersVsOthers).toEqual([
      expect.objectContaining({ primary: 3, rest: 2 }),
    ]);
    expect(snap!.data.summary.leaderShare).toBe(0.6);
    expect(snap!.data.campusMix).toEqual([
      expect.objectContaining({ primary: 2, rest: 1 }),
    ]);
    expect(snap!.data.summary.homeCampusShare).toBe(0.667);

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
    const role = snap!.data.breakdowns.find((b) => b.field === "Role");
    expect(role?.rows.some((r) => r.label === "Member")).toBe(true);
  });

  test("treats a staff profile with no assignment this year as a Member", async () => {
    const { t, leader } = await setup();
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
    expect(role?.rows.map((r) => r.label)).toEqual(["Member"]);
  });

  test("recomputeNow is throttled to once per week per sub-group", async () => {
    const { t, leader } = await setup();
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
      ctx.db.insert("attendanceTags", { name: "Weekly Meeting" })
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
    expect(rows).toHaveLength(1);
  });

  test("snapshot keeps a previous-year row while reading the current year", async () => {
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
    const snap = await leader.query(api.attendanceMetrics.snapshot, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(snap?.staffYear).toBe(YEAR);
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
    expect(rows).toHaveLength(2);
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
    expect(
      await leader.query(api.attendanceMetrics.snapshot, {
        subgroup: USYD,
        rangeWeeks: 4,
      })
    ).not.toBeNull();
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

describe("recomputeDirty snapshot completeness", () => {
  test("rebuilds a group that has some current-year rows but is missing a range variant", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      for (const rangeWeeks of [1, 4, 52]) {
        for (const includeCollaborative of [true, false]) {
          if (rangeWeeks === 52 && includeCollaborative === false) continue;
          await ctx.db.insert("attendanceMetricsSnapshots", {
            subgroup: USYD,
            rangeWeeks,
            includeCollaborative,
            staffYear: YEAR,
            computedAt: Date.now(),
            data: EMPTY_DATA,
          });
        }
      }
    });

    await t.mutation(internal.attendanceMetrics.recomputeDirty, {});
    const scheduled = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      return jobs
        .filter((j) => j.name === "attendanceMetrics:recomputeSubgroup")
        .map((j) => (j.args[0] as { subgroup: string }).subgroup);
    });
    expect(scheduled).toContain(USYD);
  });
});

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
    const { t, leader } = await setup();
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
      await mk(USYD, 5, { computedAt: 1000 });
      await mk(USYD, 12, { computedAt: 2000 });
      await mk(UNSW, 20);
      await mk("Macquarie", null);
      await mk("Stale Uni", 99, { staffYear: YEAR - 1 });
    });

    expect(
      await leader.query(api.attendanceMetrics.campusWeeklyAverages, { rangeWeeks: 8 })
    ).toEqual([
      { campus: UNSW, avgWeekly: 20 },
      { campus: USYD, avgWeekly: 12 },
    ]);
  });
});
