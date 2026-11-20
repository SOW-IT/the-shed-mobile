import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { EVERYONE, type Audience } from "../shared/announcements";
import { type Assignment, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type T,
  MINUTE,
  HOUR,
  DAY,
  PINNED_NOW,
  YEAR,
  ADMIN,
  USYD,
  UNSW,
  asUser,
  seeded,
  notificationsFor,
} from "../test/convexFixture";

const aboutMs = (ms: number) => expect.closeTo(ms, -1);

const HR = "hannah@sow.org.au";
const IT_HEAD = "ian@sow.org.au";
const FIN = "fiona@sow.org.au";
const LEADER = "luke@sow.org.au";
const PRES = "penny@sow.org.au";

const okFetch = () =>
  vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ status: "ok" }] }),
      text: () => Promise.resolve(""),
    })
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(PINNED_NOW);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_FROM_EMAIL", "noreply@sow.org.au");
  vi.stubGlobal("fetch", okFetch());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setup() {
  const t = await seeded();
  await t.mutation(internal.admins.add, { email: HR, addedBy: ADMIN });
  const people: [string, string, Assignment[]][] = [
    [HR, "Hannah", [{ role: "Staff", department: "People and Culture" }]],
    [IT_HEAD, "Ian", [{ role: "Head of Department", department: "Data and IT" }]],
    [FIN, "Fiona", [{ role: "Staff", department: "Finance" }]],
    [
      LEADER,
      "Luke",
      [
        { role: "Student Leader", university: UNSW },
        { role: "Staff", department: "Events" },
      ],
    ],
    [PRES, "Penny", [{ role: "President", university: USYD }]],
  ];
  await t.run(async (ctx) => {
    const admin = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", ADMIN).eq("year", YEAR))
      .unique();
    await ctx.db.patch("staffProfiles", admin!._id, { name: "Ada Admin" });
    for (const [email, name, assignments] of people) {
      await ctx.db.insert("staffProfiles", { email, year: YEAR, name, assignments });
    }
    await ctx.db.insert("staffProfiles", {
      email: "old@sow.org.au",
      year: YEAR - 1,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    await ctx.db.insert("pushTokens", { email: FIN, token: "ExponentPushToken[fin]" });
    await ctx.db.insert("pushTokens", { email: LEADER, token: "ExponentPushToken[luke]" });
  });
  return t;
}

const audience = (partial: Partial<Audience>): Audience => ({ ...EVERYONE, ...partial });

const draft = (
  over: Partial<{
    title: string;
    message: string;
    sendEmail: boolean;
    emailWithoutApp: boolean;
    audience: Audience;
    people: string[];
    sendAt: number;
  }> = {}
) => ({
  title: "Staff meeting moved",
  message: "This week's staff meeting is on Thursday at 7pm.",
  sendEmail: false,
  audience: EVERYONE,
  ...over,
});

const announcement = (t: T, id: Id<"announcements">) =>
  t.run((ctx) => ctx.db.get("announcements", id));

describe("who can use announcements", () => {
  test("admins, chosen ones included, get the picker; other staff and guests get nothing", async () => {
    const t = await setup();
    const options = await asUser(t, ADMIN).query(api.announcements.options, {});
    expect(options?.campuses).toContain(UNSW);
    expect(options?.divisions).toEqual(
      expect.arrayContaining(["Governance", "Human Resources"])
    );
    expect(options?.departments).toContainEqual({ name: "Finance", division: "Governance" });
    expect(options?.roles).toEqual(["Staff", "Student Leader", "President", "Head of Department"]);
    expect(await asUser(t, HR).query(api.announcements.options, {})).not.toBeNull();

    expect(await asUser(t, FIN).query(api.announcements.options, {})).toBeNull();
    expect(await t.query(api.announcements.options, {})).toBeNull();
    expect(await asUser(t, FIN).query(api.announcements.audienceSize, { audience: EVERYONE })).toBeNull();
    expect(await asUser(t, FIN).query(api.announcements.list, {})).toBeNull();
    await expect(asUser(t, FIN).mutation(api.announcements.send, draft())).rejects.toThrow(
      /Only admins/
    );
  });
});

describe("audienceSize", () => {
  test("counts this year's leaders the audience reaches, and those with the app", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const size = async (a: Partial<Audience>) => {
      const result = await admin.query(api.announcements.audienceSize, { audience: audience(a) });
      return { people: result?.people, withApp: result?.withApp };
    };

    expect(await size({})).toEqual({ people: 6, withApp: 2 });
    expect(await size({ departments: ["Finance"] })).toEqual({ people: 1, withApp: 1 });
    expect(await size({ divisions: ["Governance"] })).toEqual({ people: 3, withApp: 1 });
    expect(await size({ campuses: [UNSW, USYD] })).toEqual({ people: 2, withApp: 1 });
    expect(await size({ campuses: [USYD], departments: ["Finance"] })).toEqual({ people: 2, withApp: 1 });
    expect(await size({ roles: ["Staff"] })).toEqual({ people: 4, withApp: 2 });
    expect(await size({ campuses: [UNSW, USYD], roles: ["President"] })).toEqual({ people: 1, withApp: 0 });
    expect(await size({ campuses: [UNSW], roles: ["Staff"] })).toEqual({ people: 0, withApp: 0 });
    expect(await size({ departments: [" Finance ", "Finance", ""] })).toEqual({ people: 1, withApp: 1 });
  });
});

describe("who may not get a push", () => {
  test("lists everyone a push can't reach, by name, and why", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("appInstalls", { email: PRES, platform: "ios", version: "2.4.0", seenAt: PINNED_NOW });
      for (const email of ["dee@sow.org.au", "zed@sow.org.au"]) {
        await ctx.db.insert("staffProfiles", {
          email,
          year: YEAR,
          assignments: [{ role: "Staff", department: "Events" }],
        });
      }
      await ctx.db.insert("directoryUsers", { email: "dee@sow.org.au", name: "Dee Directory" });
    });
    const admin = asUser(t, ADMIN);
    expect(await admin.query(api.announcements.audienceSize, { audience: EVERYONE })).toEqual({
      people: 8,
      withApp: 2,
      withoutApp: [
        { email: ADMIN, name: "Ada Admin", reason: "noApp" },
        { email: "dee@sow.org.au", name: "Dee Directory", reason: "noApp" },
        { email: HR, name: "Hannah", reason: "noApp" },
        { email: IT_HEAD, name: "Ian", reason: "noApp" },
        { email: PRES, name: "Penny", reason: "notificationsOff" },
        { email: "zed@sow.org.au", name: "zed@sow.org.au", reason: "noApp" },
      ],
    });
    expect(
      (await admin.query(api.announcements.options, {}))?.people.find((p) => p.email === "dee@sow.org.au")
    ).toEqual({ email: "dee@sow.org.au", name: "Dee Directory", detail: "Events" });
    expect(
      await admin.query(api.announcements.audienceSize, {
        audience: audience({ departments: ["Finance"] }),
      })
    ).toEqual({ people: 1, withApp: 1, withoutApp: [] });
  });
});

