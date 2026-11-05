/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";
const EVAN = "evan@sow.org.au";
const MIA = "mia@sow.org.au";
const FINN = "finn@sow.org.au";
const PAT = "pat@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  for (const [email, department] of [
    [EVAN, "Events"],
    [MIA, "Marketing"],
    [FINN, "Finance"],
    [PAT, "People and Culture"],
  ]) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, email, roles: ["Staff"], department });
  }
  return { t, admin };
}

const departmentOf = async (t: TestConvex<typeof schema>, year: number, job: string) =>
  (await asUser(t, ADMIN).query(api.teams.view, { year }))!.jobs.find((j) => j.job === job)!
    .department;

describe("teams.view and teams.set", () => {
  test("only admins see or change team jobs, for this year and next, to departments that exist", async () => {
    const { t, admin } = await setup();
    expect(await asUser(t, MIA).query(api.teams.view, { year: YEAR })).toBeNull();
    expect(await t.query(api.teams.view, { year: YEAR })).toBeNull();

    const view = (await admin.query(api.teams.view, { year: YEAR }))!;
    expect(view.editable).toBe(true);
    expect(view.jobs.map((j) => [j.job, j.department])).toEqual([
      ["finance", "Finance"],
      ["events", "Events"],
      ["design", "Marketing"],
      ["marketingForm", "Marketing"],
      ["riskForm", "Compliance"],
      ["financeForm", "Finance"],
      ["admin", "Data and IT"],
    ]);
    expect(view.departments).toContain("Alumni");
    expect((await admin.query(api.teams.view, { year: YEAR - 1 }))!.editable).toBe(false);

    await expect(
      asUser(t, MIA).mutation(api.teams.set, { year: YEAR, job: "design", department: "Events" })
    ).rejects.toThrow(/Only admins/);
    await expect(
      admin.mutation(api.teams.set, { year: YEAR - 1, job: "design", department: "Events" })
    ).rejects.toThrow(/You can only manage/);
    await expect(
      admin.mutation(api.teams.set, { year: YEAR, job: "design", department: "Design" })
    ).rejects.toThrow(`Department "Design" doesn't exist in ${YEAR}.`);
  });
});

describe("what a team job changes", () => {
  test("design requests follow the design department", async () => {
    const { t, admin } = await setup();
    expect((await asUser(t, MIA).query(api.designRequests.viewer, {}))?.isMarketingStaff).toBe(true);
    await admin.mutation(api.teams.set, { year: YEAR, job: "design", department: "Events" });
    expect((await asUser(t, MIA).query(api.designRequests.viewer, {}))?.isMarketingStaff).toBe(false);
    expect((await asUser(t, EVAN).query(api.designRequests.viewer, {}))?.isMarketingStaff).toBe(true);
  });

  test("a renamed finance department is still the finance team", async () => {
    const { t, admin } = await setup();
    const division = (await admin.query(api.directory.yearStructure, { year: YEAR }))!.departments.find(
      (d) => d.name === "Finance"
    )!.division;
    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Finance",
      newName: "Accounts",
      division,
    });
    expect(await departmentOf(t, YEAR, "finance")).toBe("Accounts");
    expect(await departmentOf(t, YEAR, "financeForm")).toBe("Accounts");
    const me = (await asUser(t, FINN).query(api.directory.me, {}))!;
    expect(me.isFinance).toBe(true);
    expect(me.teams?.finance).toBe("Accounts");
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: FINN });
    await expect(
      admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: MIA })
    ).rejects.toThrow(`The Budget Manager must be from the Accounts department in ${YEAR}.`);
  });

  test("moving the finance job keeps a budget manager who is in the new department", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: FINN });
    await admin.mutation(api.teams.set, { year: YEAR, job: "finance", department: "Finance" });
    const settings = await t.run((ctx) =>
      ctx.db.query("yearSettings").withIndex("by_year", (q) => q.eq("year", YEAR)).unique()
    );
    expect(settings?.budgetManagerEmail).toBe(FINN);
    await admin.mutation(api.teams.set, { year: YEAR, job: "events", department: "Alumni" });
    expect(await departmentOf(t, YEAR, "events")).toBe("Alumni");
  });

  test("the always-admin department can move", async () => {
    const { t, admin } = await setup();
    expect((await asUser(t, PAT).query(api.directory.me, {}))?.isAdmin).toBe(false);
    await admin.mutation(api.teams.set, { year: YEAR, job: "admin", department: "People and Culture" });
    expect((await asUser(t, PAT).query(api.directory.me, {}))?.isAdmin).toBe(true);
    expect((await asUser(t, PAT).query(api.admins.list, {}))!.fixed.map((f) => [f.email, f.reason])).toEqual([
      [PAT, "People and Culture"],
    ]);
    expect((await asUser(t, ADMIN).query(api.directory.me, {}))?.isAdmin).toBe(false);
  });

  test("copying a staff year carries its team jobs", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.teams.set, { year: YEAR, job: "design", department: "Alumni" });
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect(await departmentOf(t, YEAR + 1, "design")).toBe("Alumni");
    expect(await departmentOf(t, YEAR + 1, "finance")).toBe("Finance");
  });
});
