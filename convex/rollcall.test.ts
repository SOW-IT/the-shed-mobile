/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { ALL_SUBGROUP, SOW_SUBGROUP } from "../shared/rollcall";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au"; // Student Leader at USYD
const STAFF = "staff@sow.org.au"; // department staff (no campus)
const OUTSIDER = "outsider@sow.org.au"; // signed in but no staff profile

const USYD = "University of Sydney";
const MACQ = "Macquarie University";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: MACQ });
  await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Ministry" });
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Missions",
    division: "Ministry",
  });
  await admin.mutation(api.admin.setStaffProfile, {
    email: LEADER,
    year: YEAR,
    roles: ["Student Leader"],
    university: USYD,
  });
  await admin.mutation(api.admin.setStaffProfile, {
    email: STAFF,
    year: YEAR,
    roles: ["Staff"],
    department: "Missions",
  });
  return t;
}

const window = () => ({ dateStart: Date.now(), dateEnd: Date.now() + 3600_000 });

describe("subgroups", () => {
  test("lists ALL plus the year's campuses, sorted", async () => {
    const t = await setup();
    const subgroups = await asUser(t, LEADER).query(api.events.subgroups, {});
    // SOW is always first; the campuses follow, alphabetically sorted.
    expect(subgroups[0]).toBe(SOW_SUBGROUP);
    expect(ALL_SUBGROUP).toBe(SOW_SUBGROUP);
    expect(subgroups).toContain(USYD);
    expect(subgroups).toContain(MACQ);
    const campuses = subgroups.slice(1);
    expect(campuses).toEqual([...campuses].sort((a, b) => a.localeCompare(b)));
  });

  test("returns [] for an unauthenticated caller", async () => {
    const t = await setup();
    expect(await t.query(api.events.subgroups, {})).toEqual([]);
  });
});

describe("legacy import matching", () => {
  test("a first.last@sowaustralia.com member folds into that year's staff profile", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "jane.doe@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Missions",
    });
    await admin.mutation(api.attendanceMetadata.ensureDefaults, { });
    // Legacy imported member: old @sowaustralia.com address, no staffEmail.
    const memberId = await admin.mutation(api.attendanceMembers.create, {
      name: "Old Jane",
      email: "jane.doe@sowaustralia.com",
    });

    // Roster: folded into the single staff row, not shown as a separate member.
    const roster = await leader.query(api.attendance.roster, { year: YEAR });
    expect(roster.filter((m) => m.email === "jane.doe@sow.org.au")).toHaveLength(1);
    expect(roster.some((m) => m.name === "Old Jane")).toBe(false);

    // listByEvent: signing the legacy member in shows them as the staff person.
    const { dateStart, dateEnd } = window();
    const eventId = await admin.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await admin.mutation(api.attendance.signIn, { eventId, memberId });
    const listed = await leader.query(api.attendance.listByEvent, { eventId });
    expect(listed).toHaveLength(1);
    expect(listed[0].kind).toBe("staff");
    expect(listed[0].email).toBe("jane.doe@sow.org.au");
    expect(listed[0].roles).toContain("Staff");
  });

  test("an unmatched legacy member stays a plain attendance member", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await admin.mutation(api.attendanceMetadata.ensureDefaults, { });
    // No profile for ghost.person@sow.org.au this year.
    const memberId = await admin.mutation(api.attendanceMembers.create, {
      name: "Ghost Person",
      email: "ghost.person@sowaustralia.com",
    });
    const roster = await leader.query(api.attendance.roster, { year: YEAR });
    expect(roster.some((m) => m.name === "Ghost Person")).toBe(true);
    const { dateStart, dateEnd } = window();
    const eventId = await admin.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await admin.mutation(api.attendance.signIn, { eventId, memberId });
    const listed = await leader.query(api.attendance.listByEvent, { eventId });
    expect(listed[0].kind).toBe("member");
    expect(listed[0].name).toBe("Ghost Person");
  });

  test("signing in with a non-existent member id throws", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const { dateStart, dateEnd } = window();
    const eventId = await admin.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    // A member id that has since been deleted (e.g. consolidated away).
    const memberId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("attendanceMembers", { name: "Gone" });
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      admin.mutation(api.attendance.signIn, { eventId, memberId })
    ).rejects.toThrow("Member not found");
  });

  test("a stale staff overlay with no matching profile is hidden", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    // An overlay flagged as staff whose email matches no profile this year is
    // neither a staff row nor a plain member — it stays hidden.
    await t.run(async (ctx) => {
      await ctx.db.insert("attendanceMembers", {
        name: "Ghost Staff",
        email: "ghost@sow.org.au",
        staffEmail: "ghost@sow.org.au",
      });
    });
    const roster = await leader.query(api.attendance.roster, { year: YEAR });
    expect(roster.some((m) => m.name === "Ghost Staff")).toBe(false);
  });
});

