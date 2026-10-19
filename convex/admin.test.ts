/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const FIONA = "fiona@sow.org.au";
const BELLA = "bella@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  const year = staffYearForDate(new Date());
  await admin.mutation(api.admin.upsertDepartment, {
    year,
    name: "Finance",
    division: "Governance",
    headEmail: FIONA,
  });
  await admin.mutation(api.admin.setStaffProfile, {
    email: BELLA,
    year,
    roles: ["Staff"],
    department: "Finance",
  });
  return t;
}

const stripFinanceHolders = (t: TestConvex<typeof schema>) =>
  t.run(async (ctx) => {
    for (const profile of await ctx.db.query("staffProfiles").collect()) {
      if (profile.assignments?.some((a) => a.department === "Finance")) {
        await ctx.db.patch(profile._id, { assignments: [] });
      }
    }
  });

describe("setStaffProfile validation", () => {
  test("rejects bad emails, empty role lists, and unknown roles", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "not-an-email",
        year: YEAR,
        roles: ["Staff"],
        department: "Finance",
      })
    ).rejects.toThrow(/valid email/);
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        roles: [],
      })
    ).rejects.toThrow(/at least one role/);
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        roles: ["Wizard"],
      })
    ).rejects.toThrow(/Roles must be among/);
  });

  test("head roles can't be assigned through staff profiles", async () => {
    const t = await setup();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        roles: ["Head of Department"],
        department: "Finance",
      })
    ).rejects.toThrow(/Structure section/);
  });

  test("legacy path: re-saving only the held head role needs no department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      roles: ["Head of Department"],
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const fiona = profiles.find((p) => p.email === FIONA)!;
    expect(fiona.roles).toEqual(["Head of Department"]);
  });

  test("editing a head's staff profile preserves their structure-assigned head role", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const fiona = profiles.find((p) => p.email === FIONA)!;
    expect(fiona.roles).toEqual(["Head of Department"]);
  });

  test("editing a head's staff profile keeps a Staff link to a different department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const fiona = profiles.find((p) => p.email === FIONA)!;
    expect(fiona.roles.sort()).toEqual(["Head of Department", "Staff"]);
    expect(fiona.assignments).toContainEqual({ role: "Staff", department: "Marketing" });
    expect(fiona.assignments).toContainEqual({
      role: "Head of Department",
      department: "Finance",
    });
  });

  test("cannot remove roles from a user without a head role", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: BELLA,
      year: YEAR,
      roles: ["Staff", "Director"],
      department: "Finance",
    });
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: BELLA,
        year: YEAR,
        roles: ["Staff"],
        department: "Finance",
      })
    ).rejects.toThrow(/head/i);
  });

  test("can remove roles from a user who holds a head role", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      roles: ["Staff", "Director"],
      department: "Finance",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const fiona = profiles.find((p) => p.email === FIONA)!;
    expect(fiona.roles).not.toContain("Director");
    expect(fiona.roles).toContain("Head of Department");
  });

  test("Director can be assigned without any department or scope", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "director@sow.org.au",
      year: YEAR,
      roles: ["Director"],
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const director = profiles.find((p) => p.email === "director@sow.org.au")!;
    expect(director.roles).toEqual(["Director"]);
    expect(director.assignments).toEqual([{ role: "Director" }]);
  });

  test("only one Director per year; re-saving the same Director is fine", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "first@sow.org.au",
      year: YEAR,
      roles: ["Director"],
    });
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "second@sow.org.au",
        year: YEAR,
        roles: ["Director"],
      })
    ).rejects.toThrow(/already the Director/);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "first@sow.org.au",
      year: YEAR,
      roles: ["Director", "Staff"],
      department: "Finance",
    });
    const settings = await t.run(async (ctx) =>
      ctx.db.query("yearSettings").withIndex("by_year", (q) => q.eq("year", YEAR)).first()
    );
    expect(settings?.directorEmail).toBe("first@sow.org.au");
  });

  test("removing the Director clears the yearSettings cache", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "solo@sow.org.au",
      year: YEAR,
      roles: ["Director"],
    });
    await admin.mutation(api.admin.removeStaffProfile, {
      email: "solo@sow.org.au",
      year: YEAR,
    });
    const settings = await t.run(async (ctx) =>
      ctx.db.query("yearSettings").withIndex("by_year", (q) => q.eq("year", YEAR)).first()
    );
    expect(settings?.directorEmail).toBe("");
  });

  test("getApprovers scans profiles when the Director cache is unset", async () => {
    const { getApprovers } = await import("./model");
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "legacy-dir@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Director" }],
      });
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();
      if (settings) {
        await ctx.db.patch("yearSettings", settings._id, {
          directorEmail: undefined,
        });
      }
    });
    const approvers = await t.run((ctx) => getApprovers(ctx, YEAR, "Finance"));
    expect(approvers.directorEmail).toBe("legacy-dir@sow.org.au");
  });

  test("rejects an unmanaged year", async () => {
    const t = await setup();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR + 5,
        roles: ["Staff"],
        department: "Finance",
      })
    ).rejects.toThrow(/only manage/);
  });
});

describe("upsertUniversity", () => {
  test("is idempotent: a second upsert returns the same id", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const first = await admin.mutation(api.admin.upsertUniversity, {
      year: YEAR,
      name: "Australian Catholic University",
    });
    const second = await admin.mutation(api.admin.upsertUniversity, {
      year: YEAR,
      name: "Australian Catholic University",
    });
    expect(second).toBe(first);
    await expect(
      admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "  " })
    ).rejects.toThrow(/name is required/);
  });
});

describe("ensureUniversity", () => {
  test("is idempotent — seed already includes WSU; a novel name inserts once", async () => {
    const t = await setup();
    const seeded = await t.mutation(internal.admin.ensureUniversity, {
      year: YEAR,
      name: "Western Sydney University",
    });
    expect(seeded.created).toBe(false);
    expect(seeded.name).toBe("Western Sydney University");

    const first = await t.mutation(internal.admin.ensureUniversity, {
      year: YEAR,
      name: "Example New Campus",
    });
    expect(first.created).toBe(true);
    const second = await t.mutation(internal.admin.ensureUniversity, {
      year: YEAR,
      name: "Example New Campus",
    });
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });
});

describe("removeUniversityRow", () => {
  test("removes a university, strips profile assignments, and no-ops when gone", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.mutation(internal.admin.ensureUniversity, {
      year: YEAR,
      name: "Temp Ops Campus",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "sl-ops@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Student Leader", university: "Temp Ops Campus" }],
    });
    const removed = await t.mutation(internal.admin.removeUniversityRow, {
      year: YEAR,
      name: "Temp Ops Campus",
    });
    expect(removed.removed).toBe(true);
    expect(removed.profilesTouched).toBe(1);
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const sl = profiles.find((p) => p.email === "sl-ops@sow.org.au");
    expect(sl?.assignments?.some((a) => a.university === "Temp Ops Campus")).toBe(
      false
    );
    const again = await t.mutation(internal.admin.removeUniversityRow, {
      year: YEAR,
      name: "Temp Ops Campus",
    });
    expect(again.removed).toBe(false);
  });
});

describe("removeUniversity", () => {
  test("removes an unused university and no-ops on a missing one", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "ACU" });
    await admin.mutation(api.admin.removeUniversity, { year: YEAR, name: "ACU" });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.universities).not.toContain("ACU");
    await expect(
      admin.mutation(api.admin.removeUniversity, { year: YEAR, name: "ACU" })
    ).resolves.toBeNull();
  });
});

describe("updateUniversity", () => {
  test("renames a university, cascades the rename to profiles, and validates constraints", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "ACU" });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "sl@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Student Leader", university: "ACU" }],
    });

    const renamedId = await admin.mutation(api.admin.updateUniversity, {
      year: YEAR, oldName: "ACU", newName: "Australian Catholic University",
    });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.universities).toContain("Australian Catholic University");
    expect(structure.universities).not.toContain("ACU");
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const sl = profiles.find((p) => p.email === "sl@sow.org.au");
    expect(sl?.assignments).toEqual([
      { role: "Student Leader", university: "Australian Catholic University" },
    ]);

    const sameNameId = await admin.mutation(api.admin.updateUniversity, {
      year: YEAR, oldName: "Australian Catholic University", newName: "Australian Catholic University",
    });
    expect(sameNameId).toBe(renamedId);

    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "UTS" });
    await expect(
      admin.mutation(api.admin.updateUniversity, {
        year: YEAR, oldName: "Australian Catholic University", newName: "UTS",
      })
    ).rejects.toThrow(/already exists/);

    await expect(
      admin.mutation(api.admin.updateUniversity, {
        year: YEAR, oldName: "Nonexistent", newName: "Whatever",
      })
    ).rejects.toThrow(/not found/);
  });
});

