/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { sydneyToday, type DesignAnswers } from "../shared/designRequests";
import { sydneyDateTimeAnswer, type FormAnswers } from "../shared/forms";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
const PINNED_NOW = staffYearStartMs(staffYearForDate(new Date())) + 150 * DAY;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const YEAR = staffYearForDate(new Date(PINNED_NOW));
const at = (days: number, hour = 18) =>
  sydneyDateTimeAnswer(PINNED_NOW + days * DAY).slice(0, 11) + `${String(hour).padStart(2, "0")}:00`;
const atDay = (days: number) => vi.setSystemTime(PINNED_NOW + days * DAY);

const ADMIN = "admin@sow.org.au";
const HENRY = "henry@sow.org.au";
const MARY = "mary@sow.org.au";
const RACHEL = "rachel@sow.org.au";
const EDDIE = "eddie@sow.org.au";
const CORA = "cora@sow.org.au";
const FIONA = "fiona@sow.org.au";
const BELLA = "bella@sow.org.au";

type T = TestConvex<typeof schema>;
const asUser = (t: T, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const PEOPLE: [string, { role: string; department?: string }[]][] = [
  [HENRY, [{ role: "Head of Department", department: "Marketing" }]],
  [MARY, [{ role: "Staff", department: "Marketing" }]],
  [RACHEL, [{ role: "Staff", department: "Events" }]],
  [EDDIE, [{ role: "Head of Department", department: "Events" }]],
  [CORA, [{ role: "Head of Department", department: "Compliance" }]],
  [FIONA, [{ role: "Head of Department", department: "Finance" }]],
  [BELLA, [{ role: "Staff", department: "Finance" }]],
];
const HEADS: Record<string, string> = {
  Marketing: HENRY,
  Events: EDDIE,
  Compliance: CORA,
  Finance: FIONA,
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await t.run(async (ctx) => {
    for (const [email, assignments] of PEOPLE) {
      await ctx.db.insert("staffProfiles", { email, year: YEAR, assignments });
    }
    for (const department of await ctx.db.query("departments").collect()) {
      if (department.name in HEADS) {
        await ctx.db.patch("departments", department._id, { headEmail: HEADS[department.name] });
      }
    }
  });
  await asUser(t, ADMIN).mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
  return t;
}

const designAnswers = (details: string): DesignAnswers => ({
  department: "Events",
  types: ["promotion"],
  details,
  items: ["poster"],
  visualStyle: "Earthy",
  keyMessage: "Come along",
  promoBudget: 100,
  dueDate: sydneyToday(new Date(PINNED_NOW + 30 * DAY)),
  multipleDrafts: false,
  runByYou: true,
});

const eventAnswers = (name: string): FormAnswers => ({
  name,
  department: "Events",
  purpose: "Retreat",
  goals: "Rest",
  location: "Camp site",
  registrationGoal: 40,
  audience: "all",
  start: at(60, 9),
  end: at(60, 17),
});

const risk = {
  noRisks: false,
  risks: [
    { description: "Rain", category: "safety" as const, consequence: 2, likelihood: 3, mitigation: "Tents" },
  ],
};

describe("longest waiting first", () => {
  test("Review lists reimbursement requests by when they reached the approver", async () => {
    const t = await setup();
    await asUser(t, MARY).mutation(api.requests.submit, { description: "First", amount: 10 });
    atDay(2);
    await asUser(t, MARY).mutation(api.requests.submit, { description: "Second", amount: 20 });
    atDay(3);
    const review = (await asUser(t, HENRY).query(api.requests.toReview, {}))!;
    expect(review.hod.map((r) => r.description)).toEqual(["First", "Second"]);
    expect(review.hod.map((r) => Math.round(r.waitingSince / DAY))).toEqual([
      Math.round(PINNED_NOW / DAY),
      Math.round((PINNED_NOW + 2 * DAY) / DAY),
    ]);
  });

  test("the Marketing queue lists design requests by when they started waiting", async () => {
    const t = await setup();
    const early = await asUser(t, RACHEL).mutation(api.designRequests.submit, {
      answers: designAnswers("Early"),
    });
    atDay(1);
    await asUser(t, RACHEL).mutation(api.designRequests.submit, {
      answers: designAnswers("Late"),
    });
    atDay(4);
    await asUser(t, HENRY).mutation(api.designRequests.approve, { id: early });
    atDay(5);
    const queue = (await asUser(t, HENRY).query(api.designRequests.queue, {}))!;
    expect(queue.map((r) => [r.answers.details, r.status])).toEqual([
      ["Late", "PENDING"],
      ["Early", "APPROVED"],
    ]);
    expect(queue[1].waitingSince).toBe(queue[1].decidedAt);
    expect(queue[0].waitingSince).toBe(queue[0].submittedAt);
  });

  test("a Finance form waits on the Finance Head from the Director's approval, not its submission", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "dan@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Director" }],
      })
    );
    const id = await asUser(t, RACHEL).mutation(api.eventRequests.create, {
      answers: eventAnswers("Gala"),
    });
    atDay(1);
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveFinance, {
      id,
      finance: { income: [], expenses: [{ label: "Venue", amount: 9000 }] },
      submit: true,
    });
    atDay(3);
    await asUser(t, "dan@sow.org.au").mutation(api.eventSubForms.approve, { id, form: "finance" });
    atDay(4);
    const [row] = (await asUser(t, FIONA).query(api.eventRequests.review, {}))!;
    const form = (await asUser(t, FIONA).query(api.eventRequests.get, { id }))!.forms.finance;
    expect(row.waitingSince).toBe(form.directorApprovedAt);
    expect(row.waitingSince).toBeGreaterThan(form.submittedAt!);
  });

  test("To review lists events by their longest waiting form", async () => {
    const t = await setup();
    const camp = await asUser(t, RACHEL).mutation(api.eventRequests.create, {
      answers: eventAnswers("Camp"),
    });
    const rally = await asUser(t, RACHEL).mutation(api.eventRequests.create, {
      answers: eventAnswers("Rally"),
    });
    atDay(1);
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveRisk, { id: rally, risk, submit: true });
    atDay(2);
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveRisk, { id: camp, risk, submit: true });
    atDay(3);
    const review = (await asUser(t, CORA).query(api.eventRequests.review, {}))!;
    expect(review.map((r) => r.name)).toEqual(["Rally", "Camp"]);
    expect(review.map((r) => r.waitingOnMe)).toEqual([["risk"], ["risk"]]);
    expect(review[0].waitingSince).toBeLessThan(review[1].waitingSince);
  });
});
