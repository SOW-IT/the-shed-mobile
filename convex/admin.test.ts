/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const FIONA = "fiona@sow.org.au"; // Finance head
const BELLA = "bella@sow.org.au"; // Finance staff

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Finance",
    division: "Governance",
    headEmail: FIONA,
  });
  await admin.mutation(api.admin.setStaffProfile, {
    email: BELLA,
    year: YEAR,
    roles: ["Staff"],
    department: "Finance",
  });
  return t;
}

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
    // Fiona heads Finance. Submitting just her (already-held) head role with no
    // other role must succeed and not demand a department — scope validation
    // ignores preserved head roles.
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
    // Fiona heads Finance (a HEAD_OF_DEPARTMENT via the structure section).
    // Re-saving her staff profile as Staff of Finance must keep the head role;
    // Staff of the SAME department she heads is superseded, so she stays HOD.
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
    // Fiona heads Finance; making her Staff of Marketing keeps both.
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
    // Bella is a plain Staff member (no head role).
    await admin.mutation(api.admin.setStaffProfile, {
      email: BELLA,
      year: YEAR,
      roles: ["Staff", "Director"],
      department: "Finance",
    });
    // Reducing from ["Staff", "Director"] to ["Staff"] must be rejected.
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
    // Fiona is HEAD_OF_DEPARTMENT for Finance. Give her an extra role first.
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      roles: ["Staff", "Director"],
      department: "Finance",
    });
    // Now reduce to just Staff — allowed because she holds HEAD_OF_DEPARTMENT.
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const fiona = profiles.find((p) => p.email === FIONA)!;
    // Director was removed; Head of Department preserved by structure.
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
    // Director has no required scope — no department needed.
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
    // Re-saving the same Director (adding Staff for a department) must not throw.
    await admin.mutation(api.admin.setStaffProfile, {
      email: "first@sow.org.au",
      year: YEAR,
      roles: ["Director", "Staff"],
      department: "Finance",
    });
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

describe("removeUniversity", () => {
  test("removes an unused university and no-ops on a missing one", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "ACU" });
    await admin.mutation(api.admin.removeUniversity, { year: YEAR, name: "ACU" });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.universities).not.toContain("ACU");
    // Removing one that doesn't exist returns null, not an error.
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

    // Rename cascades to the staff profile.
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

    // Same name is a true no-op — returns the same id, touches nothing.
    const sameNameId = await admin.mutation(api.admin.updateUniversity, {
      year: YEAR, oldName: "Australian Catholic University", newName: "Australian Catholic University",
    });
    expect(sameNameId).toBe(renamedId);

    // Duplicate name is rejected.
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "UTS" });
    await expect(
      admin.mutation(api.admin.updateUniversity, {
        year: YEAR, oldName: "Australian Catholic University", newName: "UTS",
      })
    ).rejects.toThrow(/already exists/);

    // Unknown old name is rejected.
    await expect(
      admin.mutation(api.admin.updateUniversity, {
        year: YEAR, oldName: "Nonexistent", newName: "Whatever",
      })
    ).rejects.toThrow(/not found/);
  });
});