describe("mergeLegacyStaffMembers (staff-year-aware relink)", () => {
  test("links @sow.org.au and @sowaustralia.com members to the next staff year's profile", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Calendar import year 2025; the staff profiles live in staff year 2026
    // (the next managed year in tests). LEADER's profile is seeded by setup
    // under YEAR (2026); add a second dotted-email staff profile for 2026.
    await admin.mutation(api.admin.setStaffProfile, {
      email: "jane.doe@sow.org.au",
      year: 2026,
      roles: ["Student Leader"],
      university: USYD,
    });

    // Two legacy members under calendar year 2025 with NO staffEmail: one
    // already stored as @sow.org.au, one still @sowaustralia.com (vice versa).
    const { m1, m2, eventId } = await t.run(async (ctx) => {
      const dateStart = Date.UTC(2025, 10, 1, 9, 0, 0); // Nov 2025 → staff year 2026
      const eId = await ctx.db.insert("events", {
        name: "Nov event",
        dateStart,
        dateEnd: dateStart + 3600_000,
        subgroups: [USYD],
      });
      const a = await ctx.db.insert("attendanceMembers", {
        name: "Leader Legacy",
        email: LEADER, // leader@sow.org.au
      });
      const b = await ctx.db.insert("attendanceMembers", {
        name: "Jane Doe",
        email: "jane.doe@sowaustralia.com",
      });
      await ctx.db.insert("attendance", { eventId: eId, memberId: a, signInTime: dateStart });
      await ctx.db.insert("attendance", { eventId: eId, memberId: b, signInTime: dateStart });
      return { m1: a, m2: b, eventId: eId };
    });

    const res = await admin.mutation(api.rollcallImport.mergeLegacyStaffMembers, {
      year: 2025,
    });
    expect(res.mergedMembers).toBe(2);
    expect(res.attendanceMoved).toBe(2);

    const after = await t.run(async (ctx) => {
      const att = await ctx.db
        .query("attendance")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      return {
        att: att.map((a) => ({ email: a.email, memberId: a.memberId })).sort((x, y) =>
          (x.email ?? "").localeCompare(y.email ?? "")
        ),
        oldM1: await ctx.db.get(m1),
        oldM2: await ctx.db.get(m2),
      };
    });
    // Legacy member rows removed, attendance now keyed by the staff email.
    expect(after.oldM1).toBeNull();
    expect(after.oldM2).toBeNull();
    expect(after.att).toEqual([
      { email: "jane.doe@sow.org.au", memberId: undefined },
      { email: LEADER, memberId: undefined },
    ]);
  });
});

describe("staff year derivation for events", () => {
  test("a Sep–Dec attendee with no profile this staff year falls back to the calendar-year member", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    // Nov 2025 event (staff year 2026); the attendee was staff in 2025 (has a
    // calendar-year overlay) but is not in 2026 profiles → show as the member.
    const eventId = await t.run(async (ctx) => {
      const dateStart = Date.UTC(2025, 10, 1, 9, 0, 0);
      await ctx.db.insert("attendanceMembers", {
        name: "Jane Doe",
        email: "jane.doe@sowaustralia.com",
        staffEmail: "jane.doe@sowaustralia.com",
      });
      const e = await ctx.db.insert("events", {
        name: "Nov",
        dateStart,
        dateEnd: dateStart + 3600_000,
        subgroups: [USYD],
      });
      await ctx.db.insert("attendance", {
        eventId: e,
        email: "jane.doe@sowaustralia.com",
        signInTime: dateStart,
      });
      return e;
    });
    const listed = await leader.query(api.attendance.listByEvent, { eventId });
    expect(listed).toHaveLength(1);
    expect(listed[0].kind).toBe("member");
    expect(listed[0].name).toBe("Jane Doe");
  });

  test("a Sep–Dec event shows the next staff year's roles/campus", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    // Oct 15 2023: calendar year 2023, but staff year 2024 (Oct 1 rollover).
    const dateStart = Date.UTC(2023, 9, 15, 9, 0, 0);
    const CAL = 2023;
    const STAFF_YEAR = staffYearForDate(new Date(dateStart));
    expect(STAFF_YEAR).toBe(2024);

    // Past-year profiles/events can't go through admin mutations (year guard),
    // so seed them directly — mirroring imported data: the event keeps its
    // calendar year, and LEADER's campus differs per staff year.
    const eventId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: LEADER,
        year: CAL,
        assignments: [{ role: "Student Leader", university: USYD }],
      });
      await ctx.db.insert("staffProfiles", {
        email: LEADER,
        year: STAFF_YEAR,
        assignments: [{ role: "Student Leader", university: MACQ }],
      });
      const id = await ctx.db.insert("events", {
        name: "Oct event",
        dateStart,
        dateEnd: dateStart + 3600_000,
        subgroups: [USYD],
      });
      await ctx.db.insert("attendance", {
        eventId: id,
        email: LEADER,
        signInTime: dateStart,
      });
      return id;
    });

    // listByEvent: campus comes from the staff-year (2024 → MACQ) profile.
    const listed = await leader.query(api.attendance.listByEvent, { eventId });
    expect(listed).toHaveLength(1);
    expect(listed[0].kind).toBe("staff");
    expect(listed[0].university).toBe(MACQ);

    // roster (event-scoped) resolves the same staff-year profile.
    const roster = await leader.query(api.attendance.roster, {
      year: CAL,
      eventId,
    });
    const leaderRow = roster.find((m) => m.email === LEADER)!;
    expect(leaderRow.campuses).toEqual([MACQ]);
  });
});