describe("choosing people", () => {
  test("the picker lists this year's leaders by name, with what they do", async () => {
    const t = await setup();
    const options = await asUser(t, ADMIN).query(api.announcements.options, {});
    expect(options?.people.map((p) => p.name)).toEqual([
      "Ada Admin",
      "Fiona",
      "Hannah",
      "Ian",
      "Luke",
      "Penny",
    ]);
    expect(options?.people).toContainEqual({ email: LEADER, name: "Luke", detail: "UNSW, Events" });
    expect(options?.people).toContainEqual({ email: FIN, name: "Fiona", detail: "Finance" });
    expect(options?.people.some((p) => p.email === "old@sow.org.au")).toBe(false);
  });

  test("counts just the people picked, whatever groups are also set", async () => {
    const t = await setup();
    const size = await asUser(t, ADMIN).query(api.announcements.audienceSize, {
      audience: audience({ departments: ["Finance"] }),
      people: [" Luke@sow.org.au ", PRES, PRES, "old@sow.org.au", "nobody@sow.org.au"],
    });
    expect(size).toEqual({
      people: 2,
      withApp: 1,
      withoutApp: [{ email: PRES, name: "Penny", reason: "noApp" }],
    });
    expect(
      await asUser(t, ADMIN).query(api.announcements.audienceSize, { audience: EVERYONE, people: [] })
    ).toEqual({ people: 0, withApp: 0, withoutApp: [] });
  });

  test("only the people picked get it, and the history names them", async () => {
    const t = await setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const admin = asUser(t, ADMIN);
    const { id, people } = await admin.mutation(
      api.announcements.send,
      draft({ people: [LEADER, PRES, "Fiona@sow.org.au"], audience: audience({ roles: ["Nope"] }) })
    );
    expect(people).toBe(3);
    expect(await announcement(t, id)).toMatchObject({
      audience: EVERYONE,
      people: [LEADER, PRES, FIN],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await announcement(t, id)).toMatchObject({
      status: "sent",
      recipientCount: 3,
      pushCount: 2,
      emailCount: 0,
    });
    for (const email of [LEADER, PRES, FIN]) {
      expect(await notificationsFor(t, email)).toHaveLength(1);
    }
    for (const email of [ADMIN, HR, IT_HEAD]) {
      expect(await notificationsFor(t, email)).toEqual([]);
    }
    const pushes = fetchMock.mock.calls.filter(([u]) => String(u).includes("push/send"));
    expect(JSON.parse(pushes[0][1].body).map((m: { to: string }) => m.to).sort()).toEqual([
      "ExponentPushToken[fin]",
      "ExponentPushToken[luke]",
    ]);
    expect((await admin.query(api.announcements.list, {}))?.sent).toEqual([
      expect.objectContaining({ id, audience: "Luke, Penny and Fiona", chosenPeople: 3 }),
    ]);
    expect((await admin.query(api.announcements.get, { id }))?.details).toMatchObject({
      audience: "Luke, Penny and Fiona",
      people: 3,
      withApp: 2,
    });
  });

  test("more than three people are summed up", async () => {
    const t = await setup();
    const { id } = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ people: [LEADER, PRES, FIN, HR, IT_HEAD], sendAt: PINNED_NOW + HOUR })
    );
    expect((await asUser(t, ADMIN).query(api.announcements.list, {}))?.scheduled).toEqual([
      expect.objectContaining({ id, audience: "Luke, Penny, Fiona and 2 more", chosenPeople: 5 }),
    ]);
  });

  test("needs someone picked who is on this year's staff, and no more than the limit", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await expect(admin.mutation(api.announcements.send, draft({ people: [] }))).rejects.toThrow(
      /Pick at least one person/
    );
    await expect(admin.mutation(api.announcements.send, draft({ people: [" "] }))).rejects.toThrow(
      /Pick at least one person/
    );
    await expect(
      admin.mutation(api.announcements.send, draft({ people: ["old@sow.org.au"] }))
    ).rejects.toThrow(/No one matches/);
    const tooMany = Array.from({ length: 2001 }, (_, i) => `p${i}@sow.org.au`);
    await expect(admin.mutation(api.announcements.send, draft({ people: tooMany }))).rejects.toThrow(
      /2000 people or fewer/
    );
    await expect(
      admin.query(api.announcements.audienceSize, { audience: EVERYONE, people: tooMany })
    ).rejects.toThrow(/2000 people or fewer/);
  });

  test("a scheduled one whose people have all left by then doesn't go out, and says why", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const { id } = await admin.mutation(
      api.announcements.send,
      draft({ people: [PRES], sendAt: PINNED_NOW + HOUR })
    );
    await t.run(async (ctx) => {
      const penny = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", PRES).eq("year", YEAR))
        .unique();
      await ctx.db.delete("staffProfiles", penny!._id);
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await announcement(t, id)).toMatchObject({ status: "cancelled", recipientCount: 0 });
    expect((await admin.query(api.announcements.list, {}))?.notSent).toEqual([
      expect.objectContaining({
        id,
        notSentReason: expect.stringMatching(/None of the people it named/),
      }),
    ]);
  });
});

