/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const STAFF = "staff@sow.org.au";
const OUTSIDER = "outsider@sow.org.au";

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

describe("attendance tags", () => {
  test("list is staff-only and sorted by name", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ name: "Zeta", colour: "blue" }, { name: "Alpha", colour: "red" }],
      deleteIds: [],
    });
    expect(await t.query(api.attendanceTags.list, { year: YEAR })).toEqual([]);
    const tags = await leader.query(api.attendanceTags.list, { year: YEAR });
    expect(tags.map((tag) => tag.name)).toEqual(["Alpha", "Zeta"]);
  });

  test("saveAll updates, deletes, and validates names", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ name: "Social", colour: "green" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, { year: YEAR });
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ id: tag._id, name: "Social Night", colour: "teal" }],
      deleteIds: [],
    });
    expect(
      (await leader.query(api.attendanceTags.list, { year: YEAR }))[0].name
    ).toBe("Social Night");
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [],
      deleteIds: [tag._id],
    });
    expect(await leader.query(api.attendanceTags.list, { year: YEAR })).toEqual(
      []
    );
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        year: YEAR,
        tags: [{ name: "   " }],
        deleteIds: [],
      })
    ).rejects.toThrow(/needs a name/i);
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        year: YEAR,
        tags: [{ name: "Dup" }, { name: "dup" }],
        deleteIds: [],
      })
    ).rejects.toThrow(/Duplicate tag/i);

    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ name: "Persist", colour: "blue" }],
      deleteIds: [],
    });
    const [persist] = await leader.query(api.attendanceTags.list, { year: YEAR });
    await leader.mutation(api.attendanceTags.saveAll, {
      year: YEAR + 1,
      tags: [{ id: persist._id, name: "Wrong year" }],
      deleteIds: [],
    });
    expect(
      (await leader.query(api.attendanceTags.list, { year: YEAR }))[0].name
    ).toBe("Persist");
  });
});