describe("removeDivision", () => {
  test("cascades to departments and staff assignments; no-ops on missing", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    // Use Engagement (Marketing, Alumni) — the admin is in Data and IT (Governance),
    // so deleting Engagement won't strip the admin's own profile.
    await admin.mutation(api.admin.setStaffProfile, {
      email: "temp@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Marketing" }],
    });

    // Engagement has Marketing + Alumni and a staff member -> cascade should succeed.
    await admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Engagement" });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.divisions.map((d) => d.name)).not.toContain("Engagement");
    // Child departments should also have been removed.
    expect(structure.departments.map((d) => d.name)).not.toContain("Marketing");
    expect(structure.departments.map((d) => d.name)).not.toContain("Alumni");

    // Staff assignment to Marketing should have been stripped.
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const temp = profiles.find((p) => p.email === "temp@sow.org.au");
    expect(temp?.assignments ?? []).toHaveLength(0);

    // Removing a missing division is a no-op.
    await expect(
      admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Nope" })
    ).resolves.toBeNull();
  });

  test("blocks removal when a child department has an open request", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Insert an open request directly into Finance (a Governance child dept).
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
    // Governance contains Finance which has that open request — deletion must be refused.
    await expect(
      admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Governance" })
    ).rejects.toThrow(/open requests/);
  });

  test("clears the budget manager when a division containing Finance is deleted", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Move Finance to a dedicated division so we can delete it without touching Data and IT
    // (the admin's department, also in Governance).
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "FinanceOnly" });
    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR, oldName: "Finance", newName: "Finance",
      division: "FinanceOnly", headEmail: FIONA,
    });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    await admin.mutation(api.admin.removeDivision, { year: YEAR, name: "FinanceOnly" });
    const settings = await t.run((ctx) =>
      ctx.db.query("yearSettings").withIndex("by_year", (q) => q.eq("year", YEAR)).unique()
    );
    expect(settings?.budgetManagerEmail).toBeUndefined();
  });
});

describe("removeDepartment", () => {
  test("clears the budget manager when Finance is deleted", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
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
    // Being Staff and Head of the same department collapses to just Head.
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
    // Paul is Staff of Marketing…
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email, year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    // …then becomes Head of Finance (a different department).
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
    // Campus role and division headship are different scopes — both are kept.
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
    // Someone whose profile.division points at the division being renamed.
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
        newName: "Governance", // already exists from the seed
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
    // The old head no longer heads any division -> role stripped, falls to Staff.
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
      name: "Marketing",
      division: "Engagement",
      headEmail: "henry@sow.org.au",
    });
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Engagement" });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
      headEmail: "henry@sow.org.au",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "rachel@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    // A Budget Manager must exist for a request to be submittable.
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    // A request filed under the old department name.
    await asUser(t, "rachel@sow.org.au").mutation(api.requests.submit, {
      description: "x",
      amount: 50,
    });

    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Marketing",
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
        oldName: "Marketing",
        newName: "Alumni", // collision
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
      newName: "Marketing", // same name -> the else branch
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
    // Fiona is the Finance Head (heads the Finance department).
    await asUser(t, FIONA).mutation(api.admin.setBudgetManager, {
      year: YEAR,
      email: BELLA,
    });
    const structure = (await asUser(t, ADMIN).query(api.directory.yearStructure, {
      year: YEAR,
    }))!;
    expect(structure.budgetManagerEmail).toBe(BELLA);

    // Re-setting updates the existing yearSettings row (patch branch).
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

    // Unauthenticated -> null (auth still attaching).
    expect(await t.query(api.admin.financeMembers, { year: YEAR })).toBeNull();
    // A signed-in non-Finance-Head, non-admin -> null.
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
    // Signed in but unprovisioned -> null.
    expect(
      await asUser(t, "ghost@sow.org.au").query(api.admin.financeMembers, { year: YEAR })
    ).toBeNull();
  });

  test("an admin can open the next-year Finance picker even when their next-year profile isn't admin", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const nextYear = YEAR + 1;
    // Seed next-year Finance so the picker has someone to return, and give ADMIN
    // a plain (non-admin) next-year profile — the post-rollover case.
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
    // Previously returned null because admin was judged on the viewed year.
    const members = await admin.query(api.admin.financeMembers, { year: nextYear });
    expect(members?.map((m) => m.email)).toContain(BELLA);
  });
});