describe("emailing the people a push can't reach", () => {
  test("emails only those without a push when it goes out", async () => {
    const t = await setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const admin = asUser(t, ADMIN);
    const { id } = await admin.mutation(
      api.announcements.send,
      draft({
        emailWithoutApp: true,
        audience: audience({ divisions: ["Governance"] }),
        sendAt: PINNED_NOW + HOUR,
      })
    );
    expect(await announcement(t, id)).toMatchObject({ sendEmail: false, emailWithoutApp: true });
    expect((await admin.query(api.announcements.list, {}))?.scheduled).toEqual([
      expect.objectContaining({ id, sendEmail: false, emailWithoutApp: true }),
    ]);
    // Ian installs the app and allows notifications before it's due.
    await t.run((ctx) =>
      ctx.db.insert("pushTokens", { email: IT_HEAD, token: "ExponentPushToken[ian]" })
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await announcement(t, id)).toMatchObject({
      recipientCount: 3,
      pushCount: 2,
      emailCount: 1,
    });
    const emails = fetchMock.mock.calls.filter(([u]) => String(u).includes("emails/batch"));
    expect(emails).toHaveLength(1);
    expect(JSON.parse(emails[0][1].body).map((m: { to: string[] }) => m.to[0])).toEqual([ADMIN]);
    expect((await admin.query(api.announcements.get, { id }))?.details).toMatchObject({
      sendEmail: false,
      emailWithoutApp: true,
      emailed: 1,
    });
  });

  test("sends no email when everyone it reaches has a push", async () => {
    const t = await setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { id } = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ emailWithoutApp: true, people: [FIN, LEADER] })
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await announcement(t, id)).toMatchObject({ pushCount: 2, emailCount: 0 });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("resend"))).toBe(false);
  });

  test("emailing everyone wins over emailing just those without the app", async () => {
    const t = await setup();
    const { id } = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ sendEmail: true, emailWithoutApp: true, people: [FIN, PRES] })
    );
    const stored = await announcement(t, id);
    expect(stored).toMatchObject({ sendEmail: true });
    expect(stored?.emailWithoutApp).toBeUndefined();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await announcement(t, id)).toMatchObject({ emailCount: 2 });
  });
});

