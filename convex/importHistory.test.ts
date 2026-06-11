/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { IMPORT_DATA } from "./importData";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  return t;
}

describe("importHistory: backfill from the old web app's Firestore", () => {
  test("fills every year's structure and people, and re-runs cleanly", async () => {
    const t = await setup();
    const first = await t.mutation(internal.importHistory.run, {});
    // 2008-2026 from the backup; 2027+ is rolled from live data instead.
    expect(first.profiles).toBeGreaterThan(750);
    expect(IMPORT_DATA.years.some((y) => y.year > 2026)).toBe(false);
    expect(first.budgetManagers).toBeGreaterThanOrEqual(6);

    // Re-running must upsert, not duplicate (unique (email, year) survives).
    const second = await t.mutation(internal.importHistory.run, {});
    expect(second.divisions).toBe(0);
    expect(second.universities).toBe(0);

    const data2026 = IMPORT_DATA.years.find((y) => y.year === 2026)!;
    await t.run(async (ctx) => {
      const finance = await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) => q.eq("year", 2026).eq("name", "Finance"))
        .unique();
      expect(finance?.division).toBe("Governance");
      // 2026 emails are on the new Workspace domain (DOMAIN_MIGRATED_YEARS).
      expect(finance?.headEmail).toMatch(/@sow\.org\.au$/);

      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", 2026))
        .unique();
      expect(settings?.budgetManagerEmail).toBe(data2026.budgetManagerEmail);

      // Every imported profile carries the durable person id.
      const profiles = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", 2026))
        .take(1000);
      const imported = profiles.filter((p) => p.importId !== undefined);
      expect(imported.length).toBe(data2026.profiles.length);

      // Student Leaders came in with a university and no department.
      const studentLeaders = imported.filter((p) =>
        (p.roles ?? []).includes("Student Leader")
      );
      expect(studentLeaders.length).toBeGreaterThan(0);
      for (const leader of studentLeaders) {
        expect(leader.university).toBeDefined();
        expect(leader.department).toBeUndefined();
      }

      const universities = await ctx.db
        .query("universities")
        .withIndex("by_year_and_name", (q) => q.eq("year", 2026))
        .take(50);
      expect(universities.map((u) => u.name).sort()).toEqual([
        ...data2026.universities,
      ]);
    });

    // The org chart for an imported year shows campus people by university.
    const chart = (await asUser(t, ADMIN).query(api.directory.orgChart, {
      year: 2026,
    }))!;
    const campus = chart.universities.flatMap((u) => u.members);
    expect(campus.length).toBeGreaterThan(20);

    // Division heads come from the division itself, so one person can head
    // several: in 2026 Sijin Yang heads Chaplaincy AND Engagement.
    const headOf = (name: string) =>
      chart.divisions.find((d) => d.name === name)?.head?.email;
    expect(headOf("Chaplaincy")).toBe("sijin.yang@sow.org.au");
    expect(headOf("Engagement")).toBe("sijin.yang@sow.org.au");
    expect(headOf("Operations")).toBe("monica.park@sow.org.au");
  });
});

describe("importHistory: migrateEmailDomain", () => {
  test("re-keys a year's profiles, heads, budget manager and requests", async () => {
    const t = await setup();
    await t.mutation(internal.importHistory.run, {});

    const result = await t.mutation(internal.importHistory.migrateEmailDomain, {
      year: 2025,
      fromDomain: "sowaustralia.com",
      toDomain: "sow.org.au",
    });
    expect(result.profiles).toBeGreaterThan(50);

    await t.run(async (ctx) => {
      const profiles = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", 2025))
        .take(1000);
      expect(profiles.some((p) => p.email.endsWith("@sowaustralia.com"))).toBe(false);

      const finance = await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) => q.eq("year", 2025).eq("name", "Finance"))
        .unique();
      expect(finance?.headEmail).toMatch(/@sow\.org\.au$/);

      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", 2025))
        .unique();
      expect(settings?.budgetManagerEmail).toBe("brandon.teng@sow.org.au");

      // Other years are untouched.
      const previous = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", 2024))
        .take(1000);
      expect(previous.some((p) => p.email.endsWith("@sowaustralia.com"))).toBe(true);
    });

    // Running it again is a no-op.
    const again = await t.mutation(internal.importHistory.migrateEmailDomain, {
      year: 2025,
      fromDomain: "sowaustralia.com",
      toDomain: "sow.org.au",
    });
    expect(again).toMatchObject({ profiles: 0, merged: 0, departments: 0 });
  });
});