describe("chaplain university assignment", () => {
  test("a chaplain can be assigned an optional university; Staff cannot", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Chaplain with university — allowed.
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

    // Staff member — university must be cleared even if passed.
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

    // Pre-existing data in the destination year is kept (non-destructive merge).
    await admin.mutation(api.admin.upsertDivision, { year: YEAR + 1, name: "Kept Division" });

    const counts = await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect(counts.divisions).toBeGreaterThan(0);
    expect(counts.departments).toBeGreaterThan(0);
    expect(counts.profiles).toBeGreaterThanOrEqual(1);
    expect(counts.budgetManagers).toBe(1);

    const next = (await admin.query(api.directory.yearStructure, { year: YEAR + 1 }))!;
    expect(next.divisions.map((d) => d.name)).toContain("Governance");
    // The destination's own division survives the merge.
    expect(next.divisions.map((d) => d.name)).toContain("Kept Division");
    expect(next.budgetManagerEmail).toBe(BELLA);

    // Copying again with force (destination yearSettings now exists) hits the
    // patch branch and must not duplicate any copied division. Without force
    // the completion guard would refuse a re-copy.
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

    // Without force, a second copy of the same (from, to) is refused.
    await expect(
      t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 })
    ).rejects.toThrow(/already copied/);
  });

  test("merges the role catalog, keeping the destination's own roles and not duplicating overlaps", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Source year roles.
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Outsource" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Volunteer" });
    // Destination has an overlapping role (Volunteer) and its own (Kept).
    await admin.mutation(api.admin.upsertRole, { year: YEAR + 1, name: "Volunteer" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR + 1, name: "Kept" });

    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });

    const next = (await admin.query(api.directory.yearStructure, { year: YEAR + 1 }))!;
    // Source roles added, destination's own role kept (non-destructive).
    expect(next.roles.slice().sort()).toEqual(["Kept", "Outsource", "Volunteer"]);
    // Volunteer exists exactly once (no duplicate from the overlap).
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
      // Source profile carries a durable importId.
      await ctx.db.insert("staffProfiles", {
        email: "old.name@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Finance" }],
        importId: "person-123",
        name: "Person",
      });
      // The same person already exists in the destination year under a renamed
      // email — the copy must match by importId and update in place.
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
    // Matched by importId — updated in place, not duplicated, email preserved.
    expect(destRows).toHaveLength(1);
    expect(destRows[0].email).toBe("new.name@sow.org.au");
    expect(destRows[0].assignments).toEqual([{ role: "Staff", department: "Finance" }]);
  });

  test("leaves the destination budget manager untouched when the source has none", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Destination has a budget manager; source year has none.
    await t.run((ctx) =>
      ctx.db.insert("yearSettings", { year: YEAR + 1, budgetManagerEmail: BELLA })
    );

    const counts = await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect(counts.budgetManagers).toBe(0);

    const next = (await admin.query(api.directory.yearStructure, { year: YEAR + 1 }))!;
    expect(next.budgetManagerEmail).toBe(BELLA);
  });
});