describe("sending now", () => {
  test("every recipient gets it in their bell, people with the app get a push", async () => {
    const t = await setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const result = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ title: "  Staff meeting moved ", audience: audience({ divisions: ["Governance"] }) })
    );
    expect(result).toMatchObject({ people: 3, sendAt: aboutMs(PINNED_NOW) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const sent = await announcement(t, result.id);
    expect(sent).toMatchObject({
      status: "sent",
      title: "Staff meeting moved",
      recipientCount: 3,
      pushCount: 1,
      emailCount: 0,
    });
    expect(sent?.jobId).toBeUndefined();

    const url = `/announcements/${result.id}`;
    for (const email of [ADMIN, IT_HEAD, FIN]) {
      expect(await notificationsFor(t, email)).toEqual([
        expect.objectContaining({
          title: "Staff meeting moved",
          body: "This week's staff meeting is on Thursday at 7pm.",
          url,
          announcementId: result.id,
          read: false,
        }),
      ]);
    }
    expect(await notificationsFor(t, LEADER)).toEqual([]);
    expect((await asUser(t, ADMIN).query(api.announcements.get, { id: result.id }))?.details?.seen).toEqual({
      total: 3,
      count: 0,
      notSeen: [
        { email: ADMIN, name: "Ada Admin" },
        { email: FIN, name: "Fiona" },
        { email: IT_HEAD, name: "Ian" },
      ],
    });

    const pushes = fetchMock.mock.calls.filter(([u]) => String(u).includes("push/send"));
    expect(pushes).toHaveLength(1);
    expect(JSON.parse(pushes[0][1].body)).toEqual([
      expect.objectContaining({
        to: "ExponentPushToken[fin]",
        title: "Staff meeting moved",
        body: "This week's staff meeting is on Thursday at 7pm.",
        data: { url },
      }),
    ]);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("resend"))).toBe(false);
  });

  test("ticking email also emails everyone a link into the app, replies going to the sender", async () => {
    const t = await setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await t.run((ctx) =>
      ctx.db.insert("appInstalls", { email: FIN, platform: "ios", version: "2.4.0", seenAt: PINNED_NOW })
    );
    const { id } = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ sendEmail: true, audience: audience({ divisions: ["Governance"] }) })
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await announcement(t, id)).toMatchObject({ emailCount: 3 });
    const emails = fetchMock.mock.calls.filter(([u]) => String(u).includes("emails/batch"));
    expect(emails).toHaveLength(1);
    const batch = JSON.parse(emails[0][1].body) as {
      to: string[];
      subject: string;
      text: string;
      reply_to: string;
    }[];
    expect(batch.map((m) => m.to[0])).toEqual([ADMIN, FIN, IT_HEAD]);
    expect(batch[0]).toMatchObject({ subject: "Staff meeting moved", reply_to: ADMIN });
    expect(batch[0].text).toContain("This week's staff meeting is on Thursday at 7pm.");
    expect(batch[0].text).toContain("— Ada Admin, via THE SHED");
    for (const to of [FIN, IT_HEAD]) {
      expect(batch.find((m) => m.to[0] === to)?.text).toMatch(new RegExp(`/announcements/${id}$`));
    }
  });

  test("large audiences go out in batches", async () => {
    const t = await setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await t.run(async (ctx) => {
      for (let i = 0; i < 150; i++) {
        const email = `leader${String(i).padStart(3, "0")}@sow.org.au`;
        await ctx.db.insert("staffProfiles", {
          email,
          year: YEAR,
          assignments: [{ role: "Student Leader", university: USYD }],
        });
        await ctx.db.insert("pushTokens", { email, token: `ExponentPushToken[${i}]` });
      }
    });
    const { id } = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ sendEmail: true, audience: audience({ roles: ["Student Leader"] }) })
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await announcement(t, id)).toMatchObject({ recipientCount: 151, pushCount: 151 });
    const calls = (part: string) => fetchMock.mock.calls.filter(([u]) => String(u).includes(part));
    expect(calls("push/send").map(([, init]) => JSON.parse(init.body).length).sort()).toEqual([
      100, 51,
    ].sort());
    expect(calls("emails/batch").map(([, init]) => JSON.parse(init.body).length)).toEqual([100, 51]);
  });
});