describe("removeDivision", () => {
  test("is refused while staff hold the division or its departments, then removes both", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    await admin.mutation(api.admin.setStaffProfile, {
      email: "temp@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Marketing" }],
    });

    await expect(
      admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Engagement" })
    ).rejects.toThrow(
      `The Engagement division or one of its departments is still assigned to temp@sow.org.au in ${YEAR}. Reassign them first.`
    );
    let structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.divisions.map((d) => d.name)).toContain("Engagement");

    await admin.mutation(api.admin.setStaffProfile, {
      email: "temp@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    await admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Engagement" });
    structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.divisions.map((d) => d.name)).not.toContain("Engagement");
    expect(structure.departments.map((d) => d.name)).not.toContain("Marketing");
    expect(structure.departments.map((d) => d.name)).not.toContain("Alumni");

    await expect(
      admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Nope" })
    ).resolves.toBeNull();
  });

  test("blocks removal when a child department has an open request", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: BELLA,
        department: "Finance",
        description: "open",
        amount: 50,
        approvedByHOD: "PENDING",
        approvedByBudgetManager: "PENDING",
        approvedByFinanceHead: "PENDING",
        paid: false,
      })
    );
    await expect(
      admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Governance" })
    ).rejects.toThrow(/open requests/);
  });

  test("clears the budget manager when a division containing Finance is deleted", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "FinanceOnly" });
    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR, oldName: "Finance", newName: "Finance",
      division: "FinanceOnly", headEmail: FIONA,
    });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    await expect(
      admin.mutation(api.admin.removeDivision, { year: YEAR, name: "FinanceOnly" })
    ).rejects.toThrow(/still assigned to fiona@sow\.org\.au, bella@sow\.org\.au/);
    await stripFinanceHolders(t);
    await admin.mutation(api.admin.removeDivision, { year: YEAR, name: "FinanceOnly" });
    const settings = await t.run((ctx) =>
      ctx.db.query("yearSettings").withIndex("by_year", (q) => q.eq("year", YEAR)).unique()
    );
    expect(settings?.budgetManagerEmail).toBeUndefined();
  });
});

describe("removeDepartment", () => {
  test("names up to three people holding it and counts the rest", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    for (const who of ["a", "b", "c", "d"]) {
      await admin.mutation(api.admin.setStaffProfile, {
        email: `${who}.person@sow.org.au`,
        year: YEAR,
        roles: ["Staff"],
        department: "Events",
      });
    }
    await expect(
      admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Events" })
    ).rejects.toThrow(`Events is still assigned to A Person, B Person, C Person and 1 more in ${YEAR}.`);
  });


  test("clears the budget manager when Finance is deleted", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    await expect(
      admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Finance" })
    ).rejects.toThrow(`Finance is still assigned to fiona@sow.org.au, bella@sow.org.au in ${YEAR}. Reassign them first.`);
    await stripFinanceHolders(t);
    await admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Finance" });
    const settings = await t.run((ctx) =>
      ctx.db.query("yearSettings").withIndex("by_year", (q) => q.eq("year", YEAR)).unique()
    );
    expect(settings?.budgetManagerEmail).toBeUndefined();
  });
});

describe("head role assignment supersedes only same-scope links", () => {
  test("assigning a HOD supersedes a Staff link to the SAME department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "pete@sow.org.au";
    await admin.mutation(api.admin.setStaffProfile, {
      email, year: YEAR, roles: ["Staff"], department: "Finance",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: email,
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const pete = profiles.find((p) => p.email === email)!;
    expect(pete.roles).not.toContain("Staff");
    expect(pete.roles).toContain("Head of Department");
    expect(pete.assignments).toEqual([
      { role: "Head of Department", department: "Finance" },
    ]);
  });

  test("assigning a HOD keeps a Staff link to a DIFFERENT department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "paul@sow.org.au";
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email, year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: email,
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const paul = profiles.find((p) => p.email === email)!;
    expect(paul.roles.sort()).toEqual(["Head of Department", "Staff"]);
    expect(paul.assignments).toContainEqual({ role: "Staff", department: "Marketing" });
    expect(paul.assignments).toContainEqual({
      role: "Head of Department",
      department: "Finance",
    });
  });

  test("assigning a HODiv keeps a campus role (different scope)", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const email = "sue@sow.org.au";
    await admin.mutation(api.admin.setStaffProfile, {
      email, year: YEAR, roles: ["Student Leader"], university: "Macquarie University",
    });
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Engagement", headEmail: email,
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const sue = profiles.find((p) => p.email === email)!;
    expect(sue.roles.sort()).toEqual(["Head of Division", "Student Leader"]);
    expect(sue.assignments).toContainEqual({
      role: "Student Leader",
      university: "Macquarie University",
    });
    expect(sue.assignments).toContainEqual({
      role: "Head of Division",
      division: "Engagement",
    });
  });
});

describe("updateDivision", () => {
  test("renames a division and cascades to departments and profiles", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Engagement",
      headEmail: "ewan@sow.org.au",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });

    await admin.mutation(api.admin.updateDivision, {
      year: YEAR,
      oldName: "Engagement",
      newName: "Outreach",
      headEmail: "ewan@sow.org.au",
    });

    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.divisions.map((d) => d.name)).toContain("Outreach");
    expect(structure.divisions.map((d) => d.name)).not.toContain("Engagement");
    expect(structure.departments.find((d) => d.name === "Marketing")?.division).toBe(
      "Outreach"
    );
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const ewan = profiles.find((p) => p.email === "ewan@sow.org.au");
    expect(ewan?.assignments?.some((a) => a.division === "Outreach")).toBe(true);
  });

  test("rejects a rename that collides with an existing division", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Engagement" });
    await expect(
      admin.mutation(api.admin.updateDivision, {
        year: YEAR,
        oldName: "Engagement",
        newName: "Governance",
      })
    ).rejects.toThrow(/already exists/);
  });

  test("rejects an empty new name and an unknown division", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await expect(
      admin.mutation(api.admin.updateDivision, {
        year: YEAR,
        oldName: "Governance",
        newName: "   ",
      })
    ).rejects.toThrow(/name is required/);
    await expect(
      admin.mutation(api.admin.updateDivision, {
        year: YEAR,
        oldName: "Ghost",
        newName: "Anything",
      })
    ).rejects.toThrow(/not found/);
  });

  test("changing the head vacates the old head's role and grants the new one", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Engagement",
      headEmail: "old.head@sow.org.au",
    });
    await admin.mutation(api.admin.updateDivision, {
      year: YEAR,
      oldName: "Engagement",
      newName: "Engagement",
      headEmail: "new.head@sow.org.au",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(profiles.find((p) => p.email === "new.head@sow.org.au")?.roles).toContain(
      "Head of Division"
    );
    expect(profiles.find((p) => p.email === "old.head@sow.org.au")?.roles).toEqual([
      "Staff",
    ]);
  });

});

