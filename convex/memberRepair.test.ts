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

describe("restoreCampus", () => {
  test("fills only an empty Campus, dry run first, and a rerun changes nothing", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const campus = await ctx.db.insert("attendanceMetadata", {
        key: "Campus",
        type: "select",
        order: 0,
        values: { "1": "University of Sydney", "2": "Macquarie University" },
      });
      return {
        campus,
        empty: await ctx.db.insert("attendanceMembers", { name: "Erin Empty", metadata: { other: "x" } }),
        set: await ctx.db.insert("attendanceMembers", { name: "Sam Set", metadata: { [campus]: "2" } }),
        gone: await ctx.db.insert("attendanceMembers", { name: "Gone" }),
      };
    });
    await t.run((ctx) => ctx.db.delete(ids.gone));
    const fills = [
      { memberId: ids.empty, campus: "University of Sydney", reason: "cleared by 2.6.0" },
      { memberId: ids.set, campus: "University of Sydney", reason: "cleared by 2.6.0" },
      { memberId: ids.gone, campus: "University of Sydney", reason: "cleared by 2.6.0" },
      { memberId: ids.empty, campus: "Nowhere Uni", reason: "cleared by 2.6.0" },
    ];

    const dry = await t.mutation(internal.memberRepair.restoreCampus, { fills });
    expect(dry).toMatchObject({ dryRun: true, filled: 1 });
    expect(dry.results.map((r) => [r.who, r.status])).toEqual([
      ["Erin Empty", "filled"],
      ["Sam Set", "already set"],
      [ids.gone, "member missing"],
      ["Erin Empty", "unknown campus"],
    ]);
    expect((await t.run((ctx) => ctx.db.get(ids.empty)))?.metadata).toEqual({ other: "x" });

    const real = await t.mutation(internal.memberRepair.restoreCampus, { fills, dryRun: false });
    expect(real.filled).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(ids.empty)))?.metadata).toEqual({ other: "x", [ids.campus]: "1" });
    expect((await t.run((ctx) => ctx.db.get(ids.set)))?.metadata).toEqual({ [ids.campus]: "2" });
    const log = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actorEmail: "system:campus-restore",
      action: "member.update",
      summary: `Restored "Erin Empty"'s Campus (University of Sydney)`,
      memberId: ids.empty,
      detail: "cleared by 2.6.0",
    });

    const again = await t.mutation(internal.memberRepair.restoreCampus, { fills, dryRun: false });
    expect(again.filled).toBe(0);
  });

  test("reports an unknown campus when there is no Campus field", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "No Field" }));
    const result = await t.mutation(internal.memberRepair.restoreCampus, {
      fills: [{ memberId: id, campus: "University of Sydney", reason: "x" }],
    });
    expect(result.results[0].status).toBe("unknown campus");
  });
});

describe("linkProfiles", () => {
  test("links only an unlinked profile, dry run first, with an audit entry", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const edwin = await ctx.db.insert("attendanceMembers", { name: "Edwin Gao" });
      const other = await ctx.db.insert("attendanceMembers", { name: "Other Person" });
      const gone = await ctx.db.insert("attendanceMembers", { name: "Gone" });
      const assignments = [{ role: "Student Leader", university: "University of Sydney" }];
      return {
        edwin,
        other,
        gone,
        unlinked: await ctx.db.insert("staffProfiles", { email: "edwin.gao@sow.org.au", year: 2025, assignments }),
        linked: await ctx.db.insert("staffProfiles", { email: "o@sow.org.au", year: 2025, assignments, memberId: other }),
        stale: await ctx.db.insert("staffProfiles", { email: "s@sow.org.au", year: 2025, assignments, memberId: gone }),
        orphan: await ctx.db.insert("staffProfiles", { email: "x@sow.org.au", year: 2025, assignments }),
      };
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.gone);
      await ctx.db.delete(ids.orphan);
    });
    const links = [
      { profileId: ids.unlinked, memberId: ids.edwin, reason: "2025 sign-ins at UNSW" },
      { profileId: ids.linked, memberId: ids.other, reason: "already" },
      { profileId: ids.linked, memberId: ids.edwin, reason: "elsewhere" },
      { profileId: ids.stale, memberId: ids.edwin, reason: "points at a deleted row" },
      { profileId: ids.orphan, memberId: ids.edwin, reason: "profile gone" },
      { profileId: ids.unlinked, memberId: ids.gone, reason: "member gone" },
    ];

    const dry = await t.mutation(internal.memberRepair.linkProfiles, { links });
    expect(dry).toMatchObject({ dryRun: true, linked: 2 });
    expect(dry.results.map((r) => r.status)).toEqual([
      "linked",
      "already linked",
      "linked elsewhere",
      "linked",
      "profile missing",
      "member missing",
    ]);
    expect((await t.run((ctx) => ctx.db.get(ids.unlinked)))?.memberId).toBeUndefined();

    const real = await t.mutation(internal.memberRepair.linkProfiles, { links, dryRun: false });
    expect(real.linked).toBe(2);
    expect((await t.run((ctx) => ctx.db.get(ids.unlinked)))?.memberId).toBe(ids.edwin);
    expect((await t.run((ctx) => ctx.db.get(ids.stale)))?.memberId).toBe(ids.edwin);
    const log = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(log[0]).toMatchObject({
      actorEmail: "system:profile-link",
      action: "member.linkStaff",
      summary: `Linked edwin.gao@sow.org.au's 2025 staff profile to "Edwin Gao"`,
      memberId: ids.edwin,
      subjectEmail: "edwin.gao@sow.org.au",
      detail: "2025 sign-ins at UNSW",
    });

    const again = await t.mutation(internal.memberRepair.linkProfiles, { links, dryRun: false });
    expect(again.linked).toBe(0);
  });
});