describe("scheduling", () => {
  test("a scheduled announcement waits, shows under Scheduled, then goes out on time", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const sendAt = PINNED_NOW + 2 * HOUR;
    const { id } = await admin.mutation(api.announcements.send, draft({ sendAt }));

    const waiting = await admin.query(api.announcements.list, {});
    expect(waiting?.scheduled).toEqual([
      expect.objectContaining({
        id,
        status: "scheduled",
        sendAt,
        audience: "All leaders",
        senderName: "Ada Admin",
        people: null,
      }),
    ]);
    expect(waiting?.sent).toEqual([]);
    expect(waiting?.mine).toEqual({
      recent: [
        {
          createdAt: expect.any(Number),
          title: "Staff meeting moved",
          message: "This week's staff meeting is on Thursday at 7pm.",
        },
      ],
      pending: 1,
    });
    expect((await asUser(t, HR).query(api.announcements.list, {}))?.mine).toEqual({
      recent: [],
      pending: 0,
    });
    expect(await notificationsFor(t, FIN)).toEqual([]);
    expect((await admin.query(api.announcements.get, { id }))?.details?.seen).toBeNull();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await admin.query(api.announcements.list, {});
    expect(after?.scheduled).toEqual([]);
    expect(after?.sent).toEqual([
      expect.objectContaining({ id, status: "sent", people: 6, withApp: 2, emailed: 0 }),
    ]);
    expect(await notificationsFor(t, FIN)).toHaveLength(1);
  });

  test("any admin can cancel a scheduled one, and then nobody gets it", async () => {
    const t = await setup();
    const { id } = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ sendAt: PINNED_NOW + DAY })
    );
    await asUser(t, HR).mutation(api.announcements.cancel, { id });
    expect(await announcement(t, id)).toMatchObject({
      status: "cancelled",
      cancelledBy: HR,
      cancelledAt: aboutMs(PINNED_NOW),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await notificationsFor(t, FIN)).toEqual([]);
    expect((await asUser(t, ADMIN).query(api.announcements.list, {}))?.scheduled).toEqual([]);

    await expect(asUser(t, ADMIN).mutation(api.announcements.cancel, { id })).rejects.toThrow(
      /already cancelled/
    );
    await expect(asUser(t, FIN).mutation(api.announcements.cancel, { id })).rejects.toThrow(
      /Only admins/
    );
  });

  test("one that has gone out, or is gone, can't be cancelled", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const { id } = await admin.mutation(api.announcements.send, draft());
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(admin.mutation(api.announcements.cancel, { id })).rejects.toThrow(
      /already gone out/
    );
    await t.run((ctx) => ctx.db.delete("announcements", id));
    await expect(admin.mutation(api.announcements.cancel, { id })).rejects.toThrow(/not found/);
  });

  test("one scheduled across the 1 October rollover goes to the year its sender chose from", async () => {
    vi.setSystemTime(staffYearStartMs(YEAR + 1) - 10 * DAY);
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "next@sow.org.au",
        year: YEAR + 1,
        assignments: [{ role: "Staff", department: "Finance" }],
      })
    );
    const { id } = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ sendAt: staffYearStartMs(YEAR + 1) + 5 * DAY })
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await announcement(t, id)).toMatchObject({ status: "sent", year: YEAR, recipientCount: 6 });
    expect(await notificationsFor(t, FIN)).toHaveLength(1);
    expect(await notificationsFor(t, "next@sow.org.au")).toEqual([]);
  });

  test("one whose audience matches no one by its send time doesn't go out, and says why", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const { id } = await admin.mutation(
      api.announcements.send,
      draft({ audience: audience({ departments: ["Finance"] }), sendAt: PINNED_NOW + 2 * HOUR })
    );
    const { id: cancelledByHand } = await admin.mutation(
      api.announcements.send,
      draft({ title: "Another", sendAt: PINNED_NOW + 3 * HOUR })
    );
    await admin.mutation(api.announcements.cancel, { id: cancelledByHand });
    await t.run(async (ctx) => {
      for (const profile of await ctx.db.query("staffProfiles").collect()) {
        if (profile.assignments?.some((a) => a.department === "Finance")) {
          await ctx.db.patch("staffProfiles", profile._id, {
            assignments: [{ role: "Staff", department: "Accounts" }],
          });
        }
      }
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await announcement(t, id);
    expect(after).toMatchObject({ status: "cancelled", recipientCount: 0 });
    expect(after?.cancelledBy).toBeUndefined();
    expect(after?.sentAt).toBeUndefined();
    expect(after?.jobId).toBeUndefined();
    expect(await notificationsFor(t, FIN)).toEqual([]);

    const list = await admin.query(api.announcements.list, {});
    expect(list?.scheduled).toEqual([]);
    expect(list?.sent).toEqual([]);
    expect(list?.notSent).toEqual([
      expect.objectContaining({
        id,
        status: "cancelled",
        audience: "Finance",
        notSentReason: expect.stringMatching(/No one matched who it was for/),
      }),
    ]);
    expect((await admin.query(api.announcements.get, { id }))?.details).toMatchObject({
      status: "cancelled",
      notSentReason: expect.stringMatching(/renamed or removed/),
    });
    expect(
      (await admin.query(api.announcements.get, { id: cancelledByHand }))?.details?.notSentReason
    ).toBeNull();
  });

  test("delivering a cancelled, sent or missing announcement does nothing", async () => {
    const t = await setup();
    const id = await t.run((ctx) =>
      ctx.db.insert("announcements", {
        senderEmail: ADMIN,
        title: "T",
        message: "M",
        audience: EVERYONE,
        sendEmail: false,
        status: "cancelled",
        sendAt: PINNED_NOW,
      })
    );
    await t.mutation(internal.announcements.deliver, { id });
    expect(await notificationsFor(t, FIN)).toEqual([]);
    await t.run((ctx) => ctx.db.delete("announcements", id));
    await t.mutation(internal.announcements.deliver, { id });
    expect(await notificationsFor(t, FIN)).toEqual([]);
  });

  test("a scheduled time has to be at least 5 minutes away and within 90 days", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const now = PINNED_NOW + MINUTE;
    vi.setSystemTime(now);
    await expect(
      admin.mutation(api.announcements.send, draft({ sendAt: now + 4 * MINUTE }))
    ).rejects.toThrow(/at least 5 minutes/);
    await admin.mutation(api.announcements.send, draft({ sendAt: now + 5 * MINUTE }));
    await expect(
      admin.mutation(api.announcements.send, draft({ sendAt: now + 91 * DAY }))
    ).rejects.toThrow(/90 days/);
  });
});

