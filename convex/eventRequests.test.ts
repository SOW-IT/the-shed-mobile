/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { sydneyDateTimeAnswer, type FormAnswers } from "../shared/forms";
import { SUB_FORM_INBOXES, type FinanceData, type RiskData } from "../shared/eventRequests";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { NEVER_FINISHED_NOTE } from "./eventRequestImport";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
// Pinned mid staff year so dates a few weeks either side of "now" never
// straddle the 1 October rollover (see ADR 0003).
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

const ADMIN = "admin@sow.org.au";
const EVA = "eva@sow.org.au"; // Events staff, the usual requester
const ELLA = "ella@sow.org.au"; // Events staff
const EDDIE = "eddie@sow.org.au"; // Events Head
const MIKE = "mike@sow.org.au"; // Marketing Head
const MARY = "mary@sow.org.au"; // Marketing staff
const CORA = "cora@sow.org.au"; // Compliance Head
const CARL = "carl@sow.org.au"; // Compliance staff
const FIONA = "fiona@sow.org.au"; // Finance Head
const FRED = "fred@sow.org.au"; // Finance staff
const DAN = "dan@sow.org.au"; // Director
const OLLIE = "ollie@sow.org.au"; // Missions staff: no part in Events' events
const LEE = "lee@sow.org.au"; // a campus leader

type T = TestConvex<typeof schema>;

const asUser = (t: T, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const PEOPLE: [string, { role: string; department?: string; university?: string }[]][] = [
  [EVA, [{ role: "Staff", department: "Events" }]],
  [ELLA, [{ role: "Staff", department: "Events" }]],
  [EDDIE, [{ role: "Head of Department", department: "Events" }]],
  [MIKE, [{ role: "Head of Department", department: "Marketing" }]],
  [MARY, [{ role: "Staff", department: "Marketing" }]],
  [CORA, [{ role: "Head of Department", department: "Compliance" }]],
  [CARL, [{ role: "Staff", department: "Compliance" }]],
  [FIONA, [{ role: "Head of Department", department: "Finance" }]],
  [FRED, [{ role: "Staff", department: "Finance" }]],
  [DAN, [{ role: "Director" }]],
  [OLLIE, [{ role: "Staff", department: "Missions" }]],
  [LEE, [{ role: "Student Leader", university: "UNSW" }]],
];

const HEADS: Record<string, string | undefined> = {
  Events: EDDIE,
  Marketing: MIKE,
  Compliance: CORA,
  Finance: FIONA,
};

async function setup({ heads = HEADS }: { heads?: Record<string, string | undefined> } = {}) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await t.run(async (ctx) => {
    for (const [email, assignments] of PEOPLE) {
      await ctx.db.insert("staffProfiles", { email, year: YEAR, assignments });
    }
    for (const department of await ctx.db.query("departments").collect()) {
      if (department.name in heads) {
        await ctx.db.patch("departments", department._id, { headEmail: heads[department.name] });
      }
    }
  });
  return t;
}

const eventAnswers = (over: FormAnswers = {}): FormAnswers => ({
  name: "[TEST] SAF27",
  department: "Events",
  purpose: "Raise funds for SOW",
  goals: "Raise $10k",
  location: "Harbour City Church",
  registrationGoal: 120,
  audience: "all",
  start: at(40, 11),
  end: at(40, 17),
  ...over,
});

const marketingAnswers = (over: FormAnswers = {}): FormAnswers => ({
  keyMessage: "Give generously",
  visualStyle: "n/a",
  printed: ["posters"],
  printed_posters: "20 A3 posters",
  multipleDrafts: false,
  runByYou: true,
  ...over,
});

const risks = (over: Partial<RiskData> = {}): RiskData => ({
  noRisks: false,
  risks: [
    {
      description: "Trip on cables",
      category: "safety",
      consequence: 2,
      likelihood: 3,
      mitigation: "Tape them down",
    },
  ],
  ...over,
});

const budget = (expenses: number, income = 0): FinanceData => ({
  income: income ? [{ label: "Tickets", amount: income }] : [],
  expenses: expenses ? [{ label: "Venue", amount: expenses }] : [],
});

const create = (t: T, email = EVA, over: FormAnswers = {}) =>
  asUser(t, email).mutation(api.eventRequests.create, { answers: eventAnswers(over) });

const get = async (t: T, id: Id<"eventRequests">, email = EVA) =>
  (await asUser(t, email).query(api.eventRequests.get, { id }))!;

const submitMarketing = (t: T, id: Id<"eventRequests">, email = EVA, over: FormAnswers = {}) =>
  asUser(t, email).mutation(api.eventSubForms.saveMarketing, {
    id,
    answers: marketingAnswers(over),
    submit: true,
  });
const submitRisk = (t: T, id: Id<"eventRequests">, data = risks(), email = EVA) =>
  asUser(t, email).mutation(api.eventSubForms.saveRisk, { id, risk: data, submit: true });
const submitFinance = (t: T, id: Id<"eventRequests">, data = budget(800), email = EVA) =>
  asUser(t, email).mutation(api.eventSubForms.saveFinance, { id, finance: data, submit: true });
const approve = (t: T, id: Id<"eventRequests">, form: "marketing" | "risk" | "finance", email: string) =>
  asUser(t, email).mutation(api.eventSubForms.approve, { id, form });

