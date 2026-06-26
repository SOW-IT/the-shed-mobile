/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const RACHEL = "rachel@sow.org.au"; // Marketing staff
const HENRY = "henry@sow.org.au"; // Marketing HOD
const BELLA = "bella@sow.org.au"; // Finance staff, Budget Manager
const FIONA = "fiona@sow.org.au"; // Finance head

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

/** canNudge returns null (ineligible) or { onCooldown, remainingMs }; this
 *  collapses it back to "can the user nudge right now?". */
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

/** Advance the fake clock by `days` days from now. */
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

/** Submits a request and returns its id (pending HOD approval). */
async function pendingRequest(t: TestConvex<typeof schema>) {
  await asUser(t, RACHEL).mutation(api.requests.submit, {
    description: "test",
    amount: 100,
  });
  const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
  return request._id;
}

/** Fully approves a pending request. */
async function approveRequest(t: TestConvex<typeof schema>, id: Awaited<ReturnType<typeof pendingRequest>>) {
  await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
  await asUser(t, BELLA).mutation(api.requests.approve, { requestId: id, step: "budgetManager" });
  await asUser(t, FIONA).mutation(api.requests.approve, { requestId: id, step: "financeHead" });
}

/** Submits a receipt for an approved request and pays it (completing it). */
async function completeRequest(t: TestConvex<typeof schema>, id: Awaited<ReturnType<typeof pendingRequest>>) {
  const file = await storedReceipt(t);
  await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
    requestId: id,
    recipients: [
      { accountName: "R", bsb: "062000", accountNumber: "12345678", amount: 100, attachments: [file] },
    ],
  });
  await asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 100 });
}

describe("stale reminder schedule", () => {
  afterEach(() => vi.useRealTimers());

  test("no reminder fires before 1 day has passed", async () => {
    const t = await setup();
    const id = await pendingRequest(t);

    // Run cron immediately (< 1 day since submission).
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

    // Fire the 1st reminder.
    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});

    // 1 more day later — not enough for the 2nd (needs 3 days from 1st).
    advanceDays(1);
    await t.mutation(internal.reminders.remindStale, {});

    const request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(1); // still only 1
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

    // Fire 1st (after 1 day) and 2nd (3 days after 1st).
    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});
    advanceDays(3.1);
    await t.mutation(internal.reminders.remindStale, {});

    // 6 days after 2nd reminder — too soon.
    advanceDays(6);
    await t.mutation(internal.reminders.remindStale, {});
    let request = await t.run((ctx) => ctx.db.get("requests", id));
    expect(request?.reminderCount).toBe(2);

    // 7+ days after 2nd reminder — fires.
    advanceDays(1.1);
    await t.mutation(internal.reminders.remindStale, {});
    request = await t.run((ctx) => ctx.db.get("requests", id));
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
    expect(request?.reminderCount ?? 0).toBe(0); // untouched
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
    // HENRY is the HOD (current action owner) — he can't nudge himself.
    // Use RACHEL and BELLA (already-approved BM would need a different scenario).
    // Here RACHEL is the requester. Let's add someone who has already approved.
    // Approve HOD first, now waiting on BM (BELLA). HENRY and RACHEL can both nudge.
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
    // HENRY is the HOD — the request is currently waiting on him.
    await expect(
      asUser(t, HENRY).mutation(api.requests.nudge, { requestId: id })
    ).rejects.toThrow(/waiting on you/);
  });

  test("a profiled non-participant cannot nudge", async () => {
    const t = await setup();
    const id = await pendingRequest(t);
    // Request is waiting on HENRY (HOD). BELLA (Budget Manager) hasn't approved
    // yet and isn't the requester, so she's not a participant who may nudge.
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