describe("checks before sending", () => {
  test("needs a title and message within the limits, and someone to send to", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await expect(admin.mutation(api.announcements.send, draft({ title: "  " }))).rejects.toThrow(
      /Add a title/
    );
    await expect(admin.mutation(api.announcements.send, draft({ message: "" }))).rejects.toThrow(
      /Add a message/
    );
    await expect(
      admin.mutation(api.announcements.send, draft({ title: "x".repeat(66) }))
    ).rejects.toThrow(/65 characters/);
    await expect(
      admin.mutation(api.announcements.send, draft({ audience: audience({ departments: ["Nope"] }) }))
    ).rejects.toThrow(/No one matches/);
  });

  test("the same announcement twice in a row is refused as a double send", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.announcements.send, draft());
    await expect(
      admin.mutation(api.announcements.send, draft({ message: "this WEEK'S staff meeting is on  Thursday at 7pm." }))
    ).rejects.toThrow(/just sent this/);
    await asUser(t, HR).mutation(api.announcements.send, draft());
  });

  test("three an hour per person; cancelled ones don't count", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const first = await admin.mutation(api.announcements.send, draft({ title: "One", sendAt: PINNED_NOW + DAY }));
    await admin.mutation(api.announcements.cancel, { id: first.id });
    for (const title of ["Two", "Three", "Four"]) {
      await admin.mutation(api.announcements.send, draft({ title }));
    }
    await expect(admin.mutation(api.announcements.send, draft({ title: "Five" }))).rejects.toThrow(
      /3 announcements an hour/
    );
    await asUser(t, HR).mutation(api.announcements.send, draft({ title: "Five" }));
    vi.setSystemTime(PINNED_NOW + HOUR + MINUTE);
    await admin.mutation(api.announcements.send, draft({ title: "Five" }));
  });

  test("cancelled ones can't crowd real sends out of the count", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 120; i++) {
        await ctx.db.insert("announcements", {
          senderEmail: ADMIN,
          title: `Cancelled ${i}`,
          message: "M",
          audience: EVERYONE,
          sendEmail: false,
          status: "cancelled",
          sendAt: PINNED_NOW + DAY,
        });
      }
    });
    const admin = asUser(t, ADMIN);
    for (const title of ["One", "Two", "Three"]) {
      await admin.mutation(api.announcements.send, draft({ title }));
    }
    await expect(admin.mutation(api.announcements.send, draft({ title: "Four" }))).rejects.toThrow(
      /3 announcements an hour/
    );
  });

  test("ten a day per person", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(PINNED_NOW + i * 2 * HOUR);
      await admin.mutation(api.announcements.send, draft({ title: `Notice ${i}` }));
    }
    vi.setSystemTime(PINNED_NOW + 20 * HOUR);
    await expect(admin.mutation(api.announcements.send, draft({ title: "More" }))).rejects.toThrow(
      /10 announcements a day/
    );
  });

  test("no more than ten waiting to go out per person", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("announcements", {
          senderEmail: ADMIN,
          title: `Later ${i}`,
          message: "M",
          audience: EVERYONE,
          sendEmail: false,
          status: "scheduled",
          sendAt: PINNED_NOW + 30 * DAY,
        });
      }
    });
    vi.setSystemTime(PINNED_NOW + 2 * DAY);
    await expect(
      asUser(t, ADMIN).mutation(api.announcements.send, draft({ sendAt: PINNED_NOW + 3 * DAY }))
    ).rejects.toThrow(/10 announcements scheduled/);
  });
});

