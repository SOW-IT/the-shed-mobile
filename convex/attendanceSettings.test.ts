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

describe("attendance tags (branch coverage)", () => {
  test("plain staff cannot manage shared attendance settings", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    await expect(
      staff.mutation(api.attendanceTags.saveAll, {
        tags: [{ name: "Retreat" }],
        deleteIds: [],
      })
    ).rejects.toThrow(/admins or campus leaders/i);
    await expect(
      staff.mutation(api.attendanceMetadata.ensureDefaults, {})
    ).rejects.toThrow(/admins or campus leaders/i);
    await expect(
      staff.mutation(api.attendanceMetadata.saveAll, { fields: [], deleteIds: [] })
    ).rejects.toThrow(/admins or campus leaders/i);
  });

  test("updating a tag with subgroups stores the normalised subgroup list", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Retreat", colour: "purple" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, {});
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ id: tag._id, name: "Retreat", colour: "purple", subgroups: [USYD, "ALL"] }],
      deleteIds: [],
    });
    const [updated] = await leader.query(api.attendanceTags.list, {});
    expect(updated.subgroups).toContain(USYD);
  });

  test("deleteIds skips tags that don't exist", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Keep", colour: "blue" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, {});
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [],
      deleteIds: [tag._id],
    });
    // Tag is gone; deleting the same stale id again is silently ignored.
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [],
        deleteIds: [tag._id],
      })
    ).resolves.toBeNull();
  });
});

describe("attendance tags", () => {
  test("list is staff-only and sorted by name", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Zeta", colour: "blue" }, { name: "Alpha", colour: "red" }],
      deleteIds: [],
    });
    expect(await t.query(api.attendanceTags.list, {})).toEqual([]);
    const tags = await leader.query(api.attendanceTags.list, {});
    expect(tags.map((tag) => tag.name)).toEqual(["Alpha", "Zeta"]);
  });

  test("saveAll updates, deletes, and validates names", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Social", colour: "green" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, {});
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ id: tag._id, name: "Social Night", colour: "teal" }],
      deleteIds: [],
    });
    expect(
      (await leader.query(api.attendanceTags.list, {}))[0].name
    ).toBe("Social Night");
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [],
      deleteIds: [tag._id],
    });
    expect(await leader.query(api.attendanceTags.list, {})).toEqual([]);
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [{ name: "   " }],
        deleteIds: [],
      })
    ).rejects.toThrow(/needs a name/i);
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [{ name: "Dup" }, { name: "dup" }],
        deleteIds: [],
      })
    ).rejects.toThrow(/Duplicate tag/i);
  });
});

