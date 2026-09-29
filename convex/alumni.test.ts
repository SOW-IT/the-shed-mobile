/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW_YEAR = staffYearForDate(new Date());
// The staff year the leavers are no longer staff in, and the one they left.
const YEAR = 2027;
const LAST = YEAR - 1;
const ADMIN = "admin@sow.org.au";
const LEAVER = "lee.aver@sow.org.au";
const STAYER = "stay.er@sow.org.au";
const USYD = "University of Sydney";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
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
    year: await ctx.db.insert("attendanceMetadata", { key: "Year", type: "input", order: 2 }),
  }));
  const profile = (email: string, year: number, name?: string) =>
    t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email,
        year,
        name,
        assignments: [{ role: "Student Leader", university: USYD }],
      })
    );
  const event = (name: string, at: number) =>
    t.run((ctx) =>
      ctx.db.insert("events", { name, dateStart: at, dateEnd: at + 1, subgroups: [] })
    );
  const signIn = (
    eventId: Id<"events">,
    who: { memberId: Id<"attendanceMembers"> } | { email: string },
    signInTime: number,
    notes?: string
  ) => t.run((ctx) => ctx.db.insert("attendance", { eventId, ...who, signInTime, notes }));
  const members = () => t.run((ctx) => ctx.db.query("attendanceMembers").collect());
  const attendance = () => t.run((ctx) => ctx.db.query("attendance").collect());
  const alumniLogs = async () =>
    (await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect())).filter(
      (l) => l.action === "member.alumni"
    );
  const convert = (args: { dryRun?: boolean; after?: string; limit?: number; email?: string } = {}) =>
    t.mutation(internal.alumni.convertOutgoingStaff, { year: YEAR, ...args });
  return { t, fields, profile, event, signIn, members, attendance, alumniLogs, convert };
}

