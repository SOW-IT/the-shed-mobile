/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { involvedApproverEmails, nextApproverEmail, nextApproverWithYear } from "./requests";
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
  const assignments: { email: string; roles: string[]; department?: string }[] = [
    { email: RACHEL, roles: ["Staff"], department: "Marketing" },
    { email: BELLA, roles: ["Staff"], department: "Finance" },
    { email: DAN, roles: ["Director"] },
  ];
  for (const a of assignments) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, email: a.email, roles: a.roles, department: a.department });
  }
  await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
  return t;
}

describe("submission auto-approval (REQUESTS_FLOW auto-approval table)", () => {
  test("a staff request starts fully pending, with Director only at >= $5000", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "small", amount: 200 });
    await rachel.mutation(api.requests.submit, { description: "big", amount: 5000 });
    const [small, big] = ((await rachel.query(api.requests.myRequests, {}))!).sort(
      (a, b) => a.amount - b.amount
    );
    expect(small.approvedByHOD).toBe("PENDING");
    expect(small.approvedByDirector).toBeUndefined();
    expect(big.approvedByDirector).toBe("PENDING");
  });

  test("an HOD's own request skips the HOD step", async () => {
    const t = await setup();
    const henry = asUser(t, HENRY);
    await henry.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await henry.query(api.requests.myRequests, {}))!;
    expect(request.approvedByHOD).toBe("APPROVED");
    expect(request.approvedByBudgetManager).toBe("PENDING");
  });

  test("the Budget Manager's own request skips HOD (Finance) and Budget Manager", async () => {
    const t = await setup();
    const bella = asUser(t, BELLA);
    await bella.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await bella.query(api.requests.myRequests, {}))!;
    expect(request.approvedByHOD).toBe("APPROVED");
    expect(request.approvedByBudgetManager).toBe("APPROVED");
    expect(request.approvedByFinanceHead).toBe("PENDING");
  });

  test("the Finance Head's own request skips everything except Director", async () => {
    const t = await setup();
    const fiona = asUser(t, FIONA);
    await fiona.mutation(api.requests.submit, { description: "x", amount: 9000 });
    const [request] = (await fiona.query(api.requests.myRequests, {}))!;
    expect(request.approvedByHOD).toBe("APPROVED");
    expect(request.approvedByBudgetManager).toBe("APPROVED");
    expect(request.approvedByFinanceHead).toBe("APPROVED");
    expect(request.approvedByDirector).toBe("PENDING");
  });

  test("the Director's own >= $5000 request skips HOD and Director steps", async () => {
    const t = await setup();
    const dan = asUser(t, DAN);
    await dan.mutation(api.requests.submit, { description: "x", amount: 6000, department: "Marketing" });
    const [request] = (await dan.query(api.requests.myRequests, {}))!;
    expect(request.approvedByHOD).toBe("APPROVED");
    expect(request.approvedByDirector).toBe("APPROVED");
    expect(request.approvedByBudgetManager).toBe("PENDING");
  });
});

describe("configurable Director approval threshold", () => {
  test("Finance Head can lower it; new requests respect the new cutoff", async () => {
    const t = await setup();
    await asUser(t, FIONA).mutation(api.admin.setDirectorThreshold, {
      year: YEAR,
      amount: 1000,
    });
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "below", amount: 999 });
    await rachel.mutation(api.requests.submit, { description: "at", amount: 1000 });
    const [below, at] = ((await rachel.query(api.requests.myRequests, {}))!).sort(
      (a, b) => a.amount - b.amount
    );
    expect(below.approvedByDirector).toBeUndefined();
    expect(at.approvedByDirector).toBe("PENDING");
  });

  test("raising it above an amount drops the Director step for new requests", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.setDirectorThreshold, {
      year: YEAR,
      amount: 10000,
    });
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "now-small", amount: 5000 });
    const [request] = (await rachel.query(api.requests.myRequests, {}))!;
    expect(request.approvedByDirector).toBeUndefined();
  });

  test("only admins or the Finance Head can change it; a positive amount is required", async () => {
    const t = await setup();
    await expect(
      asUser(t, RACHEL).mutation(api.admin.setDirectorThreshold, { year: YEAR, amount: 2000 })
    ).rejects.toThrow();
    await expect(
      asUser(t, FIONA).mutation(api.admin.setDirectorThreshold, { year: YEAR, amount: 0 })
    ).rejects.toThrow();
    await asUser(t, FIONA).mutation(api.admin.setDirectorThreshold, { year: YEAR, amount: 3000 });
    const structure = await asUser(t, ADMIN).query(api.directory.yearStructure, { year: YEAR });
    expect(structure?.directorApprovalThreshold).toBe(3000);
  });

  test("backfill stamps the historical default onto the year", async () => {
    const t = await setup();
    await t.mutation(internal.admin.backfillDirectorThresholds, {});
    const structure = await asUser(t, ADMIN).query(api.directory.yearStructure, { year: YEAR });
    expect(structure?.directorApprovalThreshold).toBe(5000);
  });

  test("setting it for a year with no settings row inserts one", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: ADMIN,
        year: YEAR + 1,
        assignments: [{ role: "Staff", department: "Data and IT" }],
      })
    );
    await asUser(t, ADMIN).mutation(api.admin.setDirectorThreshold, {
      year: YEAR + 1,
      amount: 4000,
    });
    const structure = await asUser(t, ADMIN).query(api.directory.yearStructure, {
      year: YEAR + 1,
    });
    expect(structure?.directorApprovalThreshold).toBe(4000);
  });
});

