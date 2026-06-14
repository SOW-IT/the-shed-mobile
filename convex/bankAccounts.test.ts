/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
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

const file = async (t: TestConvex<typeof schema>) => ({
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
  ]) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...a });
  }
  await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
  return t;
}

/** Submits a fully-approved request for Rachel and returns its id. */
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

describe("listMine", () => {
  test("null while auth attaches, empty when nothing saved", async () => {
    const t = await setup();
    expect(await t.query(api.bankAccounts.listMine, {})).toBeNull();
    expect(await asUser(t, RACHEL).query(api.bankAccounts.listMine, {})).toEqual([]);
  });
});

describe("auto-save on receipt submission", () => {
  test("remembers each recipient's account, deduped and most-recent-first", async () => {
    const t = await setup();
    const id = await approvedRequest(t, 300);
    const attachment = await file(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "Rachel", bsb: "111111", accountNumber: "12345678", amount: 200, attachments: [attachment] },
        { accountName: "Vendor", bsb: "222222", accountNumber: "87654321", amount: 100, attachments: [attachment] },
      ],
    });

    const saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(saved).toHaveLength(2);
    // Both recipients are saved (their order within one submission is just
    // insertion order — the lastUsedAt bump is exercised below).
    expect(saved.map((a) => a.accountName).sort()).toEqual(["Rachel", "Vendor"]);
    expect(saved.find((a) => a.accountName === "Rachel")).toMatchObject({
      bsb: "111111",
      accountNumber: "12345678",
    });

    // A second receipt reusing Rachel's account updates (not duplicates) it,
    // refreshing the name and bumping it to the top.
    const id2 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id2,
      recipients: [
        { accountName: "Rachel R", bsb: "111111", accountNumber: "12345678", amount: 50, attachments: [await file(t)] },
      ],
    });
    const after = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(after).toHaveLength(2); // still two, not three
    expect(after[0]).toMatchObject({ accountName: "Rachel R", accountNumber: "12345678" });

    // Saved accounts are private to their owner.
    expect(await asUser(t, BELLA).query(api.bankAccounts.listMine, {})).toEqual([]);
  });

  test("trims the account name before saving", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "  Padded  ", bsb: "0", accountNumber: "1", amount: 100, attachments: [await file(t)] },
      ],
    });
    const saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(saved[0].accountName).toBe("Padded");
    // A short account number is shown in full (no masking) by the client; the
    // stored value is exactly what was entered.
    expect(saved[0].accountNumber).toBe("1");
  });
});

describe("remove", () => {
  test("forgets the caller's own account but not someone else's", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "Rachel", bsb: "1", accountNumber: "2", amount: 100, attachments: [await file(t)] },
      ],
    });
    const saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    const accountId = saved[0].id;

    // Bella can't remove Rachel's account.
    await expect(
      asUser(t, BELLA).mutation(api.bankAccounts.remove, { id: accountId })
    ).rejects.toThrow(/your own saved accounts/);

    // An unauthenticated caller is rejected too.
    await expect(
      t.mutation(api.bankAccounts.remove, { id: accountId })
    ).rejects.toThrow(/signed in/);

    // Rachel can.
    await asUser(t, RACHEL).mutation(api.bankAccounts.remove, { id: accountId });
    expect(await asUser(t, RACHEL).query(api.bankAccounts.listMine, {})).toEqual([]);
  });
});
