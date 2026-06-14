/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { actionOwnerEmail } from "./requests";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const RACHEL = "rachel@sow.org.au"; // Marketing staff (requester)
const HENRY = "henry@sow.org.au"; // Marketing HOD
const BELLA = "bella@sow.org.au"; // Finance staff, Budget Manager
const FIONA = "fiona@sow.org.au"; // Finance head

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const file = async (t: TestConvex<typeof schema>) => ({
  storageId: await t.run((ctx) =>
    ctx.storage.store(new Blob(["r"], { type: "application/pdf" }))
  ),
  name: "r.pdf",
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

const submit = async (t: TestConvex<typeof schema>, amount = 100) => {
  await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount });
  const [request] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!;
  return request._id;
};

const owner = (t: TestConvex<typeof schema>, requestId: string) =>
  t.run(async (ctx) => {
    const request = await ctx.db.get("requests", requestId as never);
    return actionOwnerEmail(ctx, request!);
  });

describe("actionOwnerEmail routing", () => {
  test("pending request → the approver of the current step", async () => {
    const t = await setup();
    const id = await submit(t); // pending HOD (Henry)
    expect(await owner(t, id)).toBe(HENRY);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
    expect(await owner(t, id)).toBe(BELLA); // now Budget Manager
  });

  test("fully approved but no receipt → the requester", async () => {
    const t = await setup();
    const id = await submit(t);
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: id, step: "financeHead" });
    expect(await owner(t, id)).toBe(RACHEL);
  });

  test("receipt submitted but unpaid → the Finance Head", async () => {
    const t = await setup();
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
    const t = await setup();
    // A prior-year request, fully approved with a receipt, still unpaid. No
    // YEAR-1 Finance department exists, so the request-year Finance Head is
    // absent and routing falls back to the current year's officeholder (Fiona).
    const id = await t.run((ctx) =>
      ctx.db.insert("requests", {
        year: YEAR - 1,
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
    expect(await owner(t, id)).toBe(FIONA);
  });

  test("paid → nobody; declined → nobody", async () => {
    const t = await setup();
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
    // undefined, but t.run serializes undefined -> null over the wire.
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
    const t = await setup();
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
    // Give Rachel a profile name so the author name resolves from the profile.
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", RACHEL).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, { name: "Rachel R" });
    });
    const list = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe("hi"); // trimmed
    expect(list[0].authorEmail).toBe(RACHEL);
    expect(list[0].authorName).toBe("Rachel R"); // resolved from the profile
    expect(list[0].isMine).toBe(true);
  });

  test("rejects a comment on a missing request", async () => {
    const t = await setup();
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id });
    await expect(
      asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "hi" })
    ).rejects.toThrow(/Request not found/);
  });

  test("notification routing covers all three branches without throwing", async () => {
    const t = await setup();
    const id = await submit(t); // pending Henry
    // Requester comments → owner (Henry) is notified.
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "any update?" });
    // The action owner comments → falls back to the requester.
    await asUser(t, HENRY).mutation(api.comments.add, { requestId: id, body: "looking now" });
    // Requester comments on a completed (paid) request → owner undefined,
    // commenter is the requester → nobody notified (the undefined branch).
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

    const list = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    expect(list.map((c) => c.body)).toEqual(["any update?", "looking now"]);
  });

  test("list and unreadCount are null while auth attaches / for a missing request", async () => {
    const t = await setup();
    const id = await submit(t);
    expect(await t.query(api.comments.list, { requestId: id })).toBeNull();
    expect(await t.query(api.comments.unreadCount, { requestId: id })).toBeNull();
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id });
    expect(await asUser(t, RACHEL).query(api.comments.list, { requestId: id })).toBeNull();
  });
});

describe("unreadCount + markRead", () => {
  test("counts others' new comments, excludes own, and resets on read", async () => {
    const t = await setup();
    const id = await submit(t);
    // Henry has nothing unread yet.
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(0);

    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "one" });
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "two" });
    // Two unread for Henry; zero for Rachel (they're her own).
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(2);
    expect(await asUser(t, RACHEL).query(api.comments.unreadCount, { requestId: id })).toBe(0);

    // Henry reads them → back to zero.
    await asUser(t, HENRY).mutation(api.comments.markRead, { requestId: id });
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(0);

    // A new comment after reading is unread again (re-reading patches the marker).
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "three" });
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(1);
    await asUser(t, HENRY).mutation(api.comments.markRead, { requestId: id });
    expect(await asUser(t, HENRY).query(api.comments.unreadCount, { requestId: id })).toBe(0);
  });
});

describe("toggleReaction + list grouping", () => {
  test("adds, toggles off, and groups reactions per emoji with a mine flag", async () => {
    const t = await setup();
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "hello" });
    const [comment] = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;

    // Rachel and Henry both 👍; Henry also ❤️.
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
    expect(thumbs.mine).toBe(true); // Rachel reacted
    const heart = list[0].reactions.find((r) => r.emoji === "❤️")!;
    expect(heart).toMatchObject({ count: 1, mine: false }); // only Henry
    // Reactions are ordered by count desc.
    expect(list[0].reactions[0].emoji).toBe("👍");

    // Rachel toggles 👍 off.
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

  test("rejects empty/oversized emoji and a missing comment", async () => {
    const t = await setup();
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
    // Cancel the request (removes its comment) then react → not found.
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id });
    await expect(
      asUser(t, RACHEL).mutation(api.comments.toggleReaction, { commentId: comment.id, emoji: "👍" })
    ).rejects.toThrow(/Comment not found/);
  });
});

describe("cancel cleans up the comment thread", () => {
  test("comments, reactions and read markers go with the request", async () => {
    const t = await setup();
    const id = await submit(t);
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: id, body: "hello" });
    const [comment] = (await asUser(t, RACHEL).query(api.comments.list, { requestId: id }))!;
    await asUser(t, HENRY).mutation(api.comments.toggleReaction, { commentId: comment.id, emoji: "👍" });
    await asUser(t, HENRY).mutation(api.comments.markRead, { requestId: id });

    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: id });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("requestComments").take(10)).toHaveLength(0);
      expect(await ctx.db.query("commentReactions").take(10)).toHaveLength(0);
      expect(await ctx.db.query("commentReads").take(10)).toHaveLength(0);
    });
  });
});
