/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate, sydneyCalendarYear } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const OTHER_LEADER = "other.leader@sow.org.au";
const USYD = "University of Sydney";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  for (const email of [LEADER, OTHER_LEADER]) {
    await admin.mutation(api.admin.setStaffProfile, {
      email,
      year: YEAR,
      roles: ["Student Leader"],
      university: USYD,
    });
  }
  const { yearField, campusField } = await t.run(async (ctx) => ({
    yearField: await ctx.db.insert("attendanceMetadata", {
      key: "Year",
      type: "input",
      order: 0,
    }),
    campusField: await ctx.db.insert("attendanceMetadata", {
      key: "Campus",
      type: "select",
      order: 1,
      values: { usyd: USYD, unsw: "UNSW" },
    }),
  }));
  const event = (name: string, dateStart: number) =>
    t.run((ctx) =>
      ctx.db.insert("events", {
        name,
        dateStart,
        dateEnd: dateStart + 3_600_000,
        subgroups: [],
      })
    );
  const member = (name: string, metadata: Record<string, string> = {}, email?: string) =>
    t.run((ctx) => ctx.db.insert("attendanceMembers", { name, metadata, email }));
  const signIn = (
    eventId: Id<"events">,
    who: { memberId: Id<"attendanceMembers"> } | { email: string },
    signInTime: number,
    notes?: string
  ) => t.run((ctx) => ctx.db.insert("attendance", { eventId, ...who, signInTime, notes }));
  const attendance = () => t.run((ctx) => ctx.db.query("attendance").collect());
  const audit = () => t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
  return {
    t,
    leader: asUser(t, LEADER),
    yearField,
    campusField,
    event,
    member,
    signIn,
    attendance,
    audit,
  };
}

describe("merging a member into another member", () => {
  test("moves attendance, combines shared events and fills in missing details", async () => {
    const s = await setup();
    const keep = await s.member("Jeremy Lim", { [s.yearField]: "1" });
    const dup = await s.member(
      "Jez Lim",
      { [s.yearField]: "2", [s.campusField]: "unsw" },
      "Jez@Example.com"
    );
    const onlyDup = await s.event("S2W1", 1_000);
    const both = await s.event("S2W2", 2_000);
    const onlyKeep = await s.event("S2W3", 3_000);
    await s.signIn(onlyDup, { memberId: dup }, 1_100, "brought a friend");
    await s.signIn(both, { memberId: keep }, 2_200, "late");
    await s.signIn(both, { memberId: dup }, 2_100, "left early");
    await s.signIn(onlyKeep, { memberId: keep }, 3_100);

    const preview = await s.leader.query(api.attendanceMembers.mergePreview, {
      removeId: dup,
      keep: { memberId: keep },
    });
    if (!preview || "blocked" in preview) throw new Error("expected a preview");
    expect(preview.keep.kind).toBe("member");
    expect(preview.attendance).toEqual({ total: 2, shared: 1, moved: 1 });
    expect(preview.conflicts.map((c) => c.field)).toEqual(["name", s.yearField]);
    // Each side's own history, so the leader can see which record was used more.
    expect(preview.keep.history).toEqual({ events: 2, lastAttended: 3_100 });
    expect(preview.remove.history).toEqual({ events: 2, lastAttended: 2_100 });

    const result = await s.leader.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { memberId: keep },
      resolutions: { [s.yearField]: "remove" },
    });
    expect(result).toEqual({ moved: 1, combined: 1 });

    const kept = await s.t.run((ctx) => ctx.db.get(keep));
    expect(kept).toMatchObject({
      name: "Jeremy Lim",
      email: "jez@example.com",
      metadata: { [s.yearField]: "2", [s.campusField]: "unsw" },
    });
    expect(await s.t.run((ctx) => ctx.db.get(dup))).toBeNull();

    const rows = await s.attendance();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.memberId === keep)).toBe(true);
    const shared = rows.find((r) => r.eventId === both)!;
    expect(shared.signInTime).toBe(2_100);
    expect(shared.notes).toBe("late\nleft early");
    expect(rows.find((r) => r.eventId === onlyDup)!.signInTime).toBe(1_100);

    const log = (await s.audit()).find((r) => r.action === "member.merge")!;
    expect(log).toMatchObject({
      actorEmail: LEADER,
      memberId: keep,
      summary: 'Merged "Jez Lim" into "Jeremy Lim"',
    });
    expect(log.detail).toContain("Moved 1 attendance record; combined 1 event");
    expect(log.detail).toContain(dup);
  });

  test("refuses to merge a person with themselves", async () => {
    const s = await setup();
    const keep = await s.member("Jeremy Lim");
    expect(
      await s.leader.query(api.attendanceMembers.mergePreview, {
        removeId: keep,
        keep: { memberId: keep },
      })
    ).toEqual({ blocked: "Pick two different people to merge." });
  });

  test("reports people who no longer exist", async () => {
    const s = await setup();
    const keep = await s.member("Jeremy Lim");
    const gone = await s.member("Gone");
    await s.t.run((ctx) => ctx.db.delete(gone));
    expect(
      await s.leader.query(api.attendanceMembers.mergePreview, {
        removeId: gone,
        keep: { memberId: keep },
      })
    ).toEqual({ blocked: "That member no longer exists." });
    expect(
      await s.leader.query(api.attendanceMembers.mergePreview, {
        removeId: keep,
        keep: { memberId: gone },
      })
    ).toEqual({ blocked: "The person to keep no longer exists." });
    await expect(
      s.leader.mutation(api.attendanceMembers.merge, {
        removeId: gone,
        keep: { memberId: keep },
        resolutions: {},
      })
    ).rejects.toThrow("That member no longer exists.");
  });

  test("the preview is empty for signed-out callers", async () => {
    const s = await setup();
    const keep = await s.member("A");
    const dup = await s.member("B");
    expect(
      await s.t.query(api.attendanceMembers.mergePreview, {
        removeId: dup,
        keep: { memberId: keep },
      })
    ).toBeNull();
  });
});

