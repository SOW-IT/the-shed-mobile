/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const PAST = YEAR - 7;

const ADMIN = "admin@sow.org.au";
const ANOJ = "anoj@sow.org.au";
const JUNO = "juno@sow.org.au";
const CARA = "cara@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await t.run(async (ctx) => {
    await ctx.db.insert("divisions", { year: PAST, name: "Operations" });
    await ctx.db.insert("departments", {
      year: PAST,
      name: "Campus",
      division: "Operations",
      headEmail: ANOJ,
    });
    await ctx.db.insert("roles", { year: PAST, name: "Department Overseer" });
    await ctx.db.insert("roles", { year: PAST, name: "Campus Chaplain" });
    await ctx.db.insert("staffProfiles", {
      email: ANOJ,
      year: PAST,
      name: "Anoj Joseph",
      assignments: [{ role: "Head of Department", department: "Campus" }],
    });
  });
  return t;
}

const overseer = (t: TestConvex<typeof schema>) =>
  t.mutation(internal.history.setRoleTitle, {
    year: PAST,
    title: "Department Overseer",
    standsFor: "Head of Department",
  });

describe("setRoleTitle", () => {
  test("links a past year's own title to an app role, and can unlink it", async () => {
    const t = await setup();
    const id = await overseer(t);
    let row = await t.run((ctx) => ctx.db.get("roles", id));
    expect(row).toMatchObject({ name: "Department Overseer", standsFor: "Head of Department" });
    await t.mutation(internal.history.setRoleTitle, { year: PAST, title: " Department Overseer " });
    row = await t.run((ctx) => ctx.db.get("roles", id));
    expect(row?.standsFor).toBeUndefined();
  });

  test("adds the title when that year's list doesn't have it", async () => {
    const t = await setup();
    const id = await t.mutation(internal.history.setRoleTitle, {
      year: PAST,
      title: "Division Overseer",
      standsFor: "Head of Division",
    });
    expect(await t.run((ctx) => ctx.db.get("roles", id))).toMatchObject({
      year: PAST,
      name: "Division Overseer",
      standsFor: "Head of Division",
    });
  });

  test("refuses this year, an empty title and roles the app doesn't know", async () => {
    const t = await setup();
    await expect(
      t.mutation(internal.history.setRoleTitle, { year: YEAR, title: "X", standsFor: "Staff" })
    ).rejects.toThrow(`${YEAR} isn't a past staff year.`);
    await expect(
      t.mutation(internal.history.setRoleTitle, { year: PAST, title: " " })
    ).rejects.toThrow("Enter the role's title.");
    await expect(
      t.mutation(internal.history.setRoleTitle, { year: PAST, title: "X", standsFor: "Boss" })
    ).rejects.toThrow(`"Boss" isn't one of the app's roles.`);
  });
});

describe("setPastAssignments", () => {
  test("replaces a past profile's assignments, or adds the profile", async () => {
    const t = await setup();
    const added = await t.mutation(internal.history.setPastAssignments, {
      year: PAST,
      email: " JUNO@sow.org.au ",
      name: "Juno Yu",
      importId: "uid-juno",
      assignments: [
        { role: "Campus Chaplain", department: "Chaplaincy" },
        { role: "Campus Chaplain", department: "Chaplaincy" },
      ],
    });
    expect(await t.run((ctx) => ctx.db.get("staffProfiles", added))).toMatchObject({
      email: JUNO,
      name: "Juno Yu",
      importId: "uid-juno",
      assignments: [{ role: "Campus Chaplain", department: "Chaplaincy" }],
    });
    const again = await t.mutation(internal.history.setPastAssignments, {
      year: PAST,
      email: JUNO,
      assignments: [
        { role: "Campus Chaplain", department: "Chaplaincy" },
        { role: "Head of Department", department: "Events" },
      ],
    });
    expect(again).toBe(added);
    expect((await t.run((ctx) => ctx.db.get("staffProfiles", added)))?.assignments).toHaveLength(2);
  });

  test("refuses this year and an empty list", async () => {
    const t = await setup();
    await expect(
      t.mutation(internal.history.setPastAssignments, {
        year: YEAR,
        email: JUNO,
        assignments: [{ role: "Staff" }],
      })
    ).rejects.toThrow("isn't a past staff year");
    await expect(
      t.mutation(internal.history.setPastAssignments, { year: PAST, email: JUNO, assignments: [] })
    ).rejects.toThrow("Give at least one assignment.");
  });
});