describe("roster (the shared member pool)", () => {
  test("every campus shares one pool: all of the year's staff profiles", async () => {
    const t = await setup();
    const roster = await asUser(t, LEADER).query(api.attendance.roster, {
      year: YEAR,
    });
    const emails = roster.map((m) => m.email);
    // Admin (seeded) + the two staff we added — regardless of any sub-group.
    expect(emails).toContain(ADMIN);
    expect(emails).toContain(LEADER);
    expect(emails).toContain(STAFF);
    // The leader's campus is derived from their assignment.
    const leader = roster.find((m) => m.email === LEADER)!;
    expect(leader.roles).toContain("Student Leader");
    expect(leader.campuses).toContain(USYD);
  });
});

describe("events + roll-call", () => {
  let t: TestConvex<typeof schema>;
  beforeEach(async () => {
    t = await setup();
  });

  test("create → appears under its sub-group, not collaborative", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const id = await leader.mutation(api.events.create, {
      name: "Wednesday Outreach",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    const list = await leader.query(api.events.listBySubgroup, { subgroup: USYD });
    expect(list.events).toHaveLength(1);
    expect(list.events[0]._id).toEqual(id);
    expect(list.events[0].collaborative).toBe(false);
    expect(list.events[0].attendanceCount).toBe(0);
    // Not under a campus it wasn't tagged with.
    expect(
      (await leader.query(api.events.listBySubgroup, { subgroup: MACQ })).events
    ).toHaveLength(0);
  });

  test("listBySubgroup returns a completed empty page when no events match", async () => {
    const leader = asUser(t, LEADER);
    const list = await leader.query(api.events.listBySubgroup, { subgroup: USYD });
    expect(list.events).toEqual([]);
    expect(list.isDone).toBe(true);
    expect(list.continueCursor).toBeNull();
  });

  test("multiple events under a sub-group come back newest first", async () => {
    const leader = asUser(t, LEADER);
    const older = await leader.mutation(api.events.create, {
      name: "Older",
      dateStart: Date.now() - 86_400_000,
      dateEnd: Date.now() - 86_400_000 + 3600_000,
      subgroups: [USYD],
    });
    const newer = await leader.mutation(api.events.create, {
      name: "Newer",
      dateStart: Date.now(),
      dateEnd: Date.now() + 3600_000,
      subgroups: [USYD],
    });
    const list = await leader.query(api.events.listBySubgroup, { subgroup: USYD });
    expect(list.events.map((e) => e._id)).toEqual([newer, older]);
  });

  test("listBySubgroup paginates through interleaved non-matching events", async () => {
    const leader = asUser(t, LEADER);
    const base = Date.now();
    const oldest = await leader.mutation(api.events.create, {
      name: "Oldest",
      dateStart: base - 86_400_000,
      dateEnd: base - 86_400_000 + 3600_000,
      subgroups: [USYD],
    });
    const older = await leader.mutation(api.events.create, {
      name: "Older",
      dateStart: base - 45_000,
      dateEnd: base - 45_000 + 3600_000,
      subgroups: [USYD],
    });
    await leader.mutation(api.events.create, {
      name: "Other 2",
      dateStart: base - 30_000,
      dateEnd: base - 30_000 + 3600_000,
      subgroups: [MACQ],
    });
    const newer = await leader.mutation(api.events.create, {
      name: "Newer",
      dateStart: base,
      dateEnd: base + 3600_000,
      subgroups: [USYD],
    });

    const first = await leader.query(api.events.listBySubgroup, {
      subgroup: USYD,
      numItems: 2,
    });
    expect(first.events.map((e) => e._id)).toEqual([newer, older]);
    expect(first.isDone).toBe(false);
    expect(first.continueCursor).toBeTruthy();

    const second = await leader.query(api.events.listBySubgroup, {
      subgroup: USYD,
      cursor: first.continueCursor,
      numItems: 2,
    });
    expect(second.events.map((e) => e._id)).toEqual([oldest]);
    expect(second.isDone).toBe(true);
    expect(second.continueCursor).toBeNull();
  });

  test("listBySubgroup buffers sparse matches across tiny pages", async () => {
    const leader = asUser(t, LEADER);
    const base = Date.now();
    const older = await leader.mutation(api.events.create, {
      name: "Older",
      dateStart: base - 20_000,
      dateEnd: base - 20_000 + 3600_000,
      subgroups: [USYD],
    });
    for (let i = 0; i < 12; i++) {
      await leader.mutation(api.events.create, {
        name: `Other ${i}`,
        dateStart: base - 19_000 + i,
        dateEnd: base - 19_000 + i + 3600_000,
        subgroups: [MACQ],
      });
    }
    const newer = await leader.mutation(api.events.create, {
      name: "Newer",
      dateStart: base,
      dateEnd: base + 3600_000,
      subgroups: [USYD],
    });

    const first = await leader.query(api.events.listBySubgroup, {
      subgroup: USYD,
      numItems: 1,
    });
    expect(first.events.map((e) => e._id)).toEqual([newer]);
    expect(first.isDone).toBe(false);
    expect(first.continueCursor).toBeTruthy();

    const second = await leader.query(api.events.listBySubgroup, {
      subgroup: USYD,
      cursor: first.continueCursor,
      numItems: 1,
    });
    expect(second.events.map((e) => e._id)).toEqual([older]);
    expect(second.isDone).toBe(true);
    expect(second.continueCursor).toBeNull();
  });

  test("sign in is idempotent; sign out removes; counts track", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "Event",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId, email: LEADER });
    await leader.mutation(api.attendance.signIn, { eventId, email: STAFF });
    // Re-signing the same person is a no-op (one row per person).
    await leader.mutation(api.attendance.signIn, { eventId, email: LEADER });

    let rows = await leader.query(api.attendance.listByEvent, { eventId });
    expect(rows.map((r) => r.email).sort()).toEqual([LEADER, STAFF].sort());

    let list = await leader.query(api.events.listBySubgroup, { subgroup: USYD });
    expect(list.events[0].attendanceCount).toBe(2);

    await leader.mutation(api.attendance.signOut, { eventId, email: STAFF });
    rows = await leader.query(api.attendance.listByEvent, { eventId });
    expect(rows.map((r) => r.email)).toEqual([LEADER]);

    list = await leader.query(api.events.listBySubgroup, { subgroup: USYD });
    expect(list.events[0].attendanceCount).toBe(1);
  });

  test("email is normalised to lowercase on sign-in", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "Event",
      dateStart,
      dateEnd,
      subgroups: [ALL_SUBGROUP],
    });
    await leader.mutation(api.attendance.signIn, {
      eventId,
      email: "Leader@SOW.org.au",
    });
    const rows = await leader.query(api.attendance.listByEvent, { eventId });
    expect(rows.map((r) => r.email)).toEqual([LEADER]);
  });

  test("past event: an attendee from before/during the event can't be signed out (staff + member paths)", async () => {
    const leader = asUser(t, LEADER);
    const dateStart = Date.now() - 3 * 86_400_000;
    const dateEnd = dateStart + 3600_000; // ended ~3 days ago
    const { eventId, memberId } = await t.run(async (ctx) => {
      const eventId = await ctx.db.insert("events", {
        name: "Past",
        dateStart,
        dateEnd,
        subgroups: [USYD],
      });
      await ctx.db.insert("attendance", {
        eventId,
        email: STAFF,
        signInTime: dateStart + 600_000,
      });
      const memberId = await ctx.db.insert("attendanceMembers", { name: "Guest" });
      await ctx.db.insert("attendance", {
        eventId,
        memberId,
        signInTime: dateStart + 600_000,
      });
      return { eventId, memberId };
    });
    // Both the email and member sign-out paths are blocked for genuine attendees.
    await expect(
      leader.mutation(api.attendance.signOut, { eventId, email: STAFF })
    ).rejects.toThrow(/can't be removed/i);
    await expect(
      leader.mutation(api.attendance.signOut, { eventId, memberId })
    ).rejects.toThrow(/can't be removed/i);
    // Both rows are still there.
    const rows = await leader.query(api.attendance.listByEvent, { eventId });
    expect(rows).toHaveLength(2);
  });

  test("past event: a retroactive (post-event) sign-in can still be signed out", async () => {
    const leader = asUser(t, LEADER);
    const dateStart = Date.now() - 3 * 86_400_000;
    const dateEnd = dateStart + 3600_000;
    const eventId = await t.run((ctx) =>
      ctx.db.insert("events", { name: "Past", dateStart, dateEnd, subgroups: [USYD] })
    );
    // Added a day AFTER the event ended — a mistaken late add, so reversible.
    await t.run((ctx) =>
      ctx.db.insert("attendance", {
        eventId,
        email: STAFF,
        signInTime: dateEnd + 86_400_000,
      })
    );
    await leader.mutation(api.attendance.signOut, { eventId, email: STAFF });
    const rows = await leader.query(api.attendance.listByEvent, { eventId });
    expect(rows).toHaveLength(0);
  });

  test("ongoing event: an attendee can be signed out normally", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window(); // live (ends in 1h)
    const eventId = await leader.mutation(api.events.create, {
      name: "Live",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId, email: STAFF });
    await leader.mutation(api.attendance.signOut, { eventId, email: STAFF });
    const rows = await leader.query(api.attendance.listByEvent, { eventId });
    expect(rows).toHaveLength(0);
  });

  test("notes are stored per event attendance row", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "Notes event",
      dateStart,
      dateEnd,
      subgroups: [ALL_SUBGROUP],
    });
    await leader.mutation(api.attendance.signIn, { eventId, email: LEADER });
    const [row] = await leader.query(api.attendance.listByEvent, { eventId });
    expect(row.notes).toBeUndefined();

    await leader.mutation(api.attendance.updateRecord, {
      attendanceId: row._id,
      notes: "  Vegetarian meal  ",
    });
    const [updated] = await leader.query(api.attendance.listByEvent, { eventId });
    expect(updated.notes).toBe("Vegetarian meal");

    await leader.mutation(api.attendance.updateRecord, {
      attendanceId: row._id,
      notes: "   ",
    });
    const [cleared] = await leader.query(api.attendance.listByEvent, { eventId });
    expect(cleared.notes).toBeUndefined();

    // signInTime update branch
    const newTime = Date.now() - 60_000;
    await leader.mutation(api.attendance.updateRecord, {
      attendanceId: row._id,
      signInTime: newTime,
    });
    const [timed] = await leader.query(api.attendance.listByEvent, { eventId });
    expect(timed.signInTime).toBe(newTime);

    // empty patch (no-op): passing neither notes nor signInTime
    await expect(
      leader.mutation(api.attendance.updateRecord, { attendanceId: row._id })
    ).resolves.toBeNull();
  });

  test("duplicate sub-groups are de-duped (not falsely collaborative)", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const id = await leader.mutation(api.events.create, {
      name: "Dup",
      dateStart,
      dateEnd,
      subgroups: [USYD, USYD],
    });
    const got = await leader.query(api.events.get, { eventId: id });
    expect(got!.subgroups).toEqual([USYD]);
    expect(got!.collaborative).toBe(false);
  });

  test("collaborative event (2+ sub-groups) shows under each", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const id = await leader.mutation(api.events.create, {
      name: "Joint Outreach",
      dateStart,
      dateEnd,
      subgroups: [USYD, MACQ],
    });
    for (const subgroup of [USYD, MACQ]) {
      const list = await leader.query(api.events.listBySubgroup, { subgroup });
      expect(list.events.map((e) => e._id)).toContain(id);
      expect(list.events.find((e) => e._id === id)!.collaborative).toBe(true);
    }
    // events.get annotates the single event with the same collaborative flag.
    const got = await leader.query(api.events.get, { eventId: id });
    expect(got).not.toBeNull();
    expect(got!.collaborative).toBe(true);
  });

  test("campus event collaborating with org-wide SOW appears under SOW", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const id = await leader.mutation(api.events.create, {
      name: "SEASONS",
      dateStart,
      dateEnd,
      subgroups: [USYD, SOW_SUBGROUP],
    });
    const usyd = await leader.query(api.events.listBySubgroup, { subgroup: USYD });
    const sow = await leader.query(api.events.listBySubgroup, { subgroup: SOW_SUBGROUP });
    expect(usyd.events.map((e) => e._id)).toContain(id);
    expect(sow.events.map((e) => e._id)).toContain(id);
  });

  test("legacy ALL collaboration values still match the SOW list", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const id = await leader.mutation(api.events.create, {
      name: "Legacy collab",
      dateStart,
      dateEnd,
      subgroups: [USYD, "ALL"],
    });
    const sow = await leader.query(api.events.listBySubgroup, { subgroup: SOW_SUBGROUP });
    expect(sow.events.map((e) => e._id)).toContain(id);
    const got = await leader.query(api.events.get, { eventId: id });
    expect(got!.subgroups).toEqual([USYD, SOW_SUBGROUP]);
  });

  test("remove deletes the event and its attendance", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "Event",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId, email: LEADER });
    await leader.mutation(api.events.remove, { eventId });
    expect(await leader.query(api.events.get, { eventId })).toBeNull();
    expect(
      await leader.query(api.attendance.listByEvent, { eventId })
    ).toEqual([]);
  });
});