describe("consolidateAttendanceTags migration", () => {
  test("merges same-named tags into one global row, unions scopes, remaps events, clears year", async () => {
    const t = await setup();
    // Two legacy per-year "Weekly Meeting" rows with different sub-group scopes,
    // plus a duplicate global row, seeded directly with the deprecated `year`.
    const { a2025, a2026, dup, keep, evId } = await t.run(async (ctx) => {
      const a2025 = await ctx.db.insert("attendanceTags", {
        year: YEAR,
        name: "Weekly Meeting",
        colour: "blue",
        subgroups: [USYD],
      });
      const a2026 = await ctx.db.insert("attendanceTags", {
        year: YEAR + 1,
        name: "weekly meeting",
        colour: "teal",
        subgroups: ["UNSW"],
      });
      // A third same-named row whose scope overlaps a2025 — the union must
      // de-duplicate USYD rather than list it twice.
      const dup = await ctx.db.insert("attendanceTags", {
        name: "Weekly Meeting",
        subgroups: [USYD],
      });
      const keep = await ctx.db.insert("attendanceTags", {
        year: YEAR,
        name: "Retreat",
        colour: "purple",
        subgroups: [USYD],
      });
      const evId = await ctx.db.insert("events", {
        name: "Meeting",
        dateStart: Date.now(),
        dateEnd: Date.now() + 3600_000,
        subgroups: [USYD],
        tagIds: [a2026, keep],
      });
      return { a2025, a2026, dup, keep, evId };
    });

    const res = await t.mutation(
      internal.attendanceTags.consolidateAttendanceTags,
      {}
    );
    // Two "Weekly Meeting" variants collapse into the earliest survivor.
    expect(res.merged).toBe(2);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("attendanceTags").collect()
    );
    const weekly = rows.filter(
      (r) => r.name.trim().toLowerCase() === "weekly meeting"
    );
    expect(weekly).toHaveLength(1);
    const survivor = weekly[0];
    // Survivor is the earliest-created row (a2025) and its `year` is cleared.
    expect(survivor._id).toBe(a2025);
    expect(survivor.year).toBeUndefined();
    // Scopes are unioned across the merged rows (USYD de-duplicated).
    expect(new Set(survivor.subgroups)).toEqual(new Set([USYD, "UNSW"]));

    // The event's tag id that pointed at a loser (a2026) now points at the
    // survivor, de-duplicated, with the untouched tag preserved.
    const event = await t.run(async (ctx) => ctx.db.get(evId));
    expect(new Set(event!.tagIds)).toEqual(new Set([survivor._id, keep]));

    // The non-duplicate tag survives and also has its year cleared.
    const retreat = rows.find((r) => r._id === keep);
    expect(retreat?.year).toBeUndefined();
    expect(rows.some((r) => r._id === dup)).toBe(false);

    // Idempotent: a second run merges nothing.
    const again = await t.mutation(
      internal.attendanceTags.consolidateAttendanceTags,
      {}
    );
    expect(again.merged).toBe(0);
  });
});