describe("approver delegation (out-of-office cover)", () => {
  test("a delegate can act on the requests the delegator approves", async () => {
    const t = await setup();
    await asUser(t, BELLA).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [req] = (await asUser(t, BELLA).query(api.requests.myRequests, {}))!;
    expect(req.approvedByFinanceHead).toBe("PENDING");

    const before = await asUser(t, RACHEL).query(api.requests.toReview, {});
    expect(before!.financeHead).toHaveLength(0);
    await expect(
      asUser(t, RACHEL).mutation(api.requests.approve, {
        requestId: req._id,
        step: "financeHead",
      })
    ).rejects.toThrow();

    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: FIONA,
      toEmail: RACHEL,
    });

    const me = await asUser(t, RACHEL).query(api.directory.me);
    expect(me?.isApprover).toBe(true);
    expect(me?.isDelegate).toBe(true);
    const after = await asUser(t, RACHEL).query(api.requests.toReview, {});
    expect(after!.financeHead.map((r) => r._id)).toContain(req._id);
    await asUser(t, RACHEL).mutation(api.requests.approve, {
      requestId: req._id,
      step: "financeHead",
    });
    const [updated] = (await asUser(t, BELLA).query(api.requests.myRequests, {}))!;
    expect(updated.approvedByFinanceHead).toBe("APPROVED");
  });

  test("removing the delegation revokes the access", async () => {
    const t = await setup();
    await asUser(t, BELLA).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [req] = (await asUser(t, BELLA).query(api.requests.myRequests, {}))!;
    const id = await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: FIONA,
      toEmail: RACHEL,
    });
    await asUser(t, ADMIN).mutation(api.admin.removeDelegation, { id });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.approve, {
        requestId: req._id,
        step: "financeHead",
      })
    ).rejects.toThrow();
  });

  test("a delegate still cannot approve their own request", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: HENRY,
      toEmail: RACHEL,
    });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "mine", amount: 100 });
    const [req] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(req.approvedByHOD).toBe("PENDING");
    const review = await asUser(t, RACHEL).query(api.requests.toReview, {});
    expect(review!.hod.map((r) => r._id)).not.toContain(req._id);
    await expect(
      asUser(t, RACHEL).mutation(api.requests.approve, { requestId: req._id, step: "hod" })
    ).rejects.toThrow();
  });

  test("admins and the Finance Head manage delegations; others, self-delegation and unknown people are rejected", async () => {
    const t = await setup();
    await expect(
      asUser(t, RACHEL).mutation(api.admin.addDelegation, { year: YEAR, fromEmail: FIONA, toEmail: HENRY })
    ).rejects.toThrow();
    await asUser(t, FIONA).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: HENRY,
      toEmail: RACHEL,
    });
    await expect(
      asUser(t, ADMIN).mutation(api.admin.addDelegation, { year: YEAR, fromEmail: FIONA, toEmail: FIONA })
    ).rejects.toThrow();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.addDelegation, { year: YEAR, fromEmail: FIONA, toEmail: FIONA })
    ).rejects.toThrow();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.addDelegation, {
        year: YEAR,
        fromEmail: "ghost@sow.org.au",
        toEmail: RACHEL,
      })
    ).rejects.toThrow();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.addDelegation, {
        year: YEAR,
        fromEmail: FIONA,
        toEmail: "ghost@sow.org.au",
      })
    ).rejects.toThrow();
    await expect(
      asUser(t, ADMIN).mutation(api.admin.addDelegation, {
        year: YEAR,
        fromEmail: "not-an-email",
        toEmail: RACHEL,
      })
    ).rejects.toThrow();
  });

  test("a delegate of the Director can approve the Director step", async () => {
    const t = await setup();
    await asUser(t, HENRY).mutation(api.requests.submit, { description: "big", amount: 6000 });
    const [req] = (await asUser(t, HENRY).query(api.requests.myRequests, {}))!;
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: req._id,
      step: "budgetManager",
    });

    await expect(
      asUser(t, RACHEL).mutation(api.requests.approve, { requestId: req._id, step: "director" })
    ).rejects.toThrow();
    expect(
      (await asUser(t, RACHEL).query(api.requests.toReview, {}))!.director
    ).toHaveLength(0);

    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: DAN,
      toEmail: RACHEL,
    });
    expect(
      (await asUser(t, RACHEL).query(api.requests.toReview, {}))!.director.map((r) => r._id)
    ).toContain(req._id);
    await asUser(t, RACHEL).mutation(api.requests.approve, { requestId: req._id, step: "director" });
    const [updated] = (await asUser(t, HENRY).query(api.requests.myRequests, {}))!;
    expect(updated.approvedByDirector).toBe("APPROVED");
  });

  test("a delegate also gets the approval-needed push / in-app notification", async () => {
    const t = await setup();
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

    expect(await asUser(t, RACHEL).query(api.notifications.unreadCount, {})).toBe(0);
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(0);

    await asUser(t, JUSTIN).mutation(api.requests.submit, {
      description: "needs hod",
      amount: 50,
    });

    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(1);
    expect(await asUser(t, RACHEL).query(api.notifications.unreadCount, {})).toBe(1);
    const henryFeed = await asUser(t, HENRY).query(api.notifications.list, {});
    const rachelFeed = await asUser(t, RACHEL).query(api.notifications.list, {});
    expect(henryFeed![0].title).toMatch(/approval/i);
    expect(rachelFeed![0].title).toMatch(/approval/i);
  });
});

describe("in-app notifications", () => {
  test("a flow event notifies the recipient, not the actor", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    expect(await asUser(t, RACHEL).query(api.notifications.unreadCount, {})).toBe(0);
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(1);
    const feed = await asUser(t, HENRY).query(api.notifications.list, {});
    expect(feed).toHaveLength(1);
    expect(feed![0].read).toBe(false);
    expect(feed![0].title).toMatch(/approval/i);
  });

  test("mark one / mark all read clears the unread count", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "a", amount: 100 });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "b", amount: 200 });
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(2);
    const feed = await asUser(t, HENRY).query(api.notifications.list, {});
    await asUser(t, HENRY).mutation(api.notifications.markRead, { id: feed![0].id });
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(1);
    await asUser(t, HENRY).mutation(api.notifications.markAllRead, {});
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(0);
  });

  test("a notification can only be marked read by its owner", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const feed = await asUser(t, HENRY).query(api.notifications.list, {});
    await expect(
      asUser(t, RACHEL).mutation(api.notifications.markRead, { id: feed![0].id })
    ).rejects.toThrow();
  });

  test("a request's notifications clear once that request is opened", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [req] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(1);
    await asUser(t, HENRY).mutation(api.comments.add, { requestId: req._id, body: "why?" });
    expect(await asUser(t, RACHEL).query(api.notifications.unreadCount, {})).toBe(1);

    await asUser(t, HENRY).mutation(api.notifications.markReadForRequest, { requestId: req._id });
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(0);
    await asUser(t, RACHEL).mutation(api.notifications.markReadForRequest, { requestId: req._id });
    expect(await asUser(t, RACHEL).query(api.notifications.unreadCount, {})).toBe(0);
  });

  test("opening one request leaves other requests' notifications unread", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "a", amount: 100 });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "b", amount: 200 });
    const reqs = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(2);
    await asUser(t, HENRY).mutation(api.notifications.markReadForRequest, {
      requestId: reqs[0]._id,
    });
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(1);
  });
});

