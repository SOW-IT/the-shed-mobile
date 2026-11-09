/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { sydneyDateTimeAnswer, type FormAnswers } from "../shared/forms";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";
const EVAN = "evan@sow.org.au";
const MIA = "mia@sow.org.au";
const FINN = "finn@sow.org.au";
const PAT = "pat@sow.org.au";

const DAY = 86_400_000;
const NORA = "nora@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const budgetManager = async (t: TestConvex<typeof schema>, year: number) =>
  (
    await t.run((ctx) =>
      ctx.db.query("yearSettings").withIndex("by_year", (q) => q.eq("year", year)).first()
    )
  )?.budgetManagerEmail;

const addAssignment = (t: TestConvex<typeof schema>, email: string, department: string) =>
  t.run(async (ctx) => {
    const profile = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", YEAR))
      .first();
    await ctx.db.patch("staffProfiles", profile!._id, {
      assignments: [...(profile!.assignments ?? []), { role: "Staff", department }],
    });
  });

const setHead = async (t: TestConvex<typeof schema>, department: string, headEmail: string) => {
  const admin = asUser(t, ADMIN);
  const division = (await admin.query(api.directory.yearStructure, { year: YEAR }))!.departments.find(
    (d) => d.name === department
  )!.division;
  await admin.mutation(api.admin.updateDepartment, {
    year: YEAR,
    oldName: department,
    newName: department,
    division,
    headEmail,
  });
};

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
    await addAssignment(t, FINN, "Events");
    await admin.mutation(api.teams.set, { year: YEAR, job: "finance", department: "Events" });
    expect(await budgetManager(t, YEAR)).toBe(FINN);
    await admin.mutation(api.teams.set, { year: YEAR, job: "finance", department: "Alumni" });
    expect(await budgetManager(t, YEAR)).toBeUndefined();
    await admin.mutation(api.teams.set, { year: YEAR, job: "events", department: "Alumni" });
    expect(await departmentOf(t, YEAR, "events")).toBe("Alumni");
  });

  test("the always-admin job can't move to where nobody would be an admin", async () => {
    const { t, admin } = await setup();
    await expect(
      admin.mutation(api.teams.set, { year: YEAR, job: "admin", department: "Alumni" })
    ).rejects.toThrow(/Nobody would be an admin/);
    expect(await departmentOf(t, YEAR, "admin")).toBe("Data and IT");
    await admin.mutation(api.admins.set, { emails: [MIA], expected: [] });
    await admin.mutation(api.teams.set, { year: YEAR, job: "admin", department: "Alumni" });
    expect((await asUser(t, MIA).query(api.directory.me, {}))?.isAdmin).toBe(true);
  });

  test("a Director keeps someone an admin when the always-admin job moves", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, email: NORA, roles: ["Director"] });
    await admin.mutation(api.teams.set, { year: YEAR, job: "admin", department: "Alumni" });
    expect((await asUser(t, NORA).query(api.directory.me, {}))?.isAdmin).toBe(true);
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
    await expect(
      asUser(t, ADMIN).mutation(api.admins.set, { emails: [], expected: [] })
    ).rejects.toThrow(
      "Only admins can do this: the Director, People and Culture, and the people they've made admins."
    );
  });

  test("copying a staff year clears a budget manager who isn't in the copied finance team", async () => {
    const { t, admin } = await setup();
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    await admin.mutation(api.teams.set, { year: YEAR + 1, job: "finance", department: "Alumni" });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: FINN });
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1, force: true });
    expect(await departmentOf(t, YEAR + 1, "finance")).toBe("Alumni");
    expect(await budgetManager(t, YEAR + 1)).toBeUndefined();
  });

  test("copying a staff year carries its team jobs", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.teams.set, { year: YEAR, job: "design", department: "Alumni" });
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect(await departmentOf(t, YEAR + 1, "design")).toBe("Alumni");
    expect(await departmentOf(t, YEAR + 1, "finance")).toBe("Finance");
  });
});