describe("email changes: the person stays the same", () => {
  test("sign-in with a new email claims imported years keyed by the old one", async () => {
    const t = await setup();
    const oldEmail = "jane.personal@gmail.com";
    const newEmail = "jane.doe@sow.org.au";

    const userId = await t.run(async (ctx) => {
      // Imported history: same person (importId) under different emails.
      await ctx.db.insert("staffProfiles", {
        email: oldEmail,
        year: YEAR - 2,
        roles: ["Student Leader"],
        university: "University of Sydney",
        importId: "uid-jane",
      });
      await ctx.db.insert("staffProfiles", {
        email: newEmail,
        year: YEAR,
        roles: ["Staff"],
        department: "Data and IT",
        importId: "uid-jane",
      });
      return await ctx.db.insert("users", { email: newEmail, name: "Jane Doe" });
    });

    // What Convex Auth runs after every sign-in.
    await t.mutation(internal.userLink.link, { userId });

    await t.run(async (ctx) => {
      const bound = await ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10);
      expect(bound.length).toBe(2);
      // The old year was re-keyed to the current address.
      expect(bound.map((p) => p.email)).toEqual([newEmail, newEmail]);
    });

    // Service history shows both years under the new email.
    const profile = (await asUser(t, newEmail).query(api.profile.get, {}))!;
    expect(profile.serviceHistory.map((h) => h.year)).toEqual([YEAR, YEAR - 2]);
    expect(profile.serviceHistory[1].university).toBe("University of Sydney");
  });

  test("first sign-in after the Workspace domain migration claims legacy-domain profiles", async () => {
    const t = await setup();
    // Imported from the old app under the previous Workspace domain.
    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "mia.cho@sowaustralia.com",
        year: YEAR,
        roles: ["Staff"],
        department: "Data and IT",
        importId: "uid-mia",
      });
      await ctx.db.insert("staffProfiles", {
        email: "mia.cho@sowaustralia.com",
        year: YEAR - 1,
        roles: ["Student Leader"],
        university: "University of Sydney",
        importId: "uid-mia",
      });
      // The same person, signing in with the org's new domain.
      return await ctx.db.insert("users", { email: "mia.cho@sow.org.au" });
    });

    await t.mutation(internal.userLink.link, { userId });

    await t.run(async (ctx) => {
      const bound = await ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10);
      expect(bound.length).toBe(2);
      expect(new Set(bound.map((p) => p.email))).toEqual(
        new Set(["mia.cho@sow.org.au"])
      );
    });

    // Their service history follows them onto the new address.
    const profile = (await asUser(t, "mia.cho@sow.org.au").query(api.profile.get, {}))!;
    expect(profile.serviceHistory.map((h) => h.year)).toEqual([YEAR, YEAR - 1]);
  });

  test("people without an imported id get their user id as the person key", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const newcomer = "noah.new@sow.org.au";

    // Pre-provisioned before ever signing in: no users row, no person key.
    await admin.mutation(api.admin.setStaffProfile, {
      email: newcomer,
      year: YEAR,
      roles: ["Staff"],
      department: "Data and IT",
    });
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", newcomer).eq("year", YEAR))
        .unique();
      expect(profile?.importId).toBeUndefined();
    });

    // First sign-in fills it with their user id, on every bound year.
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: newcomer }));
    await t.mutation(internal.userLink.link, { userId });
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", newcomer).eq("year", YEAR))
        .unique();
      expect(profile?.importId).toBe(userId);
    });

    // Provisioning another year after sign-in picks the key up immediately.
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR + 1,
      name: "Governance",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR + 1,
      name: "Data and IT",
      division: "Governance",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: newcomer,
      year: YEAR + 1,
      roles: ["Staff"],
      department: "Data and IT",
    });
    await t.run(async (ctx) => {
      const nextYear = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", newcomer).eq("year", YEAR + 1)
        )
        .unique();
      expect(nextYear?.importId).toBe(userId);
    });
  });

  test("re-provisioning an imported person keeps their imported key", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const imported = "ivy.imported@sow.org.au";
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: imported,
        year: YEAR,
        roles: ["Staff"],
        department: "Finance",
        importId: "uid-ivy",
      });
    });
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR + 1,
      name: "Governance",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR + 1,
      name: "Finance",
      division: "Governance",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: imported,
      year: YEAR + 1,
      roles: ["Staff"],
      department: "Finance",
    });
    await t.run(async (ctx) => {
      const nextYear = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", imported).eq("year", YEAR + 1)
        )
        .unique();
      expect(nextYear?.importId).toBe("uid-ivy");
    });
  });

  test("re-keying never duplicates a (email, year) profile", async () => {
    const t = await setup();
    const oldEmail = "jay.old@gmail.com";
    const newEmail = "jay@sow.org.au";

    const userId = await t.run(async (ctx) => {
      // The same year exists under both the old and the new email (e.g. an
      // admin re-provisioned the person manually after they lost access).
      await ctx.db.insert("staffProfiles", {
        email: oldEmail,
        year: YEAR,
        roles: ["Staff"],
        department: "Events",
        importId: "uid-jay",
      });
      await ctx.db.insert("staffProfiles", {
        email: newEmail,
        year: YEAR,
        roles: ["Staff"],
        department: "Missions",
        importId: "uid-jay",
      });
      return await ctx.db.insert("users", { email: newEmail });
    });

    await t.mutation(internal.userLink.link, { userId });

    await t.run(async (ctx) => {
      // .unique() would throw if both rows survived under the new email.
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", newEmail).eq("year", YEAR))
        .unique();
      expect(profile?.department).toBe("Missions"); // the existing row wins
    });
  });
});