describe("approval chain order and authorization", () => {
  test("a >= $5000 chain runs HOD -> Budget Manager -> Director -> Finance Head", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "big", amount: 6000 });
    const [request] = (await rachel.query(api.requests.myRequests, {}))!;
    expect(request.approvedByDirector).toBe("PENDING");

    await expect(
      asUser(t, DAN).mutation(api.requests.approve, { requestId: request._id, step: "director" })
    ).rejects.toThrow(/not waiting on that step/);

    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "budgetManager",
    });
    await asUser(t, DAN).mutation(api.requests.approve, { requestId: request._id, step: "director" });
    await asUser(t, FIONA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "financeHead",
    });

    const [done] = (await rachel.query(api.requests.myRequests, {}))!;
    expect(done.approvedByDirector).toBe("APPROVED");
    expect(done.approvedByFinanceHead).toBe("APPROVED");
  });

  test("submitReceipt notifies the current Finance Head on a carried-over request", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("departments", {
        year: YEAR - 1,
        name: "Finance",
        division: "Governance",
        headEmail: "oldfiona@sow.org.au",
      })
    );
    vi.setSystemTime(staffYearStartMs(YEAR - 1) + 1);
    const requestId = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "carried",
        amount: 100,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
        approvedByFinanceHead: "APPROVED",
      })
    );
    vi.useRealTimers();
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId,
      recipients: [
        {
          accountName: "R",
          bsb: "0",
          accountNumber: "1",
          amount: 100,
          attachments: [await storedReceipt(t)],
        },
      ],
    });
    expect(await asUser(t, FIONA).query(api.notifications.unreadCount, {})).toBe(1);
  });

  test("the full chain: HOD -> Budget Manager -> Finance Head -> receipt -> pay", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await rachel.query(api.requests.myRequests, {}))!;

    await expect(
      asUser(t, BELLA).mutation(api.requests.approve, {
        requestId: request._id,
        step: "budgetManager",
      })
    ).rejects.toThrow(/not waiting on that step/);

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

    await rachel.mutation(api.requests.submitReceipt, {
      requestId: request._id,
      recipients: [
        {
          accountName: "R",
          bsb: "000000",
          accountNumber: "1",
          amount: 95,
          attachments: [await storedReceipt(t)],
        },
      ],
    });
    const fiona = asUser(t, FIONA);
    const review = (await fiona.query(api.requests.toReview, {}))!;
    expect(review.readyToPay.map((r) => r._id)).toEqual([request._id]);
    await fiona.mutation(api.requests.pay, {
      requestId: request._id,
      paidAmount: 95,
    });

    const [done] = (await rachel.query(api.requests.myRequests, {}))!;
    expect(done.paid).toBe(true);
  });

  test("random staff can't approve; approvers can't review their own requests", async () => {
    const t = await setup();
    await asUser(t, HENRY).mutation(api.requests.submit, {
      description: "x",
      amount: 100,
    });
    const [request] = (await asUser(t, HENRY).query(api.requests.myRequests, {}))!;

    await expect(
      asUser(t, RACHEL).mutation(api.requests.approve, {
        requestId: request._id,
        step: "budgetManager",
      })
    ).rejects.toThrow(/not the approver/);
  });

  test("a declined request is closed at every later step", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await rachel.query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: request._id,
      step: "hod",
      reason: "Not in budget",
    });
    await expect(
      asUser(t, BELLA).mutation(api.requests.approve, {
        requestId: request._id,
        step: "budgetManager",
      })
    ).rejects.toThrow(/declined/);
  });

  test("HOD only sees their own department's pending requests in To Review", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, {
      description: "marketing",
      amount: 100,
    });
    await asUser(t, BELLA).mutation(api.requests.submit, {
      description: "finance",
      amount: 100,
    });
    const review = (await asUser(t, HENRY).query(api.requests.toReview, {}))!;
    expect(review.hod).toHaveLength(1);
    expect(review.hod[0].department).toBe("Marketing");
    expect(review.budgetManager).toHaveLength(0);
  });
});

