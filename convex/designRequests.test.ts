/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import {
  MARKETING_TEAM_EMAIL,
  sydneyToday,
  type DesignAnswers,
} from "../shared/designRequests";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { headRecipients } from "./designRequests";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
// Pinned mid staff year so dates a few weeks either side of "now" never
// straddle the 1 October rollover (see ADR 0003).
const PINNED_NOW = staffYearStartMs(staffYearForDate(new Date())) + 150 * DAY;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const YEAR = staffYearForDate(new Date(PINNED_NOW));
const DUE = sydneyToday(new Date(PINNED_NOW + 14 * DAY));

const ADMIN = "admin@sow.org.au";
const HENRY = "henry@sow.org.au"; // Marketing Head
const MARY = "mary@sow.org.au"; // Marketing staff
const DELIA = "delia@sow.org.au"; // covers for Henry
const RACHEL = "rachel@sow.org.au"; // Events staff
const PAUL = "paul@sow.org.au"; // Finance staff

type T = TestConvex<typeof schema>;

const asUser = (t: T, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const answers = (over: DesignAnswers = {}): DesignAnswers => ({
  department: "Events",
  types: ["event"],
  details: "SOW Camp, Sydney",
  items: ["poster", "shortFormVideo"],
  visualStyle: "Earthy greens",
  biblePassage: "Isaiah 6:8",
  keyMessage: "Here I am, send me",
  promoBudget: 250,
  dueDate: DUE,
  multipleDrafts: false,
  runByYou: true,
  ...over,
});

async function setup({ head = HENRY }: { head?: string | null } = {}) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Marketing",
    division: "Engagement",
    headEmail: head ?? undefined,
  });
  const profiles: { email: string; roles: string[]; department: string }[] = [
    { email: HENRY, roles: ["Staff"], department: "Marketing" },
    { email: MARY, roles: ["Staff"], department: "Marketing" },
    { email: DELIA, roles: ["Staff"], department: "Events" },
    { email: RACHEL, roles: ["Staff"], department: "Events" },
    { email: PAUL, roles: ["Staff"], department: "Finance" },
  ];
  for (const p of profiles) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...p });
  }
  return t;
}

const submit = (t: T, email: string, over: DesignAnswers = {}) =>
  asUser(t, email).mutation(api.designRequests.submit, { answers: answers(over) });

const getRequest = (t: T, id: Id<"designRequests">) =>
  t.run(async (ctx) => (await ctx.db.get("designRequests", id))!);

const notificationsFor = (t: T, email: string) =>
  t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .collect()
  );

const emailedTo = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((f) => f.state.kind === "pending")
      .map((f) => f.args[0] as { to: string; subject?: string })
      .filter((a) => a.subject !== undefined)
  );

const clearOutbox = (t: T) =>
  t.run(async (ctx) => {
    for (const n of await ctx.db.query("notifications").collect()) {
      await ctx.db.delete("notifications", n._id);
    }
    for (const f of await ctx.db.system.query("_scheduled_functions").collect()) {
      await ctx.scheduler.cancel(f._id);
    }
  });

const legacy = (over: Record<string, unknown> = {}) => ({
  year: YEAR - 2,
  id: "7",
  userID: "uid-rachel",
  userEmail: "Rachel@sow.org.au",
  department: "Events",
  type: { event: true, promotion: false, pr: "true", other: false },
  details: "Missions Rally",
  productType: { poster: true, facebookbanner: true, powerpointPresentation: true },
  theme: "Blue",
  example: "https://example.com",
  message: "Go",
  dueDate: Date.UTC(YEAR - 3, 11, 1),
  multipleDrafts: "false",
  runTheDesign: true,
  submittedTime: Date.UTC(YEAR - 3, 10, 1),
  approvedByHOD: "PENDING",
  comments: [],
  ...over,
});

