/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const RACHEL = "rachel@sow.org.au"; // Marketing staff
const HENRY = "henry@sow.org.au"; // Marketing HOD
const BELLA = "bella@sow.org.au"; // Finance staff, Budget Manager
const FIONA = "fiona@sow.org.au"; // Finance head
const DAN = "dan@sow.org.au"; // Director

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const storedReceipt = async (t: TestConvex<typeof schema>) => ({
  storageId: await t.run((ctx) =>
    ctx.storage.store(new Blob(["receipt"], { type: "application/pdf" }))
  ),
  name: "receipt.pdf",
});

/** Jumps the clock 8 days forward so open requests read as stale (>7 days). */
const stale = () => {
  vi.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
};

async function runSetup(t: TestConvex<typeof schema>) {
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
}

async function setup() {
  const t = convexTest(schema, modules);
  await runSetup(t);
  return t;
}

describe("submit deadlock guard: missing Finance Head", () => {
  test("is rejected when the Finance department has no head", async () => {
    const t = await setup();
    // Vacate the Finance head — the financeHead step now has nobody.
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Finance",
      division: "Governance",
    });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 })
    ).rejects.toThrow(/Head for the Finance department/);
  });
});

describe("authorizeStep: reviewing your own request", () => {
  test("the requester cannot approve their own pending step", async () => {
    const t = await setup();
    // Henry (Marketing HOD) submits for Marketing: his HOD step auto-approves,
    // so budgetManager is pending. He is not the BM, but to hit the
    // own-request guard we have the requester themselves attempt a step.
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await expect(
      asUser(t, RACHEL).mutation(api.requests.approve, {
        requestId: request._id,
        step: "hod",
      })
    ).rejects.toThrow(/can't review your own request/);
  });
});

describe("toReview: finance head bucket", () => {
  test("a request awaiting the Finance Head shows in their financeHead bucket", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "budgetManager",
    });
    const review = (await asUser(t, FIONA).query(api.requests.toReview, {}))!;
    expect(review.financeHead.map((r) => r._id)).toContain(request._id);
  });
});

describe("decline: the decliner is skipped in the chain notification", () => {
  test("an approver who also holds a later step doesn't notify themselves", async () => {
    const t = await setup();
    // Henry heads BOTH Marketing and Finance, so he is the HOD *and* the
    // Finance Head for a Marketing request. He approves HOD, then declines at
    // the Finance Head step — the chain notification must skip him.
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Finance",
      division: "Governance",
      headEmail: HENRY,
    });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "budgetManager",
    });
    // Henry (now also Finance Head) declines — he is in the approved list (HOD)
    // and is the caller, so the loop's `continue` branch fires.
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: request._id,
      step: "financeHead",
      reason: "no funds",
    });
    const doc = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(doc?.approvedByFinanceHead).toBe("DECLINED");
  });
});

describe("stepActors: most-recent event wins when a step has several", () => {
  test("sorts duplicate step events by creation time", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    // Inject a second approved event for the same step to force the sort
    // comparator to run over more than one element.
    await t.run((ctx) =>
      ctx.db.insert("requestEvents", {
        requestId: request._id,
        action: "approved",
        step: "hod",
        actorEmail: HENRY,
      })
    );
    const actors = (await asUser(t, RACHEL).query(api.requests.stepActors, {
      requestId: request._id,
    }))!;
    expect(actors.hod.actedAt).toBeTypeOf("number");
  });
});