describe("admin and per-year rules", () => {
  test("non-admins can't assign roles/departments (not even their own)", async () => {
    const t = await setup();
    await expect(
      asUser(t, RACHEL).mutation(api.admin.setStaffProfile, {
        email: RACHEL,
        year: YEAR,
        roles: ["Head of Department"],
        department: "Marketing",
      })
    ).rejects.toThrow(/Only admins/);
  });

  test("admins can provision someone who has never signed in, for current and next year", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, { year: YEAR + 1, name: "Operations" });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR + 1,
      name: "Marketing",
      division: "Operations",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "newhire@sow.org.au",
      year: YEAR + 1,
      roles: ["Staff"],
      department: "Marketing",
    });
    const nextYearProfiles = (await admin.query(api.admin.listStaffProfiles, {
      year: YEAR + 1,
    }))!;
    expect(nextYearProfiles.map((p) => p.email)).toContain("newhire@sow.org.au");

    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "newhire@sow.org.au",
        year: YEAR + 2,
        roles: ["Staff"],
        department: "Marketing",
      })
    ).rejects.toThrow(/only manage/);
  });

  test("Human Resources division members are admins too", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "pnc@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "People and Culture",
    });
    await asUser(t, "pnc@sow.org.au").mutation(api.admin.setStaffProfile, {
      email: "someone@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const profiles = await asUser(t, "pnc@sow.org.au").query(
      api.admin.listStaffProfiles,
      { year: YEAR }
    );
    expect(profiles!.map((p) => p.email)).toContain("someone@sow.org.au");
  });

  test("the Budget Manager must be from the Finance department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await expect(
      admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: RACHEL })
    ).rejects.toThrow(/Finance/);
    await admin.mutation(api.admin.setStaffProfile, {
      email: BELLA,
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.budgetManagerEmail).toBeNull();
  });

  test("org chart groups director, divisions, heads and members", async () => {
    const t = await setup();
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(chart.year).toBe(YEAR);
    expect(chart.director?.email).toBe(DAN);

    const engagement = chart.divisions.find((d) => d.name === "Engagement");
    const marketing = engagement?.departments.find((d) => d.name === "Marketing");
    expect(marketing?.head?.email).toBe(HENRY);
    expect(marketing?.members.map((m) => m.email)).toEqual([RACHEL]);

    const governance = chart.divisions.find((d) => d.name === "Governance");
    const finance = governance?.departments.find((d) => d.name === "Finance");
    expect(finance?.head?.email).toBe(FIONA);
    expect(finance?.members.map((m) => m.email)).toEqual([BELLA]);
  });

  test("org chart can show previous years via the year parameter", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("divisions", { year: 2020, name: "Old Division" });
      await ctx.db.insert("departments", {
        year: 2020,
        name: "Old Marketing",
        division: "Old Division",
        headEmail: HENRY,
      });
      await ctx.db.insert("staffProfiles", {
        email: HENRY,
        year: 2020,
        assignments: [{ role: "Head of Department", department: "Old Marketing" }],
      });
    });

    const past = (await asUser(t, RACHEL).query(api.directory.orgChart, {
      year: 2020,
    }))!;
    expect(past.year).toBe(2020);
    expect(past.availableYears).toContain(2020);
    expect(past.availableYears).toContain(YEAR);
    expect(past.divisions.map((d) => d.name)).toEqual(["Old Division"]);
    expect(past.divisions[0].departments[0].head?.email).toBe(HENRY);

    const current = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(current.year).toBe(YEAR);
  });

  test("profiles: own church is editable, service history spans years, others can view", async () => {
    const t = await setup();
    const rachelUserId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: RACHEL,
        year: YEAR - 1,
        assignments: [{ role: "Staff", department: "Events" }],
      });
      return await ctx.db.insert("users", {
        email: RACHEL,
        name: "Rachel R",
        image: "https://lh3.googleusercontent.com/google-default",
      });
    });

    const rachelSignedIn = t.withIdentity({
      email: RACHEL,
      subject: `${rachelUserId}|session1`,
      issuer: "test",
    });
    await rachelSignedIn.mutation(api.profile.updateChurch, {
      localChurch: "SOW City Church",
    });

    const viewed = (await asUser(t, HENRY).query(api.profile.get, { email: RACHEL }))!;
    expect(viewed.isMe).toBe(false);
    expect(viewed.name).toBe("Rachel R");
    expect(viewed.localChurch).toBe("SOW City Church");
    expect(viewed.serviceHistory).toEqual([
      {
        year: YEAR,
        roles: ["Staff"],
        assignments: [{ role: "Staff", department: "Marketing" }],
        department: "Marketing",
        division: null,
        university: null,
      },
      {
        year: YEAR - 1,
        roles: ["Staff"],
        assignments: [{ role: "Staff", department: "Events" }],
        department: "Events",
        division: null,
        university: null,
      },
    ]);

    const own = (await rachelSignedIn.query(api.profile.get, {}))!;
    expect(own.isMe).toBe(true);
    expect(own.photo).toBe("https://lh3.googleusercontent.com/google-default");

    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["fake-image"], { type: "image/png" }))
    );
    await rachelSignedIn.mutation(api.profile.setAvatar, { storageId });
    const updated = (await asUser(t, HENRY).query(api.profile.get, { email: RACHEL }))!;
    expect(updated.photo).not.toBe("https://lh3.googleusercontent.com/google-default");
    expect(updated.photo).toBeTruthy();

    const chart = (await asUser(t, HENRY).query(api.directory.orgChart, {}))!;
    const marketing = chart.divisions
      .flatMap((d) => d.departments)
      .find((d) => d.name === "Marketing");
    const rachelInChart = marketing?.members.find((m) => m.email === RACHEL);
    expect(rachelInChart?.photo).toBe(updated.photo);
  });

  test("the synced Workspace directory powers the admin picker", async () => {
    const t = await setup();
    await t.mutation(internal.directorySync.store, {
      users: [
        { email: RACHEL, name: "Rachel R" },
        { email: "newbie@sow.org.au", name: "New B" },
        { email: "fresh@sow.org.au" },
      ],
    });
    const directory = (await asUser(t, ADMIN).query(api.directorySync.list, {
      year: YEAR,
    }))!;
    expect(directory.syncedAt).toBeTruthy();
    expect(directory.status).toBe("synced 3 people");
    expect(
      directory.users.filter((u) => !u.hasProfile).map((u) => u.email)
    ).toEqual(["newbie@sow.org.au", "fresh@sow.org.au"]);
    expect(directory.users.find((u) => u.email === RACHEL)?.hasProfile).toBe(true);

    await t.mutation(internal.directorySync.store, {
      users: [{ email: "only@sow.org.au" }],
    });
    const replaced = (await asUser(t, ADMIN).query(api.directorySync.list, {
      year: YEAR,
    }))!;
    expect(replaced.users.map((u) => u.email)).toEqual(["only@sow.org.au"]);

    await expect(
      asUser(t, RACHEL).query(api.directorySync.list, { year: YEAR })
    ).rejects.toThrow(/Only admins/);
    await expect(
      asUser(t, RACHEL).mutation(api.directorySync.requestSync, {})
    ).rejects.toThrow(/Only admins/);
  });

  test("an unexpected sign-in is unassigned, visible to admins, and assignable", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "walter@sow.org.au", name: "Walter W" });
    });
    const walter = asUser(t, "walter@sow.org.au");

    const me = (await walter.query(api.directory.me, {}))!;
    expect(me?.profile).toBeNull();
    await expect(
      walter.mutation(api.requests.submit, { description: "x", amount: 10 })
    ).rejects.toThrow(/No role\/department/);

    const admin = asUser(t, ADMIN);
    const before = (await admin.query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    expect(before.map((u) => u.email)).toContain("walter@sow.org.au");
    await admin.mutation(api.admin.setStaffProfile, {
      email: "walter@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const after = (await admin.query(api.admin.listUnassignedUsers, { year: YEAR }))!;
    expect(after.map((u) => u.email)).not.toContain("walter@sow.org.au");

    await walter.mutation(api.requests.submit, { description: "x", amount: 10 });
    expect((await walter.query(api.requests.myRequests, {}))!).toHaveLength(1);

    const nextYear = (await admin.query(api.admin.listUnassignedUsers, {
      year: YEAR + 1,
    }))!;
    expect(nextYear.map((u) => u.email)).toContain("walter@sow.org.au");
  });

  test("sign-in binds profiles to the user id; an email rename re-keys everything", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    await asUser(t, RACHEL).mutation(api.push.register, { token: "ExponentPushToken[r]" });
    const bellaUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: BELLA, name: "Bella B" })
    );
    await t.mutation(internal.userLink.link, { userId: bellaUserId });
    const bound = await t.run(async (ctx) =>
      (await ctx.db.query("staffProfiles").take(100)).find((p) => p.email === BELLA)
    );
    expect(bound?.userId).toBe(bellaUserId);

    const rachelUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: RACHEL, name: "Rachel R" })
    );
    await t.mutation(internal.userLink.link, { userId: rachelUserId });
    await t.run((ctx) =>
      ctx.db.patch("users", rachelUserId, { email: "rachel.renamed@sow.org.au" })
    );
    await t.mutation(internal.userLink.link, { userId: rachelUserId });

    const renamed = asUser(t, "rachel.renamed@sow.org.au");
    const mine = (await renamed.query(api.requests.myRequests, {}))!;
    expect(mine).toHaveLength(1);
    expect(mine[0].requesterEmail).toBe("rachel.renamed@sow.org.au");
    const tokens = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
    expect(tokens.find((tk) => tk.token === "ExponentPushToken[r]")?.email).toBe(
      "rachel.renamed@sow.org.au"
    );
    expect(await asUser(t, RACHEL).query(api.requests.myRequests, {})).toBeNull();

    const fionaUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: FIONA, name: "Fiona F" })
    );
    await t.mutation(internal.userLink.link, { userId: fionaUserId });
    await t.run((ctx) =>
      ctx.db.patch("users", fionaUserId, { email: "fiona.new@sow.org.au" })
    );
    await t.mutation(internal.userLink.link, { userId: fionaUserId });
    const structure = (await asUser(t, ADMIN).query(api.directory.yearStructure, {
      year: YEAR,
    }))!;
    expect(
      structure.departments.find((d) => d.name === "Finance")?.headEmail
    ).toBe("fiona.new@sow.org.au");
    const [request] = (await renamed.query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, "fiona.new@sow.org.au").mutation(api.requests.approve, {
      requestId: request._id,
      step: "financeHead",
    });
  });

  test("push tokens register per device and follow account switches", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.push.register, {
      token: "ExponentPushToken[abc]",
    });
    await asUser(t, HENRY).mutation(api.push.register, {
      token: "ExponentPushToken[abc]",
    });
    const tokens = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].email).toBe(HENRY);
  });

  test("the submitter is emailed but never pushed for their own submission", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@sow.org.au");
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("pushTokens", { email: RACHEL, token: "ExponentPushToken[rachel]" })
    );
    await t.run((ctx) =>
      ctx.db.insert("pushTokens", { email: HENRY, token: "ExponentPushToken[henry]" })
    );

    const calls: { url: string; body: any }[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, opts: { body: string }) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ status: "ok" }] }),
        text: () => Promise.resolve(""),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      await asUser(t, RACHEL).mutation(api.requests.submit, { description: "Pens", amount: 12 });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }

    const pushedTokens = calls
      .filter((c) => c.url.includes("exp.host"))
      .flatMap((c) => c.body.map((m: { to: string }) => m.to));
    expect(pushedTokens).not.toContain("ExponentPushToken[rachel]");
    expect(pushedTokens).toContain("ExponentPushToken[henry]");

    const emailedTo = calls
      .filter((c) => c.url.includes("resend.com"))
      .flatMap((c) => c.body.to as string[]);
    expect(emailedTo).toContain(RACHEL);
  });

  test("staff year rolls over on October 1st", () => {
    expect(staffYearForDate(new Date("2026-06-11"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-09-30"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-10-01"))).toBe(2027);
    expect(staffYearForDate(new Date("2026-12-31"))).toBe(2027);
  });
});