describe("updateDepartment", () => {
  test("renames a department and cascades to profiles and requests", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Alumni",
      division: "Engagement",
      headEmail: "henry@sow.org.au",
    });
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Engagement" });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Alumni",
      division: "Engagement",
      headEmail: "henry@sow.org.au",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "rachel@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Alumni",
    });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    await asUser(t, "rachel@sow.org.au").mutation(api.requests.submit, {
      description: "x",
      amount: 50,
    });

    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Alumni",
      newName: "Comms",
      division: "Engagement",
      headEmail: "henry@sow.org.au",
    });

    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.departments.map((d) => d.name)).toContain("Comms");
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const rachel = profiles.find((p) => p.email === "rachel@sow.org.au");
    expect(rachel?.assignments?.some((a) => a.department === "Comms")).toBe(true);
    const requests = await asUser(t, "rachel@sow.org.au").query(api.requests.myRequests, {});
    expect(requests?.[0].department).toBe("Comms");
  });

  test("rejects unknown division, missing department, empty name and name collisions", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Engagement" });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Alumni",
      division: "Engagement",
    });
    await expect(
      admin.mutation(api.admin.updateDepartment, {
        year: YEAR,
        oldName: "Marketing",
        newName: "Comms",
        division: "Ghost Division",
      })
    ).rejects.toThrow(/doesn't exist/);
    await expect(
      admin.mutation(api.admin.updateDepartment, {
        year: YEAR,
        oldName: "  ",
        newName: "  ",
        division: "Engagement",
      })
    ).rejects.toThrow(/name is required/);
    await expect(
      admin.mutation(api.admin.updateDepartment, {
        year: YEAR,
        oldName: "Phantom",
        newName: "Comms",
        division: "Engagement",
      })
    ).rejects.toThrow(/not found/);
    await expect(
      admin.mutation(api.admin.updateDepartment, {
        year: YEAR,
        oldName: "Alumni",
        newName: "Marketing",
        division: "Engagement",
      })
    ).rejects.toThrow(/already exists/);
  });

  test("head reassignment without a rename swaps the head role over", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Engagement" });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
      headEmail: "first.head@sow.org.au",
    });
    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Marketing",
      newName: "Marketing",
      division: "Engagement",
      headEmail: "second.head@sow.org.au",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(profiles.find((p) => p.email === "second.head@sow.org.au")?.roles).toContain(
      "Head of Department"
    );
    expect(profiles.find((p) => p.email === "first.head@sow.org.au")?.roles).toEqual([
      "Staff",
    ]);
  });

});

describe("setBudgetManager (Finance Head path)", () => {
  test("the Finance Head can set the Budget Manager; a stranger cannot", async () => {
    const t = await setup();
    await asUser(t, FIONA).mutation(api.admin.setBudgetManager, {
      year: YEAR,
      email: BELLA,
    });
    const structure = (await asUser(t, ADMIN).query(api.directory.yearStructure, {
      year: YEAR,
    }))!;
    expect(structure.budgetManagerEmail).toBe(BELLA);

    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "cara@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
    });
    await asUser(t, FIONA).mutation(api.admin.setBudgetManager, {
      year: YEAR,
      email: "cara@sow.org.au",
    });
    const after = (await asUser(t, ADMIN).query(api.directory.yearStructure, {
      year: YEAR,
    }))!;
    expect(after.budgetManagerEmail).toBe("cara@sow.org.au");
  });

  test("rejects a caller who is neither an admin nor the Finance Head", async () => {
    const t = await setup();
    await expect(
      asUser(t, "ghost@sow.org.au").mutation(api.admin.setBudgetManager, {
        year: YEAR,
        email: BELLA,
      })
    ).rejects.toThrow(/admins or the Finance Head/);
  });

  test("a non-admin, non-Finance-Head is rejected", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "marty@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    await expect(
      asUser(t, "marty@sow.org.au").mutation(api.admin.setBudgetManager, {
        year: YEAR,
        email: BELLA,
      })
    ).rejects.toThrow(/Only admins or the Finance Head/);
  });
});

describe("financeMembers", () => {
  test("the Finance Head and admins see Finance members; others get null", async () => {
    const t = await setup();
    const viaFiona = await asUser(t, FIONA).query(api.admin.financeMembers, { year: YEAR });
    expect(viaFiona?.map((m) => m.email)).toContain(BELLA);
    const viaAdmin = await asUser(t, ADMIN).query(api.admin.financeMembers, { year: YEAR });
    expect(viaAdmin?.map((m) => m.email)).toContain(BELLA);

    expect(await t.query(api.admin.financeMembers, { year: YEAR })).toBeNull();
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "nick@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    expect(
      await asUser(t, "nick@sow.org.au").query(api.admin.financeMembers, { year: YEAR })
    ).toBeNull();
    expect(
      await asUser(t, "ghost@sow.org.au").query(api.admin.financeMembers, { year: YEAR })
    ).toBeNull();
  });

  test("an admin can open the next-year Finance picker even when their next-year profile isn't admin", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const nextYear = YEAR + 1;
    await t.run(async (ctx) => {
      await ctx.db.insert("departments", {
        year: nextYear,
        name: "Finance",
        division: "Governance",
        headEmail: FIONA,
      });
      await ctx.db.insert("staffProfiles", {
        email: BELLA,
        year: nextYear,
        assignments: [{ role: "Staff", department: "Finance" }],
      });
      await ctx.db.insert("staffProfiles", {
        email: ADMIN,
        year: nextYear,
        assignments: [{ role: "Staff", department: "Missions" }],
      });
    });
    const members = await admin.query(api.admin.financeMembers, { year: nextYear });
    expect(members?.map((m) => m.email)).toContain(BELLA);
  });
});

describe("chaplain university assignment", () => {
  test("a chaplain can be assigned an optional university; Staff cannot", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "chap@sow.org.au",
      year: YEAR,
      roles: ["Senior Chaplain"],
      department: "Finance",
      university: "Macquarie University",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(
      profiles.find((p) => p.email === "chap@sow.org.au")?.assignments?.some((a) => a.university === "Macquarie University")
    ).toBe(true);

    await admin.mutation(api.admin.setStaffProfile, {
      email: "staff@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
      university: "Macquarie University",
    });
    const updated = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(updated.find((p) => p.email === "staff@sow.org.au")?.assignments?.every((a) => !a.university)).toBe(true);
  });
});

describe("copyYear", () => {
  test("copies one year's structure, profiles, universities and budget manager", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertUniversity, {
      year: YEAR,
      name: "University of Sydney",
    });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });

    await admin.mutation(api.admin.upsertDivision, { year: YEAR + 1, name: "Kept Division" });

    const counts = await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect(counts.divisions).toBeGreaterThan(0);
    expect(counts.departments).toBeGreaterThan(0);
    expect(counts.profiles).toBeGreaterThanOrEqual(1);
    expect(counts.budgetManagers).toBe(1);

    const next = (await admin.query(api.directory.yearStructure, { year: YEAR + 1 }))!;
    expect(next.divisions.map((d) => d.name)).toContain("Governance");
    expect(next.divisions.map((d) => d.name)).toContain("Kept Division");
    expect(next.budgetManagerEmail).toBe(BELLA);

    const recounts = await t.mutation(internal.admin.copyYear, {
      from: YEAR,
      to: YEAR + 1,
      force: true,
    });
    expect(recounts.budgetManagers).toBe(1);
    const govRows = await t.run((ctx) =>
      ctx.db
        .query("divisions")
        .withIndex("by_year_and_name", (q) =>
          q.eq("year", YEAR + 1).eq("name", "Governance")
        )
        .take(10)
    );
    expect(govRows).toHaveLength(1);

    await expect(
      t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR })
    ).rejects.toThrow(/must differ/);

    await expect(
      t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 })
    ).rejects.toThrow(/already copied/);
  });

  test("merges the role catalog, keeping the destination's own roles and not duplicating overlaps", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Outsource" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Volunteer" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR + 1, name: "Volunteer" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR + 1, name: "Kept" });

    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });

    const next = (await admin.query(api.directory.yearStructure, { year: YEAR + 1 }))!;
    expect(next.roles.slice().sort()).toEqual(["Kept", "Outsource", "Volunteer"]);
    const volunteerRows = await t.run((ctx) =>
      ctx.db
        .query("roles")
        .withIndex("by_year_and_name", (q) =>
          q.eq("year", YEAR + 1).eq("name", "Volunteer")
        )
        .take(10)
    );
    expect(volunteerRows).toHaveLength(1);
  });

  test("matches an existing person by importId across a changed email and updates in place", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "old.name@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Finance" }],
        importId: "person-123",
        name: "Person",
      });
      await ctx.db.insert("staffProfiles", {
        email: "new.name@sow.org.au",
        year: YEAR + 1,
        assignments: [{ role: "Outsource" }],
        importId: "person-123",
        name: "Person",
      });
    });

    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });

    const destRows = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_importId", (q) => q.eq("importId", "person-123"))
        .collect()
    ).then((rows) => rows.filter((r) => r.year === YEAR + 1));
    expect(destRows).toHaveLength(1);
    expect(destRows[0].email).toBe("new.name@sow.org.au");
    expect(destRows[0].assignments).toEqual([{ role: "Staff", department: "Finance" }]);
  });

  test("leaves the destination budget manager untouched when the source has none", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run((ctx) =>
      ctx.db.insert("yearSettings", { year: YEAR + 1, budgetManagerEmail: BELLA })
    );

    const counts = await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect(counts.budgetManagers).toBe(0);

    const next = (await admin.query(api.directory.yearStructure, { year: YEAR + 1 }))!;
    expect(next.budgetManagerEmail).toBe(BELLA);
  });
});