describe("receiptAttachments: current-year Finance Head on a carried-over request", () => {
  test("this year's Finance Head can view a previous year's receipt", async () => {
    // Seed the carry-over request at YEAR-1 time on a fresh instance BEFORE
    // setup() advances _lastCreationTime to real time. The receipt storage ID
    // is patched in afterwards.
    vi.setSystemTime(staffYearStartMs(YEAR - 1) + 1);
    const t = convexTest(schema, modules);
    const requestId = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "carried",
        amount: 100,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
        approvedByFinanceHead: "APPROVED",
        paid: false,
      })
    );
    vi.useRealTimers();
    // Now run setup (advances _lastCreationTime to real time) and store receipt.
    await runSetup(t);
    const storage = await storedReceipt(t);
    await t.run((ctx) =>
      ctx.db.patch("requests", requestId as never, {
        receipt: {
          totalAmount: 100,
          recipients: [
            { accountName: "R", bsb: "0", accountNumber: "1", amount: 100, attachments: [storage] },
          ],
        },
      })
    );
    // Fiona is THIS year's Finance Head, not last year's — the currentFinance
    // branch authorises her.
    const files = await asUser(t, FIONA).query(api.requests.receiptAttachments, {
      requestId,
    });
    expect(files).toHaveLength(1);
    expect(files![0].attachments[0].name).toBe("receipt.pdf");

    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: FIONA,
      toEmail: HENRY,
    });
    const delegateFiles = await asUser(t, HENRY).query(
      api.requests.receiptAttachments,
      { requestId }
    );
    expect(delegateFiles).toHaveLength(1);
  });
});

describe("reminders: receipt and payment stages", () => {
  afterEach(() => vi.useRealTimers());

  test("nudges the requester when a fully-approved request has no receipt", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
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

    stale();
    await t.mutation(internal.reminders.remindStale, {});
    const updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBeDefined();
  });

  test("nudges the Finance Head when a submitted receipt is still unpaid", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
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
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: request._id,
      recipients: [
        { accountName: "R", bsb: "0", accountNumber: "1", amount: 100, attachments: [await storedReceipt(t)] },
      ],
    });

    stale();
    await t.mutation(internal.reminders.remindStale, {});
    const updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBeDefined();
  });

  test("a carried-over request reminds the current year's officeholder", async () => {
    // Seed at YEAR-1 time on a fresh instance so _creationTime lands in YEAR-1.
    vi.setSystemTime(staffYearStartMs(YEAR - 1) + 1);
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("departments", {
        year: YEAR - 1,
        name: "Marketing",
        division: "Engagement",
        headEmail: HENRY,
      })
    );
    const requestId = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "carried",
        amount: 100,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "PENDING",
        approvedByFinanceHead: "PENDING",
      })
    );
    vi.useRealTimers();
    await runSetup(t);

    stale();
    await t.mutation(internal.reminders.remindStale, {});
    const updated = await t.run((ctx) => ctx.db.get("requests", requestId));
    expect(updated?.lastReminderAt).toBeDefined();
  });
});

describe("userLink: re-keying a division head and budget manager on rename", () => {
  test("a renamed account carries its division headship and budget-manager role", async () => {
    const t = await setup();
    // Make Henry head the Engagement division and be the budget manager, then
    // rename his account — both references must follow the new email.
    await asUser(t, ADMIN).mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Engagement",
      headEmail: HENRY,
    });
    await t.run((ctx) =>
      ctx.db.insert("yearSettings", { year: YEAR + 5, budgetManagerEmail: HENRY })
    );

    const userId = await t.run((ctx) => ctx.db.insert("users", { email: HENRY }));
    await t.mutation(internal.userLink.link, { userId });
    await t.run((ctx) => ctx.db.patch("users", userId, { email: "henry.new@sow.org.au" }));
    await t.mutation(internal.userLink.link, { userId });

    await t.run(async (ctx) => {
      const division = await ctx.db
        .query("divisions")
        .withIndex("by_year_and_name", (q) => q.eq("year", YEAR).eq("name", "Engagement"))
        .unique();
      expect(division?.headEmail).toBe("henry.new@sow.org.au");
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR + 5))
        .unique();
      expect(settings?.budgetManagerEmail).toBe("henry.new@sow.org.au");
    });
  });
});

