/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const RACHEL = "rachel@sow.org.au";
const HENRY = "henry@sow.org.au";
const BELLA = "bella@sow.org.au";
const FIONA = "fiona@sow.org.au";
const DAN = "dan@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Marketing",
    division: "Engagement",
    headEmail: HENRY,
  });
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Finance",
    division: "Governance",
    headEmail: FIONA,
  });
  for (const a of [
    { email: RACHEL, roles: ["Staff"], department: "Marketing" },
    { email: BELLA, roles: ["Staff"], department: "Finance" },
    { email: DAN, roles: ["Director"], department: "Marketing" },
  ]) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...a });
  }
  await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
  return t;
}

describe("serverInfo", () => {
  test("returns the year, domain and structure for signed-in callers, null otherwise", async () => {
    const t = await setup();
    vi.stubEnv("AUTH_ALLOWED_DOMAIN", "sow.org.au");
    expect(await t.query(api.directory.serverInfo, {})).toBeNull(); // unauthenticated

    const info = (await asUser(t, RACHEL).query(api.directory.serverInfo, {}))!;
    expect(info.staffYear).toBe(YEAR);
    expect(info.nextStaffYear).toBe(YEAR + 1);
    expect(info.allowedDomain).toBe("sow.org.au");
    expect(info.divisions).toContain("Governance");
    expect(info.departments.find((d) => d.name === "Finance")?.division).toBe("Governance");
  });

  test("falls back to the default domain when the env var is unset", async () => {
    const t = await setup();
    vi.stubEnv("AUTH_ALLOWED_DOMAIN", undefined);
    const info = (await asUser(t, RACHEL).query(api.directory.serverInfo, {}))!;
    expect(info.allowedDomain).toBe("sow.org.au");
  });
});

describe("me", () => {
  test("null when unauthenticated", async () => {
    const t = await setup();
    expect(await t.query(api.directory.me, {})).toBeNull();
  });

  test("an unprovisioned but signed-in user gets a null profile and their photo", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "walter@sow.org.au",
        name: "Walter W",
        image: "https://example.com/walter.png",
      })
    );
    const me = (await asUser(t, "walter@sow.org.au").query(api.directory.me, {}))!;
    expect(me.profile).toBeNull();
    expect(me.name).toBe("Walter W");
    expect(me.photo).toBe("https://example.com/walter.png");
  });

  test("an uploaded avatar wins over the Google image", async () => {
    const t = await setup();
    const avatarId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["png"], { type: "image/png" }))
    );
    await t.run((ctx) =>
      ctx.db.insert("users", { email: RACHEL, name: "Rachel R", image: "g", avatarId })
    );
    const me = (await asUser(t, RACHEL).query(api.directory.me, {}))!;
    expect(me.photo).toBeTruthy();
    expect(me.photo).not.toBe("g");
  });

  test("reports capabilities for the Finance Head", async () => {
    const t = await setup();
    const me = (await asUser(t, FIONA).query(api.directory.me, {}))!;
    expect(me.profile?.department).toBe("Finance");
    expect(me.isFinance).toBe(true);
    expect(me.isFinanceHead).toBe(true);
    expect(me.isApprover).toBe(true);
  });

  test("reports capabilities for the Director and the Budget Manager", async () => {
    const t = await setup();
    const dan = (await asUser(t, DAN).query(api.directory.me, {}))!;
    expect(dan.isDirector).toBe(true);
    expect(dan.isApprover).toBe(true);

    const bella = (await asUser(t, BELLA).query(api.directory.me, {}))!;
    expect(bella.isBudgetManager).toBe(true);
    expect(bella.isApprover).toBe(true);
  });

  test("a plain staff member is not an approver", async () => {
    const t = await setup();
    const me = (await asUser(t, RACHEL).query(api.directory.me, {}))!;
    expect(me.isApprover).toBe(false);
    expect(me.isAdmin).toBe(false);
    expect(me.isCampusLeader).toBe(false);
  });

  test("campus role assignments are flagged for attendance-first navigation", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertUniversity, {
      year: YEAR,
      name: "University of Sydney",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "sl@sow.org.au",
      year: YEAR,
      roles: ["Student Leader"],
      university: "University of Sydney",
    });
    const sl = (await asUser(t, "sl@sow.org.au").query(api.directory.me, {}))!;
    expect(sl.isCampusLeader).toBe(true);
    expect((await asUser(t, RACHEL).query(api.directory.me, {}))!.isCampusLeader).toBe(
      false
    );
  });
});

