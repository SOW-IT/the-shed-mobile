import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Persona } from "../shared/actingAs";
import { sydneyToday, type DesignAnswers } from "../shared/designRequests";
import type { FinanceData } from "../shared/eventRequests";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { sydneyDateTimeAnswer, type FormAnswers } from "../shared/forms";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { linkUserProfiles } from "./userLink";

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
  sydneyDateTimeAnswer(PINNED_NOW + days * DAY).slice(0, 11) +
  `${String(hour).padStart(2, "0")}:00`;

const ADMIN = "admin@sow.org.au";
const EVA = "eva@sow.org.au";
const EDDIE = "eddie@sow.org.au";
const MIKE = "mike@sow.org.au";
const MARY = "mary@sow.org.au";
const CORA = "cora@sow.org.au";
const CARL = "carl@sow.org.au";
const FIONA = "fiona@sow.org.au";
const FRED = "fred@sow.org.au";
const DAN = "dan@sow.org.au";
const OLLIE = "ollie@sow.org.au";
const LEE = "lee@sow.org.au";

const MARKETING_STAFF: Persona = { role: "staff", department: "Marketing" };
const MARKETING_HEAD: Persona = { role: "head", department: "Marketing" };
const FINANCE_HEAD: Persona = { role: "head", department: "Finance" };

type T = TestConvex<typeof schema>;

