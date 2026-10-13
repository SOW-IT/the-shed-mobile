import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.UTC(2026, 6, 15, 2);
const YEAR = 2026;
const UNSW = "University of New South Wales";
const USYD = "University of Sydney";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type T = TestConvex<typeof schema>;
type MemberId = Id<"attendanceMembers">;

const leader = (university: string) => [{ role: "Student Leader", university }];

const profile = (
  ctx: MutationCtx,
  email: string,
  year: number,
  name: string,
  assignments: { role: string; university?: string }[] = leader(UNSW),
  extra: { memberId?: MemberId; importId?: string } = {}
) => ctx.db.insert("staffProfiles", { email, year, name, assignments, ...extra });

async function seedLegacy(t: T) {
  return await t.run(async (ctx) => {
    for (const name of [UNSW, USYD]) await ctx.db.insert("universities", { name, year: YEAR });
    const campus = await ctx.db.insert("attendanceMetadata", {
      key: "Campus",
      type: "select",
      order: 0,
      values: { c1: UNSW, c2: USYD },
    });
    const role = await ctx.db.insert("attendanceMetadata", {
      key: "Role",
      type: "select",
      order: 1,
      values: { r1: "Student Leader", r2: "Member" },
    });
    const yearField = await ctx.db.insert("attendanceMetadata", {
      key: "Year",
      type: "select",
      order: 2,
      values: { y1: "1" },
    });
    const church = await ctx.db.insert("churches", { name: "Grace", nameKey: "grace", addedBy: "x" });
    const event = (name: string, day: number) =>
      ctx.db.insert("events", {
        name,
        dateStart: NOW - day * 86_400_000,
        dateEnd: NOW - day * 86_400_000 + 3_600_000,
        subgroups: [UNSW],
      });
    const e1 = await event("e1", 30);
    const e2 = await event("e2", 20);
    const e3 = await event("e3", 10);

    await profile(ctx, "alice@sow.org.au", YEAR - 1, "Alice Lee");
    await profile(ctx, "alice@sow.org.au", YEAR, "Alice Lee");
    const alice = await ctx.db.insert("attendanceMembers", {
      name: "Alice Lee",
      email: "alice@sow.org.au",
      personalEmail: " Alice@Gmail.com ",
      metadata: { [campus]: "c1", [role]: "r1" },
    });
    const aliceHidden = await ctx.db.insert("attendanceMembers", {
      name: "Alice Lee",
      email: "alice@sowaustralia.com",
      metadata: { [yearField]: "y1", [campus]: "c2" },
      churchId: church,
    });
    await ctx.db.insert("attendance", { eventId: e1, email: "alice@sow.org.au", signInTime: 1_000, notes: "first" });
    await ctx.db.insert("attendance", { eventId: e1, email: "Alice@SowAustralia.com ", signInTime: 1_050 });
    await ctx.db.insert("attendance", { eventId: e1, memberId: aliceHidden, signInTime: 1_100, notes: "late" });
    await ctx.db.insert("attendance", { eventId: e2, memberId: alice, signInTime: 2_000 });

    await profile(ctx, "bob@sow.org.au", YEAR - 1, "Bob Day", leader(USYD));
    const bob = await ctx.db.insert("attendanceMembers", { name: "Bob Day", email: "bob@gmail.com" });
    await ctx.db.insert("attendanceAuditLog", {
      actorEmail: "system:staff-rollover",
      entityType: "member",
      action: "member.leftStaff",
      summary: "Bob left staff",
      memberId: bob,
      subjectEmail: "bob@sow.org.au",
    });
    await ctx.db.insert("attendance", { eventId: e1, email: "bob@sow.org.au", signInTime: 1_200 });

    await profile(ctx, "carol@sow.org.au", YEAR, "Carol Ng");
    await profile(ctx, "carol@sow.org.au", YEAR + 1, "Carol Ng");
    await ctx.db.insert("attendance", { eventId: e2, email: "carol@sow.org.au", signInTime: 2_100 });

    await profile(ctx, "dave@sow.org.au", YEAR + 1, "Dave Next");

    await profile(ctx, "frank@sow.org.au", YEAR, "Frank Ho");
    const frank = await ctx.db.insert("attendanceMembers", {
      name: "Frank Ho",
      email: "frank@sow.org.au",
      personalEmail: "frank@sowaustralia.com",
      metadata: { [campus]: "c2", [role]: "r1" },
    });

    const pat = await ctx.db.insert("attendanceMembers", {
      name: "Pat Plain",
      email: "pat@gmail.com",
      personalEmail: "pat.other@gmail.com",
    });
    await ctx.db.insert("attendance", { eventId: e3, memberId: pat, email: "pat@gmail.com", signInTime: 3_000 });
    await ctx.db.insert("attendance", { eventId: e2, email: "PAT@gmail.com", signInTime: 2_200 });
    await ctx.db.insert("attendance", { eventId: e1, email: "new.comer@gmail.com", signInTime: 1_300 });
    await ctx.db.insert("attendance", { eventId: e2, email: "new.comer@gmail.com", signInTime: 2_300 });
    await ctx.db.insert("attendance", { eventId: e3, email: "ghost.staff@sow.org.au", signInTime: 3_100 });

    await profile(ctx, "unassigned@sow.org.au", YEAR, "Una Signed", []);

    const goneMember = await ctx.db.insert("attendanceMembers", { name: "Gone" });
    await ctx.db.delete(goneMember);
    await ctx.db.insert("attendanceAuditLog", {
      actorEmail: "x",
      entityType: "member",
      action: "member.leftStaff",
      summary: "gone",
      memberId: goneMember,
      subjectEmail: "gone@sow.org.au",
    });
    await ctx.db.insert("attendanceAuditLog", {
      actorEmail: "x",
      entityType: "member",
      action: "member.leftStaff",
      summary: "no email",
      memberId: pat,
    });
    await ctx.db.insert("attendanceAuditLog", {
      actorEmail: "x",
      entityType: "member",
      action: "member.update",
      summary: "other",
      memberId: pat,
      subjectEmail: "pat@gmail.com",
    });
    await ctx.db.insert("weeklyInsightIndex", {
      subgroup: UNSW,
      computedAt: 0,
      periods: [],
      currentKey: null,
      weeklies: [],
      settingsVersion: 0,
      viewVersion: 0,
      auditSeen: 0,
      eventsSeen: 0,
      nextCompareAt: 0,
    });
    return { campus, role, yearField, church, e1, e2, e3, alice, aliceHidden, bob, frank, pat };
  });
}

