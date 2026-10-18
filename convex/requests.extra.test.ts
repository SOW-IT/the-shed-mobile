/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { appUrl, requestUrl } from "./requests";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const RACHEL = "rachel@sow.org.au";
const HENRY = "henry@sow.org.au";
const BELLA = "bella@sow.org.au";
const FIONA = "fiona@sow.org.au";
const DAN = "dan@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const storedReceipt = async (t: TestConvex<typeof schema>) => ({
  storageId: await t.run((ctx) =>
    ctx.storage.store(new Blob(["receipt"], { type: "application/pdf" }))
  ),
  name: "receipt.pdf",
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Marketing",
    division: "Engagement",
    headEmail: HENRY,
  });
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Finance",
    division: "Governance",
    headEmail: FIONA,
  });
  for (const a of [
    { email: RACHEL, roles: ["Staff"], department: "Marketing" },
    { email: BELLA, roles: ["Staff"], department: "Finance" },
    { email: DAN, roles: ["Director"], department: "Marketing" },
  ]) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...a });
  }
  await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
  return t;
}

async function approvedRequest(t: TestConvex<typeof schema>, amount = 100) {
  await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount });
  const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
  await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
  await asUser(t, BELLA).mutation(api.requests.approve, {
    requestId: request._id,
    step: "budgetManager",
  });
  await asUser(t, FIONA).mutation(api.requests.approve, {
    requestId: request._id,
    step: "financeHead",
  });
  return request._id;
}

describe("appUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("prefers the deployment's SITE_URL so links match the environment", () => {
    vi.stubEnv("SITE_URL", "https://the-shed-web-dev.vercel.app");
    vi.stubEnv("APP_URL", "https://the-shed-web.vercel.app");
    expect(appUrl()).toBe("https://the-shed-web-dev.vercel.app");
    expect(appUrl("/review")).toBe("https://the-shed-web-dev.vercel.app/review");
  });

  test("falls back to APP_URL then the prod default when SITE_URL is unset or blank", () => {
    vi.stubEnv("SITE_URL", undefined);
    vi.stubEnv("APP_URL", "https://app.example.com");
    expect(appUrl("/x")).toBe("https://app.example.com/x");
    vi.stubEnv("SITE_URL", "   ");
    expect(appUrl("/x")).toBe("https://app.example.com/x");
    vi.stubEnv("APP_URL", undefined);
    expect(appUrl("/y")).toBe("https://theshed.sow.org.au/y");
  });

  test("normalises a trailing slash so links never double up", () => {
    vi.stubEnv("SITE_URL", "https://the-shed-web-dev.vercel.app/");
    expect(appUrl("/review")).toBe("https://the-shed-web-dev.vercel.app/review");
    expect(appUrl()).toBe("https://the-shed-web-dev.vercel.app");
  });
});

describe("notification deep-links", () => {
  const fakeRequest = {
    _id: "k57fakerequestid000000000000" as Id<"requests">,
    requesterEmail: RACHEL,
  };

  test("requestUrl routes the requester to Mine and everyone else to Review", () => {
    expect(requestUrl(RACHEL, fakeRequest)).toBe("/?tab=mine");
    expect(requestUrl(HENRY, fakeRequest)).toBe("/?tab=review");
  });

  test("requestUrl with { thread } focuses the request and opens its thread", () => {
    expect(requestUrl(RACHEL, fakeRequest, { thread: true })).toBe(
      `/?tab=mine&focus=${fakeRequest._id}&thread=1`
    );
    expect(requestUrl(HENRY, fakeRequest, { thread: true })).toBe(
      `/?tab=review&focus=${fakeRequest._id}&thread=1`
    );
  });

  test("submit deep-links the approver to Review and links the request via requestId", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;

    const henryNotifs = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userEmail", HENRY))
        .collect()
    );
    expect(henryNotifs).toHaveLength(1);
    expect(henryNotifs[0].url).toBe("/?tab=review");
    expect(henryNotifs[0].requestId).toBe(request._id);

    const rachelNotifs = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userEmail", RACHEL))
        .collect()
    );
    expect(rachelNotifs).toHaveLength(0);
  });
});

describe("submit validation", () => {
  test("rejects non-positive amounts and blank descriptions", async () => {
    const t = await setup();
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 0 })
    ).rejects.toThrow(/positive number/);
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, { description: "   ", amount: 10 })
    ).rejects.toThrow(/describe what the request/);
  });

  test("rejects non-finite and absurd amounts", async () => {
    const t = await setup();
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, {
        description: "x",
        amount: Infinity,
      })
    ).rejects.toThrow(/positive number/);
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, {
        description: "x",
        amount: 2_000_000,
      })
    ).rejects.toThrow(/Talk to Finance/);
  });

  test("a Head of Division with no resolvable department is asked to pick one", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Empty Division",
      headEmail: "edie@sow.org.au",
    });
    await expect(
      asUser(t, "edie@sow.org.au").mutation(api.requests.submit, {
        description: "x",
        amount: 10,
      })
    ).rejects.toThrow(/Pick a department/);
  });
});