describe("merging a member into staff", () => {
  test("turns the member's attendance into staff sign-ins and keeps the staff identity", async () => {
    const s = await setup();
    const dup = await s.member(
      "Leader Nickname",
      { [s.yearField]: "3", [s.campusField]: "unsw" },
      "personal@gmail.com"
    );
    const onlyDup = await s.event("S2W1", 1_000);
    const both = await s.event("S2W2", 2_000);
    await s.signIn(onlyDup, { memberId: dup }, 1_100);
    await s.signIn(both, { email: LEADER }, 2_200);
    await s.signIn(both, { memberId: dup }, 2_100, "helped set up");

    const preview = await s.leader.query(api.attendanceMembers.mergePreview, {
      removeId: dup,
      keep: { staffEmail: LEADER.toUpperCase() },
      staffYear: YEAR,
    });
    if (!preview || "blocked" in preview) throw new Error("expected a preview");
    expect(preview.keep).toMatchObject({ kind: "staff", email: LEADER });
    // Name, email and campus are locked to the staff profile.
    expect(preview.conflicts).toEqual([]);
    expect(preview.attendance).toEqual({ total: 2, shared: 1, moved: 1 });
    expect(preview.keep.history).toEqual({ events: 1, lastAttended: 2_200 });
    expect(preview.remove.history).toEqual({ events: 2, lastAttended: 2_100 });

    await s.leader.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { staffEmail: LEADER },
      resolutions: { name: "remove", email: "remove" },
      staffYear: YEAR,
    });

    const rows = await s.attendance();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.email === LEADER && r.memberId === undefined)).toBe(true);
    const shared = rows.find((r) => r.eventId === both)!;
    expect(shared).toMatchObject({ signInTime: 2_100, notes: "helped set up" });

    const members = await s.t.run((ctx) => ctx.db.query("attendanceMembers").collect());
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      email: LEADER,
      metadata: { [s.yearField]: "3", [s.campusField]: "usyd" },
    });
    const log = (await s.audit()).find((r) => r.action === "member.merge")!;
    expect(log).toMatchObject({ memberId: members[0]._id, subjectEmail: LEADER });
    expect(log.summary).toContain('into staff "');
  });

  test("uses the staff person's existing overlay row", async () => {
    const s = await setup();
    const shadow = await s.leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    const dup = await s.member("Leader Nickname", { [s.yearField]: "3" });
    const ev = await s.event("S2W1", 1_000);
    const other = await s.event("S2W2", 2_000);
    // An older member-keyed sign-in on the overlay still counts as "both there".
    await s.signIn(ev, { memberId: shadow }, 1_200);
    await s.signIn(ev, { memberId: dup }, 1_100);
    await s.signIn(other, { memberId: dup }, 2_100);

    await s.leader.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { memberId: shadow },
      resolutions: {},
    });

    const rows = await s.attendance();
    expect(rows).toHaveLength(2);
    // The overlay's own sign-in is folded onto the staff email too.
    const folded = rows.find((r) => r.eventId === ev)!;
    expect(folded).toMatchObject({ email: LEADER, signInTime: 1_100 });
    expect(folded.memberId).toBeUndefined();
    expect(rows.find((r) => r.eventId === other)).toMatchObject({ email: LEADER });
    expect(await s.t.run((ctx) => ctx.db.get(shadow))).toMatchObject({
      metadata: expect.objectContaining({ [s.yearField]: "3" }),
    });
  });

  test("a staff merge leaves one record per event even if the staff person was already split", async () => {
    const s = await setup();
    const shadow = await s.leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    const dup = await s.member("Leader Nickname");
    const both = await s.event("Split already", 1_000);
    const shadowOnly = await s.event("Overlay only", 2_000);
    await s.signIn(both, { email: LEADER }, 1_300, "by email");
    await s.signIn(both, { memberId: shadow }, 1_200, "by overlay");
    await s.signIn(both, { memberId: dup }, 1_100);
    await s.signIn(shadowOnly, { memberId: shadow }, 2_100);

    await s.leader.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { memberId: shadow },
      resolutions: {},
    });

    const rows = await s.attendance();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.email === LEADER && r.memberId === undefined)).toBe(true);
    expect(rows.find((r) => r.eventId === both)).toMatchObject({
      signInTime: 1_100,
      notes: "by email\nby overlay",
    });
    const log = (await s.audit()).find((r) => r.action === "member.merge")!;
    expect(log.detail).toContain("Also moved 2 of");
  });

  test("always leaves the staff person an overlay row, so older events keep a name", async () => {
    const s = await setup();
    const dup = await s.member("Leader Nickname");
    const before = await s.event("Before they were staff", 1_000);
    await s.signIn(before, { memberId: dup }, 1_100);
    await s.leader.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { staffEmail: LEADER },
      resolutions: {},
    });
    const members = await s.t.run((ctx) => ctx.db.query("attendanceMembers").collect());
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ email: LEADER });
    const log = (await s.audit()).find((r) => r.action === "member.merge")!;
    expect(log.memberId).toBe(members[0]._id);
  });

  test("counts the staff person's history from both email and overlay sign-ins", async () => {
    const s = await setup();
    const shadow = await s.leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    const dup = await s.member("Leader Nickname");
    const a = await s.event("A", 1_000);
    const b = await s.event("B", 2_000);
    await s.signIn(a, { email: LEADER }, 1_100);
    await s.signIn(b, { memberId: shadow }, 2_100);
    const preview = await s.leader.query(api.attendanceMembers.mergePreview, {
      removeId: dup,
      keep: { memberId: shadow },
    });
    if (!preview || "blocked" in preview) throw new Error("expected a preview");
    expect(preview.keep.history).toEqual({ events: 2, lastAttended: 2_100 });
    expect(preview.remove.history).toEqual({ events: 0, lastAttended: null });
  });

  test("an unknown staff email is blocked", async () => {
    const s = await setup();
    const dup = await s.member("Someone");
    expect(
      await s.leader.query(api.attendanceMembers.mergePreview, {
        removeId: dup,
        keep: { staffEmail: "nobody@sow.org.au" },
      })
    ).toEqual({ blocked: "Staff profile not found." });
  });
});