describe("prefillNextStaffYear", () => {
  const FROM = 2027;
  const TO = 2028;

  afterEach(() => vi.useRealTimers());

  const atFlip = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(staffYearStartMs(FROM) + 60_000));
  };

  test("before the flip copies incoming → incoming+1, not current → next", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T11:00:00Z"));
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, { year: 2027, name: "Governance" });
    await admin.mutation(api.admin.upsertDepartment, {
      year: 2027,
      name: "Finance",
      division: "Governance",
      headEmail: FIONA,
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: BELLA,
      year: 2027,
      roles: ["Staff"],
      department: "Finance",
    });
    await admin.mutation(api.admin.setBudgetManager, { year: 2027, email: BELLA });
    const counts = await t.mutation(internal.admin.prefillNextStaffYear, {});
    expect(counts.from).toBe(2027);
    expect(counts.to).toBe(2028);
    expect(counts.skipped).toBe(false);
    if (counts.skipped) throw new Error("unreachable");
    expect(counts.budgetManagers).toBe(1);
  });

  test("the summary counts source rows, not inserts, when the next year is preconfigured", async () => {
    atFlip();
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const [sourceUni] = (await admin.query(api.directory.yearStructure, { year: FROM }))!
      .universities;
    await admin.mutation(api.admin.upsertUniversity, { year: TO, name: sourceUni });
    await admin.mutation(api.admin.upsertRole, { year: FROM, name: "Outsource" });
    await admin.mutation(api.admin.upsertRole, { year: TO, name: "Outsource" });

    const source = (await admin.query(api.directory.yearStructure, { year: FROM }))!;
    const counts = await t.mutation(internal.admin.prefillNextStaffYear, {});
    expect(counts.skipped).toBe(false);
    expect(counts.universities).toBe(source.universities.length);
    expect(counts.roles).toBe(source.roles.length);
  });

  test("prefills the next staff year from the current staff year, keeping its existing data", async () => {
    atFlip();
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "director@sow.org.au",
      year: FROM,
      roles: ["Director"],
    });
    await admin.mutation(api.admin.upsertRole, { year: FROM, name: "Outsource" });
    await admin.mutation(api.admin.setBudgetManager, { year: FROM, email: BELLA });
    await admin.mutation(api.admin.upsertDivision, { year: TO, name: "Kept Division" });
    await admin.mutation(api.admin.upsertRole, { year: TO, name: "Kept Role" });
    await admin.mutation(api.admin.upsertUniversity, { year: TO, name: "Kept University" });

    const counts = await t.mutation(internal.admin.prefillNextStaffYear, {});
    expect(counts.skipped).toBe(false);
    if (counts.skipped) throw new Error("unreachable");
    expect(counts.divisions).toBeGreaterThan(0);
    expect(counts.budgetManagers).toBe(1);

    const next = (await admin.query(api.directory.yearStructure, { year: TO }))!;
    expect(next.divisions.map((d) => d.name)).toContain("Governance");
    expect(next.divisions.map((d) => d.name)).toContain("Kept Division");
    expect(next.roles).toContain("Outsource");
    expect(next.roles).toContain("Kept Role");
    expect(next.universities).toContain("Kept University");
    expect(next.budgetManagerEmail).toBe(BELLA);

    const nextSettings = await t.run(async (ctx) =>
      ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", TO))
        .first()
    );
    expect(nextSettings?.directorEmail).toBe("director@sow.org.au");

    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    const emails = scheduled.filter((s) => s.name === "emails:send");
    expect(
      emails.map((e) => (e.args[0] as { to: string }).to).sort()
    ).toEqual(["info@sow.org.au", "it@sow.org.au"]);
    const email = emails[0];
    expect(email).toBeDefined();
    expect((email!.args[0] as { subject: string }).subject).toContain(
      `${FROM} copied to ${TO}`
    );
    const emailBody = (email!.args[0] as { body: string }).body;
    expect(emailBody).toContain("Deployment:");
    expect(emailBody).toContain("Universities: 5");
    expect(emailBody).toContain("Roles:        1");
    expect(
      scheduled.some((s) => s.name === "attendanceMetrics:recomputeAll")
    ).toBe(true);

    const emailsBefore = scheduled.filter((s) => s.name === "emails:send").length;
    const again = await t.mutation(internal.admin.prefillNextStaffYear, {});
    expect(again.skipped).toBe(true);
    const scheduledAfter = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    expect(scheduledAfter.filter((s) => s.name === "emails:send")).toHaveLength(
      emailsBefore
    );
  });

  test("copies the director approval threshold alongside the budget manager", async () => {
    atFlip();
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setBudgetManager, { year: FROM, email: BELLA });
    await admin.mutation(api.admin.setDirectorThreshold, { year: FROM, amount: 7500 });

    const counts = await t.mutation(internal.admin.prefillNextStaffYear, {});
    expect(counts.skipped).toBe(false);
    if (counts.skipped) throw new Error("unreachable");
    expect(counts.directorThresholds).toBe(1);

    const settings = await t.run(async (ctx) =>
      ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", TO))
        .unique()
    );
    expect(settings?.directorApprovalThreshold).toBe(7500);
    expect(settings?.rolloverCopiedFrom).toBe(FROM);
    expect(settings?.rolloverCompletedAt).toEqual(expect.any(Number));
  });

  test("survives stray duplicate destination rows instead of aborting the cron", async () => {
    atFlip();
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setBudgetManager, { year: FROM, email: BELLA });
    await t.run(async (ctx) => {
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("divisions", {
          year: TO,
          name: "Governance",
        });
        await ctx.db.insert("departments", {
          year: TO,
          name: "Finance",
          division: "Governance",
        });
        await ctx.db.insert("staffProfiles", {
          email: BELLA,
          year: TO,
          assignments: [{ role: "Staff", department: "Finance" }],
        });
        await ctx.db.insert("yearSettings", {
          year: TO,
          budgetManagerEmail: BELLA,
        });
      }
    });
    const counts = await t.mutation(internal.admin.prefillNextStaffYear, {});
    expect(counts.skipped).toBe(false);
    if (counts.skipped) throw new Error("unreachable");
    expect(counts.divisions).toBeGreaterThan(0);
    expect(counts.profiles).toBeGreaterThan(0);
    expect(counts.budgetManagers).toBe(1);
  });
});

describe("listStaffProfiles directory name fallback", () => {
  test("uses the synced directory name when the profile has no name yet", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "provisioned@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Finance" }],
      });
      await ctx.db.insert("directoryUsers", {
        email: "provisioned@sow.org.au",
        name: "Provisioned Person",
      });
      await ctx.db.insert("directoryUsers", {
        email: "noname@sow.org.au",
      });
    });
    const profiles = (await asUser(t, ADMIN).query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const profile = profiles.find((p) => p.email === "provisioned@sow.org.au")!;
    expect(profile.name).toBe("Provisioned Person");
  });
});

describe("listUnassignedUsers directory name fallback", () => {
  test("uses the synced directory name when the signed-in user has no name", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "noname@sow.org.au" });
      await ctx.db.insert("directoryUsers", {
        email: "noname@sow.org.au",
        name: "Directory Name",
      });
      await ctx.db.insert("directoryUsers", {
        email: "other@sow.org.au",
      });
    });
    const unassigned = (await asUser(t, ADMIN).query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    const user = unassigned.find((u) => u.email === "noname@sow.org.au")!;
    expect(user.name).toBe("Directory Name");
  });

  test("excludes non-org (personal) accounts from the assignment list", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "staffer@sow.org.au", name: "Staffer" });
      await ctx.db.insert("users", { email: "someone@gmail.com", name: "Someone" });
    });
    const unassigned = (await asUser(t, ADMIN).query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    const emails = unassigned.map((u) => u.email);
    expect(emails).toContain("staffer@sow.org.au");
    expect(emails).not.toContain("someone@gmail.com");
  });
});