describe("allRequests authorization", () => {
  test("non-Finance staff are refused", async () => {
    const t = await setup();
    await expect(
      asUser(t, RACHEL).query(api.requests.allRequests, {})
    ).rejects.toThrow(/Only Finance staff/);
    expect(await asUser(t, BELLA).query(api.requests.allRequests, {})).toEqual([]);
  });
});

describe("requestsForExport", () => {
  const seed = async (
    t: TestConvex<typeof schema>,
    year: number,
    description: string
  ) => {
    vi.setSystemTime(staffYearStartMs(year) + 1);
    const id = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description,
        amount: 100,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
        approvedByFinanceHead: "APPROVED",
        paid: true,
      })
    );
    vi.useRealTimers();
    return id;
  };

  test("Finance gets the selected years, with out-of-range years filtered", async () => {
    const t = convexTest(schema, modules);
    await seed(t, YEAR - 1, "last year");
    await seed(t, YEAR, "this year");
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: HENRY,
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: FIONA,
    });
    for (const a of [
      { email: RACHEL, roles: ["Staff"], department: "Marketing" },
      { email: BELLA, roles: ["Staff"], department: "Finance" },
      { email: DAN, roles: ["Director"], department: "Marketing" },
    ]) {
      await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...a });
    }
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });

    const bella = asUser(t, BELLA);
    const rows = (await bella.query(api.requests.requestsForExport, {
      years: [YEAR + 1, YEAR, YEAR - 1, 2020],
    }))!;
    expect(rows.map((r) => r.description).sort()).toEqual([
      "last year",
      "this year",
    ]);

    const onlyThis = (await bella.query(api.requests.requestsForExport, {
      years: [YEAR],
    }))!;
    expect(onlyThis.map((r) => r.description)).toEqual(["this year"]);

    expect(
      await bella.query(api.requests.requestsForExport, { years: [] })
    ).toEqual([]);
  });

  test("non-Finance staff are refused", async () => {
    const t = await setup();
    await expect(
      asUser(t, RACHEL).query(api.requests.requestsForExport, { years: [YEAR] })
    ).rejects.toThrow(/Only Finance staff/);
  });

  test("an unauthenticated caller gets null", async () => {
    const t = await setup();
    expect(
      await t.query(api.requests.requestsForExport, { years: [YEAR] })
    ).toBeNull();
  });
});

describe("toReview director grouping", () => {
  test("a >= $5000 request awaiting the Director shows in their director bucket", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "big", amount: 6000 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "budgetManager",
    });
    const review = (await asUser(t, DAN).query(api.requests.toReview, {}))!;
    expect(review.director.map((r) => r._id)).toContain(request._id);
  });
});

describe("cancel validation", () => {
  test("only the requester can cancel, and not once completed", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await expect(
      asUser(t, HENRY).mutation(api.requests.cancel, { requestId: request._id })
    ).rejects.toThrow(/only cancel your own/);
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: request._id,
      step: "hod",
      reason: "no",
    });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: request._id })
    ).rejects.toThrow(/Completed requests/);
  });

  test("cancelling notifies the pending approver and clears the audit trail", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    vi.useFakeTimers();
    try {
      await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: request._id });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    const events = await t.run((ctx) =>
      ctx.db
        .query("requestEvents")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .take(10)
    );
    expect(events).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get("requests", request._id))).toBeNull();
  });
});

describe("authorizeStep guards", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a missing/foreign-year request reports not found", async () => {
    vi.setSystemTime(staffYearStartMs(YEAR - 2) + 1);
    const t = convexTest(schema, modules);
    const requestId = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "x",
        amount: 100,
        approvedByHOD: "PENDING",
        approvedByBudgetManager: "PENDING",
        approvedByFinanceHead: "PENDING",
      })
    );
    vi.useRealTimers();
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: HENRY,
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: FIONA,
    });
    await admin.mutation(api.admin.setStaffProfile, {
      year: YEAR, email: RACHEL, roles: ["Staff"], department: "Marketing",
    });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: FIONA });

    await expect(
      asUser(t, HENRY).mutation(api.requests.approve, { requestId, step: "hod" })
    ).rejects.toThrow(/Request not found/);
  });
});

