/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { ALL_SUBGROUP } from "../shared/rollcall";
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
    const subgroups = await asUser(t, LEADER).query(api.events.subgroups, {
      year: YEAR,
    });
    // "ALL" is always first; the campuses follow, alphabetically sorted.
    expect(subgroups[0]).toBe(ALL_SUBGROUP);
    expect(subgroups).toContain(USYD);
    expect(subgroups).toContain(MACQ);
    const campuses = subgroups.slice(1);
    expect(campuses).toEqual([...campuses].sort((a, b) => a.localeCompare(b)));
  });

  test("returns [] for an unauthenticated caller", async () => {
    const t = await setup();
    expect(await t.query(api.events.subgroups, { year: YEAR })).toEqual([]);
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
    const list = await leader.query(api.events.listBySubgroup, {
      year: YEAR,
      subgroup: USYD,
    });
    expect(list).toHaveLength(1);
    expect(list[0]._id).toEqual(id);
    expect(list[0].collaborative).toBe(false);
    expect(list[0].attendanceCount).toBe(0);
    // Not under a campus it wasn't tagged with.
    expect(
      await leader.query(api.events.listBySubgroup, { year: YEAR, subgroup: MACQ })
    ).toHaveLength(0);
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
    const list = await leader.query(api.events.listBySubgroup, {
      year: YEAR,
      subgroup: USYD,
    });
    expect(list.map((e) => e._id)).toEqual([newer, older]);
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

    let list = await leader.query(api.events.listBySubgroup, {
      year: YEAR,
      subgroup: USYD,
    });
    expect(list[0].attendanceCount).toBe(2);

    await leader.mutation(api.attendance.signOut, { eventId, email: STAFF });
    rows = await leader.query(api.attendance.listByEvent, { eventId });
    expect(rows.map((r) => r.email)).toEqual([LEADER]);

    list = await leader.query(api.events.listBySubgroup, {
      year: YEAR,
      subgroup: USYD,
    });
    expect(list[0].attendanceCount).toBe(1);
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
      const list = await leader.query(api.events.listBySubgroup, {
        year: YEAR,
        subgroup,
      });
      expect(list.map((e) => e._id)).toContain(id);
      expect(list.find((e) => e._id === id)!.collaborative).toBe(true);
    }
    // events.get annotates the single event with the same collaborative flag.
    const got = await leader.query(api.events.get, { eventId: id });
    expect(got).not.toBeNull();
    expect(got!.collaborative).toBe(true);
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
    expect(await outsider.query(api.events.subgroups, { year: YEAR })).toEqual(
      []
    );
    expect(
      await outsider.query(api.events.listBySubgroup, {
        year: YEAR,
        subgroup: USYD,
      })
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
    expect(await t.query(api.events.subgroups, { year: YEAR })).toEqual([]);
    expect(await t.query(api.attendance.roster, { year: YEAR })).toEqual([]);
    expect(
      await t.query(api.events.listBySubgroup, { year: YEAR, subgroup: USYD })
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
    expect(
      await leader.query(api.attendance.listByEvent, { eventId })
    ).toEqual([]);
  });
});