describe("the announcement page", () => {
  test("recipients see the message; admins also see who it went to; others see nothing", async () => {
    const t = await setup();
    const { id } = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ audience: audience({ departments: ["Finance"] }) })
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const forFiona = await asUser(t, FIN).query(api.announcements.get, { id });
    expect(forFiona).toEqual({
      id,
      title: "Staff meeting moved",
      message: "This week's staff meeting is on Thursday at 7pm.",
      senderName: "Ada Admin",
      at: aboutMs(PINNED_NOW),
      details: null,
    });
    expect(await asUser(t, HR).query(api.announcements.get, { id })).toMatchObject({
      details: {
        status: "sent",
        audience: "Finance",
        sendEmail: false,
        people: 1,
        withApp: 1,
        emailed: 0,
        seen: { total: 1, count: 0, notSeen: [{ email: FIN, name: "Fiona" }] },
      },
    });
    await asUser(t, FIN).mutation(api.notifications.markReadForAnnouncement, { announcementId: id });
    expect((await asUser(t, HR).query(api.announcements.get, { id }))?.details?.seen).toEqual({
      total: 1,
      count: 1,
      notSeen: [],
    });
    expect(await asUser(t, LEADER).query(api.announcements.get, { id })).toBeNull();
    expect(await t.query(api.announcements.get, { id })).toBeNull();
    expect(await asUser(t, FIN).query(api.announcements.get, { id: "nope" })).toBeNull();
    await t.run((ctx) => ctx.db.delete("announcements", id));
    expect(await asUser(t, FIN).query(api.announcements.get, { id })).toBeNull();
  });

  test("opening it marks the notification read", async () => {
    const t = await setup();
    const { id } = await asUser(t, ADMIN).mutation(
      api.announcements.send,
      draft({ audience: audience({ departments: ["Finance"] }) })
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(api.notifications.markReadForAnnouncement, { announcementId: id });
    expect((await notificationsFor(t, FIN))[0].read).toBe(false);
    await asUser(t, FIN).mutation(api.notifications.markReadForAnnouncement, { announcementId: id });
    expect((await notificationsFor(t, FIN))[0].read).toBe(true);
  });
});
