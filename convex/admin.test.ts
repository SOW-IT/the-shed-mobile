/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
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
    expect(director.department).toBeUndefined();
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

  test("rejects when the caller has no profile", async () => {
    const t = await setup();
    await expect(
      asUser(t, "ghost@sow.org.au").mutation(api.admin.setBudgetManager, {
        year: YEAR,
        email: BELLA,
      })
    ).rejects.toThrow(/No profile found/);
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
});

describe("clearStaffUniversities (one-off cleanup)", () => {
  test("strips universities from staff/head/director profiles; leaves campus and chaplain profiles", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      // A staff member wrongly carrying a university — should be cleared.
      await ctx.db.insert("staffProfiles", {
        email: "stale@sow.org.au",
        year: YEAR,
        roles: ["Staff"],
        department: "Finance",
        university: "University of Sydney",
      });
      // A campus role that should keep its university.
      await ctx.db.insert("staffProfiles", {
        email: "leader@sow.org.au",
        year: YEAR,
        roles: ["Student Leader"],
        university: "University of Sydney",
      });
      // A chaplain that should keep its university.
      await ctx.db.insert("staffProfiles", {
        email: "chap@sow.org.au",
        year: YEAR,
        roles: ["Senior Chaplain"],
        department: "Finance",
        university: "University of Sydney",
      });
    });
    const result = await t.mutation(internal.admin.clearStaffUniversities, {});
    expect(result.cleared).toBe(1);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("staffProfiles").take(1000);
      expect(rows.find((p) => p.email === "stale@sow.org.au")?.university).toBeUndefined();
      expect(rows.find((p) => p.email === "leader@sow.org.au")?.university).toBe("University of Sydney");
      expect(rows.find((p) => p.email === "chap@sow.org.au")?.university).toBe("University of Sydney");
    });
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
  test("clones one year's structure, profiles, universities and budget manager", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertUniversity, {
      year: YEAR,
      name: "University of Sydney",
    });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });

    // Pre-existing junk in the destination year is replaced wholesale.
    await admin.mutation(api.admin.upsertDivision, { year: YEAR + 1, name: "Stale Division" });

    const counts = await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect(counts.divisions).toBeGreaterThan(0);
    expect(counts.departments).toBeGreaterThan(0);
    expect(counts.profiles).toBeGreaterThanOrEqual(1);
    expect(counts.budgetManagers).toBe(1);

    const next = (await admin.query(api.directory.yearStructure, { year: YEAR + 1 }))!;
    expect(next.divisions.map((d) => d.name)).toContain("Governance");
    expect(next.divisions.map((d) => d.name)).not.toContain("Stale Division");
    expect(next.budgetManagerEmail).toBe(BELLA);

    // Copying again (destination yearSettings now exists) hits the patch branch.
    const recounts = await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect(recounts.budgetManagers).toBe(1);

    await expect(
      t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR })
    ).rejects.toThrow(/must differ/);
  });
});

describe("listStaffProfiles directory name fallback", () => {
  test("uses the synced directory name when the profile has no name yet", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "provisioned@sow.org.au",
        year: YEAR,
        roles: ["Staff"],
        department: "Finance",
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
