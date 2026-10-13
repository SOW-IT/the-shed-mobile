import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW_YEAR = staffYearForDate(new Date());
const YEAR = 2027;
const LAST = YEAR - 1;
const ADMIN = "admin@sow.org.au";
const LEAVER = "lee.aver@sow.org.au";
const STAYER = "stay.er@sow.org.au";
const NEWBIE = "new.bie@sow.org.au";
const USYD = "University of Sydney";
const ROLLOVER_ACTOR = "system:staff-rollover";

type ProfileFields = Partial<Omit<Doc<"staffProfiles">, "_id" | "_creationTime">>;

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await t.run(async (ctx) => {
    const adminRow = await ctx.db.insert("attendanceMembers", { name: "Admin" });
    for (const seeded of await ctx.db.query("staffProfiles").collect()) {
      await ctx.db.patch(seeded._id, { memberId: adminRow });
    }
  });
  const fields = await t.run(async (ctx) => ({
    role: await ctx.db.insert("attendanceMetadata", {
      key: "Role",
      type: "select",
      order: 0,
      values: { "1": "Staff", "2": "Student Leader", "3": "Member" },
    }),
    campus: await ctx.db.insert("attendanceMetadata", {
      key: "Campus",
      type: "select",
      order: 1,
      values: { usyd: USYD },
    }),
  }));
  const profile = (email: string, year: number, name?: string, extra: ProfileFields = {}) =>
    t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email,
        year,
        name,
        assignments: [{ role: "Student Leader", university: USYD }],
        ...extra,
      })
    );
  const member = (name: string, metadata?: Record<string, string>) =>
    t.run((ctx) => ctx.db.insert("attendanceMembers", { name, metadata }));
  const getProfile = (id: Id<"staffProfiles">) => t.run((ctx) => ctx.db.get(id));
  const getMember = (id: Id<"attendanceMembers">) => t.run((ctx) => ctx.db.get(id));
  const members = () => t.run((ctx) => ctx.db.query("attendanceMembers").collect());
  const logs = (action: string) =>
    t.run(async (ctx) =>
      (await ctx.db.query("attendanceAuditLog").collect()).filter((l) => l.action === action)
    );
  const snapshot = () =>
    t.run(async (ctx) => ({
      members: await ctx.db.query("attendanceMembers").collect(),
      profiles: await ctx.db.query("staffProfiles").collect(),
      logs: await ctx.db.query("attendanceAuditLog").collect(),
      metadata: await ctx.db.query("attendanceMetadata").collect(),
    }));
  const rollover = (args: { dryRun?: boolean; limit?: number } = {}) =>
    t.mutation(internal.staffLeavers.staffRollover, { year: YEAR, ...args });
  return {
    t,
    fields,
    profile,
    member,
    getProfile,
    getMember,
    members,
    logs,
    snapshot,
    rollover,
  };
}