describe("rollOverStaffYear", () => {
  test("prefills the next staff year from the current staff year, keeping its existing data", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Outsource" });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    // Data already in the next year is kept (non-destructive merge) — a
    // division, a role and a university the source lacks must survive the copy.
    await admin.mutation(api.admin.upsertDivision, { year: YEAR + 1, name: "Kept Division" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR + 1, name: "Kept Role" });
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR + 1, name: "Kept University" });

    const counts = await t.mutation(internal.admin.rollOverStaffYear, {});
    expect(counts.skipped).toBe(false);
    if (counts.skipped) throw new Error("unreachable");
    expect(counts.divisions).toBeGreaterThan(0);
    expect(counts.budgetManagers).toBe(1);

    const next = (await admin.query(api.directory.yearStructure, { year: YEAR + 1 }))!;
    expect(next.divisions.map((d) => d.name)).toContain("Governance");
    expect(next.divisions.map((d) => d.name)).toContain("Kept Division");
    expect(next.roles).toContain("Outsource");
    expect(next.roles).toContain("Kept Role");
    expect(next.universities).toContain("Kept University");
    expect(next.budgetManagerEmail).toBe(BELLA);

    // A summary email to IT is scheduled.
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    const email = scheduled.find((s) => s.name === "emails:send");
    expect(email).toBeDefined();
    expect(email!.args[0]).toMatchObject({ to: "it@sow.org.au" });
    expect((email!.args[0] as { subject: string }).subject).toContain(
      `${YEAR} copied to ${YEAR + 1}`
    );
    expect((email!.args[0] as { body: string }).body).toContain("Deployment:");

    // A second run no-ops (idempotent) — does not re-email or overwrite.
    const emailsBefore = scheduled.filter((s) => s.name === "emails:send").length;
    const again = await t.mutation(internal.admin.rollOverStaffYear, {});
    expect(again.skipped).toBe(true);
    const scheduledAfter = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    expect(scheduledAfter.filter((s) => s.name === "emails:send")).toHaveLength(
      emailsBefore
    );
  });

  test("copies the director approval threshold alongside the budget manager", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    await admin.mutation(api.admin.setDirectorThreshold, { year: YEAR, amount: 7500 });

    const counts = await t.mutation(internal.admin.rollOverStaffYear, {});
    expect(counts.skipped).toBe(false);
    if (counts.skipped) throw new Error("unreachable");
    expect(counts.directorThresholds).toBe(1);

    const settings = await t.run(async (ctx) =>
      ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR + 1))
        .unique()
    );
    expect(settings?.directorApprovalThreshold).toBe(7500);
    expect(settings?.rolloverCopiedFrom).toBe(YEAR);
    expect(settings?.rolloverCompletedAt).toEqual(expect.any(Number));
  });

  test("survives stray duplicate destination rows instead of aborting the cron", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    // Transient duplicates in the destination year (mid-import / mid-re-copy)
    // used to make copyYearData's .unique() throw and abort the whole rollover.
    await t.run(async (ctx) => {
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("divisions", {
          year: YEAR + 1,
          name: "Governance",
        });
        await ctx.db.insert("departments", {
          year: YEAR + 1,
          name: "Finance",
          division: "Governance",
        });
        await ctx.db.insert("staffProfiles", {
          email: BELLA,
          year: YEAR + 1,
          assignments: [{ role: "Staff", department: "Finance" }],
        });
      }
    });
    const counts = await t.mutation(internal.admin.rollOverStaffYear, {});
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
        // name intentionally absent — provisioned before first sign-in
      });
      await ctx.db.insert("directoryUsers", {
        email: "provisioned@sow.org.au",
        name: "Provisioned Person",
      });
      // A directory entry without a name exercises the u.name ?? null branch.
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
      // A directory entry without a name exercises the u.name ?? null branch.
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
    // A second row for the same person-year — as can transiently exist mid-import
    // or mid-rollover. getProfile/getDepartment now use .first() (not .unique()),
    // so neither the finance gate (which looks up the caller's own profile) nor
    // the per-user lookups throw a bare "Server Error" that blanks the screen.
    await t.run(async (ctx) => {
      // Duplicate the ADMIN's own profile — this is the reported admin:people
      // path, where requireFinanceSettingsAccess looks up the caller.
      await ctx.db.insert("staffProfiles", {
        email: ADMIN,
        year: YEAR,
        assignments: [{ role: "Staff", department: "Data and IT" }],
      });
      // Duplicate a non-admin user too — exercises the per-user getProfile in
      // listUnassignedUsers.
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
    // Awaiting these is the assertion: with .unique() they rejected with a bare
    // "Server Error"; with .first() they resolve.
    const people = (await admin.query(api.admin.people, { year: YEAR }))!;
    const unassigned = await admin.query(api.admin.listUnassignedUsers, { year: YEAR });
    expect(people.some((p) => p.email === "dupe@sow.org.au")).toBe(true);
    // A duplicated person holds a profile, so they are not "unassigned".
    expect((unassigned ?? []).some((u) => u.email === "dupe@sow.org.au")).toBe(false);
  });

  test("an admin can view next-year people even when their next-year profile isn't an admin one", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const nextYear = YEAR + 1;
    // ADMIN is an admin for the CURRENT year (seed), but their next-year profile
    // is a plain, non-admin one — the real case after a rollover that didn't carry
    // their division headship / Data-and-IT membership forward. Admin access must
    // be judged on the current year (like requireAdmin), not the year being viewed.
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: ADMIN,
        year: nextYear,
        assignments: [{ role: "Staff", department: "Missions" }],
      });
    });
    // Previously threw "Only admins or the Finance Head can view people".
    const people = await admin.query(api.admin.people, { year: nextYear });
    expect(Array.isArray(people)).toBe(true);
  });
});