type Seeded = Awaited<ReturnType<typeof seedLegacy>>;

const report = (t: T, pageSize?: number) =>
  t.action(internal.memberBackfill.report, pageSize ? { pageSize } : {});

const CLEAN = {
  attendanceWithEmail: 0,
  attendanceWithoutMember: 0,
  attendanceMemberMissing: 0,
  membersWithPersonalEmail: 0,
  linkedMembersWithStaffEmail: 0,
  duplicateSignIns: 0,
  currentStaffUnlinked: 0,
  nextStaffUnlinked: 1,
  profilesLinkedToMissingMember: 0,
  membersLinkedToTwoStaffInOneYear: 0,
};

async function runOnce(t: T) {
  const steps: { step: string; processed: number; changed: number }[] = [];
  let next: { step: "leftStaff" | "profiles" | "attendance" | "members" | "attach" | "insights"; cursor: string | null } | null =
    { step: "leftStaff", cursor: null };
  while (next) {
    const result: Awaited<ReturnType<typeof t.mutation<typeof internal.memberBackfill.run>>> = await t.mutation(
      internal.memberBackfill.run,
      { ...next, once: true }
    );
    steps.push({ step: result.step, processed: result.processed, changed: result.changed });
    next = result.next;
  }
  return steps;
}

async function expectBackfilled(t: T, ids: Seeded) {
  const state = await t.run(async (ctx) => ({
    members: await ctx.db.query("attendanceMembers").collect(),
    profiles: await ctx.db.query("staffProfiles").collect(),
    attendance: await ctx.db.query("attendance").collect(),
    audit: await ctx.db.query("attendanceAuditLog").collect(),
  }));
  const memberOf = (email: string, year: number) =>
    state.profiles.find((p) => p.email === email && p.year === year)!.memberId;

  expect(state.members.map((m) => m._id)).not.toContain(ids.aliceHidden);
  const alice = state.members.find((m) => m._id === ids.alice)!;
  expect(alice).toMatchObject({ email: "alice@gmail.com", metadata: { [ids.yearField]: "y1" }, churchId: ids.church });
  expect(alice.personalEmail).toBeUndefined();
  expect(memberOf("alice@sow.org.au", YEAR - 1)).toBe(ids.alice);
  expect(memberOf("alice@sow.org.au", YEAR)).toBe(ids.alice);
  const aliceRows = state.attendance.filter((r) => r.memberId === ids.alice);
  expect(aliceRows).toHaveLength(2);
  expect(aliceRows.find((r) => r.eventId === ids.e1)).toMatchObject({ signInTime: 1_000 });
  expect(aliceRows.find((r) => r.eventId === ids.e1)!.notes).toContain("late");
  expect(aliceRows.find((r) => r.eventId === ids.e1)!.notes).toContain("first");

  expect(memberOf("bob@sow.org.au", YEAR - 1)).toBe(ids.bob);
  expect(state.members.find((m) => m._id === ids.bob)).toMatchObject({ email: "bob@gmail.com" });
  expect(state.attendance.find((r) => r.eventId === ids.e1 && r.memberId === ids.bob)).toBeTruthy();

  const carol = memberOf("carol@sow.org.au", YEAR)!;
  expect(memberOf("carol@sow.org.au", YEAR + 1)).toBe(carol);
  expect(state.members.find((m) => m._id === carol)).toMatchObject({ name: "Carol Ng" });
  expect(state.members.find((m) => m._id === carol)!.email).toBeUndefined();
  expect(state.attendance.find((r) => r.memberId === carol)!.eventId).toBe(ids.e2);
  expect(state.audit).toContainEqual(
    expect.objectContaining({ action: "member.create", actorEmail: "system:member-backfill", memberId: carol })
  );

  expect(memberOf("dave@sow.org.au", YEAR + 1)).toBeUndefined();

  const frank = state.members.find((m) => m._id === ids.frank)!;
  expect(memberOf("frank@sow.org.au", YEAR)).toBe(ids.frank);
  expect(frank.email).toBeUndefined();
  expect(frank.personalEmail).toBeUndefined();
  expect(frank.metadata).toEqual({ [ids.campus]: "c2" });

  const pat = state.members.find((m) => m._id === ids.pat)!;
  expect(pat.email).toBe("pat@gmail.com");
  expect(pat.personalEmail).toBeUndefined();
  const dropped = state.audit.filter((l) => l.memberId === ids.pat && l.actorEmail === "system:member-backfill");
  expect(dropped).toHaveLength(1);
  expect(dropped[0].summary).toContain("pat.other@gmail.com");
  expect(dropped[0].detail).toContain("Email kept: pat@gmail.com");
  expect(state.attendance.filter((r) => r.memberId === ids.pat).map((r) => r.eventId).sort()).toEqual(
    [ids.e2, ids.e3].sort()
  );

  const newcomer = state.members.find((m) => m.email === "new.comer@gmail.com")!;
  expect(newcomer.name).toBe("New Comer");
  expect(state.attendance.filter((r) => r.memberId === newcomer._id)).toHaveLength(2);

  const ghost = state.members.find((m) => m.name === "Ghost Staff")!;
  expect(ghost.email).toBe("ghost.staff@sow.org.au");

  expect(state.profiles.find((p) => p.email === "unassigned@sow.org.au")!.memberId).toBeUndefined();
  expect(state.attendance.every((r) => r.email === undefined && r.memberId)).toBe(true);
}