const notificationsFor = (t: T, email: string) =>
  t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .collect()
  );

/** Every email queued so far, whether or not it has run yet. */
const emails = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .map((f) => f.args[0] as { to: string; subject?: string; body?: string })
      .filter((a) => a.subject !== undefined && a.body !== undefined)
  );
const emailsTo = async (t: T, to: string) =>
  (await emails(t)).filter((e) => e.to === to).map((e) => e.subject);

const actions = async (t: T, id: Id<"eventRequests">) =>
  (await asUser(t, EVA).query(api.eventRequests.timeline, { id }))!.map((e) =>
    e.form ? `${e.form}:${e.action}` : e.action
  );

describe("who can use event requests", () => {
  test("campus leaders and people without a profile can't", async () => {
    const t = await setup();
    expect(await asUser(t, LEE).query(api.eventRequests.viewer, {})).toBeNull();
    await expect(create(t, LEE)).rejects.toThrow(/not campus leaders/);
    expect(await t.query(api.eventRequests.mine, {})).toBeNull();
    expect(await asUser(t, "nobody@sow.org.au").query(api.eventRequests.waitingOnMe, {})).toBe(0);
  });

  test("who sees an event: its department, the reviewing teams, Events, the Director and admins", async () => {
    const t = await setup();
    const id = await create(t);
    for (const email of [EVA, ELLA, EDDIE, MARY, CARL, FRED, DAN, ADMIN]) {
      expect((await asUser(t, email).query(api.eventRequests.get, { id }))?.event._id).toBe(id);
    }
    expect(await asUser(t, OLLIE).query(api.eventRequests.get, { id })).toBeNull();
    expect(await asUser(t, OLLIE).query(api.eventRequests.get, { id: "nonsense" })).toBeNull();
    expect(await asUser(t, OLLIE).query(api.eventRequests.timeline, { id })).toBeNull();
    expect(await asUser(t, LEE).query(api.eventRequests.get, { id })).toBeNull();
    expect(await asUser(t, LEE).query(api.eventRequests.timeline, { id })).toBeNull();
    expect(await asUser(t, OLLIE).query(api.eventRequests.all, { year: YEAR })).toBeNull();
    expect(await asUser(t, OLLIE).query(api.eventRequests.viewer, {})).toMatchObject({
      reviews: false,
      seesAll: false,
    });
    expect(await asUser(t, CARL).query(api.eventRequests.viewer, {})).toMatchObject({
      reviews: true,
      seesAll: true,
    });
    expect(await asUser(t, ELLA).query(api.eventRequests.viewer, {})).toMatchObject({
      reviews: false,
      seesAll: true,
      departments: ["Events"],
    });
  });
});