describe("stepInfo", () => {
  test("returns the approver, resolved name, and that step's events", async () => {
    const t = await setup();
    await t.run((ctx) => ctx.db.insert("directoryUsers", { email: HENRY, name: "Henry H" }));
    const id = await approvedRequest(t);

    const hod = (await asUser(t, RACHEL).query(api.requests.stepInfo, {
      requestId: id,
      step: "hod",
    }))!;
    expect(hod.email).toBe(HENRY);
    expect(hod.name).toBe("Henry H");
    expect(hod.isDelegated).toBe(false);
    expect(hod.officeholderEmail).toBe(HENRY);
    expect(hod.events.map((e) => e.action)).toContain("approved");

    await t.run(async (ctx) => {
      await ctx.db.insert("requestEvents", {
        requestId: id,
        action: "comment",
        step: "hod",
        actorEmail: HENRY,
        detail: "note",
      });
    });
    const hodAgain = (await asUser(t, RACHEL).query(api.requests.stepInfo, {
      requestId: id,
      step: "hod",
    }))!;
    expect(hodAgain.events.length).toBeGreaterThanOrEqual(2);
    expect(hodAgain.events[0]!.at).toBeGreaterThanOrEqual(hodAgain.events[1]!.at);

    const director = (await asUser(t, RACHEL).query(api.requests.stepInfo, {
      requestId: id,
      step: "director",
    }))!;
    expect(director.email).toBe(DAN);
    expect(director.events).toHaveLength(0);

    expect(await t.query(api.requests.stepInfo, { requestId: id, step: "hod" })).toBeNull();
  });

  test("returns null for a request that doesn't exist", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id });
    expect(
      await asUser(t, RACHEL).query(api.requests.stepInfo, { requestId: id, step: "hod" })
    ).toBeNull();
  });

  test("pending HOD step shows the stand-in when cover is active", async () => {
    const t = await setup();
    await t.run((ctx) => ctx.db.insert("directoryUsers", { email: RACHEL, name: "Rachel R" }));
    await t.run((ctx) => ctx.db.insert("directoryUsers", { email: HENRY, name: "Henry H" }));
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: HENRY,
      toEmail: RACHEL,
    });
    const JUSTIN = "justin@sow.org.au";
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email: JUSTIN,
      roles: ["Staff"],
      department: "Marketing",
    });
    await asUser(t, JUSTIN).mutation(api.requests.submit, {
      description: "covered",
      amount: 40,
    });
    const [req] = (await asUser(t, JUSTIN).query(api.requests.myRequests, {}))!;

    const hod = (await asUser(t, JUSTIN).query(api.requests.stepInfo, {
      requestId: req._id,
      step: "hod",
    }))!;
    expect(hod.isDelegated).toBe(true);
    expect(hod.email).toBe(RACHEL);
    expect(hod.name).toBe("Rachel R");
    expect(hod.officeholderEmail).toBe(HENRY);
    expect(hod.officeholderName).toBe("Henry H");

    const actors = (await asUser(t, JUSTIN).query(api.requests.stepActors, {
      requestId: req._id,
    }))!;
    expect(actors.hod.isDelegated).toBe(true);
    expect(actors.hod.email).toBe(RACHEL);
    expect(actors.hod.officeholderEmail).toBe(HENRY);

    await asUser(t, RACHEL).mutation(api.requests.approve, {
      requestId: req._id,
      step: "hod",
    });
    const after = (await asUser(t, JUSTIN).query(api.requests.stepActors, {
      requestId: req._id,
    }))!;
    expect(after.hod.isDelegated).toBe(true);
    expect(after.hod.email).toBe(RACHEL);
    expect(after.hod.actedAt).toBeTypeOf("number");
  });

  test("multiple stand-ins list extras on stepInfo", async () => {
    const t = await setup();
    const OTHER = "other@sow.org.au";
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email: OTHER,
      roles: ["Staff"],
      department: "Marketing",
    });
    await t.run((ctx) => ctx.db.insert("directoryUsers", { email: OTHER, name: "Other O" }));
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: HENRY,
      toEmail: RACHEL,
    });
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: HENRY,
      toEmail: OTHER,
    });
    await asUser(t, RACHEL).mutation(api.requests.submit, {
      description: "multi-cover",
      amount: 25,
    });
    const [req] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    const hod = (await asUser(t, BELLA).query(api.requests.stepInfo, {
      requestId: req._id,
      step: "hod",
    }))!;
    expect(hod.isDelegated).toBe(true);
    expect([RACHEL, OTHER]).toContain(hod.email);
    expect(hod.otherDelegateNames.length).toBe(1);
  });
});

describe("stepActors", () => {
  test("maps each step to its approver name/email and last action time", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    const actors = (await asUser(t, RACHEL).query(api.requests.stepActors, {
      requestId: id,
    }))!;
    expect(actors.hod.email).toBe(HENRY);
    expect(actors.budgetManager.email).toBe(BELLA);
    expect(actors.financeHead.email).toBe(FIONA);
    expect(actors.hod.actedAt).toBeTypeOf("number");
    expect(actors.director.email).toBe(DAN);
    expect(actors.director.actedAt).toBeNull();

    expect(await t.query(api.requests.stepActors, { requestId: id })).toBeNull();
  });

  test("returns null once the request is gone", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id });
    expect(
      await asUser(t, RACHEL).query(api.requests.stepActors, { requestId: id })
    ).toBeNull();
  });
});

describe("canNudge cooldown", () => {
  test("says when the next nudge is allowed, a day after the last one", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    const rachel = asUser(t, RACHEL);
    expect(await rachel.query(api.requests.canNudge, { requestId: request._id })).toEqual({
      onCooldown: false,
      remainingMs: 0,
      availableAt: 0,
    });

    await rachel.mutation(api.requests.nudge, { requestId: request._id });
    const sentAt = await t.run(
      async (ctx) => (await ctx.db.query("requestNudges").first())!.sentAt
    );
    const status = (await rachel.query(api.requests.canNudge, { requestId: request._id }))!;
    expect(status.onCooldown).toBe(true);
    expect(status.availableAt).toBe(sentAt + 24 * 60 * 60 * 1000);
    expect(status.remainingMs).toBeGreaterThan(0);
  });
});