describe("nameForEmail", () => {
  test("prefers a profile name, falls back to the directory, else null", async () => {
    const t = await setup();
    expect(await t.query(api.directory.nameForEmail, { email: RACHEL })).toBeNull(); // unauth

    // No profile name and no directory entry -> null.
    expect(
      await asUser(t, RACHEL).query(api.directory.nameForEmail, { email: HENRY })
    ).toBeNull();

    // Directory fallback.
    await t.run((ctx) => ctx.db.insert("directoryUsers", { email: HENRY, name: "Henry H" }));
    expect(
      await asUser(t, RACHEL).query(api.directory.nameForEmail, { email: HENRY })
    ).toBe("Henry H");

    // A profile name wins over the directory.
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", HENRY).eq("year", YEAR))
        .unique();
      if (profile) await ctx.db.patch("staffProfiles", profile._id, { name: "Profile Henry" });
    });
    expect(
      await asUser(t, RACHEL).query(api.directory.nameForEmail, { email: HENRY })
    ).toBe("Profile Henry");
  });

  test("resolves the name from the given staff year's profile", async () => {
    const t = await setup();
    // Same person, a different name on an earlier year's imported profile.
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: RACHEL,
        year: YEAR - 2,
        assignments: [{ role: "Staff", department: "Marketing" }],
        name: "Rachel (maiden)",
      })
    );
    expect(
      await asUser(t, RACHEL).query(api.directory.nameForEmail, {
        email: RACHEL,
        year: YEAR - 2,
      })
    ).toBe("Rachel (maiden)");
  });
});

describe("availableYears", () => {
  test("includes structure years plus the current year, newest first, null when unauth", async () => {
    const t = await setup();
    expect(await t.query(api.directory.availableYears, {})).toBeNull();

    await t.run((ctx) => ctx.db.insert("divisions", { year: 2020, name: "Old" }));
    const years = (await asUser(t, RACHEL).query(api.directory.availableYears, {}))!;
    expect(years).toContain(2020);
    expect(years).toContain(YEAR);
    // Sorted descending.
    expect([...years].sort((a, b) => b - a)).toEqual(years);
  });

  test("exposes the next staff year only to admins", async () => {
    const t = await setup();
    // A pre-provisioned next-year structure would otherwise leak via this query.
    await t.run((ctx) =>
      ctx.db.insert("divisions", { year: YEAR + 1, name: "Engagement" })
    );
    const nonAdmin = (await asUser(t, RACHEL).query(api.directory.availableYears, {}))!;
    expect(nonAdmin).not.toContain(YEAR + 1);
    const admin = (await asUser(t, ADMIN).query(api.directory.availableYears, {}))!;
    expect(admin).toContain(YEAR + 1);
  });
});

