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
    const subgroups = await asUser(t, LEADER).query(api.events.subgroups, {
      year: YEAR,
    });
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

  test("campus event collaborating with org-wide SOW appears under SOW", async () => {
    const leader = asUser(t, LEADER);
    const { dateStart, dateEnd } = window();
    const id = await leader.mutation(api.events.create, {
      name: "SEASONS",
      dateStart,
      dateEnd,
      subgroups: [USYD, SOW_SUBGROUP],
    });
    const usyd = await leader.query(api.events.listBySubgroup, {
      year: YEAR,
      subgroup: USYD,
    });
    const sow = await leader.query(api.events.listBySubgroup, {
      year: YEAR,
      subgroup: SOW_SUBGROUP,
    });
    expect(usyd.map((e) => e._id)).toContain(id);
    expect(sow.map((e) => e._id)).toContain(id);
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
    const sow = await leader.query(api.events.listBySubgroup, {
      year: YEAR,
      subgroup: SOW_SUBGROUP,
    });
    expect(sow.map((e) => e._id)).toContain(id);
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
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    const memberId = await leader.mutation(api.attendanceMembers.create, { year: YEAR, name: "G" });
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
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      year: YEAR,
      name: "G",
    });
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
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      year: YEAR,
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
    await expect(
      leader.mutation(api.attendance.signIn, {
        eventId,
        memberId: (await leader.mutation(api.attendanceMembers.create, {
          year: YEAR + 1,
          name: "Wrong year",
        })) as typeof memberId,
      })
    ).rejects.toThrow(/Member not found/i);
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
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    const fields = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    const genderField = fields.find((f) => f.key === "Gender")!;
    const maleId = Object.entries(genderField.values ?? {}).find(([, v]) => v === "Male")?.[0]!;
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      year: YEAR,
      name: "Test Member",
      metadata: { [genderField._id]: maleId },
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
  });

  test("roster enriches staff shadows and listByEvent handles edge rows", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    const fields = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    const yearField = fields.find((f) => f.key === "Year")!;
    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      year: YEAR,
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
        year: YEAR,
        signInTime: Date.now(),
      });
    });
    const listed = await leader.query(api.attendance.listByEvent, { eventId });
    expect(listed.some((r) => r.name === "Unknown")).toBe(true);
  });
});