describe("reviewed leaves out what is still waiting on the caller", () => {
  test("a request ready to pay shows once, under Ready to Pay, until it is paid", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    const fiona = asUser(t, FIONA);
    expect((await fiona.query(api.requests.reviewed, {}))!.map((r) => r._id)).toContain(id);

    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "R", bsb: "062000", accountNumber: "1234", amount: 100, attachments: [await storedReceipt(t)] },
      ],
    });
    expect((await fiona.query(api.requests.toReview, {}))!.readyToPay.map((r) => r._id)).toEqual([id]);
    expect((await fiona.query(api.requests.reviewed, {}))!.map((r) => r._id)).not.toContain(id);

    await fiona.mutation(api.requests.pay, { requestId: id, paidAmount: 100 });
    expect((await fiona.query(api.requests.toReview, {}))!.readyToPay).toEqual([]);
    expect((await fiona.query(api.requests.reviewed, {}))!.map((r) => r._id)).toContain(id);
  });

  test("a request the caller approved at one step and must approve at the next shows only to review", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: BELLA,
      toEmail: HENRY,
    });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    const henry = asUser(t, HENRY);
    await henry.mutation(api.requests.approve, { requestId: request._id, step: "hod" });

    expect((await henry.query(api.requests.toReview, {}))!.budgetManager.map((r) => r._id)).toEqual([
      request._id,
    ]);
    expect((await henry.query(api.requests.reviewed, {}))!.map((r) => r._id)).not.toContain(
      request._id
    );
  });
});

describe("auto-approved steps", () => {
  const submitAs = async (
    t: TestConvex<typeof schema>,
    email: string,
    amount: number,
    department?: string
  ) => {
    await asUser(t, email).mutation(api.requests.submit, { description: "own", amount, department });
    const [request] = (await asUser(t, email).query(api.requests.myRequests, {}))!;
    return request._id;
  };

  test("a Finance staffer's own request shows HOD as auto-approved, not covered", async () => {
    const t = await setup();
    const CARL = "carl@sow.org.au";
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email: CARL,
      roles: ["Staff"],
      department: "Finance",
    });
    await t.run((ctx) => ctx.db.insert("directoryUsers", { email: CARL, name: "Carl C" }));
    const id = await submitAs(t, CARL, 80);

    const actors = (await asUser(t, CARL).query(api.requests.stepActors, { requestId: id }))!;
    expect(actors.hod).toMatchObject({
      autoApproved: true,
      isDelegated: false,
      email: CARL,
      name: "Carl C",
      officeholderEmail: FIONA,
    });
    expect(actors.hod.actedAt).toBeTypeOf("number");
    expect(actors.budgetManager).toMatchObject({ autoApproved: false, email: BELLA });

    const hod = (await asUser(t, CARL).query(api.requests.stepInfo, { requestId: id, step: "hod" }))!;
    expect(hod).toMatchObject({ autoApproved: true, isDelegated: false, email: CARL });
    expect(hod.events.map((e) => e.action)).toEqual(["auto-approved"]);
  });

  test("the Finance Head's and the Director's own steps are auto-approved, not stand-ins", async () => {
    const t = await setup();
    const fionaRequest = await submitAs(t, FIONA, 9000);
    const fiona = (await asUser(t, FIONA).query(api.requests.stepActors, {
      requestId: fionaRequest,
    }))!;
    for (const step of ["hod", "budgetManager", "financeHead"] as const) {
      expect(fiona[step]).toMatchObject({ autoApproved: true, isDelegated: false, email: FIONA });
    }
    expect(fiona.director).toMatchObject({ autoApproved: false, isDelegated: false, email: DAN });

    const danRequest = await submitAs(t, DAN, 6000, "Marketing");
    const dan = (await asUser(t, DAN).query(api.requests.stepActors, { requestId: danRequest }))!;
    expect(dan.hod).toMatchObject({ autoApproved: true, isDelegated: false, officeholderEmail: HENRY });
    expect(dan.director).toMatchObject({ autoApproved: true, isDelegated: false });
  });

  test("an approval by the officeholder is not auto-approved", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    const actors = (await asUser(t, RACHEL).query(api.requests.stepActors, { requestId: id }))!;
    expect(actors.hod).toMatchObject({ autoApproved: false, isDelegated: false, email: HENRY });
  });
});

describe("get", () => {
  test("returns null when unauthenticated, the doc when signed in", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    expect(await t.query(api.requests.get, { requestId: id })).toBeNull();
    const seen = await asUser(t, HENRY).query(api.requests.get, { requestId: id });
    expect(seen?._id).toBe(id);
  });
});

