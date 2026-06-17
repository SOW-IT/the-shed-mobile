/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  assignmentsOf,
  CHAPLAINCY_DEPARTMENT,
  departmentsOf,
  isHeadOfDivisionName,
  isMemberOfDepartment,
  rolesForDepartment,
  staffYearForDate,
} from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

/** Seeds the SOW org structure (divisions, departments incl. Chaplaincy). */
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  return t;
}

const profileOf = async (t: TestConvex<typeof schema>, email: string) =>
  (await asUser(t, ADMIN).query(api.admin.listStaffProfiles, { year: YEAR }))!.find(
    (p) => p.email === email
  )!;

// ---------------------------------------------------------------------------
// assignmentsOf — pure derivation from legacy fields
// ---------------------------------------------------------------------------

describe("assignmentsOf (pure)", () => {
  test("derives from a legacy single role + department", () => {
    expect(assignmentsOf({ role: "Staff", department: "Marketing" })).toEqual([
      { role: "Staff", department: "Marketing" },
    ]);
  });

  test("derives a campus role from the legacy university", () => {
    expect(
      assignmentsOf({ roles: ["Student Leader"], university: "USYD" })
    ).toEqual([{ role: "Student Leader", university: "USYD" }]);
  });

  test("derives a chaplain as Chaplaincy department + optional university", () => {
    expect(
      assignmentsOf({ roles: ["Senior Chaplain"], university: "USYD" })
    ).toEqual([
      { role: "Senior Chaplain", department: CHAPLAINCY_DEPARTMENT, university: "USYD" },
    ]);
  });

  test("derives a Head of Division from the legacy division", () => {
    expect(
      assignmentsOf({ roles: ["Head of Division"], division: "Operations" })
    ).toEqual([{ role: "Head of Division", division: "Operations" }]);
  });

  test("Member carries no scope", () => {
    expect(assignmentsOf({ roles: ["Member"], department: "Marketing" })).toEqual([
      { role: "Member" },
    ]);
  });

  test("stored assignments win over legacy fields", () => {
    const stored = [
      { role: "Head of Department", department: "Finance" },
      { role: "Staff", department: "Marketing" },
    ];
    expect(
      assignmentsOf({
        assignments: stored,
        roles: ["Staff"],
        department: "Events",
      })
    ).toEqual(stored);
  });
});

// ---------------------------------------------------------------------------
// Head of multiple departments / divisions
// ---------------------------------------------------------------------------

describe("heads of multiple scopes", () => {
  test("one person heads two departments and two divisions at once", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "multi@sow.org.au";

    // Head of two departments…
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: email,
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Alumni", division: "Engagement", headEmail: email,
    });
    // …and two divisions.
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Operations", headEmail: email,
    });
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Engagement", headEmail: email,
    });

    const p = await profileOf(t, email);
    expect(departmentsOf(p).sort()).toEqual(["Alumni", "Marketing"]);
    expect(p.assignments).toContainEqual({
      role: "Head of Department", department: "Marketing",
    });
    expect(p.assignments).toContainEqual({
      role: "Head of Department", department: "Alumni",
    });
    expect(isHeadOfDivisionName(p, "Operations")).toBe(true);
    expect(isHeadOfDivisionName(p, "Engagement")).toBe(true);
  });

  test("the only-one-head rule still holds; moving a headship is per-scope", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const first = "first@sow.org.au";
    const second = "second@sow.org.au";

    // First heads Marketing and Alumni.
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: first,
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Alumni", division: "Engagement", headEmail: first,
    });
    // Move only Marketing's headship to second.
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: second,
    });

    const firstP = await profileOf(t, first);
    const secondP = await profileOf(t, second);
    // First keeps Alumni, loses Marketing.
    expect(departmentsOf(firstP)).toEqual(["Alumni"]);
    expect(firstP.assignments).toEqual([
      { role: "Head of Department", department: "Alumni" },
    ]);
    // Second now solely heads Marketing.
    expect(secondP.assignments).toEqual([
      { role: "Head of Department", department: "Marketing" },
    ]);

    // The department records exactly one head.
    const chart = (await admin.query(api.directory.orgChart, { year: YEAR }))!;
    const marketing = chart.divisions
      .flatMap((d) => d.departments)
      .find((d) => d.name === "Marketing")!;
    expect(marketing.head?.email).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// Mixed person renders in every place they're linked
// ---------------------------------------------------------------------------

describe("mixed person in the org chart", () => {
  test("HOD of A + Staff of B + HODiv of C appears in all three", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "mixed@sow.org.au";

    // Staff of Marketing.
    await admin.mutation(api.admin.setStaffProfile, {
      email, year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    // Head of Finance.
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: email,
    });
    // Head of Operations division.
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Operations", headEmail: email,
    });

    const p = await profileOf(t, email);
    expect(rolesForDepartment(p, "Marketing")).toEqual(["Staff"]);
    expect(rolesForDepartment(p, "Finance")).toEqual(["Head of Department"]);
    expect(isHeadOfDivisionName(p, "Operations")).toBe(true);

    const chart = (await admin.query(api.directory.orgChart, { year: YEAR }))!;
    const allDepts = chart.divisions.flatMap((d) => d.departments);
    const marketing = allDepts.find((d) => d.name === "Marketing")!;
    const finance = allDepts.find((d) => d.name === "Finance")!;
    const operations = chart.divisions.find((d) => d.name === "Operations")!;

    expect(marketing.members.map((m) => m.email)).toContain(email);
    expect(finance.head?.email).toBe(email);
    expect(operations.head?.email).toBe(email);
  });
});

