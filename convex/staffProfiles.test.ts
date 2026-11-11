import { describe, expect, test } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api } from "./_generated/api";
import { linkUserProfiles } from "./userLink";
import { type T, ADMIN, asUser, pinClock, seeded } from "../test/convexFixture";

const PINNED_NOW = staffYearStartMs(2026) + 150 * 86_400_000;
pinClock(PINNED_NOW);

const YEAR = staffYearForDate(new Date(PINNED_NOW));

describe("email changes: the person stays the same", () => {
  test("sign-in with a new email claims imported years keyed by the old one", async () => {
    const t = await seeded();
    const oldEmail = "jane.personal@gmail.com";
    const newEmail = "jane.doe@sow.org.au";

    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: oldEmail,
        year: YEAR - 2,
        assignments: [
          { role: "Student Leader", university: "University of Sydney" },
        ],
        importId: "uid-jane",
      });
      await ctx.db.insert("staffProfiles", {
        email: newEmail,
        year: YEAR,
        assignments: [{ role: "Staff", department: "Data and IT" }],
        importId: "uid-jane",
      });
      return await ctx.db.insert("users", { email: newEmail, name: "Jane Doe" });
    });

    await t.run((ctx) => linkUserProfiles(ctx, userId));

    await t.run(async (ctx) => {
      const bound = await ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10);
      expect(bound.length).toBe(2);
      expect(bound.map((p) => p.email)).toEqual([newEmail, newEmail]);
    });

    const profile = (await asUser(t, newEmail).query(api.profile.get, {}))!;
    expect(profile.serviceHistory.map((h) => h.year)).toEqual([YEAR, YEAR - 2]);
    expect(profile.serviceHistory[1].university).toBe("University of Sydney");
  });

  test("first sign-in after the Workspace domain migration claims legacy-domain profiles", async () => {
    const t = await seeded();
    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "mia.cho@sowaustralia.com",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Data and IT" }],
        importId: "uid-mia",
      });
      await ctx.db.insert("staffProfiles", {
        email: "mia.cho@sowaustralia.com",
        year: YEAR - 1,
        assignments: [
          { role: "Student Leader", university: "University of Sydney" },
        ],
        importId: "uid-mia",
      });
      return await ctx.db.insert("users", { email: "mia.cho@sow.org.au" });
    });

    await t.run((ctx) => linkUserProfiles(ctx, userId));

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

    const profile = (await asUser(t, "mia.cho@sow.org.au").query(api.profile.get, {}))!;
    expect(profile.serviceHistory.map((h) => h.year)).toEqual([YEAR, YEAR - 1]);
  });

  test("a personal account with a matching local part does NOT claim legacy-domain profiles", async () => {
    const t = await seeded();
    const { userId, legacyProfileId } = await t.run(async (ctx) => {
      const legacyProfileId = await ctx.db.insert("staffProfiles", {
        email: "mia.cho@sowaustralia.com",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Marketing" }],
      });
      const userId = await ctx.db.insert("users", { email: "mia.cho@gmail.com" });
      return { userId, legacyProfileId };
    });

    await t.run((ctx) => linkUserProfiles(ctx, userId));

    await t.run(async (ctx) => {
      const legacy = (await ctx.db.get(legacyProfileId))!;
      expect(legacy.email).toBe("mia.cho@sowaustralia.com");
      expect(legacy.userId).toBeUndefined();
      const bound = await ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10);
      expect(bound).toHaveLength(0);
    });
    expect((await asUser(t, "mia.cho@gmail.com").query(api.homeContent.view, {})).canEdit).toBe(false);
  });

  test("a legacy profile already bound to another user is NOT claimed by a matching local part", async () => {
    const t = await seeded();
    const { newUserId, legacyProfileId, oldUserId } = await t.run(async (ctx) => {
      const oldUserId = await ctx.db.insert("users", {
        email: "sam@sowaustralia.com",
      });
      const legacyProfileId = await ctx.db.insert("staffProfiles", {
        email: "sam@sowaustralia.com",
        year: YEAR - 1,
        assignments: [{ role: "Staff", department: "Data and IT" }],
        userId: oldUserId,
      });
      const newUserId = await ctx.db.insert("users", { email: "sam@sow.org.au" });
      return { newUserId, legacyProfileId, oldUserId };
    });

    await t.run((ctx) => linkUserProfiles(ctx, newUserId));

    await t.run(async (ctx) => {
      const legacy = (await ctx.db.get(legacyProfileId))!;
      expect(legacy.email).toBe("sam@sowaustralia.com");
      expect(legacy.userId).toBe(oldUserId);
      const bound = await ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", newUserId))
        .take(10);
      expect(bound).toHaveLength(0);
    });
  });

  test("people without an imported id get their user id as the person key", async () => {
    const t = await seeded();
    const admin = asUser(t, ADMIN);
    const newcomer = "noah.new@sow.org.au";

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

    const userId = await t.run((ctx) => ctx.db.insert("users", { email: newcomer }));
    await t.run((ctx) => linkUserProfiles(ctx, userId));
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", newcomer).eq("year", YEAR))
        .unique();
      expect(profile?.importId).toBe(userId);
    });

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
    const t = await seeded();
    const admin = asUser(t, ADMIN);
    const imported = "ivy.imported@sow.org.au";
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: imported,
        year: YEAR,
        assignments: [{ role: "Staff", department: "Finance" }],
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
    const t = await seeded();
    const oldEmail = "jay.old@gmail.com";
    const newEmail = "jay@sow.org.au";

    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: oldEmail,
        year: YEAR,
        assignments: [{ role: "Staff", department: "Events" }],
        importId: "uid-jay",
      });
      await ctx.db.insert("staffProfiles", {
        email: newEmail,
        year: YEAR,
        assignments: [{ role: "Staff", department: "Missions" }],
        importId: "uid-jay",
      });
      return await ctx.db.insert("users", { email: newEmail });
    });

    await t.run((ctx) => linkUserProfiles(ctx, userId));

    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", newEmail).eq("year", YEAR))
        .unique();
      expect(profile?.assignments).toEqual([
        { role: "Staff", department: "Missions" },
      ]);
    });
  });

  test("a re-key carries roles, saved accounts, song, design and event requests, grievances and notifications", async () => {
    const t = await seeded();
    const OLD = "lee.old@sow.org.au";
    const NEW = "lee@sow.org.au";
    const OTHER = "pat@sow.org.au";
    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: OLD,
        year: YEAR,
        assignments: [{ role: "Staff", department: "Data and IT" }],
      });
      await ctx.db.insert("admins", { email: OLD, addedBy: ADMIN, addedAt: 0 });
      await ctx.db.insert("yearSettings", {
        year: YEAR + 5,
        directorEmail: "LEE.OLD@sow.org.au",
        budgetManagerEmail: "Lee.Old@SOW.org.au",
        praiseManagerEmails: ["Lee.Old@sow.org.au", NEW, OTHER],
      });
      const accounts: [string, string, true | undefined][] = [
        [OLD, "111", true],
        [OLD, "222", undefined],
        [NEW, "222", true],
      ];
      for (const [email, accountNumber, preferred] of accounts) {
        await ctx.db.insert("savedBankAccounts", {
          email,
          accountName: "Lee",
          bsb: "062000",
          accountNumber,
          lastUsedAt: 0,
          preferred,
        });
      }
      await ctx.db.insert("musicRequests", {
        requesterEmail: OLD,
        title: "Song",
        artist: "Band",
        link: "https://open.spotify.com/track/x",
        status: "PENDING",
      });
      await ctx.db.insert("designRequests", {
        year: YEAR,
        number: 1,
        requesterEmail: OLD,
        submittedAt: 0,
        answers: {},
        department: "Data and IT",
        dueDate: "2026-12-01",
        title: "Poster",
        status: "PENDING",
      });
      await ctx.db.insert("eventRequests", {
        year: YEAR,
        number: 1,
        requesterEmail: OLD,
        department: "Data and IT",
        submittedAt: 0,
        answers: {},
        name: "Camp",
        startsAt: "2026-12-01",
        endsAt: "2026-12-02",
        location: "Sydney",
        status: "IN_PROGRESS",
      });
      await ctx.db.insert("grievances", {
        ref: "G-1",
        year: YEAR,
        submittedAt: 0,
        accountEmail: OLD,
        name: "Lee",
        email: OLD,
        category: "Other",
        details: "x",
        status: "IN_PROGRESS",
        assigneeEmail: OLD,
      });
      await ctx.db.insert("notifications", { userEmail: OLD, title: "Hi", body: "x", read: false });
      return await ctx.db.insert("users", { email: OLD });
    });

    await t.run((ctx) => linkUserProfiles(ctx, userId));
    await t.run((ctx) => ctx.db.patch("users", userId, { email: NEW }));
    await t.run((ctx) => linkUserProfiles(ctx, userId));

    await t.run(async (ctx) => {
      const admins = await ctx.db.query("admins").take(10);
      expect(admins.map((a) => a.email)).toEqual([NEW]);
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR + 5))
        .unique();
      expect(settings).toMatchObject({
        directorEmail: NEW,
        budgetManagerEmail: NEW,
        praiseManagerEmails: [NEW, OTHER],
      });
      const accounts = await ctx.db.query("savedBankAccounts").take(10);
      expect(
        accounts
          .map((a) => ({ email: a.email, accountNumber: a.accountNumber, preferred: a.preferred }))
          .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))
      ).toEqual([
        { email: NEW, accountNumber: "111", preferred: undefined },
        { email: NEW, accountNumber: "222", preferred: true },
      ]);
      const [song] = await ctx.db.query("musicRequests").take(10);
      expect(song.requesterEmail).toBe(NEW);
      const [design] = await ctx.db.query("designRequests").take(10);
      expect(design.requesterEmail).toBe(NEW);
      const [event] = await ctx.db.query("eventRequests").take(10);
      expect(event.requesterEmail).toBe(NEW);
      const [grievance] = await ctx.db.query("grievances").take(10);
      expect(grievance).toMatchObject({ accountEmail: NEW, assigneeEmail: NEW, email: OLD });
      const [notification] = await ctx.db.query("notifications").take(10);
      expect(notification.userEmail).toBe(NEW);
    });
  });

  describe("an approver's rename", () => {
    const HENRY = "henry@sow.org.au";
    const NEW = "henry.new@sow.org.au";
    const FIONA = "fiona@sow.org.au";
    const BELLA = "bella@sow.org.au";

    const rename = async (t: T) => {
      const userId = await t.run((ctx) => ctx.db.insert("users", { email: HENRY }));
      await t.run((ctx) => linkUserProfiles(ctx, userId));
      await t.run((ctx) => ctx.db.patch("users", userId, { email: NEW }));
      await t.run((ctx) => linkUserProfiles(ctx, userId));
    };
    const delegations = async (t: T) =>
      (await asUser(t, ADMIN).query(api.admin.listDelegations, { year: YEAR }))!.map((d) => [d.fromEmail, d.toEmail]);

    test("carries their division headship and Budget Manager role", async () => {
      const t = await seeded();
      await asUser(t, ADMIN).mutation(api.admin.upsertDivision, { year: YEAR, name: "Engagement", headEmail: HENRY });
      await t.run((ctx) => ctx.db.insert("yearSettings", { year: YEAR + 5, budgetManagerEmail: HENRY }));
      await rename(t);
      await t.run(async (ctx) => {
        const division = await ctx.db
          .query("divisions")
          .withIndex("by_year_and_name", (q) => q.eq("year", YEAR).eq("name", "Engagement"))
          .unique();
        expect(division?.headEmail).toBe(NEW);
        const settings = await ctx.db
          .query("yearSettings")
          .withIndex("by_year", (q) => q.eq("year", YEAR + 5))
          .unique();
        expect(settings?.budgetManagerEmail).toBe(NEW);
      });
    });

    test("carries their delegations both ways, dropping one the new email already has", async () => {
      const t = await seeded();
      const admin = asUser(t, ADMIN);
      await admin.mutation(api.admin.upsertDepartment, { year: YEAR, name: "Marketing", division: "Engagement", headEmail: HENRY });
      await admin.mutation(api.admin.upsertDepartment, { year: YEAR, name: "Finance", division: "Governance", headEmail: FIONA });
      await admin.mutation(api.admin.setStaffProfile, { year: YEAR, email: BELLA, roles: ["Staff"], department: "Finance" });
      await t.run((ctx) => ctx.db.insert("approverDelegations", { year: YEAR, fromEmail: NEW, toEmail: BELLA }));
      for (const [fromEmail, toEmail] of [
        [FIONA, HENRY],
        [HENRY, BELLA],
      ]) {
        await admin.mutation(api.admin.addDelegation, { year: YEAR, fromEmail, toEmail });
      }
      await rename(t);
      expect((await delegations(t)).sort()).toEqual([
        [FIONA, NEW],
        [NEW, BELLA],
      ]);
    });
  });

  test("a user row with no email, or a new email with no profiles anywhere, binds nothing", async () => {
    const t = await seeded();
    for (const fields of [{}, { email: "fresh.face@sow.org.au" }]) {
      const userId = await t.run((ctx) => ctx.db.insert("users", fields));
      await t.run((ctx) => linkUserProfiles(ctx, userId));
      const bound = await t.run((ctx) =>
        ctx.db
          .query("staffProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect()
      );
      expect(bound).toEqual([]);
    }
  });
});