describe("new-event notifications", () => {
  const LEADER2 = "leader2@sow.org.au"; // second Student Leader at USYD
  const MACQ_LEADER = "macqleader@sow.org.au"; // Student Leader at Macquarie

  const notifsFor = (t: TestConvex<typeof schema>, email: string) =>
    t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userEmail", email))
        .collect()
    );

  // create() schedules the fan-out; run it deterministically here (a
  // runAfter(0) job isn't picked up by finishInProgressScheduledFunctions).
  const createAndDeliver = async (
    t: TestConvex<typeof schema>,
    creator: string,
    subgroups: string[]
  ) => {
    const { dateStart, dateEnd } = window();
    const eventId = await asUser(t, creator).mutation(api.events.create, {
      name: "Outreach",
      dateStart,
      dateEnd,
      subgroups,
    });
    await t.mutation(internal.events.notifyNewEvent, { eventId, actorEmail: creator });
  };

  test("a campus event notifies that campus's staff — not other campuses or the creator", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: LEADER2, year: YEAR, roles: ["Student Leader"], university: USYD,
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: MACQ_LEADER, year: YEAR, roles: ["Student Leader"], university: MACQ,
    });

    // Creator is itself a USYD leader (in-scope) — proves the creator is still excluded.
    await createAndDeliver(t, LEADER, [USYD]);

    const leader2Notifs = await notifsFor(t, LEADER2);
    expect(leader2Notifs).toHaveLength(1); // another USYD leader is notified
    expect(leader2Notifs[0].title.toLowerCase()).toContain("new event");
    expect(leader2Notifs[0].url).toMatch(/^\/attendance\/event\//);
    expect(await notifsFor(t, LEADER)).toHaveLength(0); // in-scope creator excluded
    expect(await notifsFor(t, MACQ_LEADER)).toHaveLength(0); // other campus excluded
    expect(await notifsFor(t, STAFF)).toHaveLength(0); // no campus assignment
  });

  test("an org-wide (SOW) event notifies all staff except the creator", async () => {
    const t = await setup();
    await createAndDeliver(t, LEADER, [SOW_SUBGROUP]);
    expect(await notifsFor(t, STAFF)).toHaveLength(1); // org-wide reaches dept staff
    expect(await notifsFor(t, LEADER)).toHaveLength(0); // creator excluded
  });
});

