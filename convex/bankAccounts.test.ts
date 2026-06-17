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

describe("setPreferred", () => {
  test("marks one account preferred and clears the others, rejects non-owner", async () => {
    const t = await setup();
    // Save two accounts via two receipt submissions.
    const id1 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id1,
      recipients: [{ accountName: "Rachel A", bsb: "1", accountNumber: "11", amount: 50, attachments: [await file(t)] }],
    });
    const id2 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id2,
      recipients: [{ accountName: "Rachel B", bsb: "2", accountNumber: "22", amount: 50, attachments: [await file(t)] }],
    });

    const accounts = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(accounts).toHaveLength(2);
    // With two accounts and no explicit preferred, the first (most-recent) is implicitly preferred.
    expect(accounts[0].preferred).toBe(true);
    expect(accounts[1].preferred).toBe(false);

    // Explicitly set the second one as preferred.
    await asUser(t, RACHEL).mutation(api.bankAccounts.setPreferred, { id: accounts[1].id });
    const after = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(after.find((a) => a.id === accounts[1].id)!.preferred).toBe(true);
    expect(after.find((a) => a.id === accounts[0].id)!.preferred).toBe(false);

    // Another user can't set Rachel's account.
    await expect(
      asUser(t, BELLA).mutation(api.bankAccounts.setPreferred, { id: accounts[0].id })
    ).rejects.toThrow(/your own saved accounts/);
  });
});

describe("updateAccount", () => {
  test("edits name, BSB and account number of own account", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "Rachel", bsb: "111111", accountNumber: "12345678", amount: 100, attachments: [await file(t)] },
      ],
    });
    const [account] = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;

    await asUser(t, RACHEL).mutation(api.bankAccounts.updateAccount, {
      id: account.id,
      accountName: "  Rachel Updated  ",
      bsb: "222222",
      accountNumber: "99999999",
    });

    const [updated] = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(updated.accountName).toBe("Rachel Updated"); // trimmed
    expect(updated.bsb).toBe("222222");
    expect(updated.accountNumber).toBe("99999999");
  });

  test("rejects another user updating someone else's account", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "Rachel", bsb: "1", accountNumber: "2", amount: 100, attachments: [await file(t)] },
      ],
    });
    const [account] = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    await expect(
      asUser(t, BELLA).mutation(api.bankAccounts.updateAccount, {
        id: account.id,
        accountName: "Hacked",
        bsb: "0",
        accountNumber: "0",
      })
    ).rejects.toThrow(/your own saved accounts/);
  });

  test("rejects changing to BSB/account-number already owned by another saved account", async () => {
    const t = await setup();
    const id1 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id1,
      recipients: [{ accountName: "Rachel A", bsb: "111111", accountNumber: "11111111", amount: 50, attachments: [await file(t)] }],
    });
    const id2 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id2,
      recipients: [{ accountName: "Rachel B", bsb: "222222", accountNumber: "22222222", amount: 50, attachments: [await file(t)] }],
    });
    const accounts = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    const accountB = accounts.find((a) => a.accountName === "Rachel B")!;
    await expect(
      asUser(t, RACHEL).mutation(api.bankAccounts.updateAccount, {
        id: accountB.id,
        accountName: "Rachel B renamed",
        bsb: "111111",
        accountNumber: "11111111",
      })
    ).rejects.toThrow(/already have a saved account with those details/);
  });

  test("rejects blank fields", async () => {
    const t = await setup();
    const id = await approvedRequest(t);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "Rachel", bsb: "1", accountNumber: "2", amount: 100, attachments: [await file(t)] },
      ],
    });
    const [account] = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    await expect(
      asUser(t, RACHEL).mutation(api.bankAccounts.updateAccount, {
        id: account.id,
        accountName: "   ",
        bsb: "1",
        accountNumber: "2",
      })
    ).rejects.toThrow(/Account name is required/);
    await expect(
      asUser(t, RACHEL).mutation(api.bankAccounts.updateAccount, {
        id: account.id,
        accountName: "Rachel",
        bsb: "   ",
        accountNumber: "2",
      })
    ).rejects.toThrow(/BSB is required/);
    await expect(
      asUser(t, RACHEL).mutation(api.bankAccounts.updateAccount, {
        id: account.id,
        accountName: "Rachel",
        bsb: "1",
        accountNumber: "   ",
      })
    ).rejects.toThrow(/Account number is required/);
  });
});