describe("orgChart", () => {
  test("uses directory name as fallback when profile and user have no name", async () => {
    const t = await setup();
    // HENRY has a staff profile (head of Marketing) but no name anywhere.
    // A directoryUsers entry should be used as the name fallback.
    await t.run((ctx) =>
      ctx.db.insert("directoryUsers", { email: HENRY, name: "Henry from Directory" })
    );
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    const marketing = chart.divisions
      .flatMap((d) => d.departments)
      .find((d) => d.name === "Marketing");
    expect(marketing?.head?.name).toBe("Henry from Directory");
  });

  test("a real Director fills the slot and is excluded from staff/members", async () => {
    const t = await setup();
    // DAN is a Director in Marketing (from setup). HENRY also gets an Interim
    // Director role, but the real Director must still win the slot.
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "interim@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Interim Director" }],
      })
    );
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(chart.director?.email).toBe(DAN);
    expect(chart.director?.role).toBe("Director");
    // The Director is not also listed in the Staff group…
    expect(chart.staff.some((s) => s.email === DAN)).toBe(false);
    // …nor as a department member.
    const marketing = chart.divisions
      .flatMap((d) => d.departments)
      .find((d) => d.name === "Marketing");
    expect(marketing?.members.some((m) => m.email === DAN)).toBe(false);
  });

  test("an Interim Director fills the Director slot when no Director exists", async () => {
    const t = await setup();
    // Remove DAN's Director role and add an Interim Director.
    await t.run(async (ctx) => {
      const dan = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", DAN).eq("year", YEAR))
        .unique();
      if (dan) await ctx.db.delete("staffProfiles", dan._id);
      await ctx.db.insert("staffProfiles", {
        email: "interim@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Interim Director" }],
      });
    });
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(chart.director?.email).toBe("interim@sow.org.au");
    expect(chart.director?.role).toBe("Interim Director");
    // The interim director is not duplicated into the staff group.
    expect(chart.staff.some((s) => s.email === "interim@sow.org.au")).toBe(false);
  });

  test("non-department, non-division, non-campus people surface as staff", async () => {
    const t = await setup();
    // Two Staff roles with no department/division/university — otherwise
    // invisible. Two of them also exercises the name-sort of the staff list.
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "zoe@sow.org.au",
        year: YEAR,
        name: "Zoe",
        assignments: [{ role: "Staff" }],
      });
      await ctx.db.insert("staffProfiles", {
        email: "floater@sow.org.au",
        year: YEAR,
        name: "Aaron",
        assignments: [{ role: "Staff" }],
      });
    });
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(chart.staff.some((s) => s.email === "floater@sow.org.au")).toBe(true);
    expect(chart.staff.find((s) => s.email === "floater@sow.org.au")?.role).toBe("Staff");
    // Sorted by name: Aaron (floater) before Zoe.
    const emails = chart.staff.map((s) => s.email);
    expect(emails.indexOf("floater@sow.org.au")).toBeLessThan(emails.indexOf("zoe@sow.org.au"));
    // RACHEL is in the Marketing department, so she must NOT appear in staff.
    expect(chart.staff.some((s) => s.email === RACHEL)).toBe(false);
  });

  test("someone whose only role is a campus role does not surface as staff", async () => {
    const t = await setup();
    // A President with no university assigned: a campus member missing their
    // campus, NOT staff — so they must not appear in the Staff group.
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "prez@sow.org.au",
        year: YEAR,
        assignments: [{ role: "President" }],
      })
    );
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(chart.staff.some((s) => s.email === "prez@sow.org.au")).toBe(false);
  });

  test('the "General" division is shown; in a year with real departments staff stay a top-level group', async () => {
    const t = await setup(); // YEAR has Marketing/Finance departments
    await t.run(async (ctx) => {
      await ctx.db.insert("divisions", { year: YEAR, name: "General" });
      await ctx.db.insert("staffProfiles", {
        email: "general@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", division: "General" }],
      });
    });
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    // General is no longer hidden.
    expect(chart.divisions.some((d) => d.name === "General")).toBe(true);
    // The year has real departments, so staff remain a top-level group.
    expect(chart.staff.some((s) => s.email === "general@sow.org.au")).toBe(true);
  });

  test("a legacy year with no departments gets a Staff department under General", async () => {
    const t = await setup();
    const OLD = 2015;
    await t.run(async (ctx) => {
      await ctx.db.insert("divisions", { year: OLD, name: "General" });
      // A plain staff member with no department, and a campus role with a
      // university (who must NOT land in the Staff department).
      await ctx.db.insert("staffProfiles", {
        email: "oldstaff@sow.org.au",
        year: OLD,
        assignments: [{ role: "Staff" }],
      });
      await ctx.db.insert("staffProfiles", {
        email: "oldprez@sow.org.au",
        year: OLD,
        assignments: [{ role: "President", university: "UNSW" }],
      });
    });
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, { year: OLD }))!;
    const general = chart.divisions.find((d) => d.name === "General");
    expect(general).toBeDefined();
    const staffDept = general!.departments.find((d) => d.name === "Staff");
    expect(staffDept).toBeDefined();
    expect(staffDept!.members.some((m) => m.email === "oldstaff@sow.org.au")).toBe(true);
    // The campus role is not in the Staff department…
    expect(staffDept!.members.some((m) => m.email === "oldprez@sow.org.au")).toBe(false);
    // …and the top-level staff group is empty for this year.
    expect(chart.staff).toHaveLength(0);
  });

  test("only admins see and can view the next staff year", async () => {
    const t = await setup();
    // Give the next staff year a structure so it would otherwise be offered.
    await t.run((ctx) =>
      ctx.db.insert("divisions", { year: YEAR + 1, name: "Engagement" })
    );

    // Non-admin RACHEL: next year is hidden, unlabelled, and a direct request
    // for it is clamped back to the current year.
    const rachel = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(rachel.availableYears).not.toContain(YEAR + 1);
    expect(rachel.nextYear).toBeNull();
    const rachelNext = (await asUser(t, RACHEL).query(api.directory.orgChart, {
      year: YEAR + 1,
    }))!;
    expect(rachelNext.year).toBe(YEAR);

    // Admin: the next year is offered, labelled, and viewable.
    const admin = (await asUser(t, ADMIN).query(api.directory.orgChart, {}))!;
    expect(admin.availableYears).toContain(YEAR + 1);
    expect(admin.nextYear).toBe(YEAR + 1);
    const adminNext = (await asUser(t, ADMIN).query(api.directory.orgChart, {
      year: YEAR + 1,
    }))!;
    expect(adminNext.year).toBe(YEAR + 1);
  });
});