describe("after a team job moves", () => {
  test("the new finance department's pending HOD approvals stay with its head", async () => {
    const { t, admin } = await setup();
    await setHead(t, "Events", EVAN);
    const id = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: NORA,
        department: "Events",
        description: "Snacks",
        amount: 100,
        approvedByHOD: "PENDING",
        approvedByBudgetManager: "PENDING",
        approvedByFinanceHead: "PENDING",
      })
    );
    await admin.mutation(api.teams.set, { year: YEAR, job: "finance", department: "Events" });
    const queue = (await asUser(t, EVAN).query(api.requests.toReview, {}))!;
    expect(queue.hod.map((r) => r._id)).toEqual([id]);
    await asUser(t, EVAN).mutation(api.requests.approve, { requestId: id, step: "hod" });
    expect((await t.run((ctx) => ctx.db.get("requests", id)))!.approvedByHOD).toBe("APPROVED");
  });

  test("a rename in the current year moves an admin's saved acting-as choice", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.actingAs.set, { persona: { role: "staff", department: "Marketing" } });
    const division = (await admin.query(api.directory.yearStructure, { year: YEAR }))!.departments.find(
      (d) => d.name === "Marketing"
    )!.division;
    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Marketing",
      newName: "Design",
      division,
    });
    expect((await admin.query(api.actingAs.options, {}))!.current).toEqual({
      role: "staff",
      department: "Design",
    });
  });

  test("design requests name the department that approves them", async () => {
    const { t } = await setup();
    await setHead(t, "Marketing", MIA);
    const admin = asUser(t, ADMIN);
    const division = (await admin.query(api.directory.yearStructure, { year: YEAR }))!.departments.find(
      (d) => d.name === "Marketing"
    )!.division;
    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Marketing",
      newName: "Design",
      division,
      headEmail: MIA,
    });
    const id = await asUser(t, EVAN).mutation(api.designRequests.submit, {
      answers: {
        department: "Events",
        types: ["promotion"],
        details: "Posters for the camp",
        items: ["poster"],
        visualStyle: "Bright",
        keyMessage: "Come along",
        promoBudget: 100,
        dueDate: sydneyDateTimeAnswer(Date.now() + 20 * DAY).slice(0, 10),
        multipleDrafts: false,
        runByYou: true,
      },
    });
    await expect(asUser(t, FINN).mutation(api.designRequests.approve, { id })).rejects.toThrow(
      "Only the Design Head can approve or decline design requests."
    );
    await asUser(t, MIA).mutation(api.designRequests.approve, { id });
    await expect(asUser(t, FINN).mutation(api.designRequests.complete, { id })).rejects.toThrow(
      "Only the Design team can mark design requests complete."
    );
  });

  test("a form's approver title comes from the year its approver was found in", async () => {
    const { t, admin } = await setup();
    const at = (days: number, hour: number) =>
      sydneyDateTimeAnswer(Date.now() + days * DAY).slice(0, 11) + `${String(hour).padStart(2, "0")}:00`;
    const answers: FormAnswers = {
      name: "[TEST] Camp",
      department: "Events",
      purpose: "Gather campuses",
      goals: "100 people",
      location: "A hall",
      registrationGoal: 100,
      audience: "all",
      start: at(40, 11),
      end: at(40, 17),
    };
    const id = await asUser(t, EVAN).mutation(api.eventRequests.create, { answers });
    await t.run((ctx) => ctx.db.patch("eventRequests", id, { year: YEAR - 1 }));
    await setHead(t, "Events", EVAN);
    await admin.mutation(api.teams.set, { year: YEAR, job: "marketingForm", department: "Events" });
    const page = (await asUser(t, EVAN).query(api.eventRequests.get, { id }))!;
    expect(page.forms.marketing.approverTitle).toBe("the Events Head");
    expect(page.forms.risk.approverTitle).toBe("the Compliance Head");
  });

  test("step timing follows the caller's own finance team, not the chosen year's", async () => {
    const { t, admin } = await setup();
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    await admin.mutation(api.teams.set, { year: YEAR + 1, job: "finance", department: "Events" });
    expect(await asUser(t, FINN).query(api.stepTiming.summary, { year: YEAR + 1 })).not.toBeNull();
    expect(await asUser(t, EVAN).query(api.stepTiming.summary, { year: YEAR + 1 })).toBeNull();
  });

  test("Home editing follows the design team", async () => {
    const { t, admin } = await setup();
    expect((await asUser(t, MIA).query(api.homeContent.view, {}))!.canEdit).toBe(true);
    await admin.mutation(api.teams.set, { year: YEAR, job: "design", department: "Events" });
    expect((await asUser(t, MIA).query(api.homeContent.view, {}))!.canEdit).toBe(false);
    expect((await asUser(t, EVAN).query(api.homeContent.view, {}))!.canEdit).toBe(true);
  });
});