describe("attendance metadata", () => {
  test("ensureDefaults seeds Year/Gender/Campus/Role once", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    expect(await leader.mutation(api.attendanceMetadata.ensureDefaults, { })).toBe(
      4
    );
    expect(await leader.mutation(api.attendanceMetadata.ensureDefaults, { })).toBe(
      4
    );
    const fields = await leader.query(api.attendanceMetadata.list, { });
    expect(fields.map((f) => f.key)).toEqual(["Year", "Gender", "Campus", "Role"]);
    const campusValues = Object.values(
      fields.find((f) => f.key === "Campus")?.values ?? {}
    );
    expect(campusValues).toContain(USYD);
    expect(campusValues).toContain(MACQ);
  });

  test("ensureDefaults merges custom roles from the current staff year", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.upsertRole, {
      year: YEAR,
      name: "Volunteer",
    });
    const leader = asUser(t, LEADER);
    expect(
      await leader.mutation(api.attendanceMetadata.ensureDefaults, { })
    ).toBe(4);
    const role = (await leader.query(api.attendanceMetadata.list, { })).find(
      (f) => f.key === "Role"
    );
    expect(Object.values(role?.values ?? {})).toContain("Volunteer");
  });

  test("list is staff-only and strips Gender Other but keeps Female", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    expect(await t.query(api.attendanceMetadata.list, { })).toEqual([]);
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const gender = fields.find((f) => f.key === "Gender");
    expect(Object.values(gender?.values ?? {})).not.toContain("Other");
    expect(Object.values(gender?.values ?? {})).toContain("Female");
    expect(Object.values(gender?.values ?? {})).toContain("Male");
  });

  test("saveAll creates, patches, and guards locked values", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const campus = fields.find((f) => f.key === "Campus")!;

    await leader.mutation(api.attendanceMetadata.saveAll, {
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
    const updated = await leader.query(api.attendanceMetadata.list, { });
    expect(updated.find((f) => f.key === "Notes")).toBeTruthy();
    expect(updated.find((f) => f.key === "Campus")?.values?.["10"]).toBe("Online");

    const gender = fields.find((f) => f.key === "Gender")!;

    await leader.mutation(api.attendanceMetadata.saveAll, {
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
    const withGender = await leader.query(api.attendanceMetadata.list, { });
    expect(withGender.find((f) => f.key === "Gender")?.values).toEqual({
      "1": "Male",
      "2": "Female",
    });

    await expect(
      leader.mutation(api.attendanceMetadata.saveAll, {
        fields: [
          { key: "Dup", type: "input", order: 5 },
          { key: "dup", type: "input", order: 6 },
        ],
        deleteIds: [],
      })
    ).rejects.toThrow(/Duplicate metadata field/i);

    await leader.mutation(api.attendanceMetadata.saveAll, {
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
      (await leader.query(api.attendanceMetadata.list, { })).some(
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
    const afterUni = await leader.query(api.attendanceMetadata.list, { });
    expect(
      Object.values(afterUni.find((f) => f.key === "Campus")?.values ?? {})
    ).toContain("Western Sydney University");
    const roleField = afterUni.find((f) => f.key === "Role")!;
    expect(Object.values(roleField.values ?? {})).toContain("Volunteer");
    await leader.mutation(api.attendanceMetadata.saveAll, {
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
      (await leader.query(api.attendanceMetadata.list, { })).some(
        (f) => f.key === "Track"
      )
    ).toBe(true);

    const yearField = afterUni.find((f) => f.key === "Year")!;
    await leader.mutation(api.attendanceMetadata.saveAll, {
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
      (await leader.query(api.attendanceMetadata.list, { })).find(
        (f) => f.key === "Notes"
      )?.type
    ).toBe("input");

    // Deleting an id that no longer exists is silently skipped.
    const ghostId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("attendanceMetadata", {
        key: "Ghost",
        type: "input",
        order: 99,
      });
      await ctx.db.delete(id);
      return id;
    });
    const before = await leader.query(api.attendanceMetadata.list, {});
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [],
      deleteIds: [ghostId],
    });
    expect(await leader.query(api.attendanceMetadata.list, {})).toHaveLength(
      before.length
    );
  });

  test("Role/Campus locked values stay synced to the roles/universities tables", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });

    // Add a custom role + campus, persist the snapshot, then remove them.
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Volunteer" });
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "Temp Uni" });
    const seeded = await leader.query(api.attendanceMetadata.list, { });
    expect(seeded.find((f) => f.key === "Role")!.lockedValues).toContain("Volunteer");
    expect(seeded.find((f) => f.key === "Campus")!.lockedValues).toContain("Temp Uni");
    // Persist so the stored snapshot records Volunteer/Temp Uni as locked.
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: seeded
        .filter((f) => f.key === "Role" || f.key === "Campus")
        .map((f) => ({
          id: f._id,
          key: f.key,
          type: f.type,
          order: f.order,
          values: f.values,
          lockedValues: f.lockedValues,
        })),
      deleteIds: [],
    });

    await admin.mutation(api.admin.removeRole, { year: YEAR, name: "Volunteer" });
    await admin.mutation(api.admin.removeUniversity, { year: YEAR, name: "Temp Uni" });

    // After removal the lock set follows the tables, dropping the stale entries
    // even though they remain in the persisted snapshot.
    const after = await leader.query(api.attendanceMetadata.list, { });
    const role = after.find((f) => f.key === "Role")!;
    const campus = after.find((f) => f.key === "Campus")!;
    expect(role.lockedValues).not.toContain("Volunteer");
    expect(role.lockedValues).toContain("Staff"); // base ROLES stay locked
    expect(campus.lockedValues).not.toContain("Temp Uni");
    expect(campus.lockedValues).toContain(USYD); // still-present campus stays locked
  });
});

