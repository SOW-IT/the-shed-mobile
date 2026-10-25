/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { sydneyToday, type DesignAnswers } from "../shared/designRequests";
import { sydneyDateTimeAnswer, type FormAnswers } from "../shared/forms";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";
import { median } from "./stepTiming";

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
const DAN = "dan@sow.org.au";

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

const designAnswers = (over: DesignAnswers = {}): DesignAnswers => ({
  department: "Events",
  types: ["promotion"],
  details: "Hoodies",
  items: ["poster"],
  visualStyle: "Earthy",
  keyMessage: "Come along",
  promoBudget: 100,
  dueDate: sydneyToday(new Date(PINNED_NOW + 30 * DAY)),
  multipleDrafts: false,
  runByYou: true,
  ...over,
});

const eventAnswers = (): FormAnswers => ({
  name: "Winter Camp",
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

const marketing = (): FormAnswers => ({
  keyMessage: "Come",
  visualStyle: "n/a",
  printed: ["posters"],
  printed_posters: "10",
  multipleDrafts: false,
  runByYou: true,
  promoStart: at(10).slice(0, 10),
  postInfo: "Register",
});

const myRequestId = async (t: T, email: string) =>
  (await asUser(t, email).query(api.requests.myRequests, {}))![0]._id as Id<"requests">;

const stepsOf = (sections: NonNullable<Awaited<ReturnType<typeof summary>>>, key: string) =>
  sections.find((s) => s.key === key)!.steps;
const summary = (t: T, email: string, year = YEAR) =>
  asUser(t, email).query(api.stepTiming.summary, { year });

describe("median", () => {
  test("takes the middle value, or the mean of the two middle values", () => {
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("stepTiming.summary", () => {
  test("only admins and the Finance Head can see it", async () => {
    const t = await setup();
    expect(await summary(t, MARY)).toBeNull();
    expect(await summary(t, FIONA)).not.toBeNull();
    expect(await summary(t, ADMIN)).not.toBeNull();
  });

  test("measures each step from when it started waiting, per person, leaving auto-approvals out", async () => {
    const t = await setup();
    await asUser(t, MARY).mutation(api.requests.submit, { description: "Paint", amount: 40 });
    const paint = await myRequestId(t, MARY);
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "Rope", amount: 20 });
    const rope = await myRequestId(t, RACHEL);
    await asUser(t, HENRY).mutation(api.requests.submit, { description: "Ink", amount: 10 });

    atDay(1);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: paint, step: "hod" });
    atDay(3);
    await asUser(t, EDDIE).mutation(api.requests.approve, { requestId: rope, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: paint, step: "budgetManager" });
    atDay(4);
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: paint, step: "financeHead" });
    atDay(6);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["receipt"], { type: "application/pdf" }))
    );
    await asUser(t, MARY).mutation(api.requests.submitReceipt, {
      requestId: paint,
      recipients: [
        {
          accountName: "M",
          bsb: "062000",
          accountNumber: "12345678",
          amount: 40,
          attachments: [{ storageId, name: "receipt.pdf" }],
        },
      ],
    });
    atDay(7);
    await asUser(t, FIONA).mutation(api.requests.pay, { requestId: paint, paidAmount: 40 });
    await asUser(t, BELLA).mutation(api.requests.decline, {
      requestId: rope,
      step: "budgetManager",
      reason: "No",
    });

    await t.run((ctx) =>
      ctx.db.insert("requestEvents", { requestId: paint, action: "nudged", actorEmail: MARY })
    );

    const requests = stepsOf((await summary(t, ADMIN))!, "reimbursements");
    const ms = (value: number) => Math.round(value / 3_600_000) * 3_600_000;
    expect(requests.map((s) => [s.key, s.count, ms(s.medianMs), ms(s.longestMs)])).toEqual([
      ["request:hod", 2, 2 * DAY, 3 * DAY],
      ["request:budgetManager", 2, 3 * DAY, 4 * DAY],
      ["request:financeHead", 1, DAY, DAY],
      ["request:receipt", 1, 2 * DAY, 2 * DAY],
      ["request:payment", 1, DAY, DAY],
    ]);
    expect(requests[0].label).toBe("HOD approval");
    expect(
      requests[0].people
        .map((p) => ({ ...p, medianMs: ms(p.medianMs) }))
        .sort((a, b) => a.email.localeCompare(b.email))
    ).toEqual([
      { email: EDDIE, name: EDDIE, count: 1, medianMs: 3 * DAY },
      { email: HENRY, name: HENRY, count: 1, medianMs: DAY },
    ]);
    expect(requests[1].people.map((p) => p.email)).toEqual([BELLA]);
  });

  test("times design approval and completion, skipping the Marketing Head's own auto-approval", async () => {
    const t = await setup();
    const hoodies = await asUser(t, RACHEL).mutation(api.designRequests.submit, {
      answers: designAnswers(),
    });
    const own = await asUser(t, HENRY).mutation(api.designRequests.submit, {
      answers: designAnswers({ department: "Marketing", details: "Signage" }),
    });
    atDay(2);
    await asUser(t, HENRY).mutation(api.designRequests.approve, { id: hoodies });
    atDay(5);
    await asUser(t, MARY).mutation(api.designRequests.complete, { id: hoodies });
    await asUser(t, MARY).mutation(api.designRequests.complete, { id: own });

    const design = stepsOf((await summary(t, FIONA))!, "design");
    const ms = (value: number) => Math.round(value / 3_600_000) * 3_600_000;
    expect(design.map((s) => [s.key, s.count, ms(s.medianMs)])).toEqual([
      ["design:approval", 1, 2 * DAY],
      ["design:completion", 2, 4 * DAY],
    ]);
    expect(design[1].people.map((p) => ({ ...p, medianMs: ms(p.medianMs) }))).toEqual([
      { email: MARY, name: MARY, count: 2, medianMs: 4 * DAY },
    ]);
  });

  test("times each event form's filling in, review and Director step", async () => {
    const t = await setup();
    const id = await asUser(t, RACHEL).mutation(api.eventRequests.create, {
      answers: eventAnswers(),
    });
    atDay(1);
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveRisk, { id, risk, submit: true });
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveFinance, {
      id,
      finance: { income: [], expenses: [] },
      submit: true,
    });
    atDay(2);
    await asUser(t, CORA).mutation(api.eventSubForms.requestChanges, {
      id,
      form: "risk",
      reason: "More detail",
    });
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveMarketing, {
      id,
      answers: marketing(),
      submit: true,
    });
    atDay(3);
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveRisk, { id, risk, submit: true });
    await asUser(t, HENRY).mutation(api.eventSubForms.approve, { id, form: "marketing" });
    atDay(4);
    await asUser(t, CORA).mutation(api.eventSubForms.approve, { id, form: "risk" });
    await asUser(t, RACHEL).mutation(api.eventSubForms.reopen, { id, form: "finance" });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: DAN,
        year: YEAR,
        assignments: [{ role: "Director" }],
      });
    });
    atDay(5);
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveFinance, {
      id,
      finance: { income: [], expenses: [{ label: "Venue", amount: 9000 }] },
      submit: true,
    });
    atDay(6);
    await asUser(t, DAN).mutation(api.eventSubForms.approve, { id, form: "finance" });
    atDay(7);
    await asUser(t, FIONA).mutation(api.eventSubForms.approve, { id, form: "finance" });
    await t.run((ctx) =>
      ctx.db.insert("eventRequestEvents", {
        eventRequestId: id,
        form: "risk",
        action: "commented",
        actorEmail: RACHEL,
      })
    );
    const own = await asUser(t, CORA).mutation(api.eventRequests.create, {
      answers: { ...eventAnswers(), name: "Audit day", department: "Compliance" },
    });
    await asUser(t, CORA).mutation(api.eventSubForms.saveRisk, { id: own, risk, submit: true });

    const sections = (await summary(t, ADMIN))!;
    const events = stepsOf(sections, "events");
    const ms = (value: number) => Math.round(value / 3_600_000) * 3_600_000;
    expect(events.map((s) => [s.key, s.count, ms(s.medianMs)])).toEqual([
      ["event:risk:fill", 3, DAY],
      ["event:finance:fill", 2, DAY],
      ["event:risk:review", 2, DAY],
      ["event:marketing:fill", 1, 2 * DAY],
      ["event:marketing:review", 1, DAY],
      ["event:finance:director", 1, DAY],
      ["event:finance:review", 1, DAY],
    ]);
    expect(events[0].label).toBe("Risk form filled in");
    expect(events[2].people.map((p) => ({ ...p, medianMs: ms(p.medianMs) }))).toEqual([
      { email: CORA, name: CORA, count: 2, medianMs: DAY },
    ]);
    expect(sections.map((s) => s.label)).toEqual([
      "Reimbursements",
      "Design requests",
      "Event requests",
    ]);
  });
});