describe("convertOutgoingStaff", () => {
  test("moves a leaver's sign-ins onto their member record and makes them alumni", async () => {
    const s = await setup();
    await s.profile(LEAVER, LAST, "Lee Aver");
    await s.profile(STAYER, LAST, "Stay Er");
    await s.profile(STAYER, YEAR, "Stay Er");
    const row = await s.t.run((ctx) =>
      ctx.db.insert("attendanceMembers", {
        name: "Lee Aver",
        email: LEAVER,
        personalEmail: "lee@gmail.com",
        metadata: { [s.fields.year]: "2024" },
      })
    );
    const stayerRow = await s.t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Stay Er", email: STAYER })
    );
    const e1 = await s.event("e1", 1_000);
    const e2 = await s.event("e2", 2_000);
    const e3 = await s.event("e3", 3_000);
    // Under the legacy spelling of their staff email, too.
    await s.signIn(e1, { email: "lee.aver@sowaustralia.com" }, 1_100);
    await s.signIn(e2, { email: LEAVER }, 2_200, "late");
    await s.signIn(e2, { memberId: row }, 2_100, "early");
    await s.signIn(e3, { memberId: row }, 3_100);
    await s.signIn(e1, { email: STAYER }, 1_200);

    const dry = await s.convert();
    expect(dry).toMatchObject({
      dryRun: true,
      year: YEAR,
      people: 1,
      recordsMoved: 1,
      recordsCombined: 1,
      rowsFolded: 0,
      next: null,
    });
    expect(dry.details[0]).toMatchObject({
      staffEmail: LEAVER,
      name: "Lee Aver",
      email: "lee@gmail.com",
    });
    expect((await s.members()).find((m) => m._id === row)?.email).toBe(LEAVER);
    expect(await s.alumniLogs()).toHaveLength(0);

    await s.convert({ dryRun: false });

    const converted = (await s.members()).find((m) => m._id === row)!;
    expect(converted.email).toBe("lee@gmail.com");
    expect(converted.personalEmail).toBeUndefined();
    const roleField = await s.t.run((ctx) => ctx.db.get(s.fields.role));
    const alumniId = Object.entries(roleField!.values!).find(([, l]) => l === "Alumni")![0];
    expect(converted.metadata).toEqual({
      [s.fields.year]: "2024",
      [s.fields.campus]: "usyd",
      [s.fields.role]: alumniId,
    });

    const records = await s.attendance();
    const leavers = records.filter((r) => r.memberId === row);
    expect(leavers).toHaveLength(3);
    expect(leavers.every((r) => r.email === undefined)).toBe(true);
    expect(leavers.find((r) => r.eventId === e2)).toMatchObject({
      signInTime: 2_100,
      notes: "early\nlate",
    });
    // Someone still on staff is left exactly as they were.
    expect(records.find((r) => r.email === STAYER)).toBeDefined();
    expect((await s.members()).find((m) => m._id === stayerRow)?.email).toBe(STAYER);

    const [log] = await s.alumniLogs();
    expect(log).toMatchObject({
      summary: 'Moved "Lee Aver" to alumni',
      memberId: row,
      subjectEmail: LEAVER,
    });
    expect(log.detail).toContain("Email is now lee@gmail.com");
    expect(log.detail).toContain("Moved 1 sign-in onto their member record");

    const again = await s.convert({ dryRun: false });
    expect(again.people).toBe(0);
    expect(await s.alumniLogs()).toHaveLength(1);
  });

  test("the app shows them as a plain member with their own email", async () => {
    const s = await setup();
    await s.profile(LEAVER, LAST, "Lee Aver");
    const row = await s.t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Lee Aver", email: LEAVER })
    );
    await s.convert({ dryRun: false });
    const admin = asUser(s.t, ADMIN);

    const got = await admin.query(api.attendanceMembers.get, { memberId: row, staffYear: YEAR });
    expect(got).toMatchObject({ isStaffOverlay: false, name: "Lee Aver" });
    // No personal email was on record, so it is empty rather than the staff one.
    expect(got?.email).toBeUndefined();

    const list = await admin.query(api.attendanceMembers.list, {
      year: YEAR,
      search: "lee aver",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(list.page).toEqual([
      expect.objectContaining({ key: `member:${row}`, kind: "member", subtitle: "Alumni" }),
    ]);
    expect(list.page[0].email).toBeUndefined();
  });

  test("gives a leaver with only staff sign-ins a member record, and folds duplicates", async () => {
    const s = await setup();
    await s.profile(LEAVER, LAST);
    const e1 = await s.event("e1", 1_000);
    await s.signIn(e1, { email: LEAVER }, 1_100);
    const lonely = "no.row@sow.org.au";
    await s.profile(lonely, LAST, "No Row");
    await s.signIn(e1, { email: lonely }, 1_200);
    const [kept, dup] = await s.t.run(async (ctx) => [
      await ctx.db.insert("attendanceMembers", { name: LEAVER, email: LEAVER }),
      await ctx.db.insert("attendanceMembers", {
        name: "Lee",
        email: LEAVER,
        personalEmail: "lee@gmail.com",
        metadata: { [s.fields.year]: "2023" },
      }),
    ]);
    await s.signIn(e1, { memberId: dup }, 1_050);

    const result = await s.convert({ dryRun: false });
    expect(result).toMatchObject({ people: 2, rowsFolded: 1, recordsCombined: 1 });

    const rows = await s.members();
    expect(rows.find((m) => m._id === dup)).toBeUndefined();
    // A name that was only the email becomes a readable one.
    expect(rows.find((m) => m._id === kept)).toMatchObject({
      name: "Lee Aver",
      email: "lee@gmail.com",
      metadata: expect.objectContaining({ [s.fields.year]: "2023" }),
    });
    const created = rows.find((m) => m.name === "No Row")!;
    expect(created.email).toBeUndefined();
    const records = await s.attendance();
    expect(records.find((r) => r.memberId === kept)?.signInTime).toBe(1_050);
    expect(records.find((r) => r.memberId === created._id)?.signInTime).toBe(1_200);
    expect(records.some((r) => r.email)).toBe(false);
  });

  test("leaves out anyone staff again in a later year, and people with nothing to move", async () => {
    const s = await setup();
    const back = "back.later@sow.org.au";
    await s.profile(back, LAST);
    await s.profile(back, YEAR + 1);
    await s.t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Back", email: back }));
    await s.profile("nothing@sow.org.au", LAST);
    const result = await s.convert({ dryRun: false });
    expect(result.people).toBe(0);
    expect((await s.members())[0].email).toBe(back);
  });

  test("pages through leavers, and can be limited to one person", async () => {
    const s = await setup();
    for (const who of ["a.one", "b.two", "c.three"]) {
      const email = `${who}@sow.org.au`;
      await s.profile(email, LAST);
      await s.t.run((ctx) => ctx.db.insert("attendanceMembers", { name: who, email }));
    }
    const only = await s.convert({ email: "B.TWO@sowaustralia.com" });
    expect(only.details.map((d) => d.staffEmail)).toEqual(["b.two@sow.org.au"]);

    // Other leavers (like the seeded admin, on a date before the rollover)
    // take batch slots too, so follow `next` to the end.
    const first = await s.convert({ dryRun: false, limit: 2 });
    expect(first.next).not.toBeNull();
    const converted = first.details.map((d) => d.staffEmail);
    let next = first.next;
    while (next) {
      const page = await s.convert({ dryRun: false, limit: 2, after: next });
      converted.push(...page.details.map((d) => d.staffEmail));
      next = page.next;
    }
    expect(converted).toEqual(["a.one@sow.org.au", "b.two@sow.org.au", "c.three@sow.org.au"]);
  });

  test("uses an existing Alumni option rather than adding another", async () => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.patch(s.fields.role, { values: { "1": "Staff", "8": "alumni" } })
    );
    await s.profile(LEAVER, LAST);
    const row = await s.t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Lee", email: LEAVER })
    );
    await s.convert({ dryRun: false });
    const roleField = await s.t.run((ctx) => ctx.db.get(s.fields.role));
    expect(Object.keys(roleField!.values!)).toEqual(["1", "8"]);
    expect((await s.members()).find((m) => m._id === row)?.metadata).toMatchObject({
      [s.fields.role]: "8",
    });
  });

  test("still converts when there is no Role field", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.delete(s.fields.role));
    await s.profile(LEAVER, LAST);
    await s.t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Lee", email: LEAVER })
    );
    expect((await s.convert({ dryRun: false })).people).toBe(1);
  });

  test("rejects a limit that isn't a positive whole number", async () => {
    const s = await setup();
    await expect(s.convert({ limit: 0 })).rejects.toThrow("limit must be a positive whole number.");
  });
});

describe("convertOutgoingStaffOnRollover", () => {
  test("on 1 October converts every leaver, a batch at a time", async () => {
    const s = await setup();
    for (let i = 0; i < 12; i++) {
      const email = `leaver.${String(i).padStart(2, "0")}@sow.org.au`;
      await s.profile(email, LAST);
      await s.t.run((ctx) => ctx.db.insert("attendanceMembers", { name: `L ${i}`, email }));
    }
    vi.useFakeTimers();
    vi.setSystemTime(new Date(staffYearStartMs(YEAR) + 90 * 60_000));
    try {
      await s.t.mutation(internal.alumni.convertOutgoingStaffOnRollover, {});
      await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    const rows = await s.members();
    expect(rows.every((m) => m.email === undefined)).toBe(true);
    expect(await s.alumniLogs()).toHaveLength(12);
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
    await save("");
    expect(
      (await admin.query(api.attendanceMembers.get, { memberId, staffYear: NOW_YEAR }))
        ?.personalEmail
    ).toBeUndefined();
  });
});
