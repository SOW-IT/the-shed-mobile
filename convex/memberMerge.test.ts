/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
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
    expect(rows.find((r) => r.eventId === ev)).toMatchObject({
      memberId: shadow,
      signInTime: 1_100,
    });
    expect(rows.find((r) => r.eventId === other)).toMatchObject({ email: LEADER });
    expect(await s.t.run((ctx) => ctx.db.get(shadow))).toMatchObject({
      metadata: expect.objectContaining({ [s.yearField]: "3" }),
    });
  });

  test("doesn't create an overlay row when the member had no details to carry", async () => {
    const s = await setup();
    const dup = await s.member("Leader Nickname");
    await s.leader.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { staffEmail: LEADER },
      resolutions: {},
    });
    expect(
      await s.t.run((ctx) => ctx.db.query("attendanceMembers").collect())
    ).toEqual([]);
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
    ).rejects.toThrow("Staff can't be merged into someone else");
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
    await s.leader.mutation(api.attendanceMembers.remove, { memberId: m });
    const log = (await s.audit()).find((r) => r.action === "member.delete");
    expect(log?.memberId).toBe(m);
  });
});
