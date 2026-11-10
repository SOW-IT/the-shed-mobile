import { describe, expect, test } from "vitest";
import { sydneyToday, type DesignAnswers } from "../shared/designRequests";
import { sydneyDateTimeAnswer, type FormAnswers } from "../shared/forms";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { mayReviewReimbursements } from "./requests";
import { SONGS_COUNTED } from "../shared/praiseList";
import { type T, DAY, PINNED_NOW, YEAR, ADMIN, asUser, pinClock, seeded } from "../test/convexFixture";

pinClock();

const at = (days: number, hour = 18) =>
  sydneyDateTimeAnswer(PINNED_NOW + days * DAY).slice(0, 11) + `${String(hour).padStart(2, "0")}:00`;

const HENRY = "henry@sow.org.au";
const MARY = "mary@sow.org.au";
const RACHEL = "rachel@sow.org.au";
const EDDIE = "eddie@sow.org.au";
const CORA = "cora@sow.org.au";
const FIONA = "fiona@sow.org.au";
const BELLA = "bella@sow.org.au";
const LEE = "lee@sow.org.au";

const PEOPLE: [string, { role: string; department?: string; university?: string }[]][] = [
  [HENRY, [{ role: "Head of Department", department: "Marketing" }]],
  [MARY, [{ role: "Staff", department: "Marketing" }]],
  [RACHEL, [{ role: "Staff", department: "Events" }]],
  [EDDIE, [{ role: "Head of Department", department: "Events" }]],
  [CORA, [{ role: "Head of Department", department: "Compliance" }]],
  [FIONA, [{ role: "Head of Department", department: "Finance" }]],
  [BELLA, [{ role: "Staff", department: "Finance" }]],
  [LEE, [{ role: "Student Leader", university: "UNSW" }]],
];
const HEADS: Record<string, string> = {
  Marketing: HENRY,
  Events: EDDIE,
  Compliance: CORA,
  Finance: FIONA,
};