describe("submitReceipt validation", () => {
  test("guards ownership, approval state, double-submission and empty recipients", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    const file = await storedReceipt(t);

    await expect(
      asUser(t, HENRY).mutation(api.requests.submitReceipt, {
        requestId: id,
        recipients: [
          { accountName: "H", bsb: "0", accountNumber: "1", amount: 90, attachments: [file] },
        ],
      })
    ).rejects.toThrow(/your own requests/);

    await expect(
      asUser(t, RACHEL).mutation(api.requests.submitReceipt, { requestId: id, recipients: [] })
    ).rejects.toThrow(/at least one recipient/);

    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "R", bsb: "0", accountNumber: "1", amount: 90, attachments: [file] },
      ],
    });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
        requestId: id,
        recipients: [
          { accountName: "R", bsb: "0", accountNumber: "1", amount: 90, attachments: [file] },
        ],
      })
    ).rejects.toThrow(/already been submitted/);
  });

  test("rejects a receipt before the request is fully approved", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
        requestId: request._id,
        recipients: [
          {
            accountName: "R",
            bsb: "0",
            accountNumber: "1",
            amount: 90,
            attachments: [await storedReceipt(t)],
          },
        ],
      })
    ).rejects.toThrow(/fully approved first/);
  });
});

describe("receiptAttachments", () => {
  test("unauthorised viewers get null; the requester and Finance see files", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        {
          accountName: "R",
          bsb: "0",
          accountNumber: "1",
          amount: 90,
          attachments: [await storedReceipt(t)],
        },
      ],
    });
    expect(
      await asUser(t, HENRY).query(api.requests.receiptAttachments, { requestId: id })
    ).toBeNull();
    const mine = await asUser(t, RACHEL).query(api.requests.receiptAttachments, {
      requestId: id,
    });
    expect(mine).toHaveLength(1);
    expect(await t.query(api.requests.receiptAttachments, { requestId: id })).toBeNull();
  });

  test("returns an empty array when no receipt has been submitted yet", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    expect(
      await asUser(t, RACHEL).query(api.requests.receiptAttachments, { requestId: id })
    ).toEqual([]);
  });
});

describe("pay validation", () => {
  test("guards amount, not-found, payer identity and lifecycle state", async () => {
    vi.setSystemTime(staffYearStartMs(YEAR - 2) + 1);
    const t = convexTest(schema, modules);
    const foreignId = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "ancient",
        amount: 90,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
        approvedByFinanceHead: "APPROVED",
        receipt: { totalAmount: 90, recipients: [{ accountName: "R", bsb: "0", accountNumber: "1", amount: 90, attachments: [] }] },
        paid: false,
      })
    );
    vi.useRealTimers();
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: HENRY,
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: FIONA,
    });
    for (const a of [
      { email: RACHEL, roles: ["Staff"], department: "Marketing" },
      { email: BELLA, roles: ["Staff"], department: "Finance" },
      { email: DAN, roles: ["Director"], department: "Marketing" },
    ]) {
      await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...a });
    }
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });

    const id = await approvedRequest(t);

    await expect(
      asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 0 })
    ).rejects.toThrow(/positive number/);

    await expect(
      asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 90 })
    ).rejects.toThrow(/not awaiting payment/);

    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        {
          accountName: "R",
          bsb: "0",
          accountNumber: "1",
          amount: 90,
          attachments: [await storedReceipt(t)],
        },
      ],
    });
    await expect(
      asUser(t, BELLA).mutation(api.requests.pay, { requestId: id, paidAmount: 90 })
    ).rejects.toThrow(/Only the Finance Head/);

    await expect(
      asUser(t, FIONA).mutation(api.requests.pay, { requestId: foreignId, paidAmount: 90 })
    ).rejects.toThrow(/Request not found/);
  });

  test("paying a differing amount notifies the Budget Manager", async () => {
    const t = await setup();
    const id = await approvedRequest(t, 100);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        {
          accountName: "R",
          bsb: "0",
          accountNumber: "1",
          amount: 80,
          attachments: [await storedReceipt(t)],
        },
      ],
    });
    await asUser(t, FIONA).mutation(api.requests.pay, {
      requestId: id,
      paidAmount: 80,
      comment: "partial",
    });
    const doc = await t.run((ctx) => ctx.db.get("requests", id));
    expect(doc?.paid).toBe(true);
    expect(doc?.paidAmount).toBe(80);
    expect(doc?.payComment).toBe("partial");
  });
});

describe("generateReceiptUploadUrl", () => {
  test("a provisioned user gets an upload URL; a stranger is rejected", async () => {
    const t = await setup();
    const url = await asUser(t, RACHEL).mutation(api.requests.generateReceiptUploadUrl, {});
    expect(typeof url).toBe("string");
    await expect(
      asUser(t, "ghost@sow.org.au").mutation(api.requests.generateReceiptUploadUrl, {})
    ).rejects.toThrow(/No role\/department/);
  });
});

