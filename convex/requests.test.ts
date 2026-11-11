import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import {
  appUrl,
  involvedApproverEmails,
  makeApproverResolver,
  nextApproverEmail,
  nextApproverWithYear,
  requestUrl,
} from "./requests";
import { linkUserProfiles } from "./userLink";
import { Id } from "./_generated/dataModel";
import {
  type T,
  MINUTE,
  DAY,
  PINNED_NOW,
  YEAR,
  ADMIN,
  newConvex,
  asUser,
  pinClock,
  storedReceipt,
} from "../test/convexFixture";
import { HENRY, RACHEL, FIONA, BELLA, DAN, reimbursementSetup } from "../test/requestFlows";

const FIRST_PAGE = { paginationOpts: { numItems: 50, cursor: null } };
pinClock();


const setup = (convex?: T) => reimbursementSetup(convex, { director: true });

async function approveAll(t: T, requestId: Id<"requests">) {
  await asUser(t, HENRY).mutation(api.requests.approve, { requestId, step: "hod" });
  await asUser(t, BELLA).mutation(api.requests.approve, { requestId, step: "budgetManager" });
  await asUser(t, FIONA).mutation(api.requests.approve, { requestId, step: "financeHead" });
}

async function pendingRequest(t: T, amount = 100) {
  await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount });
  return (await asUser(t, RACHEL).query(api.requests.myRequests, {}))![0]._id;
}

async function approvedRequest(t: T, amount = 100) {
  const requestId = await pendingRequest(t, amount);
  await approveAll(t, requestId);
  return requestId;
}

describe("approvalPreview", () => {
  test("shows the chain a request will take, adding the Director at the threshold", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    const small = await rachel.query(api.requests.approvalPreview, { department: "Marketing", amount: 200 });
    expect(small?.map((s) => [s.step, s.skipped])).toEqual([
      ["hod", false],
      ["budgetManager", false],
      ["financeHead", false],
    ]);
    const big = await rachel.query(api.requests.approvalPreview, { department: "Marketing", amount: 5000 });
    expect(big?.map((s) => s.step)).toEqual(["hod", "budgetManager", "director", "financeHead"]);
    expect(big?.find((s) => s.step === "director")?.label).toBe("Director");
  });

  test("marks the steps the requester's own role skips, like submit does", async () => {
    const t = await setup();
    const preview = await asUser(t, BELLA).query(api.requests.approvalPreview, {
      department: "Finance",
      amount: 100,
    });
    expect(preview?.map((s) => [s.step, s.skipped])).toEqual([
      ["hod", true],
      ["budgetManager", true],
      ["financeHead", false],
    ]);
  });

  test("is nothing for an unknown department or a caller with no profile", async () => {
    const t = await setup();
    expect(await asUser(t, RACHEL).query(api.requests.approvalPreview, { department: "Nowhere", amount: 50 })).toBeNull();
    expect(await asUser(t, RACHEL).query(api.requests.approvalPreview, { department: " ", amount: 50 })).toBeNull();
    expect(await asUser(t, "stranger@sow.org.au").query(api.requests.approvalPreview, { department: "Marketing", amount: 50 })).toBeNull();
  });
});

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
    const henryFeed = await asUser(t, HENRY).query(api.notifications.feed, FIRST_PAGE).then((r) => r?.page);
    const rachelFeed = await asUser(t, RACHEL).query(api.notifications.feed, FIRST_PAGE).then((r) => r?.page);
    expect(henryFeed![0].title).toMatch(/approval/i);
    expect(rachelFeed![0].title).toMatch(/approval/i);
  });

  test("a delegate is nudged and told about a cancel along with the Head they cover", async () => {
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
    await asUser(t, JUSTIN).mutation(api.requests.submit, { description: "needs hod", amount: 50 });
    const [req] = (await asUser(t, JUSTIN).query(api.requests.myRequests, {}))!;
    const titles = async (email: string) =>
      (await asUser(t, email).query(api.notifications.feed, FIRST_PAGE))!.page.map((n) => n.title);

    await asUser(t, JUSTIN).mutation(api.requests.nudge, { requestId: req._id });
    for (const email of [HENRY, RACHEL]) {
      expect((await titles(email))[0]).toBe("You've been nudged");
    }

    await asUser(t, JUSTIN).mutation(api.requests.cancel, { requestId: req._id });
    for (const email of [HENRY, RACHEL]) {
      expect((await titles(email))[0]).toBe("Request cancelled");
    }
    expect(await titles(JUSTIN)).toEqual([]);
  });
});