async function setup() {
  const t = await seeded();
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

const designAnswers = (): DesignAnswers => ({
  department: "Events",
  types: ["promotion"],
  details: "Hoodies",
  items: ["poster"],
  visualStyle: "Earthy",
  keyMessage: "Come along",
  promoBudget: 100,
  dueDate: sydneyToday(new Date(PINNED_NOW + 14 * DAY)),
  multipleDrafts: false,
  runByYou: true,
});

const eventAnswers = (): FormAnswers => ({
  name: "Winter Camp",
  department: "Events",
  purpose: "Retreat",
  goals: "Rest",
  location: "Camp site",
  registrationGoal: 40,
  audience: "all",
  start: at(40, 9),
  end: at(40, 17),
});

const summaryFor = (t: T, email: string) => asUser(t, email).query(api.waitingOnMe.summary, {});

const nothing = {
  reimbursements: { toReview: 0, toPay: 0, receipts: 0 },
  design: { toApprove: 0, toFinish: 0 },
  events: { toReview: 0, toFill: 0 },
  songs: { toReview: 0 },
};

describe("waitingOnMe.summary", () => {
  test("is null when signed out or for a campus leader, and all zeros with nothing waiting", async () => {
    const t = await setup();
    expect(await t.query(api.waitingOnMe.summary, {})).toBeNull();
    expect(await summaryFor(t, LEE)).toBeNull();
    expect(await summaryFor(t, MARY)).toEqual(nothing);
  });

  test("counts approvals, design requests and event forms waiting on each person", async () => {
    const t = await setup();
    await asUser(t, MARY).mutation(api.requests.submit, { description: "Paint", amount: 40 });
    const designId = await asUser(t, RACHEL).mutation(api.designRequests.submit, {
      answers: designAnswers(),
    });
    const eventId = await asUser(t, RACHEL).mutation(api.eventRequests.create, {
      answers: eventAnswers(),
    });

    expect(await summaryFor(t, HENRY)).toEqual({
      ...nothing,
      reimbursements: { toReview: 1, toPay: 0, receipts: 0 },
      design: { toApprove: 1, toFinish: 0 },
    });
    expect(await summaryFor(t, RACHEL)).toEqual({ ...nothing, events: { toReview: 0, toFill: 3 } });
    expect(await summaryFor(t, EDDIE)).toEqual({ ...nothing, events: { toReview: 0, toFill: 3 } });

    await asUser(t, HENRY).mutation(api.designRequests.approve, { id: designId });
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveRisk, {
      id: eventId,
      risk: {
        noRisks: false,
        risks: [
          { description: "Rain", category: "safety", consequence: 2, likelihood: 3, mitigation: "Tents" },
        ],
      },
      submit: true,
    });
    expect(await summaryFor(t, MARY)).toEqual({ ...nothing, design: { toApprove: 0, toFinish: 1 } });
    expect(await summaryFor(t, HENRY)).toEqual({
      ...nothing,
      reimbursements: { toReview: 1, toPay: 0, receipts: 0 },
      design: { toApprove: 0, toFinish: 1 },
    });
    expect(await summaryFor(t, CORA)).toEqual({ ...nothing, events: { toReview: 1, toFill: 0 } });
    expect(await summaryFor(t, RACHEL)).toEqual({ ...nothing, events: { toReview: 0, toFill: 2 } });
  });

  test("counts receipts owed and payments ready", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "Tents", amount: 90 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    const id = request._id as Id<"requests">;
    await asUser(t, EDDIE).mutation(api.requests.approve, { requestId: id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: id, step: "financeHead" });
    expect(await summaryFor(t, RACHEL)).toEqual({
      ...nothing,
      reimbursements: { toReview: 0, toPay: 0, receipts: 1 },
    });

    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["receipt"], { type: "application/pdf" }))
    );
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        {
          accountName: "R",
          bsb: "062000",
          accountNumber: "12345678",
          amount: 90,
          attachments: [{ storageId, name: "receipt.pdf" }],
        },
      ],
    });
    expect(await summaryFor(t, RACHEL)).toEqual(nothing);
    expect(await summaryFor(t, FIONA)).toEqual({
      ...nothing,
      reimbursements: { toReview: 0, toPay: 1, receipts: 0 },
    });
  });

  test("counts songs to review for Praise Managers, campus leaders included", async () => {
    const t = await setup();
    for (const email of [MARY, LEE]) {
      await asUser(t, ADMIN).mutation(api.admin.addPraiseManager, { year: YEAR, email });
    }
    const song = (title: string) => ({ title, artist: "Hillsong", link: `https://example.com/${title}` });
    await asUser(t, RACHEL).mutation(api.musicRequests.submit, song("one"));
    await asUser(t, RACHEL).mutation(api.musicRequests.submit, song("two"));

    expect(await summaryFor(t, MARY)).toEqual({ ...nothing, songs: { toReview: 2 } });
    expect(await summaryFor(t, LEE)).toEqual({ ...nothing, songs: { toReview: 2 } });
    expect(await summaryFor(t, RACHEL)).toEqual(nothing);

    await asUser(t, ADMIN).mutation(api.admin.removePraiseManager, { year: YEAR, email: LEE });
    expect(await summaryFor(t, LEE)).toBeNull();
  });

  test("stops counting songs one past the cap, so Home can say over 100", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.addPraiseManager, { year: YEAR, email: MARY });
    await t.run(async (ctx) => {
      for (let i = 0; i < SONGS_COUNTED + 5; i++) {
        await ctx.db.insert("musicRequests", {
          requesterEmail: RACHEL,
          title: `Song ${i}`,
          artist: "Hillsong",
          link: `https://example.com/song-${i}`,
          status: "PENDING",
        });
      }
    });
    expect((await summaryFor(t, MARY))?.songs).toEqual({ toReview: SONGS_COUNTED + 1 });
  });
});

describe("mayReviewReimbursements", () => {
  const check = (t: T, email: string) => t.run((ctx) => mayReviewReimbursements(ctx, email, YEAR));
  test("heads, the budget manager, directors, delegates and last year's heads can review; plain staff cannot", async () => {
    const t = await setup();
    expect(await check(t, MARY)).toBe(false);
    expect(await check(t, HENRY)).toBe(true);
    expect(await check(t, BELLA)).toBe(true);
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "dana@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Director" }],
      });
      await ctx.db.insert("approverDelegations", { year: YEAR, fromEmail: EDDIE, toEmail: RACHEL });
      await ctx.db.insert("departments", {
        year: YEAR - 1,
        name: "Archive",
        division: "Old",
        headEmail: "olive@sow.org.au",
      });
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();
      await ctx.db.patch("yearSettings", settings!._id, { directorEmail: "sid@sow.org.au" });
    });
    expect(await check(t, "dana@sow.org.au")).toBe(true);
    expect(await check(t, RACHEL)).toBe(true);
    expect(await check(t, "olive@sow.org.au")).toBe(true);
    expect(await check(t, "sid@sow.org.au")).toBe(true);
    expect(await check(t, MARY)).toBe(false);
  });

  test("a delegate's summary counts what the delegating head has to review", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("approverDelegations", { year: YEAR, fromEmail: EDDIE, toEmail: MARY })
    );
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "Tents", amount: 90 });
    expect(await summaryFor(t, MARY)).toEqual({
      ...nothing,
      reimbursements: { toReview: 1, toPay: 0, receipts: 0 },
    });
  });
});