describe("staffRollover", () => {
  test("links returning staff, creates rows for new staff, and turns leavers into members", async () => {
    const s = await setup();
    const leaverRow = await s.member("Lee Aver");
    const stayerRow = await s.member("Stay Er");
    await s.profile(LEAVER, LAST, "Lee Aver", { memberId: leaverRow });
    await s.profile(STAYER, LAST, "Stay Er", { memberId: stayerRow });
    const returning = await s.profile("stay.er@sowaustralia.com", YEAR, "Stay Er");
    const fresh = await s.profile(NEWBIE, YEAR);
    const idle = await s.profile("una.ssigned@sow.org.au", YEAR, undefined, { assignments: [] });
    const before = await s.snapshot();

    const dry = await s.rollover();
    const expected = {
      year: YEAR,
      linked: 1,
      created: 1,
      left: 1,
      remaining: 0,
      details: [
        { email: NEWBIE, name: "New Bie", action: "created" },
        { email: "stay.er@sowaustralia.com", name: "Stay Er", action: "linked" },
        { email: LEAVER, name: "Lee Aver", action: "left" },
      ],
    };
    expect(dry).toEqual({ dryRun: true, ...expected });
    expect(await s.snapshot()).toEqual(before);

    const real = await s.rollover({ dryRun: false });
    expect(real).toEqual({ dryRun: false, ...expected });

    expect((await s.getProfile(returning))?.memberId).toBe(stayerRow);
    const created = (await s.getProfile(fresh))?.memberId;
    expect(created).toBeDefined();
    expect((await s.getMember(created!))?.name).toBe("New Bie");
    expect((await s.getProfile(idle))?.memberId).toBeUndefined();
    expect(await s.members()).toHaveLength(4);

    const [createLog] = await s.logs("member.create");
    expect(createLog).toMatchObject({
      actorEmail: ROLLOVER_ACTOR,
      memberId: created,
      subjectEmail: NEWBIE,
    });
    const leftLogs = await s.logs("member.leftStaff");
    expect(leftLogs).toHaveLength(1);
    expect(leftLogs[0]).toMatchObject({
      actorEmail: ROLLOVER_ACTOR,
      memberId: leaverRow,
      subjectEmail: LEAVER,
      detail: [
        `Not staff in ${YEAR}`,
        `Campus set to ${USYD}, from their last staff role`,
        "Role set to Member",
      ].join("\n"),
    });
    expect((await s.getMember(leaverRow))?.metadata).toEqual({
      [s.fields.campus]: "usyd",
      [s.fields.role]: "3",
    });
    expect((await s.getMember(stayerRow))?.metadata).toBeUndefined();

    const settled = await s.snapshot();
    const again = await s.rollover({ dryRun: false });
    expect(again).toEqual({
      dryRun: false,
      year: YEAR,
      linked: 0,
      created: 0,
      left: 0,
      remaining: 0,
      details: [],
    });
    expect(await s.snapshot()).toEqual(settled);
  });

  test("a leaver keeps a Campus and Role they already have", async () => {
    const s = await setup();
    const row = await s.member("Lee Aver", { [s.fields.campus]: "other", [s.fields.role]: "1" });
    await s.profile(LEAVER, LAST, "lee aver", { memberId: row });

    await s.rollover({ dryRun: false });
    expect(await s.getMember(row)).toMatchObject({
      name: "Lee Aver",
      metadata: { [s.fields.campus]: "other", [s.fields.role]: "1" },
    });
    expect((await s.logs("member.leftStaff"))[0].detail).toBe(`Not staff in ${YEAR}`);
  });

  test("a next-year profile with no assignments still counts as leaving", async () => {
    const s = await setup();
    const row = await s.member("Lee Aver");
    await s.profile(LEAVER, LAST, "Lee Aver", { memberId: row });
    await s.profile(LEAVER, YEAR, "Lee Aver", { memberId: row, assignments: [] });

    const result = await s.rollover({ dryRun: false });
    expect(result).toMatchObject({ linked: 0, created: 0, left: 1 });
    expect((await s.logs("member.leftStaff")).map((l) => l.memberId)).toEqual([row]);
  });

  test("returning staff are not leavers, matched by member or by either SOW email", async () => {
    const s = await setup();
    const byMember = await s.member("By Member");
    const byEmail = await s.member("By Email");
    await s.profile("by.member@sow.org.au", LAST, "By Member", { memberId: byMember });
    await s.profile("by.member.renamed@sow.org.au", YEAR, "By Member", { memberId: byMember });
    await s.profile("by.email@sowaustralia.com", LAST, "By Email", { memberId: byEmail });
    await s.profile("by.email@sow.org.au", YEAR, "By Email", {
      memberId: await s.member("Another Row"),
    });

    const result = await s.rollover({ dryRun: false });
    expect(result).toMatchObject({ linked: 0, created: 0, left: 0, remaining: 0 });
    expect(await s.logs("member.leftStaff")).toHaveLength(0);
  });

  test("passes over last year's unassigned, unlinked and dangling profiles", async () => {
    const s = await setup();
    const row = await s.member("Una Ssigned");
    const gone = await s.member("Gone");
    await s.t.run((ctx) => ctx.db.delete(gone));
    await s.profile("una.ssigned@sow.org.au", LAST, undefined, { memberId: row, assignments: [] });
    await s.profile("un.linked@sow.org.au", LAST);
    await s.profile("dang.ling@sow.org.au", LAST, undefined, { memberId: gone });

    expect(await s.rollover({ dryRun: false })).toMatchObject({ left: 0, remaining: 0 });
  });

  test("a dangling link on this year's profile is treated as unlinked", async () => {
    const s = await setup();
    const gone = await s.member("Gone");
    await s.t.run((ctx) => ctx.db.delete(gone));
    const profileId = await s.profile(NEWBIE, YEAR, "New Bie", { memberId: gone });

    const result = await s.rollover({ dryRun: false });
    expect(result).toMatchObject({ created: 1, linked: 0 });
    const memberId = (await s.getProfile(profileId))?.memberId;
    expect(memberId).not.toBe(gone);
    expect((await s.getMember(memberId!))?.name).toBe("New Bie");
  });

  test("links this year's profile through an importId when the email changed", async () => {
    const s = await setup();
    const row = await s.member("Jane Doe");
    await s.profile("jane.old@sow.org.au", YEAR - 2, "Jane Doe", { memberId: row, importId: "p-jane" });
    const profileId = await s.profile("jane.new@sow.org.au", YEAR, "Jane Doe", { importId: "p-jane" });

    const result = await s.rollover({ dryRun: false });
    expect(result).toMatchObject({ linked: 1, created: 0, left: 0 });
    expect((await s.getProfile(profileId))?.memberId).toBe(row);
  });

  test("skips a leaver already logged as leaving this staff year, but not one logged in an earlier year", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(staffYearStartMs(YEAR) - 86_400_000));
    const s = await setup();
    const early = await s.member("Early Leaver");
    const before = await s.member("Before Leaver");
    await s.profile("early.leaver@sow.org.au", LAST, "Early Leaver", { memberId: early });
    await s.profile("before.leaver@sow.org.au", LAST, "Before Leaver", { memberId: before });
    const log = (memberId: Id<"attendanceMembers">) =>
      s.t.run((ctx) =>
        ctx.db.insert("attendanceAuditLog", {
          actorEmail: ADMIN,
          entityType: "member",
          action: "member.leftStaff",
          summary: "left",
          memberId,
        })
      );
    await log(before);
    vi.setSystemTime(new Date(staffYearStartMs(YEAR) + 60_000));
    await log(early);

    const result = await s.rollover({ dryRun: false });
    const emails = result.details.map((d) => d.email);
    expect(emails).toContain("before.leaver@sow.org.au");
    expect(emails).not.toContain("early.leaver@sow.org.au");
    const leftLogs = await s.logs("member.leftStaff");
    expect(leftLogs.filter((l) => l.memberId === early)).toHaveLength(1);
    expect(leftLogs.filter((l) => l.memberId === before)).toHaveLength(2);
  });

  test("works through people a batch at a time, staff to link first", async () => {
    const s = await setup();
    for (const name of ["a", "b", "c"]) await s.profile(`new.${name}@sow.org.au`, YEAR);
    for (const name of ["d", "e"]) {
      const memberId = await s.member(`Old ${name}`);
      await s.profile(`old.${name}@sow.org.au`, LAST, undefined, { memberId });
    }
    const actions = (r: { details: { email: string; action: string }[] }) =>
      r.details.map((d) => `${d.action} ${d.email}`);

    const dry = await s.rollover({ limit: 2 });
    expect(dry).toMatchObject({ created: 2, left: 0, remaining: 3 });

    const first = await s.rollover({ dryRun: false, limit: 2 });
    expect(first.remaining).toBe(3);
    expect(actions(first)).toEqual(["created new.a@sow.org.au", "created new.b@sow.org.au"]);
    const second = await s.rollover({ dryRun: false, limit: 2 });
    expect(second.remaining).toBe(1);
    expect(actions(second)).toEqual(["created new.c@sow.org.au", "left old.d@sow.org.au"]);
    const third = await s.rollover({ dryRun: false, limit: 2 });
    expect(third.remaining).toBe(0);
    expect(actions(third)).toEqual(["left old.e@sow.org.au"]);
  });

  test("defaults to a dry run of the current staff year", async () => {
    const s = await setup();
    await s.profile(NEWBIE, NOW_YEAR);
    const result = await s.t.mutation(internal.staffLeavers.staffRollover, {});
    expect(result).toMatchObject({ dryRun: true, year: NOW_YEAR, created: 1 });
    expect(await s.members()).toHaveLength(1);
  });

  test("rejects a limit that isn't a positive whole number", async () => {
    const s = await setup();
    await expect(s.rollover({ limit: 0 })).rejects.toThrow("limit must be a positive whole number.");
    await expect(s.rollover({ limit: 1.5 })).rejects.toThrow("limit must be a positive whole number.");
  });
});