describe("the event", () => {
  test("is checked, numbered in its year and starts with three forms to fill in", async () => {
    const t = await setup();
    await expect(create(t, EVA, { name: " " })).rejects.toThrow('Answer "Event name".');
    await expect(create(t, EVA, { end: at(39) })).rejects.toThrow(/can't be before "Starts"/);
    await expect(create(t, EVA, { department: "Missions" })).rejects.toThrow(
      /one you're in/
    );
    const first = await create(t);
    const second = await create(t, ELLA);
    const data = await get(t, second);
    expect(data.event).toMatchObject({
      number: 2,
      year: YEAR,
      name: "[TEST] SAF27",
      startsAt: at(40, 11),
      endsAt: at(40, 17),
      location: "Harbour City Church",
      status: "IN_PROGRESS",
    });
    expect(Object.values(data.forms).map((f) => f.status)).toEqual(["DRAFT", "DRAFT", "DRAFT"]);
    expect(data.forms.marketing.approverName).toBe(MIKE);
    expect(data.forms.finance.approverTitle).toBe("the Finance Head");
    expect(data.can).toEqual({ edit: true, cancel: true });
    expect(data.forms.risk.can).toEqual({ fill: true, decide: false, reopen: false, comment: true });
    expect(data.directorThreshold).toBe(5000);
    expect((await get(t, first, MARY)).can).toEqual({ edit: false, cancel: false });
    expect(await actions(t, first)).toEqual(["created"]);
  });

  test("someone without a department can lead it from any department", async () => {
    const t = await setup();
    const id = await create(t, DAN, { department: "Missions" });
    expect((await get(t, id, DAN)).event.department).toBe("Missions");
    await expect(create(t, DAN, { department: "Nowhere" })).rejects.toThrow(/one you're in/);
  });

  test("the requester's department can edit it; reviewers of sent forms hear about it", async () => {
    const t = await setup();
    const id = await create(t);
    await submitRisk(t, id);
    await expect(
      asUser(t, OLLIE).mutation(api.eventRequests.update, { id, answers: eventAnswers() })
    ).rejects.toThrow(/Only the requester/);
    expect(
      await asUser(t, ELLA).mutation(api.eventRequests.update, { id, answers: eventAnswers() })
    ).toBeNull();
    await asUser(t, ELLA).mutation(api.eventRequests.update, {
      id,
      answers: eventAnswers({ location: "Town Hall", notes: "Bring cash" }),
    });
    expect((await get(t, id)).event).toMatchObject({ location: "Town Hall" });
    expect((await actions(t, id)).at(-1)).toBe("edited");
    const timeline = await asUser(t, EVA).query(api.eventRequests.timeline, { id });
    expect(timeline!.at(-1)!.detail).toBe("Location, Notes");
    expect((await notificationsFor(t, CORA)).map((n) => n.title)).toContain("Event edited");
    expect(await emailsTo(t, SUB_FORM_INBOXES.risk)).toContain(
      "Event request: [TEST] SAF27 was edited"
    );
    expect(await emailsTo(t, SUB_FORM_INBOXES.marketing)).not.toContain(
      "Event request: [TEST] SAF27 was edited"
    );
  });

  test("can be cancelled by its side, telling the teams already involved", async () => {
    const t = await setup();
    const id = await create(t);
    await submitFinance(t, id);
    await expect(asUser(t, OLLIE).mutation(api.eventRequests.cancel, { id })).rejects.toThrow(
      /Only the requester/
    );
    await expect(
      asUser(t, EVA).mutation(api.eventRequests.cancel, { id, note: "x".repeat(4001) })
    ).rejects.toThrow(/at most 4000/);
    await asUser(t, EDDIE).mutation(api.eventRequests.cancel, { id, note: " Venue fell through " });
    const data = await get(t, id);
    expect(data.event).toMatchObject({ status: "CANCELLED", cancelledBy: EDDIE, cancelNote: "Venue fell through" });
    expect(data.cancelledByName).toBe(EDDIE);
    expect(data.can).toEqual({ edit: false, cancel: false });
    expect(await emailsTo(t, SUB_FORM_INBOXES.finance)).toContain(
      "Event request: [TEST] SAF27 was cancelled"
    );
    expect(await emailsTo(t, SUB_FORM_INBOXES.marketing)).not.toContain(
      "Event request: [TEST] SAF27 was cancelled"
    );
    await expect(asUser(t, EVA).mutation(api.eventRequests.cancel, { id })).rejects.toThrow(
      /already cancelled/
    );
    await expect(
      asUser(t, EVA).mutation(api.eventRequests.update, { id, answers: eventAnswers() })
    ).rejects.toThrow(/cancelled, so it can't be edited/);
    await expect(submitMarketing(t, id)).rejects.toThrow(/cancelled, so its forms/);
    await expect(
      asUser(t, EVA).mutation(api.eventSubForms.reopen, { id, form: "finance" })
    ).rejects.toThrow(/cancelled, so its forms can't be reopened/);
  });
});

describe("the Marketing form", () => {
  test("saves drafts, then goes to the Marketing Head with the team told", async () => {
    const t = await setup();
    const id = await create(t);
    await expect(
      asUser(t, ELLA).mutation(api.eventSubForms.saveMarketing, {
        id,
        answers: { keyMessage: "Half done", promoStart: "not a date" },
        submit: false,
      })
    ).rejects.toThrow(/Pick a date/);
    await asUser(t, ELLA).mutation(api.eventSubForms.saveMarketing, {
      id,
      answers: { keyMessage: "Half done" },
      submit: false,
    });
    expect((await get(t, id)).forms.marketing).toMatchObject({
      status: "DRAFT",
      answers: { keyMessage: "Half done" },
    });
    await expect(submitMarketing(t, id, EVA, { visualStyle: "" })).rejects.toThrow(
      'Answer "Theme / visual style".'
    );
    await expect(submitMarketing(t, id, OLLIE)).rejects.toThrow(/Only the requester/);
    await submitMarketing(t, id);
    const form = (await get(t, id)).forms.marketing;
    expect(form).toMatchObject({ status: "PENDING", submittedBy: EVA });
    expect((await notificationsFor(t, MIKE)).map((n) => n.title)).toEqual(["Approval needed"]);
    expect((await notificationsFor(t, MARY)).map((n) => n.title)).toEqual(["Approval needed"]);
    expect(await emailsTo(t, MIKE)).toEqual([
      "Marketing form for [TEST] SAF27 needs your approval",
    ]);
    expect(await emailsTo(t, MARY)).toEqual([]);
    expect(await emailsTo(t, SUB_FORM_INBOXES.marketing)).toHaveLength(1);
    await expect(submitMarketing(t, id)).rejects.toThrow(
      /waiting for approval. Ask the Marketing Head/
    );

    expect((await get(t, id, MIKE)).forms.marketing.can.decide).toBe(true);
    await expect(approve(t, id, "marketing", MARY)).rejects.toThrow(
      "Only the Marketing Head can approve this form now."
    );
    await approve(t, id, "marketing", MIKE);
    expect((await get(t, id)).forms.marketing).toMatchObject({
      status: "APPROVED",
      decidedBy: MIKE,
      decidedByName: MIKE,
    });
    expect((await notificationsFor(t, EVA)).map((n) => n.title)).toContain("Form approved");
    expect((await notificationsFor(t, MARY)).map((n) => n.title)).toContain("Form approved");
    await expect(approve(t, id, "marketing", MIKE)).rejects.toThrow(/isn't waiting/);
    await expect(submitMarketing(t, id)).rejects.toThrow(/done. Reopen it/);
  });

  test("the Marketing Head's own form is approved straight away", async () => {
    const t = await setup();
    const id = await create(t, MIKE, { department: "Marketing" });
    await submitMarketing(t, id, MIKE);
    expect((await get(t, id, MIKE)).forms.marketing.status).toBe("APPROVED");
    expect(await actions(t, id)).toEqual(["created", "marketing:submitted", "marketing:auto-approved"]);
    expect((await notificationsFor(t, MARY)).map((n) => n.body)).toContain(
      "It was approved automatically, as mike@sow.org.au is the Marketing Head."
    );
  });

  test("a delegate covering for the Head can approve it", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, { year: YEAR, fromEmail: MIKE, toEmail: MARY });
    const id = await create(t);
    await submitMarketing(t, id);
    expect((await notificationsFor(t, MARY)).map((n) => n.title)).toEqual(["Approval needed"]);
    expect(await asUser(t, MARY).query(api.eventRequests.waitingOnMe, {})).toBe(1);
    await approve(t, id, "marketing", MARY);
    expect((await get(t, id)).forms.marketing.status).toBe("APPROVED");
  });
});

describe("the Risk form", () => {
  test('"no notable risks" needs no approval, but Compliance is told', async () => {
    const t = await setup();
    const id = await create(t);
    await submitRisk(t, id, risks({ noRisks: true }));
    expect((await get(t, id)).forms.risk).toMatchObject({
      status: "NOT_REQUIRED",
      risk: { noRisks: true, risks: [] },
    });
    expect((await notificationsFor(t, CORA)).map((n) => n.title)).toEqual([
      "Risk form not required",
    ]);
    expect(await emailsTo(t, CORA)).toEqual([]);
    expect(await emailsTo(t, SUB_FORM_INBOXES.risk)).toEqual([
      "Risk form for [TEST] SAF27: not required",
    ]);
  });

  test("Compliance can ask for changes, and the requester resubmits", async () => {
    const t = await setup();
    const id = await create(t);
    await expect(submitRisk(t, id, risks({ risks: [] }))).rejects.toThrow(/Add at least one risk/);
    await asUser(t, EVA).mutation(api.eventSubForms.saveRisk, {
      id,
      risk: risks({ risks: [{ description: "Half" }] }),
      submit: false,
    });
    await expect(
      asUser(t, EVA).mutation(api.eventSubForms.saveRisk, {
        id,
        risk: risks({ contingencies: "x".repeat(4001) }),
        submit: false,
      })
    ).rejects.toThrow(/at most 4000/);
    await submitRisk(t, id);
    const reason = (r: string) =>
      asUser(t, CORA).mutation(api.eventSubForms.requestChanges, { id, form: "risk", reason: r });
    await expect(reason(" ")).rejects.toThrow(/Say what needs to change/);
    await expect(reason("x".repeat(4001))).rejects.toThrow(/at most 4000/);
    await reason("Add crowd control");
    const form = (await get(t, id)).forms.risk;
    expect(form).toMatchObject({ status: "CHANGES_REQUESTED", changesReason: "Add crowd control" });
    expect(form.can.fill).toBe(true);
    expect((await notificationsFor(t, EVA)).map((n) => n.title)).toContain("Changes requested");
    await submitRisk(t, id);
    const resubmitted = (await get(t, id)).forms.risk;
    expect(resubmitted.status).toBe("PENDING");
    expect(resubmitted.changesReason).toBeUndefined();
    expect(await actions(t, id)).toEqual([
      "created",
      "risk:submitted",
      "risk:changes-requested",
      "risk:submitted",
    ]);
  });

  test("can't be sent without a Compliance Head", async () => {
    const t = await setup({ heads: { ...HEADS, Compliance: undefined } });
    const id = await create(t);
    await expect(submitRisk(t, id)).rejects.toThrow(
      /no Head of Compliance for \d+ to approve this form/
    );
  });
});

describe("the Finance form", () => {
  test("$0 in and out needs no approval", async () => {
    const t = await setup();
    const id = await create(t);
    await submitFinance(t, id, budget(0));
    expect((await get(t, id)).forms.finance.status).toBe("NOT_REQUIRED");
    expect((await notificationsFor(t, FIONA)).map((n) => n.title)).toEqual([
      "Finance form not required",
    ]);
  });

  test("a small budget goes straight to the Finance Head", async () => {
    const t = await setup();
    const id = await create(t);
    await expect(
      submitFinance(t, id, { income: [], expenses: [{ label: "", amount: 50 }] })
    ).rejects.toThrow(/say what it's for/);
    await asUser(t, EVA).mutation(api.eventSubForms.saveFinance, {
      id,
      finance: { income: [], expenses: [{ label: "", amount: 50 }] },
      submit: false,
    });
    await expect(
      asUser(t, EVA).mutation(api.eventSubForms.saveFinance, {
        id,
        finance: { income: [], expenses: [{ label: "x", amount: -5 }] },
        submit: false,
      })
    ).rejects.toThrow(/negative/);
    await submitFinance(t, id, budget(5000));
    expect((await get(t, id)).forms.finance).toMatchObject({ status: "PENDING", step: "financeHead" });
    expect(await asUser(t, DAN).query(api.eventRequests.waitingOnMe, {})).toBe(0);
    await approve(t, id, "finance", FIONA);
    expect((await get(t, id)).forms.finance.status).toBe("APPROVED");
  });

  test("over the threshold, the Director approves first, then the Finance Head", async () => {
    const t = await setup();
    const id = await create(t);
    await submitFinance(t, id, budget(5000.01, 2000));
    let form = (await get(t, id)).forms.finance;
    expect(form).toMatchObject({ status: "PENDING", step: "director", approverTitle: "the Director" });
    expect(await emailsTo(t, DAN)).toEqual(["Finance form for [TEST] SAF27 needs your approval"]);
    await expect(approve(t, id, "finance", FIONA)).rejects.toThrow(
      "Only the Director can approve this form now."
    );
    expect((await asUser(t, FRED).query(api.eventRequests.review, {}))!.map((r) => r.waitingOnMe)).toEqual([[]]);
    await approve(t, id, "finance", DAN);
    form = (await get(t, id)).forms.finance;
    expect(form).toMatchObject({ status: "PENDING", step: "financeHead", directorApprovedBy: DAN });
    expect(await emailsTo(t, FIONA)).toEqual(["Finance form for [TEST] SAF27 needs your approval"]);
    expect(await emailsTo(t, SUB_FORM_INBOXES.finance)).toHaveLength(2);

    // Changes at any step start the chain again.
    await asUser(t, FIONA).mutation(api.eventSubForms.requestChanges, {
      id,
      form: "finance",
      reason: "Cheaper venue?",
    });
    const changed = (await get(t, id)).forms.finance;
    expect(changed.status).toBe("CHANGES_REQUESTED");
    expect(changed.step).toBeUndefined();
    expect(changed.directorApprovedBy).toBeUndefined();
    await submitFinance(t, id, budget(6000));
    expect((await get(t, id)).forms.finance.step).toBe("director");
  });

  test("the threshold is set in Admin, separately from reimbursements", async () => {
    const t = await setup();
    await expect(
      asUser(t, EVA).mutation(api.admin.setEventDirectorThreshold, { year: YEAR, amount: 9000 })
    ).rejects.toThrow(/Only admins or the Finance Head/);
    await expect(
      asUser(t, FIONA).mutation(api.admin.setEventDirectorThreshold, { year: YEAR, amount: 0 })
    ).rejects.toThrow(/positive/);
    await asUser(t, FIONA).mutation(api.admin.setEventDirectorThreshold, { year: YEAR, amount: 9000 });
    await asUser(t, ADMIN).mutation(api.admin.setEventDirectorThreshold, { year: YEAR, amount: 10000 });
    const structure = await asUser(t, ADMIN).query(api.directory.yearStructure, { year: YEAR });
    expect(structure).toMatchObject({
      eventDirectorApprovalThreshold: 10000,
      directorApprovalThreshold: null,
    });
    const id = await create(t);
    await submitFinance(t, id, budget(9999));
    expect((await get(t, id)).forms.finance.step).toBe("financeHead");
    expect((await get(t, id)).directorThreshold).toBe(10000);
  });

  test("a new year's settings start with the event threshold too", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.setEventDirectorThreshold, { year: YEAR, amount: 7000 });
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    const next = await asUser(t, ADMIN).query(api.directory.yearStructure, { year: YEAR + 1 });
    expect(next!.eventDirectorApprovalThreshold).toBe(7000);
  });

  test("the Director's own big budget skips their step", async () => {
    const t = await setup();
    const id = await create(t, DAN, { department: "Events" });
    await submitFinance(t, id, budget(9000), DAN);
    expect((await get(t, id, DAN)).forms.finance).toMatchObject({ step: "financeHead", directorApprovedBy: DAN });
    expect(await actions(t, id)).toEqual(["created", "finance:submitted", "finance:auto-approved"]);
  });

  test("the Finance Head's own big budget still needs the Director", async () => {
    const t = await setup();
    const id = await create(t, FIONA, { department: "Finance" });
    await submitFinance(t, id, budget(9000), FIONA);
    expect((await get(t, id, FIONA)).forms.finance.can.decide).toBe(false);
    await approve(t, id, "finance", DAN);
    expect((await get(t, id, FIONA)).forms.finance.status).toBe("APPROVED");
    expect(await actions(t, id)).toEqual([
      "created",
      "finance:submitted",
      "finance:director-approved",
      "finance:auto-approved",
    ]);
  });

  test("someone in Finance can't approve a form they sent", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, { year: YEAR, fromEmail: FIONA, toEmail: FRED });
    const id = await create(t, FRED, { department: "Finance" });
    await submitFinance(t, id, budget(100), FRED);
    await expect(approve(t, id, "finance", FRED)).rejects.toThrow(/a form you submitted/);
  });

  test("needs a Director for big budgets and a Finance Head for any", async () => {
    const t = await setup({ heads: { ...HEADS, Finance: undefined } });
    const id = await create(t);
    await expect(submitFinance(t, id, budget(100))).rejects.toThrow(/no Head of Finance/);
    await t.run(async (ctx) => {
      const dan = (await ctx.db.query("staffProfiles").collect()).find((p) => p.email === DAN)!;
      await ctx.db.delete("staffProfiles", dan._id);
      await ctx.db.insert("yearSettings", { year: YEAR, directorEmail: "" });
    });
    await expect(submitFinance(t, id, budget(9000))).rejects.toThrow(/no Director is set/);
  });
});