describe("validation + permissions", () => {
  test("create rejects empty name, no sub-groups, bad dates, unknown sub-group", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    await expect(
      leader.mutation(api.events.create, {
        name: "  ",
        dateStart,
        dateEnd,
        subgroups: [USYD],
      })
    ).rejects.toThrow(/name/i);
    await expect(
      leader.mutation(api.events.create, {
        name: "X",
        dateStart,
        dateEnd,
        subgroups: [],
      })
    ).rejects.toThrow(/at least one sub-group/i);
    await expect(
      leader.mutation(api.events.create, {
        name: "X",
        dateStart: dateEnd,
        dateEnd: dateStart,
        subgroups: [USYD],
      })
    ).rejects.toThrow(/can't be before/i);
    await expect(
      leader.mutation(api.events.create, {
        name: "X",
        dateStart,
        dateEnd,
        subgroups: ["Hogwarts"],
      })
    ).rejects.toThrow(/Unknown sub-group/i);
  });

  test("a signed-in non-staff user can't create events", async () => {
    const t = await setup();
    const { dateStart, dateEnd } = window();
    await expect(
      asUser(t, OUTSIDER).mutation(api.events.create, {
        name: "X",
        dateStart,
        dateEnd,
        subgroups: [USYD],
      })
    ).rejects.toThrow(/No role\/department assigned/i);
  });

  test("an outsider (no staff profile) can't read roll-call data", async () => {
    const t = await setup();
    const outsider = asUser(t, OUTSIDER);
    const { dateStart, dateEnd } = window();
    const eventId = await asUser(t, LEADER).mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    expect(await outsider.query(api.events.subgroups, {})).toEqual([]);
    expect(
      (await outsider.query(api.events.listBySubgroup, { subgroup: USYD })).events
    ).toEqual([]);
    expect(await outsider.query(api.attendance.roster, { year: YEAR })).toEqual(
      []
    );
    expect(
      await outsider.query(api.attendance.listByEvent, { eventId })
    ).toEqual([]);
    expect(await outsider.query(api.events.get, { eventId })).toBeNull();
  });

  test("signIn rejects a blank email", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await expect(
      leader.mutation(api.attendance.signIn, { eventId, email: "   " })
    ).rejects.toThrow(/email is required/i);
    await expect(
      leader.mutation(api.attendance.signIn, { eventId })
    ).rejects.toThrow(/either email or memberId/i);
  });

  test("create rejects invalid tags and accepts valid ones", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ name: "Social", colour: "blue" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, { year: YEAR });
    const eventId = await leader.mutation(api.events.create, {
      name: "Tagged",
      dateStart,
      dateEnd,
      subgroups: [USYD],
      tagIds: [tag._id],
    });
    const got = await leader.query(api.events.get, { eventId });
    expect(got?.tags?.[0]?.name).toBe("Social");
    await expect(
      leader.mutation(api.events.create, {
        name: "Bad tag",
        dateStart,
        dateEnd,
        subgroups: [USYD],
        tagIds: [tag._id, tag._id],
      })
    ).resolves.toBeTruthy();
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR + 1,
      tags: [{ name: "Other year", colour: "red" }],
      deleteIds: [],
    });
    const [otherYearTag] = await leader.query(api.attendanceTags.list, {
      year: YEAR + 1,
    });
    await expect(
      leader.mutation(api.events.create, {
        name: "Wrong year tag",
        dateStart,
        dateEnd,
        subgroups: [USYD],
        tagIds: [otherYearTag._id],
      })
    ).rejects.toThrow(/invalid for this year/i);
  });
});

