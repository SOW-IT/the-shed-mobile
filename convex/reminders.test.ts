/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const RACHEL = "rachel@sow.org.au";
const HENRY = "henry@sow.org.au";
const BELLA = "bella@sow.org.au";
const FIONA = "fiona@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const canNudgeNow = async (
  t: TestConvex<typeof schema>,
  email: string,
  requestId: Awaited<ReturnType<typeof pendingRequest>>
) => {
  const s = await asUser(t, email).query(api.requests.canNudge, { requestId });
  return s !== null && !s.onCooldown;
};

const storedReceipt = async (t: TestConvex<typeof schema>) => ({
  storageId: await t.run((ctx) =>
    ctx.storage.store(new Blob(["receipt"], { type: "application/pdf" }))
  ),
  name: "receipt.pdf",
});

const advanceDays = (days: number) => {
  vi.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
  vi.setSystemTime(Date.now() + days * 24 * 60 * 60 * 1000);
};

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
  ]) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...a });
  }
  await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
  return t;
}

async function pendingRequest(t: TestConvex<typeof schema>) {
  await asUser(t, RACHEL).mutation(api.requests.submit, {
    description: "test",
    amount: 100,
  });
  const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
  return request._id;
}

async function approveRequest(t: TestConvex<typeof schema>, id: Awaited<ReturnType<typeof pendingRequest>>) {
  await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
  await asUser(t, BELLA).mutation(api.requests.approve, { requestId: id, step: "budgetManager" });
  await asUser(t, FIONA).mutation(api.requests.approve, { requestId: id, step: "financeHead" });
}

async function submitReceipt(t: TestConvex<typeof schema>, id: Awaited<ReturnType<typeof pendingRequest>>) {
  const file = await storedReceipt(t);
  await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
    requestId: id,
    recipients: [
      { accountName: "R", bsb: "062000", accountNumber: "12345678", amount: 100, attachments: [file] },
    ],
  });
}

async function completeRequest(t: TestConvex<typeof schema>, id: Awaited<ReturnType<typeof pendingRequest>>) {
  await submitReceipt(t, id);
  await asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 100 });
}

const notificationTitles = async (t: TestConvex<typeof schema>, email: string) =>
  (
    await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userEmail", email))
        .collect()
    )
  ).map((n) => n.title);

describe("stale reminder schedule", () => {
  afterEach(() => vi.useRealTimers());

  test("no reminder fires before 1 day has passed", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    await t.mutation(internal.reminders.remindStale, {});

    const request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount ?? 0).toBe(0);
    expect(request?.lastReminderAt).toBeUndefined();
  });

  test("1st reminder fires after 1 day of no movement", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});

    const request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(1);
    expect(request?.lastReminderAt).toBeGreaterThan(0);
  });

  test("2nd reminder does not fire 1 day after the 1st (needs 3 days)", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});

    advanceDays(1);
    await t.mutation(internal.reminders.remindStale, {});

    const request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(1);
  });

  test("2nd reminder fires 3 days after the 1st", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});

    advanceDays(3.1);
    await t.mutation(internal.reminders.remindStale, {});

    const request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(2);
  });

  test("3rd+ reminders fire every 7 days", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});
    advanceDays(3.1);
    await t.mutation(internal.reminders.remindStale, {});

    advanceDays(6);
    await t.mutation(internal.reminders.remindStale, {});
    let request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(2);

    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});
    request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(3);
  });

  test("advancing a step resets the tier: the next approver is reminded after 1 day, not 7", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});
    advanceDays(3.1);
    await t.mutation(internal.reminders.remindStale, {});
    advanceDays(7.1);
    await t.mutation(internal.reminders.remindStale, {});
    let request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(3);

    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });

    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});
    request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(1);
  });

  test("a step that has not moved keeps its weekly tier (no spurious reset)", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});
    advanceDays(3.1);
    await t.mutation(internal.reminders.remindStale, {});
    advanceDays(7.1);
    await t.mutation(internal.reminders.remindStale, {});

    advanceDays(1);
    await t.mutation(internal.reminders.remindStale, {});
    const request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(3);
  });

  test("completed requests are never reminded", async () => {
    const t = await setup();
    const id = await pendingRequest(t);
    await approveRequest(t, id);
    await completeRequest(t, id);

    advanceDays(8);
    await t.mutation(internal.reminders.remindStale, {});

    const request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount ?? 0).toBe(0);
  });

  test("a request awaiting payment nudges the Finance Head", async () => {
    const t = await setup();
    const id = await pendingRequest(t);
    await approveRequest(t, id);
    await submitReceipt(t, id);

    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});

    const request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(1);
    expect(await notificationTitles(t, FIONA)).toContain("Request reminder");
  });

  test("nobody is nudged for payment when the year has no Finance Head", async () => {
    const t = await setup();
    const id = await pendingRequest(t);
    await approveRequest(t, id);
    await submitReceipt(t, id);
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Finance",
      division: "Governance",
    });

    advanceDays(8);
    await t.mutation(internal.reminders.remindStale, {});

    const request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount ?? 0).toBe(0);
    expect(request?.lastReminderAt).toBeUndefined();
  });
});