describe("submitting", () => {
  test("needs a Marketing Head for the year", async () => {
    const t = await setup({ head: null });
    await expect(submit(t, RACHEL)).rejects.toThrow(/no Head for the Marketing department/);
  });

  test("checks the answers", async () => {
    const t = await setup();
    await expect(submit(t, RACHEL, { keyMessage: " " })).rejects.toThrow(
      'Answer "Key message".'
    );
    await expect(
      submit(t, RACHEL, { dueDate: sydneyToday(new Date(PINNED_NOW - 2 * DAY)) })
    ).rejects.toThrow(/past/);
  });

  test("numbers requests within the year and waits on the Marketing Head", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: HENRY,
      toEmail: DELIA,
    });
    const first = await submit(t, RACHEL);
    const second = await submit(t, RACHEL, { types: ["pr"], biblePassage: "dropped" });
    const [a, b] = [await getRequest(t, first), await getRequest(t, second)];
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(a.status).toBe("PENDING");
    expect(b.answers.biblePassage).toBeUndefined();
    expect(a).toMatchObject({
      department: "Events",
      dueDate: DUE,
      title: "Poster, Short Form Video (Reel)",
    });

    expect((await notificationsFor(t, HENRY)).map((n) => n.title)).toContain("Approval needed");
    expect((await notificationsFor(t, DELIA)).map((n) => n.title)).toContain("Approval needed");
    expect((await notificationsFor(t, MARY)).map((n) => n.title)).toContain(
      "New design request"
    );
    // The requester is emailed, not notified in-app about their own action.
    expect(await notificationsFor(t, RACHEL)).toEqual([]);
    const to = (await emailedTo(t)).map((e) => e.to);
    expect(to).toEqual(expect.arrayContaining([RACHEL, HENRY, DELIA, MARKETING_TEAM_EMAIL]));
    expect(to).not.toContain(MARY);
  });

  test("the Marketing Head's own request is approved straight away", async () => {
    const t = await setup();
    const id = await submit(t, HENRY);
    const request = await getRequest(t, id);
    expect(request.status).toBe("APPROVED");
    expect(request.decidedBy).toBe(HENRY);
    const events = await asUser(t, HENRY).query(api.designRequests.timeline, { id });
    expect(events!.map((e) => e.action)).toEqual(["submitted", "auto-approved"]);
    expect((await notificationsFor(t, MARY)).map((n) => n.body)).toContain(
      "Approved by the Marketing Head."
    );
  });
});

describe("the form", () => {
  test("is sent to signed-in staff", async () => {
    const t = await setup();
    const fields = await asUser(t, RACHEL).query(api.designRequestForm.fields, {});
    expect(fields!.map((f) => f.key)).toContain("biblePassage");
    expect(await t.query(api.designRequestForm.fields, {})).toBeNull();
  });
});