describe("attendance members", () => {
  test("optionIdForLabel fallback: campus not in field values returns the label", async () => {
    // Seed metadata first, then add a new university that the campus field
    // doesn't know about. When list() runs staffLockedMetadata() for the new
    // staff member it calls optionIdForLabel which falls through to "return label".
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "Late Uni" });
    await admin.mutation(api.admin.setStaffProfile, {
      email: OUTSIDER,
      year: YEAR,
      roles: ["Student Leader"],
      university: "Late Uni",
    });
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 100, cursor: null },
    });
    // The row exists even when the campus id can't be found in the field values
    expect(page.page.some((r) => r.email === OUTSIDER)).toBe(true);
  });

  test("staffLockedMetadata clears role when profile has no role assignment", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const roleField = fields.find((f) => f.key === "Role")!;

    // Insert a staff profile with empty assignments directly to bypass the
    // API constraint ("Pick at least one role"), then verify staffLockedMetadata
    // deletes the role key from the shadow's metadata (the else-branch at line 75).
    const profileId = await t.run(async (ctx) => {
      return await ctx.db.insert("staffProfiles", {
        email: OUTSIDER,
        year: YEAR,
        name: "No-Role User",
        assignments: [],
      });
    });
    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: OUTSIDER,
    });
    const roleOptionId = Object.keys(roleField.values ?? {})[0]!;
    await leader.mutation(api.attendanceMembers.update, {
      memberId: shadowId,
      name: "ignored",
      metadata: { [roleField._id]: roleOptionId },
    });
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const row = page.page.find((r) => r.email === OUTSIDER);
    // The locked metadata should not have a role set (profile has no role)
    expect(row?.metadata[roleField._id]).toBeUndefined();
    // Clean up the spurious profile (no_role is not valid in the real app)
    await t.run(async (ctx) => { await ctx.db.delete(profileId); });
  });

  test("list combines staff profiles with attendance-only members", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const memberId = await leader.mutation(api.attendanceMembers.create, {
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

  test("dedupes an attendance-only member who later becomes staff, per year", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;
    // Added as an attendance-only member (no staffEmail) under the email that
    // is a staff profile this year — the rollover-duplicate scenario.
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Future Leader",
      email: LEADER,
    });

    // This year (LEADER holds a profile): one combined staff row, not two.
    const thisYear = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    const staffRow = thisYear.page.find((r) => r.key === `staff:${LEADER}`);
    expect(staffRow?.memberId).toBe(memberId);
    expect(thisYear.page.some((r) => r.key === `member:${memberId}`)).toBe(false);

    const merged = await leader.query(api.attendanceMembers.get, {
      memberId,
      staffYear: YEAR,
    });
    expect(merged?.isStaffOverlay).toBe(true);
    expect(merged?.email).toBe(LEADER);
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "Edited Name",
      email: "edited@example.com",
      metadata: { [yearField._id]: String(YEAR - 2) },
      staffYear: YEAR,
    });
    const updated = await leader.query(api.attendanceMembers.get, {
      memberId,
      staffYear: YEAR,
    });
    if (!updated) throw new Error("Expected merged attendance member");
    expect(updated?.isStaffOverlay).toBe(true);
    expect(updated?.email).toBe(LEADER);
    expect(updated.metadata?.[yearField._id]).toBe(String(YEAR - 2));

    // A year in which LEADER held no profile: shown as the plain member they
    // were then, not retroactively promoted to staff.
    const pastYear = await leader.query(api.attendanceMembers.list, {
      year: YEAR - 5,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(pastYear.page.some((r) => r.key === `member:${memberId}`)).toBe(true);
    expect(pastYear.page.some((r) => r.key === `staff:${LEADER}`)).toBe(false);
  });

  test("list shows a member whose email has no profile this year as a plain member", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    // A pool member whose email is a SOW address with no staff profile this
    // year. Linking is by email alone, so with no matching profile it's just a
    // plain member (there's no longer a staffEmail flag to hide it behind).
    const ghostId = await t.run(async (ctx) =>
      ctx.db.insert("attendanceMembers", {
        name: "Ghost",
        email: "ghost@sow.org.au",
      })
    );
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    const row = page.page.find((r) => r.memberId === ghostId);
    expect(row?.kind).toBe("member");
    expect(row?.name).toBe("Ghost");
  });

  test("ensureForStaff reuses an existing member with the staff email instead of duplicating", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    // STAFF was added as an attendance-only member under the staff email, before
    // being asked for as a staff overlay.
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Staff Person",
      email: STAFF,
    });
    const ensured = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: STAFF,
    });
    expect(ensured).toBe(memberId);
    // Linked purely by email — one row.
    const rows = (
      await t.run(async (ctx) => ctx.db.query("attendanceMembers").collect())
    ).filter((m) => m.email === STAFF);
    expect(rows).toHaveLength(1);
  });

  test("ensureForStaff reuses a member stored under a differently-cased/spaced email", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    // Created through the app with messy casing/whitespace — writes normalise it,
    // so the exact-match by_email link still finds it (no duplicate overlay).
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Cased Staff",
      email: "  STAFF@SOW.ORG.AU  ",
    });
    const ensured = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: STAFF,
    });
    expect(ensured).toBe(memberId);
    const rows = (
      await t.run(async (ctx) => ctx.db.query("attendanceMembers").collect())
    ).filter((m) => m.name === "Cased Staff" || m.email === STAFF);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe(STAFF);
  });

  test("update refuses a staff overlay when no profile exists for the requested year", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const memberId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    // LEADER holds a profile in the current staff year but not YEAR - 5, so the
    // overlay must not be silently edited as a plain member for that year.
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId,
        name: "New Name",
        staffYear: YEAR - 5,
      })
    ).rejects.toThrow(/not found/i);
  });

  test("ensureForStaff won't adopt an unlinked member without a staff profile", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    // OUTSIDER has no staff profile this year, but exists as a plain member.
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Outside Person",
      email: OUTSIDER,
    });
    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: OUTSIDER,
      })
    ).rejects.toThrow(/not found/i);
    // The plain member is left untouched — not converted to a staff overlay.
    const row = await t.run((ctx) => ctx.db.get(memberId));
    expect(row?.email).toBe(OUTSIDER);
  });

  test("search, filter, sort, and paginate", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "president@sow.org.au",
      year: YEAR,
      roles: ["President"],
      university: USYD,
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "outsource@sow.org.au",
      year: YEAR,
      roles: ["Outsource"],
      department: "Missions",
    });
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;
    const year3Id = Object.entries(yearField.values ?? {}).find(
      ([, label]) => label === "3"
    )?.[0]!;

    await leader.mutation(api.attendanceMembers.create, {
      name: "Zara Alpha",
      metadata: { [yearField._id]: String(YEAR - 2) },
    });
    await leader.mutation(api.attendanceMembers.create, {
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
    const genderFemaleId = Object.entries(genderField.values ?? {}).find(
      ([, label]) => label === "Female"
    )?.[0]!;

    await leader.mutation(api.attendanceMembers.create, {
      name: "Meta Guest",
      metadata: { [genderField._id]: genderMaleId },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Multi Filter Guest",
      metadata: { [genderField._id]: genderFemaleId },
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

    const byMultipleGenders = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [genderField._id]: [genderMaleId, genderFemaleId] },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byMultipleGenders.page.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Meta Guest", "Multi Filter Guest"])
    );

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
      fields: [
        {
          id: campusField._id,
          key: "Campus",
          type: "select",
          order: campusField.order,
          values: { ...campusField.values, "99": "Other" },
          lockedValues: campusField.lockedValues,
        },
        {
          id: roleField._id,
          key: "Role",
          type: "select",
          order: roleField.order,
          values: {
            ...roleField.values,
            "97": "Alumni",
            "98": "Newcomer",
          },
          lockedValues: roleField.lockedValues,
        },
      ],
      deleteIds: [],
    });
    const otherId = "99";
    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    const refreshedFields = await leader.query(api.attendanceMetadata.list, { });
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

    const staffRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Staff"
    )?.[0]!;
    const studentLeaderRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Student Leader"
    )?.[0]!;
    const memberRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Member"
    )?.[0]!;
    const newcomerRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Newcomer"
    )?.[0]!;
    const alumniRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Alumni"
    )?.[0]!;
    await leader.mutation(api.attendanceMembers.create, {
      name: "Member Role Guest",
      metadata: { [refreshedRole._id]: memberRoleId },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Newcomer Role Guest",
      metadata: { [refreshedRole._id]: newcomerRoleId },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Alumni Role Guest",
      metadata: { [refreshedRole._id]: alumniRoleId },
    });
    const byStaffRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: staffRoleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byStaffRole.page.some((r) => r.email === STAFF)).toBe(true);
    expect(byStaffRole.page.some((r) => r.email === "outsource@sow.org.au")).toBe(
      true
    );
    expect(byStaffRole.page.some((r) => r.email === LEADER)).toBe(false);
    expect(byStaffRole.page.some((r) => r.email === "president@sow.org.au")).toBe(
      false
    );
    expect(byStaffRole.page.some((r) => r.name === "Member Role Guest")).toBe(false);
    expect(byStaffRole.page.some((r) => r.name === "Newcomer Role Guest")).toBe(
      false
    );
    expect(byStaffRole.page.some((r) => r.name === "Alumni Role Guest")).toBe(false);

    const byStudentLeaderRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: studentLeaderRoleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byStudentLeaderRole.page.some((r) => r.email === LEADER)).toBe(true);
    expect(
      byStudentLeaderRole.page.some((r) => r.email === "president@sow.org.au")
    ).toBe(true);
    expect(byStudentLeaderRole.page.some((r) => r.email === STAFF)).toBe(false);

    const byNewcomerRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: newcomerRoleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byNewcomerRole.page.map((r) => r.name)).toContain(
      "Newcomer Role Guest"
    );
    expect(byNewcomerRole.page.some((r) => r.email === STAFF)).toBe(false);

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
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;

    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    expect(
      await leader.mutation(api.attendanceMembers.ensureForStaff, {
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
        staffEmail: "   ",
      })
    ).rejects.toThrow(/email is required/i);
    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: OUTSIDER,
      })
    ).rejects.toThrow(/not found/i);
    await expect(
      leader.mutation(api.attendanceMembers.create, { name: "  " })
    ).rejects.toThrow(/Name is required/i);
    const guest2 = await leader.mutation(api.attendanceMembers.create, {
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

describe("metadata saveAll edge cases", () => {
  test("deleting a locked field throws ConvexError", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;
    await expect(
      leader.mutation(api.attendanceMetadata.saveAll, {
        fields: [],
        deleteIds: [yearField._id],
      })
    ).rejects.toThrow(/Cannot delete locked/i);
  });

  test("deleting a custom field strips its value from members that have it", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [{ key: "Track", type: "input", order: 99 }],
      deleteIds: [],
    });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const trackField = fields.find((f) => f.key === "Track")!;
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Trackee",
      metadata: { [trackField._id]: "Morning" },
    });
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [],
      deleteIds: [trackField._id],
    });
    const member = await leader.query(api.attendanceMembers.get, { memberId });
    expect(member?.metadata?.[trackField._id]).toBeUndefined();
  });

  test("saving a field with a locked value removed throws ConvexError", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          key: "Track",
          type: "select",
          order: 99,
          values: { "1": "Morning", "2": "Evening" },
          lockedValues: ["Morning"],
        },
      ],
      deleteIds: [],
    });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const trackField = fields.find((f) => f.key === "Track")!;
    await expect(
      leader.mutation(api.attendanceMetadata.saveAll, {
        fields: [
          {
            id: trackField._id,
            key: "Track",
            type: "select",
            order: 99,
            values: { "2": "Evening" },
            lockedValues: ["Morning"],
          },
        ],
        deleteIds: [],
      })
    ).rejects.toThrow(/Cannot remove locked value/i);
  });
});

