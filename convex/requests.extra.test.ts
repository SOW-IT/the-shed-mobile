/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
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

  test("uses APP_URL when set, otherwise the hosted default, and appends paths", () => {
    vi.stubEnv("APP_URL", "https://app.example.com");
    expect(appUrl()).toBe("https://app.example.com");
    expect(appUrl("/review")).toBe("https://app.example.com/review");
    // Unset (not empty) -> the `??` default applies.
    vi.stubEnv("APP_URL", undefined);
    expect(appUrl("/x")).toBe("https://the-shed-web.vercel.app/x");
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
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: request._id });
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
  test("a missing/foreign-year request reports not found", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    // Move it two years back so it falls outside the caller's window.
    await t.run((ctx) => ctx.db.patch("requests", request._id, { year: YEAR - 2 }));
    await expect(
      asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" })
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
    const t = await setup();
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

    // A foreign-year request reports not found.
    await t.run((ctx) => ctx.db.patch("requests", id, { year: YEAR - 2 }));
    await expect(
      asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 90 })
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
  const storedFile = async (t: TestConvex<typeof schema>) => ({
    storageId: await t.run((ctx) =>
      ctx.storage.store(new Blob(["r"], { type: "application/pdf" }))
    ),
    name: "r.pdf",
  });

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

    await asUser(t, RACHEL).mutation(api.requests.deleteDeclined, { requestId: id });

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

describe("editRequest", () => {
  test("requester can fix description and amount while HOD is still pending", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "typo", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(request.approvedByHOD).toBe("PENDING");

    await asUser(t, RACHEL).mutation(api.requests.editRequest, {
      requestId: request._id,
      description: "corrected",
      amount: 200,
    });

    const [updated] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(updated.description).toBe("corrected");
    expect(updated.amount).toBe(200);
    expect(updated.approvedByDirector).toBeUndefined(); // still under threshold
  });

  test("cannot edit after HOD has approved", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });

    await expect(
      asUser(t, RACHEL).mutation(api.requests.editRequest, {
        requestId: request._id,
        description: "too late",
        amount: 150,
      })
    ).rejects.toThrow(/before the HOD approves/);
  });

  test("cannot edit another user's request", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;

    await expect(
      asUser(t, BELLA).mutation(api.requests.editRequest, {
        requestId: request._id,
        description: "hacked",
        amount: 999,
      })
    ).rejects.toThrow(/your own requests/);
  });

  test("editing amount from below to above threshold adds the director step", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(request.approvedByDirector).toBeUndefined();

    await asUser(t, RACHEL).mutation(api.requests.editRequest, {
      requestId: request._id,
      description: "x",
      amount: 5000,
    });

    const [updated] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(updated.amount).toBe(5000);
    expect(updated.approvedByDirector).toBe("PENDING");
  });

  test("editing amount from above to below threshold removes the director step", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 5000 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(request.approvedByDirector).toBe("PENDING");

    await asUser(t, RACHEL).mutation(api.requests.editRequest, {
      requestId: request._id,
      description: "x",
      amount: 100,
    });

    const [updated] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(updated.amount).toBe(100);
    expect(updated.approvedByDirector).toBeUndefined();
  });

  test("rejects blank description and non-positive amount", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;

    await expect(
      asUser(t, RACHEL).mutation(api.requests.editRequest, {
        requestId: request._id,
        description: "   ",
        amount: 100,
      })
    ).rejects.toThrow(/describe what the request is for/);

    await expect(
      asUser(t, RACHEL).mutation(api.requests.editRequest, {
        requestId: request._id,
        description: "valid",
        amount: 0,
      })
    ).rejects.toThrow(/positive number/);
  });
});

describe("importHistory.personHistory", () => {
  test("follows a person across emails via importId, sorted by year", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "old@gmail.com",
        year: YEAR - 2,
        roles: ["Student Leader"],
        university: "University of Sydney",
        importId: "uid-1",
      });
      await ctx.db.insert("staffProfiles", {
        email: "new@sow.org.au",
        year: YEAR,
        roles: ["Staff"],
        department: "Marketing",
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