describe("who sees what", () => {
  test("viewer flags", async () => {
    const t = await setup();
    const viewer = (email: string) => asUser(t, email).query(api.designRequests.viewer, {});
    expect(await viewer(HENRY)).toMatchObject({
      hasMarketingHead: true,
      isMarketingHead: true,
      canSeeQueue: true,
    });
    expect(await viewer(MARY)).toMatchObject({ isMarketingStaff: true, canSeeQueue: true });
    expect(await viewer(ADMIN)).toMatchObject({ isMarketingStaff: false, canSeeQueue: true });
    expect(await viewer(RACHEL)).toMatchObject({ canSeeQueue: false });
    expect(await t.query(api.designRequests.viewer, {})).toBeNull();
  });

  test("what's waiting on each person", async () => {
    const t = await setup();
    const waiting = (email: string) =>
      asUser(t, email).query(api.designRequests.waitingOnMe, {});
    const id = await submit(t, RACHEL);
    await submit(t, HENRY);
    expect(await waiting(HENRY)).toBe(1);
    expect(await waiting(MARY)).toBe(1);
    expect(await waiting(RACHEL)).toBe(0);
    await asUser(t, HENRY).mutation(api.designRequests.approve, { id });
    expect(await waiting(HENRY)).toBe(0);
    expect(await waiting(MARY)).toBe(2);
    expect(await t.query(api.designRequests.waitingOnMe, {})).toBe(0);
  });

  test("lists, the queue and the year picker", async () => {
    const t = await setup();
    await t.mutation(internal.designRequestImport.importLegacy, {
      requests: [
        legacy({ id: "1" }),
        legacy({ id: "2", completed: true, completedTime: Date.UTC(YEAR - 3, 11, 2) }),
      ],
    });
    const mine = await submit(t, RACHEL);
    await submit(t, MARY);
    const rachel = asUser(t, RACHEL);

    // This year: this year's requests plus anything still open from before.
    const current = await rachel.query(api.designRequests.mine, {});
    expect(current!.map((r) => r.number)).toEqual([1, 1]);
    expect(current![0]._id).toBe(mine);
    expect(current!.every((r) => r.requesterEmail === RACHEL)).toBe(true);

    const past = await rachel.query(api.designRequests.mine, { year: YEAR - 2 });
    expect(past!.map((r) => r.number).sort()).toEqual([1, 2]);

    // The Marketing queue is every open request, from any year.
    expect(await rachel.query(api.designRequests.queue, {})).toBeNull();
    const queue = await asUser(t, ADMIN).query(api.designRequests.queue, {});
    expect(queue!.map((r) => `${r.year}#${r.number}`).sort()).toEqual(
      [`${YEAR}#1`, `${YEAR}#2`, `${YEAR - 2}#1`].sort()
    );
    expect(queue![0].requesterName).toBeNull();

    // The archive is one staff year, everything in it.
    expect(await rachel.query(api.designRequests.archive, { year: YEAR - 2 })).toBeNull();
    const archive = await asUser(t, MARY).query(api.designRequests.archive, {
      year: YEAR - 2,
    });
    expect(archive!.map((r) => r.number)).toEqual([2, 1]);

    expect(await rachel.query(api.designRequests.years, {})).toEqual({
      mine: [YEAR, YEAR - 2],
      all: [YEAR],
    });
    expect(await asUser(t, MARY).query(api.designRequests.years, {})).toEqual({
      mine: [YEAR],
      all: [YEAR, YEAR - 2],
    });

    expect(await t.query(api.designRequests.mine, {})).toBeNull();
    expect(await t.query(api.designRequests.years, {})).toBeNull();
  });

  test("a request is visible to its requester, Marketing and admins only", async () => {
    const t = await setup();
    const id = await submit(t, RACHEL);
    const get = (email: string, raw: string = id) =>
      asUser(t, email).query(api.designRequests.get, { id: raw });

    expect((await get(RACHEL))!.can).toEqual({
      approve: false,
      complete: false,
      edit: true,
      cancel: true,
      comment: true,
    });
    expect((await get(HENRY))!.can).toMatchObject({ approve: true, comment: true });
    expect((await get(MARY))!.can).toMatchObject({ approve: false, complete: false });
    expect((await get(ADMIN))!.can).toMatchObject({ comment: false });
    expect(await get(PAUL)).toBeNull();
    expect(await get(RACHEL, "not-an-id")).toBeNull();
    expect(await t.query(api.designRequests.get, { id })).toBeNull();
    expect(await asUser(t, PAUL).query(api.designRequests.timeline, { id })).toBeNull();
    expect(await t.query(api.designRequests.timeline, { id })).toBeNull();

    await t.run((ctx) => ctx.db.delete("designRequests", id));
    expect(await get(RACHEL)).toBeNull();
  });
});