describe("seed preserves existing heads", () => {
  test("re-seeding keeps department and division heads where names match", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Give Governance (division) and Finance (department) heads, then re-seed.
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Governance",
      headEmail: "gov.head@sow.org.au",
    });
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    // Finance's head (set in setup) survives the re-seed by name match.
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
    // Idempotent: a second upsert returns the same id.
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
    // A profile holding the custom role (Director needs no scope).
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

    // Unknown old name is rejected.
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
    // Seeding a catalog makes role validation data-driven, so the roles used
    // below (Outsource for the initial assignment, Staff for the reassignment)
    // must both be present in the year's catalog.
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Outsource" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Staff" });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "out@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Outsource", department: "Finance" }],
    });

    // Blocked: someone still holds the role.
    await expect(
      admin.mutation(api.admin.removeRole, { year: YEAR, name: "Outsource" })
    ).rejects.toThrow(/still assigned/);

    // Reassign them off the role, then deletion succeeds.
    await admin.mutation(api.admin.setStaffProfile, {
      email: "out@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    await admin.mutation(api.admin.removeRole, { year: YEAR, name: "Outsource" });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.roles).not.toContain("Outsource");

    // Removing a missing role returns null, not an error.
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
    // Fiona is already HOD of Finance (set up in setup()).
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    // Add a Staff-of-Marketing assignment via the new path.
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
    // The new UI round-trips Fiona's existing HOD assignment alongside the
    // added Staff link — adding a role must not be rejected as "via Structure".
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
    // Reassign BELLA away from Finance via assignments path.
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

    // Director is reserved — renaming or deleting it is blocked.
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
    // Renaming a custom role TO a reserved name is also blocked.
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Helper" });
    await expect(
      admin.mutation(api.admin.updateRole, {
        year: YEAR,
        oldName: "Helper",
        newName: "Member",
      })
    ).rejects.toThrow(/managed by the app and can't be renamed/);

    // A non-reserved custom role can still be renamed and removed.
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
    // Seed a year catalog that includes a CUSTOM role plus the standard ones we use.
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Outsource" });
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Staff" });

    // Legacy path: the custom catalog role assigns successfully…
    await admin.mutation(api.admin.setStaffProfile, {
      email: "out1@sow.org.au",
      year: YEAR,
      roles: ["Outsource"],
      department: "Finance",
    });
    const profilesA = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(profilesA.find((p) => p.email === "out1@sow.org.au")?.roles).toContain("Outsource");

    // …and a role NOT in the catalog is rejected (Director isn't in this catalog).
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "off1@sow.org.au",
        year: YEAR,
        roles: ["Director"],
      })
    ).rejects.toThrow(/roles available for/);

    // Per-assignment path: the custom catalog role assigns…
    await admin.mutation(api.admin.setStaffProfile, {
      email: "out2@sow.org.au",
      year: YEAR,
      assignments: [{ role: "Outsource", department: "Finance" }],
    });
    const profilesB = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(profilesB.find((p) => p.email === "out2@sow.org.au")?.roles).toContain("Outsource");

    // …and an off-catalog role is rejected on the per-assignment path too.
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
    // No roles seeded for YEAR -> validation falls back to the hardcoded ROLES.
    // Legacy path: a standard role succeeds.
    await admin.mutation(api.admin.setStaffProfile, {
      email: "fallback1@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
    });
    // Per-assignment path: a standard role succeeds.
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