const asUser = (t: T, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const PEOPLE: [string, { role: string; department?: string; university?: string }[]][] = [
  [EVA, [{ role: "Staff", department: "Events" }]],
  [EDDIE, [{ role: "Head of Department", department: "Events" }]],
  [MIKE, [{ role: "Head of Department", department: "Marketing" }]],
  [MARY, [{ role: "Staff", department: "Marketing" }]],
  [CORA, [{ role: "Head of Department", department: "Compliance" }]],
  [CARL, [{ role: "Staff", department: "Compliance" }]],
  [FIONA, [{ role: "Head of Department", department: "Finance" }]],
  [FRED, [{ role: "Staff", department: "Finance" }]],
  [DAN, [{ role: "Director" }]],
  [OLLIE, [{ role: "Staff", department: "Missions" }]],
  [LEE, [{ role: "Student Leader", university: "University of New South Wales" }]],
];

const HEADS: Record<string, string> = {
  Events: EDDIE,
  Marketing: MIKE,
  Compliance: CORA,
  Finance: FIONA,
};

const designAnswers = (over: DesignAnswers = {}): DesignAnswers => ({
  department: "Events",
  types: ["promotion"],
  details: "SOW hoodies for the new year",
  items: ["poster"],
  visualStyle: "Earthy greens",
  keyMessage: "Here I am, send me",
  promoBudget: 250,
  dueDate: DUE,
  multipleDrafts: false,
  runByYou: true,
  ...over,
});

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

const marketingAnswers: FormAnswers = {
  keyMessage: "Give generously",
  visualStyle: "n/a",
  printed: ["posters"],
  printed_posters: "20 A3 posters",
  multipleDrafts: false,
  runByYou: true,
  promoStart: at(10).slice(0, 10),
  postInfo: "Register by Friday",
};

const budget = (expenses: number): FinanceData => ({
  income: [],
  expenses: [{ label: "Venue", amount: expenses }],
});

type Request = Omit<Doc<"requests">, "_id" | "_creationTime">;

const request = (over: Partial<Request>): Request => ({
  requesterEmail: EVA,
  department: "Events",
  description: "Snacks",
  amount: 100,
  approvedByHOD: "PENDING",
  approvedByBudgetManager: "PENDING",
  approvedByFinanceHead: "PENDING",
  ...over,
});

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
    await ctx.db.insert("yearSettings", { year: YEAR, budgetManagerEmail: FRED, directorEmail: DAN });
  });

  const pendingDesign = await asUser(t, EVA).mutation(api.designRequests.submit, {
    answers: designAnswers(),
  });
  const approvedDesign = await asUser(t, OLLIE).mutation(api.designRequests.submit, {
    answers: designAnswers({ department: "Missions" }),
  });
  await asUser(t, MIKE).mutation(api.designRequests.approve, { id: approvedDesign });

  const create = (email: string, over: FormAnswers) =>
    asUser(t, email).mutation(api.eventRequests.create, { answers: eventAnswers(over) });
  const marketingEvent = await create(EVA, { name: "Marketing pending" });
  await asUser(t, EVA).mutation(api.eventSubForms.saveMarketing, {
    id: marketingEvent,
    answers: marketingAnswers,
    submit: true,
  });
  const riskEvent = await create(OLLIE, { name: "Risk pending", department: "Missions" });
  await asUser(t, OLLIE).mutation(api.eventSubForms.saveRisk, {
    id: riskEvent,
    risk: {
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
    },
    submit: true,
  });
  const directorEvent = await create(EVA, { name: "Director pending" });
  await asUser(t, EVA).mutation(api.eventSubForms.saveFinance, {
    id: directorEvent,
    finance: budget(6000),
    submit: true,
  });
  const marketingTeamEvent = await create(MARY, { name: "Marketing's own", department: "Marketing" });
  const adminEvent = await create(ADMIN, { name: "Admin's own", department: "Data and IT" });

  const requests = await t.run(async (ctx) => {
    const insert = (over: Partial<Request>) => ctx.db.insert("requests", request(over));
    return {
      hod: await insert({}),
      marketingHod: await insert({ requesterEmail: MARY, department: "Marketing", amount: 70 }),
      budget: await insert({ amount: 200, approvedByHOD: "APPROVED" }),
      director: await insert({
        amount: 6000,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
        approvedByDirector: "PENDING",
      }),
      financeHead: await insert({
        amount: 300,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
      }),
      pay: await insert({
        amount: 50,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
        approvedByFinanceHead: "APPROVED",
        receipt: {
          totalAmount: 50,
          recipients: [{ accountName: "Eva", bsb: "000000", accountNumber: "12345678", amount: 50 }],
        },
        paid: false,
      }),
    };
  });

  return {
    t,
    design: { pending: pendingDesign, approved: approvedDesign },
    events: {
      marketing: marketingEvent,
      risk: riskEvent,
      director: directorEvent,
      marketingTeam: marketingTeamEvent,
      admin: adminEvent,
    },
    requests,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const actAs = (t: T, persona: Persona | null, email = ADMIN) =>
  asUser(t, email).mutation(api.actingAs.set, { persona });

const me = async (t: T, email = ADMIN) => (await asUser(t, email).query(api.directory.me, {}))!;

const reviewIds = async (t: T, email = ADMIN) =>
  ((await asUser(t, email).query(api.eventRequests.review, {})) ?? []).map((r) => r._id).sort();

const reimbursementQueues = async (t: T, email = ADMIN) => {
  const queues = (await asUser(t, email).query(api.requests.toReview, {}))!;
  const ids = (rows: { _id: Id<"requests"> }[]) => rows.map((r) => r._id).sort();
  return {
    hod: ids(queues.hod),
    budgetManager: ids(queues.budgetManager),
    director: ids(queues.director),
    financeHead: ids(queues.financeHead),
    readyToPay: ids(queues.readyToPay),
    rows: [
      ...queues.hod,
      ...queues.budgetManager,
      ...queues.director,
      ...queues.financeHead,
      ...queues.readyToPay,
    ],
  };
};

const sorted = (...ids: string[]) => [...ids].sort();

// Makes the admin the Data and IT Head, with a Data and IT request waiting on them.
const adminHeadsDataAndIT = (t: T) =>
  t.run(async (ctx) => {
    const department = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", YEAR).eq("name", "Data and IT"))
      .unique();
    await ctx.db.patch("departments", department!._id, { headEmail: ADMIN });
    return await ctx.db.insert("requests", request({ requesterEmail: OLLIE, department: "Data and IT" }));
  });

describe("choosing who to act as", () => {
  test("only admins get the choice, and it starts on All views", async () => {
    const { t } = await setup();
    expect((await me(t)).actingAs).toEqual({ persona: null, label: null });
    expect((await me(t, MARY)).actingAs).toBeNull();
    const options = (await asUser(t, ADMIN).query(api.actingAs.options, {}))!;
    expect(options.year).toBe(YEAR);
    expect(options.current).toBeNull();
    expect(options.departments.map((d) => d.name)).toEqual(
      expect.arrayContaining(["Marketing", "Compliance", "Finance", "Events"])
    );
    expect(options.departments.find((d) => d.name === "Marketing")?.division).toBe("Engagement");
    expect(await asUser(t, MARY).query(api.actingAs.options, {})).toBeNull();
    expect(await t.query(api.actingAs.options, {})).toBeNull();
  });

  test("an admin picks a role, changes it, and goes back to All views", async () => {
    const { t } = await setup();
    await actAs(t, MARKETING_STAFF);
    expect((await me(t)).actingAs).toEqual({ persona: MARKETING_STAFF, label: "Marketing staff" });
    expect((await asUser(t, ADMIN).query(api.actingAs.options, {}))!.current).toEqual(
      MARKETING_STAFF
    );
    await actAs(t, { role: "director" });
    expect((await me(t)).actingAs).toEqual({ persona: { role: "director" }, label: "Director" });
    await actAs(t, { role: "budgetManager" });
    expect((await me(t)).actingAs?.label).toBe("Budget Manager");
    await actAs(t, FINANCE_HEAD);
    expect((await me(t)).actingAs?.label).toBe("Finance Head");
    await actAs(t, null);
    expect((await me(t)).actingAs).toEqual({ persona: null, label: null });
    await actAs(t, null);
    expect(await t.run((ctx) => ctx.db.query("actingAs").collect())).toEqual([]);
  });

  test("the department has to exist this year", async () => {
    const { t } = await setup();
    await expect(actAs(t, { role: "staff", department: "Nowhere" })).rejects.toThrow(
      `There's no Nowhere department in ${YEAR}.`
    );
    await actAs(t, MARKETING_STAFF);
    await t.run(async (ctx) => {
      const marketing = await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) => q.eq("year", YEAR).eq("name", "Marketing"))
        .unique();
      await ctx.db.delete("departments", marketing!._id);
    });
    expect((await me(t)).actingAs).toEqual({ persona: null, label: null });
    expect((await asUser(t, ADMIN).query(api.actingAs.options, {}))!.current).toBeNull();
  });

  test("non-admins can't set it, and a stored choice does nothing for them", async () => {
    const { t, design } = await setup();
    await expect(actAs(t, MARKETING_STAFF, OLLIE)).rejects.toThrow(/Only admins/);
    await expect(actAs(t, null, OLLIE)).rejects.toThrow(/Only admins/);
    await t.run((ctx) => ctx.db.insert("actingAs", { email: OLLIE, persona: MARKETING_STAFF }));
    expect((await me(t, OLLIE)).actingAs).toBeNull();
    expect((await me(t, OLLIE)).isFinance).toBe(false);
    expect(await asUser(t, OLLIE).query(api.designRequests.queue, {})).toBeNull();
    expect(await asUser(t, OLLIE).query(api.designRequests.get, { id: design.pending })).toBeNull();
    expect(await reviewIds(t, OLLIE)).toEqual([]);
    expect(await asUser(t, OLLIE).query(api.eventRequests.viewer, {})).toMatchObject({
      reviews: false,
    });
  });

  test("the choice follows a renamed account", async () => {
    const { t } = await setup();
    await actAs(t, MARKETING_STAFF);
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: ADMIN }));
    await t.run((ctx) => linkUserProfiles(ctx, userId));
    await t.run((ctx) => ctx.db.patch("users", userId, { email: "admin.new@sow.org.au" }));
    await t.run((ctx) => linkUserProfiles(ctx, userId));
    expect(await t.run((ctx) => ctx.db.query("actingAs").collect())).toMatchObject([
      { email: "admin.new@sow.org.au", persona: MARKETING_STAFF },
    ]);
    expect((await me(t, "admin.new@sow.org.au")).actingAs?.label).toBe("Marketing staff");

    await t.run((ctx) =>
      ctx.db.insert("actingAs", { email: "admin.newer@sow.org.au", persona: { role: "director" } })
    );
    await t.run((ctx) => ctx.db.patch("users", userId, { email: "admin.newer@sow.org.au" }));
    await t.run((ctx) => linkUserProfiles(ctx, userId));
    expect(await t.run((ctx) => ctx.db.query("actingAs").collect())).toMatchObject([
      { email: "admin.newer@sow.org.au", persona: { role: "director" } },
    ]);
  });

  test("an admin who is also a campus leader still gets the staff views", async () => {
    const { t } = await setup();
    expect((await me(t)).canRequestEvents).toBe(true);
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", ADMIN).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, {
        assignments: [
          { role: "Staff", department: "Data and IT" },
          { role: "Student Leader", university: "University of New South Wales" },
        ],
      });
    });
    expect(await me(t)).toMatchObject({ isCampusLeader: false, canRequestEvents: false });
    await expect(
      asUser(t, ADMIN).mutation(api.eventRequests.create, {
        answers: eventAnswers({ department: "Data and IT" }),
      })
    ).rejects.toThrow(/not campus leaders/);
    expect(await asUser(t, ADMIN).query(api.eventRequests.viewer, {})).not.toBeNull();
    expect(await asUser(t, ADMIN).query(api.waitingOnMe.summary, {})).not.toBeNull();
    await actAs(t, MARKETING_STAFF);
    expect(await me(t)).toMatchObject({ isCampusLeader: false, canRequestEvents: false });
    expect(await asUser(t, ADMIN).query(api.eventRequests.viewer, {})).toMatchObject({
      reviews: true,
    });
    expect(await me(t, LEE)).toMatchObject({ isCampusLeader: true, canRequestEvents: false });
    expect(await asUser(t, LEE).query(api.eventRequests.viewer, {})).toBeNull();
    expect(await asUser(t, LEE).query(api.waitingOnMe.summary, {})).toBeNull();
  });

  test("an admin who is also a campus leader gets their own event read-only", async () => {
    const { t, events } = await setup();
    const canOf = async () => {
      const page = (await asUser(t, ADMIN).query(api.eventRequests.get, { id: events.admin }))!;
      return { event: page.can, forms: Object.values(page.forms).map((form) => form.can) };
    };
    expect((await canOf()).event).toEqual({ edit: true, cancel: true });
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", ADMIN).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, {
        assignments: [
          { role: "Staff", department: "Data and IT" },
          { role: "Student Leader", university: "University of New South Wales" },
        ],
      });
    });
    for (const persona of [null, MARKETING_STAFF]) {
      await actAs(t, persona);
      const can = await canOf();
      expect(can.event).toEqual({ edit: false, cancel: false });
      expect(can.forms).toEqual(
        Array(3).fill({ fill: false, decide: false, reopen: false, comment: false })
      );
    }
    await expect(
      asUser(t, ADMIN).mutation(api.eventRequests.cancel, { id: events.admin })
    ).rejects.toThrow(/not campus leaders/);
  });

  test("deleting an account forgets the choice", async () => {
    const { t } = await setup();
    await actAs(t, MARKETING_STAFF);
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: ADMIN }));
    await t.mutation(internal.account.wipe, { userId });
    expect(await t.run((ctx) => ctx.db.query("actingAs").collect())).toEqual([]);
  });
});