describe("guards + edge cases", () => {
  test("queries return empty / null for an unauthenticated caller", async () => {
    const t = await setup();
    const { dateStart, dateEnd } = window();
    const eventId = await asUser(t, LEADER).mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    // No identity → every read degrades gracefully rather than leaking data.
    expect(await t.query(api.events.subgroups, {})).toEqual([]);
    expect(await t.query(api.attendance.roster, { year: YEAR })).toEqual([]);
    expect(
      (await t.query(api.events.listBySubgroup, { subgroup: USYD })).events
    ).toEqual([]);
    expect(await t.query(api.events.get, { eventId })).toBeNull();
    expect(await t.query(api.attendance.listByEvent, { eventId })).toEqual([]);
  });

  test("get / remove / signIn handle a missing event gracefully", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.events.remove, { eventId });
    // The stale id now resolves to nothing.
    expect(await leader.query(api.events.get, { eventId })).toBeNull();
    // Removing an already-gone event is a no-op.
    await expect(
      leader.mutation(api.events.remove, { eventId })
    ).resolves.toBeNull();
    // Signing into a missing event is rejected.
    await expect(
      leader.mutation(api.attendance.signIn, { eventId, email: LEADER })
    ).rejects.toThrow(/Event not found/i);
  });

  test("signing out someone who isn't signed in is a no-op", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await expect(
      leader.mutation(api.attendance.signOut, { eventId, email: STAFF })
    ).resolves.toBeNull();
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const memberId = await leader.mutation(api.attendanceMembers.create, { name: "G" });
    await expect(
      leader.mutation(api.attendance.signOut, { eventId, memberId })
    ).resolves.toBeNull();
    expect(
      await leader.query(api.attendance.listByEvent, { eventId })
    ).toEqual([]);
  });

  test("signOut requires exactly one identifier", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const memberId = await leader.mutation(api.attendanceMembers.create, { name: "G" });
    // Neither identifier.
    await expect(
      leader.mutation(api.attendance.signOut, { eventId })
    ).rejects.toThrow(/either email or memberId/i);
    // Both identifiers.
    await expect(
      leader.mutation(api.attendance.signOut, { eventId, email: STAFF, memberId })
    ).rejects.toThrow(/either email or memberId/i);
  });

  test("signIn and signOut by memberId", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Guest",
    });
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    const attendanceId = await leader.mutation(api.attendance.signIn, {
      eventId,
      memberId,
    });
    expect(
      await leader.mutation(api.attendance.signIn, { eventId, memberId })
    ).toBe(attendanceId);
    await leader.mutation(api.attendance.signOut, { eventId, memberId });
    const listed = await leader.query(api.attendance.listByEvent, { eventId });
    expect(listed).toEqual([]);
    await leader.mutation(api.attendance.signIn, { eventId, memberId });
    expect(
      (await leader.query(api.attendance.listByEvent, { eventId }))[0]?.name
    ).toBe("Guest");
  });

  test("events.update patches name, dates, subgroups, and tags", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ name: "Social", colour: "blue" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, { year: YEAR });
    const eventId = await leader.mutation(api.events.create, {
      name: "Original",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.events.update, {
      eventId,
      name: "Updated",
      dateStart,
      dateEnd,
      subgroups: [USYD, MACQ],
      tagIds: [tag._id],
    });
    const got = await leader.query(api.events.get, { eventId });
    expect(got?.name).toBe("Updated");
    expect(got?.collaborative).toBe(true);
    expect(got?.tags?.[0]?.name).toBe("Social");
    // Update a deleted event to exercise the "Event not found" guard
    const staleId = await leader.mutation(api.events.create, {
      name: "Stale",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.events.remove, { eventId: staleId });
    await expect(
      leader.mutation(api.events.update, {
        eventId: staleId,
        name: "X",
        dateStart,
        dateEnd,
        subgroups: [USYD],
      })
    ).rejects.toThrow(/Event not found/i);
  });

  test("deleting a tag removes it from any events that reference it", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ name: "Outreach", colour: "red" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, { year: YEAR });
    const eventId = await leader.mutation(api.events.create, {
      name: "Tagged Event",
      dateStart,
      dateEnd,
      subgroups: [USYD],
      tagIds: [tag._id],
    });
    expect((await leader.query(api.events.get, { eventId }))?.tags?.[0]?.name).toBe("Outreach");
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [],
      deleteIds: [tag._id],
    });
    const after = await leader.query(api.events.get, { eventId });
    expect(after?.tags ?? []).toEqual([]);
  });

  test("roster with eventId ranks members by attendance history and tag matches", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();

    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ name: "Outreach", colour: "orange" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, { year: YEAR });

    const pastId = await leader.mutation(api.events.create, {
      name: "Past",
      dateStart: dateStart - 86_400_000,
      dateEnd: dateEnd - 86_400_000,
      subgroups: [USYD],
      tagIds: [tag._id],
    });
    await leader.mutation(api.attendance.signIn, { eventId: pastId, email: LEADER });

    const targetId = await leader.mutation(api.events.create, {
      name: "Target",
      dateStart,
      dateEnd,
      subgroups: [USYD],
      tagIds: [tag._id],
    });

    const roster = await leader.query(api.attendance.roster, { year: YEAR, eventId: targetId });
    expect(roster.length).toBeGreaterThan(0);
    // LEADER attended the past tagged event → tagMatches > 0, ranks first
    expect(roster[0].email).toBe(LEADER);
  });

  test("listByEvent formats member metadata in subtitle", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const genderField = fields.find((f) => f.key === "Gender")!;
    const campusField = fields.find((f) => f.key === "Campus")!;
    const maleId = Object.entries(genderField.values ?? {}).find(([, v]) => v === "Male")?.[0]!;
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Test Member",
      // A non-staff member's campus comes from their own metadata value.
      metadata: { [genderField._id]: maleId, [campusField._id]: USYD },
    });
    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId, memberId });
    const rows = await leader.query(api.attendance.listByEvent, { eventId });
    const row = rows.find((r) => r.name === "Test Member");
    expect(row?.subtitle).toContain("Male");
    expect(row?.university).toBe(USYD);
  });

  test("roster enriches staff shadows and listByEvent handles edge rows", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;
    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    await leader.mutation(api.attendanceMembers.update, {
      memberId: shadowId,
      name: "ignored",
      metadata: { [yearField._id]: String(YEAR) },
    });
    const roster = await leader.query(api.attendance.roster, { year: YEAR });
    const leaderRow = roster.find((r) => r.email === LEADER);
    expect(leaderRow?.subtitle).toContain("1");

    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("attendance", {
        eventId,
        signInTime: Date.now(),
      });
    });
    const listed = await leader.query(api.attendance.listByEvent, { eventId });
    expect(listed.some((r) => r.name === "Unknown")).toBe(true);
  });
});