describe("staff can't be merged away", () => {
  test("staff into staff is blocked", async () => {
    const s = await setup();
    const shadow = await s.leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: OTHER_LEADER,
    });
    const preview = await s.leader.query(api.attendanceMembers.mergePreview, {
      removeId: shadow,
      keep: { staffEmail: LEADER },
    });
    expect(preview).toMatchObject({ blocked: expect.stringContaining("is staff") });
    await expect(
      s.leader.mutation(api.attendanceMembers.merge, {
        removeId: shadow,
        keep: { staffEmail: LEADER },
        resolutions: {},
      })
    ).rejects.toThrow("can't be merged away");
  });

  test("staff into a member is blocked", async () => {
    const s = await setup();
    const shadow = await s.leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    const keep = await s.member("Someone");
    expect(
      await s.leader.query(api.attendanceMembers.mergePreview, {
        removeId: shadow,
        keep: { memberId: keep },
      })
    ).toMatchObject({ blocked: expect.stringContaining("is staff") });
  });

  test("a staff overlay row passed as the person to keep counts as staff", async () => {
    const s = await setup();
    const dup = await s.member("Leader", {}, "someone@x.com");
    const shadow = await s.leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    expect(
      await s.leader.query(api.attendanceMembers.mergePreview, {
        removeId: dup,
        keep: { memberId: shadow },
      })
    ).toMatchObject({ keep: { kind: "staff" } });
  });
});