describe("admins see every view by default", () => {
  test("nav flags open every tab", async () => {
    const { t } = await setup();
    expect(await me(t)).toMatchObject({
      isAdmin: true,
      isFinance: true,
      isApprover: true,
      isFinanceHead: false,
      isBudgetManager: false,
      isDirector: false,
      headedDepartments: [],
    });
    const org = (await asUser(t, ADMIN).query(api.directory.orgChart, { year: YEAR + 1 }))!;
    expect(org.nextYear).toBe(YEAR + 1);
    expect(await asUser(t, ADMIN).query(api.directory.availableYears, {})).toContain(YEAR + 1);
  });

  test("every design request, read-only", async () => {
    const { t, design } = await setup();
    const admin = asUser(t, ADMIN);
    expect(await admin.query(api.designRequests.viewer, {})).toMatchObject({
      isMarketingHead: false,
      isMarketingStaff: false,
      canSeeQueue: true,
    });
    expect((await admin.query(api.designRequests.queue, {}))!.map((r) => r._id).sort()).toEqual(
      sorted(design.pending, design.approved)
    );
    expect(await admin.query(api.designRequests.archive, { year: YEAR })).toHaveLength(2);
    expect(
      await admin.query(api.designRequests.earlierArchive, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).toMatchObject({ page: [] });
    expect((await admin.query(api.designRequests.get, { id: design.pending }))!.can).toEqual({
      approve: false,
      complete: false,
      edit: false,
      cancel: false,
      comment: false,
    });
    expect(await admin.query(api.designRequests.timeline, { id: design.pending })).not.toBeNull();
    expect(await admin.query(api.designRequestComments.list, { id: design.pending })).toEqual([]);
    expect(await admin.query(api.designRequests.waitingOnMe, {})).toBe(0);
  });

  test("every team's event forms waiting for review, none of them on the admin", async () => {
    const { t, events } = await setup();
    const admin = asUser(t, ADMIN);
    expect(await admin.query(api.eventRequests.viewer, {})).toMatchObject({
      reviews: true,
      seesAll: true,
      departments: ["Data and IT"],
    });
    expect((await admin.query(api.eventRequests.all, { year: YEAR }))!).toHaveLength(5);
    const review = (await admin.query(api.eventRequests.review, {}))!;
    expect(review.map((r) => r._id).sort()).toEqual(
      sorted(events.marketing, events.risk, events.director)
    );
    expect(review.every((r) => r.waitingOnMe.length === 0)).toBe(true);
    expect(await admin.query(api.eventRequests.waitingOnMe, {})).toBe(0);
    expect((await admin.query(api.eventRequests.mine, {}))!.map((r) => r._id)).toEqual([
      events.admin,
    ]);
  });

  test("every reimbursement queue and the Finance views, with only their own work to action", async () => {
    const { t, requests } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("requests", request({ requesterEmail: ADMIN, department: "Data and IT" }))
    );
    const admin = asUser(t, ADMIN);
    const queues = await reimbursementQueues(t);
    expect(queues).toMatchObject({
      hod: sorted(requests.hod, requests.marketingHod),
      budgetManager: [requests.budget],
      director: [requests.director],
      financeHead: [requests.financeHead],
      readyToPay: [requests.pay],
    });
    expect(queues.rows.every((r) => !r.canAct && !r.waiting)).toBe(true);
    expect(await admin.query(api.requests.allRequests, {})).toHaveLength(7);
    expect(await admin.query(api.requests.requestsForExport, { years: [YEAR] })).toHaveLength(7);
    expect(
      await admin.query(api.requests.earlierAll, { paginationOpts: { numItems: 10, cursor: null } })
    ).toMatchObject({ page: [] });
    const paid = (await admin.query(api.requests.get, { requestId: requests.pay }))!;
    expect(paid.receipt?.recipients).toHaveLength(1);
    expect(await admin.query(api.requests.receiptAttachments, { requestId: requests.pay })).toEqual([
      { accountName: "Eva", attachments: [] },
    ]);
    expect(await admin.query(api.requests.auditTrail, { requestId: requests.hod })).toEqual([]);
    expect(await admin.query(api.requests.stepInfo, { requestId: requests.hod, step: "hod" })).not.toBeNull();
    expect(await admin.query(api.requests.stepActors, { requestId: requests.hod })).not.toBeNull();
    expect(await admin.query(api.comments.list, { requestId: requests.hod })).toEqual([]);
    expect(await admin.query(api.waitingOnMe.summary, {})).toEqual({
      reimbursements: { toReview: 0, toPay: 0, receipts: 0 },
      design: { toApprove: 0, toFinish: 0 },
      events: { toReview: 0, toFill: 3 },
    });
  });

  test("an admin's own approval stays in Reviewed after the request moves on", async () => {
    const { t } = await setup();
    const id = await adminHeadsDataAndIT(t);
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.requests.approve, { requestId: id, step: "hod" });
    expect((await reimbursementQueues(t)).budgetManager).toContain(id);
    expect((await admin.query(api.requests.reviewed, {}))!.map((r) => r._id)).toEqual([id]);
  });

  test("the real approver still has the buttons and the badge", async () => {
    const { t, requests } = await setup();
    const fiona = await reimbursementQueues(t, FIONA);
    expect(fiona.financeHead).toEqual([requests.financeHead]);
    expect(fiona.readyToPay).toEqual([requests.pay]);
    expect(fiona.rows.every((r) => r.canAct && r.waiting)).toBe(true);
    expect(await asUser(t, FIONA).query(api.waitingOnMe.summary, {})).toMatchObject({
      reimbursements: { toReview: 1, toPay: 1 },
    });
  });

  test("unread comments only count threads the admin is really in", async () => {
    const { t, design, requests } = await setup();
    await asUser(t, MARY).mutation(api.designRequestComments.add, {
      id: design.pending,
      body: "On it",
    });
    await asUser(t, EDDIE).mutation(api.comments.add, { requestId: requests.hod, body: "Why?" });
    const admin = asUser(t, ADMIN);
    expect(await admin.query(api.designRequestComments.unreadCounts, { ids: [design.pending] })).toEqual({});
    expect(
      await asUser(t, EVA).query(api.designRequestComments.unreadCounts, { ids: [design.pending] })
    ).toEqual({ [design.pending]: 1 });
    expect(await admin.query(api.designRequestComments.list, { id: design.pending })).toHaveLength(1);
    expect(await admin.query(api.comments.unreadTotalForRequests, { requestIds: [requests.hod] })).toBe(0);
    expect(
      await admin.query(api.comments.unreadCountsForRequests, { requestIds: [requests.hod] })
    ).toEqual({});
    expect(await admin.query(api.comments.unreadCount, { requestId: requests.hod })).toBe(0);
    expect(await admin.query(api.comments.list, { requestId: requests.hod })).toHaveLength(1);
    expect(await admin.query(api.comments.canComment, { requestId: requests.hod })).toBe(false);
    expect(await asUser(t, EVA).query(api.comments.canComment, { requestId: requests.hod })).toBe(
      true
    );
    expect(await t.query(api.comments.canComment, { requestId: requests.hod })).toBe(false);
    expect(
      await asUser(t, EVA).query(api.comments.unreadCountsForRequests, { requestIds: [requests.hod] })
    ).toEqual({ [requests.hod]: 1 });
    expect(await asUser(t, EVA).query(api.comments.unreadCount, { requestId: requests.hod })).toBe(1);

    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", ADMIN).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, {
        assignments: [
          { role: "Staff", department: "Data and IT" },
          { role: "Staff", department: "Finance" },
        ],
      });
    });
    expect(await admin.query(api.comments.unreadTotalForRequests, { requestIds: [requests.hod] })).toBe(1);
    await t.run((ctx) => ctx.db.delete("designRequests", design.pending));
    expect(await admin.query(api.designRequestComments.unreadCounts, { ids: [design.pending] })).toEqual({});
    await t.run((ctx) => ctx.db.delete("requests", requests.hod));
    expect(await admin.query(api.comments.unreadTotalForRequests, { requestIds: [requests.hod] })).toBe(0);
    expect(await asUser(t, EVA).query(api.comments.canComment, { requestId: requests.hod })).toBe(
      false
    );
  });
});

