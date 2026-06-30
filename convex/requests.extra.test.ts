/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { appUrl } from "./requests";
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

/** Submits and fully approves a request, returning its id. */
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
    // The dev deployment's SITE_URL is the dev web build...
    vi.stubEnv("SITE_URL", "https://the-shed-web-dev.vercel.app");
    // ...and a stale APP_URL pointing at prod must NOT override it (the bug).
    vi.stubEnv("APP_URL", "https://the-shed-web.vercel.app");
    expect(appUrl()).toBe("https://the-shed-web-dev.vercel.app");
    expect(appUrl("/review")).toBe("https://the-shed-web-dev.vercel.app/review");
  });

  test("falls back to APP_URL then the prod default when SITE_URL is unset or blank", () => {
    vi.stubEnv("SITE_URL", undefined);
    vi.stubEnv("APP_URL", "https://app.example.com");
    expect(appUrl("/x")).toBe("https://app.example.com/x");
    // A blank/whitespace SITE_URL is treated as unset (not a host-less link).
    vi.stubEnv("SITE_URL", "   ");
    expect(appUrl("/x")).toBe("https://app.example.com/x");
    vi.stubEnv("APP_URL", undefined);
    expect(appUrl("/y")).toBe("https://the-shed-web.vercel.app/y");
  });

  test("normalises a trailing slash so links never double up", () => {
    vi.stubEnv("SITE_URL", "https://the-shed-web-dev.vercel.app/");
    expect(appUrl("/review")).toBe("https://the-shed-web-dev.vercel.app/review");
    expect(appUrl()).toBe("https://the-shed-web-dev.vercel.app");
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

  test("a Head of Division with no resolvable department is asked to pick one", async () => {
    const t = await setup();
    // A division head whose division has no departments at all.
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
    // Finance staff get the list.
    expect(await asUser(t, BELLA).query(api.requests.allRequests, {})).toEqual([]);
  });
});

describe("requestsForExport", () => {
  /** Inserts a paid request for `email` in `year`. */
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
    // Seed before setup() so convex-test's monotonic _lastCreationTime guard
    // doesn't clamp past-year rows to the current real-time range.
    // Use a fresh convexTest instance seeded chronologically, then run setup.
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
    // Years outside [EARLIEST_REQUEST_YEAR, caller.year] are silently dropped.
    const rows = (await bella.query(api.requests.requestsForExport, {
      years: [YEAR + 1, YEAR, YEAR - 1, 2020],
    }))!;
    expect(rows.map((r) => r.description).sort()).toEqual([
      "last year",
      "this year",
    ]);

    // Only the requested year is returned; the other is excluded.
    const onlyThis = (await bella.query(api.requests.requestsForExport, {
      years: [YEAR],
    }))!;
    expect(onlyThis.map((r) => r.description)).toEqual(["this year"]);

    // No years selected -> empty export.
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
    // Someone else can't cancel it.
    await expect(
      asUser(t, HENRY).mutation(api.requests.cancel, { requestId: request._id })
    ).rejects.toThrow(/only cancel your own/);
    // Decline it -> completed -> the requester can no longer cancel.
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
    // Gone, with its events.
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
    // Seed the request at YEAR-2 _creationTime BEFORE setup() so convex-test's
    // monotonic guard doesn't clamp it to the current real-time range.
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
    // Now run admin setup so HENRY has a profile to look up.
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
    // Give Henry a directory name (no staff-profile name) to exercise the
    // directory fallback in resolveApproverName.
    await t.run((ctx) => ctx.db.insert("directoryUsers", { email: HENRY, name: "Henry H" }));
    const id = await approvedRequest(t);

    const hod = (await asUser(t, RACHEL).query(api.requests.stepInfo, {
      requestId: id,
      step: "hod",
    }))!;
    expect(hod.email).toBe(HENRY);
    expect(hod.name).toBe("Henry H");
    expect(hod.events.map((e) => e.action)).toContain("approved");

    // The Director step carries the org's Director, but a small request never
    // routed to them, so no director events were recorded.
    const director = (await asUser(t, RACHEL).query(api.requests.stepInfo, {
      requestId: id,
      step: "director",
    }))!;
    expect(director.email).toBe(DAN);
    expect(director.events).toHaveLength(0);

    // Unauthenticated -> null; unknown request -> null.
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
    // The Director step carries the org's Director, but it never actioned a
    // small request -> an email, but no action time.
    expect(actors.director.email).toBe(DAN);
    expect(actors.director.actedAt).toBeNull();

    // Unauthenticated -> null.
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

    // Not the requester.
    await expect(
      asUser(t, HENRY).mutation(api.requests.submitReceipt, {
        requestId: id,
        recipients: [
          { accountName: "H", bsb: "0", accountNumber: "1", amount: 90, attachments: [file] },
        ],
      })
    ).rejects.toThrow(/your own requests/);

    // Empty recipients list.
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submitReceipt, { requestId: id, recipients: [] })
    ).rejects.toThrow(/at least one recipient/);

    // A second submission after a valid one.
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
    // Henry (Marketing HOD, not Finance, not requester) -> null.
    expect(
      await asUser(t, HENRY).query(api.requests.receiptAttachments, { requestId: id })
    ).toBeNull();
    // The requester sees them.
    const mine = await asUser(t, RACHEL).query(api.requests.receiptAttachments, {
      requestId: id,
    });
    expect(mine).toHaveLength(1);
    // Unauthenticated -> null.
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
    // Seed the foreign-year request BEFORE setup() so convex-test's monotonic
    // _lastCreationTime guard doesn't clamp it to the current real-time range.
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
    // Run admin setup with the real clock on the same instance.
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

    // Non-positive amount.
    await expect(
      asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 0 })
    ).rejects.toThrow(/positive number/);

    // Awaiting receipt, not payment.
    await expect(
      asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 90 })
    ).rejects.toThrow(/not awaiting payment/);

    // Submit the receipt, then a non-Finance-Head tries to pay.
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

    // A foreign-year request (YEAR-2) reports not found.
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
    // Pay less than requested -> the differing-amount notification branch.
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

    // Add a comment with reaction and a read marker so we can verify cleanup.
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

    // Request is gone.
    expect(await asUser(t, RACHEL).query(api.requests.get, { requestId: id })).toBeNull();
    // All related records cleaned up (scoped to this request/comment).
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

    // Another user can't delete it.
    await expect(
      asUser(t, HENRY).mutation(api.requests.deleteDeclined, { requestId: id })
    ).rejects.toThrow(/your own requests/);

    // Can't delete a non-declined request.
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
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

  /** Builds a paid request with one receipt file, returning its id + storageId. */
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

  test("purges files of requests paid over a year ago, keeping the record", async () => {
    const t = await setup();
    const { id, storageId } = await paidRequestWithFile(t);
    // Backdate payment to just over a year ago.
    await t.run((ctx) =>
      ctx.db.patch("requests", id, { paidTime: Date.now() - ONE_YEAR_MS - 1000 })
    );

    await t.mutation(internal.cleanup.purgeOldReceiptFiles, {});

    // The stored blob is gone...
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
    // ...but the attachment record survives, flagged deleted, with its name.
    const request = (await t.run((ctx) => ctx.db.get("requests", id)))!;
    const attachment = request.receipt!.recipients[0].attachments![0];
    expect(attachment.deleted).toBe(true);
    expect(attachment.name).toBe("receipt.pdf");

    // The query surfaces the file with no link so history still shows it.
    const receipts = (await asUser(t, RACHEL).query(api.requests.receiptAttachments, {
      requestId: id,
    }))!;
    expect(receipts[0].attachments[0]).toMatchObject({
      name: "receipt.pdf",
      deleted: true,
      url: null,
    });
  });

  test("leaves files of requests paid within the last year untouched", async () => {
    const t = await setup();
    const { id, storageId } = await paidRequestWithFile(t);
    // Paid time is "now" (recent), so it must be kept.

    await t.mutation(internal.cleanup.purgeOldReceiptFiles, {});

    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
    const request = (await t.run((ctx) => ctx.db.get("requests", id)))!;
    expect(request.receipt!.recipients[0].attachments![0].deleted).toBeUndefined();
  });

  test("is idempotent — a second run does not error on already-purged files", async () => {
    const t = await setup();
    const { id } = await paidRequestWithFile(t);
    await t.run((ctx) =>
      ctx.db.patch("requests", id, { paidTime: Date.now() - ONE_YEAR_MS - 1000 })
    );
    await t.mutation(internal.cleanup.purgeOldReceiptFiles, {});
    await t.mutation(internal.cleanup.purgeOldReceiptFiles, {});
    const request = (await t.run((ctx) => ctx.db.get("requests", id)))!;
    expect(request.receipt!.recipients[0].attachments![0].deleted).toBe(true);
  });
});