describe("people org-only filtering", () => {
  test("excludes non-org (personal) accounts from the people picker", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "staffer@sow.org.au", name: "Staffer" });
      await ctx.db.insert("users", { email: "someone@gmail.com", name: "Someone" });
    });
    const people = (await asUser(t, ADMIN).query(api.admin.people, { year: YEAR }))!;
    const emails = people.map((p) => p.email);
    expect(emails).toContain("staffer@sow.org.au");
    expect(emails).not.toContain("someone@gmail.com");
  });

  test("survives a stray duplicate (email, year) profile instead of throwing", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: ADMIN,
        year: YEAR,
        assignments: [{ role: "Staff", department: "Data and IT" }],
      });
      await ctx.db.insert("users", { email: "dupe@sow.org.au", name: "Dupe" });
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("staffProfiles", {
          email: "dupe@sow.org.au",
          year: YEAR,
          assignments: [{ role: "Staff", department: "Finance" }],
        });
      }
    });
    const admin = asUser(t, ADMIN);
    const people = (await admin.query(api.admin.people, { year: YEAR }))!;
    const unassigned = await admin.query(api.admin.listUnassignedUsers, { year: YEAR });
    expect(people.some((p) => p.email === "dupe@sow.org.au")).toBe(true);
    expect((unassigned ?? []).some((u) => u.email === "dupe@sow.org.au")).toBe(false);
  });

  test("an admin can view next-year people even when their next-year profile isn't an admin one", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const nextYear = YEAR + 1;
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: ADMIN,
        year: nextYear,
        assignments: [{ role: "Staff", department: "Missions" }],
      });
    });
    const people = await admin.query(api.admin.people, { year: nextYear });
    expect(Array.isArray(people)).toBe(true);
  });
});

describe("seed preserves existing heads", () => {
  test("re-seeding keeps department and division heads where names match", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Governance",
      headEmail: "gov.head@sow.org.au",
    });
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.departments.find((d) => d.name === "Finance")?.headEmail).toBe(FIONA);
    expect(structure.divisions.find((d) => d.name === "Governance")?.headEmail).toBe(
      "gov.head@sow.org.au"
    );
  });
});

describe("roles", () => {
  test("upsertRole adds a role that yearStructure then includes", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const first = await admin.mutation(api.admin.upsertRole, {
      year: YEAR,
      name: "Volunteer",
    });
    const second = await admin.mutation(api.admin.upsertRole, {
      year: YEAR,
      name: "Volunteer",
    });
    expect(second).toBe(first);
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.roles).toContain("Volunteer");
    await expect(
      admin.mutation(api.admin.upsertRole, { year: YEAR, name: "  " })
    ).rejects.toThrow(/name is required/);
  });

  test("updateRole renames and cascades to that year's staff assignments", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Outsource" });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "out@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Outsource", department: "Finance" }],
    });

    await admin.mutation(api.admin.updateRole, {
      year: YEAR,
      oldName: "Outsource",
      newName: "Contractor",
    });

    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.roles).toContain("Contractor");
    expect(structure.roles).not.toContain("Outsource");
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const out = profiles.find((p) => p.email === "out@sow.org.au");
    expect(out?.assignments).toContainEqual({
      role: "Contractor",
      department: "Finance",
    });

    await expect(
      admin.mutation(api.admin.updateRole, {
        year: YEAR,
        oldName: "Nonexistent",
        newName: "Whatever",
      })
    ).rejects.toThrow(/not found/);
  });

  test("removeRole blocks while in use and succeeds once freed", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Outsource" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Staff" });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "out@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Outsource", department: "Finance" }],
    });

    await expect(
      admin.mutation(api.admin.removeRole, { year: YEAR, name: "Outsource" })
    ).rejects.toThrow(/still assigned/);

    await admin.mutation(api.admin.setStaffProfile, {
      email: "out@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    await admin.mutation(api.admin.removeRole, { year: YEAR, name: "Outsource" });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.roles).not.toContain("Outsource");

    await expect(
      admin.mutation(api.admin.removeRole, { year: YEAR, name: "Outsource" })
    ).resolves.toBeNull();
  });
});

describe("setStaffProfile with assignments path", () => {
  test("saves two non-head assignments and derives roles from them", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "multi@sow.org.au",
      year: YEAR,
      assignments: [
        { role: "Staff", department: "Finance" },
        { role: "Staff", department: "Marketing" },
        { role: "Director" },
      ],
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const p = profiles.find((x) => x.email === "multi@sow.org.au")!;
    expect(p.roles.sort()).toEqual(["Director", "Staff"]);
    expect(p.assignments).toContainEqual({ role: "Staff", department: "Finance" });
    expect(p.assignments).toContainEqual({ role: "Staff", department: "Marketing" });
    expect(p.assignments).toContainEqual({ role: "Director" });
  });

  test("empty assignments array is rejected", async () => {
    const t = await setup();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        assignments: [],
      })
    ).rejects.toThrow(/at least one assignment/);
  });

  test("HOD/HODiv in assignments is rejected", async () => {
    const t = await setup();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Head of Department", department: "Finance" }],
      })
    ).rejects.toThrow(/Structure section/);
  });

  test("assignments path preserves existing head links", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      assignments: [{ role: "Staff", department: "Marketing" }],
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const fiona = profiles.find((p) => p.email === FIONA)!;
    expect(fiona.roles).toContain("Head of Department");
    expect(fiona.assignments).toContainEqual({ role: "Head of Department", department: "Finance" });
    expect(fiona.assignments).toContainEqual({ role: "Staff", department: "Marketing" });
  });

  test("allows a round-tripped head link the person already holds (adds a new role)", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      assignments: [
        { role: "Staff", department: "Marketing" },
        { role: "Head of Department", department: "Finance" },
      ],
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const fiona = profiles.find((p) => p.email === FIONA)!;
    expect(fiona.roles.sort()).toEqual(["Head of Department", "Staff"]);
    expect(fiona.assignments).toContainEqual({
      role: "Head of Department",
      department: "Finance",
    });
    expect(fiona.assignments).toContainEqual({ role: "Staff", department: "Marketing" });
  });

  test("invalid role in assignments is rejected", async () => {
    const t = await setup();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Wizard" }],
      })
    ).rejects.toThrow(/Roles must be among/);
  });

  test("Staff assignment without a department is rejected", async () => {
    const t = await setup();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff" }],
      })
    ).rejects.toThrow(/needs a department/);
  });

  test("duplicate Director via assignments path is rejected", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "dir1@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Director" }],
    });
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "dir2@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Director" }],
      })
    ).rejects.toThrow(/already the Director/);
  });

  test("unknown department in assignments path is rejected", async () => {
    const t = await setup();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", department: "NonExistent" }],
      })
    ).rejects.toThrow(/doesn't exist/);
  });

  test("chaplain assignment fails when Chaplaincy department is missing", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Chaplaincy" });
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Senior Chaplain" }],
      })
    ).rejects.toThrow(/Chaplaincy/);
  });

  test("campus role with unknown university in assignments path is rejected", async () => {
    const t = await setup();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Student Leader", university: "Hogwarts" }],
      })
    ).rejects.toThrow(/university/i);
  });

  test("campus role without university in assignments path is rejected", async () => {
    const t = await setup();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Student Leader" }],
      })
    ).rejects.toThrow(/university/i);
  });

  test("pure role reduction via assignments path is rejected for non-head users", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "multi@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }, { role: "Director" }],
    });
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "multi@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Finance" }],
      })
    ).rejects.toThrow(/Roles can only be removed/);
  });

  test("assignments path clears budget manager when removed from Finance", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Governance",
    });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    await admin.mutation(api.admin.setStaffProfile, {
      email: BELLA,
      year: YEAR,
      assignments: [{ role: "Staff", department: "Marketing" }],
    });
    const settings = await t.run((ctx) =>
      ctx.db.query("yearSettings").withIndex("by_year", (q) => q.eq("year", YEAR)).unique()
    );
    expect(settings?.budgetManagerEmail).toBeUndefined();
  });
});

