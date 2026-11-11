import { describe, expect, test, vi } from "vitest";
import { staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { actionOwnerEmail } from "./requests";
import { type T, YEAR, ADMIN, newConvex, asUser } from "../test/convexFixture";
import { HENRY, RACHEL, FIONA, BELLA, reimbursementSetup } from "../test/requestFlows";

const withScheduled = async (
  t: T,
  action: () => Promise<unknown>
) => {
  vi.useFakeTimers();
  try {
    await action();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
};

const OSCAR = "oscar@sow.org.au";

const file = async (t: T) => ({
  storageId: await t.run((ctx) =>
    ctx.storage.store(new Blob(["r"], { type: "application/pdf" }))
  ),
  name: "r.pdf",
});

const submit = async (t: T, amount = 100) => {
  await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount });
  const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
  return request._id;
};

const owner = (t: T, requestId: string) =>
  t.run(async (ctx) => {
    const request = await ctx.db.get("requests", requestId as never);
    return actionOwnerEmail(ctx, request!);
  });

describe("actionOwnerEmail routing", () => {
  test("pending request → the approver of the current step", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    expect(await owner(t, id)).toBe(HENRY);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
    expect(await owner(t, id)).toBe(BELLA);
  });

  test("fully approved but no receipt → the requester", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: id, step: "financeHead" });
    expect(await owner(t, id)).toBe(RACHEL);
  });

  test("receipt submitted but unpaid → the Finance Head", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: id, step: "financeHead" });
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "R", bsb: "0", accountNumber: "1", amount: 100, attachments: [await file(t)] },
      ],
    });
    expect(await owner(t, id)).toBe(FIONA);
  });

  test("carried-over unpaid receipt → this year's Finance Head when last year's is gone", async () => {
    vi.setSystemTime(staffYearStartMs(YEAR - 1) + 1);
    const t = newConvex();
    const id = await t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "carried",
        amount: 100,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "APPROVED",
        approvedByFinanceHead: "APPROVED",
        receipt: {
          totalAmount: 100,
          recipients: [{ accountName: "R", bsb: "0", accountNumber: "1", amount: 100, attachments: [] }],
        },
        paid: false,
      })
    );
    vi.useRealTimers();
    await reimbursementSetup(t);
    expect(await owner(t, id)).toBe(FIONA);
  });

  test("paid → nobody; declined → nobody", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: id, step: "financeHead" });
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: id,
      recipients: [
        { accountName: "R", bsb: "0", accountNumber: "1", amount: 100, attachments: [await file(t)] },
      ],
    });
    await asUser(t, FIONA).mutation(api.requests.pay, { requestId: id, paidAmount: 100 });
    expect(await owner(t, id)).toBeNull();

    const declined = await submit(t);
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: declined,
      step: "hod",
      reason: "no",
    });
    expect(await owner(t, declined)).toBeNull();
  });
});