describe("going ahead", () => {
  async function approvedEvent(t: T) {
    const id = await create(t);
    await submitMarketing(t, id);
    await approve(t, id, "marketing", MIKE);
    await submitRisk(t, id, risks({ noRisks: true }));
    await submitFinance(t, id);
    await approve(t, id, "finance", FIONA);
    return id;
  }

  test("once every form is approved or not required, the event is approved", async () => {
    const t = await setup();
    const id = await approvedEvent(t);
    const data = await get(t, id);
    expect(data.event.status).toBe("APPROVED");
    expect(data.event.approvedAt).toBeDefined();
    expect(data.can.edit).toBe(false);
    expect((await notificationsFor(t, EDDIE)).map((n) => n.title)).toContain("Event approved");
    for (const inbox of Object.values(SUB_FORM_INBOXES)) {
      expect(await emailsTo(t, inbox)).toContain("Event request: [TEST] SAF27 is approved");
    }
    expect((await actions(t, id)).at(-1)).toBe("event-approved");
    await expect(
      asUser(t, EVA).mutation(api.eventRequests.update, { id, answers: eventAnswers() })
    ).rejects.toThrow(/approved. Reopen one of its forms/);
    await expect(submitMarketing(t, id)).rejects.toThrow(/approved. Reopen the form/);
  });

  test("reopening a form puts the event back in progress", async () => {
    const t = await setup();
    const id = await approvedEvent(t);
    expect((await get(t, id)).forms.finance.can.reopen).toBe(true);
    await expect(
      asUser(t, OLLIE).mutation(api.eventSubForms.reopen, { id, form: "finance" })
    ).rejects.toThrow(/Only the requester/);
    await asUser(t, ELLA).mutation(api.eventSubForms.reopen, { id, form: "finance" });
    const data = await get(t, id);
    expect(data.event.status).toBe("IN_PROGRESS");
    expect(data.event.approvedAt).toBeUndefined();
    expect(data.forms.finance.status).toBe("DRAFT");
    expect(data.forms.finance.decidedBy).toBeUndefined();
    expect((await notificationsFor(t, FIONA)).map((n) => n.title)).toContain("Form reopened");
    await expect(
      asUser(t, EVA).mutation(api.eventSubForms.reopen, { id, form: "finance" })
    ).rejects.toThrow(/Only an approved form/);
  });

  test("a form missing from the database is reported", async () => {
    const t = await setup();
    const id = await create(t);
    await t.run(async (ctx) => {
      const form = (await ctx.db.query("eventSubForms").collect()).find((f) => f.kind === "risk")!;
      await ctx.db.delete("eventSubForms", form._id);
    });
    await expect(submitMarketing(t, id)).rejects.toThrow(/missing a form/);
    await t.run(async (ctx) => ctx.db.delete("eventRequests", id));
    await expect(submitMarketing(t, id)).rejects.toThrow(/not found/);
  });
});