describe("addAccount", () => {
  test("adds a new account, trims the name, and marks it preferred", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
      accountName: "  Rachel  ",
      bsb: "111111",
      accountNumber: "12345678",
    });
    const saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      accountName: "Rachel", // trimmed
      bsb: "111111",
      accountNumber: "12345678",
      preferred: true,
    });
  });

  test("rejects an unauthenticated caller and blank fields", async () => {
    const t = await setup();
    await expect(
      t.mutation(api.bankAccounts.addAccount, {
        accountName: "Rachel",
        bsb: "1",
        accountNumber: "2",
      })
    ).rejects.toThrow(/signed in/);
    await expect(
      asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
        accountName: "   ",
        bsb: "1",
        accountNumber: "2",
      })
    ).rejects.toThrow(/Account name is required/);
    await expect(
      asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
        accountName: "Rachel",
        bsb: "   ",
        accountNumber: "2",
      })
    ).rejects.toThrow(/BSB is required/);
    await expect(
      asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
        accountName: "Rachel",
        bsb: "1",
        accountNumber: "   ",
      })
    ).rejects.toThrow(/Account number is required/);
  });

  test("defaults to non-preferred; only re-prefers when makePreferred is set", async () => {
    const t = await setup();
    // First account, explicitly made preferred (auto-fill).
    await asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
      accountName: "X",
      bsb: "111111",
      accountNumber: "11111111",
      makePreferred: true,
    });
    // Second account added without ticking "make preferred" — saved as an
    // "other" account, leaving X as the preferred one.
    await asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
      accountName: "Y",
      bsb: "222222",
      accountNumber: "22222222",
    });
    let saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(saved).toHaveLength(2);
    expect(saved.find((a) => a.accountName === "X")!.preferred).toBe(true);
    expect(saved.find((a) => a.accountName === "Y")!.preferred).toBe(false);

    // Adding Z with makePreferred makes it the new auto-fill account, clearing X.
    await asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
      accountName: "Z",
      bsb: "333333",
      accountNumber: "33333333",
      makePreferred: true,
    });
    saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(saved).toHaveLength(3);
    expect(saved.find((a) => a.accountName === "Z")!.preferred).toBe(true);
    expect(saved.find((a) => a.accountName === "X")!.preferred).toBe(false);
    expect(saved.find((a) => a.accountName === "Y")!.preferred).toBe(false);
  });

  test("adding without opting in keeps the current (implicit) preferred account", async () => {
    const t = await setup();
    // Two accounts saved via receipts — neither is explicitly preferred, so the
    // most-recently-used (B) is the effective preferred via listMine's fallback.
    const id1 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id1,
      recipients: [{ accountName: "A", bsb: "1", accountNumber: "11", amount: 50, attachments: [await file(t)] }],
    });
    const id2 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id2,
      recipients: [{ accountName: "B", bsb: "2", accountNumber: "22", amount: 50, attachments: [await file(t)] }],
    });
    let saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(saved.find((a) => a.accountName === "B")!.preferred).toBe(true); // implicit

    // Add a third account WITHOUT opting in: it must not steal the preferred slot.
    await asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
      accountName: "C",
      bsb: "3",
      accountNumber: "33",
    });
    saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(saved).toHaveLength(3);
    expect(saved.find((a) => a.accountName === "C")!.preferred).toBe(false);
    expect(saved.find((a) => a.accountName === "B")!.preferred).toBe(true);
  });

  test("de-dupes onto an existing account by BSB + number and re-prefers it", async () => {
    const t = await setup();
    // Two distinct accounts; the second added becomes preferred.
    await asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
      accountName: "X",
      bsb: "111111",
      accountNumber: "11111111",
    });
    await asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
      accountName: "Y",
      bsb: "222222",
      accountNumber: "22222222",
      makePreferred: true,
    });
    let saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(saved).toHaveLength(2);
    expect(saved.find((a) => a.accountName === "Y")!.preferred).toBe(true);
    expect(saved.find((a) => a.accountName === "X")!.preferred).toBe(false);

    // Re-adding X's BSB + number with makePreferred updates that row in place
    // (no duplicate) and makes it preferred again, clearing Y.
    await asUser(t, RACHEL).mutation(api.bankAccounts.addAccount, {
      accountName: "X renamed",
      bsb: "111111",
      accountNumber: "11111111",
      makePreferred: true,
    });
    saved = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(saved).toHaveLength(2); // still two, not three
    const x = saved.find((a) => a.accountNumber === "11111111")!;
    expect(x.accountName).toBe("X renamed");
    expect(x.preferred).toBe(true);
    expect(saved.find((a) => a.accountName === "Y")!.preferred).toBe(false);
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

  test("deleting the preferred account promotes the next most-recently-used", async () => {
    const t = await setup();
    // Save three accounts so the sort comparator runs after deletion.
    const id1 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id1,
      recipients: [{ accountName: "A", bsb: "1", accountNumber: "11", amount: 50, attachments: [await file(t)] }],
    });
    const id2 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id2,
      recipients: [{ accountName: "B", bsb: "2", accountNumber: "22", amount: 50, attachments: [await file(t)] }],
    });
    const id3 = await approvedRequest(t, 50);
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id3,
      recipients: [{ accountName: "C", bsb: "3", accountNumber: "33", amount: 50, attachments: [await file(t)] }],
    });

    const accounts = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(accounts).toHaveLength(3);
    // Explicitly prefer account A (the oldest, last in the sorted list).
    const accountA = accounts.find((a) => a.accountName === "A")!;
    await asUser(t, RACHEL).mutation(api.bankAccounts.setPreferred, { id: accountA.id });

    // Delete the preferred account — the most-recently-used of the remaining (C) should be promoted.
    await asUser(t, RACHEL).mutation(api.bankAccounts.remove, { id: accountA.id });
    const remaining = (await asUser(t, RACHEL).query(api.bankAccounts.listMine, {}))!;
    expect(remaining).toHaveLength(2);
    expect(remaining[0].accountName).toBe("C"); // most-recently-used
    expect(remaining[0].preferred).toBe(true);
    expect(remaining[1].preferred).toBe(false);
  });
});