describe("attendanceMembers.byName", () => {
  test("matches case-insensitively, trims, and is staff-only", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const campus = fields.find((f) => f.key === "Campus")!;
    const usydId = Object.entries(campus.values ?? {}).find(
      ([, label]) => label === USYD
    )![0];

    await leader.mutation(api.attendanceMembers.create, {
      name: "Jane Doe",
      email: "jane@example.com",
      metadata: { [campus._id]: usydId },
    });
    await leader.mutation(api.attendanceMembers.create, { name: "Jane Doe" });
    await leader.mutation(api.attendanceMembers.create, { name: "Someone Else" });

    // Unauthenticated callers get nothing.
    expect(await t.query(api.attendanceMembers.byName, { name: "Jane Doe" })).toEqual(
      []
    );
    // Empty/whitespace name short-circuits.
    expect(await leader.query(api.attendanceMembers.byName, { name: "  " })).toEqual(
      []
    );

    const matches = await leader.query(api.attendanceMembers.byName, {
      name: "  jane DOE ",
    });
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.name).sort()).toEqual(["Jane Doe", "Jane Doe"]);
    const withCampus = matches.find((m) => m.email === "jane@example.com")!;
    expect(withCampus.metadata[campus._id]).toBe(usydId);

    expect(
      await leader.query(api.attendanceMembers.byName, { name: "nobody" })
    ).toEqual([]);
  });
});

