/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { GRIEVANCES_TEAM_EMAIL, type GrievanceInput } from "../shared/grievances";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
const PINNED_NOW = staffYearStartMs(staffYearForDate(new Date())) + 150 * DAY;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const YEAR = staffYearForDate(new Date(PINNED_NOW));

const ADMIN = "admin@sow.org.au";
const HANA = "hana@sow.org.au"; // People and Culture
const CARL = "carl@sow.org.au"; // Compliance
const PIA = "pia@sow.org.au"; // Head of People and Culture
const LEO = "leo@sow.org.au"; // campus leader
const MEMBER = "member@gmail.com"; // signed in, no profile

type T = TestConvex<typeof schema>;

const asUser = (t: T, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const input = (over: Partial<GrievanceInput> = {}): GrievanceInput => ({
  name: "Alex Morgan",
  email: "alex.morgan@example.com",
  category: "conduct",
  details: "A leader spoke to me unkindly at camp.",
  ...over,
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "People and Culture",
    division: "Human Resources",
    headEmail: PIA,
  });
  const profiles = [
    { email: HANA, roles: ["Staff"], department: "People and Culture" },
    { email: CARL, roles: ["Staff"], department: "Compliance" },
    { email: PIA, roles: ["Staff"], department: "Events" },
    { email: LEO, roles: ["Staff"], department: "Marketing" },
  ];
  for (const p of profiles) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...p });
  }
  return t;
}

const get = (t: T, id: Id<"grievances">) =>
  t.run(async (ctx) => (await ctx.db.get("grievances", id))!);

const emails = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((f) => f.state.kind === "pending")
      .map((f) => f.args[0] as { to: string; subject?: string; body?: string; replyTo?: string })
      .filter((a) => a.subject !== undefined && a.body !== undefined)
  );

const notificationsFor = (t: T, email: string) =>
  t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .collect()
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

describe("submitting", () => {
  test("anyone signed out can raise one; they and the team are told", async () => {
    const t = await setup();
    const { id, number } = await t.mutation(api.grievances.submit, input({ phone: " 0400 000 000 " }));
    expect(number).toBe(1);
    const g = await get(t, id);
    expect(g).toMatchObject({ status: "SUBMITTED", phone: "0400 000 000" });
    expect(g.accountEmail).toBeUndefined();

    const sent = await emails(t);
    const toSubmitter = sent.find((e) => e.to === "alex.morgan@example.com")!;
    expect(toSubmitter.subject).toBe("We've received your grievance (#1)");
    expect(toSubmitter.body).not.toContain("Follow it in THE SHED");
    expect(toSubmitter.replyTo).toBe(GRIEVANCES_TEAM_EMAIL);
    const toTeam = sent.find((e) => e.to === GRIEVANCES_TEAM_EMAIL)!;
    expect(toTeam.subject).toBe("New Grievance #1");
    expect(toTeam.body).toContain("Phone: 0400 000 000");
    expect(toTeam.replyTo).toBe("alex.morgan@example.com");

    for (const handler of [HANA, CARL, PIA]) {
      const [n] = await notificationsFor(t, handler);
      expect(n.title).toBe("New Grievance #1");
      expect(n.body).toBe("New Grievance #1");
    }
    expect(await notificationsFor(t, LEO)).toHaveLength(0);
    expect(await notificationsFor(t, ADMIN)).toHaveLength(0);

    const second = await t.mutation(api.grievances.submit, input({ email: "b@example.com" }));
    expect(second.number).toBe(2);
  });

  test("signed in, it's filed under their account and linked in emails", async () => {
    const t = await setup();
    const { id } = await asUser(t, LEO).mutation(
      api.grievances.submit,
      input({ name: "Leo Park", email: "ignored@example.com" })
    );
    expect(await get(t, id)).toMatchObject({ accountEmail: LEO, email: LEO });
    const toLeo = (await emails(t)).find((e) => e.to === LEO)!;
    expect(toLeo.body).toContain(`Follow it in THE SHED: https://theshed.sow.org.au/grievances/${id}`);
    expect(await asUser(t, LEO).query(api.grievances.mine, {})).toHaveLength(1);
    expect(await asUser(t, HANA).query(api.grievances.mine, {})).toHaveLength(0);
    expect(await t.query(api.grievances.mine, {})).toBeNull();
  });

  test("rejects bad answers", async () => {
    const t = await setup();
    await expect(t.mutation(api.grievances.submit, input({ details: "short" }))).rejects.toThrow(
      "Please tell us what happened."
    );
  });

  test("limits each email to three an hour, and everyone to thirty", async () => {
    const t = await setup();
    for (let i = 0; i < 3; i++) await t.mutation(api.grievances.submit, input());
    await expect(t.mutation(api.grievances.submit, input())).rejects.toThrow("Please wait an hour");

    for (let i = 0; i < 27; i++) {
      await t.mutation(api.grievances.submit, input({ email: `p${i}@example.com` }));
    }
    await expect(
      t.mutation(api.grievances.submit, input({ email: "late@example.com" }))
    ).rejects.toThrow("The grievance form is busy");
    // Signing in gets past the shared cap.
    await asUser(t, LEO).mutation(api.grievances.submit, input());

    vi.setSystemTime(PINNED_NOW + 2 * 60 * 60 * 1000);
    await t.mutation(api.grievances.submit, input());
    const left = await t.run((ctx) => ctx.db.query("grievanceRateLimit").collect());
    expect(left).toHaveLength(1);
  });
});

