import { describe, expect, test, vi } from "vitest";
import { SYDNEY_TIME_ZONE, staffYearStartMs } from "../shared/flow";
import { MARKETING_TEAM_EMAIL, type DesignAnswers } from "../shared/designRequests";
import { type FormAnswers } from "../shared/forms";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  type T,
  DAY,
  PINNED_NOW,
  YEAR,
  newConvex,
  asUser,
  pinClock,
  notificationsFor,
  storedReceipt,
} from "../test/convexFixture";
import {
  HENRY,
  MARY,
  RACHEL,
  EDDIE,
  CORA,
  FIONA,
  BELLA,
  DAN,
  at,
  atDay,
  flowSetup,
  designAnswers,
  eventAnswers,
  RISK,
} from "../test/requestFlows";

pinClock();

const SAM = "sam@sow.org.au";

const setup = () => flowSetup([[SAM, [{ role: "Staff", department: "Events" }]]]);

const submitDesign = (t: T, email = RACHEL, over: DesignAnswers = {}) =>
  asUser(t, email).mutation(api.designRequests.submit, { answers: designAnswers(over) });

const createEvent = (t: T, email = RACHEL, over: FormAnswers = {}) =>
  asUser(t, email).mutation(api.eventRequests.create, { answers: eventAnswers(over) });

const submitRisk = (t: T, id: Id<"eventRequests">, email = RACHEL) =>
  asUser(t, email).mutation(api.eventSubForms.saveRisk, { id, risk: RISK, submit: true });

const run = (t: T) => t.mutation(internal.reminders.remindStale, {});

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
    // Only pending jobs: cancelling one convex-test has already started fails it.
    for (const f of await ctx.db.system.query("_scheduled_functions").collect()) {
      if (f.state.kind === "pending") await ctx.scheduler.cancel(f._id);
    }
  });

const designRow = (t: T, id: Id<"designRequests">) =>
  t.run(async (ctx) => (await ctx.db.get("designRequests", id))!);

type RequestId = Id<"requests">;
type Step = "hod" | "budgetManager" | "director" | "financeHead";

const submitRequest = async (t: T, amount = 100) => {
  await asUser(t, MARY).mutation(api.requests.submit, { description: "Snacks", amount });
  return (await asUser(t, MARY).query(api.requests.myRequests, {}))![0]._id as RequestId;
};

const approve = async (t: T, requestId: RequestId, steps: [string, Step][]) => {
  for (const [email, step] of steps) await asUser(t, email).mutation(api.requests.approve, { requestId, step });
};

const APPROVED: [string, Step][] = [
  [HENRY, "hod"],
  [BELLA, "budgetManager"],
  [FIONA, "financeHead"],
];

const submitReceipt = async (t: T, requestId: RequestId) =>
  asUser(t, MARY).mutation(api.requests.submitReceipt, {
    requestId,
    recipients: [
      { accountName: "M", bsb: "062000", accountNumber: "12345678", amount: 100, attachments: [await storedReceipt(t)] },
    ],
  });

const reminderCount = async (t: T, id: RequestId) =>
  (await t.run((ctx) => ctx.db.get("requests", id)))?.reminderCount ?? 0;

const remindedPeople = async (t: T) =>
  (await t.run((ctx) => ctx.db.query("notifications").collect()))
    .filter((n) => n.title === "Waiting on you")
    .map((n) => n.userEmail);

const carriedOver = async (fields: Partial<Doc<"requests">>, lastYearDepartment: Partial<Doc<"departments">>) => {
  vi.setSystemTime(staffYearStartMs(YEAR - 1) + 1);
  const t = newConvex();
  const id = await t.run(async (ctx) => {
    await ctx.db.insert("departments", { year: YEAR - 1, name: "Marketing", division: "Engagement", ...lastYearDepartment });
    return ctx.db.insert("requests", {
      requesterEmail: MARY,
      department: "Marketing",
      description: "carried",
      amount: 100,
      approvedByHOD: "APPROVED",
      approvedByBudgetManager: "PENDING",
      approvedByFinanceHead: "PENDING",
      ...fields,
    });
  });
  vi.setSystemTime(PINNED_NOW);
  await flowSetup([], t);
  return { t, id };
};