describe("attendance metadata", () => {
  test("ensureDefaults seeds Year/Gender/Campus/Role once", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    expect(await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR })).toBe(
      4
    );
    expect(await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR })).toBe(
      4
    );
    const fields = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    expect(fields.map((f) => f.key)).toEqual(["Year", "Gender", "Campus", "Role"]);
    const campusValues = Object.values(
      fields.find((f) => f.key === "Campus")?.values ?? {}
    );
    expect(campusValues).toContain(USYD);
    expect(campusValues).toContain(MACQ);
  });

  test("ensureDefaults merges custom roles saved for that year", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.upsertRole, {
      year: YEAR + 1,
      name: "Volunteer",
    });
    const leader = asUser(t, LEADER);
    expect(
      await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR + 1 })
    ).toBe(4);
    const role = (await leader.query(api.attendanceMetadata.list, { year: YEAR + 1 })).find(
      (f) => f.key === "Role"
    );
    expect(Object.values(role?.values ?? {})).toContain("Volunteer");
  });

  test("list is staff-only and strips Gender Other but keeps Female", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    expect(await t.query(api.attendanceMetadata.list, { year: YEAR })).toEqual([]);
    const fields = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    const gender = fields.find((f) => f.key === "Gender");
    expect(Object.values(gender?.values ?? {})).not.toContain("Other");
    expect(Object.values(gender?.values ?? {})).toContain("Female");
    expect(Object.values(gender?.values ?? {})).toContain("Male");
  });

  test("saveAll creates, patches, and guards locked values", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    const fields = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    const campus = fields.find((f) => f.key === "Campus")!;

    await leader.mutation(api.attendanceMetadata.saveAll, {
      year: YEAR,
      fields: [
        {
          id: campus._id,
          key: "Campus",
          type: "select",
          order: 2,
          values: { ...campus.values, "10": "Online" },
          lockedValues: campus.lockedValues,
        },
        {
          key: "Notes",
          type: "input",
          order: 4,
        },
      ],
      deleteIds: [],
    });
    const updated = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    expect(updated.find((f) => f.key === "Notes")).toBeTruthy();
    expect(updated.find((f) => f.key === "Campus")?.values?.["10"]).toBe("Online");

    const gender = fields.find((f) => f.key === "Gender")!;

    await leader.mutation(api.attendanceMetadata.saveAll, {
      year: YEAR,
      fields: [
        {
          id: gender._id,
          key: "Gender",
          type: "select",
          order: 1,
          values: { "2": "Female" },
          lockedValues: gender.lockedValues,
        },
      ],
      deleteIds: [],
    });
    const withGender = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    expect(withGender.find((f) => f.key === "Gender")?.values).toEqual({
      "1": "Male",
      "2": "Female",
    });

    await expect(
      leader.mutation(api.attendanceMetadata.saveAll, {
        year: YEAR,
        fields: [
          { key: "Dup", type: "input", order: 5 },
          { key: "dup", type: "input", order: 6 },
        ],
        deleteIds: [],
      })
    ).rejects.toThrow(/Duplicate metadata field/i);

    await leader.mutation(api.attendanceMetadata.saveAll, {
      year: YEAR,
      fields: updated
        .filter((f) => f.key !== "Notes")
        .map((f) => ({
          id: f._id,
          key: f.key,
          type: f.type,
          order: f.order,
          values: f.values,
          lockedValues: f.lockedValues,
        })),
      deleteIds: [updated.find((f) => f.key === "Notes")!._id],
    });
    expect(
      (await leader.query(api.attendanceMetadata.list, { year: YEAR })).some(
        (f) => f.key === "Notes"
      )
    ).toBe(false);

    await asUser(t, ADMIN).mutation(api.admin.upsertUniversity, {
      year: YEAR,
      name: "Western Sydney University",
    });
    await asUser(t, ADMIN).mutation(api.admin.upsertRole, {
      year: YEAR,
      name: "Volunteer",
    });
    const afterUni = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    expect(
      Object.values(afterUni.find((f) => f.key === "Campus")?.values ?? {})
    ).toContain("Western Sydney University");
    const roleField = afterUni.find((f) => f.key === "Role")!;
    expect(Object.values(roleField.values ?? {})).toContain("Volunteer");
    await leader.mutation(api.attendanceMetadata.saveAll, {
      year: YEAR,
      fields: [
        {
          id: roleField._id,
          key: "Role",
          type: "select",
          order: roleField.order,
          values: roleField.values,
          lockedValues: roleField.lockedValues,
        },
        {
          key: "Track",
          type: "select",
          order: 10,
          values: { "1": "Morning" },
          lockedValues: ["Morning"],
        },
      ],
      deleteIds: [],
    });
    expect(
      (await leader.query(api.attendanceMetadata.list, { year: YEAR })).some(
        (f) => f.key === "Track"
      )
    ).toBe(true);

    const yearField = afterUni.find((f) => f.key === "Year")!;
    await leader.mutation(api.attendanceMetadata.saveAll, {
      year: YEAR,
      fields: [
        {
          id: yearField._id,
          key: "Year",
          type: "select",
          order: yearField.order,
          values: yearField.values,
          lockedValues: yearField.lockedValues,
        },
        {
          key: "Notes",
          type: "input",
          order: 11,
        },
      ],
      deleteIds: [],
    });
    expect(
      (await leader.query(api.attendanceMetadata.list, { year: YEAR })).find(
        (f) => f.key === "Notes"
      )?.type
    ).toBe("input");

    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR + 1 });
    const otherYearFields = await leader.query(api.attendanceMetadata.list, {
      year: YEAR + 1,
    });
    const foreignField = otherYearFields[0]!;
    await leader.mutation(api.attendanceMetadata.saveAll, {
      year: YEAR,
      fields: [
        {
          id: foreignField._id,
          key: "Foreign",
          type: "input",
          order: 99,
        },
      ],
      deleteIds: [foreignField._id],
    });
    expect(
      await leader.query(api.attendanceMetadata.list, { year: YEAR + 1 })
    ).toHaveLength(otherYearFields.length);
  });
});