describe("handling", () => {
  test("take, progress and resolve, emailing the submitter at each step", async () => {
    const t = await setup();
    const { id } = await asUser(t, MEMBER).mutation(api.grievances.submit, input({ name: "Sam Lee" }));
    await clearOutbox(t);

    await asUser(t, HANA).mutation(api.grievances.assign, { id, assigneeEmail: HANA });
    expect(await get(t, id)).toMatchObject({ status: "RECEIVED", assigneeEmail: HANA });
    let sent = await emails(t);
    expect(sent.find((e) => e.to === MEMBER)?.subject).toBe("Your grievance #1 has been received");
    expect(sent.find((e) => e.to === GRIEVANCES_TEAM_EMAIL)?.subject).toBe(
      `Grievance #1 taken by ${HANA}`
    );
    expect((await notificationsFor(t, MEMBER))[0].title).toBe("Grievance update");
    expect(await notificationsFor(t, HANA)).toHaveLength(0);
    expect(await notificationsFor(t, CARL)).toHaveLength(1);

    await clearOutbox(t);
    await asUser(t, HANA).mutation(api.grievances.assign, { id, assigneeEmail: HANA });
    expect(await emails(t)).toHaveLength(0);

    await asUser(t, CARL).mutation(api.grievances.assign, { id, assigneeEmail: PIA });
    const view = await asUser(t, CARL).query(api.grievances.get, { id });
    expect(view).toMatchObject({ assigneeName: PIA, receivedByName: HANA });
    sent = await emails(t);
    expect(sent.map((e) => e.to)).toEqual([GRIEVANCES_TEAM_EMAIL]);
    expect(sent[0].subject).toBe(`Grievance #1 given to ${PIA}`);

    await clearOutbox(t);
    await asUser(t, PIA).mutation(api.grievances.start, { id });
    expect((await get(t, id)).status).toBe("IN_PROGRESS");
    sent = await emails(t);
    expect(sent.find((e) => e.to === MEMBER)?.subject).toBe("Your grievance #1 is in progress");
    await expect(asUser(t, PIA).mutation(api.grievances.start, { id })).rejects.toThrow(
      "Only a received grievance"
    );

    await clearOutbox(t);
    await asUser(t, PIA).mutation(api.grievances.close, {
      id,
      outcome: "RESOLVED",
      note: " We spoke with the leader and apologised. ",
    });
    expect(await get(t, id)).toMatchObject({
      status: "RESOLVED",
      closedBy: PIA,
      closingNote: "We spoke with the leader and apologised.",
    });
    sent = await emails(t);
    const toMember = sent.find((e) => e.to === MEMBER)!;
    expect(toMember.subject).toBe("Your grievance #1 has been resolved");
    expect(toMember.body).toContain("Outcome: We spoke with the leader and apologised.");
    expect(sent.find((e) => e.to === GRIEVANCES_TEAM_EMAIL)?.subject).toBe("Grievance #1 resolved");

    await expect(
      asUser(t, PIA).mutation(api.grievances.close, { id, outcome: "RESOLVED", note: "x" })
    ).rejects.toThrow("already closed");

    const history = await asUser(t, CARL).query(api.grievances.timeline, { id });
    expect(history!.map((e) => e.action)).toEqual([
      "submitted",
      "taken",
      "assigned",
      "in-progress",
      "resolved",
    ]);
    expect(await asUser(t, LEO).query(api.grievances.timeline, { id })).toBeNull();
  });

  test("can close as not proceeding straight away, with a reason", async () => {
    const t = await setup();
    const { id } = await t.mutation(api.grievances.submit, input());
    await expect(
      asUser(t, HANA).mutation(api.grievances.close, { id, outcome: "RESOLVED", note: "Done" })
    ).rejects.toThrow("Take the grievance on");
    await expect(
      asUser(t, HANA).mutation(api.grievances.close, { id, outcome: "NOT_PROCEEDING", note: "  " })
    ).rejects.toThrow("Please add a note");
    await expect(
      asUser(t, HANA).mutation(api.grievances.close, {
        id,
        outcome: "NOT_PROCEEDING",
        note: "x".repeat(5001),
      })
    ).rejects.toThrow("at most 5000");
    await clearOutbox(t);
    await asUser(t, HANA).mutation(api.grievances.close, {
      id,
      outcome: "NOT_PROCEEDING",
      note: "This is a matter for the church.",
    });
    const sent = await emails(t);
    const toSubmitter = sent.find((e) => e.to === "alex.morgan@example.com")!;
    expect(toSubmitter.subject).toBe("An update on your grievance #1");
    expect(toSubmitter.body).toContain("Reason: This is a matter for the church.");
    expect(sent.find((e) => e.to === GRIEVANCES_TEAM_EMAIL)?.subject).toBe(
      "Grievance #1 closed, not proceeding"
    );
  });

  test("only the team can act, and only on people in the team", async () => {
    const t = await setup();
    const { id } = await t.mutation(api.grievances.submit, input());
    for (const email of [LEO, ADMIN, MEMBER]) {
      await expect(
        asUser(t, email).mutation(api.grievances.assign, { id, assigneeEmail: HANA })
      ).rejects.toThrow("Only the People and Culture and Compliance teams");
    }
    await expect(
      asUser(t, HANA).mutation(api.grievances.assign, { id, assigneeEmail: LEO })
    ).rejects.toThrow("can only be given to someone");
    const gone = await t.run(async (ctx) => {
      const other = await ctx.db.insert("grievanceEvents", {
        grievanceId: id,
        action: "x",
        actorEmail: HANA,
      });
      await ctx.db.delete("grievanceEvents", other);
      await ctx.db.delete("grievances", id);
      return id;
    });
    await expect(asUser(t, HANA).mutation(api.grievances.start, { id: gone })).rejects.toThrow(
      "Grievance not found."
    );
  });
});