describe("add", () => {
  test("validates body and request, and stores the comment", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await expect(
      asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "   " })
    ).rejects.toThrow(/Write a comment/);
    await expect(
      asUser(t, RACHEL).mutation(api.comments.add, {
        requestId: id,
        body: "x".repeat(2001),
      })
    ).rejects.toThrow(/too long/);

    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "  hi  " });
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", RACHEL).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, { name: "Rachel R" });
    });
    const list = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe("hi");
    expect(list[0].authorEmail).toBe(RACHEL);
    expect(list[0].authorName).toBe("Rachel R");
    expect(list[0].isMine).toBe(true);
  });

  test("comment notifications name the commenter rather than their email", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", RACHEL).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, { name: "Rachel R" });
    });
    await t.run((ctx) =>
      ctx.db.insert("pushTokens", { email: HENRY, token: "ExponentPushToken[henry]" })
    );

    const bodies: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, opts: { body: string }) => {
      const parsed = JSON.parse(opts.body);
      if (url.includes("exp.host")) bodies.push(...parsed.map((m: { body: string }) => m.body));
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
      await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "any update?" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }

    expect(bodies.some((b) => b.includes("Rachel R commented"))).toBe(true);
    expect(bodies.some((b) => b.includes(RACHEL))).toBe(false);
  });

  test("a comment notifies previous approvers, not just the current owner", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
    await t.run((ctx) =>
      ctx.db.insert("pushTokens", { email: HENRY, token: "ExponentPushToken[henry]" })
    );
    await t.run((ctx) =>
      ctx.db.insert("pushTokens", { email: BELLA, token: "ExponentPushToken[bella]" })
    );

    const pushedTokens: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, opts: { body: string }) => {
      const parsed = JSON.parse(opts.body);
      if (url.includes("exp.host")) {
        pushedTokens.push(...parsed.map((m: { to: string }) => m.to));
      }
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
      await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "any update?" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }

    expect(pushedTokens).toContain("ExponentPushToken[bella]");
    expect(pushedTokens).toContain("ExponentPushToken[henry]");
  });

  test("an earlier approver's comment still reaches the requester, once", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
    const commentNotes = (email: string) =>
      t.run(async (ctx) =>
        (
          await ctx.db
            .query("notifications")
            .withIndex("by_request", (q) => q.eq("requestId", id))
            .collect()
        ).filter((n) => n.userEmail === email && n.title === "New comment")
      );

    await asUser(t, HENRY).mutation(api.comments.add, { requestId: id, body: "approved it" });
    expect(await commentNotes(RACHEL)).toHaveLength(1);
    expect(await commentNotes(BELLA)).toHaveLength(1);
    expect(await commentNotes(HENRY)).toHaveLength(0);

    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: id, step: "financeHead" });
    await asUser(t, HENRY).mutation(api.comments.add, { requestId: id, body: "all done" });
    expect(await commentNotes(RACHEL)).toHaveLength(2);
  });

  test("rejects a comment on a missing request", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id });
    await expect(
      asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "hi" })
    ).rejects.toThrow(/Request not found/);
  });

  test("a comment reaches the owner, the requester and past approvers, never its author", async () => {
    const t = await reimbursementSetup();
    const notified = async (requestId: Awaited<ReturnType<typeof submit>>) =>
      (
        await t.run((ctx) =>
          ctx.db
            .query("notifications")
            .withIndex("by_request", (q) => q.eq("requestId", requestId))
            .collect()
        )
      )
        .filter((n) => n.title === "New comment")
        .map((n) => n.userEmail)
        .sort();

    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "any update?" });
    expect(await notified(id)).toEqual([HENRY]);
    await asUser(t, HENRY).mutation(api.comments.add, { requestId: id, body: "looking now" });
    expect(await notified(id)).toEqual([HENRY, RACHEL]);
    const thread = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    expect(thread.map((c) => c.body)).toEqual(["any update?", "looking now"]);

    const paid = await submit(t);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: paid, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: paid, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: paid, step: "financeHead" });
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: paid,
      recipients: [
        { accountName: "R", bsb: "0", accountNumber: "1", amount: 100, attachments: [await file(t)] },
      ],
    });
    await asUser(t, FIONA).mutation(api.requests.pay, { requestId: paid, paidAmount: 100 });
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: paid, body: "thanks!" });
    expect(await notified(paid)).toEqual([BELLA, FIONA, HENRY].sort());
  });

  test("list and unreadCount are null while auth attaches / for a missing request", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    expect(await t.query(api.comments.list, { requestId: id })).toBeNull();
    expect(await t.query(api.comments.unreadCount, { requestId: id })).toBeNull();
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id });
    expect(await asUser(t, RACHEL).query(api.comments.list, { requestId: id })).toBeNull();
  });
});