describe("importHistory.personHistory", () => {
  test("follows a person across emails via importId, sorted by year", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "old@gmail.com",
        year: YEAR - 2,
        assignments: [
          { role: "Student Leader", university: "University of Sydney" },
        ],
        importId: "uid-1",
      });
      await ctx.db.insert("staffProfiles", {
        email: "new@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Marketing" }],
        importId: "uid-1",
      });
    });
    const history = await t.query(internal.importHistory.personHistory, {
      email: "new@sow.org.au",
    });
    expect(history.map((h) => h.year)).toEqual([YEAR - 2, YEAR]);
    expect(history[0].university).toBe("University of Sydney");
    expect(history[1].department).toBe("Marketing");
  });
});

describe("browsing past years", () => {
  /**
   * Inserts a fully-paid historical request at the given year's _creationTime.
   * Must be called before setup() on a fresh convexTest instance (or
   * chronologically after any prior inserts) so convex-test's monotonically
   * increasing _lastCreationTime guard doesn't clamp to the wrong year.
   */
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

  /**
   * Creates a convexTest instance, seeds historical requests at the given years
   * (chronologically), then runs the standard admin setup.
   * The historical seeds must happen before setup() so convex-test's monotonic
   * _lastCreationTime doesn't clamp them to the current real time.
   */
  async function setupWithHistory(
    seeds: { email: string; year: number; description: string }[]
  ) {
    const t = convexTest(schema, modules);
    // Seed historical rows in chronological order (oldest first).
    const sorted = [...seeds].sort((a, b) => a.year - b.year);
    for (const s of sorted) {
      await seedPastRequest(t, s.email, s.year, s.description);
    }
    // Now run the standard admin setup with the real clock.
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

    // Both past-year rows, sorted newest-first (the later insert wins).
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
    expect(years.mine).toEqual([YEAR, YEAR - 2]); // newest-first, deduped
  });

  test("requestYears never offers years before 2021, even with older org data", async () => {
    const t = await setup();
    // An old division exists (org history goes back to 2008) but no requests can.
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
});