describe("staffRolloverOnOct1", () => {
  test("on 1 October works through everyone, rescheduling itself until done", async () => {
    const s = await setup();
    for (let i = 0; i < 20; i++) {
      await s.profile(`staff.${String(i).padStart(2, "0")}@sow.org.au`, YEAR);
    }
    for (let i = 0; i < 12; i++) {
      const memberId = await s.member(`Leaver ${i}`);
      await s.profile(`leaver.${String(i).padStart(2, "0")}@sow.org.au`, LAST, undefined, {
        memberId,
      });
    }
    vi.useFakeTimers();
    vi.setSystemTime(new Date(staffYearStartMs(YEAR) + 90 * 60_000));
    await s.t.mutation(internal.staffLeavers.staffRolloverOnOct1, {});
    const scheduled = await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].args).toEqual([{ year: YEAR }]);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await s.members()).toHaveLength(33);
    expect(await s.logs("member.create")).toHaveLength(20);
    expect(await s.logs("member.leftStaff")).toHaveLength(12);
    const done = await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(done.map((f) => f.state.kind)).toEqual(["success"]);
  });

  test("does not reschedule when one batch is enough", async () => {
    const s = await setup();
    await s.profile(NEWBIE, YEAR);
    await s.t.mutation(internal.staffLeavers.staffRolloverOnOct1, { year: YEAR });
    expect(await s.members()).toHaveLength(2);
    expect(
      await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())
    ).toHaveLength(0);
  });
});