describe("importHistory: re-import after a re-key", () => {
  test("matches the person by importId and never duplicates them", async () => {
    const t = await setup();
    await t.mutation(internal.importHistory.run, {});

    // Someone imported under the old domain signs in with the new one —
    // all of their years get re-keyed and bound.
    const imported = IMPORT_DATA.years.find((y) => y.year === 2025)!.profiles.find(
      (p) => p.email.endsWith("@sowaustralia.com") && (p.roles ?? []).length > 0
    )!;
    const newEmail = `${imported.email.split("@")[0]}@sow.org.au`;
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: newEmail }));
    await t.mutation(internal.userLink.link, { userId });

    // Re-importing must update the re-keyed rows, not re-insert old ones.
    await t.mutation(internal.importHistory.run, {});
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("staffProfiles")
        .withIndex("by_importId", (q) => q.eq("importId", imported.importId))
        .take(50);
      const years = rows.map((r) => r.year);
      expect(new Set(years).size).toBe(years.length); // one row per year
      for (const row of rows) {
        expect(row.email).toBe(newEmail); // the newer address survives
      }
    });
  });
});

describe("multi-headship: one person, several divisions/departments", () => {
  test("naming someone head of a second division keeps the first", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const sijin = "sijin@sow.org.au";

    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Engagement",
      headEmail: sijin,
    });
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Operations",
      headEmail: sijin,
    });

    const structure = (await admin.query(api.directory.yearStructure, {
      year: YEAR,
    }))!;
    const headed = structure.divisions.filter((d) => d.headEmail === sijin);
    expect(headed.map((d) => d.name).sort()).toEqual(["Engagement", "Operations"]);

    // The reverse-synced profile got the role once and kept its first division.
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const profile = profiles.find((p) => p.email === sijin)!;
    expect(profile.roles).toEqual(["Head of Division"]);
    expect(profile.division).toBe("Engagement");

    // Re-saving their staff assignment (role kept) vacates neither division.
    await admin.mutation(api.admin.setStaffProfile, {
      email: sijin,
      year: YEAR,
      roles: ["Head of Division"],
      division: "Engagement",
    });
    const after = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(
      after.divisions.filter((d) => d.headEmail === sijin).map((d) => d.name).sort()
    ).toEqual(["Engagement", "Operations"]);

    // The org chart shows them on top of both divisions.
    const chart = (await admin.query(api.directory.orgChart, { year: YEAR }))!;
    expect(
      chart.divisions.filter((d) => d.head?.email === sijin).map((d) => d.name).sort()
    ).toEqual(["Engagement", "Operations"]);

    // Losing the role vacates every division they head.
    await admin.mutation(api.admin.setStaffProfile, {
      email: sijin,
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const vacated = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(vacated.divisions.some((d) => d.headEmail === sijin)).toBe(false);
  });

  test("a department head keeps other departments when re-saved", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const henry = "henry@sow.org.au";
    // Henry heads both Marketing and Events.
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
      headEmail: henry,
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Events",
      division: "Operations",
      headEmail: henry,
    });
    // Re-saving his assignment with Marketing selected keeps Events too.
    await admin.mutation(api.admin.setStaffProfile, {
      email: henry,
      year: YEAR,
      roles: ["Head of Department"],
      department: "Marketing",
    });
    const structure = (await admin.query(api.directory.yearStructure, {
      year: YEAR,
    }))!;
    expect(
      structure.departments
        .filter((d) => d.headEmail === henry)
        .map((d) => d.name)
        .sort()
    ).toEqual(["Events", "Marketing"]);
  });
});

