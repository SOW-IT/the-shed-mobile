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
  await t.run(async (ctx) => {
    for (const profile of await ctx.db.query("staffProfiles").collect()) {
      await ctx.db.patch(profile._id, { memberId: undefined });
    }
    for (const member of await ctx.db.query("attendanceMembers").collect()) {
      await ctx.db.delete(member._id);
    }
    for (const entry of await ctx.db.query("attendanceAuditLog").collect()) {
      await ctx.db.delete(entry._id);
    }
  });
  return t;
}

describe("restoreAttendance", () => {
  test("dry run reports, a real run restores with an audit entry, and a rerun changes nothing", async () => {
    const t = await setup();
    const { e1, e2, member, gone, leader } = await t.run(async (ctx) => {
      const ev = (name: string, at: number) =>
        ctx.db.insert("events", { name, dateStart: at, dateEnd: at + 1, subgroups: [] });
      const e1 = await ev("S2W1", 1_000);
      const e2 = await ev("S2W2", 2_000);
      const member = await ctx.db.insert("attendanceMembers", { name: "Jeremy Lim" });
      const gone = await ctx.db.insert("attendanceMembers", { name: "Gone" });
      await ctx.db.delete(gone);
      // Already signed in to e2: must be left alone.
      await ctx.db.insert("attendance", { eventId: e2, memberId: member, signInTime: 2_050 });
      const leader = await ctx.db.insert("attendanceMembers", { name: "Lee Leader" });
      const profile = (await ctx.db.query("staffProfiles").collect()).find((p) => p.email === LEADER)!;
      await ctx.db.patch(profile._id, { memberId: leader });
      return { e1, e2, member, gone, leader };
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
      { eventId: e1, email: OTHER, signInTime: 1_300, reason },
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
      "member missing",
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
    expect(rows.find((r) => r.memberId === leader)).toMatchObject({ eventId: e1, notes: "late" });

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

describe("capitalizeMemberNames", () => {
  const names = ["jane doe", "Aaron byeun", "McDonald", "JANE DOE", "  sam lee ", "Already Fine"];
  const nameLog = async (t: Awaited<ReturnType<typeof setup>>) =>
    (await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect())).filter(
      (l) => l.actorEmail === "system:member-name-capitalize"
    );

  test("capitalises each word, leaves existing capitals alone, dry run first", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (const name of names) await ctx.db.insert("attendanceMembers", { name });
    });
    const stored = async () =>
      (await t.run((ctx) => ctx.db.query("attendanceMembers").collect())).map((m) => m.name);

    const dry = await t.mutation(internal.memberRepair.capitalizeMemberNames, {});
    expect(dry).toMatchObject({ dryRun: true, scanned: 6, renamed: 3, next: null });
    expect(dry.changes.map((c) => [c.from, c.to])).toEqual([
      ["jane doe", "Jane Doe"],
      ["Aaron byeun", "Aaron Byeun"],
      ["  sam lee ", "Sam Lee"],
    ]);
    expect(await stored()).toEqual(names);
    expect(await nameLog(t)).toHaveLength(0);

    const real = await t.mutation(internal.memberRepair.capitalizeMemberNames, {
      dryRun: false,
    });
    expect(real.renamed).toBe(3);
    expect(await stored()).toEqual([
      "Jane Doe",
      "Aaron Byeun",
      "McDonald",
      "JANE DOE",
      "Sam Lee",
      "Already Fine",
    ]);
    const logs = await nameLog(t);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ summary: "Capitalised 3 member names", entityType: "member" });
    expect(logs[0].detail).toContain('"jane doe" → "Jane Doe"');

    const again = await t.mutation(internal.memberRepair.capitalizeMemberNames, {
      dryRun: false,
    });
    expect(again.renamed).toBe(0);
    expect(await nameLog(t)).toHaveLength(1);
  });

  test("pages through members with the returned cursor", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (const name of ["a one", "b two", "c three"]) {
        await ctx.db.insert("attendanceMembers", { name });
      }
    });
    const first = await t.mutation(internal.memberRepair.capitalizeMemberNames, {
      dryRun: false,
      limit: 2,
    });
    expect(first).toMatchObject({ scanned: 2, renamed: 2 });
    expect(first.next).not.toBeNull();
    const second = await t.mutation(internal.memberRepair.capitalizeMemberNames, {
      dryRun: false,
      limit: 2,
      cursor: first.next!,
    });
    expect(second).toMatchObject({ scanned: 1, renamed: 1, next: null });
    const logs = await nameLog(t);
    expect(logs.map((l) => l.summary)).toEqual([
      "Capitalised 2 member names",
      "Capitalised 1 member name",
    ]);
  });

  test("lists at most the audit line cap, with a count of the rest", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 102; i++) {
        await ctx.db.insert("attendanceMembers", { name: `member ${i}` });
      }
    });
    await t.mutation(internal.memberRepair.capitalizeMemberNames, { dryRun: false });
    const [log] = await nameLog(t);
    expect(log.detail?.split("\n")).toHaveLength(101);
    expect(log.detail).toContain("and 2 more");
  });

  test("rejects a limit that isn't a positive whole number", async () => {
    const t = await setup();
    await expect(
      t.mutation(internal.memberRepair.capitalizeMemberNames, { limit: 0 })
    ).rejects.toThrow("limit must be a positive whole number.");
  });
});