describe("deleteDeclined", () => {
  async function declinedRequest(t: TestConvex<typeof schema>) {
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: request._id,
      step: "hod",
      reason: "nope",
    });
    return request._id;
  }

  test("requester can delete a declined request and all its data is cleaned up", async () => {
    const t = await setup();
    const id = await declinedRequest(t);

    await asUser(t, HENRY).mutation(api.comments.add, { requestId: id, body: "fyi" });
    const [comment] = (await asUser(t, HENRY).query(api.comments.list, { requestId: id }))!;
    await asUser(t, RACHEL).mutation(api.comments.toggleReaction, { commentId: comment.id, emoji: "👍" });
    await asUser(t, RACHEL).mutation(api.comments.markRead, { requestId: id });

    vi.useFakeTimers();
    try {
      await asUser(t, RACHEL).mutation(api.requests.deleteDeclined, { requestId: id });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    expect(await asUser(t, RACHEL).query(api.requests.get, { requestId: id })).toBeNull();
    await t.run(async (ctx) => {
      expect(
        await ctx.db.query("requestEvents").withIndex("by_request", (q) => q.eq("requestId", id)).take(10)
      ).toHaveLength(0);
      expect(
        await ctx.db.query("requestComments").withIndex("by_request", (q) => q.eq("requestId", id)).take(10)
      ).toHaveLength(0);
      expect(
        await ctx.db.query("commentReactions").withIndex("by_comment", (q) => q.eq("commentId", comment.id)).take(10)
      ).toHaveLength(0);
      expect(
        await ctx.db.query("commentReads").withIndex("by_request_and_user", (q) => q.eq("requestId", id)).take(10)
      ).toHaveLength(0);
    });
  });

  test("only the requester can delete their own declined request", async () => {
    const t = await setup();
    const id = await declinedRequest(t);

    await expect(
      asUser(t, HENRY).mutation(api.requests.deleteDeclined, { requestId: id })
    ).rejects.toThrow(/your own requests/);

    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "y", amount: 50 });
    const pending = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!.find(
      (r) => r.description === "y" && r.amount === 50
    );
    expect(pending).toBeDefined();
    await expect(
      asUser(t, RACHEL).mutation(api.requests.deleteDeclined, { requestId: pending!._id })
    ).rejects.toThrow(/declined/);
  });
});

describe("cleanup.purgeOldReceiptFiles", () => {
  async function paidRequestWithFile(t: TestConvex<typeof schema>) {
    const id = await approvedRequest(t);
    const file = await storedReceipt(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "Rachel", bsb: "123456", accountNumber: "12345678", amount: 100, attachments: [file] },
      ],
    });
    await asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 100 });
    return { id, storageId: file.storageId };
  }

  test("purges files on requests created before the cutoff, keeping the record", async () => {
    const t = await setup();
    const { id, storageId } = await paidRequestWithFile(t);
    const created = (await t.run((ctx) => ctx.db.get("requests", id)))!._creationTime;

    await t.mutation(internal.cleanup.purgeOldReceiptFiles, { beforeMs: created + 1 });

    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
    const request = (await t.run((ctx) => ctx.db.get("requests", id)))!;
    const attachment = request.receipt!.recipients[0].attachments![0];
    expect(attachment.deleted).toBe(true);
    expect(attachment.name).toBe("receipt.pdf");

    const receipts = (await asUser(t, RACHEL).query(api.requests.receiptAttachments, {
      requestId: id,
    }))!;
    expect(receipts[0].attachments[0]).toMatchObject({
      name: "receipt.pdf",
      deleted: true,
      url: null,
    });
  });

  test("leaves files on requests created at or after the cutoff", async () => {
    const t = await setup();
    const { id, storageId } = await paidRequestWithFile(t);

    await t.mutation(internal.cleanup.purgeOldReceiptFiles, {});

    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
    const request = (await t.run((ctx) => ctx.db.get("requests", id)))!;
    expect(request.receipt!.recipients[0].attachments![0].deleted).toBeUndefined();
  });

  test("is idempotent — a second run does not error on already-purged files", async () => {
    const t = await setup();
    const { id } = await paidRequestWithFile(t);
    const created = (await t.run((ctx) => ctx.db.get("requests", id)))!._creationTime;
    await t.mutation(internal.cleanup.purgeOldReceiptFiles, { beforeMs: created + 1 });
    await t.mutation(internal.cleanup.purgeOldReceiptFiles, { beforeMs: created + 1 });
    const request = (await t.run((ctx) => ctx.db.get("requests", id)))!;
    expect(request.receipt!.recipients[0].attachments![0].deleted).toBe(true);
  });
});

describe("cancelling a request with a receipt", () => {
  test("deletes its receipt files and purges its notifications", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    const file = await storedReceipt(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "Rachel", bsb: "123456", accountNumber: "12345678", amount: 100, attachments: [file] },
      ],
    });
    const before = await t.run((ctx) =>
      ctx.db.query("notifications").withIndex("by_request", (q) => q.eq("requestId", id)).collect()
    );
    expect(before.length).toBeGreaterThan(0);

    vi.useFakeTimers();
    try {
      await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    expect(await t.run((ctx) => ctx.storage.getUrl(file.storageId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get("requests", id))).toBeNull();
    const after = await t.run((ctx) =>
      ctx.db.query("notifications").withIndex("by_request", (q) => q.eq("requestId", id)).collect()
    );
    expect(after).toEqual([]);
  });
});

