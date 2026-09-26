/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const OTHER = "other.leader@sow.org.au";

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = t.withIdentity({ email: ADMIN, subject: ADMIN, issuer: "test" });
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "USYD" });
  for (const email of [LEADER, OTHER]) {
    await admin.mutation(api.admin.setStaffProfile, {
      email,
      year: YEAR,
      roles: ["Student Leader"],
      university: "USYD",
    });
  }
  return t;
}

describe("repairStaffAttendance", () => {
  test("folds hidden duplicate rows and moves member sign-ins to the staff email", async () => {
    const t = await setup();
    const ids = await t.run(async (ctx) => {
      const kept = await ctx.db.insert("attendanceMembers", {
        name: "Leader",
        email: LEADER,
        metadata: { year: "1" },
      });
      const hidden = await ctx.db.insert("attendanceMembers", {
        name: "Leader",
        email: LEADER,
        metadata: { year: "3", gender: "F" },
      });
      const plain = await ctx.db.insert("attendanceMembers", { name: "Just A Member" });
      const ev = (name: string, at: number) =>
        ctx.db.insert("events", { name, dateStart: at, dateEnd: at + 1, subgroups: [] });
      const e1 = await ev("e1", 1_000);
      const e2 = await ev("e2", 2_000);
      const e3 = await ev("e3", 3_000);
      await ctx.db.insert("attendance", { eventId: e1, email: LEADER, signInTime: 1_200 });
      await ctx.db.insert("attendance", { eventId: e1, memberId: kept, signInTime: 1_100, notes: "early" });
      await ctx.db.insert("attendance", { eventId: e2, memberId: hidden, signInTime: 2_100 });
      await ctx.db.insert("attendance", { eventId: e3, memberId: kept, signInTime: 3_100 });
      await ctx.db.insert("attendance", { eventId: e3, memberId: hidden, signInTime: 3_050 });
      await ctx.db.insert("attendance", { eventId: e1, memberId: plain, signInTime: 1_300 });
      return { kept, hidden, plain, e1, e3 };
    });
    const expected = { rowsFolded: 1, recordsMoved: 2, recordsCombined: 2 };

    const dry = await t.mutation(internal.memberRepair.repairStaffAttendance, {});
    expect(dry).toMatchObject({ dryRun: true, staff: 1, next: null, ...expected });
    expect(dry.details).toEqual([{ email: LEADER, ...expected }]);
    // A dry run writes nothing.
    expect(await t.run((ctx) => ctx.db.query("attendance").collect())).toHaveLength(6);

    const real = await t.mutation(internal.memberRepair.repairStaffAttendance, {
      dryRun: false,
    });
    expect(real).toMatchObject({ dryRun: false, staff: 1, ...expected });

    const rows = await t.run((ctx) => ctx.db.query("attendance").collect());
    const staffRows = rows.filter((r) => r.email === LEADER);
    expect(staffRows).toHaveLength(3);
    expect(staffRows.every((r) => r.memberId === undefined)).toBe(true);
    expect(staffRows.find((r) => r.eventId === ids.e1)).toMatchObject({
      signInTime: 1_100,
      notes: "early",
    });
    expect(staffRows.find((r) => r.eventId === ids.e3)?.signInTime).toBe(3_050);
    // Other members are untouched.
    expect(rows.find((r) => r.memberId === ids.plain)).toBeTruthy();

    expect(await t.run((ctx) => ctx.db.get(ids.hidden))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(ids.kept))).toMatchObject({
      metadata: { year: "1", gender: "F" },
    });
    const log = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "member.repair", memberId: ids.kept });
    expect(log[0].detail).toBe(
      "Moved 2 sign-ins to the staff email; combined 2 shared events; folded 1 duplicate record"
    );
    const shown = await t
      .withIdentity({ email: ADMIN, subject: ADMIN, issuer: "test" })
      .query(api.attendanceAudit.list, { paginationOpts: { numItems: 5, cursor: null } });
    expect(shown.page[0].actorName).toBe("System (staff attendance repair)");

    // Running it again finds nothing left to do.
    const again = await t.mutation(internal.memberRepair.repairStaffAttendance, {
      dryRun: false,
    });
    expect(again).toMatchObject({ staff: 0, recordsMoved: 0, details: [] });
  });

  test("works through staff in batches", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      const e = await ctx.db.insert("events", { name: "e", dateStart: 1, dateEnd: 2, subgroups: [] });
      for (const email of [LEADER, OTHER]) {
        const row = await ctx.db.insert("attendanceMembers", { name: email, email });
        await ctx.db.insert("attendance", { eventId: e, memberId: row, signInTime: 1 });
      }
    });
    const first = await t.mutation(internal.memberRepair.repairStaffAttendance, {
      dryRun: false,
      limit: 1,
    });
    expect(first.details.map((d) => d.email)).toEqual([LEADER]);
    expect(first.next).not.toBeNull();
    const second = await t.mutation(internal.memberRepair.repairStaffAttendance, {
      dryRun: false,
      limit: 1,
      after: first.next!,
    });
    expect(second.details.map((d) => d.email)).toEqual([OTHER]);
    expect(second.next).toBeNull();
  });

  test("can be limited to one staff person", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      const e = await ctx.db.insert("events", { name: "e", dateStart: 1, dateEnd: 2, subgroups: [] });
      for (const email of [LEADER, OTHER]) {
        const row = await ctx.db.insert("attendanceMembers", { name: email, email });
        await ctx.db.insert("attendance", { eventId: e, memberId: row, signInTime: 1 });
      }
    });
    const one = await t.mutation(internal.memberRepair.repairStaffAttendance, {
      email: OTHER.toUpperCase(),
    });
    expect(one.details.map((d) => d.email)).toEqual([OTHER]);
  });
});