describe("a year's own role titles", () => {
  test("show on that year's org chart and structure, and nowhere else", async () => {
    const t = await setup();
    await overseer(t);
    const admin = asUser(t, ADMIN);
    const chart = (await admin.query(api.directory.orgChart, { year: PAST }))!;
    expect(chart.roleTitles).toEqual({ "Head of Department": "Department Overseer" });
    const structure = (await admin.query(api.directory.yearStructure, { year: PAST }))!;
    expect(structure.roles).toEqual(["Campus Chaplain"]);
    expect(structure.roleTitles).toEqual({ "Head of Department": "Department Overseer" });
    const now = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(now.roleTitles).toEqual({});
    expect((await admin.query(api.directory.me, {}))?.roleTitles).toEqual({});
  });

  test("name a co-head and a past Director by that year's title", async () => {
    const t = await setup();
    await overseer(t);
    await t.mutation(internal.history.setRoleTitle, {
      year: PAST,
      title: "Executive Director",
      standsFor: "Director",
    });
    await t.mutation(internal.history.setRoleTitle, {
      year: PAST,
      title: "Division Overseer",
      standsFor: "Head of Division",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: CARA,
        year: PAST,
        assignments: [{ role: "Head of Department", department: "Campus" }],
      });
      await ctx.db.insert("staffProfiles", {
        email: "dir@sow.org.au",
        year: PAST,
        assignments: [{ role: "Director" }],
      });
      await ctx.db.insert("staffProfiles", {
        email: "lead@sow.org.au",
        year: PAST,
        assignments: [{ role: "Head of Division", division: "Operations" }],
      });
    });
    const chart = (await asUser(t, ADMIN).query(api.directory.orgChart, { year: PAST }))!;
    expect(chart.director?.role).toBe("Executive Director");
    const operations = chart.divisions.find((d) => d.name === "Operations")!;
    expect(operations.head?.role).toBe("Division Overseer");
    const campus = operations.departments.find((d) => d.name === "Campus")!;
    expect(campus.members.find((m) => m.email === CARA)?.role).toBe("Department Overseer");
  });

  test("label each year of someone's service history", async () => {
    const t = await setup();
    await overseer(t);
    const history = (await asUser(t, ADMIN).query(api.profile.get, { email: ANOJ }))!;
    const past = history.serviceHistory.find((h) => h.year === PAST)!;
    expect(past.roleTitles).toEqual({ "Head of Department": "Department Overseer" });
  });

  test("label mentoring lines for a year that used them", async () => {
    const t = await setup();
    await overseer(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: CARA,
        year: PAST,
        name: "Cara Chen",
        assignments: [{ role: "Student Leader", university: "Macquarie University" }],
      });
      await ctx.db.insert("mentorships", {
        year: PAST,
        menteeEmail: CARA,
        mentorEmail: ANOJ,
        updatedBy: ADMIN,
        updatedAt: 1,
      });
    });
    const list = (await asUser(t, ADMIN).query(api.mentoring.pairings, { year: PAST }))!;
    expect(list.pairs[0].mentor.line).toBe("Department Overseer → Campus");
  });

  test("carry into the next year when a year is copied", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("roles", { year: YEAR, name: "Department Lead", standsFor: "Head of Department" })
    );
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    const copied = await t.run((ctx) =>
      ctx.db
        .query("roles")
        .withIndex("by_year_and_name", (q) => q.eq("year", YEAR + 1).eq("name", "Department Lead"))
        .unique()
    );
    expect(copied?.standsFor).toBe("Head of Department");
  });

  test("are never offered as roles to assign", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("roles", { year: YEAR, name: "Department Lead", standsFor: "Head of Department" })
    );
    await expect(
      asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
        year: YEAR,
        email: CARA,
        assignments: [{ role: "Department Lead", department: "Marketing" }],
      })
    ).rejects.toThrow(`Roles must be among the roles available for ${YEAR}.`);
  });
});
