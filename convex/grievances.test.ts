/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { DEFAULT_GRIEVANCE_CATEGORIES, type GrievanceInput } from "../shared/grievances";
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
const CONDUCT = DEFAULT_GRIEVANCE_CATEGORIES[0];

const ADMIN = "admin@sow.org.au";
const HANA = "hana@sow.org.au"; // People and Culture
const CARL = "carl@sow.org.au"; // Compliance
const PIA = "pia@sow.org.au"; // Head of People and Culture
const TESS = "tess@sow.org.au"; // Training and Development
const LEO = "leo@sow.org.au"; // campus leader
const MEMBER = "member@gmail.com"; // signed in, no profile

type T = TestConvex<typeof schema>;

const asUser = (t: T, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const input = (over: Partial<GrievanceInput> = {}): GrievanceInput => ({
  name: "Alex Morgan",
  email: "alex.morgan@example.com",
  category: CONDUCT,
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
    { email: TESS, roles: ["Staff"], department: "Training and Development" },
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
      .map((f) => f.args[0] as { to: string; subject?: string; body?: string })
      .filter((a) => a.subject !== undefined && a.body !== undefined)
  );

const notificationsFor = (t: T, email: string) =>
  t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .collect()
  );

const pushesTo = (t: T, email: string) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      (f) => f.name === "push:send" && (f.args[0] as { to: string }).to === email
    )
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
  test("anyone signed out can raise one; they're emailed and the team gets a push", async () => {
    const t = await setup();
    const id = await t.mutation(api.grievances.submit, input({ phone: " 0400 000 000 " }));
    const g = await get(t, id);
    expect(g).toMatchObject({ status: "SUBMITTED", year: YEAR, phone: "0400 000 000" });
    expect(g.ref).toMatch(/^[0-9a-f-]{36}$/);
    expect(g.accountEmail).toBeUndefined();

    const sent = await emails(t);
    expect(sent.map((e) => e.to)).toEqual(["alex.morgan@example.com"]);
    expect(sent[0].subject).toBe("We've received your grievance");
    expect(sent[0].body).not.toContain("Follow it in THE SHED");
    expect(sent[0].body).not.toContain(g.ref.slice(0, 8));

    for (const handler of [HANA, CARL, PIA]) {
      const [n] = await notificationsFor(t, handler);
      expect(n.title).toBe("New grievance");
      expect(n.body).toBe(`Grievance ${g.ref.slice(0, 8).toUpperCase()} is waiting for someone to take it on.`);
      expect(await pushesTo(t, handler)).toHaveLength(1);
    }
    for (const outsider of [LEO, ADMIN, TESS]) {
      expect(await notificationsFor(t, outsider)).toHaveLength(0);
    }
  });

  test("signed in, it's filed under their account, linked in emails, and the ref stays hidden", async () => {
    const t = await setup();
    const id = await asUser(t, LEO).mutation(
      api.grievances.submit,
      input({ name: "Leo Park", email: "ignored@example.com" })
    );
    expect(await get(t, id)).toMatchObject({ accountEmail: LEO, email: LEO });
    const toLeo = (await emails(t)).find((e) => e.to === LEO)!;
    expect(toLeo.body).toContain(`Follow it in THE SHED: https://theshed.sow.org.au/grievances/${id}`);
    const mine = await asUser(t, LEO).query(api.grievances.mine, {});
    expect(mine).toHaveLength(1);
    expect(mine![0]).not.toHaveProperty("ref");
    expect(await asUser(t, LEO).query(api.grievances.get, { id })).toMatchObject({ ref: null });
    expect(await asUser(t, HANA).query(api.grievances.mine, {})).toHaveLength(0);
    expect(await t.query(api.grievances.mine, {})).toBeNull();
  });

  test("rejects bad answers and options that aren't on the form", async () => {
    const t = await setup();
    await expect(t.mutation(api.grievances.submit, input({ details: "short" }))).rejects.toThrow(
      "Please tell us what happened."
    );
    await expect(
      t.mutation(api.grievances.submit, input({ category: "Something new" }))
    ).rejects.toThrow("Please choose what it's about.");
  });

  test("limits each email to three an hour, and signed-out sending to thirty", async () => {
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

describe("settings", () => {
  test("admins choose the team's departments; the team picks up the change", async () => {
    const t = await setup();
    expect((await t.query(api.grievances.settings, {})).departments).toEqual([
      "People and Culture",
      "Compliance",
    ]);
    await expect(
      asUser(t, CARL).mutation(api.grievances.setDepartments, { departments: ["Marketing"] })
    ).rejects.toThrow("Only admins");
    await expect(
      asUser(t, ADMIN).mutation(api.grievances.setDepartments, { departments: [" ", ""] })
    ).rejects.toThrow("Add at least one department.");
    await asUser(t, ADMIN).mutation(api.grievances.setDepartments, {
      departments: ["People and Culture", " Training and Development ", "people and culture"],
    });
    expect((await t.query(api.grievances.settings, {})).departments).toEqual([
      "People and Culture",
      "Training and Development",
    ]);
    expect(await asUser(t, TESS).query(api.grievances.viewer, {})).toMatchObject({ isHandler: true });
    expect(await asUser(t, CARL).query(api.grievances.viewer, {})).toMatchObject({ isHandler: false });
    expect((await asUser(t, TESS).query(api.grievances.team, {}))!.map((p) => p.email)).toEqual([
      HANA,
      PIA,
      TESS,
    ]);
  });

  test("the team edits the form's options; old grievances keep their wording", async () => {
    const t = await setup();
    const id = await t.mutation(api.grievances.submit, input());
    await expect(
      asUser(t, LEO).mutation(api.grievances.setCategories, { categories: ["X"] })
    ).rejects.toThrow("Only the grievance team");
    await expect(
      asUser(t, HANA).mutation(api.grievances.setCategories, {
        categories: Array.from({ length: 21 }, (_, i) => `Option ${i}`),
      })
    ).rejects.toThrow("at most 20 options");
    await expect(
      asUser(t, HANA).mutation(api.grievances.setCategories, { categories: ["x".repeat(81)] })
    ).rejects.toThrow("at most 80 characters");
    await asUser(t, HANA).mutation(api.grievances.setCategories, {
      categories: ["A leader", "Safety"],
    });
    expect((await t.query(api.grievances.settings, {})).categories).toEqual(["A leader", "Safety"]);
    expect((await t.query(api.grievances.settings, {})).departments).toHaveLength(2);
    expect((await get(t, id)).category).toBe(CONDUCT);
    await t.mutation(api.grievances.submit, input({ category: "Safety", email: "s@example.com" }));
  });
});

describe("handling", () => {
  test("taking it on puts it in progress; resolving emails the outcome", async () => {
    const t = await setup();
    const id = await asUser(t, MEMBER).mutation(api.grievances.submit, input({ name: "Sam Lee" }));
    await clearOutbox(t);

    await asUser(t, HANA).mutation(api.grievances.assign, { id, assigneeEmail: HANA });
    expect(await get(t, id)).toMatchObject({ status: "IN_PROGRESS", assigneeEmail: HANA });
    let sent = await emails(t);
    expect(sent.map((e) => [e.to, e.subject])).toEqual([[MEMBER, "Your grievance is in progress"]]);
    expect((await notificationsFor(t, MEMBER))[0].title).toBe("Grievance update");
    expect(await notificationsFor(t, HANA)).toHaveLength(0);
    expect((await notificationsFor(t, CARL))[0].title).toMatch(/^hana@sow\.org\.au took on grievance /);

    await clearOutbox(t);
    await asUser(t, HANA).mutation(api.grievances.assign, { id, assigneeEmail: HANA });
    expect(await notificationsFor(t, CARL)).toHaveLength(0);

    await asUser(t, CARL).mutation(api.grievances.assign, { id, assigneeEmail: PIA });
    expect(await emails(t)).toHaveLength(0);
    expect((await notificationsFor(t, PIA))[0].title).toMatch(/given to pia@sow\.org\.au$/);
    expect((await asUser(t, CARL).query(api.grievances.get, { id }))!.assigneeName).toBe(PIA);

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
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Your grievance has been resolved");
    expect(sent[0].body).toContain("Outcome: We spoke with the leader and apologised.");

    await expect(
      asUser(t, PIA).mutation(api.grievances.close, { id, outcome: "RESOLVED", note: "x" })
    ).rejects.toThrow("already closed");

    const history = await asUser(t, CARL).query(api.grievances.timeline, { id });
    expect(history!.map((e) => e.action)).toEqual(["submitted", "taken", "assigned", "resolved"]);
    expect(history![0].actorName).toBe("Sam Lee");
    expect(await asUser(t, LEO).query(api.grievances.timeline, { id })).toBeNull();
  });

  test("can close as not proceeding straight away, with a reason", async () => {
    const t = await setup();
    const id = await t.mutation(api.grievances.submit, input());
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
    const [sent] = await emails(t);
    expect(sent.subject).toBe("An update on your grievance");
    expect(sent.body).toContain("Reason: This is a matter for the church.");
    expect((await notificationsFor(t, CARL))[0].title).toMatch(/closed, not proceeding$/);
  });

  test("only the team can act, and only on people in the team", async () => {
    const t = await setup();
    const id = await t.mutation(api.grievances.submit, input());
    for (const email of [LEO, ADMIN, MEMBER]) {
      await expect(
        asUser(t, email).mutation(api.grievances.assign, { id, assigneeEmail: HANA })
      ).rejects.toThrow("Only the grievance team");
    }
    await expect(
      asUser(t, HANA).mutation(api.grievances.assign, { id, assigneeEmail: LEO })
    ).rejects.toThrow("can only be given to someone on the grievance team");
    await t.run((ctx) => ctx.db.delete("grievances", id));
    await expect(
      asUser(t, HANA).mutation(api.grievances.assign, { id, assigneeEmail: HANA })
    ).rejects.toThrow("Grievance not found.");
    expect(await asUser(t, HANA).query(api.grievances.timeline, { id })).toBeNull();
  });
});

describe("staff years", () => {
  test("open grievances move to the new staff year on 1 October; closed ones stay", async () => {
    const t = await setup();
    const open = await t.mutation(api.grievances.submit, input({ email: "a@example.com" }));
    const taken = await t.mutation(api.grievances.submit, input({ email: "b@example.com" }));
    const done = await t.mutation(api.grievances.submit, input({ email: "c@example.com" }));
    await asUser(t, HANA).mutation(api.grievances.assign, { id: taken, assigneeEmail: HANA });
    await asUser(t, HANA).mutation(api.grievances.close, {
      id: done,
      outcome: "NOT_PROCEEDING",
      note: "Duplicate",
    });
    expect(await asUser(t, HANA).query(api.grievances.years, {})).toEqual([YEAR]);
    expect(await t.mutation(internal.grievances.carryForward, {})).toEqual({ moved: 0 });

    vi.setSystemTime(staffYearStartMs(YEAR + 1) + DAY);
    await t.run(async (ctx) => {
      for (const p of await ctx.db.query("staffProfiles").collect()) {
        const { _id, _creationTime, ...profile } = p;
        await ctx.db.insert("staffProfiles", { ...profile, year: YEAR + 1 });
      }
    });
    expect(await t.mutation(internal.grievances.carryForward, {})).toEqual({ moved: 2 });
    expect((await get(t, open)).year).toBe(YEAR + 1);
    expect((await get(t, taken)).year).toBe(YEAR + 1);
    expect((await get(t, done)).year).toBe(YEAR);

    expect(await asUser(t, HANA).query(api.grievances.years, {})).toEqual([YEAR + 1, YEAR]);
    expect(
      (await asUser(t, HANA).query(api.grievances.submitted, { year: YEAR + 1 }))!.map((g) => g._id)
    ).toEqual([open, taken]);
    expect(
      (await asUser(t, HANA).query(api.grievances.submitted, { year: YEAR }))!.map((g) => g._id)
    ).toEqual([done]);
    const history = await asUser(t, HANA).query(api.grievances.timeline, { id: open });
    expect(history!.at(-1)).toMatchObject({
      action: "carried-over",
      actorName: "THE SHED",
      detail: `${YEAR} → ${YEAR + 1}`,
    });
  });
});

describe("seeing grievances", () => {
  test("only the submitter and the team can open one", async () => {
    const t = await setup();
    const id = await asUser(t, LEO).mutation(api.grievances.submit, input());
    expect(await asUser(t, LEO).query(api.grievances.get, { id })).toMatchObject({
      isHandler: false,
      can: { take: false, close: false },
    });
    expect(await asUser(t, ADMIN).query(api.grievances.get, { id })).toBeNull();
    expect(await asUser(t, MEMBER).query(api.grievances.get, { id })).toBeNull();
    expect(await t.query(api.grievances.get, { id })).toBeNull();
    expect(await asUser(t, HANA).query(api.grievances.get, { id: "nope" })).toBeNull();

    const handlerView = await asUser(t, HANA).query(api.grievances.get, { id });
    expect(handlerView).toMatchObject({
      isHandler: true,
      assigneeName: null,
      can: { take: true, assign: true, resolve: false, close: true },
    });
    expect(handlerView!.ref).toMatch(/^[0-9a-f-]{36}$/);
    await asUser(t, HANA).mutation(api.grievances.assign, { id, assigneeEmail: HANA });
    expect((await asUser(t, HANA).query(api.grievances.get, { id }))!.can).toMatchObject({
      take: false,
      resolve: true,
    });
  });

  test("the team's lists and what's waiting on them", async () => {
    const t = await setup();
    const a = await t.mutation(api.grievances.submit, input({ email: "a@example.com" }));
    await t.mutation(api.grievances.submit, input({ email: "b@example.com" }));
    await asUser(t, HANA).mutation(api.grievances.assign, { id: a, assigneeEmail: HANA });
    expect(await asUser(t, HANA).query(api.grievances.waitingOnMe, {})).toBe(2);
    expect(await asUser(t, CARL).query(api.grievances.waitingOnMe, {})).toBe(1);

    for (const query of [api.grievances.years, api.grievances.team] as const) {
      expect(await asUser(t, LEO).query(query, {})).toBeNull();
    }
    expect(await asUser(t, LEO).query(api.grievances.submitted, { year: YEAR })).toBeNull();
    expect(await asUser(t, LEO).query(api.grievances.waitingOnMe, {})).toBe(0);
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
    const id = await t.mutation(api.grievances.submit, input());
    expect((await notificationsFor(t, HANA))[0].read).toBe(false);
    await asUser(t, HANA).mutation(api.notifications.markReadForGrievance, { grievanceId: id });
    expect((await notificationsFor(t, HANA))[0].read).toBe(true);
    await t.mutation(api.notifications.markReadForGrievance, { grievanceId: id });
  });
});