describe("repairStaffAttendance limits", () => {
  test("rejects a limit that isn't a positive whole number", async () => {
    const t = await setup();
    for (const limit of [0, -1, 1.5]) {
      await expect(
        t.mutation(internal.memberRepair.repairStaffAttendance, { limit })
      ).rejects.toThrow(/positive whole number/);
    }
  });
});

describe("restoreAttendance", () => {
  test("dry run reports, a real run restores with an audit entry, and a rerun changes nothing", async () => {
    const t = await setup();
    const { e1, e2, member, gone } = await t.run(async (ctx) => {
      const ev = (name: string, at: number) =>
        ctx.db.insert("events", { name, dateStart: at, dateEnd: at + 1, subgroups: [] });
      const e1 = await ev("S2W1", 1_000);
      const e2 = await ev("S2W2", 2_000);
      const member = await ctx.db.insert("attendanceMembers", { name: "Jeremy Lim" });
      const gone = await ctx.db.insert("attendanceMembers", { name: "Gone" });
      await ctx.db.delete(gone);
      // Already signed in to e2: must be left alone.
      await ctx.db.insert("attendance", { eventId: e2, memberId: member, signInTime: 2_050 });
      return { e1, e2, member, gone };
    });
    const deletedEvent = await t.run(async (ctx) => {
      const id = await ctx.db.insert("events", { name: "x", dateStart: 1, dateEnd: 2, subgroups: [] });
      await ctx.db.delete(id);
      return id;
    });
    const reason = 'Deleted with member "Jeremy Lim" on 27 Aug 2026';
    const records = [
      { eventId: e1, memberId: member, signInTime: 1_100, reason },
      { eventId: e2, memberId: member, signInTime: 2_100, reason },
      { eventId: e1, email: LEADER.toUpperCase(), signInTime: 1_200, notes: "late", reason },
      { eventId: deletedEvent, memberId: member, signInTime: 1, reason },
      { eventId: e1, memberId: gone, signInTime: 1, reason },
      { eventId: e1, signInTime: 1, reason },
    ];

    const dry = await t.mutation(internal.memberRepair.restoreAttendance, { records });
    expect(dry.dryRun).toBe(true);
    expect(dry.restored).toBe(2);
    expect(dry.results.map((r) => r.status)).toEqual([
      "restored",
      "already there",
      "restored",
      "event missing",
      "member missing",
      "needs one of memberId or email",
    ]);
    expect(await t.run((ctx) => ctx.db.query("attendance").collect())).toHaveLength(1);

    const real = await t.mutation(internal.memberRepair.restoreAttendance, {
      records,
      dryRun: false,
    });
    expect(real.restored).toBe(2);
    const rows = await t.run((ctx) => ctx.db.query("attendance").collect());
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.eventId === e1 && r.memberId === member)?.signInTime).toBe(1_100);
    expect(rows.find((r) => r.email === LEADER)).toMatchObject({ eventId: e1, notes: "late" });

    const logs = (await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect())).filter(
      (l) => l.action === "attendance.restore"
    );
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      actorEmail: "system:attendance-restore",
      summary: 'Jeremy Lim restored to "S2W1"',
      memberId: member,
    });
    expect(logs[0].detail).toContain(reason);
    expect(logs[0].detail).toContain("Original sign-in:");

    const again = await t.mutation(internal.memberRepair.restoreAttendance, {
      records,
      dryRun: false,
    });
    expect(again.restored).toBe(0);
    expect(await t.run((ctx) => ctx.db.query("attendance").collect())).toHaveLength(3);
  });
});