describe("nudge", () => {
  afterEach(() => vi.useRealTimers());

  test("requester can nudge a pending request", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    await asUser(t, RACHEL).mutation(api.requests.nudge, { requestId: id });

    const nudges = await t.run((ctx) =>
      ctx.db
        .query("requestNudges")
        .withIndex("by_request", (q) => q.eq("requestId", id))
        .collect()
    );
    expect(nudges).toHaveLength(1);
    expect(nudges[0].nudgerEmail).toBe(RACHEL);
  });

  test("canNudge is true initially, false after nudging", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    expect(await canNudgeNow(t, RACHEL, id)).toBe(true);

    await asUser(t, RACHEL).mutation(api.requests.nudge, { requestId: id });

    expect(await canNudgeNow(t, RACHEL, id)).toBe(false);
  });

  test("different users can each nudge independently within the same day", async () => {
    const t = await setup();
    const id = await pendingRequest(t);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
    await asUser(t, RACHEL).mutation(api.requests.nudge, { requestId: id });
    await asUser(t, HENRY).mutation(api.requests.nudge, { requestId: id });

    const nudges = await t.run((ctx) =>
      ctx.db
        .query("requestNudges")
        .withIndex("by_request", (q) => q.eq("requestId", id))
        .collect()
    );
    expect(nudges).toHaveLength(2);
  });

  test("same user cannot nudge twice within 24 hours", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    await asUser(t, RACHEL).mutation(api.requests.nudge, { requestId: id });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.nudge, { requestId: id })
    ).rejects.toThrow(/already nudged/);
  });

  test("same user can nudge again after 24 hours", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    await asUser(t, RACHEL).mutation(api.requests.nudge, { requestId: id });

    advanceDays(1.1);
    await asUser(t, RACHEL).mutation(api.requests.nudge, { requestId: id });

    const nudges = await t.run((ctx) =>
      ctx.db
        .query("requestNudges")
        .withIndex("by_request", (q) => q.eq("requestId", id))
        .collect()
    );
    expect(nudges).toHaveLength(2);
  });

  test("cannot nudge a completed request", async () => {
    const t = await setup();
    const id = await pendingRequest(t);
    await approveRequest(t, id);
    await completeRequest(t, id);

    await expect(
      asUser(t, RACHEL).mutation(api.requests.nudge, { requestId: id })
    ).rejects.toThrow(/already completed/);
  });

  test("cannot nudge when you are the current action owner", async () => {
    const t = await setup();
    const id = await pendingRequest(t);
    await expect(
      asUser(t, HENRY).mutation(api.requests.nudge, { requestId: id })
    ).rejects.toThrow(/waiting on you/);
  });

  test("a profiled non-participant cannot nudge", async () => {
    const t = await setup();
    const id = await pendingRequest(t);
    expect(await asUser(t, BELLA).query(api.requests.canNudge, { requestId: id })).toBeNull();
    await expect(
      asUser(t, BELLA).mutation(api.requests.nudge, { requestId: id })
    ).rejects.toThrow(/requester or an approver/);
  });

  test("canNudge returns false for a completed request", async () => {
    const t = await setup();
    const id = await pendingRequest(t);
    await approveRequest(t, id);
    await completeRequest(t, id);

    expect(await canNudgeNow(t, RACHEL, id)).toBe(false);
  });
});