describe("approving, declining and completing", () => {
  test("only the Marketing Head (or their cover) decides, never on their own request", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.addDelegation, {
      year: YEAR,
      fromEmail: HENRY,
      toEmail: DELIA,
    });
    const id = await submit(t, RACHEL);
    await expect(
      asUser(t, MARY).mutation(api.designRequests.approve, { id })
    ).rejects.toThrow(/Only the Marketing Head/);

    const own = await submit(t, DELIA);
    await expect(
      asUser(t, DELIA).mutation(api.designRequests.approve, { id: own })
    ).rejects.toThrow(/your own/);

    await clearOutbox(t);
    await asUser(t, DELIA).mutation(api.designRequests.approve, { id });
    const approved = await getRequest(t, id);
    expect(approved).toMatchObject({ status: "APPROVED", decidedBy: DELIA });
    expect((await notificationsFor(t, RACHEL)).map((n) => n.title)).toEqual([
      "Design request approved",
    ]);
    expect((await notificationsFor(t, MARY)).map((n) => n.title)).toEqual([
      "Design request approved",
    ]);
    expect((await emailedTo(t)).map((e) => e.to).sort()).toEqual(
      [MARKETING_TEAM_EMAIL, RACHEL].sort()
    );

    await expect(
      asUser(t, HENRY).mutation(api.designRequests.approve, { id })
    ).rejects.toThrow(/isn't waiting/);
  });

  test("declining needs a reason the requester is told", async () => {
    const t = await setup();
    const id = await submit(t, RACHEL);
    const henry = asUser(t, HENRY);
    await expect(
      henry.mutation(api.designRequests.decline, { id, reason: " " })
    ).rejects.toThrow(/give a reason/);
    await expect(
      henry.mutation(api.designRequests.decline, { id, reason: "x".repeat(5000) })
    ).rejects.toThrow(/at most/);
    await henry.mutation(api.designRequests.decline, { id, reason: "Out of scope" });
    expect(await getRequest(t, id)).toMatchObject({
      status: "DECLINED",
      declineReason: "Out of scope",
    });
    const [declined] = await notificationsFor(t, RACHEL);
    expect(declined.title).toBe("Design request declined");
    expect((await getRequest(t, id)).status).toBe("DECLINED");
    await t.run((ctx) => ctx.db.delete("designRequests", id));
    await expect(henry.mutation(api.designRequests.approve, { id })).rejects.toThrow(
      /not found/
    );
  });

  test("Marketing staff mark approved requests complete, with an optional note", async () => {
    const t = await setup();
    const id = await submit(t, RACHEL);
    const mary = asUser(t, MARY);
    await expect(mary.mutation(api.designRequests.complete, { id })).rejects.toThrow(
      /Only an approved/
    );
    await asUser(t, HENRY).mutation(api.designRequests.approve, { id });
    await expect(
      asUser(t, RACHEL).mutation(api.designRequests.complete, { id })
    ).rejects.toThrow(/Only the Marketing team/);
    await expect(
      mary.mutation(api.designRequests.complete, { id, note: "x".repeat(5000) })
    ).rejects.toThrow(/at most/);
    expect((await mary.query(api.designRequests.get, { id }))!.can.complete).toBe(true);

    await clearOutbox(t);
    await mary.mutation(api.designRequests.complete, {
      id,
      note: " Files: https://drive.example ",
    });
    const done = await getRequest(t, id);
    expect(done).toMatchObject({
      status: "COMPLETED",
      completedBy: MARY,
      completionNote: "Files: https://drive.example",
    });
    const [message] = await notificationsFor(t, RACHEL);
    expect(message.body).toContain("marked it complete.");
    const detail = await asUser(t, RACHEL).query(api.designRequests.get, { id });
    expect(detail!.completedByName).toBe(MARY);
    expect(detail!.can).toMatchObject({ edit: false, cancel: false });

    const plain = await submit(t, RACHEL);
    await asUser(t, HENRY).mutation(api.designRequests.approve, { id: plain });
    await mary.mutation(api.designRequests.complete, { id: plain, note: "  " });
    expect((await getRequest(t, plain)).completionNote).toBeUndefined();
  });
});

