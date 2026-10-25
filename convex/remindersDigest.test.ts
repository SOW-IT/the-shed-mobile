/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs, SYDNEY_TIME_ZONE } from "../shared/flow";
import { MARKETING_TEAM_EMAIL, sydneyToday, type DesignAnswers } from "../shared/designRequests";
import { sydneyDateTimeAnswer, type FormAnswers } from "../shared/forms";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
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
const DUE = sydneyToday(new Date(PINNED_NOW + 14 * DAY));
const at = (days: number, hour = 18) =>
  sydneyDateTimeAnswer(PINNED_NOW + days * DAY).slice(0, 11) + `${String(hour).padStart(2, "0")}:00`;

const ADMIN = "admin@sow.org.au";
const HENRY = "henry@sow.org.au";
const MARY = "mary@sow.org.au";
const RACHEL = "rachel@sow.org.au";
const EDDIE = "eddie@sow.org.au";
const CORA = "cora@sow.org.au";
const FIONA = "fiona@sow.org.au";
const BELLA = "bella@sow.org.au";
const SAM = "sam@sow.org.au";

type T = TestConvex<typeof schema>;

const asUser = (t: T, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const PEOPLE: [string, { role: string; department?: string }[]][] = [
  [HENRY, [{ role: "Head of Department", department: "Marketing" }]],
  [MARY, [{ role: "Staff", department: "Marketing" }]],
  [RACHEL, [{ role: "Staff", department: "Events" }]],
  [SAM, [{ role: "Staff", department: "Events" }]],
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
  dueDate: DUE,
  multipleDrafts: false,
  runByYou: true,
  ...over,
});

const submitDesign = (t: T, email = RACHEL, over: DesignAnswers = {}) =>
  asUser(t, email).mutation(api.designRequests.submit, { answers: designAnswers(over) });

const eventAnswers = (over: FormAnswers = {}): FormAnswers => ({
  name: "Winter Camp",
  department: "Events",
  purpose: "Retreat",
  goals: "Rest",
  location: "Camp site",
  registrationGoal: 40,
  audience: "all",
  start: at(40, 9),
  end: at(40, 17),
  ...over,
});

const createEvent = (t: T, email = RACHEL, over: FormAnswers = {}) =>
  asUser(t, email).mutation(api.eventRequests.create, { answers: eventAnswers(over) });

const submitRisk = (t: T, id: Id<"eventRequests">, email = RACHEL) =>
  asUser(t, email).mutation(api.eventSubForms.saveRisk, {
    id,
    risk: {
      noRisks: false,
      risks: [
        { description: "Rain", category: "safety", consequence: 2, likelihood: 3, mitigation: "Tents" },
      ],
    },
    submit: true,
  });

const run = (t: T) => t.mutation(internal.reminders.remindStale, {});

const atDay = (days: number) => vi.setSystemTime(PINNED_NOW + days * DAY);

const notificationsFor = (t: T, email: string) =>
  t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .collect()
  );

const emails = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((f) => f.state.kind !== "canceled")
      .map((f) => f.args[0] as { to: string; subject?: string; body?: string })
      .filter((a) => a.subject !== undefined && a.body !== undefined)
  );
const emailsTo = async (t: T, to: string) => (await emails(t)).filter((e) => e.to === to);

const clearOutbox = (t: T) =>
  t.run(async (ctx) => {
    for (const n of await ctx.db.query("notifications").collect()) {
      await ctx.db.delete("notifications", n._id);
    }
    for (const f of await ctx.db.system.query("_scheduled_functions").collect()) {
      await ctx.scheduler.cancel(f._id);
    }
  });

const designRow = (t: T, id: Id<"designRequests">) =>
  t.run(async (ctx) => (await ctx.db.get("designRequests", id))!);