describe("listByEvent de-duplicates one person signed in twice", () => {
  test("an email and a memberId sign-in for the same staff person collapse to one row", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    // LEADER's staff overlay gives them a memberId as well as their email.
    const memberId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    const { dateStart, dateEnd } = window();
    const eventId = await admin.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    // Both identifiers sign the same person in (e.g. legacy/imported data).
    await admin.mutation(api.attendance.signIn, { eventId, email: LEADER });
    await admin.mutation(api.attendance.signIn, { eventId, memberId });
    const listed = await leader.query(api.attendance.listByEvent, { eventId });
    expect(listed).toHaveLength(1);
    expect(listed[0].email).toBe(LEADER);
    expect(listed[0].kind).toBe("staff");
  });
});

describe("collaborative events surface every sub-group's metadata", () => {
  test("a field scoped to a collaborator shows on the roll-call; a single-group event hides it", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    // A field relevant only to MACQ.
    const houseFieldId = await t.run(async (ctx) =>
      ctx.db.insert("attendanceMetadata", {
        key: "House",
        type: "input" as const,
        order: 9,
        subgroup: MACQ,
      })
    );
    const memberId = await admin.mutation(api.attendanceMembers.create, {
      name: "Houserson",
      metadata: { [houseFieldId]: "Red" },
    });
    const { dateStart, dateEnd } = window();

    // Collaborative across USYD (owner) + MACQ: the MACQ field is shown.
    const collab = await admin.mutation(api.events.create, {
      name: "Collab",
      dateStart,
      dateEnd,
      subgroups: [USYD, MACQ],
    });
    await admin.mutation(api.attendance.signIn, { eventId: collab, memberId });
    const collabRows = await leader.query(api.attendance.listByEvent, {
      eventId: collab,
    });
    expect(collabRows.find((r) => r.name === "Houserson")?.subtitle ?? "").toContain(
      "Red"
    );
    // The roster (suggested pool) applies the same union — the MACQ field shows
    // for the collaborative event even though USYD is the asked-for sub-group.
    const collabRoster = await leader.query(api.attendance.roster, {
      year: YEAR,
      subgroup: USYD,
      eventId: collab,
    });
    expect(
      collabRoster.find((r) => r.name === "Houserson")?.subtitle ?? ""
    ).toContain("Red");

    // A USYD-only event hides the MACQ-scoped field.
    const usydOnly = await admin.mutation(api.events.create, {
      name: "USYD only",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await admin.mutation(api.attendance.signIn, { eventId: usydOnly, memberId });
    const usydRows = await leader.query(api.attendance.listByEvent, {
      eventId: usydOnly,
    });
    expect(
      usydRows.find((r) => r.name === "Houserson")?.subtitle ?? ""
    ).not.toContain("Red");
  });
});

describe("roster without an event scopes metadata to the asked-for sub-group", () => {
  test("a sub-group-scoped field shows only for that sub-group", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const houseFieldId = await t.run(async (ctx) =>
      ctx.db.insert("attendanceMetadata", {
        key: "House",
        type: "input" as const,
        order: 9,
        subgroup: MACQ,
      })
    );
    await admin.mutation(api.attendanceMembers.create, {
      name: "Scoped Member",
      metadata: { [houseFieldId]: "Red" },
    });
    // No event in context: the MACQ-only field is hidden for USYD…
    const usyd = await leader.query(api.attendance.roster, {
      year: YEAR,
      subgroup: USYD,
    });
    expect(
      usyd.find((r) => r.name === "Scoped Member")?.subtitle ?? ""
    ).not.toContain("Red");
    // …and shown for MACQ.
    const macq = await leader.query(api.attendance.roster, {
      year: YEAR,
      subgroup: MACQ,
    });
    expect(
      macq.find((r) => r.name === "Scoped Member")?.subtitle ?? ""
    ).toContain("Red");
  });
});