describe("in-app notifications", () => {
  test("a decline notifies the approvers who already approved, except the decliner", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Finance",
      division: "Governance",
      headEmail: HENRY,
    });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: request._id,
      step: "financeHead",
      reason: "no funds",
    });
    const declined = async (email: string) =>
      (await asUser(t, email).query(api.notifications.feed, FIRST_PAGE))!.page.filter(
        (n) => n.title === "Request declined"
      );
    expect(await declined(BELLA)).toHaveLength(1);
    expect(await declined(HENRY)).toEqual([]);
  });

  test("a flow event notifies the recipient, not the actor", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    expect(await asUser(t, RACHEL).query(api.notifications.unreadCount, {})).toBe(0);
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(1);
    const feed = await asUser(t, HENRY).query(api.notifications.feed, FIRST_PAGE).then((r) => r?.page);
    expect(feed).toHaveLength(1);
    expect(feed![0].read).toBe(false);
    expect(feed![0].title).toMatch(/approval/i);
  });

  test("mark one / mark all read clears the unread count", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "a", amount: 100 });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "b", amount: 200 });
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(2);
    const feed = await asUser(t, HENRY).query(api.notifications.feed, FIRST_PAGE).then((r) => r?.page);
    await asUser(t, HENRY).mutation(api.notifications.markRead, { id: feed![0].id });
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(1);
    const marked = await asUser(t, HENRY).mutation(api.notifications.markAllRead, {});
    expect(marked).toHaveLength(1);
    expect(marked).not.toContain(feed![0].id);
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(0);
    expect(await asUser(t, HENRY).mutation(api.notifications.markAllRead, {})).toEqual([]);
  });

  test("a notification can only be marked read by its owner", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const feed = await asUser(t, HENRY).query(api.notifications.feed, FIRST_PAGE).then((r) => r?.page);
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

  test("marking all read hands back at most 500 ids, and marks every one", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 520; i++) {
        await ctx.db.insert("notifications", { userEmail: HENRY, title: `n${i}`, body: "", read: false });
      }
    });
    const marked = await asUser(t, HENRY).mutation(api.notifications.markAllRead, {});
    expect(marked).toHaveLength(500);
    expect(await asUser(t, HENRY).query(api.notifications.unreadCount, {})).toBe(0);
  });

  test("the feed pages newest first, and is null while signed out", async () => {
    const t = await setup();
    for (const description of ["a", "b", "c"]) {
      await asUser(t, RACHEL).mutation(api.requests.submit, { description, amount: 100 });
    }
    const firstPage = (await asUser(t, HENRY).query(api.notifications.feed, {
      paginationOpts: { numItems: 2, cursor: null },
    }))!;
    expect(firstPage.page).toHaveLength(2);
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.page[0].at).toBeGreaterThanOrEqual(firstPage.page[1].at);
    expect(firstPage.page[0]).toMatchObject({ read: false, url: "/?tab=review" });
    const secondPage = (await asUser(t, HENRY).query(api.notifications.feed, {
      paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
    }))!;
    expect(secondPage.page).toHaveLength(1);
    expect(secondPage.isDone).toBe(true);
    const ids = [...firstPage.page, ...secondPage.page].map((n) => n.id);
    expect(new Set(ids).size).toBe(3);
    expect(
      await t.query(api.notifications.feed, { paginationOpts: { numItems: 2, cursor: null } })
    ).toBeNull();
    const oldApp = (await asUser(t, HENRY).query(api.notifications.feed, {
      paginationOpts: { numItems: 1, cursor: null },
      appVersion: "1.0.0",
    }))!;
    expect(oldApp.page[0].url).toBe("/?tab=review");
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
  test("can't be submitted while the Finance department has no head", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, { year: YEAR, name: "Finance", division: "Governance" });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 })
    ).rejects.toThrow(/has no Head for the Finance department/);
  });

  test("the requester can't approve a step of their own request", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await expect(
      asUser(t, RACHEL).mutation(api.requests.approve, { requestId: request._id, step: "hod" })
    ).rejects.toThrow(/can't review your own request/);
  });

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

    await approveAll(t, request._id);

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

  test("Human Resources division members are admins only once chosen", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "pnc@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "People and Culture",
    });
    await expect(
      asUser(t, "pnc@sow.org.au").query(api.admin.listStaffProfiles, { year: YEAR })
    ).rejects.toThrow(/Only admins/);
    await t.mutation(internal.admins.add, { email: "pnc@sow.org.au", addedBy: ADMIN });
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
    const churchId = await t.run((ctx) =>
      ctx.db.insert("churches", { name: "SOW City Church", nameKey: "sow city church", addedBy: ADMIN })
    );
    await rachelSignedIn.mutation(api.profile.setChurch, { churchId });

    const viewed = (await asUser(t, HENRY).query(api.profile.get, { email: RACHEL }))!;
    expect(viewed.isMe).toBe(false);
    expect(viewed.name).toBe("Rachel R");
    expect(viewed.church?.name).toBe("SOW City Church");
    expect(viewed.serviceHistory).toEqual([
      {
        year: YEAR,
        roles: ["Staff"],
        assignments: [{ role: "Staff", department: "Marketing" }],
        department: "Marketing",
        division: null,
        university: null,
        roleTitles: {},
      },
      {
        year: YEAR - 1,
        roles: ["Staff"],
        assignments: [{ role: "Staff", department: "Events" }],
        department: "Events",
        division: null,
        university: null,
        roleTitles: {},
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
    await t.run((ctx) => linkUserProfiles(ctx, bellaUserId));
    const bound = await t.run(async (ctx) =>
      (await ctx.db.query("staffProfiles").take(100)).find((p) => p.email === BELLA)
    );
    expect(bound?.userId).toBe(bellaUserId);

    const rachelUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: RACHEL, name: "Rachel R" })
    );
    await t.run((ctx) => linkUserProfiles(ctx, rachelUserId));
    await t.run((ctx) =>
      ctx.db.patch("users", rachelUserId, { email: "rachel.renamed@sow.org.au" })
    );
    await t.run((ctx) => linkUserProfiles(ctx, rachelUserId));

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
    await t.run((ctx) => linkUserProfiles(ctx, fionaUserId));
    await t.run((ctx) =>
      ctx.db.patch("users", fionaUserId, { email: "fiona.new@sow.org.au" })
    );
    await t.run((ctx) => linkUserProfiles(ctx, fionaUserId));
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
    await t.run(async (ctx) => {
      const bella = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", BELLA).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", bella!._id, { name: "Bella Budget" });
    });

    const trail = (await asUser(t, HENRY).query(api.requests.auditTrail, {
      requestId: request._id,
    }))!;
    // Newest first.
    expect(trail.map((e) => [e.action, e.step, e.actor])).toEqual([
      ["paid", null, FIONA],
      ["receipt-submitted", null, HENRY],
      ["approved", "financeHead", FIONA],
      ["approved", "budgetManager", BELLA],
      ["auto-approved", "hod", HENRY],
      ["submitted", null, HENRY],
    ]);
    expect(trail.every((e) => typeof e.at === "number")).toBe(true);
    expect(trail[0].detail).toBe("$90");
    expect(trail.map((e) => e.actorName)).toEqual([FIONA, HENRY, FIONA, "Bella Budget", HENRY, HENRY]);

    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "y", amount: 50 });
    const [declined] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: declined._id, step: "hod", reason: "Too dear",
    });
    const declinedTrail = (await asUser(t, RACHEL).query(api.requests.auditTrail, {
      requestId: declined._id,
    }))!;
    expect(declinedTrail[0]).toMatchObject({
      action: "declined", step: "hod", actor: HENRY, detail: "Too dear",
    });
  });

  test("only people on a request can read it, its trail, its steps and its comments", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email: DAN,
      roles: ["Staff"],
      department: "Marketing",
    });
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email: "olly@sow.org.au",
      roles: ["Staff"],
      department: "Events",
    });
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "posters", amount: 120 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    await asUser(t, HENRY).mutation(api.comments.add, { requestId: request._id, body: "Which printer?" });

    const reads = async (email: string) => {
      const as = asUser(t, email);
      return {
        get: (await as.query(api.requests.get, { requestId: request._id })) !== null,
        trail: (await as.query(api.requests.auditTrail, { requestId: request._id })) !== null,
        step: (await as.query(api.requests.stepInfo, { requestId: request._id, step: "hod" })) !== null,
        actors: (await as.query(api.requests.stepActors, { requestId: request._id })) !== null,
        comments: (await as.query(api.comments.list, { requestId: request._id })) !== null,
        unread: (await as.query(api.comments.unreadCount, { requestId: request._id })) !== null,
      };
    };
    const all = { get: true, trail: true, step: true, actors: true, comments: true, unread: true };
    const none = { get: false, trail: false, step: false, actors: false, comments: false, unread: false };

    expect(await reads(RACHEL)).toEqual(all);
    expect(await reads(HENRY)).toEqual(all);
    expect(await reads(BELLA)).toEqual(all);
    expect(await reads(FIONA)).toEqual(all);
    expect(await reads("olly@sow.org.au")).toEqual(none);
    expect(await reads(DAN)).toEqual(none);
    await expect(
      asUser(t, "olly@sow.org.au").mutation(api.comments.add, { requestId: request._id, body: "hi" })
    ).rejects.toThrow(/not found/);

    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
      headEmail: DAN,
    });
    expect(await reads(HENRY)).toEqual(all);
    expect(await reads(DAN)).toEqual(all);
    expect(await t.query(api.requests.get, { requestId: request._id })).toBeNull();
  });

  test("someone covering for an approver can read the request", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "banner", amount: 80 });
    const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    const OLLY = "olly@sow.org.au";
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email: OLLY,
      roles: ["Staff"],
      department: "Events",
    });
    expect(await asUser(t, OLLY).query(api.requests.auditTrail, { requestId: request._id })).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.insert("approverDelegations", { year: YEAR, fromEmail: HENRY, toEmail: OLLY });
    });
    expect(await asUser(t, OLLY).query(api.requests.auditTrail, { requestId: request._id })).not.toBeNull();
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
    await approveAll(t, waitingReceipt._id);

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

  test("departments with open requests or staff still in them can't be deleted", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    await expect(
      admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Marketing" })
    ).rejects.toThrow(/Marketing is still assigned to .* Reassign them first\./);
    const structure0 = (await admin.query(api.directory.yearStructure, { year: YEAR }))!;
    expect(structure0.departments.map((d) => d.name)).toContain("Marketing");

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

    for (const job of ["design", "marketingForm"] as const) {
      await admin.mutation(api.teams.set, { year: YEAR, job, department: "Finance" });
    }
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
    const lastYear = { financeDepartment: "Finance", hodEmail: HENRY, budgetManagerEmail: undefined, financeHeadEmail: undefined };
    const thisYear = { financeDepartment: "Finance", hodEmail: HENRY, budgetManagerEmail: BELLA, financeHeadEmail: FIONA };
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
        financeDepartment: "Finance",
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
      financeDepartment: "Finance",
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
    const t = newConvex();
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
    const id = await approvedRequest(t);

    const attempt = (recipient: {
      accountName: string;
      bsb: string;
      accountNumber: string;
      amount: number;
      attachments?: { storageId: Awaited<ReturnType<typeof storedReceipt>>["storageId"]; name: string }[];
    }) =>
      rachel.mutation(api.requests.submitReceipt, {
        requestId: id,
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
        requestId: id,
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
      asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 0 })
    ).rejects.toThrow(/positive/);
  });

  test("receipt attachment limits reject oversized payloads", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    const id = await approvedRequest(t);

    const file = await storedReceipt(t);
    const attempt = (recipients: {
      accountName: string;
      bsb: string;
      accountNumber: string;
      amount: number;
      attachments?: { storageId: typeof file.storageId; name: string }[];
    }[]) =>
      rachel.mutation(api.requests.submitReceipt, {
        requestId: id,
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
          new Blob(["x".repeat(5 * 1024 * 1024 + 1)], {
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
    ).rejects.toThrow(/5MB or smaller/i);

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
    vi.useFakeTimers({ now: new Date(Date.UTC(YEAR, 5, 1)), toFake: ["Date"] });
    try {
      const t = await setup();
      const rachel = asUser(t, RACHEL);
      await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
      const [request] = (await rachel.query(api.requests.myRequests, {}))!;
      const staleFile = await storedReceipt(t);

      vi.setSystemTime(new Date(Date.UTC(YEAR, 5, 1, 0, 1)));
      await approveAll(t, request._id);

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
    const t = newConvex();
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

  test("the Director is an admin; division heads, HR's included, aren't", async () => {
    const t = await setup();
    await asUser(t, DAN).mutation(api.admin.setStaffProfile, {
      email: "new@sow.org.au", year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await asUser(t, ADMIN).mutation(api.admin.upsertDivision, {
      year: YEAR, name: "Human Resources", headEmail: "hrhead@sow.org.au",
    });
    await expect(
      asUser(t, "hrhead@sow.org.au").mutation(api.admin.setStaffProfile, {
        email: "new2@sow.org.au", year: YEAR, roles: ["Staff"], department: "Marketing",
      })
    ).rejects.toThrow(/Only admins/);
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
    const id = await approvedRequest(t, 300);

    const [fileA, fileB, fileC] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["receipt-a"], { type: "application/pdf" })),
      await ctx.storage.store(new Blob(["receipt-b"], { type: "image/png" })),
      await ctx.storage.store(new Blob(["receipt-c"], { type: "application/pdf" })),
    ]);
    await rachel.mutation(api.requests.submitReceipt, {
      requestId: id,
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

    const updated = await t.run((ctx) => ctx.db.get("requests", id));
    expect(updated?.receipt?.totalAmount).toBe(300);

    const receipts = (await asUser(t, FIONA).query(api.requests.receiptAttachments, {
      requestId: id,
    }))!;
    expect(receipts).toHaveLength(2);
    expect(receipts[0].attachments.map((a) => a.name)).toEqual([
      "flights.pdf",
      "hotel.png",
    ]);
    expect(receipts[1].attachments[0].url).toBeTruthy();

    (await rachel.query(api.requests.receiptAttachments, { requestId: id }))!;
    expect(
      await asUser(t, HENRY).query(api.requests.receiptAttachments, {
        requestId: id,
      })
    ).toBeNull();

    const requesterView = await rachel.query(api.requests.get, {
      requestId: id,
    });
    expect(requesterView?.receipt?.recipients).toHaveLength(2);
    const unrelatedView = await asUser(t, HENRY).query(api.requests.get, {
      requestId: id,
    });
    expect(unrelatedView?.receipt?.totalAmount).toBe(300);
    expect(unrelatedView?.receipt?.recipients).toEqual([]);

    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: FIONA,
      toEmail: HENRY,
    });
    const delegateView = await asUser(t, HENRY).query(api.requests.get, {
      requestId: id,
    });
    expect(delegateView?.receipt?.recipients).toHaveLength(2);
    const delegateFiles = await asUser(t, HENRY).query(api.requests.receiptAttachments, {
      requestId: id,
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

    await approvedRequest(t);

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

describe("makeApproverResolver", () => {
  test("keys the cache by (year, department) even when the name contains a colon", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Ops: North",
      division: "Engagement",
      headEmail: HENRY,
    });
    const hods = await t.run(async (ctx) => {
      const resolve = makeApproverResolver(ctx);
      const first = await resolve(YEAR, "Ops: North");
      const again = await resolve(YEAR, "Ops: North");
      const other = await resolve(YEAR, "Marketing");
      return { first: first.hodEmail, again: again.hodEmail, other: other.hodEmail };
    });
    expect(hods).toEqual({ first: HENRY, again: HENRY, other: HENRY });
  });
});

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

describe("requestsForExport", () => {
  const seed = async (
    t: T,
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
    const t = newConvex();
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
    const t = newConvex();
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

describe("nudge", () => {
  const nudges = (t: T) =>
    t.run(async (ctx) => (await ctx.db.query("requestNudges").collect()).map((n) => n.nudgerEmail));

  test("the requester and each approver can nudge once a day", async () => {
    const t = await setup();
    const requestId = await pendingRequest(t);
    const rachel = asUser(t, RACHEL);
    expect(await rachel.query(api.requests.canNudge, { requestId })).toEqual({
      onCooldown: false,
      remainingMs: 0,
      availableAt: 0,
    });

    await rachel.mutation(api.requests.nudge, { requestId });
    const sentAt = await t.run(async (ctx) => (await ctx.db.query("requestNudges").first())!.sentAt);
    const status = (await rachel.query(api.requests.canNudge, { requestId }))!;
    expect(status.onCooldown).toBe(true);
    expect(status.availableAt).toBe(sentAt + DAY);
    expect(status.remainingMs).toBeGreaterThan(0);
    await expect(rachel.mutation(api.requests.nudge, { requestId })).rejects.toThrow(/already nudged/);

    await asUser(t, HENRY).mutation(api.requests.approve, { requestId, step: "hod" });
    await asUser(t, HENRY).mutation(api.requests.nudge, { requestId });
    vi.setSystemTime(Date.now() + 1.1 * DAY);
    await rachel.mutation(api.requests.nudge, { requestId });
    expect(await nudges(t)).toEqual([RACHEL, HENRY, RACHEL]);
  });

  test.each([
    ["once the request is completed", RACHEL, true, /already completed/],
    ["by the person it waits on", HENRY, false, /waiting on you/],
    ["by a profiled non-participant", BELLA, false, /requester or an approver/],
  ])("is refused %s", async (_, who, completed, error) => {
    const t = await setup();
    const requestId = completed ? await approvedRequest(t) : await pendingRequest(t);
    if (completed) {
      await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
        requestId,
        recipients: [
          { accountName: "R", bsb: "062000", accountNumber: "12345678", amount: 100, attachments: [await storedReceipt(t)] },
        ],
      });
      await asUser(t, FIONA).mutation(api.requests.pay, { requestId, paidAmount: 100 });
    }
    const status = await asUser(t, who).query(api.requests.canNudge, { requestId });
    expect(status === null || status.onCooldown).toBe(true);
    await expect(asUser(t, who).mutation(api.requests.nudge, { requestId })).rejects.toThrow(error);
    expect(await nudges(t)).toEqual([]);
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
    t: T,
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
  test("this year's Finance Head and their delegate can see a carried-over request's receipt", async () => {
    vi.setSystemTime(staffYearStartMs(YEAR - 1) + 1);
    const t = newConvex();
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
    vi.setSystemTime(PINNED_NOW);
    await setup(t);
    const attachments = [await storedReceipt(t)];
    await t.run((ctx) =>
      ctx.db.patch("requests", requestId, {
        receipt: {
          totalAmount: 100,
          recipients: [{ accountName: "R", bsb: "0", accountNumber: "1", amount: 100, attachments }],
        },
      })
    );
    const names = async (email: string) =>
      (await asUser(t, email).query(api.requests.receiptAttachments, { requestId }))?.flatMap((r) =>
        r.attachments.map((a) => a.name)
      );
    expect(await names(FIONA)).toEqual(["receipt.pdf"]);
    expect(await names(HENRY)).toBeUndefined();
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, { year: YEAR, fromEmail: FIONA, toEmail: HENRY });
    expect(await names(HENRY)).toEqual(["receipt.pdf"]);
  });

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
    const t = newConvex();
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
  async function declinedRequest(t: T) {
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
  async function paidRequestWithFile(t: T) {
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
    const beforeMs = Date.now() + MINUTE;
    vi.useFakeTimers();
    try {
      await t.mutation(internal.cleanup.purgeOldReceiptFiles, { beforeMs, batch: 1 });
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
    const bellaNotes = await t.run((ctx) =>
      ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userEmail", BELLA)).collect()
    );
    expect(bellaNotes.some((n) => n.title === "Paid amount changed")).toBe(false);
  });
});

describe("browsing past years", () => {
  const seedPastRequest = async (
    t: T,
    email: string,
    year: number,
    description: string,
    open = false
  ) => {
    vi.setSystemTime(staffYearStartMs(year) + 1);
    const id = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: email,
        department: "Marketing",
        description,
        amount: 100,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: open ? "PENDING" : "APPROVED",
        approvedByFinanceHead: open ? "PENDING" : "APPROVED",
        ...(open ? {} : { paid: true }),
      })
    );
    vi.useRealTimers();
    return id;
  };

  type Review = { actor: string; action: string; daysIn: number };

  async function setupWithHistory(
    seeds: { email: string; year: number; description: string; reviews?: Review[]; open?: boolean }[]
  ) {
    const t = newConvex();
    const sorted = [...seeds].sort((a, b) => a.year - b.year);
    const reviews: (Review & { requestId: Id<"requests">; at: number })[] = [];
    for (const s of sorted) {
      const requestId = await seedPastRequest(t, s.email, s.year, s.description, s.open);
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

  test("myRequests shows this year's requests, not older years'", async () => {
    const t = await setupWithHistory([
      { email: RACHEL, year: YEAR - 2, description: "old one" },
      { email: RACHEL, year: YEAR - 2, description: "old two" },
    ]);
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "this year", amount: 50 });

    const live = (await rachel.query(api.requests.myRequests, {}))!;
    expect(live.map((r) => r.description)).toEqual(["this year"]);
  });

  test("allRequests is for Finance only", async () => {
    const t = await setupWithHistory([
      { email: RACHEL, year: YEAR - 1, description: "last year" },
    ]);

    expect(Array.isArray(await asUser(t, BELLA).query(api.requests.allRequests, {}))).toBe(true);
    await expect(asUser(t, RACHEL).query(api.requests.allRequests, {})).rejects.toThrow(/Only Finance/);
  });

  test("requestYears counts reviews of other people's requests in any year, not of one's own", async () => {
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
      {
        email: RACHEL,
        year: YEAR - 2,
        description: "carried over",
        reviews: [{ actor: HENRY, action: "approved", daysIn: 380 }],
      },
    ]);

    expect((await asUser(t, HENRY).query(api.requests.requestYears, {}))!.reviewedBefore).toBe(true);
    expect((await asUser(t, FIONA).query(api.requests.requestYears, {}))!.reviewedBefore).toBe(true);
    expect((await asUser(t, BELLA).query(api.requests.requestYears, {}))!.reviewedBefore).toBe(false);
  });

  test("earlier years page back from before this staff year, newest first", async () => {
    const t = await setupWithHistory([
      {
        email: RACHEL,
        year: YEAR - 2,
        description: "two years ago",
        reviews: [{ actor: HENRY, action: "approved", daysIn: 5 }],
      },
      {
        email: RACHEL,
        year: YEAR - 1,
        description: "last year",
        reviews: [
          { actor: HENRY, action: "approved", daysIn: 3 },
          { actor: HENRY, action: "declined", daysIn: 4 },
        ],
      },
      {
        email: HENRY,
        year: YEAR - 1,
        description: "henry's own",
        reviews: [{ actor: HENRY, action: "auto-approved", daysIn: 0 }],
      },
    ]);
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "this year", amount: 50 });
    const opts = (numItems: number, cursor: string | null = null) => ({
      paginationOpts: { numItems, cursor },
    });

    const first = (await rachel.query(api.requests.earlierMine, opts(1)))!;
    expect(first.page.map((r) => r.description)).toEqual(["last year"]);
    expect(first.isDone).toBe(false);
    const rest = (await rachel.query(api.requests.earlierMine, opts(10, first.continueCursor)))!;
    expect(rest.page.map((r) => r.description)).toEqual(["two years ago"]);
    expect(rest.isDone).toBe(true);

    const all = (await asUser(t, BELLA).query(api.requests.earlierAll, opts(10)))!;
    expect(all.page.map((r) => r.description)).toEqual(["henry's own", "last year", "two years ago"]);
    expect(await rachel.query(api.requests.earlierAll, opts(10))).toBeNull();

    const reviewed = (await asUser(t, HENRY).query(api.requests.reviewedHistory, opts(10)))!;
    expect(reviewed.page.map((r) => r.description)).toEqual(["last year", "two years ago"]);
    expect(reviewed.page[0].reviewedAt).toBeGreaterThan(reviewed.page[1].reviewedAt);

    const [lastYear] = await t.run((ctx) =>
      ctx.db
        .query("requests")
        .filter((q) => q.eq(q.field("description"), "last year"))
        .collect()
    );
    await t.run((ctx) => ctx.db.delete("requests", lastYear._id));
    const afterDelete = (await asUser(t, HENRY).query(api.requests.reviewedHistory, opts(10)))!;
    expect(afterDelete.page.map((r) => r.description)).toEqual(["two years ago"]);

    expect(await t.query(api.requests.earlierMine, opts(10))).toBeNull();
    expect(await t.query(api.requests.reviewedHistory, opts(10))).toBeNull();
  });

  test("reviewing this year's requests counts as having reviewed one", async () => {
    const t = await setupWithHistory([
      {
        email: HENRY,
        year: YEAR - 1,
        description: "own, auto-approved",
        reviews: [{ actor: HENRY, action: "auto-approved", daysIn: 1 }],
      },
    ]);
    await t.run(async (ctx) => {
      for (let i = 0; i < 51; i++) {
        const requestId = await ctx.db.insert("requests", {
          requesterEmail: RACHEL,
          department: "Marketing",
          description: `this year ${i}`,
          amount: 10,
          approvedByHOD: "APPROVED",
          approvedByBudgetManager: "PENDING",
          approvedByFinanceHead: "PENDING",
        });
        await ctx.db.insert("requestEvents", { requestId, actorEmail: HENRY, action: "approved", step: "hod" });
      }
    });
    const years = (await asUser(t, HENRY).query(api.requests.requestYears, {}))!;
    expect(years.reviewedBefore).toBe(true);
  });

  test("requestYears says whether the caller has ever reviewed someone else's request", async () => {
    const t = await setupWithHistory([
      {
        email: RACHEL,
        year: YEAR - 1,
        description: "last year",
        reviews: [{ actor: HENRY, action: "approved", daysIn: 1 }],
      },
    ]);

    expect((await asUser(t, HENRY).query(api.requests.requestYears, {}))!.reviewedBefore).toBe(true);
    const rachel = (await asUser(t, RACHEL).query(api.requests.requestYears, {}))!;
    expect(rachel.reviewedBefore).toBe(false);

    const [request] = await t.run((ctx) => ctx.db.query("requests").collect());
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++) {
        await ctx.db.insert("requestEvents", { requestId: request._id, actorEmail: HENRY, action: "nudged" });
      }
    });
    expect((await asUser(t, HENRY).query(api.requests.requestYears, {}))!.reviewedBefore).toBe(true);
  });

  test("Past holds earlier years' requests except last year's open ones, which stay on Mine", async () => {
    const t = await setupWithHistory([
      { email: RACHEL, year: YEAR - 2, description: "paid two years ago" },
      { email: RACHEL, year: YEAR - 1, description: "still open from last year", open: true },
      { email: DAN, year: YEAR - 1, description: "dan's open one", open: true },
    ]);
    const opts = { paginationOpts: { numItems: 10, cursor: null } };
    const rachel = asUser(t, RACHEL);
    const dan = asUser(t, DAN);

    const [open] = (await rachel.query(api.requests.myRequests, {}))!;
    expect(open.description).toBe("still open from last year");
    const past = (await rachel.query(api.requests.earlierMine, opts))!;
    expect(past.page.map((r) => r.description)).toEqual(["paid two years ago"]);
    expect((await rachel.query(api.requests.requestYears, {}))!.hasPast).toBe(true);

    expect((await dan.query(api.requests.myRequests, {}))!.map((r) => r.description)).toEqual([
      "dan's open one",
    ]);
    const danPast = (await dan.query(api.requests.earlierMine, opts))!;
    expect(danPast.page).toEqual([]);
    expect(danPast.isDone).toBe(true);
    expect((await dan.query(api.requests.requestYears, {}))!.hasPast).toBe(false);
    expect((await asUser(t, HENRY).query(api.requests.requestYears, {}))!.hasPast).toBe(false);

    await t.run((ctx) => ctx.db.patch("requests", open._id, { approvedByBudgetManager: "DECLINED" }));
    expect(await rachel.query(api.requests.myRequests, {})).toEqual([]);
    const afterDecline = (await rachel.query(api.requests.earlierMine, opts))!;
    expect(afterDecline.page.map((r) => r.description)).toEqual([
      "still open from last year",
      "paid two years ago",
    ]);
  });

  test("an open request from last year that Mine's 200 leaves out is on Past", async () => {
    const t = await setupWithHistory([
      { email: DAN, year: YEAR - 1, description: "dan's oldest open", open: true },
      ...Array.from({ length: 200 }, (_, i) => ({
        email: DAN,
        year: YEAR - 1,
        description: `dan open ${i}`,
        open: true,
      })),
      ...Array.from({ length: 200 }, (_, i) => ({
        email: HENRY,
        year: YEAR - 1,
        description: `henry open ${i}`,
        open: true,
      })),
    ]);
    const all = { paginationOpts: { numItems: 300, cursor: null } };
    const dan = asUser(t, DAN);
    const henry = asUser(t, HENRY);

    const danMine = (await dan.query(api.requests.myRequests, {}))!;
    expect(danMine).toHaveLength(200);
    expect(danMine.some((r) => r.description === "dan's oldest open")).toBe(false);
    const danPast = (await dan.query(api.requests.earlierMine, all))!;
    expect(danPast.page.map((r) => r.description)).toEqual(["dan's oldest open"]);
    expect((await dan.query(api.requests.requestYears, {}))!.hasPast).toBe(true);

    expect((await henry.query(api.requests.myRequests, {}))!).toHaveLength(200);
    expect((await henry.query(api.requests.earlierMine, all))!.page).toEqual([]);
    expect((await henry.query(api.requests.requestYears, {}))!.hasPast).toBe(false);
  });

  test("a Past page holding only Mine's carry-overs is empty but not the end", async () => {
    const t = await setupWithHistory([
      { email: RACHEL, year: YEAR - 2, description: "paid two years ago" },
      ...Array.from({ length: 10 }, (_, i) => ({
        email: RACHEL,
        year: YEAR - 1,
        description: `carried ${i}`,
        open: true,
      })),
    ]);
    const rachel = asUser(t, RACHEL);

    const first = (await rachel.query(api.requests.earlierMine, {
      paginationOpts: { numItems: 10, cursor: null },
    }))!;
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);
    const rest = (await rachel.query(api.requests.earlierMine, {
      paginationOpts: { numItems: 10, cursor: first.continueCursor },
    }))!;
    expect(rest.page.map((r) => r.description)).toEqual(["paid two years ago"]);
    expect(rest.isDone).toBe(true);
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
    await approveAll(t, request._id);
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