describe("deletePreview", () => {
  test("lists every event the member will be removed from, newest first", async () => {
    const s = await setup();
    const m = await s.member("Jeremy Lim");
    const first = await s.event("S2W1", 1_000);
    const second = await s.event("S2W2", 2_000);
    await s.signIn(first, { memberId: m }, 1_100);
    await s.signIn(second, { memberId: m }, 2_100);
    await s.t.run((ctx) => ctx.db.delete(second));

    const preview = await s.leader.query(api.attendanceMembers.deletePreview, {
      memberId: m,
    });
    expect(preview?.total).toBe(2);
    expect(preview?.events.map((e) => [e.name, e.dateStart])).toEqual([
      ["Deleted event", 2_100],
      ["S2W1", 1_000],
    ]);
  });

  test("is empty for missing members and signed-out callers", async () => {
    const s = await setup();
    const m = await s.member("Jeremy Lim");
    expect(
      await s.t.query(api.attendanceMembers.deletePreview, { memberId: m })
    ).toBeNull();
    await s.t.run((ctx) => ctx.db.delete(m));
    expect(
      await s.leader.query(api.attendanceMembers.deletePreview, { memberId: m })
    ).toBeNull();
  });

  test("the delete audit entry records which member was removed", async () => {
    const s = await setup();
    const m = await s.member("Jeremy Lim");
    expect(await asUser(s.t, ADMIN).mutation(api.attendanceMembers.remove, { memberId: m })).toBe(true);
    const log = (await s.audit()).find((r) => r.action === "member.delete");
    expect(log?.memberId).toBe(m);
    // Deleting again (someone else got there first) reports nothing was removed.
    expect(await asUser(s.t, ADMIN).mutation(api.attendanceMembers.remove, { memberId: m })).toBe(false);
  });
});