describe("reserved system roles", () => {
  test("updateRole and removeRole refuse a reserved role; custom roles still work", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Director" });
    await expect(
      admin.mutation(api.admin.updateRole, {
        year: YEAR,
        oldName: "Director",
        newName: "Chief",
      })
    ).rejects.toThrow(/managed by the app and can't be renamed/);
    await expect(
      admin.mutation(api.admin.removeRole, { year: YEAR, name: "Director" })
    ).rejects.toThrow(/managed by the app and can't be deleted/);
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Helper" });
    await expect(
      admin.mutation(api.admin.updateRole, {
        year: YEAR,
        oldName: "Helper",
        newName: "Member",
      })
    ).rejects.toThrow(/managed by the app and can't be renamed/);

    await admin.mutation(api.admin.updateRole, {
      year: YEAR,
      oldName: "Helper",
      newName: "Assistant",
    });
    await admin.mutation(api.admin.removeRole, { year: YEAR, name: "Assistant" });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.roles).not.toContain("Assistant");
  });
});

describe("setStaffProfile catalog validation", () => {
  test("a custom catalog role assigns; an off-catalog role is rejected; both paths", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Outsource" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Staff" });

    await admin.mutation(api.admin.setStaffProfile, {
      email: "out1@sow.org.au",
      year: YEAR,
      roles: ["Outsource"],
      department: "Finance",
    });
    const profilesA = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(profilesA.find((p) => p.email === "out1@sow.org.au")?.roles).toContain("Outsource");

    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "off1@sow.org.au",
        year: YEAR,
        roles: ["Director"],
      })
    ).rejects.toThrow(/roles available for/);

    await admin.mutation(api.admin.setStaffProfile, {
      email: "out2@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Outsource", department: "Finance" }],
    });
    const profilesB = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(profilesB.find((p) => p.email === "out2@sow.org.au")?.roles).toContain("Outsource");

    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "off2@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Director" }],
      })
    ).rejects.toThrow(/roles available for/);
  });

  test("falls back to the built-in ROLES when the year has no catalog", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "fallback1@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "fallback2@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(profiles.find((p) => p.email === "fallback1@sow.org.au")?.roles).toContain("Staff");
    expect(profiles.find((p) => p.email === "fallback2@sow.org.au")?.roles).toContain("Staff");
  });
});

describe("role mutations stream every profile in the year", () => {
  test("updateRole renames the role on all 1000+ profiles; removeRole still refuses while in use", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "X" });
    await t.run(async (ctx) => {
      for (let i = 0; i < 1001; i++) {
        await ctx.db.insert("staffProfiles", {
          email: `p${i}@x.test`,
          year: YEAR,
          assignments: [{ role: "X" }],
        });
      }
    });

    await admin.mutation(api.admin.updateRole, { year: YEAR, oldName: "X", newName: "Y" });
    const stillOld = await t.run(async (ctx) => {
      let n = 0;
      for await (const p of ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", YEAR))) {
        if ((p.assignments ?? []).some((a) => a.role === "X")) n++;
      }
      return n;
    });
    expect(stillOld).toBe(0);
    await expect(
      admin.mutation(api.admin.removeRole, { year: YEAR, name: "Y" })
    ).rejects.toThrow(/still assigned to 1001 people/);
  });
});

describe("not-serving (leavers) list", () => {
  const NEWBIE = "newbie@sow.org.au";

  test("deleting a profile moves the person to the not-serving list", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run((ctx) =>
      ctx.db.insert("directoryUsers", { email: BELLA, name: "Bella B" })
    );
    await admin.mutation(api.admin.removeStaffProfile, { email: BELLA, year: YEAR });
    const leavers = (await admin.query(api.admin.listLeavers, { year: YEAR }))!;
    expect(leavers.find((l) => l.email === BELLA)?.name).toBe("Bella B");
  });

  test("an unassigned user can be marked not-serving and moved back", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run((ctx) => ctx.db.insert("users", { email: NEWBIE, name: "New Bie" }));
    let unassigned = (await admin.query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    expect(unassigned.map((u) => u.email)).toContain(NEWBIE);

    await admin.mutation(api.admin.markLeaving, { email: NEWBIE, year: YEAR });
    unassigned = (await admin.query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    expect(unassigned.map((u) => u.email)).not.toContain(NEWBIE);
    const leavers = (await admin.query(api.admin.listLeavers, { year: YEAR }))!;
    expect(leavers.find((l) => l.email === NEWBIE)?.name).toBe("New Bie");

    await admin.mutation(api.admin.unmarkLeaving, { email: NEWBIE, year: YEAR });
    unassigned = (await admin.query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    expect(unassigned.map((u) => u.email)).toContain(NEWBIE);
    expect((await admin.query(api.admin.listLeavers, { year: YEAR }))!).toHaveLength(0);
  });

  test("assigning a profile clears the not-serving mark (both code paths)", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.markLeaving, { email: "leg@sow.org.au", year: YEAR });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "leg@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
    });
    await admin.mutation(api.admin.markLeaving, { email: "asg@sow.org.au", year: YEAR });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "asg@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    expect((await admin.query(api.admin.listLeavers, { year: YEAR }))!).toHaveLength(0);
  });

  test("a leaver row for someone who holds a profile is hidden", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run((ctx) => ctx.db.insert("leavers", { year: YEAR, email: BELLA }));
    const leavers = (await admin.query(api.admin.listLeavers, { year: YEAR }))!;
    expect(leavers.map((l) => l.email)).not.toContain(BELLA);
  });

  test("not-serving changes are only allowed for managed years", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await expect(
      admin.mutation(api.admin.markLeaving, { email: NEWBIE, year: YEAR - 1 })
    ).rejects.toThrow(/manage/);
    await expect(
      admin.mutation(api.admin.unmarkLeaving, { email: NEWBIE, year: YEAR - 1 })
    ).rejects.toThrow(/manage/);
  });
});

describe("returning staff identity", () => {
  const RETURNER = "returner@sow.org.au";
  const PAST = YEAR - 1;
  const NEXT = YEAR + 1;

  test("assigning a previous-year email reuses importId and name", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: RETURNER,
        year: PAST,
        name: "Returning Person",
        importId: "person-return-1",
        assignments: [{ role: "Staff", department: "Finance" }],
      })
    );
    await admin.mutation(api.admin.upsertDivision, {
      year: NEXT,
      name: "Governance",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: NEXT,
      name: "Finance",
      division: "Governance",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: RETURNER,
      year: NEXT,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    const rows = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", RETURNER))
        .take(10)
    );
    const created = rows.find((p) => p.year === NEXT);
    const past = rows.find((p) => p.year === PAST);
    expect(created?.importId).toBe("person-return-1");
    expect(created?.name).toBe("Returning Person");
    expect(past?.importId).toBe("person-return-1");
  });

  test("links a sowaustralia.com history row to a sow.org.au assign", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "jane.doe@sowaustralia.com",
        year: PAST,
        name: "Jane Doe",
        importId: "person-jane",
        assignments: [{ role: "Staff", department: "Finance" }],
      })
    );
    await admin.mutation(api.admin.setStaffProfile, {
      email: "jane.doe@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    const created = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", "jane.doe@sow.org.au").eq("year", YEAR)
        )
        .unique()
    );
    expect(created?.importId).toBe("person-jane");
    expect(created?.name).toBe("Jane Doe");
  });

  test("mints importId onto a previous profile that had none", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const pastId = await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: RETURNER,
        year: PAST,
        assignments: [{ role: "Staff", department: "Finance" }],
      })
    );
    await admin.mutation(api.admin.setStaffProfile, {
      email: RETURNER,
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    const rows = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", RETURNER))
        .take(10)
    );
    const past = rows.find((p) => p.year === PAST);
    const current = rows.find((p) => p.year === YEAR);
    expect(past?.importId).toBe(pastId);
    expect(current?.importId).toBe(pastId);
  });

  test("falls back to the Google account name when nothing else has one, never an email", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "gina@sow.org.au", name: "Gina Google" });
      await ctx.db.insert("users", { email: "nameless@sow.org.au", name: "nameless@sow.org.au" });
    });
    for (const email of ["gina@sow.org.au", "nameless@sow.org.au"]) {
      await admin.mutation(api.admin.setStaffProfile, {
        email,
        year: YEAR,
        assignments: [{ role: "Staff", department: "Finance" }],
      });
    }
    const named = await t.run(async (ctx) => {
      const out: Record<string, string | undefined> = {};
      for (const email of ["gina@sow.org.au", "nameless@sow.org.au"]) {
        const profile = await ctx.db
          .query("staffProfiles")
          .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", YEAR))
          .unique();
        out[email] = profile?.name;
      }
      return out;
    });
    expect(named).toEqual({ "gina@sow.org.au": "Gina Google", "nameless@sow.org.au": undefined });
  });

  test("copies a directory name when the previous profile has none", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: RETURNER,
        year: PAST,
        importId: "person-dir-1",
        assignments: [{ role: "Staff", department: "Finance" }],
      });
      await ctx.db.insert("directoryUsers", {
        email: RETURNER,
        name: "Directory Returner",
      });
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: RETURNER,
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    const created = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", RETURNER).eq("year", YEAR)
        )
        .unique()
    );
    expect(created?.name).toBe("Directory Returner");
    expect(created?.importId).toBe("person-dir-1");
  });

  test("links across two earlier years and copies userId", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: RETURNER, name: "Returner" })
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: RETURNER,
        year: PAST - 1,
        name: "Older Returner",
        importId: "person-return-1",
        userId,
      });
      await ctx.db.insert("staffProfiles", {
        email: "returner@sowaustralia.com",
        year: PAST,
        importId: "person-return-1",
      });
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: RETURNER,
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    const created = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", RETURNER).eq("year", YEAR)
        )
        .unique()
    );
    expect(created?.importId).toBe("person-return-1");
    expect(created?.name).toBe("Older Returner");
    expect(created?.userId).toBe(userId);
  });

  test("edits the existing year row when only the other SOW domain is present", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const existingId = await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "pat.lee@sowaustralia.com",
        year: YEAR,
        name: "Pat Lee",
        importId: "person-pat",
        assignments: [{ role: "Staff", department: "Finance" }],
      })
    );
    const saved = await admin.mutation(api.admin.setStaffProfile, {
      email: "pat.lee@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    expect(saved).toBe(existingId);
    const rows = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .take(100)
    );
    const pats = rows.filter((p) => p.email.startsWith("pat.lee@"));
    expect(pats).toHaveLength(1);
    expect(pats[0]?.email).toBe("pat.lee@sowaustralia.com");
  });

  test("signed-in unassigned people include previousYear", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: RETURNER, name: "Returner" });
      await ctx.db.insert("staffProfiles", {
        email: RETURNER,
        year: PAST,
        importId: "person-return-1",
      });
    });
    const unassigned = (await admin.query(api.admin.listUnassignedUsers, {
      year: YEAR,
    }))!;
    expect(unassigned.find((u) => u.email === RETURNER)?.previousYear).toBe(PAST);
  });

  test("does not treat a later-year profile as previousYear", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: RETURNER, name: "Returner" });
      await ctx.db.insert("staffProfiles", {
        email: RETURNER,
        year: NEXT,
        importId: "person-return-1",
      });
    });
    const unassigned = (await admin.query(api.admin.listUnassignedUsers, {
      year: YEAR,
    }))!;
    expect(unassigned.find((u) => u.email === RETURNER)?.previousYear).toBeNull();
  });

  test("attaches a signed-in userId even when the old profile already has importId", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: RETURNER,
        year: PAST,
        importId: "person-return-1",
        assignments: [{ role: "Staff", department: "Finance" }],
      });
      return await ctx.db.insert("users", { email: RETURNER, name: "Returner" });
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: RETURNER,
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    const created = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", RETURNER).eq("year", YEAR)
        )
        .unique()
    );
    expect(created?.importId).toBe("person-return-1");
    expect(created?.userId).toBe(userId);
  });
});