describe("reimbursement reminders", () => {
  test("remind after a day, then three, then weekly, and start over when a step moves", async () => {
    const t = await setup();
    const id = await submitRequest(t);
    await run(t);
    expect(await reminderCount(t, id)).toBe(0);

    for (const [day, count] of [
      [1.1, 1],
      [2.1, 1],
      [4.2, 2],
      [10.2, 2],
      [11.3, 3],
      [12.3, 3],
    ]) {
      atDay(day);
      await run(t);
      expect(await reminderCount(t, id)).toBe(count);
    }
    expect(await remindedPeople(t)).toEqual([HENRY, HENRY, HENRY]);

    await approve(t, id, [[HENRY, "hod"]]);
    atDay(13.4);
    await run(t);
    expect(await reminderCount(t, id)).toBe(1);
    expect((await remindedPeople(t)).at(-1)).toBe(BELLA);
  });

  test.each([
    ["the Director, over the threshold", 6000, APPROVED.slice(0, 2), false, DAN],
    ["the Finance Head", 100, APPROVED.slice(0, 2), false, FIONA],
    ["the requester, for a receipt", 100, APPROVED, false, MARY],
    ["the Finance Head, for payment", 100, APPROVED, true, FIONA],
  ] as const)("a request waiting on %s reminds them", async (_, amount, steps, withReceipt, expected) => {
    const t = await flowSetup([[DAN, [{ role: "Director" }]]]);
    const id = await submitRequest(t, amount);
    await approve(t, id, [...steps]);
    if (withReceipt) await submitReceipt(t, id);
    await clearOutbox(t);

    atDay(1.1);
    await run(t);
    expect(await remindedPeople(t)).toEqual([expected]);
  });

  test("a paid request is never reminded", async () => {
    const t = await setup();
    const id = await submitRequest(t);
    await approve(t, id, APPROVED);
    await submitReceipt(t, id);
    await asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 100 });
    await clearOutbox(t);

    atDay(8);
    await run(t);
    expect(await remindedPeople(t)).toEqual([]);
  });

  test("nobody is reminded about payment when the year has no Finance Head", async () => {
    const t = await setup();
    const id = await submitRequest(t);
    await approve(t, id, APPROVED);
    await submitReceipt(t, id);
    await t.run(async (ctx) => {
      const finance = (await ctx.db.query("departments").collect()).find((d) => d.name === "Finance")!;
      await ctx.db.patch("departments", finance._id, { headEmail: undefined });
    });
    await clearOutbox(t);

    atDay(8);
    await run(t);
    expect(await reminderCount(t, id)).toBe(0);
    expect(await remindedPeople(t)).toEqual([]);
  });

  test("a request carried over from last year reminds this year's Budget Manager when last year had none", async () => {
    const { t, id } = await carriedOver({}, { headEmail: HENRY });
    await run(t);
    expect(await reminderCount(t, id)).toBe(1);
    expect(await remindedPeople(t)).toEqual([BELLA]);
  });

  test("a carried-over unpaid receipt reminds this year's Finance Head when last year's is gone", async () => {
    const { t, id } = await carriedOver(
      {
        approvedByBudgetManager: "APPROVED",
        approvedByFinanceHead: "APPROVED",
        receipt: {
          totalAmount: 100,
          recipients: [{ accountName: "M", bsb: "0", accountNumber: "1", amount: 100, attachments: [] }],
        },
        paid: false,
      },
      {}
    );
    await run(t);
    expect(await reminderCount(t, id)).toBe(1);
    expect(await remindedPeople(t)).toEqual([FIONA]);
  });
});

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