describe("a staff email on a member points to Merge", () => {
  test("update refuses to relabel a plain member as staff", async () => {
    const s = await setup();
    const m = await s.member("Leader Nickname");
    await expect(
      s.leader.mutation(api.attendanceMembers.update, {
        memberId: m,
        name: "Leader Nickname",
        email: LEADER.toUpperCase(),
      })
    ).rejects.toThrow(/staff email\. Use Merge instead/);
    // Other emails, and staff rows keeping their own email, still save.
    await s.leader.mutation(api.attendanceMembers.update, {
      memberId: m,
      name: "Leader Nickname",
      email: "personal@gmail.com",
    });
    const shadow = await s.leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    await s.leader.mutation(api.attendanceMembers.update, {
      memberId: shadow,
      name: "ignored",
      email: LEADER,
    });
  });

  test("a new member can't take a staff email, even a former staff member's", async () => {
    const s = await setup();
    await expect(
      s.leader.mutation(api.attendanceMembers.create, { name: "Leader", email: LEADER })
    ).rejects.toThrow(/staff email\. They're already in the list as staff/);
    // Staff in an old year only are still staff: their attendance uses that email.
    await s.t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "former@sow.org.au",
        year: YEAR - 4,
        name: "Former Staff",
        assignments: [],
      })
    );
    await expect(
      s.leader.mutation(api.attendanceMembers.create, {
        name: "Former",
        email: "FORMER@sowaustralia.com",
      })
    ).rejects.toThrow(/Former Staff's staff email/);
    // Any other email, even one another member has, is fine.
    await s.member("Someone", {}, "shared@gmail.com");
    await s.leader.mutation(api.attendanceMembers.create, {
      name: "Someone Else",
      email: "shared@gmail.com",
    });
  });

  test("a member can be merged into former staff, and former staff can't be merged away", async () => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "former@sow.org.au",
        year: YEAR - 4,
        name: "Former Staff",
        assignments: [],
      })
    );
    const dup = await s.member("Former Nickname");
    const preview = await s.leader.query(api.attendanceMembers.mergePreview, {
      removeId: dup,
      keep: { staffEmail: "former@sow.org.au" },
    });
    expect(preview).toMatchObject({ keep: { kind: "staff", name: "Former Staff" } });
    const overlay = await s.t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Former Staff", email: "former@sow.org.au" })
    );
    const plain = await s.member("Plain");
    expect(
      await s.leader.query(api.attendanceMembers.mergePreview, {
        removeId: overlay,
        keep: { memberId: plain },
      })
    ).toMatchObject({ blocked: expect.stringContaining("is staff") });
  });

  test("only admins can delete a member", async () => {
    const s = await setup();
    const m = await s.member("Jeremy Lim");
    await expect(
      s.leader.mutation(api.attendanceMembers.remove, { memberId: m })
    ).rejects.toThrow(/Only admins/);
    expect(await s.t.run((ctx) => ctx.db.get(m))).not.toBeNull();
    expect(
      await asUser(s.t, ADMIN).mutation(api.attendanceMembers.remove, { memberId: m })
    ).toBe(true);
  });

  test("staffForEmail names the staff person an email belongs to", async () => {
    const s = await setup();
    expect(
      await s.leader.query(api.attendanceMembers.staffForEmail, { email: LEADER })
    ).toMatchObject({ email: LEADER });
    expect(
      await s.leader.query(api.attendanceMembers.staffForEmail, { email: "x@gmail.com" })
    ).toBeNull();
    expect(
      await s.leader.query(api.attendanceMembers.staffForEmail, { email: "not an email" })
    ).toBeNull();
    expect(
      await s.t.query(api.attendanceMembers.staffForEmail, { email: LEADER })
    ).toBeNull();
  });
});