describe("lists", () => {
  test("mine, review and all", async () => {
    const t = await setup();
    const id = await create(t);
    const other = await create(t, OLLIE, { department: "Missions" });
    await submitMarketing(t, id);
    await submitRisk(t, other, risks(), OLLIE);

    const mine = (await asUser(t, ELLA).query(api.eventRequests.mine, {}))!;
    expect(mine.map((r) => r._id)).toEqual([id]);
    expect(mine[0]).toMatchObject({
      requesterName: null,
      forms: { marketing: { status: "PENDING" }, risk: { status: "DRAFT" } },
    });
    expect(await asUser(t, ELLA).query(api.eventRequests.mine, { year: YEAR - 1 })).toEqual([]);

    const forMike = (await asUser(t, MIKE).query(api.eventRequests.review, {}))!;
    expect(forMike.map((r) => [r._id, r.waitingOnMe])).toEqual([[id, ["marketing"]]]);
    const forCarl = (await asUser(t, CARL).query(api.eventRequests.review, {}))!;
    expect(forCarl.map((r) => [r._id, r.waitingOnMe])).toEqual([[other, []]]);
    expect(await asUser(t, EVA).query(api.eventRequests.review, {})).toEqual([]);
    expect(await asUser(t, LEE).query(api.eventRequests.review, {})).toBeNull();
    expect(await asUser(t, CORA).query(api.eventRequests.waitingOnMe, {})).toBe(1);

    const all = (await asUser(t, ELLA).query(api.eventRequests.all, { year: YEAR }))!;
    expect(all.map((r) => r._id).sort()).toEqual([id, other].sort());
    expect(await asUser(t, ELLA).query(api.eventRequests.all, { year: YEAR - 1 })).toEqual([]);

    // Cancelled events drop out of review.
    await asUser(t, OLLIE).mutation(api.eventRequests.cancel, { id: other });
    expect(await asUser(t, CORA).query(api.eventRequests.review, {})).toEqual([]);
  });

  test("years with events", async () => {
    const t = await setup();
    await create(t);
    await t.run(async (ctx) => {
      const event = (await ctx.db.query("eventRequests").collect())[0];
      await ctx.db.insert("eventRequests", { ...omitSystem(event), year: YEAR - 2, number: 1 });
      await ctx.db.insert("eventRequests", {
        ...omitSystem(event),
        year: YEAR - 1,
        number: 1,
        requesterEmail: OLLIE,
        department: "Events",
      });
    });
    expect(await asUser(t, ELLA).query(api.eventRequests.years, {})).toEqual({
      mine: [YEAR, YEAR - 1, YEAR - 2],
      all: [YEAR, YEAR - 1, YEAR - 2],
    });
    expect(await asUser(t, OLLIE).query(api.eventRequests.years, {})).toEqual({
      mine: [YEAR, YEAR - 1],
      all: [YEAR],
    });
    expect(await asUser(t, LEE).query(api.eventRequests.years, {})).toBeNull();
  });
});