describe("cleanup.purgeOldReceiptFiles paging", () => {
  test("continues through a scheduled follow-up when a page is full", async () => {
    const t = await setup();
    const files = [];
    for (let i = 0; i < 2; i++) {
      const id = await approvedRequest(t);
      const file = await storedReceipt(t);
      await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
        requestId: id,
        recipients: [
          { accountName: "Rachel", bsb: "123456", accountNumber: "12345678", amount: 100, attachments: [file] },
        ],
      });
      files.push(file.storageId);
    }
    vi.useFakeTimers();
    try {
      await t.mutation(internal.cleanup.purgeOldReceiptFiles, {
        beforeMs: Date.now() + 1,
        batch: 1,
      });
      // First page purged one request; the rest arrives via the reschedule.
      const purgedAfterFirstPage = (
        await Promise.all(files.map((f) => t.run((ctx) => ctx.storage.getUrl(f))))
      ).filter((url) => url === null).length;
      expect(purgedAfterFirstPage).toBe(1);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    for (const f of files) {
      expect(await t.run((ctx) => ctx.storage.getUrl(f))).toBeNull();
    }
  });
});

describe("Director step auto-approval", () => {
  test("the configured Director email skips the Director step even without the role", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .unique();
      if (settings) await ctx.db.patch("yearSettings", settings._id, { directorEmail: RACHEL });
      else await ctx.db.insert("yearSettings", { year: YEAR, directorEmail: RACHEL });
    });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "big", amount: 9000 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(request.approvedByDirector).toBe("APPROVED");
  });
});

describe("pay", () => {
  test("stores a trimmed comment and treats a whitespace-only comment as none", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    const file = await storedReceipt(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "Rachel", bsb: "123456", accountNumber: "12345678", amount: 100, attachments: [file] },
      ],
    });
    await asUser(t, FIONA).mutation(api.requests.pay, {
      requestId: id,
      paidAmount: 100,
      comment: "   ",
    });
    const request = (await t.run((ctx) => ctx.db.get("requests", id)))!;
    expect(request.payComment).toBeUndefined();
    const paidNote = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userEmail", RACHEL))
        .order("desc")
        .first()
    );
    expect(paidNote?.title).toBe("Reimbursement paid");
    // Paid exactly the requested amount: no "amount differs" nudge to the Budget Manager.
    const bellaNotes = await t.run((ctx) =>
      ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userEmail", BELLA)).collect()
    );
    expect(bellaNotes.some((n) => n.title === "Paid amount changed")).toBe(false);
  });
});