// ---------------------------------------------------------------------------
// Chaplaincy
// ---------------------------------------------------------------------------

describe("chaplaincy roles", () => {
  test("a chaplain is fixed to the Chaplaincy department and may carry a campus", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "chaplain@sow.org.au";
    await admin.mutation(api.admin.setStaffProfile, {
      email,
      year: YEAR,
      roles: ["Senior Chaplain"],
      university: "University of Sydney",
    });
    const p = await profileOf(t, email);
    expect(p.assignments).toEqual([
      {
        role: "Senior Chaplain",
        department: CHAPLAINCY_DEPARTMENT,
        university: "University of Sydney",
      },
    ]);
    expect(isMemberOfDepartment(p, CHAPLAINCY_DEPARTMENT)).toBe(true);
    // Chaplains render under Chaplaincy, not the campus block.
    const chart = (await admin.query(api.directory.orgChart, { year: YEAR }))!;
    const usyd = chart.universities.find((u) => u.name === "University of Sydney");
    expect(usyd?.members.map((m) => m.email) ?? []).not.toContain(email);
  });

  test("assigning a chaplain fails when the Chaplaincy department is missing", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // The seed creates Chaplaincy; remove it so the guard trips.
    await admin.mutation(api.admin.removeDepartment, {
      year: YEAR, name: CHAPLAINCY_DEPARTMENT,
    });
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "c@sow.org.au", year: YEAR, roles: ["Junior Chaplain"],
      })
    ).rejects.toThrow(/Chaplaincy.*doesn't exist/);
  });
});

describe("admin via division headship", () => {
  test("the head of an admin division is treated as an admin", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "hrhead@sow.org.au";
    // Human Resources is an admin division (see ADMIN_DIVISIONS).
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Human Resources", headEmail: email,
    });
    const me = await asUser(t, email).query(api.directory.me, {});
    expect(me?.isAdmin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Request submission
// ---------------------------------------------------------------------------

describe("request submit with multiple departments", () => {
  test("defaults to the HOD department, else first assignment department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "req@sow.org.au";
    // Staff of Marketing + Head of Finance.
    await admin.mutation(api.admin.setStaffProfile, {
      email, year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: email,
    });

    const id = await asUser(t, email).mutation(api.requests.submit, {
      description: "Lunch", amount: 10,
    });
    const req = await t.run((ctx) => ctx.db.get("requests", id));
    // Defaults to the department they head.
    expect(req!.department).toBe("Finance");
  });

  test("HODiv of two divisions auto-skips HOD for requests in both", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "hodiv2@sow.org.au";
    // Finance approvers must exist or submit refuses (would deadlock).
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: "fhead@sow.org.au",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "bm@sow.org.au", year: YEAR, roles: ["Staff"], department: "Finance",
    });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: "bm@sow.org.au" });
    // Departments in two different divisions, with heads who are NOT the submitter.
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: "mh@sow.org.au",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations", headEmail: "eh@sow.org.au",
    });
    // Submitter heads BOTH divisions.
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Engagement", headEmail: email,
    });
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Operations", headEmail: email,
    });

    for (const department of ["Marketing", "Events"]) {
      const id = await asUser(t, email).mutation(api.requests.submit, {
        description: "x", amount: 10, department,
      });
      const req = await t.run((ctx) => ctx.db.get("requests", id));
      // Division head's request skips the HOD step in either division.
      expect(req!.approvedByHOD).toBe("APPROVED");
    }
  });
});

// ---------------------------------------------------------------------------
// Guarding structural deletes
// ---------------------------------------------------------------------------

describe("structural deletes cascade to assignments", () => {
  test("removeDepartment strips assignments even when a member is linked via assignments", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "m@sow.org.au";
    // Member of Marketing AND head of Finance — Marketing assignment should be
    // stripped when Marketing is deleted, Finance link must be preserved.
    await admin.mutation(api.admin.setStaffProfile, {
      email, year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: email,
    });
    await admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Marketing" });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const m = profiles.find((p) => p.email === email)!;
    // Marketing assignment stripped; Finance (HOD) link survives.
    expect(m.assignments?.some((a) => a.department === "Marketing")).toBe(false);
    expect(m.assignments?.some((a) => a.department === "Finance")).toBe(true);
  });

  test("removeUniversity strips assignments even when a member is linked via assignments", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "sl@sow.org.au";
    await admin.mutation(api.admin.setStaffProfile, {
      email,
      year: YEAR,
      roles: ["Student Leader"],
      university: "University of New South Wales",
    });
    await admin.mutation(api.admin.removeUniversity, {
      year: YEAR, name: "University of New South Wales",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const sl = profiles.find((p) => p.email === email)!;
    expect(sl.assignments?.some((a) => a.university === "University of New South Wales")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Finance access via membership (not the single legacy field)
// ---------------------------------------------------------------------------

describe("finance access via membership", () => {
  test("a Finance member who also heads another dept can be Budget Manager", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "fin@sow.org.au";
    // Staff of Finance…
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email, year: YEAR, roles: ["Staff"], department: "Finance",
    });
    // …and head of Marketing (so the legacy department would be Marketing).
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: email,
    });
    // Still recognised as Finance for Budget Manager purposes.
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email });
    const settings = await t.run((ctx) =>
      ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .unique()
    );
    expect(settings?.budgetManagerEmail).toBe(email);
  });
});