describe("audit trail and reminders", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the audit trail records who actioned each step, in order", async () => {
    const t = await setup();
    await asUser(t, HENRY).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, HENRY).query(api.requests.myRequests, {}))!;
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: request._id, step: "financeHead" });
    await asUser(t, HENRY).mutation(api.requests.submitReceipt, {
      requestId: request._id,
      recipients: [
        {
          accountName: "H",
          bsb: "0",
          accountNumber: "1",
          amount: 90,
          attachments: [await storedReceipt(t)],
        },
      ],
    });
    await asUser(t, FIONA).mutation(api.requests.pay, { requestId: request._id, paidAmount: 90 });

    const trail = (await asUser(t, RACHEL).query(api.requests.auditTrail, {
      requestId: request._id,
    }))!;
    expect(trail.map((e) => [e.action, e.step, e.actor])).toEqual([
      ["submitted", null, HENRY],
      ["auto-approved", "hod", HENRY],
      ["approved", "budgetManager", BELLA],
      ["approved", "financeHead", FIONA],
      ["receipt-submitted", null, HENRY],
      ["paid", null, FIONA],
    ]);
    expect(trail.every((e) => typeof e.at === "number")).toBe(true);
    expect(trail[5].detail).toBe("$90");

    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "y", amount: 50 });
    const [declined] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: declined._id, step: "hod", reason: "Too dear",
    });
    const declinedTrail = (await asUser(t, RACHEL).query(api.requests.auditTrail, {
      requestId: declined._id,
    }))!;
    expect(declinedTrail.at(-1)).toMatchObject({
      action: "declined", step: "hod", actor: HENRY, detail: "Too dear",
    });
  });

  test("reviewed lists what an approver actioned, newest first, deduped per request", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "first", amount: 100 });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "second", amount: 250 });
    const mine = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    const first = mine.find((r) => r.description === "first")!;
    const second = mine.find((r) => r.description === "second")!;

    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: first._id, step: "hod" });
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: second._id, step: "hod", reason: "no",
    });
    await asUser(t, HENRY).mutation(api.requests.submit, { description: "henry-own", amount: 50 });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: first._id, step: "budgetManager",
    });

    const reviewed = (await asUser(t, HENRY).query(api.requests.reviewed, {}))!;
    expect(reviewed.map((r) => r.description)).toEqual(["henry-own", "second", "first"]);

    const bellaReviewed = (await asUser(t, BELLA).query(api.requests.reviewed, {}))!;
    expect(bellaReviewed.map((r) => r.description)).toEqual(["first"]);
  });

  test("reviewed keeps a HOD department request awaiting receipt with unread comments", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, {
      description: "waiting receipt",
      amount: 100,
    });
    const mine = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    const waitingReceipt = mine.find((r) => r.description === "waiting receipt")!;
    await asUser(t, HENRY).mutation(api.requests.approve, {
      requestId: waitingReceipt._id,
      step: "hod",
    });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: waitingReceipt._id,
      step: "budgetManager",
    });
    await asUser(t, FIONA).mutation(api.requests.approve, {
      requestId: waitingReceipt._id,
      step: "financeHead",
    });

    await t.run(async (ctx) => {
      for await (const event of ctx.db
        .query("requestEvents")
        .withIndex("by_request", (q) => q.eq("requestId", waitingReceipt._id))) {
        await ctx.db.delete(event._id);
      }
    });

    await asUser(t, RACHEL).mutation(api.comments.add, {
      requestId: waitingReceipt._id,
      body: "receipt coming",
    });

    const reviewed = (await asUser(t, HENRY).query(api.requests.reviewed, {}))!;
    expect(reviewed.map((r) => r._id)).toContain(waitingReceipt._id);
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, {
      requestId: waitingReceipt._id,
    })).toBe(1);
  });

  test("reviewed returns null when signed out", async () => {
    const t = await setup();
    expect(await t.query(api.requests.reviewed, {})).toBeNull();
  });

  test("departments with open requests can't be deleted; members cascade", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    await admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Marketing" });
    const structure0 = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure0.departments.map((d) => d.name)).not.toContain("Marketing");

    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Operations", headEmail: HENRY,
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: RACHEL, year: YEAR, assignments: [{ role: "Staff", department: "Marketing" }],
    });

    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 40 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: request._id, step: "hod", reason: "no",
    });
    await admin.mutation(api.admin.removeStaffProfile, { email: RACHEL, year: YEAR });
    await admin.mutation(api.admin.removeStaffProfile, { email: HENRY, year: YEAR });
    await admin.mutation(api.admin.removeStaffProfile, { email: DAN, year: YEAR });

    await admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Marketing" });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.departments.map((d) => d.name)).not.toContain("Marketing");

    await admin.mutation(api.admin.setStaffProfile, {
      email: "eve@sow.org.au", year: YEAR, roles: ["Staff"], department: "Events",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations", headEmail: "evan@sow.org.au",
    });
    await asUser(t, "eve@sow.org.au").mutation(api.requests.submit, {
      description: "open", amount: 30,
    });
    await admin.mutation(api.admin.removeStaffProfile, { email: "eve@sow.org.au", year: YEAR });
    await admin.mutation(api.admin.removeStaffProfile, { email: "evan@sow.org.au", year: YEAR });
    await expect(
      admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Events" })
    ).rejects.toThrow(/open requests/);
  });

  test("the Head of Department role syncs with departments.head, both directions", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations", headEmail: "nina@sow.org.au",
    });
    let structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.departments.find((d) => d.name === "Events")?.headEmail).toBe(
      "nina@sow.org.au"
    );

    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations",
    });
    structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.departments.find((d) => d.name === "Events")?.headEmail).toBeNull();

    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations", headEmail: "omar@sow.org.au",
    });
    const profiles = (await admin.query(api.admin.listStaffProfiles, { year: YEAR }))!;
    const omar = profiles.find((p) => p.email === "omar@sow.org.au");
    expect(omar?.roles).toEqual(["Head of Department"]);
    expect(omar?.assignments?.some((a) => a.department === "Events")).toBe(true);

    await admin.mutation(api.admin.removeStaffProfile, {
      email: "omar@sow.org.au", year: YEAR,
    });
    structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.departments.find((d) => d.name === "Events")?.headEmail).toBeNull();
  });

  test("admin.people merges directory, signed-in users and profiles", async () => {
    const t = await setup();
    await t.mutation(internal.directorySync.store, {
      users: [{ email: "fresh@sow.org.au", name: "Fresh Face" }],
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: RACHEL, name: "Rachel R" });
    });
    const people = (await asUser(t, ADMIN).query(api.admin.people, { year: YEAR }))!;
    const emails = people.map((p) => p.email);
    expect(emails).toContain("fresh@sow.org.au");
    expect(emails).toContain(RACHEL);
    expect(new Set(emails).size).toBe(emails.length);
    expect(people.find((p) => p.email === RACHEL)?.department).toBe("Marketing");
    expect(people.find((p) => p.email === RACHEL)?.name).toBe("Rachel R");
  });

  test("next-approver notifications fall back to the current year's officeholder", () => {
    const carriedOver = {
      requesterEmail: RACHEL,
      department: "Marketing",
      approvedByHOD: "APPROVED",
      approvedByBudgetManager: "PENDING",
      approvedByDirector: undefined,
      approvedByFinanceHead: "PENDING",
      _creationTime: staffYearStartMs(YEAR - 1),
    } as never as Parameters<typeof nextApproverEmail>[0];
    const lastYear = { hodEmail: HENRY, budgetManagerEmail: undefined, financeHeadEmail: undefined };
    const thisYear = { hodEmail: HENRY, budgetManagerEmail: BELLA, financeHeadEmail: FIONA };
    expect(nextApproverEmail(carriedOver, lastYear, thisYear)).toBe(BELLA);
    expect(nextApproverWithYear(carriedOver, lastYear, thisYear)).toEqual({
      email: BELLA,
      year: YEAR,
    });
    expect(
      nextApproverEmail(carriedOver, { ...lastYear, budgetManagerEmail: "olga@sow.org.au" }, thisYear)
    ).toBe("olga@sow.org.au");
    expect(
      nextApproverWithYear(
        carriedOver,
        { ...lastYear, budgetManagerEmail: "olga@sow.org.au" },
        thisYear
      )
    ).toEqual({ email: "olga@sow.org.au", year: YEAR - 1 });
    expect(
      nextApproverWithYear(carriedOver, lastYear, {
        hodEmail: HENRY,
        budgetManagerEmail: undefined,
        financeHeadEmail: FIONA,
      })
    ).toBeUndefined();
    expect(
      nextApproverEmail(
        { ...carriedOver, approvedByBudgetManager: "APPROVED", approvedByFinanceHead: "APPROVED" } as never,
        lastYear,
        thisYear
      )
    ).toBeUndefined();
  });

  test("chain notifications target the relevant approvers only", () => {
    const approvers = {
      hodEmail: HENRY,
      budgetManagerEmail: BELLA,
      financeHeadEmail: FIONA,
      directorEmail: DAN,
    };
    const base = {
      requesterEmail: RACHEL,
      department: "Marketing",
      approvedByHOD: "APPROVED",
      approvedByBudgetManager: "APPROVED",
      approvedByDirector: undefined,
      approvedByFinanceHead: "PENDING",
    } as never as Parameters<typeof involvedApproverEmails>[0];

    expect(involvedApproverEmails(base, approvers, ["APPROVED"])).toEqual([
      HENRY,
      BELLA,
    ]);
    expect(
      involvedApproverEmails(
        { ...base, department: "Finance" } as never,
        approvers,
        ["APPROVED"]
      )
    ).toEqual([BELLA]);
    expect(
      involvedApproverEmails(
        { ...base, requesterEmail: HENRY } as never,
        approvers,
        ["APPROVED"]
      )
    ).toEqual([BELLA]);
  });

  test("identity resolves from the users row: real JWTs carry only sub, no email claim", async () => {
    const t = await setup();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: RACHEL, name: "Rachel R" })
    );
    const viaSub = t.withIdentity({ subject: `${userId}|session1`, issuer: "test" });
    await viaSub.mutation(api.requests.submit, { description: "x", amount: 25 });
    const mine = await viaSub.query(api.requests.myRequests, {});
    expect(mine).not.toBeNull();
    expect(mine![0].requesterEmail).toBe(RACHEL);
    const me = await viaSub.query(api.directory.me, {});
    expect(me?.email).toBe(RACHEL);
    expect(me?.profile?.department).toBe("Marketing");
  });

  test("read queries return null (not throw) while auth is still attaching", async () => {
    const t = await setup();
    expect((await t.query(api.directory.availableYears, {}))!).toBeNull();
    expect((await t.query(api.directory.yearStructure, { year: YEAR }))!).toBeNull();
    expect((await t.query(api.requests.myRequests, {}))!).toBeNull();
    expect((await t.query(api.requests.toReview, {}))!).toBeNull();
    expect((await t.query(api.requests.allRequests, {}))!).toBeNull();
    expect((await t.query(api.profile.get, {}))!).toBeNull();
    expect((await t.query(api.admin.listStaffProfiles, { year: YEAR }))!).toBeNull();
    expect((await t.query(api.directorySync.list, { year: YEAR }))!).toBeNull();
  });

  test("requests.get serves the detail screen for any signed-in staff member", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    const seen = (await asUser(t, HENRY).query(api.requests.get, {
      requestId: request._id,
    }))!;
    expect(seen?._id).toBe(request._id);
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: request._id });
    const gone = (await asUser(t, HENRY).query(api.requests.get, {
      requestId: request._id,
    }))!;
    expect(gone).toBeNull();
  });

  test("stale requests trigger a weekly reminder to whoever they wait on", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;

    await t.mutation(internal.reminders.remindStale, {});
    let updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBeUndefined();

    vi.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.reminders.remindStale, {});
    updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    const firstReminder = updated?.lastReminderAt;
    expect(firstReminder).toBeDefined();

    await t.mutation(internal.reminders.remindStale, {});
    updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBe(firstReminder);

    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.reminders.remindStale, {});
    updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBeGreaterThan(firstReminder!);
  });
});