describe("acting as Marketing staff", () => {
  const actingAsMarketing = async (): Promise<Setup> => {
    const setupResult = await setup();
    await actAs(setupResult.t, MARKETING_STAFF);
    return setupResult;
  };

  test("shows exactly what a Marketing staff member sees", async () => {
    const { t, design, events } = await actingAsMarketing();
    const admin = asUser(t, ADMIN);
    const mary = asUser(t, MARY);
    expect(await me(t)).toMatchObject({
      isAdmin: false,
      isFinance: false,
      isApprover: false,
      isFinanceHead: false,
      isBudgetManager: false,
      isDirector: false,
      headedDepartments: [],
    });
    expect(await admin.query(api.designRequests.viewer, {})).toMatchObject({
      isMarketingHead: false,
      isMarketingStaff: true,
      canSeeQueue: true,
    });
    expect((await admin.query(api.designRequests.queue, {}))!.map((r) => r._id).sort()).toEqual(
      (await mary.query(api.designRequests.queue, {}))!.map((r) => r._id).sort()
    );
    expect(await admin.query(api.designRequests.waitingOnMe, {})).toBe(
      await mary.query(api.designRequests.waitingOnMe, {})
    );
    expect(await admin.query(api.designRequests.waitingOnMe, {})).toBe(1);
    expect((await admin.query(api.designRequests.get, { id: design.approved }))!.can.complete).toBe(
      false
    );

    expect(await reviewIds(t)).toEqual([events.marketing]);
    expect(await reviewIds(t)).toEqual(await reviewIds(t, MARY));
    expect(await admin.query(api.eventRequests.waitingOnMe, {})).toBe(0);
    expect((await admin.query(api.eventRequests.mine, {}))!.map((r) => r._id).sort()).toEqual(
      sorted(events.marketingTeam, events.admin)
    );
    expect(
      await admin.query(api.eventRequests.earlierMine, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).toMatchObject({ page: [] });
    const form = (await admin.query(api.eventRequests.get, { id: events.marketing }))!.forms
      .marketing;
    expect(form.status).toBe("PENDING");
    expect(form.can).toEqual({ fill: false, decide: false, reopen: false, comment: false });
  });

  test("hides the Finance and admin views", async () => {
    const { t, requests } = await actingAsMarketing();
    const admin = asUser(t, ADMIN);
    const queues = await reimbursementQueues(t);
    expect(queues.rows).toEqual([]);
    await expect(admin.query(api.requests.allRequests, {})).rejects.toThrow(/Only Finance staff/);
    await expect(admin.query(api.requests.requestsForExport, { years: [YEAR] })).rejects.toThrow(
      /Only Finance staff/
    );
    expect(
      await admin.query(api.requests.earlierAll, { paginationOpts: { numItems: 10, cursor: null } })
    ).toBeNull();
    expect(await admin.query(api.requests.get, { requestId: requests.hod })).toBeNull();
    expect(await admin.query(api.requests.get, { requestId: requests.marketingHod })).toBeNull();
    expect(await admin.query(api.requests.receiptAttachments, { requestId: requests.pay })).toBeNull();
    expect(await admin.query(api.comments.list, { requestId: requests.hod })).toBeNull();
    expect(await admin.query(api.comments.unreadCount, { requestId: requests.hod })).toBeNull();
    const org = (await admin.query(api.directory.orgChart, { year: YEAR + 1 }))!;
    expect(org.nextYear).toBeNull();
    expect(org.year).toBe(YEAR);
    expect(await admin.query(api.directory.availableYears, {})).not.toContain(YEAR + 1);
    expect(await admin.query(api.waitingOnMe.summary, {})).toEqual({
      reimbursements: { toReview: 0, toPay: 0, receipts: 0 },
      design: { toApprove: 0, toFinish: 1 },
      events: { toReview: 0, toFill: 6 },
    });
  });

  test("grants no actions", async () => {
    const { t, design, events, requests } = await actingAsMarketing();
    const admin = asUser(t, ADMIN);
    await expect(
      admin.mutation(api.designRequests.complete, { id: design.approved })
    ).rejects.toThrow(/Only the Marketing team/);
    await expect(
      admin.mutation(api.designRequestComments.add, { id: design.pending, body: "Hi" })
    ).rejects.toThrow(/Only the requester and the design team/);
    await expect(
      admin.mutation(api.eventSubForms.saveMarketing, {
        id: events.marketingTeam,
        answers: marketingAnswers,
        submit: true,
      })
    ).rejects.toThrow();
    await expect(
      admin.mutation(api.eventRequestComments.add, {
        id: events.marketing,
        form: "marketing",
        body: "Hi",
      })
    ).rejects.toThrow(/can comment on this form/);
    await expect(
      admin.mutation(api.comments.add, { requestId: requests.marketingHod, body: "Hi" })
    ).rejects.toThrow(/Request not found/);
  });

  test("still lets the admin approve what they really approve", async () => {
    const { t } = await actingAsMarketing();
    const id = await adminHeadsDataAndIT(t);
    await asUser(t, ADMIN).mutation(api.requests.approve, { requestId: id, step: "hod" });
    expect(await t.run((ctx) => ctx.db.get("requests", id))).toMatchObject({
      approvedByHOD: "APPROVED",
      approvedByBudgetManager: "PENDING",
    });
  });
});

describe("acting as other roles", () => {
  test("Marketing Head: the approvals and the badge, but no approving", async () => {
    const { t, design, events } = await setup();
    await actAs(t, MARKETING_HEAD);
    const admin = asUser(t, ADMIN);
    expect(await admin.query(api.designRequests.viewer, {})).toMatchObject({
      isMarketingHead: true,
      isMarketingStaff: true,
    });
    expect(await admin.query(api.designRequests.waitingOnMe, {})).toBe(
      await asUser(t, MIKE).query(api.designRequests.waitingOnMe, {})
    );
    const review = (await admin.query(api.eventRequests.review, {}))!;
    expect(review.map((r) => [r._id, r.waitingOnMe])).toEqual([[events.marketing, ["marketing"]]]);
    expect(await admin.query(api.eventRequests.waitingOnMe, {})).toBe(1);
    expect((await me(t)).isApprover).toBe(true);
    expect((await me(t)).headedDepartments).toEqual(["Marketing"]);
    await expect(
      admin.mutation(api.designRequests.approve, { id: design.pending })
    ).rejects.toThrow(/Only the Marketing Head/);
    await expect(
      admin.mutation(api.eventSubForms.approve, { id: events.marketing, form: "marketing" })
    ).rejects.toThrow(/Only the Marketing Head/);
  });

  test("Finance Head: the Finance Head's queues to look at, not to action", async () => {
    const { t, requests } = await setup();
    await actAs(t, FINANCE_HEAD);
    const queues = await reimbursementQueues(t);
    expect(queues).toMatchObject({
      hod: [],
      budgetManager: [],
      director: [],
      financeHead: [requests.financeHead],
      readyToPay: [requests.pay],
    });
    expect(queues.rows.every((r) => !r.canAct && r.waiting)).toBe(true);
    expect(await me(t)).toMatchObject({
      isAdmin: false,
      isFinance: true,
      isFinanceHead: true,
      isApprover: true,
    });
    const summary = (email: string) => asUser(t, email).query(api.waitingOnMe.summary, {});
    expect((await summary(ADMIN))!.reimbursements).toEqual((await summary(FIONA))!.reimbursements);
    expect((await summary(ADMIN))!.reimbursements).toMatchObject({ toReview: 1, toPay: 1 });
    await expect(
      asUser(t, ADMIN).mutation(api.requests.approve, {
        requestId: requests.financeHead,
        step: "financeHead",
      })
    ).rejects.toThrow(/not the approver/);
    await expect(
      asUser(t, ADMIN).mutation(api.requests.pay, { requestId: requests.pay, paidAmount: 50 })
    ).rejects.toThrow();
  });

  test("Director and Budget Manager", async () => {
    const { t, events, requests } = await setup();
    await actAs(t, { role: "director" });
    expect((await reimbursementQueues(t)).director).toEqual([requests.director]);
    expect(await reviewIds(t)).toEqual([events.director]);
    expect(await asUser(t, ADMIN).query(api.eventRequests.waitingOnMe, {})).toBe(1);
    expect(await me(t)).toMatchObject({ isAdmin: true, isDirector: true, isFinance: false });
    expect(await asUser(t, ADMIN).query(api.requests.get, { requestId: requests.director })).not.toBeNull();
    expect(await asUser(t, ADMIN).query(api.requests.get, { requestId: requests.hod })).toBeNull();

    await actAs(t, { role: "budgetManager" });
    expect((await reimbursementQueues(t)).budgetManager).toEqual([requests.budget]);
    expect(await reviewIds(t)).toEqual([events.director]);
    expect(await asUser(t, ADMIN).query(api.eventRequests.waitingOnMe, {})).toBe(0);
    expect(await me(t)).toMatchObject({ isAdmin: false, isBudgetManager: true, isFinance: true });
  });

  test("Compliance staff see Risk forms; a department's Head sees its approvals and events", async () => {
    const { t, events, requests } = await setup();
    await actAs(t, { role: "staff", department: "Compliance" });
    expect(await reviewIds(t)).toEqual([events.risk]);
    expect(await reviewIds(t)).toEqual(await reviewIds(t, CARL));

    await actAs(t, { role: "head", department: "Events" });
    expect((await reimbursementQueues(t)).hod).toEqual([requests.hod]);
    expect(await asUser(t, ADMIN).query(api.eventRequests.viewer, {})).toMatchObject({
      reviews: false,
    });
    expect(await reviewIds(t)).toEqual([]);
    expect((await asUser(t, ADMIN).query(api.eventRequests.mine, {}))!.map((r) => r._id).sort()).toEqual(
      sorted(events.marketing, events.director, events.admin)
    );
    await expect(
      asUser(t, ADMIN).mutation(api.requests.approve, { requestId: requests.hod, step: "hod" })
    ).rejects.toThrow(/not the approver/);
  });

  test("All event requests follow the role: ordinary staff see only their department's", async () => {
    const { t, events } = await setup();
    const admin = asUser(t, ADMIN);
    const viewer = () => admin.query(api.eventRequests.viewer, {});
    const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

    await actAs(t, { role: "staff", department: "Missions" });
    expect(await viewer()).toMatchObject({ reviews: false, seesAll: false });
    expect(await admin.query(api.eventRequests.all, { year: YEAR })).toBeNull();
    expect(await admin.query(api.eventRequests.earlierAll, firstPage)).toBeNull();
    expect((await admin.query(api.eventRequests.mine, {}))!.map((r) => r._id).sort()).toEqual(
      sorted(events.risk, events.admin)
    );
    expect(await asUser(t, OLLIE).query(api.eventRequests.viewer, {})).toMatchObject({
      seesAll: false,
    });
    expect((await admin.query(api.eventRequests.get, { id: events.marketing }))!.can).toEqual({
      edit: false,
      cancel: false,
    });

    for (const persona of [
      { role: "staff", department: "Events" },
      { role: "staff", department: "Marketing" },
      { role: "head", department: "Compliance" },
      { role: "director" },
      { role: "staff", department: "Data and IT" },
    ] as Persona[]) {
      await actAs(t, persona);
      expect(await viewer()).toMatchObject({ seesAll: true });
      expect(await admin.query(api.eventRequests.all, { year: YEAR })).toHaveLength(5);
    }
    expect(await admin.query(api.eventRequests.earlierAll, firstPage)).toMatchObject({ page: [] });
  });

  test("only acting as Data and IT or the Director keeps the admin views", async () => {
    const { t } = await setup();
    await actAs(t, { role: "staff", department: "Data and IT" });
    expect((await me(t)).isAdmin).toBe(true);
    await actAs(t, { role: "staff", department: "People and Culture" });
    expect((await me(t)).isAdmin).toBe(false);
    await actAs(t, { role: "staff", department: "Events" });
    expect((await me(t)).isAdmin).toBe(false);
  });
});
