/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs, sydneyCalendarYear } from "../shared/flow";
import { SOW_SUBGROUP } from "../shared/rollcall";
import { api, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
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

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const STAFF = "staff@sow.org.au";
const USYD = "University of Sydney";
const DAY = 24 * 60 * 60 * 1000;

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const snapshotOf = (
  t: TestConvex<typeof schema>,
  subgroup: string,
  rangeWeeks: number,
  includeCollaborative = true
) =>
  t.run((ctx) =>
    ctx.db
      .query("attendanceMetricsSnapshots")
      .withIndex("by_subgroup_range_year", (q) =>
        q
          .eq("subgroup", subgroup)
          .eq("rangeWeeks", rangeWeeks)
          .eq("includeCollaborative", includeCollaborative)
          .eq("staffYear", YEAR)
      )
      .unique()
  );

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

// A campus's weeklies index row, as weeklyInsights.rebuild writes it.
const weeklyIndex = (
  ctx: MutationCtx,
  subgroup: string,
  weeklies: { at: number; count: number; joint: boolean }[]
) =>
  ctx.db.insert("weeklyInsightIndex", {
    subgroup,
    computedAt: Date.now(),
    periods: [],
    currentKey: null,
    weeklies,
    settingsVersion: 0,
    viewVersion: 1,
    auditSeen: 0,
    eventsSeen: 0,
    nextCompareAt: Number.MAX_SAFE_INTEGER,
  });

const window = (offsetDays = 0) => {
  const dateStart = Date.now() - offsetDays * DAY;
  return { dateStart, dateEnd: dateStart + 2 * 60 * 60 * 1000 };
};

describe("attendanceMetrics", () => {
  afterEach(() => vi.useRealTimers());

  test("daily rebuild in the prefill window schedules SOW for current and incoming years", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T11:00:00Z"));
    const { t } = await setup();
    const admin = asUser(t, ADMIN);
    for (const year of [2026, 2027]) {
      await admin.mutation(api.admin.upsertUniversity, { year, name: USYD });
    }
    await t.mutation(internal.attendanceMetrics.recomputeAll, {});
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    const scheduled = jobs
      .filter((j) => j.name === "attendanceMetrics:recomputeSubgroup")
      .map((j) => j.args[0] as { subgroup: string; staffYear?: number });
    for (const year of [2026, 2027]) {
      expect(scheduled).toContainEqual({ subgroup: SOW_SUBGROUP, staffYear: year });
    }
    // Campuses are built from their weeklies by weeklyInsights.rebuildAll.
    expect(scheduled.some((j) => j.subgroup === USYD)).toBe(true);
  });

  test("a snapshot is missing before a recompute, populated after", async () => {
    const { t, leader } = await setup();
    expect(await snapshotOf(t, USYD, 4)).toBeNull();

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

    const after = await snapshotOf(t, USYD, 4);
    expect(after).not.toBeNull();
    expect(after!.data.summary.eventsHeld).toBe(2);
    expect(after!.data.summary.uniqueAttendees).toBe(2);
    expect(after!.data.summary.avgAttendance).toBe(1.5);
    expect(after!.data.attendanceByEvent).toHaveLength(2);
  });

  test("recompute writes every range + collaborative variant", async () => {
    const { t, leader } = await setup();
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
        const snap = await snapshotOf(t, USYD, rangeWeeks, includeCollaborative);
        expect(snap, `range ${rangeWeeks} collab ${includeCollaborative}`).not.toBeNull();
      }
    }
  });

  test("gathering a range still finds its events when many later events exist", async () => {
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

    const gathered = await t.query(internal.attendanceMetrics.gatherEvents, {
      subgroup: USYD,
      loadStart: rangeStart,
      loadEnd: rangeEnd,
    });
    expect(gathered.eventIds).toEqual([inRangeId]);
    expect(gathered.metricsEvents).toEqual([
      expect.objectContaining({ id: inRangeId, isWeeklyMeeting: false, collaborative: false }),
    ]);
    const attendance = await t.query(internal.attendanceMetrics.gatherAttendanceChunk, {
      eventIds: gathered.eventIds,
    });
    expect(attendance).toHaveLength(1);
  });

  test("recomputeAll (daily cron entry) rebuilds SOW and every campus, for older apps", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(internal.attendanceMetrics.recomputeAll, {})
    ).resolves.toBeNull();
    const jobs = await t.run(async (ctx) => {
      const all = await ctx.db.system.query("_scheduled_functions").collect();
      return all
        .filter((j) => j.name === "attendanceMetrics:recomputeSubgroup")
        .map((j) => j.args[0] as { subgroup: string; ranges?: number[] });
    });
    const subgroups = new Set(jobs.map((j) => j.subgroup));
    expect(subgroups.has(SOW_SUBGROUP)).toBe(true);
    expect(subgroups.has(USYD)).toBe(true);
    expect(jobs.every((j) => j.ranges === undefined)).toBe(true);
  });

  test("recomputeAll also rebuilds the General tab's campus chart once", async () => {
    const { t } = await setup();
    await t.mutation(internal.attendanceMetrics.recomputeAll, {});
    const names = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map((j) => j.name)
    );
    expect(
      names.filter((n) => n === "generalMetrics:recomputeCampusWeeklyAttendance")
    ).toHaveLength(1);
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
    const snap = await snapshotOf(t, USYD, 4);
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

    const snap = await snapshotOf(t, USYD, 4);
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
    const orgSnap = await snapshotOf(t, SOW_SUBGROUP, 4);
    expect(orgSnap!.data.campusMix).toBeUndefined();
    expect(orgSnap!.data.leadersVsOthers).toBeDefined();
  });

  test("a member whose only staff profile is outside the window is a Member", async () => {
    const { t, leader } = await setup();
    const e = await leader.mutation(api.events.create, {
      name: "Guest visit",
      ...window(2),
      subgroups: [USYD],
    });
    const ghost = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("attendanceMembers", { name: "Ghost Member" });
      await ctx.db.insert("staffProfiles", {
        email: "ghost@sow.org.au",
        year: YEAR + 1,
        name: "Ghost",
        memberId,
        assignments: [{ role: "Student Leader", university: USYD }],
      });
      await ctx.db.insert("attendance", { eventId: e, signInTime: Date.now() });
      return memberId;
    });
    await leader.mutation(api.attendance.signIn, { eventId: e, memberId: ghost });
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const snap = await snapshotOf(t, USYD, 4);
    expect(snap!.data.summary.uniqueAttendees).toBe(1);
    const role = snap!.data.breakdowns.find((b) => b.field === "Role");
    expect(role?.rows.map((r) => r.label)).toEqual(["Member"]);
  });

  test("resolves people by member: former staff keep each year they served", async () => {
    const { t } = await setup();
    const ids = await t.run(async (ctx) => {
      const campus = await ctx.db.insert("attendanceMetadata", {
        key: "Campus",
        type: "select",
        order: 0,
        values: { other: "Other" },
      });
      const role = await ctx.db.insert("attendanceMetadata", { key: "Role", type: "select", order: 1 });
      const user = await ctx.db.insert("users", { email: "former@sow.org.au" });
      const former = await ctx.db.insert("attendanceMembers", { name: "Former Row" });
      await ctx.db.insert("staffProfiles", {
        email: "former@sow.org.au",
        year: YEAR - 1,
        name: "Fay Former",
        userId: user,
        memberId: former,
        assignments: [{ role: "Student Leader", university: USYD }],
      });
      const plain = await ctx.db.insert("attendanceMembers", {
        name: "Pat Plain",
        metadata: { [campus]: "other", [role]: "raw-role" },
      });
      return { former, plain };
    });
    const persons = await t.query(internal.attendanceMetrics.gatherPersons, {
      keys: [`member:${ids.former}`, `member:${ids.plain}`, "member:nope", "staff:legacy@sow.org.au"],
      year: YEAR,
    });
    expect(persons.map((p) => p.key)).toEqual([`member:${ids.former}`, `member:${ids.plain}`, "member:nope"]);
    expect(persons[0]).toMatchObject({
      kind: "member",
      name: "Fay Former",
      breakdown: { Role: "Member" },
      isStudentLeader: false,
      campuses: [],
      leaderByYear: { [YEAR - 1]: true, [YEAR]: false },
    });
    expect(persons[0].subtitle).toBeUndefined();
    expect(persons[0].breakdownByYear![String(YEAR - 1)]).toMatchObject({ Role: "Student Leader" });
    expect(persons[1]).toMatchObject({ kind: "member", name: "Pat Plain", isStudentLeader: false });
    expect(persons[1].campuses).toBeUndefined();
    expect(persons[2]).toMatchObject({ kind: "member", name: "Unknown" });
  });

  test("treats a staff profile with no assignment this year as a Member", async () => {
    const { t, leader } = await setup();
    const former = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("attendanceMembers", { name: "Former Staff" });
      await ctx.db.insert("staffProfiles", {
        email: "former@sow.org.au",
        year: YEAR,
        name: "Former Staff",
        memberId,
        assignments: [],
      });
      return memberId;
    });
    const e = await leader.mutation(api.events.create, {
      name: "Gathering",
      ...window(2),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId: e, memberId: former });
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const snap = await snapshotOf(t, USYD, 4);
    const role = snap!.data.breakdowns.find((b) => b.field === "Role");
    expect(role?.rows.map((r) => r.label)).toEqual(["Member"]);
  });

  test("an event with the Weeklies tag but no term and week isn't a weekly", async () => {
    const { t, leader } = await setup();
    const e = await t.run(async (ctx) => {
      const tagId = await ctx.db.insert("attendanceTags", { name: "Weeklies" });
      return ctx.db.insert("events", { name: "Weekly Meeting", ...window(2), subgroups: [USYD], tagIds: [tagId] });
    });
    await leader.mutation(api.attendance.signIn, { eventId: e, email: LEADER });
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const snap = await snapshotOf(t, USYD, 4);
    expect(snap!.data.weeklyTrend).toHaveLength(0);
    expect(snap!.data.summary.weeklyConsistency).toBeNull();
  });

  test("detects events marked as a weekly", async () => {
    const { t, leader } = await setup();
    const at = window(2);
    const e = await leader.mutation(api.events.create, {
      name: "Weekly Meeting",
      ...at,
      subgroups: [USYD],
      weekly: { year: sydneyCalendarYear(new Date(at.dateStart)), slot: 1, week: 3 },
    });
    await leader.mutation(api.attendance.signIn, { eventId: e, email: LEADER });
    await leader.action(internal.attendanceMetrics.recomputeSubgroup, {
      subgroup: USYD,
    });
    const snap = await snapshotOf(t, USYD, 4);
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

  test("the view keeps a previous-year row while reading the current year", async () => {
    const { t, leader } = await setup();
    for (const [staffYear, computedAt] of [
      [YEAR - 1, 111],
      [YEAR, 222],
    ]) {
      await t.run((ctx) =>
        ctx.db.insert("attendanceMetricsSnapshots", {
          subgroup: USYD,
          rangeWeeks: 4,
          includeCollaborative: true,
          staffYear,
          computedAt,
          data: EMPTY_DATA,
        })
      );
    }
    const view = await leader.query(api.attendanceMetrics.view, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(view?.blocks[0]).toEqual({ type: "updated", computedAt: 222 });
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

  test("the view ignores a stale previous-staff-year row", async () => {
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
    const view = await leader.query(api.attendanceMetrics.view, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(view?.blocks).toEqual([
      expect.objectContaining({ type: "empty", title: "Not ready yet" }),
    ]);
  });

  test("recompute heals duplicate snapshot rows and reads the newest", async () => {
    const { t, leader } = await setup();
    for (const computedAt of [111, 222]) {
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
    const view = await leader.query(api.attendanceMetrics.view, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(view?.blocks[0]).toEqual({ type: "updated", computedAt: 222 });
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

describe("campus weekly averages in the SOW view", () => {
  const sowSnapshot = (t: TestConvex<typeof schema>, includeCollaborative: boolean) =>
    t.mutation(internal.attendanceMetrics.writeSnapshots, {
      subgroup: SOW_SUBGROUP,
      staffYear: YEAR,
      computedAt: 1234,
      snapshots: [{ rangeWeeks: 4, includeCollaborative, data: EMPTY_DATA }],
    });

  const campusRows = async (
    leader: ReturnType<typeof asUser>,
    includeCollaborative?: boolean
  ) => {
    const view = await leader.query(api.attendanceMetrics.view, {
      subgroup: SOW_SUBGROUP,
      rangeWeeks: 4,
      includeCollaborative,
    });
    const block = view?.blocks.find((b) => b.type === "breakdown");
    return block?.type === "breakdown" ? block.rows : null;
  };

  test("averages each campus's weeklies in the range from its weeklies index, highest first", async () => {
    const { t, leader } = await setup();
    const admin = asUser(t, ADMIN);
    const UNSW = "UNSW";
    for (const name of [UNSW, "Macquarie", "No Index Uni"]) {
      await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name });
    }
    await sowSnapshot(t, false);
    await sowSnapshot(t, true);
    const now = Date.now();
    await t.run(async (ctx) => {
      await weeklyIndex(ctx, USYD, [
        { at: now - 2 * DAY, count: 10, joint: false },
        { at: now - 9 * DAY, count: 15, joint: false },
        // Joint, and outside the 4-week range respectively.
        { at: now - 16 * DAY, count: 100, joint: true },
        { at: now - 60 * DAY, count: 99, joint: false },
      ]);
      await weeklyIndex(ctx, UNSW, [{ at: now - 3 * DAY, count: 40, joint: false }]);
      await weeklyIndex(ctx, "Macquarie", [{ at: now - 90 * DAY, count: 5, joint: false }]);
    });
    expect(await campusRows(leader, false)).toEqual([
      { label: UNSW, value: 40 },
      { label: USYD, value: 12.5 },
    ]);
    expect(await campusRows(leader)).toEqual([
      { label: USYD, value: 41.7 },
      { label: UNSW, value: 40 },
    ]);
  });

  test("a campus with no weeklies index is left out", async () => {
    const { t, leader } = await setup();
    await sowSnapshot(t, true);
    expect(await campusRows(leader)).toBeNull();
    const view = await leader.query(api.attendanceMetrics.view, {
      subgroup: SOW_SUBGROUP,
      rangeWeeks: 4,
    });
    expect(view?.blocks.map((b) => b.type)).toEqual(["updated", "empty"]);
  });
});

describe("view", () => {
  const snap = (avgWeeklyAttendance: number | null = 9) => ({
    ...EMPTY_DATA,
    hasEnoughHistory: true,
    summary: { ...EMPTY_DATA.summary, uniqueAttendees: 7, avgWeeklyAttendance },
  });

  test("returns null when not signed in", async () => {
    const { t } = await setup();
    expect(
      await t.query(api.attendanceMetrics.view, { subgroup: USYD, rangeWeeks: 4 })
    ).toBeNull();
  });

  test("tells a leader it's not ready before the first rebuild", async () => {
    const { leader } = await setup();
    const view = await leader.query(api.attendanceMetrics.view, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(view?.blocks).toEqual([
      expect.objectContaining({ type: "empty", title: "Not ready yet" }),
    ]);
  });

  test("lays out a campus from its Snapshot", async () => {
    const { t, leader } = await setup();
    await t.mutation(internal.attendanceMetrics.writeSnapshots, {
      subgroup: USYD,
      staffYear: YEAR,
      computedAt: 1234,
      snapshots: [{ rangeWeeks: 4, includeCollaborative: true, data: snap() }],
    });
    const view = await leader.query(api.attendanceMetrics.view, {
      subgroup: USYD,
      rangeWeeks: 4,
    });
    expect(view?.blocks.map((b) => b.type)).toEqual([
      "updated",
      "cards",
      "bars",
      "followUps",
    ]);
    expect(view?.blocks[0]).toEqual({ type: "updated", computedAt: 1234 });
  });

  test("SOW leads with each campus's weekly average", async () => {
    const { t, leader } = await setup();
    await t.mutation(internal.attendanceMetrics.writeSnapshots, {
      subgroup: SOW_SUBGROUP,
      staffYear: YEAR,
      computedAt: Date.now(),
      snapshots: [{ rangeWeeks: 4, includeCollaborative: false, data: snap() }],
    });
    await t.run((ctx) =>
      weeklyIndex(ctx, USYD, [{ at: Date.now() - DAY, count: 42, joint: false }])
    );
    const view = await leader.query(api.attendanceMetrics.view, {
      subgroup: SOW_SUBGROUP,
      rangeWeeks: 4,
      includeCollaborative: false,
    });
    expect(view?.blocks[1]).toEqual({
      type: "breakdown",
      title: "Weekly avg by campus",
      rows: [{ label: USYD, value: 42 }],
    });
  });

  test("rangeOptions lists the precomputed ranges", async () => {
    const { t } = await setup();
    expect(
      (await t.query(api.attendanceMetrics.rangeOptions, {})).map((o) => o.weeks)
    ).toEqual([1, 4, 52]);
  });
});