describe("consolidateAttendanceMetadata migration", () => {
  test("merges duplicate fields into one global set and remaps member metadata", async () => {
    const t = convexTest(schema, modules);
    // Pre-consolidation shape: two duplicate Gender rows with DIFFERENT
    // option-id schemes, plus an input "Notes" pair, inserted directly.
    const ids = await t.run(async (ctx) => {
      const genderA = await ctx.db.insert("attendanceMetadata", {
        key: "Gender",
        type: "select" as const,
        order: 1,
        values: { "1": "Male", "2": "Female" },
      });
      const genderB = await ctx.db.insert("attendanceMetadata", {
        key: "Gender",
        type: "select" as const,
        order: 1,
        values: { "1": "Female", "2": "Male", "3": "Other" },
      });
      const notesA = await ctx.db.insert("attendanceMetadata", {
        key: "Notes",
        type: "input" as const,
        order: 2,
      });
      const notesB = await ctx.db.insert("attendanceMetadata", {
        key: "Notes",
        type: "input" as const,
        order: 2,
      });
      // M references the LOSER (B) gender id, value Female (B "1").
      const m = await ctx.db.insert("attendanceMembers", {
        name: "M",
        metadata: { [genderB]: "1" },
      });
      // N has BOTH ids set — the clobber guard keeps the survivor's value.
      const n = await ctx.db.insert("attendanceMembers", {
        name: "N",
        metadata: { [genderA]: "1", [genderB]: "2" },
      });
      // P has an unknown option id on the loser — it passes through.
      const p = await ctx.db.insert("attendanceMembers", {
        name: "P",
        metadata: { [genderB]: "9" },
      });
      // Q references the loser INPUT field.
      const q = await ctx.db.insert("attendanceMembers", {
        name: "Q",
        metadata: { [notesB]: "hi" },
      });
      return { genderA, genderB, notesA, notesB, m, n, p, q };
    });

    const result = await t.mutation(
      internal.attendanceMetadata.consolidateAttendanceMetadata,
      {}
    );
    expect(result.merged).toBe(2);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("attendanceMetadata").collect()
    );
    const gender = rows.filter((r) => r.key === "Gender");
    expect(gender).toHaveLength(1);
    expect(gender[0]._id).toBe(ids.genderA);
    // The survivor gained the loser-only "Other" label.
    expect(Object.values(gender[0].values ?? {})).toContain("Other");
    expect(rows.filter((r) => r.key === "Notes")).toHaveLength(1);

    const meta = async (id: typeof ids.m) =>
      (await t.run(async (ctx) => ctx.db.get(id)))!.metadata!;
    const survFemaleId = Object.entries(gender[0].values ?? {}).find(
      ([, label]) => label === "Female"
    )![0];
    // M: B "1" (Female) remapped to the survivor's Female id, by label.
    expect((await meta(ids.m))[ids.genderA]).toBe(survFemaleId);
    expect((await meta(ids.m))[ids.genderB]).toBeUndefined();
    // N: survivor already had a value, so it is kept; loser id dropped.
    expect((await meta(ids.n))[ids.genderA]).toBe("1");
    expect((await meta(ids.n))[ids.genderB]).toBeUndefined();
    // P: an unknown option id passes through unchanged.
    expect((await meta(ids.p))[ids.genderA]).toBe("9");
    // Q: the input value moves to the survivor input field.
    expect((await meta(ids.q))[ids.notesA]).toBe("hi");

    // Idempotent: a second run merges nothing.
    const again = await t.mutation(
      internal.attendanceMetadata.consolidateAttendanceMetadata,
      {}
    );
    expect(again.merged).toBe(0);
  });
});