describe("deadlock prevention and validation fixes", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("submit is rejected while the year has no Budget Manager", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: HENRY,
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: FIONA,
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: RACHEL, year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 })
    ).rejects.toThrow(/Budget Manager/);
  });

  test("a >= $5000 request is rejected while the org has no Director", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: DAN, year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, { description: "big", amount: 6000 })
    ).rejects.toThrow(/Director/);
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "small", amount: 100 });
  });

  test("removing the Budget Manager's profile clears the assignment", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.removeStaffProfile, { email: BELLA, year: YEAR });
    const structure = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure.budgetManagerEmail).toBeNull();
  });

  test("receipts need complete digit-only bank details, a file, positive amounts", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await rachel.query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: request._id, step: "financeHead" });

    const attempt = (recipient: {
      accountName: string;
      bsb: string;
      accountNumber: string;
      amount: number;
      attachments?: { storageId: Awaited<ReturnType<typeof storedReceipt>>["storageId"]; name: string }[];
    }) =>
      rachel.mutation(api.requests.submitReceipt, {
        requestId: request._id,
        recipients: [recipient],
      });

    const file = await storedReceipt(t);
    await expect(
      attempt({ accountName: "  ", bsb: "0", accountNumber: "1", amount: 95, attachments: [file] })
    ).rejects.toThrow(/account name/);
    await expect(
      attempt({ accountName: "R", bsb: "000-000", accountNumber: "1", amount: 95, attachments: [file] })
    ).rejects.toThrow(/digits only/);
    await expect(
      attempt({ accountName: "R", bsb: "0", accountNumber: "1", amount: 0, attachments: [file] })
    ).rejects.toThrow(/positive/);
    await expect(
      attempt({ accountName: "R", bsb: "0", accountNumber: "1", amount: 95 })
    ).rejects.toThrow(/receipt file/);
    await expect(
      rachel.mutation(api.requests.submitReceipt, {
        requestId: request._id,
        recipients: [
          { accountName: "R", bsb: "0", accountNumber: "1", amount: 600_000, attachments: [file] },
          { accountName: "S", bsb: "0", accountNumber: "2", amount: 600_000, attachments: [file] },
        ],
      })
    ).rejects.toThrow(/Talk to Finance/);

    await attempt({
      accountName: "R",
      bsb: "0",
      accountNumber: "1",
      amount: 95,
      attachments: [file],
    });
    await expect(
      asUser(t, FIONA).mutation(api.requests.pay, { requestId: request._id, paidAmount: 0 })
    ).rejects.toThrow(/positive/);
  });

  test("receipt attachment limits reject oversized payloads", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await rachel.query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: request._id, step: "financeHead" });

    const file = await storedReceipt(t);
    const attempt = (recipients: {
      accountName: string;
      bsb: string;
      accountNumber: string;
      amount: number;
      attachments?: { storageId: typeof file.storageId; name: string }[];
    }[]) =>
      rachel.mutation(api.requests.submitReceipt, {
        requestId: request._id,
        recipients,
      });

    await expect(
      attempt(
        Array.from({ length: 21 }, (_, i) => ({
          accountName: `R${i}`,
          bsb: "0",
          accountNumber: "1",
          amount: 1,
        }))
      )
    ).rejects.toThrow(/at most 20 recipients/i);

    await expect(
      attempt([
        {
          accountName: "R",
          bsb: "0",
          accountNumber: "1",
          amount: 100,
          attachments: Array.from({ length: 11 }, () => file),
        },
      ])
    ).rejects.toThrow(/at most 10 attachments/i);

    await expect(
      attempt([
        {
          accountName: "R",
          bsb: "0",
          accountNumber: "1",
          amount: 100,
          attachments: [{ ...file, name: "x".repeat(201) }],
        },
      ])
    ).rejects.toThrow(/200 characters/i);

    const bigFile = {
      storageId: await t.run((ctx) =>
        ctx.storage.store(
          new Blob(["x".repeat(2 * 1024 * 1024 + 1)], {
            type: "application/pdf",
          })
        )
      ),
      name: "too-big.pdf",
    };
    await expect(
      attempt([
        {
          accountName: "R",
          bsb: "0",
          accountNumber: "1",
          amount: 100,
          attachments: [bigFile],
        },
      ])
    ).rejects.toThrow(/2MB or smaller/i);

    await expect(
      attempt(
        Array.from({ length: 6 }, (_, i) => ({
          accountName: `R${i}`,
          bsb: "0",
          accountNumber: "1",
          amount: 10,
          attachments: Array.from({ length: 9 }, () => file),
        }))
      )
    ).rejects.toThrow(/at most 50 attachments/i);
  });

  test("receipt files must be uploaded after the request is approved", async () => {
    vi.useFakeTimers({ now: new Date("2026-06-01T00:00:00Z"), toFake: ["Date"] });
    try {
      const t = await setup();
      const rachel = asUser(t, RACHEL);
      await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
      const [request] = (await rachel.query(api.requests.myRequests, {}))!;
      const staleFile = await storedReceipt(t);

      vi.setSystemTime(new Date("2026-06-01T00:01:00Z"));
      await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
      await asUser(t, BELLA).mutation(api.requests.approve, {
        requestId: request._id,
        step: "budgetManager",
      });
      await asUser(t, FIONA).mutation(api.requests.approve, {
        requestId: request._id,
        step: "financeHead",
      });

      await expect(
        rachel.mutation(api.requests.submitReceipt, {
          requestId: request._id,
          recipients: [
            {
              accountName: "R",
              bsb: "0",
              accountNumber: "1",
              amount: 100,
              attachments: [staleFile],
            },
          ],
        })
      ).rejects.toThrow(/uploaded after the request is approved/i);
    } finally {
      vi.useRealTimers();
    }
  });

  test("deleteDeclined removes request nudges", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await rachel.query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: request._id,
      step: "hod",
      reason: "No",
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 201; i++) {
        await ctx.db.insert("requestNudges", {
          requestId: request._id,
          nudgerEmail: HENRY,
          sentAt: Date.now() + i,
        });
      }
    });

    vi.useFakeTimers();
    try {
      await rachel.mutation(api.requests.deleteDeclined, { requestId: request._id });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    const nudges = await t.run((ctx) =>
      ctx.db
        .query("requestNudges")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect()
    );
    expect(nudges).toEqual([]);
  });

  test("cancel removes request nudges", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await rachel.query(api.requests.myRequests, {}))!;
    await t.run((ctx) =>
      ctx.db.insert("requestNudges", {
        requestId: request._id,
        nudgerEmail: HENRY,
        sentAt: Date.now(),
      })
    );

    vi.useFakeTimers();
    try {
      await rachel.mutation(api.requests.cancel, { requestId: request._id });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    const nudges = await t.run((ctx) =>
      ctx.db
        .query("requestNudges")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect()
    );
    expect(nudges).toEqual([]);
  });

  test("in-flight previous-year requests survive the rollover end to end", async () => {
    vi.setSystemTime(staffYearStartMs(YEAR - 1) + 1);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("divisions", { year: YEAR - 1, name: "Engagement" });
      await ctx.db.insert("departments", {
        year: YEAR - 1, name: "Marketing", division: "Engagement", headEmail: HENRY,
      });
      await ctx.db.insert("departments", {
        year: YEAR - 1, name: "Finance", division: "Governance", headEmail: FIONA,
      });
      await ctx.db.insert("yearSettings", { year: YEAR - 1, budgetManagerEmail: BELLA });
    });
    const carried = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "carried over",
        amount: 300,
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
    await admin.mutation(api.admin.setStaffProfile, {
      year: YEAR, email: BELLA, roles: ["Staff"], department: "Finance",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      year: YEAR, email: DAN, roles: ["Director"],
    });
    await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
    await asUser(t, HENRY).mutation(api.requests.approve, {
      requestId: carried, step: "hod",
    });

    const mine = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(mine.find((r) => r.description === "carried over")).toBeDefined();

    const review = (await asUser(t, BELLA).query(api.requests.toReview, {}))!;
    const carriedDoc = review.budgetManager.find((r) => r.description === "carried over");
    expect(carriedDoc).toBeDefined();
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: carriedDoc!._id, step: "budgetManager",
    });
    await asUser(t, FIONA).mutation(api.requests.approve, {
      requestId: carriedDoc!._id, step: "financeHead",
    });
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: carriedDoc!._id,
      recipients: [
        {
          accountName: "R",
          bsb: "0",
          accountNumber: "1",
          amount: 300,
          attachments: [await storedReceipt(t)],
        },
      ],
    });
    const fionaReview = (await asUser(t, FIONA).query(api.requests.toReview, {}))!;
    expect(fionaReview.readyToPay.map((r) => r._id)).toContain(carriedDoc!._id);
    await asUser(t, FIONA).mutation(api.requests.pay, {
      requestId: carriedDoc!._id, paidAmount: 300,
    });
    const paidDoc = await t.run((ctx) => ctx.db.get("requests", carriedDoc!._id));
    expect(paidDoc?.paid).toBe(true);
    const after = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(after.find((r) => r._id === carriedDoc!._id)).toBeUndefined();
  });

  test("declining requires a reason", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await expect(
      asUser(t, HENRY).mutation(api.requests.decline, {
        requestId: request._id, step: "hod", reason: "   ",
      })
    ).rejects.toThrow(/reason/);
  });

  test("the Director and the HR division head are admins; other division heads aren't", async () => {
    const t = await setup();
    await asUser(t, DAN).mutation(api.admin.setStaffProfile, {
      email: "new@sow.org.au", year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await asUser(t, ADMIN).mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Human Resources", headEmail: "hrhead@sow.org.au",
    });
    await asUser(t, "hrhead@sow.org.au").mutation(api.admin.setStaffProfile, {
      email: "new2@sow.org.au", year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await asUser(t, ADMIN).mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Engagement", headEmail: "enghead@sow.org.au",
    });
    await expect(
      asUser(t, "enghead@sow.org.au").mutation(api.admin.setStaffProfile, {
        email: "new3@sow.org.au", year: YEAR, roles: ["Staff"], department: "Marketing",
      })
    ).rejects.toThrow(/Only admins/);
  });

  test("a carried-over request whose approver left can be actioned by this year's officeholder", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("departments", {
        year: YEAR - 1, name: "Marketing", division: "Engagement", headEmail: HENRY,
      });
      await ctx.db.insert("yearSettings", {
        year: YEAR - 1, budgetManagerEmail: "olga@sow.org.au",
      });
    });
    vi.setSystemTime(staffYearStartMs(YEAR - 1) + 1);
    await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "stranded",
        amount: 120,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "PENDING",
        approvedByFinanceHead: "PENDING",
      })
    );
    vi.useRealTimers();
    const review = (await asUser(t, BELLA).query(api.requests.toReview, {}))!;
    const stranded = review.budgetManager.find((r) => r.description === "stranded");
    expect(stranded).toBeDefined();
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: stranded!._id, step: "budgetManager",
    });
  });

  test("receipts support multiple recipients with multiple attachments each", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 300 });
    const [request] = (await rachel.query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: request._id, step: "financeHead" });

    const [fileA, fileB, fileC] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["receipt-a"], { type: "application/pdf" })),
      await ctx.storage.store(new Blob(["receipt-b"], { type: "image/png" })),
      await ctx.storage.store(new Blob(["receipt-c"], { type: "application/pdf" })),
    ]);
    await rachel.mutation(api.requests.submitReceipt, {
      requestId: request._id,
      recipients: [
        {
          accountName: "Rachel",
          bsb: "111111",
          accountNumber: "1",
          amount: 200,
          attachments: [
            { storageId: fileA, name: "flights.pdf" },
            { storageId: fileB, name: "hotel.png" },
          ],
        },
        {
          accountName: "Vendor Pty Ltd",
          bsb: "222222",
          accountNumber: "2",
          amount: 100,
          attachments: [{ storageId: fileC, name: "invoice.pdf" }],
        },
      ],
    });

    const updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.receipt?.totalAmount).toBe(300);

    const receipts = (await asUser(t, FIONA).query(api.requests.receiptAttachments, {
      requestId: request._id,
    }))!;
    expect(receipts).toHaveLength(2);
    expect(receipts[0].attachments.map((a) => a.name)).toEqual([
      "flights.pdf",
      "hotel.png",
    ]);
    expect(receipts[1].attachments[0].url).toBeTruthy();

    (await rachel.query(api.requests.receiptAttachments, { requestId: request._id }))!;
    expect(
      await asUser(t, HENRY).query(api.requests.receiptAttachments, {
        requestId: request._id,
      })
    ).toBeNull();

    const requesterView = await rachel.query(api.requests.get, {
      requestId: request._id,
    });
    expect(requesterView?.receipt?.recipients).toHaveLength(2);
    const unrelatedView = await asUser(t, HENRY).query(api.requests.get, {
      requestId: request._id,
    });
    expect(unrelatedView?.receipt?.totalAmount).toBe(300);
    expect(unrelatedView?.receipt?.recipients).toEqual([]);

    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: FIONA,
      toEmail: HENRY,
    });
    const delegateView = await asUser(t, HENRY).query(api.requests.get, {
      requestId: request._id,
    });
    expect(delegateView?.receipt?.recipients).toHaveLength(2);
    const delegateFiles = await asUser(t, HENRY).query(api.requests.receiptAttachments, {
      requestId: request._id,
    });
    expect(delegateFiles).toHaveLength(2);
  });

  test("requests can be submitted on behalf of another department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, {
        description: "x", amount: 100, department: "Events",
      })
    ).rejects.toThrow(/Head for the Events/);

    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations", headEmail: "evan@sow.org.au",
    });
    await asUser(t, RACHEL).mutation(api.requests.submit, {
      description: "conference", amount: 100, department: "Events",
    });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(request.department).toBe("Events");
    expect(request.approvedByHOD).toBe("PENDING");

    const evanReview = (await asUser(t, "evan@sow.org.au").query(api.requests.toReview, {}))!;
    expect(evanReview.hod.map((r) => r._id)).toContain(request._id);
    const henryReview = (await asUser(t, HENRY).query(api.requests.toReview, {}))!;
    expect(henryReview.hod).toHaveLength(0);

    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, {
        description: "x", amount: 10, department: "Nope",
      })
    ).rejects.toThrow(/doesn't exist/);
  });

  test("a division head submitting outside their division gets a normal HOD step", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Operations", headEmail: "diana@sow.org.au",
    });
    await asUser(t, "diana@sow.org.au").mutation(api.requests.submit, {
      description: "x", amount: 60, department: "Marketing",
    });
    const [request] = (await asUser(t, "diana@sow.org.au").query(api.requests.myRequests, {}))!;
    expect(request.department).toBe("Marketing");
    expect(request.approvedByHOD).toBe("PENDING");
  });

  test("a person can hold multiple roles (division head + department head)", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Engagement", headEmail: "maria@sow.org.au",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: "maria@sow.org.au",
    });
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    const engagement = chart.divisions.find((d) => d.name === "Engagement");
    expect(engagement?.head?.email).toBe("maria@sow.org.au");
    const marketing = engagement?.departments.find((d) => d.name === "Marketing");
    expect(marketing?.head?.email).toBe("maria@sow.org.au");

    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        roles: ["Staff"],
      })
    ).rejects.toThrow(/Department/);

    const maria = asUser(t, "maria@sow.org.au");
    await maria.mutation(api.requests.submit, { description: "x", amount: 50 });
    const [request] = (await maria.query(api.requests.myRequests, {}))!;
    expect(request.department).toBe("Marketing");
    expect(request.approvedByHOD).toBe("APPROVED");
  });

  test("Finance dept head can also head the Operations division; Governance division head works", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Operations", headEmail: FIONA,
    });
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(chart.divisions.find((d) => d.name === "Operations")?.head?.email).toBe(FIONA);
    expect(
      chart.divisions
        .find((d) => d.name === "Governance")
        ?.departments.find((d) => d.name === "Finance")?.head?.email
    ).toBe(FIONA);

    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: request._id, step: "financeHead" });

    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations", headEmail: "evan@sow.org.au",
    });
    await asUser(t, FIONA).mutation(api.requests.submit, {
      description: "ops gear", amount: 100, department: "Events",
    });
    const fionaRequests = (await asUser(t, FIONA).query(api.requests.myRequests, {}))!;
    expect(fionaRequests.find((r) => r.department === "Events")?.approvedByHOD).toBe("APPROVED");

    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Governance", headEmail: "gina@sow.org.au",
    });
    const chart2 = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(chart2.divisions.find((d) => d.name === "Governance")?.head?.email).toBe(
      "gina@sow.org.au"
    );
    await asUser(t, "gina@sow.org.au").mutation(api.requests.submit, {
      description: "governance", amount: 80,
    });
    const [ginaRequest] = (await asUser(t, "gina@sow.org.au").query(api.requests.myRequests, {}))!;
    expect(ginaRequest.department).toBe("Compliance");
    expect(ginaRequest.approvedByHOD).toBe("APPROVED");
    expect(ginaRequest.approvedByBudgetManager).toBe("PENDING");
  });

  test("Heads of Division belong to a division and skip the HOD step", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Engagement", headEmail: "diana@sow.org.au",
    });
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    expect(chart.divisions.find((d) => d.name === "Engagement")?.head?.email).toBe(
      "diana@sow.org.au"
    );
    const diana = asUser(t, "diana@sow.org.au");
    await diana.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await diana.query(api.requests.myRequests, {}))!;
    expect(request.department).toBe("Alumni");
    expect(request.approvedByHOD).toBe("APPROVED");
    expect(request.approvedByBudgetManager).toBe("PENDING");
    await expect(
      admin.mutation(api.admin.upsertDepartment, {
        year: YEAR, name: "SomeDept", division: "Nope",
      })
    ).rejects.toThrow(/division/i);
  });
});