const omitSystem = <D extends { _id: unknown; _creationTime: unknown }>(doc: D) => {
  const { _id, _creationTime, ...rest } = doc;
  void _id;
  void _creationTime;
  return rest;
};

describe("comments", () => {
  test("each form has a thread between the requester's side and its team", async () => {
    const t = await setup();
    const id = await create(t);
    await submitFinance(t, id, budget(9000));
    const add = (email: string, body: string, form: "finance" | "risk" = "finance") =>
      asUser(t, email).mutation(api.eventRequestComments.add, { id, form, body });
    await expect(add(EVA, " ")).rejects.toThrow(/Write a comment/);
    await expect(add(EVA, "x".repeat(2001))).rejects.toThrow(/too long/);
    await expect(add(MARY, "Hi")).rejects.toThrow(
      "Only the requester's department and the Finance team can comment on this form."
    );
    await add(EVA, "Is the venue quote OK?");
    expect(await emailsTo(t, DAN)).toContain("New comment on the Finance form for [TEST] SAF27");
    expect((await notificationsFor(t, FRED)).map((n) => n.title)).toContain("New comment");
    expect(await emailsTo(t, FRED)).toEqual([]);

    await approve(t, id, "finance", DAN);
    await add(FRED, "Looks fine");
    expect((await notificationsFor(t, DAN)).map((n) => n.title)).toContain("New comment");
    expect(await emailsTo(t, EVA)).toContain("New comment on the Finance form for [TEST] SAF27");

    const thread = (await asUser(t, ADMIN).query(api.eventRequestComments.list, { id, form: "finance" }))!;
    expect(thread.map((c) => [c.authorName, c.body, c.isMine])).toEqual([
      [EVA, "Is the venue quote OK?", false],
      [FRED, "Looks fine", false],
    ]);
    expect(await asUser(t, OLLIE).query(api.eventRequestComments.list, { id, form: "finance" })).toBeNull();
    expect(await asUser(t, LEE).query(api.eventRequestComments.list, { id, form: "finance" })).toBeNull();

    expect(await asUser(t, EVA).query(api.eventRequestComments.unreadCounts, { ids: [id] })).toEqual({
      [id]: { finance: 1 },
    });
    await asUser(t, EVA).mutation(api.eventRequestComments.markRead, { id, form: "finance" });
    await asUser(t, EVA).mutation(api.eventRequestComments.markRead, { id, form: "finance" });
    expect(await asUser(t, EVA).query(api.eventRequestComments.unreadCounts, { ids: [id] })).toEqual({});
    expect(await asUser(t, LEE).query(api.eventRequestComments.unreadCounts, { ids: [id] })).toEqual({});
  });

  test("opening the event clears its notifications", async () => {
    const t = await setup();
    const id = await create(t);
    await submitMarketing(t, id);
    expect((await notificationsFor(t, MIKE)).every((n) => !n.read)).toBe(true);
    await asUser(t, MIKE).mutation(api.notifications.markReadForEventRequest, { eventRequestId: id });
    expect((await notificationsFor(t, MIKE)).every((n) => n.read)).toBe(true);
    expect(
      await t.mutation(api.notifications.markReadForEventRequest, { eventRequestId: id })
    ).toBeNull();
  });
});