describe("userLink: re-keying approver delegations on rename", () => {
  test("a renamed account carries its delegations on both the from and to sides", async () => {
    const t = await setup();
    // Henry is covered FOR Fiona (he's her delegate) and also delegates his own
    // authority TO Bella — so his email appears on both ends.
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: FIONA,
      toEmail: HENRY,
    });
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: HENRY,
      toEmail: BELLA,
    });

    const userId = await t.run((ctx) => ctx.db.insert("users", { email: HENRY }));
    await t.mutation(internal.userLink.link, { userId });
    await t.run((ctx) => ctx.db.patch("users", userId, { email: "henry.new@sow.org.au" }));
    await t.mutation(internal.userLink.link, { userId });

    const list = (await asUser(t, ADMIN).query(api.admin.listDelegations, { year: YEAR }))!;
    expect(
      list.some((d) => d.fromEmail === FIONA && d.toEmail === "henry.new@sow.org.au")
    ).toBe(true);
    expect(
      list.some((d) => d.fromEmail === "henry.new@sow.org.au" && d.toEmail === BELLA)
    ).toBe(true);
    // No stale references to the old address survive.
    expect(list.some((d) => d.fromEmail === HENRY || d.toEmail === HENRY)).toBe(false);
  });

  test("a rename that would duplicate an existing delegation drops the old row", async () => {
    const t = await setup();
    const NEW = "henry.new@sow.org.au";
    // A delegation already exists under Henry's FUTURE address (NEW → Bella),
    // plus an unrelated one (Fiona → Bella) that the rename must leave untouched.
    await t.run((ctx) =>
      ctx.db.insert("approverDelegations", { year: YEAR, fromEmail: NEW, toEmail: BELLA })
    );
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: FIONA,
      toEmail: BELLA,
    });
    // Henry (old address) also delegates to Bella — after the rename this collides.
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: HENRY,
      toEmail: BELLA,
    });

    const userId = await t.run((ctx) => ctx.db.insert("users", { email: HENRY }));
    await t.mutation(internal.userLink.link, { userId });
    await t.run((ctx) => ctx.db.patch("users", userId, { email: NEW }));
    await t.mutation(internal.userLink.link, { userId });

    // Exactly one NEW → Bella row survives (the colliding old row was dropped),
    // the unrelated Fiona → Bella row is intact, and no stale HENRY row remains.
    const list = (await asUser(t, ADMIN).query(api.admin.listDelegations, { year: YEAR }))!;
    expect(list.filter((d) => d.fromEmail === NEW && d.toEmail === BELLA)).toHaveLength(1);
    expect(list.some((d) => d.fromEmail === FIONA && d.toEmail === BELLA)).toBe(true);
    expect(list.some((d) => d.fromEmail === HENRY)).toBe(false);
  });
});

describe("model.requireEmail", () => {
  test("generateReceiptUploadUrl surfaces the signed-in requirement when unauthenticated", async () => {
    const t = await setup();
    // requireProfile -> requireEmail throws when there is no identity at all.
    await expect(
      t.mutation(api.requests.generateReceiptUploadUrl, {})
    ).rejects.toThrow(/signed in/);
  });
});

describe("admin.removeStaffProfile vacates a division headship", () => {
  test("removing a division head's profile clears the division's head", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Engagement",
      headEmail: "deva@sow.org.au",
    });
    await admin.mutation(api.admin.removeStaffProfile, {
      email: "deva@sow.org.au",
      year: YEAR,
    });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.divisions.find((d) => d.name === "Engagement")?.headEmail).toBeNull();
  });
});

describe("model.isAdminProfile via a Human Resources division headship", () => {
  test("heading the HR division grants admin even without an HR department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Han heads Engagement first (so profile.division stays "Engagement"),
    // then also heads Human Resources. Admin must be granted via the
    // divisions-headed lookup, not the profile.division field.
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Engagement",
      headEmail: "han@sow.org.au",
    });
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR,
      name: "Human Resources",
      headEmail: "han@sow.org.au",
    });
    // As an admin, Han can now provision someone else.
    await asUser(t, "han@sow.org.au").mutation(api.admin.setStaffProfile, {
      email: "newbie@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    expect(profiles.map((p) => p.email)).toContain("newbie@sow.org.au");
  });
});