describe("editing and cancelling", () => {
  test("the requester edits an open request; Marketing is told what changed", async () => {
    const t = await setup();
    const id = await submit(t, RACHEL);
    const rachel = asUser(t, RACHEL);
    await expect(
      asUser(t, MARY).mutation(api.designRequests.update, { id, answers: answers() })
    ).rejects.toThrow(/your own/);

    await clearOutbox(t);
    await rachel.mutation(api.designRequests.update, { id, answers: answers() });
    expect((await getRequest(t, id)).editedAt).toBeUndefined();
    expect(await emailedTo(t)).toEqual([]);

    await rachel.mutation(api.designRequests.update, {
      id,
      answers: answers({ keyMessage: "New message", items: ["poster"] }),
    });
    const edited = await getRequest(t, id);
    expect(edited.editedAt).toBeDefined();
    expect(edited.answers.items).toEqual(["poster"]);
    expect(edited.title).toBe("Poster");
    const [henryNote] = await notificationsFor(t, HENRY);
    expect(henryNote.body).toContain("still waiting on your approval");
    const [maryNote] = await notificationsFor(t, MARY);
    expect(maryNote.body).toBe("The requester changed: What to design, Key message.");
    const events = await rachel.query(api.designRequests.timeline, { id });
    expect(events!.at(-1)).toMatchObject({
      action: "edited",
      detail: "What to design, Key message",
    });

    await asUser(t, HENRY).mutation(api.designRequests.approve, { id });
    await clearOutbox(t);
    await rachel.mutation(api.designRequests.update, {
      id,
      answers: answers({ keyMessage: "Another", items: ["poster"] }),
    });
    // Approved, so the Marketing Head is told as part of the team only.
    for (const email of [HENRY, MARY]) {
      const notes = await notificationsFor(t, email);
      expect(notes.map((n) => n.body)).toEqual(["The requester changed: Key message."]);
    }
  });

  test("an unchanged past due date can stay; a new one can't be in the past", async () => {
    const t = await setup();
    await t.mutation(internal.designRequestImport.importLegacy, { requests: [legacy()] });
    const [old] = (await asUser(t, RACHEL).query(api.designRequests.mine, {}))!;
    const keep = answers({ dueDate: old.dueDate, keyMessage: "Updated" });
    await asUser(t, RACHEL).mutation(api.designRequests.update, { id: old._id, answers: keep });
    expect((await getRequest(t, old._id)).answers.keyMessage).toBe("Updated");
    await expect(
      asUser(t, RACHEL).mutation(api.designRequests.update, {
        id: old._id,
        answers: answers({ dueDate: sydneyToday(new Date(PINNED_NOW - DAY)) }),
      })
    ).rejects.toThrow(/past/);
    await expect(
      asUser(t, RACHEL).mutation(api.designRequests.update, {
        id: old._id,
        answers: answers({ visualStyle: "" }),
      })
    ).rejects.toThrow(/Visual style/);
  });

  test("the requester cancels an open request; closed ones stay closed", async () => {
    const t = await setup();
    const pending = await submit(t, RACHEL);
    await expect(
      asUser(t, MARY).mutation(api.designRequests.cancel, { id: pending })
    ).rejects.toThrow(/your own/);
    await clearOutbox(t);
    await asUser(t, RACHEL).mutation(api.designRequests.cancel, { id: pending });
    expect((await getRequest(t, pending)).status).toBe("CANCELLED");
    expect((await notificationsFor(t, HENRY)).map((n) => n.title)).toEqual([
      "Design request cancelled",
    ]);
    await expect(
      asUser(t, RACHEL).mutation(api.designRequests.cancel, { id: pending })
    ).rejects.toThrow(/already closed/);
    await expect(
      asUser(t, RACHEL).mutation(api.designRequests.update, { id: pending, answers: answers() })
    ).rejects.toThrow(/closed/);

    const approved = await submit(t, RACHEL);
    await asUser(t, HENRY).mutation(api.designRequests.approve, { id: approved });
    await clearOutbox(t);
    await asUser(t, RACHEL).mutation(api.designRequests.cancel, { id: approved });
    // Once approved, the Marketing Head hears about it as part of the team.
    for (const email of [HENRY, MARY]) {
      expect((await notificationsFor(t, email)).map((n) => n.title)).toEqual([
        "Design request cancelled",
      ]);
    }
    expect((await emailedTo(t)).map((e) => e.to)).toEqual([MARKETING_TEAM_EMAIL]);
  });

  test("an old request goes to today's Marketing Head, or no one if there isn't one", async () => {
    const t = await setup();
    expect(await t.run((ctx) => headRecipients(ctx, YEAR - 2))).toEqual([HENRY]);
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    expect(await t.run((ctx) => headRecipients(ctx, YEAR - 2))).toEqual([]);
    await t.mutation(internal.designRequestImport.importLegacy, { requests: [legacy()] });
    const [old] = (await asUser(t, RACHEL).query(api.designRequests.mine, {}))!;
    await asUser(t, RACHEL).mutation(api.designRequests.cancel, { id: old._id });
    expect((await getRequest(t, old._id)).status).toBe("CANCELLED");
  });
});