describe("design request reminders", () => {
  test("a request waiting for approval reminds the Marketing Head after a day, with its due date", async () => {
    const t = await setup();
    const id = await submitDesign(t);
    await clearOutbox(t);

    await run(t);
    expect(await notificationsFor(t, HENRY)).toEqual([]);

    atDay(1.1);
    await run(t);
    const [note] = await notificationsFor(t, HENRY);
    expect(note).toMatchObject({
      title: "Waiting on you",
      body: "1 design request is waiting on you.",
      url: `/design-requests/${id}`,
    });
    const [email] = await emailsTo(t, HENRY);
    expect(email.subject).toBe("Reminder: 1 thing is waiting on you in THE SHED");
    expect(email.body).toContain("waiting on your approval for 1 day, needed by");
    expect(email.body).toContain("in 13 days");
    expect(email.body).toContain("turn these reminder emails off");
    expect(await notificationsFor(t, RACHEL)).toEqual([]);
    expect(await notificationsFor(t, MARY)).toEqual([]);
    expect(await designRow(t, id)).toMatchObject({ reminderCount: 1 });

    atDay(2.2);
    await run(t);
    expect(await designRow(t, id)).toMatchObject({ reminderCount: 1 });
    atDay(4.2);
    await run(t);
    expect(await designRow(t, id)).toMatchObject({ reminderCount: 2 });
  });

  test("an approved request still to finish reminds the Marketing team in-app and the inbox by email", async () => {
    const t = await setup();
    const id = await submitDesign(t);
    await asUser(t, HENRY).mutation(api.designRequests.approve, { id });
    await clearOutbox(t);

    atDay(1.1);
    await run(t);
    for (const member of [MARY, HENRY]) {
      const [note] = await notificationsFor(t, member);
      expect(note.body).toBe("1 design request is waiting on you.");
      expect(await emailsTo(t, member)).toEqual([]);
    }
    const [inbox] = await emailsTo(t, MARKETING_TEAM_EMAIL);
    expect(inbox.subject).toBe("Reminder: 1 approved design request still to finish");
    expect(inbox.body).toContain("approved and still to finish for 1 day");
    expect(await notificationsFor(t, RACHEL)).toEqual([]);

    await asUser(t, MARY).mutation(api.designRequests.complete, { id });
    await clearOutbox(t);
    atDay(9);
    await run(t);
    expect(await notificationsFor(t, MARY)).toEqual([]);
    expect(await emails(t)).toEqual([]);
  });

  test("two pending requests link to the Marketing queue", async () => {
    const t = await setup();
    await submitDesign(t);
    await submitDesign(t, RACHEL, { details: "Banners" });
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    const [note] = await notificationsFor(t, HENRY);
    expect(note.body).toBe("2 design requests are waiting on you.");
    expect(note.url).toBe("/design-requests?tab=queue");
  });
});

describe("event form reminders", () => {
  test("forms not submitted remind the requester's side; one waiting for approval reminds its reviewer", async () => {
    const t = await setup();
    const id = await createEvent(t);
    await submitRisk(t, id);
    await clearOutbox(t);

    atDay(1.1);
    await run(t);
    for (const side of [RACHEL, EDDIE]) {
      const [note] = await notificationsFor(t, side);
      expect(note).toMatchObject({
        body: "2 event forms are waiting on you.",
        url: "/event-requests?tab=mine",
      });
      const [email] = await emailsTo(t, side);
      expect(email.body).toContain("Marketing form for Winter Camp");
      expect(email.body).toContain("not submitted yet for 1 day; the event is in 39 days");
      expect(email.body).toContain("Finance form for Winter Camp");
    }
    const [review] = await notificationsFor(t, CORA);
    expect(review).toMatchObject({
      body: "1 event form is waiting on you.",
      url: `/event-requests/${id}/risk`,
    });
    const [email] = await emailsTo(t, CORA);
    expect(email.body).toContain("Risk form for Winter Camp");
    expect(email.body).toContain("waiting on your approval for 1 day");
    expect(await notificationsFor(t, HENRY)).toEqual([]);

    await asUser(t, CORA).mutation(api.eventSubForms.requestChanges, {
      id,
      form: "risk",
      reason: "Add a wet weather plan",
    });
    await clearOutbox(t);
    atDay(2.2);
    await run(t);
    const [again] = await notificationsFor(t, RACHEL);
    expect(again.body).toBe("1 event form is waiting on you.");
    const [changes] = await emailsTo(t, RACHEL);
    expect(changes.body).toContain("changes were requested, not resubmitted for 1 day");
    expect(await notificationsFor(t, CORA)).toEqual([]);

    await asUser(t, RACHEL).mutation(api.eventRequests.cancel, { id });
    await clearOutbox(t);
    atDay(12);
    await run(t);
    expect(await notificationsFor(t, RACHEL)).toEqual([]);
    expect(await notificationsFor(t, CORA)).toEqual([]);
  });

  test("an event with every form sent on reminds each reviewer once", async () => {
    const t = await setup();
    const id = await createEvent(t);
    await submitRisk(t, id);
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveFinance, {
      id,
      finance: { income: [], expenses: [{ label: "Venue", amount: 300 }] },
      submit: true,
    });
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveMarketing, {
      id,
      answers: {
        keyMessage: "Come",
        visualStyle: "n/a",
        printed: ["posters"],
        printed_posters: "10",
        multipleDrafts: false,
        runByYou: true,
        promoStart: at(10).slice(0, 10),
        postInfo: "Register",
      },
      submit: true,
    });
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    for (const reviewer of [CORA, FIONA, HENRY]) {
      expect((await notificationsFor(t, reviewer)).map((n) => n.body)).toEqual([
        "1 event form is waiting on you.",
      ]);
    }
    expect(await notificationsFor(t, RACHEL)).toEqual([]);
  });

  test("a form sent back for changes chases the person who submitted it as well as the requester", async () => {
    const t = await setup();
    const id = await createEvent(t);
    await submitRisk(t, id, SAM);
    await asUser(t, CORA).mutation(api.eventSubForms.requestChanges, {
      id,
      form: "risk",
      reason: "Add a wet weather plan",
    });
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    const [note] = await notificationsFor(t, SAM);
    expect(note).toMatchObject({
      body: "1 event form is waiting on you.",
      url: `/event-requests/${id}/risk`,
    });
    const [email] = await emailsTo(t, SAM);
    expect(email.body).toContain("Risk form for Winter Camp");
    expect(email.body).toContain("changes were requested, not resubmitted for 1 day");
    for (const side of [RACHEL, EDDIE]) {
      const [theirs] = await emailsTo(t, side);
      expect(theirs.body).toContain("changes were requested, not resubmitted for 1 day");
    }
  });

  test("a reviewer who submitted the form is not asked to approve it, and nobody is reminded once it is approved", async () => {
    const t = await setup();
    const id = await createEvent(t, CORA, { department: "Compliance" });
    await submitRisk(t, id, CORA);
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    const notes = await notificationsFor(t, CORA);
    expect(notes.map((n) => n.body)).toEqual(["2 event forms are waiting on you."]);
  });
});

