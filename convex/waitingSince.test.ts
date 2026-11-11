import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { DAY, PINNED_NOW, YEAR, asUser, pinClock } from "../test/convexFixture";
import {
  HENRY,
  MARY,
  RACHEL,
  CORA,
  FIONA,
  atDay,
  flowSetup,
  designAnswers,
  eventAnswers,
  RISK,
} from "../test/requestFlows";

pinClock();

const design = (details: string) => designAnswers({ details });
const event = (name: string) => eventAnswers({ name });

describe("longest waiting first", () => {
  test("Review lists reimbursement requests by when they reached the approver", async () => {
    const t = await flowSetup();
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
    const t = await flowSetup();
    const early = await asUser(t, RACHEL).mutation(api.designRequests.submit, {
      answers: design("Early"),
    });
    atDay(1);
    await asUser(t, RACHEL).mutation(api.designRequests.submit, {
      answers: design("Late"),
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
    const t = await flowSetup();
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "dan@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Director" }],
      })
    );
    const id = await asUser(t, RACHEL).mutation(api.eventRequests.create, {
      answers: event("Gala"),
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
    const t = await flowSetup();
    const camp = await asUser(t, RACHEL).mutation(api.eventRequests.create, {
      answers: event("Camp"),
    });
    const rally = await asUser(t, RACHEL).mutation(api.eventRequests.create, {
      answers: event("Rally"),
    });
    atDay(1);
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveRisk, { id: rally, risk: RISK, submit: true });
    atDay(2);
    await asUser(t, RACHEL).mutation(api.eventSubForms.saveRisk, { id: camp, risk: RISK, submit: true });
    atDay(3);
    const review = (await asUser(t, CORA).query(api.eventRequests.review, {}))!;
    expect(review.map((r) => r.name)).toEqual(["Rally", "Camp"]);
    expect(review.map((r) => r.waitingOnMe)).toEqual([["risk"], ["risk"]]);
    expect(review[0].waitingSince).toBeLessThan(review[1].waitingSince);
  });
});