describe("the forms", () => {
  test("are sent to signed-in staff", async () => {
    const t = await setup();
    const forms = await asUser(t, EVA).query(api.eventRequestForm.fields, {});
    expect(forms!.event.map((f) => f.key)).toContain("registrationGoal");
    expect(forms!.marketing.map((f) => f.key)).toContain("printed_posters");
    expect(await t.query(api.eventRequestForm.fields, {})).toBeNull();
  });
});

describe("importing from the old web app", () => {
  const ms = (days: number) => PINNED_NOW + days * DAY;
  const legacy = (over: Record<string, unknown> = {}) => ({
    year: YEAR - 1,
    id: "abc",
    number: 1,
    userID: "uid-eva",
    userEmail: "Eva@sowaustralia.com",
    userDepartment: "Events",
    name: " SOW Camp ",
    purpose: "Camp",
    goals: "Grow",
    location: "Tops",
    registrationGoal: 110,
    audience: "All",
    eventStartTime: ms(-100),
    eventEndTime: ms(-96),
    submittedTime: ms(-200),
    updatedTime: ms(-150),
    marketing: {
      status: "Approved",
      keyMessage: "Imago Dei",
      theme: "N/A",
      flyers: true,
      flyersSpecifications: "",
      otherPrintedSpecifications: "Use the welcome post",
      promoVideo: true,
      promoVideoSpecifications: "Show last year",
      prizeInventive: true,
      designNeedsApproval: "Yes",
      promoStart: "2025-11-21",
      importantPromotionInformation: "Dates",
    },
    finance: {
      status: "Approved",
      salesRevenues: [{ type: "Rego", unitPrice: 300, quantity: 100, total: 30000, justification: "" }],
      directExpenses: [
        { type: "Venue", unitPrice: 380, quantity: 110, total: 41800, justification: "Tops prices" },
        { type: "", unitPrice: 0, quantity: 0, total: 0, justification: "" },
      ],
      travelOthers: [{ type: "Bus", total: 500 }],
    },
    ...over,
  });

  const importOne = (t: T, event: Record<string, unknown>) =>
    t.mutation(internal.eventRequestImport.importLegacy, { events: [event as never] });

  test("a finished event comes in approved, without a Risk form to fill in", async () => {
    const t = await setup();
    expect(await importOne(t, legacy())).toEqual({ inserted: 1, updated: 0, skipped: 0 });
    const [event] = await t.run((ctx) => ctx.db.query("eventRequests").collect());
    const data = await get(t, event._id, ADMIN);
    expect(data.event).toMatchObject({
      year: YEAR - 1,
      number: 1,
      requesterEmail: EVA,
      department: "Events",
      name: "SOW Camp",
      status: "APPROVED",
      approvedAt: ms(-150),
      legacyKey: `${YEAR - 1}/abc`,
    });
    expect(data.event.answers).toMatchObject({ audience: "all", registrationGoal: 110 });
    expect(data.forms.risk.status).toBe("NOT_REQUIRED");
    expect(data.forms.marketing).toMatchObject({
      status: "APPROVED",
      answers: {
        keyMessage: "Imago Dei",
        visualStyle: "N/A",
        printed: ["flyers", "other"],
        printed_other: "Use the welcome post",
        digital: ["promoVideo"],
        digital_promoVideo: "Show last year",
        promotion: ["prizeIncentive"],
        runByYou: true,
        multipleDrafts: false,
        promoStart: "2025-11-21",
        postInfo: "Dates",
      },
    });
    expect(data.forms.finance.finance).toEqual({
      income: [{ label: "Rego (100 × $300)", amount: 30000 }],
      expenses: [
        { label: "Direct: Venue (110 × $380), Tops prices", amount: 41800 },
        { label: "Travel and other: Bus", amount: 500 },
      ],
    });
    expect(await actions(t, event._id)).toEqual(["imported"]);
  });

  test("an unfinished event: cancelled if it's passed, still in progress if not", async () => {
    const t = await setup();
    await importOne(t, legacy({ id: "past", finance: { status: "Submitted" }, risk: undefined }));
    await importOne(
      t,
      legacy({
        id: "soon",
        number: 2,
        eventStartTime: ms(30),
        eventEndTime: undefined,
        marketing: { status: "Request for change", requestForChangeReason: "More detail", promoStart: ms(5) },
        finance: undefined,
        risk: {
          status: "Approved",
          entries: [
            {
              task: "Buffet",
              hazards: "Crowds",
              riskIdentification: "Pushing",
              proposedControlMeasures: "Queue in groups",
              residualRiskLevel: "High Risk",
            },
          ],
        },
        userEmail: undefined,
        userDepartment: undefined,
        audience: undefined,
        name: undefined,
      })
    );
    const events = await t.run((ctx) => ctx.db.query("eventRequests").collect());
    const past = events.find((e) => e.legacyKey?.endsWith("/past"))!;
    const soon = events.find((e) => e.legacyKey?.endsWith("/soon"))!;
    expect(past).toMatchObject({ status: "CANCELLED", cancelNote: NEVER_FINISHED_NOTE });
    const pastForms = (await get(t, past._id, ADMIN)).forms;
    expect(pastForms.finance).toMatchObject({ status: "PENDING", step: "financeHead" });
    expect(pastForms.risk.status).toBe("NOT_REQUIRED");

    expect(soon).toMatchObject({
      status: "IN_PROGRESS",
      name: "Untitled event",
      department: "Events",
      requesterEmail: "uid-eva@legacy.invalid",
    });
    expect(soon.endsAt).toBe(soon.startsAt);
    const soonForms = (await get(t, soon._id, ADMIN)).forms;
    expect(soonForms.marketing).toMatchObject({
      status: "CHANGES_REQUESTED",
      changesReason: "More detail",
      answers: { promoStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    });
    expect(soonForms.finance).toMatchObject({ status: "DRAFT", finance: { income: [], expenses: [] } });
    expect(soonForms.risk).toMatchObject({
      status: "APPROVED",
      risk: {
        risks: [
          {
            description: "Buffet\nHazards: Crowds\nRisks: Pushing",
            mitigation: "Queue in groups",
            legacyRating: "High Risk",
          },
        ],
      },
    });
  });

  test("re-running updates untouched events and leaves ones acted on", async () => {
    const t = await setup();
    await importOne(t, legacy({ eventStartTime: ms(30), finance: { status: "Submitted" } }));
    expect(await importOne(t, legacy({ name: "Renamed", eventStartTime: ms(30), finance: { status: "Submitted" } }))).toEqual({
      inserted: 0,
      updated: 1,
      skipped: 0,
    });
    const [event] = await t.run((ctx) => ctx.db.query("eventRequests").collect());
    expect(event.name).toBe("Renamed");
    await asUser(t, EVA).mutation(api.eventRequests.cancel, { id: event._id });
    expect(await importOne(t, legacy({ name: "Again" }))).toEqual({ inserted: 0, updated: 0, skipped: 1 });
  });
});