describe("choosing which metadata stays", () => {
  const NOW = sydneyCalendarYear(new Date());

  async function withFields() {
    const s = await setup();
    // setup()'s plain "Year" input would clash with the real Year select below.
    await s.t.run((ctx) => ctx.db.patch(s.yearField, { key: "Notes" }));
    const f = await s.t.run(async (ctx) => ({
      studentYear: await ctx.db.insert("attendanceMetadata", {
        key: "Year",
        type: "select",
        order: 10,
        values: { y1: "1", y2: "2", y3: "3" },
      }),
      gender: await ctx.db.insert("attendanceMetadata", {
        key: "Gender",
        type: "select",
        order: 11,
        values: { m: "Male", f: "Female" },
      }),
      diet: await ctx.db.insert("attendanceMetadata", {
        key: "Dietary",
        type: "input",
        order: 12,
      }),
    }));
    return { ...s, f };
  }

  test("values stored differently but shown the same aren't offered as a choice", async () => {
    const s = await withFields();
    // "y2" is a legacy option id; NOW-1 is the commencement year. Both read "2".
    const keep = await s.member("Jeremy Lim", { [s.f.studentYear]: "y2", [s.f.gender]: "m" });
    const dup = await s.member("Jeremy Lim", {
      [s.f.studentYear]: String(NOW - 1),
      [s.f.gender]: "Male",
    });
    const preview = await s.leader.query(api.attendanceMembers.mergePreview, {
      removeId: dup,
      keep: { memberId: keep },
    });
    if (!preview || "blocked" in preview) throw new Error("expected a preview");
    expect(preview.conflicts).toEqual([]);
    await s.leader.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { memberId: keep },
      // Even a stray "remove" can't swap an equivalent value.
      resolutions: { [s.f.studentYear]: "remove", [s.f.gender]: "remove" },
    });
    expect((await s.t.run((ctx) => ctx.db.get(keep)))?.metadata).toEqual({
      [s.f.studentYear]: "y2",
      [s.f.gender]: "m",
    });
  });

  test("each conflicting field keeps whichever side the leader picked", async () => {
    const s = await withFields();
    const keep = await s.member(
      "Jeremy Lim",
      {
        [s.f.studentYear]: String(NOW - 1),
        [s.f.gender]: "m",
        [s.f.diet]: "none",
        [s.campusField]: "usyd",
      },
      "jeremy@uni.edu"
    );
    const dup = await s.member(
      "Jez Lim",
      {
        [s.f.studentYear]: String(NOW - 2),
        [s.f.gender]: "f",
        [s.f.diet]: "vegan",
        [s.campusField]: "unsw",
        [s.yearField]: "note from dup",
      },
      "jez@gmail.com"
    );
    const preview = await s.leader.query(api.attendanceMembers.mergePreview, {
      removeId: dup,
      keep: { memberId: keep },
    });
    if (!preview || "blocked" in preview) throw new Error("expected a preview");
    expect(preview.conflicts.map((c) => c.label)).toEqual([
      "Name",
      "Email",
      "Campus",
      "Year",
      "Gender",
      "Dietary",
    ]);

    await s.leader.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { memberId: keep },
      resolutions: {
        name: "keep",
        email: "remove",
        [s.f.studentYear]: "remove",
        [s.f.gender]: "keep",
        [s.f.diet]: "remove",
        // campus left out: defaults to the kept person's value
      },
    });

    expect(await s.t.run((ctx) => ctx.db.get(keep))).toMatchObject({
      name: "Jeremy Lim",
      email: "jez@gmail.com",
      metadata: {
        [s.f.studentYear]: String(NOW - 2),
        [s.f.gender]: "m",
        [s.f.diet]: "vegan",
        [s.campusField]: "usyd",
        // A blank on the kept side is filled without asking.
        [s.yearField]: "note from dup",
      },
    });
    const log = (await s.audit()).find((r) => r.action === "member.merge")!;
    expect(log.detail).toContain('Took from "Jez Lim": Email, Notes, Year, Dietary');
  });

  test("merging into staff offers only the fields staff can change", async () => {
    const s = await withFields();
    const shadow = await s.leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    await s.t.run((ctx) =>
      ctx.db.patch(shadow, {
        metadata: { [s.f.diet]: "none", [s.f.gender]: "m", [s.campusField]: "usyd" },
      })
    );
    const dup = await s.member("Leader Nickname", {
      [s.f.diet]: "halal",
      [s.f.gender]: "f",
      [s.campusField]: "unsw",
    });
    const preview = await s.leader.query(api.attendanceMembers.mergePreview, {
      removeId: dup,
      keep: { memberId: shadow },
    });
    if (!preview || "blocked" in preview) throw new Error("expected a preview");
    // Name, email and campus come from the staff profile, so aren't offered.
    expect(preview.conflicts.map((c) => c.label)).toEqual(["Gender", "Dietary"]);

    await s.leader.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { memberId: shadow },
      resolutions: { [s.f.diet]: "remove", [s.campusField]: "remove", name: "remove" },
    });
    const row = await s.t.run((ctx) => ctx.db.get(shadow));
    expect(row?.metadata?.[s.f.diet]).toBe("halal");
    expect(row?.metadata?.[s.f.gender]).toBe("m");
    expect(row?.metadata?.[s.campusField]).toBe("usyd");
    expect(row?.email).toBe(LEADER);
  });
});