describe("seeing grievances", () => {
  test("only the submitter and the team can open one", async () => {
    const t = await setup();
    const { id } = await asUser(t, LEO).mutation(api.grievances.submit, input());
    const mineView = await asUser(t, LEO).query(api.grievances.get, { id });
    expect(mineView).toMatchObject({ isHandler: false, can: { take: false, close: false } });
    expect(await asUser(t, ADMIN).query(api.grievances.get, { id })).toBeNull();
    expect(await asUser(t, MEMBER).query(api.grievances.get, { id })).toBeNull();
    expect(await t.query(api.grievances.get, { id })).toBeNull();
    expect(await asUser(t, HANA).query(api.grievances.get, { id: "nope" })).toBeNull();

    const handlerView = await asUser(t, HANA).query(api.grievances.get, { id });
    expect(handlerView).toMatchObject({
      isHandler: true,
      assigneeName: null,
      can: { take: true, assign: true, start: false, resolve: false, close: true },
    });
    await asUser(t, HANA).mutation(api.grievances.assign, { id, assigneeEmail: HANA });
    expect((await asUser(t, HANA).query(api.grievances.get, { id }))!.can).toMatchObject({
      take: false,
      start: true,
      resolve: true,
    });
  });

  test("the team sees the open queue, everything, and what's waiting on them", async () => {
    const t = await setup();
    const a = await t.mutation(api.grievances.submit, input({ email: "a@example.com" }));
    const b = await t.mutation(api.grievances.submit, input({ email: "b@example.com" }));
    const c = await t.mutation(api.grievances.submit, input({ email: "c@example.com" }));
    await asUser(t, HANA).mutation(api.grievances.assign, { id: b.id, assigneeEmail: HANA });
    await asUser(t, CARL).mutation(api.grievances.assign, { id: c.id, assigneeEmail: CARL });
    await asUser(t, CARL).mutation(api.grievances.start, { id: c.id });
    await asUser(t, HANA).mutation(api.grievances.close, {
      id: a.id,
      outcome: "NOT_PROCEEDING",
      note: "Duplicate",
    });

    expect((await asUser(t, HANA).query(api.grievances.queue, {}))!.map((g) => g.number)).toEqual([
      2, 3,
    ]);
    expect((await asUser(t, HANA).query(api.grievances.all, {}))!.map((g) => g.number)).toEqual([
      3, 2, 1,
    ]);
    expect(await asUser(t, HANA).query(api.grievances.waitingOnMe, {})).toBe(1);
    expect(await asUser(t, CARL).query(api.grievances.waitingOnMe, {})).toBe(1);
    await t.mutation(api.grievances.submit, input({ email: "d@example.com" }));
    expect(await asUser(t, PIA).query(api.grievances.waitingOnMe, {})).toBe(1);

    expect(await asUser(t, LEO).query(api.grievances.queue, {})).toBeNull();
    expect(await asUser(t, LEO).query(api.grievances.all, {})).toBeNull();
    expect(await asUser(t, LEO).query(api.grievances.waitingOnMe, {})).toBe(0);
    expect(await asUser(t, LEO).query(api.grievances.team, {})).toBeNull();
    expect((await asUser(t, PIA).query(api.grievances.team, {}))!.map((p) => p.email)).toEqual([
      CARL,
      HANA,
      PIA,
    ]);
  });

  test("viewer says who handles grievances", async () => {
    const t = await setup();
    expect(await t.query(api.grievances.viewer, {})).toBeNull();
    expect(await asUser(t, MEMBER).query(api.grievances.viewer, {})).toEqual({
      email: MEMBER,
      isHandler: false,
    });
    expect(await asUser(t, PIA).query(api.grievances.viewer, {})).toMatchObject({ isHandler: true });
  });

  test("opening one marks its notifications read", async () => {
    const t = await setup();
    const { id } = await t.mutation(api.grievances.submit, input());
    expect((await notificationsFor(t, HANA))[0].read).toBe(false);
    await asUser(t, HANA).mutation(api.notifications.markReadForGrievance, { grievanceId: id });
    expect((await notificationsFor(t, HANA))[0].read).toBe(true);
    await t.mutation(api.notifications.markReadForGrievance, { grievanceId: id });
  });
});