describe("suspected staffRollover bugs", () => {
  test("a returning staff member linked by importId in the same batch is not also logged as leaving", async () => {
    const s = await setup();
    const row = await s.member("Jane Doe");
    await s.profile("jane.old@sow.org.au", LAST, "Jane Doe", { memberId: row, importId: "p-jane" });
    const renamed = await s.profile("jane.new@sow.org.au", YEAR, "Jane Doe", { importId: "p-jane" });

    const result = await s.rollover({ dryRun: false });
    expect((await s.getProfile(renamed))?.memberId).toBe(row);
    expect(result).toMatchObject({ linked: 1, left: 0 });
    expect(await s.logs("member.leftStaff")).toHaveLength(0);
  });

  test("a leaver with last-year profiles on both SOW domains leaves once", async () => {
    const s = await setup();
    const row = await s.member("Lee Aver");
    await s.profile(LEAVER, LAST, "Lee Aver", { memberId: row });
    await s.profile("lee.aver@sowaustralia.com", LAST, "Lee Aver", { memberId: row });

    const result = await s.rollover({ dryRun: false });
    expect(result.left).toBe(1);
    expect(await s.logs("member.leftStaff")).toHaveLength(1);
  });
});

describe("a staff person's personal email", () => {
  test("is saved beside the staff email, and can't be a staff email", async () => {
    const s = await setup();
    await s.profile(LEAVER, NOW_YEAR, "Lee Aver");
    await s.profile(STAYER, NOW_YEAR, "Stay Er");
    const admin = asUser(s.t, ADMIN);
    const memberId = await admin.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEAVER,
    });
    const save = (personalEmail: string) =>
      admin.mutation(api.attendanceMembers.update, {
        memberId,
        name: "Lee Aver",
        email: LEAVER,
        personalEmail,
        staffYear: NOW_YEAR,
      });

    await save("  Lee@Gmail.com ");
    const got = await admin.query(api.attendanceMembers.get, { memberId, staffYear: NOW_YEAR });
    expect(got).toMatchObject({
      isStaffOverlay: true,
      email: LEAVER,
      personalEmail: "lee@gmail.com",
    });
    const found = await admin.query(api.attendanceMembers.list, {
      year: NOW_YEAR,
      search: "lee@gmail",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(found.page.map((r) => r.key)).toEqual([`staff:${LEAVER}`]);

    await expect(save(STAYER)).rejects.toThrow("is a staff email");
    // Any SOW address is a staff one, even with no profile behind it, and so
    // is their own staff email on the other domain.
    await expect(save("someone.else@sow.org.au")).rejects.toThrow("not a personal one");
    await expect(save("lee.aver@sowaustralia.com")).rejects.toThrow("not a personal one");
    await save("");
    expect(
      (await admin.query(api.attendanceMembers.get, { memberId, staffYear: NOW_YEAR }))
        ?.personalEmail
    ).toBeUndefined();
  });
});

describe("a plain member's email", () => {
  test("can't be a staff email, any year's or any SOW address", async () => {
    const s = await setup();
    await s.profile(LEAVER, LAST, "Lee Aver");
    const admin = asUser(s.t, ADMIN);
    // Creating with an SOW address that isn't anyone's profile.
    await expect(
      admin.mutation(api.attendanceMembers.create, { name: "New Person", email: "new.person@sow.org.au" })
    ).rejects.toThrow("not a personal one");
    const memberId = await admin.mutation(api.attendanceMembers.create, {
      name: "Former Leader",
      email: "former@gmail.com",
    });
    const save = (email: string) =>
      admin.mutation(api.attendanceMembers.update, { memberId, name: "Former Leader", email, staffYear: YEAR });
    // A former leader's old staff email is still a staff email: merge them instead.
    await expect(save(LEAVER)).rejects.toThrow(/staff email/);
    await expect(save("anyone@sowaustralia.com")).rejects.toThrow("not a personal one");
    await save("former.leader@outlook.com");
    expect((await s.members()).find((m) => m._id === memberId)?.email).toBe("former.leader@outlook.com");
  });

  test("one already saved (say from an import) has to be replaced before saving", async () => {
    const s = await setup();
    const admin = asUser(s.t, ADMIN);
    const memberId = await s.t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Imported Person", email: "imported@sowaustralia.com" })
    );
    const save = (email: string) =>
      admin.mutation(api.attendanceMembers.update, { memberId, name: "Imported Person", email, staffYear: YEAR });
    await expect(save("imported@sowaustralia.com")).rejects.toThrow("not a personal one");
    await save("");
    expect((await s.members())[0].email).toBeUndefined();
  });
});