describe("unread comment reminders", () => {
  test("a comment still unread a day later reminds the people its thread is for, once", async () => {
    const t = await setup();
    const id = await createEvent(t);
    await submitRisk(t, id);
    await asUser(t, CORA).mutation(api.eventRequestComments.add, {
      id,
      form: "risk",
      body: "What's the wet weather plan?",
    });
    await clearOutbox(t);

    atDay(0.5);
    await run(t);
    expect(await notificationsFor(t, RACHEL)).toEqual([]);

    atDay(1.1);
    await run(t);
    const [note] = await notificationsFor(t, RACHEL);
    expect(note.body).toBe("2 event forms and 1 thread with unread comments are waiting on you.");
    const [email] = await emailsTo(t, RACHEL);
    expect(email.body).toContain("1 unread comment on the Risk form for Winter Camp");
    // Cora wrote it, and Eddie isn't on the thread.
    for (const other of [CORA, EDDIE]) {
      for (const mail of await emailsTo(t, other)) expect(mail.body).not.toContain("unread comment");
    }

    // Reminded once: the next run leaves it alone.
    await clearOutbox(t);
    atDay(2.2);
    await run(t);
    expect(await notificationsFor(t, RACHEL)).toEqual([]);

    // Cora reads Rachel's reply in time, so only the later one reminds her.
    await asUser(t, RACHEL).mutation(api.eventRequestComments.add, { id, form: "risk", body: "Tents" });
    await asUser(t, CORA).mutation(api.eventRequestComments.markRead, { id, form: "risk" });
    atDay(2.3);
    await asUser(t, RACHEL).mutation(api.eventRequestComments.add, { id, form: "risk", body: "And a hall" });
    await clearOutbox(t);
    atDay(3.4);
    await run(t);
    const coraMail = (await emailsTo(t, CORA)).map((m) => m.body).join("\n");
    expect(coraMail).toContain("1 unread comment on the Risk form for Winter Camp");

    // A week on, nothing is looked at again.
    await clearOutbox(t);
    atDay(12);
    await run(t);
    for (const who of [RACHEL, CORA]) {
      for (const mail of await emailsTo(t, who)) expect(mail.body).not.toContain("unread comment");
    }
  });

  test("earlier commenters hear about replies while they can still comment, under either address", async () => {
    const t = await setup();
    const id = await createEvent(t);
    // Bella (Finance) asks a question; Rachel only answers nine days later.
    await asUser(t, BELLA).mutation(api.eventRequestComments.add, { id, form: "finance", body: "Budget?" });
    atDay(9);
    await asUser(t, RACHEL).mutation(api.eventRequestComments.add, { id, form: "finance", body: "$500" });
    await clearOutbox(t);
    atDay(10.1);
    await run(t);
    const bella = (await emailsTo(t, BELLA)).map((m) => m.body).join("\n");
    expect(bella).toContain("1 unread comment on the Finance form for Winter Camp");

    // Once Bella has left Finance she can't comment there, so she isn't reminded.
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", BELLA).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, {
        assignments: [{ role: "Staff", department: "Missions" }],
      });
    });
    atDay(11);
    await asUser(t, RACHEL).mutation(api.eventRequestComments.add, { id, form: "finance", body: "Or $600" });
    await clearOutbox(t);
    atDay(12.2);
    await run(t);
    for (const mail of await emailsTo(t, BELLA)) expect(mail.body).not.toContain("unread comment");
  });

  test("an approver listed under their other address isn't reminded of their own comment", async () => {
    const t = await setup();
    const alias = "cora@sowaustralia.com";
    await t.run(async (ctx) => {
      for (const department of await ctx.db.query("departments").collect()) {
        if (department.name === "Compliance") {
          await ctx.db.patch("departments", department._id, { headEmail: alias });
        }
      }
    });
    const id = await createEvent(t);
    await asUser(t, CORA).mutation(api.eventRequestComments.add, { id, form: "risk", body: "Rain plan?" });
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    for (const who of [CORA, alias]) {
      for (const mail of await emailsTo(t, who)) expect(mail.body).not.toContain("unread comment");
    }
    expect((await emailsTo(t, RACHEL)).map((m) => m.body).join("\n")).toContain(
      "1 unread comment on the Risk form for Winter Camp"
    );
  });

  test("comments an approver read under their login address don't remind their other address", async () => {
    const t = await setup();
    const alias = "cora@sowaustralia.com";
    await t.run(async (ctx) => {
      for (const department of await ctx.db.query("departments").collect()) {
        if (department.name === "Compliance") {
          await ctx.db.patch("departments", department._id, { headEmail: alias });
        }
      }
    });
    const id = await createEvent(t);
    await asUser(t, RACHEL).mutation(api.eventRequestComments.add, { id, form: "risk", body: "Tents?" });
    atDay(0.2);
    await asUser(t, CORA).mutation(api.eventRequestComments.markRead, { id, form: "risk" });
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    for (const who of [CORA, alias]) {
      for (const mail of await emailsTo(t, who)) expect(mail.body).not.toContain("unread comment");
    }
  });

  test("an approver whose Head address is an alias is reminded there", async () => {
    const t = await setup();
    const alias = "cora@sowaustralia.com";
    await t.run(async (ctx) => {
      for (const department of await ctx.db.query("departments").collect()) {
        if (department.name === "Compliance") {
          await ctx.db.patch("departments", department._id, { headEmail: alias });
        }
      }
    });
    const id = await createEvent(t);
    await asUser(t, RACHEL).mutation(api.eventRequestComments.add, { id, form: "risk", body: "Tents?" });
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    expect((await emailsTo(t, alias)).map((m) => m.body).join("\n")).toContain(
      "1 unread comment on the Risk form for Winter Camp"
    );
  });

  test("a requester who has since become a campus leader isn't reminded", async () => {
    const t = await setup();
    const id = await createEvent(t);
    await submitRisk(t, id, SAM);
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", RACHEL).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, {
        assignments: [{ role: "Student Leader", university: "UNSW" }],
      });
    });
    await asUser(t, CORA).mutation(api.eventRequestComments.add, { id, form: "risk", body: "Rain plan?" });
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    for (const mail of await emailsTo(t, RACHEL)) expect(mail.body).not.toContain("unread comment");
    expect((await emailsTo(t, SAM)).map((m) => m.body).join("\n")).toContain(
      "1 unread comment on the Risk form for Winter Camp"
    );
  });

  test("a requester with no staff profile this year, or a submitter who has left the department, isn't reminded", async () => {
    const t = await setup();
    const id = await createEvent(t);
    await submitRisk(t, id, SAM);
    await asUser(t, SAM).mutation(api.eventRequestComments.add, { id, form: "risk", body: "Plan attached" });
    await asUser(t, CORA).mutation(api.eventRequestComments.add, { id, form: "risk", body: "Rain plan?" });
    await t.run(async (ctx) => {
      const profileOf = (email: string) =>
        ctx.db
          .query("staffProfiles")
          .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", YEAR))
          .unique();
      await ctx.db.delete("staffProfiles", (await profileOf(RACHEL))!._id);
      await ctx.db.patch("staffProfiles", (await profileOf(SAM))!._id, {
        assignments: [{ role: "Staff", department: "Finance" }],
      });
    });
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    for (const person of [RACHEL, SAM]) {
      for (const mail of await emailsTo(t, person)) expect(mail.body).not.toContain("unread comment");
      for (const note of await notificationsFor(t, person)) expect(note.body).not.toContain("unread comment");
    }
    expect((await emailsTo(t, CORA)).map((m) => m.body).join("\n")).toContain(
      "1 unread comment on the Risk form for Winter Camp"
    );
  });

  test("design request comments remind the requester and the Marketing Head", async () => {
    const t = await setup();
    const id = await submitDesign(t);
    const gone = await submitDesign(t, MARY);
    await asUser(t, MARY).mutation(api.designRequestComments.add, { id, body: "Which colours?" });
    await asUser(t, HENRY).mutation(api.designRequestComments.add, { id: gone, body: "Hi" });
    await t.run((ctx) => ctx.db.delete("designRequests", gone));
    await clearOutbox(t);
    atDay(1.1);
    await run(t);
    for (const who of [RACHEL, HENRY]) {
      const body = (await emailsTo(t, who)).map((m) => m.body).join("\n");
      expect(body).toContain("1 unread comment on the design request for Poster");
    }
    const maryMail = (await emailsTo(t, MARY)).map((m) => m.body).join("\n");
    expect(maryMail).not.toContain("unread comment");

    await asUser(t, RACHEL).mutation(api.designRequestComments.markRead, { id });
    atDay(1.2);
    await asUser(t, MARY).mutation(api.designRequestComments.add, { id, body: "Blue?" });
    await t.run(async (ctx) => {
      await ctx.db.patch("designRequests", id, { title: "" });
      const event = await ctx.db.insert("eventRequests", {
        year: YEAR,
        number: 9,
        requesterEmail: RACHEL,
        department: "Events",
        submittedAt: Date.now(),
        answers: {},
        name: "Gone",
        startsAt: at(40, 9),
        endsAt: at(40, 17),
        location: "Hall",
        status: "IN_PROGRESS",
      });
      await ctx.db.insert("eventRequestComments", {
        eventRequestId: event,
        form: "risk",
        authorEmail: CORA,
        body: "Hi",
        postedAt: Date.now(),
      });
      await ctx.db.delete("eventRequests", event);
    });
    await clearOutbox(t);
    atDay(2.2);
    await run(t);
    const rachel = (await emailsTo(t, RACHEL)).map((m) => m.body).join("\n");
    expect(rachel).toContain("1 unread comment on a design request");

    // Mary is on the thread, so Rachel's reply reminds her, until she leaves Marketing.
    atDay(2.25);
    await asUser(t, RACHEL).mutation(api.designRequestComments.add, { id, body: "Green" });
    await clearOutbox(t);
    atDay(3.3);
    await run(t);
    expect((await emailsTo(t, MARY)).map((m) => m.body).join("\n")).toContain(
      "1 unread comment on a design request"
    );
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", MARY).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, {
        assignments: [{ role: "Staff", department: "Events" }],
      });
    });
    atDay(3.4);
    await asUser(t, RACHEL).mutation(api.designRequestComments.add, { id, body: "Teal" });
    await clearOutbox(t);
    atDay(4.5);
    await run(t);
    for (const mail of await emailsTo(t, MARY)) expect(mail.body).not.toContain("unread comment");
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
    expect(mail[0].body).toContain("Design request: Poster for Events");
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