describe("unreadCount + markRead", () => {
  test("counts others' new comments, excludes own, and resets on read", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(0);

    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "one" });
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "two" });
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(2);
    expect(await asUser(t, RACHEL).query(api.comments.unreadCount, { requestId: id })).toBe(0);

    await asUser(t, HENRY).mutation(api.comments.markRead, { requestId: id });
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(0);

    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "three" });
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(1);
    await asUser(t, HENRY).mutation(api.comments.markRead, { requestId: id });
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(0);
  });

  test("unreadTotalForRequests sums across requests, deduped, excluding own", async () => {
    const t = await reimbursementSetup();
    const id1 = await submit(t);
    const id2 = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id1, body: "a" });
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id1, body: "b" });
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id2, body: "c" });
    expect(
      await asUser(t, HENRY).query(api.comments.unreadTotalForRequests, {
        requestIds: [id1, id2, id1],
      })
    ).toBe(3);
    expect(
      await asUser(t, RACHEL).query(api.comments.unreadTotalForRequests, {
        requestIds: [id1, id2],
      })
    ).toBe(0);
    expect(
      await t.query(api.comments.unreadTotalForRequests, { requestIds: [id1] })
    ).toBe(0);
  });

  test("unreadCountsForRequests maps per-request counts, omitting zeros", async () => {
    const t = await reimbursementSetup();
    const id1 = await submit(t);
    const id2 = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id1, body: "a" });
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id1, body: "b" });
    const counts = await asUser(t, HENRY).query(
      api.comments.unreadCountsForRequests,
      { requestIds: [id1, id2, id1] }
    );
    expect(counts[id1]).toBe(2);
    expect(counts[id2]).toBeUndefined();
    expect(
      await t.query(api.comments.unreadCountsForRequests, { requestIds: [id1] })
    ).toEqual({});
  });

  test("someone outside a request gets no unread counts for it and leaves no read marker", async () => {
    const t = await reimbursementSetup();
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email: OSCAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "private" });
    const oscar = asUser(t, OSCAR);
    expect(await oscar.query(api.comments.unreadCount, { requestId: id })).toBeNull();
    expect(await oscar.query(api.comments.unreadTotalForRequests, { requestIds: [id] })).toBe(0);
    expect(await oscar.query(api.comments.unreadCountsForRequests, { requestIds: [id] })).toEqual({});
    expect(await oscar.mutation(api.comments.markRead, { requestId: id })).toBeNull();
    await t.run(async (ctx) => {
      expect(await ctx.db.query("commentReads").take(10)).toHaveLength(0);
    });
  });

  test("myUnreadTotal counts unread comments on the caller's own requests", async () => {
    const t = await reimbursementSetup();
    expect(await asUser(t, RACHEL).query(api.comments.myUnreadTotal, {})).toBe(0);
    expect(await t.query(api.comments.myUnreadTotal, {})).toBe(0);

    const id = await submit(t);
    await asUser(t, HENRY).mutation(api.comments.add, { requestId: id, body: "a" });
    await asUser(t, HENRY).mutation(api.comments.add, { requestId: id, body: "b" });
    expect(await asUser(t, RACHEL).query(api.comments.myUnreadTotal, {})).toBe(2);

    await asUser(t, RACHEL).mutation(api.comments.markRead, { requestId: id });
    expect(await asUser(t, RACHEL).query(api.comments.myUnreadTotal, {})).toBe(0);

    expect(await asUser(t, HENRY).query(api.comments.myUnreadTotal, {})).toBe(0);
  });

  test("myUnreadTotal leaves out last year's completed requests, like the Mine list", async () => {
    const t = newConvex();
    vi.useFakeTimers({ toFake: ["Date"] });
    let paid: string;
    let open: string;
    try {
      vi.setSystemTime(staffYearStartMs(YEAR - 1) + 86_400_000);
      const seed = (extra: { paid?: boolean; receipt?: { totalAmount: number; recipients: [] } }) =>
        t.run(async (ctx) => {
          const requestId = await ctx.db.insert("requests", {
            requesterEmail: RACHEL,
            department: "Marketing",
            description: "last year",
            amount: 100,
            approvedByHOD: "APPROVED",
            approvedByBudgetManager: "APPROVED",
            approvedByFinanceHead: "APPROVED",
            ...extra,
          });
          await ctx.db.insert("requestComments", { requestId, authorEmail: HENRY, body: "hi" });
          return requestId;
        });
      paid = await seed({ paid: true, receipt: { totalAmount: 100, recipients: [] } });
      open = await seed({});
    } finally {
      vi.useRealTimers();
    }
    await reimbursementSetup(t);

    const listed = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
    expect(listed.map((r) => r._id)).toEqual([open]);
    expect(listed.map((r) => r._id)).not.toContain(paid);
    expect(await asUser(t, RACHEL).query(api.comments.myUnreadTotal, {})).toBe(1);
  });
});