describe("fillTagScopesWithAllGroups", () => {
  test("fills only unscoped tags with every group of their year, idempotently", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "UTS" });

    const { unscopedId, emptyId, scopedId } = await t.run(async (ctx) => ({
      unscopedId: await ctx.db.insert("attendanceTags", { name: "Meeting" }),
      emptyId: await ctx.db.insert("attendanceTags", {
        name: "Social",
        subgroups: [],
      }),
      scopedId: await ctx.db.insert("attendanceTags", {
        name: "Campus only",
        subgroups: ["UTS"],
      }),
    }));

    const first = await t.mutation(internal.admin.fillTagScopesWithAllGroups, {});
    expect(first.filled).toBe(2);
    expect(first.total).toBe(3);

    const after = await t.run(async (ctx) => ({
      unscoped: await ctx.db.get(unscopedId),
      empty: await ctx.db.get(emptyId),
      scoped: await ctx.db.get(scopedId),
    }));
    expect(after.unscoped!.subgroups).toEqual(expect.arrayContaining(["SOW", "UTS"]));
    expect([...after.empty!.subgroups!].sort()).toEqual(
      [...after.unscoped!.subgroups!].sort()
    );
    expect(after.scoped!.subgroups).toEqual(["UTS"]);

    const second = await t.mutation(internal.admin.fillTagScopesWithAllGroups, {});
    expect(second.filled).toBe(0);
  });
});

describe("nameStaffProfilesFromEmail", () => {
  test("derives readable names only for email/blank-named profiles, idempotently", async () => {
    const t = await setup();

    const ids = await t.run(async (ctx) => ({
      blank: await ctx.db.insert("staffProfiles", {
        email: "jane.doe@sow.org.au",
        year: YEAR,
      }),
      emailName: await ctx.db.insert("staffProfiles", {
        email: "john.smith@sow.org.au",
        year: YEAR,
        name: "john.smith@sow.org.au",
      }),
      realName: await ctx.db.insert("staffProfiles", {
        email: "mq.leader@sow.org.au",
        year: YEAR,
        name: "Mary Quant",
      }),
      legacy: await ctx.db.insert("staffProfiles", {
        email: "u12345@legacy.invalid",
        year: YEAR,
      }),
    }));

    const first = await t.mutation(internal.admin.nameStaffProfilesFromEmail, {});
    expect(first.updated).toBe(2);

    const after = await t.run(async (ctx) => ({
      blank: await ctx.db.get(ids.blank),
      emailName: await ctx.db.get(ids.emailName),
      realName: await ctx.db.get(ids.realName),
      legacy: await ctx.db.get(ids.legacy),
    }));
    expect(after.blank!.name).toBe("Jane Doe");
    expect(after.emailName!.name).toBe("John Smith");
    expect(after.realName!.name).toBe("Mary Quant");
    expect(after.legacy!.name).toBeUndefined();

    const second = await t.mutation(internal.admin.nameStaffProfilesFromEmail, {});
    expect(second.updated).toBe(0);
  });
});

describe("staff profiles and their attendance member", () => {
  const NEXT = YEAR + 1;
  const NEWBIE = "new.bie@sow.org.au";

  const memberOf = (t: TestConvex<typeof schema>, email: string, year: number) =>
    t.run(async (ctx) =>
      (
        await ctx.db
          .query("staffProfiles")
          .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", year))
          .unique()
      )?.memberId ?? null
    );
  const logs = (t: TestConvex<typeof schema>, action: string) =>
    t.run(async (ctx) =>
      (await ctx.db.query("attendanceAuditLog").collect()).filter((l) => l.action === action)
    );
  const financeIn = async (t: TestConvex<typeof schema>, year: number) => {
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, { year, name: "Governance" });
    await admin.mutation(api.admin.upsertDepartment, { year, name: "Finance", division: "Governance" });
  };

  test("saving a current-year profile creates the member once and links it", async () => {
    const t = await setup();
    const memberId = await memberOf(t, BELLA, YEAR);
    expect(memberId).not.toBeNull();
    const [created] = (await logs(t, "member.create")).filter((l) => l.memberId === memberId);
    expect(created).toMatchObject({ actorEmail: ADMIN, subjectEmail: BELLA });

    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: BELLA,
      year: YEAR,
      roles: ["Staff", "Director"],
      department: "Finance",
    });
    expect(await memberOf(t, BELLA, YEAR)).toBe(memberId);
    expect((await logs(t, "member.create")).filter((l) => l.subjectEmail === BELLA)).toHaveLength(1);
  });

  test("a next-year profile links a known member but never creates one", async () => {
    const t = await setup();
    await financeIn(t, NEXT);
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: NEWBIE,
      year: NEXT,
      roles: ["Staff"],
      department: "Finance",
    });
    const newbie = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", NEWBIE).eq("year", NEXT))
        .unique()
    );
    expect(newbie).not.toBeNull();
    expect(newbie?.memberId).toBeUndefined();
    await admin.mutation(api.admin.setStaffProfile, {
      email: BELLA,
      year: NEXT,
      roles: ["Staff"],
      department: "Finance",
    });
    expect(await memberOf(t, BELLA, NEXT)).toBe(await memberOf(t, BELLA, YEAR));
  });

  test("copyYear carries each profile's member over", async () => {
    const t = await setup();
    const memberId = await memberOf(t, BELLA, YEAR);
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: NEXT });
    expect(await memberOf(t, BELLA, NEXT)).toBe(memberId);
  });

  test("removing a current-year profile turns them into a member", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("attendanceMetadata", {
        key: "Role",
        type: "select",
        order: 0,
        values: { "1": "Staff" },
      })
    );
    const memberId = (await memberOf(t, BELLA, YEAR))!;
    await asUser(t, ADMIN).mutation(api.admin.removeStaffProfile, { email: BELLA, year: YEAR });

    const [left] = await logs(t, "member.leftStaff");
    expect(left).toMatchObject({
      actorEmail: ADMIN,
      memberId,
      subjectEmail: BELLA,
      detail: `Not staff in ${YEAR}`,
    });
    // Their Role is worked out from here on, so nothing is saved for it.
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.metadata).toEqual({});
  });

  test("removing a profile leaves the member alone while they are still staff, or in another year", async () => {
    const t = await setup();
    await financeIn(t, NEXT);
    const admin = asUser(t, ADMIN);
    const memberId = (await memberOf(t, BELLA, YEAR))!;
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "bella@sowaustralia.com",
        year: YEAR,
        assignments: [{ role: "Outsource" }],
        memberId,
      })
    );
    await admin.mutation(api.admin.removeStaffProfile, { email: BELLA, year: YEAR });

    await admin.mutation(api.admin.setStaffProfile, {
      email: BELLA,
      year: NEXT,
      roles: ["Staff"],
      department: "Finance",
    });
    await admin.mutation(api.admin.removeStaffProfile, { email: BELLA, year: NEXT });
    await admin.mutation(api.admin.removeStaffProfile, { email: NEWBIE, year: YEAR });
    expect(await logs(t, "member.leftStaff")).toHaveLength(0);
  });
});