describe("comments", () => {
  test("the requester and Marketing talk on the request; others can't", async () => {
    const t = await setup();
    const id = await submit(t, RACHEL);
    const rachel = asUser(t, RACHEL);
    const mary = asUser(t, MARY);

    await expect(
      asUser(t, PAUL).mutation(api.designRequestComments.add, { id, body: "Hi" })
    ).rejects.toThrow(/Only the requester/);
    await expect(rachel.mutation(api.designRequestComments.add, { id, body: " " })).rejects.toThrow(
      /Write a comment/
    );
    await expect(
      rachel.mutation(api.designRequestComments.add, { id, body: "x".repeat(2001) })
    ).rejects.toThrow(/too long/);
    expect(await asUser(t, PAUL).query(api.designRequestComments.list, { id })).toBeNull();
    expect(await t.query(api.designRequestComments.list, { id })).toBeNull();

    await clearOutbox(t);
    await rachel.mutation(api.designRequestComments.add, { id, body: "Can we add a flyer?" });
    expect((await notificationsFor(t, MARY))[0]).toMatchObject({
      title: "New comment",
      url: `/design-requests/${id}?thread=1`,
    });
    expect((await emailedTo(t)).map((e) => e.to)).toEqual([MARKETING_TEAM_EMAIL]);

    expect(await mary.query(api.designRequestComments.unreadCounts, { ids: [id] })).toEqual({
      [id]: 1,
    });
    expect(await rachel.query(api.designRequestComments.unreadCounts, { ids: [id] })).toEqual({});
    await mary.mutation(api.designRequestComments.markRead, { id });
    await mary.mutation(api.designRequestComments.markRead, { id });
    expect(await mary.query(api.designRequestComments.unreadCounts, { ids: [id] })).toEqual({});
    expect(await t.query(api.designRequestComments.unreadCounts, { ids: [id] })).toEqual({});

    await mary.mutation(api.designRequestComments.add, { id, body: "Sure" });
    const thread = await rachel.query(api.designRequestComments.list, { id });
    expect(thread!.map((c) => [c.body, c.isMine])).toEqual([
      ["Can we add a flyer?", true],
      ["Sure", false],
    ]);
    expect((await notificationsFor(t, RACHEL)).map((n) => n.title)).toEqual(["New comment"]);

    await rachel.mutation(api.notifications.markReadForDesignRequest, { designRequestId: id });
    expect((await notificationsFor(t, RACHEL)).every((n) => n.read)).toBe(true);
    expect(
      await t.mutation(api.notifications.markReadForDesignRequest, { designRequestId: id })
    ).toBeNull();

    await t.run((ctx) => ctx.db.delete("designRequests", id));
    await expect(rachel.mutation(api.designRequestComments.add, { id, body: "Hi" })).rejects.toThrow(
      /not found/
    );
    await expect(rachel.mutation(api.designRequestComments.markRead, { id })).rejects.toThrow(
      /not found/
    );
  });
});