describe("attendance members", () => {
  test("list combines staff profiles with attendance-only members", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      year: YEAR,
      name: "Guest Member",
      email: "guest@example.com",
    });
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(page.page.some((r) => r.key === `member:${memberId}`)).toBe(true);
    expect(page.page.some((r) => r.key === `staff:${LEADER}`)).toBe(true);
    expect(
      await t.query(api.attendanceMembers.list, {
        year: YEAR,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).toEqual({ page: [], isDone: true, continueCursor: "" });
  });

  test("search, filter, sort, and paginate", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    const fields = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    const yearField = fields.find((f) => f.key === "Year")!;
    const year3Id = Object.entries(yearField.values ?? {}).find(
      ([, label]) => label === "3"
    )?.[0]!;

    await leader.mutation(api.attendanceMembers.create, {
      year: YEAR,
      name: "Zara Alpha",
      metadata: { [yearField._id]: String(YEAR - 2) },
    });
    await leader.mutation(api.attendanceMembers.create, {
      year: YEAR,
      name: "Beta Guest",
      metadata: { [yearField._id]: String(YEAR - 1) },
    });

    const searched = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      search: "zara",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(searched.page.every((r) => r.name.toLowerCase().includes("zara"))).toBe(
      true
    );

    const genderField = fields.find((f) => f.key === "Gender")!;
    const genderMaleId = Object.entries(genderField.values ?? {}).find(
      ([, label]) => label === "Male"
    )?.[0]!;

    await leader.mutation(api.attendanceMembers.create, {
      year: YEAR,
      name: "Meta Guest",
      metadata: { [genderField._id]: genderMaleId },
    });
    const roster = await leader.query(api.attendance.roster, { year: YEAR });
    expect(roster.some((r) => r.name === "Meta Guest" && r.subtitle?.includes("Male"))).toBe(
      true
    );

    const filtered = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: year3Id },
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(filtered.page.some((r) => r.name === "Zara Alpha")).toBe(true);
    expect(filtered.page.some((r) => r.name === "Beta Guest")).toBe(false);

    const byGender = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [genderField._id]: genderMaleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byGender.page.some((r) => r.name === "Meta Guest")).toBe(true);

    const byMetaSort = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: genderField._id,
      sortAsc: true,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byMetaSort.page.length).toBeGreaterThan(0);

    const campusField = fields.find((f) => f.key === "Campus")!;
    const roleField = fields.find((f) => f.key === "Role")!;
    await leader.mutation(api.attendanceMetadata.saveAll, {
      year: YEAR,
      fields: [
        {
          id: campusField._id,
          key: "Campus",
          type: "select",
          order: campusField.order,
          values: { ...campusField.values, "99": "Other" },
          lockedValues: campusField.lockedValues,
        },
      ],
      deleteIds: [],
    });
    const otherId = "99";
    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      year: YEAR,
      staffEmail: LEADER,
    });
    const refreshedFields = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    const refreshedCampus = refreshedFields.find((f) => f.key === "Campus")!;
    const refreshedRole = refreshedFields.find((f) => f.key === "Role")!;
    const usydId = Object.entries(refreshedCampus.values ?? {}).find(
      ([, label]) => label === USYD
    )?.[0]!;
    const leaderRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Student Leader"
    )?.[0]!;
    await leader.mutation(api.attendanceMembers.update, {
      memberId: shadowId,
      name: "ignored",
      metadata: { [refreshedCampus._id]: otherId, [roleField._id]: "Member" },
    });
    const listed = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    const staffRow = listed.page.find((r) => r.email === LEADER);
    expect(staffRow?.university).toBe(USYD);
    expect(staffRow?.metadata[refreshedCampus._id]).toBe(usydId);
    expect(staffRow?.metadata[refreshedRole._id]).toBe(leaderRoleId);

    const unset = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: "unset" },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(unset.page.every((r) => !r.metadata[yearField._id])).toBe(true);

    const byYearSort = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: yearField._id,
      sortAsc: false,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byYearSort.page.length).toBeGreaterThan(0);

    const sorted = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: "name",
      sortAsc: true,
      paginationOpts: { numItems: 20, cursor: null },
    });
    const guestNames = sorted.page
      .filter((r) => r.kind === "member")
      .map((r) => r.name);
    expect(guestNames.indexOf("Beta Guest")).toBeLessThan(
      guestNames.indexOf("Zara Alpha")
    );

    const page1 = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(page1.isDone).toBe(false);
    const page2 = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page2.page.length).toBeGreaterThan(0);
  });

  test("ensureForStaff, update, get, and remove", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { year: YEAR });
    const fields = await leader.query(api.attendanceMetadata.list, { year: YEAR });
    const yearField = fields.find((f) => f.key === "Year")!;

    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      year: YEAR,
      staffEmail: LEADER,
    });
    expect(
      await leader.mutation(api.attendanceMembers.ensureForStaff, {
        year: YEAR,
        staffEmail: LEADER,
      })
    ).toBe(shadowId);

    await leader.mutation(api.attendanceMembers.update, {
      memberId: shadowId,
      name: "ignored",
      metadata: { [yearField._id]: String(YEAR) },
    });
    const shadow = await leader.query(api.attendanceMembers.get, {
      memberId: shadowId,
    });
    expect(shadow?.metadata?.[yearField._id]).toBe(String(YEAR));

    const guestId = await leader.mutation(api.attendanceMembers.create, {
      year: YEAR,
      name: "Guest",
    });
    await leader.mutation(api.attendanceMembers.update, {
      memberId: guestId,
      name: "Guest Renamed",
      email: "guest@test.org",
    });
    expect(await t.query(api.attendanceMembers.get, { memberId: guestId })).toBeNull();

    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId, memberId: guestId });
    await leader.mutation(api.attendanceMembers.remove, { memberId: guestId });
    expect(await leader.query(api.attendanceMembers.get, { memberId: guestId })).toBeNull();
    expect(await leader.query(api.attendance.listByEvent, { eventId })).toEqual([]);

    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        year: YEAR,
        staffEmail: "   ",
      })
    ).rejects.toThrow(/email is required/i);
    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        year: YEAR,
        staffEmail: OUTSIDER,
      })
    ).rejects.toThrow(/not found/i);
    await expect(
      leader.mutation(api.attendanceMembers.create, { year: YEAR, name: "  " })
    ).rejects.toThrow(/Name is required/i);
    const guest2 = await leader.mutation(api.attendanceMembers.create, {
      year: YEAR,
      name: "Guest Two",
    });
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId: guest2,
        name: " ",
      })
    ).rejects.toThrow(/Name is required/i);
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId: guestId,
        name: "Ghost",
      })
    ).rejects.toThrow(/Member not found/i);
  });
});