describe("browsing past years", () => {
  const seedPastRequest = async (
    t: TestConvex<typeof schema>,
    email: string,
    year: number,
    description: string
  ) => {
    vi.setSystemTime(staffYearStartMs(year) + 1);
    const id = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: email,
        department: "Marketing",
        description,
        amount: 100,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
        approvedByFinanceHead: "APPROVED",
        paid: true,
      })
    );
    vi.useRealTimers();
    return id;
  };

  type Review = { actor: string; action: string; daysIn: number };

  // convex-test keeps _creationTime rising, so past reviews go in before the
  // org is set up "now", each in time order after its request.
  async function setupWithHistory(
    seeds: { email: string; year: number; description: string; reviews?: Review[] }[]
  ) {
    const t = convexTest(schema, modules);
    const sorted = [...seeds].sort((a, b) => a.year - b.year);
    const reviews: (Review & { requestId: Id<"requests">; at: number })[] = [];
    for (const s of sorted) {
      const requestId = await seedPastRequest(t, s.email, s.year, s.description);
      for (const r of s.reviews ?? []) {
        reviews.push({ ...r, requestId, at: staffYearStartMs(s.year) + r.daysIn * 86_400_000 });
      }
    }
    for (const r of reviews.sort((a, b) => a.at - b.at)) {
      vi.setSystemTime(r.at);
      await t.run((ctx) =>
        ctx.db.insert("requestEvents", {
          requestId: r.requestId,
          actorEmail: r.actor,
          action: r.action,
          step: "hod",
        })
      );
      vi.useRealTimers();
    }
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: HENRY,
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: FIONA,
    });
    for (const a of [
      { email: RACHEL, roles: ["Staff"], department: "Marketing" },
      { email: BELLA, roles: ["Staff"], department: "Finance" },
      { email: DAN, roles: ["Director"], department: "Marketing" },
    ]) {
      await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...a });
    }
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    return t;
  }

  test("myRequests({year}) returns only that year, newest-first, no carry-over", async () => {
    const t = await setupWithHistory([
      { email: RACHEL, year: YEAR - 2, description: "old one" },
      { email: RACHEL, year: YEAR - 2, description: "old two" },
    ]);
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "this year", amount: 50 });

    const live = (await rachel.query(api.requests.myRequests, {}))!;
    expect(live.map((r) => r.description)).toEqual(["this year"]);

    const past = (await rachel.query(api.requests.myRequests, { year: YEAR - 2 }))!;
    expect(past.map((r) => r.description)).toEqual(["old two", "old one"]);
  });

  test("requestYears lists the caller's request years plus the current one", async () => {
    const t = await setupWithHistory([
      { email: RACHEL, year: YEAR - 2, description: "old one" },
    ]);
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "this year", amount: 50 });

    const years = (await rachel.query(api.requests.requestYears, {}))!;
    expect(years.mine).toEqual([YEAR, YEAR - 2]);
  });

  test("requestYears never offers years before 2021, even with older org data", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("divisions", { year: 2019, name: "Governance" })
    );
    const years = (await asUser(t, BELLA).query(api.requests.requestYears, {}))!;
    expect(years.all).not.toContain(2019);
    expect(Math.min(...years.all)).toBeGreaterThanOrEqual(2021);
  });

  test("allRequests({year}) shows a past year to Finance only", async () => {
    const t = await setupWithHistory([
      { email: RACHEL, year: YEAR - 1, description: "last year" },
    ]);

    const past = (await asUser(t, BELLA).query(api.requests.allRequests, {
      year: YEAR - 1,
    }))!;
    expect(past.map((r) => r.description)).toEqual(["last year"]);

    await expect(
      asUser(t, RACHEL).query(api.requests.allRequests, { year: YEAR - 1 })
    ).rejects.toThrow(/Only Finance/);
  });

  test("reviewedInYear lists other people's requests from that year the caller reviewed", async () => {
    const t = await setupWithHistory([
      {
        email: RACHEL,
        year: YEAR - 1,
        description: "approved last year",
        reviews: [{ actor: HENRY, action: "approved", daysIn: 10 }],
      },
      {
        email: RACHEL,
        year: YEAR - 1,
        description: "declined last year",
        reviews: [{ actor: HENRY, action: "declined", daysIn: 11 }],
      },
      {
        email: RACHEL,
        year: YEAR - 1,
        description: "someone else's review",
        reviews: [{ actor: FIONA, action: "approved", daysIn: 10 }],
      },
      {
        email: HENRY,
        year: YEAR - 1,
        description: "henry's own",
        reviews: [{ actor: HENRY, action: "auto-approved", daysIn: 0 }],
      },
      // Reviewed in the year after, so it belongs to the year it was made.
      {
        email: RACHEL,
        year: YEAR - 2,
        description: "carried over",
        reviews: [{ actor: HENRY, action: "approved", daysIn: 380 }],
      },
    ]);

    const henry = asUser(t, HENRY);
    const reviewedLastYear = (await henry.query(api.requests.reviewedInYear, { year: YEAR - 1 }))!;
    expect(reviewedLastYear.map((r) => r.description).sort()).toEqual([
      "approved last year",
      "declined last year",
    ]);
    const reviewedBefore = (await henry.query(api.requests.reviewedInYear, { year: YEAR - 2 }))!;
    expect(reviewedBefore.map((r) => r.description)).toEqual(["carried over"]);
    expect(await asUser(t, BELLA).query(api.requests.reviewedInYear, { year: YEAR - 1 })).toEqual([]);
  });

  test("reviewedInYear keeps receipt details from approvers outside Finance", async () => {
    const t = await setupWithHistory([
      {
        email: RACHEL,
        year: YEAR - 1,
        description: "with receipt",
        reviews: [{ actor: HENRY, action: "approved", daysIn: 1 }],
      },
    ]);
    const [request] = await t.run((ctx) => ctx.db.query("requests").collect());
    await t.run((ctx) =>
      ctx.db.patch("requests", request._id, {
        receipt: {
          totalAmount: 100,
          recipients: [{ accountName: "R", bsb: "062000", accountNumber: "1234", amount: 100, attachments: [] }],
        },
      })
    );

    const [row] = (await asUser(t, HENRY).query(api.requests.reviewedInYear, { year: YEAR - 1 }))!;
    expect(row.receipt).toEqual({ totalAmount: 100, recipients: [] });
  });

  test("requestYears says whether the caller has ever approved or declined a request", async () => {
    const t = await setupWithHistory([
      {
        email: RACHEL,
        year: YEAR - 1,
        description: "last year",
        reviews: [{ actor: HENRY, action: "approved", daysIn: 1 }],
      },
    ]);

    expect((await asUser(t, HENRY).query(api.requests.requestYears, {}))!.reviewedBefore).toBe(true);
    expect((await asUser(t, RACHEL).query(api.requests.requestYears, {}))!.reviewedBefore).toBe(false);
  });
});

describe("money in the audit trail and notifications", () => {
  test("amounts are written the way the app shows them (grouped, 2dp with cents)", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, {
      description: "conference",
      amount: 1234.5,
    });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, {
      requestId: request._id,
      step: "hod",
    });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "budgetManager",
    });
    await asUser(t, FIONA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "financeHead",
    });
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: request._id,
      recipients: [
        {
          accountName: "R",
          bsb: "062000",
          accountNumber: "12345678",
          amount: 1234.5,
          attachments: [await storedReceipt(t)],
        },
      ],
    });
    await asUser(t, FIONA).mutation(api.requests.pay, {
      requestId: request._id,
      paidAmount: 1234.5,
    });

    const details = (
      await t.run((ctx) =>
        ctx.db
          .query("requestEvents")
          .withIndex("by_request", (q) => q.eq("requestId", request._id))
          .collect()
      )
    ).flatMap((e) => (e.detail ? [e.detail] : []));
    expect(details).toContain("$1,234.50");
    expect(details).toContain("$1,234.50, 1 recipient");
  });

  test("the over-the-ceiling error names the limit in grouped dollars", async () => {
    const t = await setup();
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, {
        description: "too big",
        amount: 2_000_000,
      })
    ).rejects.toThrow(/\$1,000,000/);
  });
});