describe("role mutations fail fast on the 1000-profile cap", () => {
  test("updateRole and removeRole throw when a year has 1000 profiles", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // A custom role for the managed year, plus exactly 1000 profiles holding it.
    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "X" });
    await t.run(async (ctx) => {
      for (let i = 0; i < 1000; i++) {
        await ctx.db.insert("staffProfiles", {
          email: `p${i}@x.test`,
          year: YEAR,
          assignments: [{ role: "X" }],
        });
      }
    });

    await expect(
      admin.mutation(api.admin.updateRole, { year: YEAR, oldName: "X", newName: "Y" })
    ).rejects.toThrow(/Too many profiles to update in one go/);
    await expect(
      admin.mutation(api.admin.removeRole, { year: YEAR, name: "X" })
    ).rejects.toThrow(/Too many profiles to update in one go/);
  });
});

describe("not-serving (leavers) list", () => {
  const NEWBIE = "newbie@sow.org.au"; // signed in, no profile

  test("deleting a profile moves the person to the not-serving list", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // A directory entry lets her name resolve once she's a leaver (she never
    // signed in, so there's no users row).
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
    // Starts in the unassigned pool.
    let unassigned = (await admin.query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    expect(unassigned.map((u) => u.email)).toContain(NEWBIE);

    // Marked not-serving → out of unassigned, into the leavers list (name resolved).
    await admin.mutation(api.admin.markLeaving, { email: NEWBIE, year: YEAR });
    unassigned = (await admin.query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    expect(unassigned.map((u) => u.email)).not.toContain(NEWBIE);
    const leavers = (await admin.query(api.admin.listLeavers, { year: YEAR }))!;
    expect(leavers.find((l) => l.email === NEWBIE)?.name).toBe("New Bie");

    // Moved back → returns to unassigned, gone from leavers.
    await admin.mutation(api.admin.unmarkLeaving, { email: NEWBIE, year: YEAR });
    unassigned = (await admin.query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    expect(unassigned.map((u) => u.email)).toContain(NEWBIE);
    expect((await admin.query(api.admin.listLeavers, { year: YEAR }))!).toHaveLength(0);
  });

  test("assigning a profile clears the not-serving mark (both code paths)", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Legacy roles path.
    await admin.mutation(api.admin.markLeaving, { email: "leg@sow.org.au", year: YEAR });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "leg@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
    });
    // Per-assignment path.
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
    // Bella still has a profile; a stray leaver row for her must not surface.
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
    // Both unscoped tags get the same full group list for the year (SOW + every
    // university), and it must include the one we added.
    expect(after.unscoped!.subgroups).toEqual(expect.arrayContaining(["SOW", "UTS"]));
    expect([...after.empty!.subgroups!].sort()).toEqual(
      [...after.unscoped!.subgroups!].sort()
    );
    // An already-scoped tag is left untouched.
    expect(after.scoped!.subgroups).toEqual(["UTS"]);

    // Re-running fills nothing more.
    const second = await t.mutation(internal.admin.fillTagScopesWithAllGroups, {});
    expect(second.filled).toBe(0);
  });
});

describe("nameStaffProfilesFromEmail", () => {
  test("derives readable names only for email/blank-named profiles, idempotently", async () => {
    const t = await setup();

    const ids = await t.run(async (ctx) => ({
      // name missing -> derive
      blank: await ctx.db.insert("staffProfiles", {
        email: "jane.doe@sow.org.au",
        year: YEAR,
      }),
      // name is the email -> derive
      emailName: await ctx.db.insert("staffProfiles", {
        email: "john.smith@sow.org.au",
        year: YEAR,
        name: "john.smith@sow.org.au",
      }),
      // real name -> keep
      realName: await ctx.db.insert("staffProfiles", {
        email: "mq.leader@sow.org.au",
        year: YEAR,
        name: "Mary Quant",
      }),
      // non-name-shaped email -> can't derive, leave as-is
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

    // Re-running changes nothing.
    const second = await t.mutation(internal.admin.nameStaffProfilesFromEmail, {});
    expect(second.updated).toBe(0);
  });
});
