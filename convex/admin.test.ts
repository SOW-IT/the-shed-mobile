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
    // Re-saving her staff profile as Staff must keep the head role.
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      roles: ["Staff"],
      department: "Finance",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const fiona = profiles.find((p) => p.email === FIONA)!;
    expect(fiona.roles.sort()).toEqual(["Head of Department", "Staff"]);
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

  test("only one Director per year; re-saving the same Director is fine", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "first@sow.org.au",
      year: YEAR,
      roles: ["Director"],
      department: "Finance",
    });
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "second@sow.org.au",
        year: YEAR,
        roles: ["Director"],
        department: "Finance",
      })
    ).rejects.toThrow(/already the Director/);
    // Re-saving the same Director (adding another role) must not throw.
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
  test("refuses while departments still reference it; succeeds once empty", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Governance has departments from the seed -> refuse.
    await expect(
      admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Governance" })
    ).rejects.toThrow(/Move its departments/);

    // An empty, freshly-created division can be removed.
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Temp Division" });
    await admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Temp Division" });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.divisions.map((d) => d.name)).not.toContain("Temp Division");

    // Removing a missing division is a no-op.
    await expect(
      admin.mutation(api.admin.removeDivision, { year: YEAR, name: "Nope" })
    ).resolves.toBeNull();
  });
});

describe("head role assignment strips Staff and campus roles", () => {
  test("assigning a HOD removes Staff from an existing profile", async () => {
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
  });

  test("assigning a HODiv removes campus roles from an existing profile", async () => {
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
    expect(sue.roles).not.toContain("Student Leader");
    expect(sue.roles).toContain("Head of Division");
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
    expect(profiles.find((p) => p.email === "ewan@sow.org.au")?.division).toBe("Outreach");
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
    expect(profiles.find((p) => p.email === "rachel@sow.org.au")?.department).toBe("Comms");
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
  test("strips universities from staff-side profiles, leaves campus roles", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      // A staff member wrongly carrying a university.
      await ctx.db.insert("staffProfiles", {
        email: "stale@sow.org.au",
        year: YEAR,
        roles: ["Staff"],
        department: "Finance",
        university: "University of Sydney",
      });
      // A legitimate campus role that should keep its university.
      await ctx.db.insert("staffProfiles", {
        email: "leader@sow.org.au",
        year: YEAR,
        roles: ["Student Leader"],
        university: "University of Sydney",
      });
    });
    const result = await t.mutation(internal.admin.clearStaffUniversities, {});
    expect(result.cleared).toBe(1);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("staffProfiles").take(1000);
      expect(rows.find((p) => p.email === "stale@sow.org.au")?.university).toBeUndefined();
      expect(rows.find((p) => p.email === "leader@sow.org.au")?.university).toBe(
        "University of Sydney"
      );
    });
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