describe("the daily digest", () => {
  test("one person with several kinds waiting gets one notification and one email, pointing at Home", async () => {
    const t = await setup();
    await asUser(t, MARY).mutation(api.requests.submit, { description: "Paint", amount: 40 });
    await submitDesign(t);
    await clearOutbox(t);

    atDay(1.1);
    await run(t);
    const notes = await notificationsFor(t, HENRY);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      title: "Waiting on you",
      body: "1 reimbursement request and 1 design request are waiting on you.",
      url: "/home",
    });
    const mail = await emailsTo(t, HENRY);
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toBe("Reminder: 2 things are waiting on you in THE SHED");
    expect(mail[0].body).toContain("$40 from mary@sow.org.au (Marketing), Paint: waiting on your HOD approval for 1 day");
    expect(mail[0].body).toContain("Design request #1");
  });

  test("nothing goes out when nothing is waiting, and a weekend run still sends", async () => {
    const t = await setup();
    await run(t);
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toEqual([]);
    expect(await emails(t)).toEqual([]);

    await submitDesign(t);
    await clearOutbox(t);
    let saturday = PINNED_NOW + 1.1 * DAY;
    while (
      new Date(saturday).toLocaleDateString("en-AU", {
        timeZone: SYDNEY_TIME_ZONE,
        weekday: "short",
      }) !== "Sat"
    ) {
      saturday += DAY;
    }
    vi.setSystemTime(saturday);
    await run(t);
    expect(await notificationsFor(t, HENRY)).toHaveLength(1);
  });

  test("one person reached under both staff spellings gets a single digest", async () => {
    const t = await setup();
    const alias = "eddie@sowaustralia.com";
    await t.run(async (ctx) => {
      for (const department of await ctx.db.query("departments").collect()) {
        if (department.name === "Events") {
          await ctx.db.patch("departments", department._id, { headEmail: alias });
        }
      }
    });
    await createEvent(t, EDDIE);
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    const notes = [...(await notificationsFor(t, EDDIE)), ...(await notificationsFor(t, alias))];
    expect(notes.map((n) => n.body)).toEqual(["3 event forms are waiting on you."]);
    const mail = (await emails(t)).filter((e) => e.to === EDDIE || e.to === alias);
    expect(mail).toHaveLength(1);
    expect(mail[0].body).toContain("Risk form for Winter Camp");
  });

  test("reminder emails can be turned off; the notification and push still arrive", async () => {
    const t = await setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: HENRY, name: "Henry" }));
    const henry = t.withIdentity({ email: HENRY, subject: `${userId}|session`, issuer: "test" });
    expect((await henry.query(api.profile.get, {}))!.reminderEmails).toBe(true);
    await henry.mutation(api.profile.setReminderEmails, { enabled: false });
    expect((await henry.query(api.profile.get, {}))!.reminderEmails).toBe(false);
    expect((await asUser(t, MARY).query(api.profile.get, { email: HENRY }))!.reminderEmails).toBeNull();

    await submitDesign(t);
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    expect(await notificationsFor(t, HENRY)).toHaveLength(1);
    expect(await emailsTo(t, HENRY)).toEqual([]);

    await henry.mutation(api.profile.setReminderEmails, { enabled: true });
    const row = await t.run((ctx) => ctx.db.get("users", userId));
    expect(row !== null && "reminderEmails" in row).toBe(false);
  });
});