describe("memberBackfill", () => {
  test("the legacy data starts out dirty", async () => {
    const t = convexTest(schema, modules);
    await seedLegacy(t);
    expect(await report(t)).toEqual({
      attendanceWithEmail: 9,
      attendanceWithoutMember: 8,
      attendanceMemberMissing: 0,
      membersWithPersonalEmail: 3,
      linkedMembersWithStaffEmail: 0,
      duplicateSignIns: 0,
      currentStaffUnlinked: 3,
      nextStaffUnlinked: 2,
      profilesLinkedToMissingMember: 0,
      membersLinkedToTwoStaffInOneYear: 0,
    });
  });

  test("step by step, every legacy shape ends up keyed by member, and a rerun changes nothing", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedLegacy(t);
    const first = await runOnce(t);
    expect(first.map((s) => s.step)).toEqual(["leftStaff", "profiles", "attendance", "members", "attach", "insights"]);
    expect(first.find((s) => s.step === "insights")).toMatchObject({ processed: 1, changed: 1 });
    expect(await report(t)).toEqual(CLEAN);
    expect(await report(t, 2)).toEqual(CLEAN);
    await expectBackfilled(t, ids);

    const scheduled = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map((j) => j.name).sort()
    );
    expect(scheduled).toEqual(["attendanceMetrics:recomputeAll", "weeklyInsights:rebuildAll"]);
    expect(await t.run((ctx) => ctx.db.query("weeklyInsightIndex").collect())).toEqual([]);

    const snapshot = await t.run(async (ctx) => ({
      members: await ctx.db.query("attendanceMembers").collect(),
      profiles: await ctx.db.query("staffProfiles").collect(),
      attendance: await ctx.db.query("attendance").collect(),
    }));
    const second = await runOnce(t);
    expect(second.map((s) => s.changed)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(
      await t.run(async (ctx) => ({
        members: await ctx.db.query("attendanceMembers").collect(),
        profiles: await ctx.db.query("staffProfiles").collect(),
        attendance: await ctx.db.query("attendance").collect(),
      }))
    ).toEqual(snapshot);
    expect(await report(t)).toEqual(CLEAN);
  });

  test("a scheduled run walks every step and rebuilds Insights", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    const ids = await seedLegacy(t);
    const result = await t.mutation(internal.memberBackfill.run, {});
    expect(result.next).toEqual({ step: "profiles", cursor: null });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await report(t)).toEqual(CLEAN);
    await expectBackfilled(t, ids);
    const jobs = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map((j) => [j.name, j.state.kind])
    );
    expect(jobs.filter(([name]) => name === "memberBackfill:run")).toHaveLength(5);
    expect(jobs.every(([, state]) => state === "success")).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("weeklyInsightIndex").collect())).toEqual(
      expect.arrayContaining([expect.objectContaining({ subgroup: UNSW })])
    );
  });

  test("attach links this year's staff and next year's known people, a page at a time", async () => {
    const t = convexTest(schema, modules);
    const { known } = await t.run(async (ctx) => {
      const known = await ctx.db.insert("attendanceMembers", { name: "Known" });
      await profile(ctx, "known@sow.org.au", YEAR - 1, "Known", leader(UNSW), { memberId: known });
      await profile(ctx, "known@sow.org.au", YEAR + 1, "Known");
      await profile(ctx, "stranger@sow.org.au", YEAR + 1, "Stranger");
      await profile(ctx, "linked@sow.org.au", YEAR, "Linked", leader(UNSW), { memberId: known });
      for (let i = 0; i < 50; i++) await profile(ctx, `staff${i}@sow.org.au`, YEAR, `Staff ${i}`);
      return { known };
    });
    const first = await t.mutation(internal.memberBackfill.run, { step: "attach", once: true });
    expect(first).toMatchObject({ processed: 50, changed: 50, next: { step: "attach", cursor: null } });
    const second = await t.mutation(internal.memberBackfill.run, { step: "attach", once: true });
    expect(second).toMatchObject({ processed: 1, changed: 1, next: { step: "insights", cursor: null } });
    const profiles = await t.run((ctx) => ctx.db.query("staffProfiles").collect());
    expect(profiles.find((p) => p.email === "known@sow.org.au" && p.year === YEAR + 1)!.memberId).toBe(known);
    expect(profiles.find((p) => p.email === "stranger@sow.org.au")!.memberId).toBeUndefined();
    expect(profiles.filter((p) => p.year === YEAR).every((p) => p.memberId)).toBe(true);
    expect((await report(t)).currentStaffUnlinked).toBe(0);
  });

  test("leftStaff keeps a profile already linked to someone", async () => {
    const t = convexTest(schema, modules);
    const { current, convert } = await t.run(async (ctx) => {
      const current = await ctx.db.insert("attendanceMembers", { name: "Current" });
      const convert = await ctx.db.insert("attendanceMembers", { name: "Converted" });
      await profile(ctx, "sam@sow.org.au", YEAR, "Sam", leader(UNSW), { memberId: current });
      await profile(ctx, "sam@sowaustralia.com", YEAR - 1, "Sam");
      await ctx.db.insert("attendanceAuditLog", {
        actorEmail: "x",
        entityType: "member",
        action: "member.leftStaff",
        summary: "x",
        memberId: convert,
        subjectEmail: "sam@sow.org.au",
      });
      return { current, convert };
    });
    const result = await t.mutation(internal.memberBackfill.run, { once: true });
    expect(result).toMatchObject({ step: "leftStaff", processed: 1, changed: 1 });
    const profiles = await t.run((ctx) => ctx.db.query("staffProfiles").collect());
    expect(profiles.find((p) => p.year === YEAR)!.memberId).toBe(current);
    expect(profiles.find((p) => p.year === YEAR - 1)!.memberId).toBe(convert);
  });

  test("profiles finds the member through a same-person profile and folds that email's rows into it", async () => {
    const t = convexTest(schema, modules);
    const linked = await t.run(async (ctx) => {
      const linked = await ctx.db.insert("attendanceMembers", { name: "Linked" });
      await ctx.db.insert("attendanceMembers", { name: "Overlay", email: "kim@sow.org.au", personalEmail: "me@gmail.com" });
      await profile(ctx, "kim@sow.org.au", YEAR, "Kim", leader(UNSW), { importId: "imp-1" });
      await profile(ctx, "kim.old@sow.org.au", YEAR - 1, "Kim", leader(UNSW), { importId: "imp-1", memberId: linked });
      return linked;
    });
    await t.mutation(internal.memberBackfill.run, { step: "profiles", once: true });
    const state = await t.run(async (ctx) => ({
      members: await ctx.db.query("attendanceMembers").collect(),
      profiles: await ctx.db.query("staffProfiles").collect(),
    }));
    expect(state.members.map((m) => m._id)).toEqual([linked]);
    expect(state.members[0].personalEmail).toBe("me@gmail.com");
    expect(state.profiles.every((p) => p.memberId === linked)).toBe(true);
  });

  test("the report counts sign-ins of a missing member, duplicates and double staff links across pages", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const e = await ctx.db.insert("events", { name: "e", dateStart: NOW, dateEnd: NOW, subgroups: [UNSW] });
      const gone = await ctx.db.insert("attendanceMembers", { name: "Gone" });
      const twice = await ctx.db.insert("attendanceMembers", { name: "Twice", email: "twice@sow.org.au" });
      await ctx.db.delete(gone);
      await ctx.db.insert("attendance", { eventId: e, memberId: gone, signInTime: 1 });
      await ctx.db.insert("attendance", { eventId: e, memberId: twice, signInTime: 1 });
      await ctx.db.insert("attendance", { eventId: e, memberId: twice, signInTime: 2 });
      await profile(ctx, "twice@sow.org.au", YEAR, "Twice", leader(UNSW), { memberId: twice });
      await profile(ctx, "twice2@sow.org.au", YEAR, "Twice", leader(UNSW), { memberId: twice });
      await profile(ctx, "lost@sow.org.au", YEAR - 1, "Lost", leader(UNSW), { memberId: gone });
      const both = await ctx.db.insert("attendanceMembers", { name: "Both" });
      await profile(ctx, "both.domains@sow.org.au", YEAR, "Both", leader(UNSW), { memberId: both });
      await profile(ctx, "both.domains@sowaustralia.com", YEAR, "Both", leader(UNSW), { memberId: both });
    });
    const expected = {
      attendanceWithEmail: 0,
      attendanceWithoutMember: 0,
      attendanceMemberMissing: 1,
      membersWithPersonalEmail: 0,
      linkedMembersWithStaffEmail: 1,
      duplicateSignIns: 1,
      currentStaffUnlinked: 0,
      nextStaffUnlinked: 0,
      profilesLinkedToMissingMember: 1,
      membersLinkedToTwoStaffInOneYear: 1,
    };
    expect(await report(t, 1)).toEqual(expected);
    expect(await report(t)).toEqual(expected);
  });

  test("sign-ins from one staff address with no profile become one member", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const day of [1, 2]) {
        const e = await ctx.db.insert("events", { name: `e${day}`, dateStart: day, dateEnd: day, subgroups: [UNSW] });
        await ctx.db.insert("attendance", { eventId: e, email: "ex.staff@sow.org.au", signInTime: day });
      }
    });
    await t.mutation(internal.memberBackfill.run, { step: "attendance", once: true });
    const members = await t.run((ctx) => ctx.db.query("attendanceMembers").collect());
    expect(members.map((m) => m.name)).toEqual(["Ex Staff"]);
  });
});