describe("importing from the old web app", () => {
  test("maps old answers, people and statuses, and is safe to re-run", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", MARY).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, { importId: "uid-mary" });
      // Henry's id was kept on an old-year profile under the old domain; his
      // requests should still land on the address he signs in with now.
      await ctx.db.insert("staffProfiles", {
        email: "henry@sowaustralia.com",
        year: YEAR - 3,
        importId: "uid-henry",
      });
    });
    const batch = [
      legacy({
        id: "1",
        type: { other: true, otherText: " Retreat " },
        productType: { other: "true", otherText: "Banner", booklet: false, unknown: true },
        detailsOfEventOrProject: "Promote widely",
        extraInformation: " Thanks ",
        approvedByHOD: "APPROVED",
        approvedTime: Date.UTC(YEAR - 3, 10, 2),
        comments: [
          {
            id: "c1",
            userID: "uid-mary",
            comment: "On it",
            submittedTime: Date.UTC(YEAR - 3, 10, 3),
          },
          { id: "c2", userID: "uid-ghost", comment: "  ", submittedTime: 1 },
        ],
      }),
      legacy({
        id: "2",
        userID: "uid-ghost",
        userEmail: undefined,
        type: undefined,
        productType: undefined,
        theme: undefined,
        example: undefined,
        message: undefined,
        department: undefined,
        dueDate: undefined,
        approvedByHOD: "DECLINED",
        declinedTime: Date.UTC(YEAR - 3, 10, 4),
        reason: "No budget",
      }),
      legacy({ id: "3", userEmail: "outsider@example.com", completed: true }),
      legacy({ id: "4", userID: "uid-henry", userEmail: undefined }),
      legacy({ id: "5", userID: "uid-gone", userEmail: "Gone@sowaustralia.com" }),
    ];
    const first = await t.mutation(internal.designRequestImport.importLegacy, {
      requests: batch,
    });
    expect(first).toEqual({ inserted: 5, updated: 0, skipped: 0, comments: 1 });

    const rows = await t.run((ctx) => ctx.db.query("designRequests").collect());
    const byNumber = Object.fromEntries(rows.map((r) => [r.number, r]));
    expect(byNumber[1]).toMatchObject({
      year: YEAR - 2,
      requesterEmail: RACHEL,
      department: "Events",
      title: "Other: Banner",
      status: "APPROVED",
      legacyKey: `${YEAR - 2}/1`,
    });
    expect(byNumber[1].answers).toEqual({
      department: "Events",
      types: ["other"],
      typesOther: "Retreat",
      details: "Missions Rally\n\nDetails of the event/project to promote: Promote widely",
      items: ["other"],
      itemsOther: "Banner",
      visualStyle: "Blue\n\nExamples: https://example.com",
      keyMessage: "Go",
      dueDate: byNumber[1].dueDate,
      multipleDrafts: false,
      runByYou: true,
      otherInfo: "Thanks",
    });
    expect(byNumber[2]).toMatchObject({
      requesterEmail: "uid-ghost@legacy.invalid",
      department: "",
      title: "",
      status: "DECLINED",
      declineReason: "No budget",
    });
    expect(byNumber[2].answers).toEqual({
      dueDate: byNumber[2].dueDate,
      details: "Missions Rally",
      multipleDrafts: false,
      runByYou: true,
    });
    expect(byNumber[2].dueDate).toBe(sydneyToday(new Date(byNumber[2].submittedAt)));
    expect(byNumber[4].requesterEmail).toBe(HENRY);
    expect(byNumber[5].requesterEmail).toBe("gone@sow.org.au");
    expect(byNumber[3]).toMatchObject({
      requesterEmail: "outsider@example.com",
      status: "COMPLETED",
      title: "Facebook banner, Poster, PowerPoint presentation",
    });
    const [comment] = await t.run((ctx) => ctx.db.query("designRequestComments").collect());
    expect(comment).toMatchObject({ authorEmail: MARY, body: "On it" });
    // Imported comments never show as unread.
    expect(
      await asUser(t, RACHEL).query(api.designRequestComments.unreadCounts, {
        ids: [byNumber[1]._id],
      })
    ).toEqual({});

    // Acting on one in THE SHED protects it from being overwritten.
    await asUser(t, RACHEL).mutation(api.designRequests.cancel, { id: byNumber[1]._id });
    const again = await t.mutation(internal.designRequestImport.importLegacy, {
      requests: batch,
    });
    expect(again).toEqual({ inserted: 0, updated: 4, skipped: 1, comments: 0 });
    expect((await getRequest(t, byNumber[1]._id)).status).toBe("CANCELLED");
  });
});