describe("Student Leaders pick a university, not a department", () => {
  test("assignment requires one of the year's universities", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = "lara.lee@sow.org.au";

    // No university given -> rejected.
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: leader,
        year: YEAR,
        roles: ["Student Leader"],
      })
    ).rejects.toThrow(/university/i);

    // A university that doesn't exist that year -> rejected.
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: leader,
        year: YEAR,
        roles: ["Student Leader"],
        university: "Hogwarts",
      })
    ).rejects.toThrow(/university/i);

    // One of the seeded universities works; no department is needed.
    await admin.mutation(api.admin.setStaffProfile, {
      email: leader,
      year: YEAR,
      roles: ["Student Leader"],
      university: "Macquarie University",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, {
      year: YEAR,
    }))!;
    const saved = profiles.find((p) => p.email === leader)!;
    expect(saved.university).toBe("Macquarie University");
    expect(saved.department).toBeUndefined();
  });

  test("all campus roles need a university; Member needs nothing", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    // Vice President (like President/Executive) is a campus role.
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "vinh.vp@sow.org.au",
        year: YEAR,
        roles: ["Vice President"],
      })
    ).rejects.toThrow(/university/i);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "vinh.vp@sow.org.au",
      year: YEAR,
      roles: ["Vice President"],
      university: "University of Sydney",
    });

    // Member takes neither a department nor a university.
    await admin.mutation(api.admin.setStaffProfile, {
      email: "mona.member@sow.org.au",
      year: YEAR,
      roles: ["Member"],
    });

    const profiles = (await admin.query(api.admin.listStaffProfiles, {
      year: YEAR,
    }))!;
    const vp = profiles.find((p) => p.email === "vinh.vp@sow.org.au")!;
    expect(vp.university).toBe("University of Sydney");
    expect(vp.department).toBeUndefined();
    const member = profiles.find((p) => p.email === "mona.member@sow.org.au")!;
    expect(member.roles).toEqual(["Member"]);
  });

  test("universities are data-driven per year and protected while in use", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    const structure = (await admin.query(api.directory.yearStructure, {
      year: YEAR,
    }))!;
    expect(structure.universities).toContain("University of Sydney");

    await admin.mutation(api.admin.upsertUniversity, {
      year: YEAR,
      name: "Australian Catholic University",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "leo@sow.org.au",
      year: YEAR,
      roles: ["Student Leader"],
      university: "Australian Catholic University",
    });
    await expect(
      admin.mutation(api.admin.removeUniversity, {
        year: YEAR,
        name: "Australian Catholic University",
      })
    ).rejects.toThrow(/assigned/i);
  });
});