// ---------------------------------------------------------------------------
// Backfill + copyYear
// ---------------------------------------------------------------------------

describe("backfillAssignments", () => {
  test("derives assignments from legacy fields and authoritative heads; idempotent", async () => {
    const t = await setup();

    // Insert a legacy-shaped profile directly (no assignments), and make them
    // a real department head via the head doc only.
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "legacy@sow.org.au",
        year: YEAR,
        roles: ["Staff"],
        department: "Marketing",
      });
      // Department head doc points at them, but their roles say only Staff.
      const dept = await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) =>
          q.eq("year", YEAR).eq("name", "Alumni")
        )
        .unique();
      await ctx.db.patch("departments", dept!._id, { headEmail: "legacy@sow.org.au" });
      // A division head doc points at them too (authoritative).
      const div = await ctx.db
        .query("divisions")
        .withIndex("by_year_and_name", (q) =>
          q.eq("year", YEAR).eq("name", "Operations")
        )
        .unique();
      await ctx.db.patch("divisions", div!._id, { headEmail: "legacy@sow.org.au" });
    });

    const first = await t.mutation(internal.admin.backfillAssignments, {});
    expect(first.updated).toBeGreaterThan(0);

    const p = await profileOf(t, "legacy@sow.org.au");
    // Authoritative head wins: they gain Head of Department for Alumni…
    expect(p.assignments).toContainEqual({
      role: "Head of Department", department: "Alumni",
    });
    // …a Head of Division link for Operations…
    expect(p.assignments).toContainEqual({
      role: "Head of Division", division: "Operations",
    });
    // …and keep their Staff-of-Marketing membership.
    expect(p.assignments).toContainEqual({ role: "Staff", department: "Marketing" });
    expect(p.roles.sort()).toEqual([
      "Head of Department",
      "Head of Division",
      "Staff",
    ]);

    // Idempotent: a second run produces the same assignments.
    await t.mutation(internal.admin.backfillAssignments, {});
    const p2 = await profileOf(t, "legacy@sow.org.au");
    expect(p2.assignments).toEqual(p.assignments);
  });
});

describe("stripDeprecatedProfileFields", () => {
  test("derives assignments from legacy fields then clears them", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "legacy@sow.org.au",
        year: YEAR,
        roles: ["Staff"],
        department: "Marketing",
      });
    });

    const { updated } = await t.mutation(
      internal.admin.stripDeprecatedProfileFields,
      {}
    );
    expect(updated).toBeGreaterThan(0);

    const doc = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", "legacy@sow.org.au").eq("year", YEAR)
        )
        .unique()
    );
    // Assignments derived from the legacy fields…
    expect(doc?.assignments).toEqual([{ role: "Staff", department: "Marketing" }]);
    // …and every deprecated field unset.
    expect(doc?.roles).toBeUndefined();
    expect(doc?.role).toBeUndefined();
    expect(doc?.department).toBeUndefined();
    expect(doc?.division).toBeUndefined();
    expect(doc?.university).toBeUndefined();
  });

  test("leaves an already-migrated profile's assignments intact", async () => {
    const t = await setup();
    const stored = [{ role: "Staff", department: "Marketing" }];
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "modern@sow.org.au",
        year: YEAR,
        assignments: stored,
      });
    });

    await t.mutation(internal.admin.stripDeprecatedProfileFields, {});

    const doc = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", "modern@sow.org.au").eq("year", YEAR)
        )
        .unique()
    );
    expect(doc?.assignments).toEqual(stored);
  });
});

describe("copyYear", () => {
  test("copies assignments and division headEmail to the next year", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "carry@sow.org.au";
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: email,
    });
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Operations", headEmail: email,
    });

    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });

    const next = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", email).eq("year", YEAR + 1)
        )
        .unique()
    );
    expect(next?.assignments).toContainEqual({
      role: "Head of Department", department: "Marketing",
    });
    expect(next?.assignments).toContainEqual({
      role: "Head of Division", division: "Operations",
    });

    // The division headEmail is carried over (previously a latent bug).
    const nextDivision = await t.run((ctx) =>
      ctx.db
        .query("divisions")
        .withIndex("by_year_and_name", (q) =>
          q.eq("year", YEAR + 1).eq("name", "Operations")
        )
        .unique()
    );
    expect(nextDivision?.headEmail).toBe(email);
  });
});