describe("the 1 October rollover", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const settingsOf = (t: TestConvex<typeof schema>, year: number) =>
    t.run((ctx) => ctx.db.query("yearSettings").withIndex("by_year", (q) => q.eq("year", year)).first());

  test("next year follows this year's team choices until it sets its own", async () => {
    const { t, admin } = await setup();
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    await admin.mutation(api.teams.set, { year: YEAR, job: "design", department: "Events" });
    expect(await departmentOf(t, YEAR + 1, "design")).toBe("Events");
    await admin.mutation(api.teams.set, { year: YEAR + 1, job: "design", department: "Alumni" });
    await admin.mutation(api.teams.set, { year: YEAR, job: "design", department: "Missions" });
    expect(await departmentOf(t, YEAR + 1, "design")).toBe("Alumni");
    expect(await departmentOf(t, YEAR, "design")).toBe("Missions");

    await admin.mutation(api.admin.setBudgetManager, { year: YEAR + 1, email: FINN });
    await admin.mutation(api.teams.set, { year: YEAR, job: "finance", department: "Alumni" });
    expect(await departmentOf(t, YEAR + 1, "finance")).toBe("Alumni");
    expect(await budgetManager(t, YEAR + 1)).toBeUndefined();
  });

  test("renaming this year's department leaves next year on its own department", async () => {
    const { t, admin } = await setup();
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    const division = (await admin.query(api.directory.yearStructure, { year: YEAR }))!.departments.find(
      (d) => d.name === "Marketing"
    )!.division;
    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Marketing",
      newName: "Design",
      division,
    });
    expect(await departmentOf(t, YEAR, "design")).toBe("Design");
    expect(await departmentOf(t, YEAR + 1, "design")).toBe("Marketing");
    expect(await departmentOf(t, YEAR + 1, "marketingForm")).toBe("Marketing");
  });

  test("the new year keeps the team jobs, Budget Manager and thresholds set after the prefill", async () => {
    const { t, admin } = await setup();
    // The September prefill copies the incoming year a year ahead, before these are set.
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    await admin.mutation(api.teams.set, { year: YEAR, job: "design", department: "Events" });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: FINN });
    await admin.mutation(api.admin.setDirectorThreshold, { year: YEAR, amount: 7000 });
    await admin.mutation(api.admin.setEventDirectorThreshold, { year: YEAR, amount: 9000 });
    await admin.mutation(api.admin.setEventDirectorThreshold, { year: YEAR + 1, amount: 8000 });

    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(staffYearStartMs(YEAR + 1) + 60_000);
    expect(await t.mutation(internal.admin.carryFinanceSettingsForward, {})).toEqual({
      carried: ["directorApprovalThreshold", "budgetManagerEmail"],
    });
    expect(await settingsOf(t, YEAR + 1)).toMatchObject({
      budgetManagerEmail: FINN,
      directorApprovalThreshold: 7000,
      eventDirectorApprovalThreshold: 8000,
    });
    expect(await departmentOf(t, YEAR + 1, "design")).toBe("Events");
    expect((await asUser(t, EVAN).query(api.designRequests.viewer, {}))?.isMarketingStaff).toBe(true);
    expect(await t.mutation(internal.admin.carryFinanceSettingsForward, {})).toEqual({ carried: [] });
  });

  test("a Budget Manager who has left the finance team isn't carried into the new year", async () => {
    const { t, admin } = await setup();
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: FINN });
    await admin.mutation(api.admin.setStaffProfile, {
      year: YEAR + 1,
      email: FINN,
      roles: ["Staff"],
      department: "Events",
    });
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(staffYearStartMs(YEAR + 1) + 60_000);
    expect(await t.mutation(internal.admin.carryFinanceSettingsForward, {})).toEqual({ carried: [] });
    expect(await budgetManager(t, YEAR + 1)).toBeUndefined();
  });

  test("the Praise Managers carry into the prefilled year and into a new year that lost them", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.admin.addPraiseManager, { year: YEAR, email: EVAN });
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect((await settingsOf(t, YEAR + 1))?.praiseManagerEmails).toEqual([EVAN]);

    // Set after the prefill: the 1 October run fills the gap, keeping only current staff.
    await admin.mutation(api.admin.addPraiseManager, { year: YEAR, email: MIA });
    await t.run(async (ctx) => {
      const next = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR + 1))
        .first();
      await ctx.db.patch("yearSettings", next!._id, { praiseManagerEmails: undefined });
      const mia = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", MIA).eq("year", YEAR + 1))
        .first();
      await ctx.db.delete("staffProfiles", mia!._id);
    });
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(staffYearStartMs(YEAR + 1) + 60_000);
    expect(await t.mutation(internal.admin.carryFinanceSettingsForward, {})).toEqual({
      carried: ["praiseManagerEmails"],
    });
    expect((await settingsOf(t, YEAR + 1))?.praiseManagerEmails).toEqual([EVAN]);
    expect(await t.mutation(internal.admin.carryFinanceSettingsForward, {})).toEqual({ carried: [] });

    // An admin who empties the new year's list keeps it empty.
    await admin.mutation(api.admin.removePraiseManager, { year: YEAR + 1, email: EVAN });
    expect(await t.mutation(internal.admin.carryFinanceSettingsForward, {})).toEqual({ carried: [] });
    expect((await settingsOf(t, YEAR + 1))?.praiseManagerEmails).toEqual([]);
  });

  test("Praise Managers who all left staff aren't carried", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.admin.addPraiseManager, { year: YEAR, email: EVAN });
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(staffYearStartMs(YEAR + 1) + 60_000);
    expect(await t.mutation(internal.admin.carryFinanceSettingsForward, {})).toEqual({ carried: [] });
  });

  test("a new year with no settings yet gets last year's, and with none last year nothing is carried", async () => {
    const { t } = await setup();
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(staffYearStartMs(YEAR + 2) + 60_000);
    expect(await t.mutation(internal.admin.carryFinanceSettingsForward, {})).toEqual({ carried: [] });
    await t.run((ctx) =>
      ctx.db.insert("yearSettings", { year: YEAR + 1, eventDirectorApprovalThreshold: 6000 })
    );
    expect(await t.mutation(internal.admin.carryFinanceSettingsForward, {})).toEqual({
      carried: ["eventDirectorApprovalThreshold"],
    });
    expect(await settingsOf(t, YEAR + 2)).toMatchObject({ eventDirectorApprovalThreshold: 6000 });
  });
});