describe("toggleReaction + list grouping", () => {
  test("adds, toggles off, and groups reactions per emoji with a mine flag", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "hello" });
    const [comment] = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;

    expect(
      await asUser(t, RACHEL).mutation(api.comments.toggleReaction, {
        commentId: comment.id,
        emoji: "👍",
      })
    ).toBe(true);
    await asUser(t, HENRY).mutation(api.comments.toggleReaction, { commentId: comment.id, emoji: "👍" });
    await asUser(t, HENRY).mutation(api.comments.toggleReaction, { commentId: comment.id, emoji: "❤️" });

    let list = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    const thumbs = list[0].reactions.find((r) => r.emoji === "👍")!;
    expect(thumbs.count).toBe(2);
    expect(thumbs.mine).toBe(true);
    const heart = list[0].reactions.find((r) => r.emoji === "❤️")!;
    expect(heart).toMatchObject({ count: 1, mine: false });
    expect(list[0].reactions[0].emoji).toBe("👍");

    expect(
      await asUser(t, RACHEL).mutation(api.comments.toggleReaction, {
        commentId: comment.id,
        emoji: "👍",
      })
    ).toBe(false);
    list = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    expect(list[0].reactions.find((r) => r.emoji === "👍")?.count).toBe(1);
    expect(list[0].reactions.find((r) => r.emoji === "👍")?.mine).toBe(false);
  });

  test("someone who can't see the request can't react to its comments", async () => {
    const t = await reimbursementSetup();
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email: OSCAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "hello" });
    const [comment] = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    await expect(
      asUser(t, OSCAR).mutation(api.comments.toggleReaction, { commentId: comment.id, emoji: "👍" })
    ).rejects.toThrow(/Comment not found/);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("commentReactions").take(10)).toHaveLength(0);
    });
  });

  test("rejects empty/oversized emoji and a missing comment", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "hello" });
    const [comment] = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    await expect(
      asUser(t, RACHEL).mutation(api.comments.toggleReaction, { commentId: comment.id, emoji: "   " })
    ).rejects.toThrow(/single emoji/);
    await expect(
      asUser(t, RACHEL).mutation(api.comments.toggleReaction, {
        commentId: comment.id,
        emoji: "x".repeat(17),
      })
    ).rejects.toThrow(/single emoji/);
    await withScheduled(t, () =>
      asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id })
    );
    await expect(
      asUser(t, RACHEL).mutation(api.comments.toggleReaction, { commentId: comment.id, emoji: "👍" })
    ).rejects.toThrow(/Comment not found/);
  });
});

describe("cancel cleans up the comment thread", () => {
  test("comments, reactions and read markers go with the request", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "hello" });
    const [comment] = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    await asUser(t, HENRY).mutation(api.comments.toggleReaction, { commentId: comment.id, emoji: "👍" });
    await asUser(t, HENRY).mutation(api.comments.markRead, { requestId: id });

    const notificationsBefore = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_request", (q) => q.eq("requestId", id))
        .collect()
    );
    expect(notificationsBefore.length).toBeGreaterThan(0);

    await withScheduled(t, () =>
      asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id })
    );

    await t.run(async (ctx) => {
      expect(await ctx.db.query("requestComments").take(10)).toHaveLength(0);
      expect(await ctx.db.query("commentReactions").take(10)).toHaveLength(0);
      expect(await ctx.db.query("commentReads").take(10)).toHaveLength(0);
      expect(
        await ctx.db
          .query("notifications")
          .withIndex("by_request", (q) => q.eq("requestId", id))
          .take(10)
      ).toHaveLength(0);
    });
  });

  test("reactions spread over many comments share one budget per pass", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await t.run(async (ctx) => {
      for (let c = 0; c < 3; c++) {
        const commentId = await ctx.db.insert("requestComments", {
          requestId: id,
          authorEmail: RACHEL,
          body: `c${c}`,
        });
        for (let i = 0; i < 100; i++) {
          await ctx.db.insert("commentReactions", {
            commentId,
            userEmail: `u${i}@sow.org.au`,
            emoji: "👍",
          });
        }
      }
    });
    vi.useFakeTimers();
    try {
      const more = await t.mutation(internal.requests.purgeDeletedRequestData, { requestId: id });
      expect(more).toBe(true);
      const leftAfterOnePass = await t.run((ctx) => ctx.db.query("commentReactions").collect());
      expect(leftAfterOnePass).toHaveLength(100);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.query("requestComments").take(10)).toHaveLength(0);
      expect(await ctx.db.query("commentReactions").take(10)).toHaveLength(0);
    });
  });

  test("a long thread is purged across several batched passes", async () => {
    const t = await reimbursementSetup();
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "hello" });
    const [comment] = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    await t.run(async (ctx) => {
      for (let i = 0; i < 205; i++) {
        await ctx.db.insert("commentReactions", {
          commentId: comment.id,
          userEmail: `u${i}@sow.org.au`,
          emoji: "👍",
        });
      }
      for (let i = 0; i < 201; i++) {
        await ctx.db.insert("commentReads", {
          requestId: id,
          userEmail: `u${i}@sow.org.au`,
          lastReadAt: Date.now(),
        });
      }
    });

    vi.useFakeTimers();
    try {
      const firstPassScheduledMore = await t.mutation(
        internal.requests.purgeDeletedRequestData,
        { requestId: id }
      );
      expect(firstPassScheduledMore).toBe(true);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await withScheduled(t, () =>
      asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id })
    );

    await t.run(async (ctx) => {
      expect(await ctx.db.query("requestComments").take(10)).toHaveLength(0);
      expect(await ctx.db.query("commentReactions").take(10)).toHaveLength(0);
      expect(await ctx.db.query("commentReads").take(10)).toHaveLength(0);
    });
  });
});