describe("Student Leaders pick a university, not a department", () => {
  test("assignment requires one of the year's universities", async () => {
    const t = await seeded();
    const admin = asUser(t, ADMIN);
    const leader = "lara.lee@sow.org.au";

    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: leader,
        year: YEAR,
        roles: ["Student Leader"],
      })
    ).rejects.toThrow(/university/i);

    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: leader,
        year: YEAR,
        roles: ["Student Leader"],
        university: "Hogwarts",
      })
    ).rejects.toThrow(/university/i);

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
    expect(saved.assignments?.some((a) => a.university === "Macquarie University")).toBe(true);
    expect(saved.assignments?.every((a) => !a.department || a.department === "Chaplaincy")).toBe(true);
  });

  test("all campus roles need a university; Member needs nothing", async () => {
    const t = await seeded();
    const admin = asUser(t, ADMIN);

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

    await admin.mutation(api.admin.setStaffProfile, {
      email: "mona.member@sow.org.au",
      year: YEAR,
      roles: ["Member"],
    });

    const profiles = (await admin.query(api.admin.listStaffProfiles, {
      year: YEAR,
    }))!;
    const vp = profiles.find((p) => p.email === "vinh.vp@sow.org.au")!;
    expect(vp.assignments?.some((a) => a.university === "University of Sydney")).toBe(true);
    expect(vp.assignments?.every((a) => !a.department)).toBe(true);
    const member = profiles.find((p) => p.email === "mona.member@sow.org.au")!;
    expect(member.roles).toEqual(["Member"]);
  });

  test("universities are data-driven per year; one still assigned can't be deleted", async () => {
    const t = await seeded();
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
    ).rejects.toThrow(/Reassign them first/);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "leo@sow.org.au",
      year: YEAR,
      roles: ["Student Leader"],
      university: "University of Sydney",
    });
    await admin.mutation(api.admin.removeUniversity, {
      year: YEAR,
      name: "Australian Catholic University",
    });
    const after = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(after.universities).not.toContain("Australian Catholic University");
  });
});