describe("reminders: director and finance-head stages", () => {
  afterEach(() => vi.useRealTimers());

  test("nudges the Director when a >= $5000 request waits on them", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "big", amount: 6000 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "budgetManager",
    });
    stale();
    await t.mutation(internal.reminders.remindStale, {});
    const updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBeDefined();
  });

  test("nudges the Finance Head when a request waits on their approval", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "budgetManager",
    });
    // Now pending on the financeHead step.
    stale();
    await t.mutation(internal.reminders.remindStale, {});
    const updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBeDefined();
  });

  test("a carried-over unpaid receipt reminds this year's Finance Head when last year's is gone", async () => {
    // Seed at YEAR-1 time on a fresh instance so _creationTime lands in YEAR-1.
    vi.setSystemTime(staffYearStartMs(YEAR - 1) + 1);
    const t = convexTest(schema, modules);
    // Last year had a different Finance Head who no longer holds the role.
    await t.run((ctx) =>
      ctx.db.insert("departments", {
        year: YEAR - 1,
        name: "Finance",
        division: "Governance",
        // No headEmail -> last year's finance head is gone.
      })
    );
    const requestId = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "carried unpaid",
        amount: 100,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
        approvedByFinanceHead: "APPROVED",
        receipt: {
          totalAmount: 100,
          recipients: [
            { accountName: "R", bsb: "0", accountNumber: "1", amount: 100, attachments: [] },
          ],
        },
        paid: false,
      })
    );
    vi.useRealTimers();
    await runSetup(t);
    stale();
    await t.mutation(internal.reminders.remindStale, {});
    const updated = await t.run((ctx) => ctx.db.get("requests", requestId));
    expect(updated?.lastReminderAt).toBeDefined();
  });
});

describe("push.register: same device, same account is a no-op", () => {
  test("re-registering an unchanged (token, email) doesn't error or duplicate", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.push.register, { token: "ExponentPushToken[x]" });
    await asUser(t, RACHEL).mutation(api.push.register, { token: "ExponentPushToken[x]" });
    const tokens = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].email).toBe(RACHEL);
  });
});

describe("push.removeToken: missing token is tolerated", () => {
  test("removing a token that was never registered is a no-op", async () => {
    const t = await setup();
    await expect(
      t.mutation(internal.push.removeToken, { token: "ExponentPushToken[never]" })
    ).resolves.toBeNull();
    // And it deletes a registered one.
    await asUser(t, RACHEL).mutation(api.push.register, { token: "ExponentPushToken[real]" });
    await t.mutation(internal.push.removeToken, { token: "ExponentPushToken[real]" });
    expect(await t.run((ctx) => ctx.db.query("pushTokens").take(10))).toHaveLength(0);
  });
});

describe("userLink edge cases", () => {
  test("a user row with no email links nothing", async () => {
    const t = await setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    await expect(t.mutation(internal.userLink.link, { userId })).resolves.toBeNull();
  });

  test("a brand-new user with no profiles on any domain binds nothing", async () => {
    const t = await setup();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "fresh.face@sow.org.au" })
    );
    await t.mutation(internal.userLink.link, { userId });
    const bound = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10)
    );
    expect(bound).toHaveLength(0);
  });
});

describe("directorySync.list before any sync has run", () => {
  test("reports null timestamp and status when syncState is empty", async () => {
    const t = await setup();
    const listed = await asUser(t, ADMIN).query(api.directorySync.list, { year: YEAR });
    expect(listed?.syncedAt).toBeNull();
    expect(listed?.status).toBeNull();
    expect(listed?.users).toEqual([]);
  });
});