describe("names the app relies on", () => {
  test("app-keyed departments and divisions can't be renamed; their heads and divisions still change", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const locked = await t.query(api.admin.lockedNames, {});
    expect([...locked.departments].sort()).toEqual([
      "Chaplaincy",
      "Compliance",
      "Data and IT",
      "Events",
      "Finance",
      "Marketing",
    ]);
    expect([...locked.divisions].sort()).toEqual(["Governance", "Human Resources"]);

    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    for (const name of locked.departments) {
      const division = structure.departments.find((d) => d.name === name)!.division;
      await expect(
        admin.mutation(api.admin.updateDepartment, {
          year: YEAR,
          oldName: name,
          newName: `${name} team`,
          division,
        })
      ).rejects.toThrow(/can't be renamed/);
    }
    for (const name of locked.divisions) {
      await expect(
        admin.mutation(api.admin.updateDivision, { year: YEAR, oldName: name, newName: `${name} team` })
      ).rejects.toThrow(/can't be renamed/);
    }

    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Data and IT",
      newName: "Data and IT",
      division: "Operations",
      headEmail: "dita@sow.org.au",
    });
    await admin.mutation(api.admin.updateDivision, {
      year: YEAR,
      oldName: "Human Resources",
      newName: "Human Resources",
      headEmail: "hr.head@sow.org.au",
    });
    const after = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(after.departments.find((d) => d.name === "Data and IT")).toMatchObject({
      division: "Operations",
      headEmail: "dita@sow.org.au",
    });
    expect(after.divisions.find((d) => d.name === "Human Resources")?.headEmail).toBe(
      "hr.head@sow.org.au"
    );
  });

  test("a department rename carries over to that year's event and design requests", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const ids = await t.run(async (ctx) => {
      const event = (department: string, year: number, answers: Record<string, string>) =>
        ctx.db.insert("eventRequests", {
          year,
          number: 1,
          requesterEmail: BELLA,
          department,
          submittedAt: Date.now(),
          answers,
          name: "Camp",
          startsAt: "2026-01-12T13:00",
          endsAt: "2026-01-12T15:00",
          location: "Hall",
          status: "IN_PROGRESS",
        });
      const design = (department: string, year: number) =>
        ctx.db.insert("designRequests", {
          year,
          number: 1,
          requesterEmail: BELLA,
          submittedAt: Date.now(),
          answers: { department, types: ["Poster"] },
          department,
          dueDate: "2026-01-12",
          title: "Poster",
          status: "PENDING",
        });
      return {
        event: await event("Alumni", YEAR, { department: "Alumni", title: "Camp" }),
        eventWithoutAnswer: await event("Alumni", YEAR, { title: "Camp" }),
        lastYearEvent: await event("Alumni", YEAR - 1, { department: "Alumni" }),
        otherEvent: await event("Missions", YEAR, { department: "Missions" }),
        design: await design("Alumni", YEAR),
        lastYearDesign: await design("Alumni", YEAR - 1),
        otherDesign: await design("Missions", YEAR),
      };
    });

    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Alumni",
      newName: "Former Students",
      division: "Engagement",
    });

    const rows = await t.run(async (ctx) => ({
      event: await ctx.db.get("eventRequests", ids.event),
      eventWithoutAnswer: await ctx.db.get("eventRequests", ids.eventWithoutAnswer),
      lastYearEvent: await ctx.db.get("eventRequests", ids.lastYearEvent),
      otherEvent: await ctx.db.get("eventRequests", ids.otherEvent),
      design: await ctx.db.get("designRequests", ids.design),
      lastYearDesign: await ctx.db.get("designRequests", ids.lastYearDesign),
      otherDesign: await ctx.db.get("designRequests", ids.otherDesign),
    }));
    expect(rows.event).toMatchObject({
      department: "Former Students",
      answers: { department: "Former Students", title: "Camp" },
    });
    expect(rows.eventWithoutAnswer).toMatchObject({
      department: "Former Students",
      answers: { title: "Camp" },
    });
    expect(rows.lastYearEvent).toMatchObject({ department: "Alumni", answers: { department: "Alumni" } });
    expect(rows.otherEvent?.department).toBe("Missions");
    expect(rows.design).toMatchObject({
      department: "Former Students",
      answers: { department: "Former Students", types: ["Poster"] },
    });
    expect(rows.lastYearDesign?.department).toBe("Alumni");
    expect(rows.otherDesign?.department).toBe("Missions");
  });

  test("renames carry over to this year's scheduled announcements, not sent or other years' ones", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Mentor" });
    const audience = {
      campuses: ["University of Sydney", "Macquarie University"],
      divisions: ["Engagement"],
      departments: ["Alumni", "Missions"],
      roles: ["Mentor"],
    };
    const everyone = { campuses: [], divisions: [], departments: [], roles: [] };
    const ids = await t.run(async (ctx) => {
      const announcement = (
        status: "scheduled" | "sent",
        year: number | undefined,
        to: typeof audience = audience
      ) =>
        ctx.db.insert("announcements", {
          senderEmail: ADMIN,
          ...(year === undefined ? {} : { year }),
          title: "T",
          message: "M",
          audience: to,
          sendEmail: false,
          status,
          sendAt: Date.now() + 60 * 60 * 1000,
        });
      return {
        scheduled: await announcement("scheduled", YEAR),
        withoutYear: await announcement("scheduled", undefined),
        lastYear: await announcement("scheduled", YEAR - 1),
        sent: await announcement("sent", YEAR),
        everyone: await announcement("scheduled", YEAR, everyone),
      };
    });

    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Alumni",
      newName: "Former Students",
      division: "Engagement",
    });
    await admin.mutation(api.admin.updateDivision, {
      year: YEAR,
      oldName: "Engagement",
      newName: "Outreach",
    });
    await admin.mutation(api.admin.updateRole, { year: YEAR, oldName: "Mentor", newName: "Guide" });
    await admin.mutation(api.admin.updateUniversity, {
      year: YEAR,
      oldName: "University of Sydney",
      newName: "Sydney Uni",
    });

    const renamed = {
      campuses: ["Sydney Uni", "Macquarie University"],
      divisions: ["Outreach"],
      departments: ["Former Students", "Missions"],
      roles: ["Guide"],
    };
    const audienceOf = (id: (typeof ids)[keyof typeof ids]) =>
      t.run(async (ctx) => (await ctx.db.get("announcements", id))?.audience);
    expect(await audienceOf(ids.scheduled)).toEqual(renamed);
    expect(await audienceOf(ids.withoutYear)).toEqual(renamed);
    expect(await audienceOf(ids.lastYear)).toEqual(audience);
    expect(await audienceOf(ids.sent)).toEqual(audience);
    expect(await audienceOf(ids.everyone)).toEqual(everyone);
  });
});