describe("replaceRole", () => {
  test("changes a Role only from the expected one, dry run first, and a rerun changes nothing", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const role = await ctx.db.insert("attendanceMetadata", {
        key: "Role",
        type: "select",
        order: 0,
        values: { "2": "Member", "3": "Student Leader", "7": "Staff" },
      });
      return {
        role,
        leader: await ctx.db.insert("attendanceMembers", { name: "Lee Leader", metadata: { [role]: "3", other: "x" } }),
        staff: await ctx.db.insert("attendanceMembers", { name: "Sam Staff", metadata: { [role]: "7" } }),
        member: await ctx.db.insert("attendanceMembers", { name: "Mo Member", metadata: { [role]: "2" } }),
        none: await ctx.db.insert("attendanceMembers", { name: "No Role" }),
        gone: await ctx.db.insert("attendanceMembers", { name: "Gone" }),
      };
    });
    await t.run((ctx) => ctx.db.delete(ids.gone));
    const reason = "stale leader Role on a current staffer";
    const changes = [
      { memberId: ids.leader, from: "Student Leader", to: "Member", reason },
      { memberId: ids.staff, from: "Student Leader", to: "Member", reason },
      { memberId: ids.member, from: "Student Leader", to: "Member", reason },
      { memberId: ids.none, from: "Student Leader", to: "Member", reason },
      { memberId: ids.gone, from: "Student Leader", to: "Member", reason },
      { memberId: ids.leader, from: "Student Leader", to: "Nope", reason },
    ];

    const dry = await t.mutation(internal.memberRepair.replaceRole, { changes });
    expect(dry).toMatchObject({ dryRun: true, changed: 1 });
    expect(dry.results.map((r) => r.status)).toEqual([
      "changed",
      "role differs",
      "already set",
      "role differs",
      "member missing",
      "unknown role",
    ]);
    expect((await t.run((ctx) => ctx.db.get(ids.leader)))?.metadata?.[ids.role]).toBe("3");

    const real = await t.mutation(internal.memberRepair.replaceRole, { changes, dryRun: false });
    expect(real.changed).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(ids.leader)))?.metadata).toEqual({ [ids.role]: "2", other: "x" });
    const log = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actorEmail: "system:role-repair",
      action: "member.update",
      summary: `Changed "Lee Leader"'s Role from Student Leader to Member`,
      memberId: ids.leader,
      detail: reason,
    });

    const again = await t.mutation(internal.memberRepair.replaceRole, { changes, dryRun: false });
    expect(again.changed).toBe(0);
  });

  test("reports an unknown role when there is no Role field", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "No Field" }));
    const result = await t.mutation(internal.memberRepair.replaceRole, {
      changes: [{ memberId: id, from: "Student Leader", to: "Member", reason: "x" }],
    });
    expect(result.results[0].status).toBe("unknown role");
  });
});

describe("flagMergedAway", () => {
  test("flags each record a merge deleted, once, for Insights", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const kept = await ctx.db.insert("attendanceMembers", { name: "Alex Kook" });
      const gone = await ctx.db.insert("attendanceMembers", { name: "Alex K" });
      const alive = await ctx.db.insert("attendanceMembers", { name: "Still Here" });
      await ctx.db.delete(gone);
      const merge = (detail: string | undefined) =>
        ctx.db.insert("attendanceAuditLog", {
          actorEmail: "admin@sow.org.au",
          entityType: "member",
          action: "member.merge",
          summary: 'Merged "Alex K" into "Alex Kook"',
          memberId: kept,
          detail,
        });
      return {
        gone,
        deleted: await merge(`Moved 2 attendance records\nRemoved member "Alex K" (${gone})`),
        stillThere: await merge(`Moved 0 attendance records\nRemoved member "Still Here" (${alive})`),
        linkOnly: await merge("Linked Alex Kook's staff profile to \"Alex K\""),
        bad: await merge('Removed member "X" (not-an-id)'),
      };
    });

    const dry = await t.mutation(internal.memberRepair.flagMergedAway, { since: 0 });
    expect(dry).toMatchObject({ dryRun: true, flagged: 1 });
    expect(Object.fromEntries(dry.results.map((r) => [r.mergeId, r.status]))).toEqual({
      [ids.deleted]: "flagged",
      [ids.stillThere]: "still exists",
      [ids.linkOnly]: "no removed member",
      [ids.bad]: "no removed member",
    });

    const real = await t.mutation(internal.memberRepair.flagMergedAway, { since: 0, dryRun: false });
    expect(real.flagged).toBe(1);
    const flags = await t.run((ctx) =>
      ctx.db
        .query("attendanceAuditLog")
        .withIndex("by_member_and_action", (q) => q.eq("memberId", ids.gone).eq("action", "member.mergedAway"))
        .collect()
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ actorEmail: "system:merge-backfill", detail: `From merge ${ids.deleted}` });

    const again = await t.mutation(internal.memberRepair.flagMergedAway, { since: 0, dryRun: false });
    expect(again.flagged).toBe(0);
    expect(again.results.find((r) => r.mergeId === ids.deleted)?.status).toBe("already flagged");
  });
});
