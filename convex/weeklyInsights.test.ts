/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { WeeklyBlock } from "../shared/weeklyInsightsView";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Thursday 30 Jul 2026, midday in Sydney: T2 2026 has had 7 weeklies.
const NOW = Date.UTC(2026, 6, 30, 2);
const DAY = 86_400_000;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const UNSW = "University of New South Wales";
const USYD = "University of Sydney";
const MQ = "Macquarie University";
const wed = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 7);

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const T2_2025 = [wed(2025, 6, 4), wed(2025, 6, 11), wed(2025, 6, 18)];
const T1_2026 = [wed(2026, 2, 18), wed(2026, 2, 25), wed(2026, 3, 4), wed(2026, 3, 11)];
const T2_2026 = [wed(2026, 6, 3), wed(2026, 6, 10), wed(2026, 6, 17), wed(2026, 6, 24), wed(2026, 7, 1), wed(2026, 7, 22), wed(2026, 7, 29)];

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  for (const name of [UNSW, USYD, MQ]) await admin.mutation(api.admin.upsertUniversity, { year: 2026, name });
  await admin.mutation(api.admin.setStaffProfile, {
    email: LEADER,
    year: 2026,
    roles: ["Student Leader"],
    university: UNSW,
  });
  const ids = await t.run(async (ctx) => {
    const profile = (await ctx.db.query("staffProfiles").collect()).find((p) => p.email === LEADER)!;
    await ctx.db.patch(profile._id, { name: "Lee Leader" });
    const tag = await ctx.db.insert("attendanceTags", { name: "Weekly Meeting" });
    const campus = await ctx.db.insert("attendanceMetadata", {
      key: "Campus",
      type: "select",
      order: 0,
      values: { c1: UNSW, c2: USYD, c3: "Other" },
    });
    const role = await ctx.db.insert("attendanceMetadata", {
      key: "Role",
      type: "select",
      order: 1,
      values: { r1: "Member", r2: "Visitor" },
    });
    const year = await ctx.db.insert("attendanceMetadata", {
      key: "Year",
      type: "select",
      order: 2,
      values: { y2: "2" },
    });
    const member = (name: string, metadata: Record<string, string> = {}, email?: string) =>
      ctx.db.insert("attendanceMembers", { name, metadata, ...(email ? { email } : {}) });
    const ana = await member("Ana Doe", { [campus]: "c1", [role]: "r1", [year]: "y2" }, "ana@example.com");
    const ben = await member("Ben Roe", { [campus]: "c3" });
    const cy = await member("Cy Poe", { [campus]: "c2" });
    const newbie = await member("Nia New", { [campus]: "c1" });
    const guest = await member("Gil Guest", { [role]: "r2" });

    const event = (name: string, at: number, subgroups = [UNSW], weekly = true) =>
      ctx.db.insert("events", {
        name,
        dateStart: at,
        dateEnd: at + 2 * 3600_000,
        subgroups,
        tagIds: weekly ? [tag] : [],
      });
    const signIn = (eventId: Id<"events">, who: Id<"attendanceMembers"> | string) =>
      ctx.db.insert("attendance", {
        eventId,
        signInTime: Date.now(),
        ...(typeof who === "string" && who.includes("@") ? { email: who } : { memberId: who as Id<"attendanceMembers"> }),
      });
    const weeklies: Id<"events">[] = [];
    for (const at of T2_2025) {
      const e = await event("Weeklies", at);
      weeklies.push(e);
      await signIn(e, ana);
      await signIn(e, ben);
    }
    for (const [i, at] of T1_2026.entries()) {
      const e = await event("Weeklies", at);
      weeklies.push(e);
      await signIn(e, ana);
      await signIn(e, LEADER);
      if (i === 0) await signIn(e, cy);
    }
    for (const [i, at] of T2_2026.entries()) {
      const e = await event("Weeklies", at);
      weeklies.push(e);
      await signIn(e, LEADER);
      if (i < 5) await signIn(e, ana);
      if (i === 5) await signIn(e, newbie);
      if (i === 6) await signIn(e, guest);
    }
    // A Mega Weeklies shared with another campus: never counted by default.
    const mega = await event("Mega weeklies", wed(2026, 7, 15), [UNSW, USYD]);
    await signIn(mega, ana);
    await signIn(mega, cy);
    // Not held (nobody came), not yet held, and not a weekly at all.
    await event("Weeklies", wed(2026, 7, 15));
    const future = await event("Weeklies", wed(2026, 8, 5));
    await signIn(future, ana);
    const social = await event("Social", wed(2026, 7, 10), [UNSW], false);
    await signIn(social, ana);
    return { tag, campus, role, ana, ben, cy, newbie, guest, weeklies, social, mega };
  });
  return { t, admin, leader: asUser(t, LEADER), ids };
}

const rebuild = (t: TestConvex<typeof schema>, subgroup = UNSW, force?: boolean) =>
  t.action(internal.weeklyInsights.rebuild, { subgroup, ...(force ? { force } : {}) });

const viewDocs = (t: TestConvex<typeof schema>) =>
  t.run(async (ctx) =>
    Object.fromEntries(
      (await ctx.db.query("weeklyInsightViews").collect()).map((v) => [`${v.subgroup}|${v.periodKey}`, v])
    )
  );

const factDocs = (t: TestConvex<typeof schema>) =>
  t.run(async (ctx) =>
    Object.fromEntries((await ctx.db.query("weeklyTermFacts").collect()).map((f) => [`${f.subgroup}|${f.termKey}`, f]))
  );

const indexDoc = (t: TestConvex<typeof schema>, subgroup = UNSW) =>
  t.run((ctx) =>
    ctx.db
      .query("weeklyInsightIndex")
      .withIndex("by_subgroup", (q) => q.eq("subgroup", subgroup))
      .unique()
  );

type Block = WeeklyBlock;
const block = <T extends Block["type"]>(blocks: Block[], type: T, title?: string) =>
  blocks.find(
    (b) => b.type === type && (title === undefined || ("title" in b && b.title === title))
  ) as Extract<Block, { type: T }>;
const names = (b: { groups: { key: string; people: { name: string }[] }[] }) =>
  Object.fromEntries(b.groups.map((g) => [g.key, g.people.map((p) => p.name)]));

describe("first build and the view", () => {
  test("stores each term's facts, every view and the campus index", async () => {
    const { t, leader } = await setup();
    await rebuild(t);
    expect(Object.keys(await factDocs(t)).sort()).toEqual([`${UNSW}|2025-T2`, `${UNSW}|2026-T1`, `${UNSW}|2026-T2`]);
    const index = (await indexDoc(t))!;
    expect(index.periods.map((p) => p.label)).toEqual([
      "T2 2026",
      "T1 2026",
      "T2 2025",
      "2026 · whole year",
      "2025 · whole year",
    ]);
    expect(index.currentKey).toBe("2026-T2");
    // Recent held weeklies for the SOW comparison; the shared Mega weeklies
    // (15 Jul) isn't one of them.
    expect(index.weeklies.at(-1)).toMatchObject({ at: T2_2026[6], count: 2, joint: false });
    expect(index.weeklies.some((w) => w.at === wed(2026, 7, 15) || w.at === wed(2026, 8, 5))).toBe(false);
    expect(Object.keys(await viewDocs(t)).sort()).toEqual(
      [`${UNSW}|2025`, `${UNSW}|2025-T2`, `${UNSW}|2026`, `${UNSW}|2026-T1`, `${UNSW}|2026-T2`].sort()
    );

    const now = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!;
    expect(now.period).toBe("2026-T2");
    const blocks = now.blocks as Block[];
    expect(names(block(blocks, "followUpGroups", "Needs follow-up"))).toEqual({
      was_coming: ["Ana Doe"],
      newcomer: ["Nia New"],
    });
    expect(names(block(blocks, "followUpGroups", "Visitors"))).toEqual({});
    const people = block(blocks, "people");
    // Ana came to 5 of 7, so she's Regular even though she missed the last 2.
    expect(people.rows.map((r) => [r.name, r.category.label, r.section])).toEqual([
      ["Nia New", "Newcomer", "campus"],
      ["Ana Doe", "Regular", "campus"],
      ["Cy Poe", "Visitor", "other"],
      ["Lee Leader", "Leader", "leader"],
      ["Gil Guest", "Staff, alumni & guests", "staff"],
    ]);
  });

  test("other periods, unknown periods and access", async () => {
    const { t, leader } = await setup();
    await rebuild(t);
    const past = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period: "2025-T2" }))!;
    expect(past.period).toBe("2025-T2");
    expect((past.blocks as Block[]).some((b) => b.type === "followUpGroups")).toBe(false);
    const year = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period: "2026" }))!;
    expect((year.blocks[1] as { text: string }).text).toMatch(/^2026 · T1, T2 · 11 weeklies\. Compared with 2025 up to /);
    expect((await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period: "nope" }))!.period).toBe("2026-T2");
    expect(await t.query(api.weeklyInsights.view, { subgroup: UNSW })).toBeNull();
  });

  test("before a build it isn't ready; a campus with no weeklies has nothing to show", async () => {
    const { t, leader } = await setup();
    const before = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!;
    expect(before).toMatchObject({ periods: [], period: null, blocks: [{ type: "empty", title: "Not ready yet" }] });
    await rebuild(t, MQ);
    const mq = (await leader.query(api.weeklyInsights.view, { subgroup: MQ }))!;
    expect(mq).toMatchObject({ period: null, blocks: [{ type: "empty", title: "No weekly meetings yet" }] });
    // A period whose view row is missing reads as not ready.
    await rebuild(t);
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("weeklyInsightViews").collect()).find((v) => v.periodKey === "2026-T2")!;
      await ctx.db.delete(row._id);
    });
    expect((await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!.blocks).toMatchObject([{ title: "Not ready yet" }]);
  });
});

describe("nightly builds only redo what changed", () => {
  test("a quiet night only moves the watermark", async () => {
    const { t, ids } = await setup();
    await rebuild(t);
    const facts = await factDocs(t);
    const views = await viewDocs(t);
    const index = (await indexDoc(t))!;
    vi.setSystemTime(NOW + DAY);
    // Someone else's campus changed.
    const usydEvent = await t.run(async (ctx) => {
      const e = await ctx.db.insert("events", { name: "USYD", dateStart: NOW, dateEnd: NOW, subgroups: [USYD] });
      await ctx.db.insert("attendanceAuditLog", { actorEmail: ADMIN, entityType: "event", action: "update", summary: "x", eventId: e });
      return e;
    });
    await rebuild(t);
    expect(await factDocs(t)).toEqual(facts);
    expect(await viewDocs(t)).toEqual(views);
    const after = (await indexDoc(t))!;
    expect(after.computedAt).toBe(index.computedAt);
    expect(after.auditSeen).toBeGreaterThan(index.auditSeen);
    expect(after.eventsSeen).toBeGreaterThan(index.eventsSeen);
    expect(usydEvent).toBeTruthy();
    // And a night with nothing at all changes nothing.
    await rebuild(t);
    expect((await indexDoc(t))!.auditSeen).toBe(after.auditSeen);
    void ids;
  });

  test("a new sign-in redoes the current term and the one before, not older terms", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const views = await viewDocs(t);
    vi.setSystemTime(NOW + DAY);
    await leader.mutation(api.attendance.signIn, { eventId: ids.weeklies.at(-1)!, memberId: ids.ana });
    await rebuild(t);
    const after = await viewDocs(t);
    expect(after[`${UNSW}|2025-T2`].computedAt).toBe(views[`${UNSW}|2025-T2`].computedAt);
    expect(after[`${UNSW}|2026-T1`].computedAt).toBeGreaterThan(views[`${UNSW}|2026-T1`].computedAt);
    expect(after[`${UNSW}|2026-T2`].computedAt).toBeGreaterThan(views[`${UNSW}|2026-T2`].computedAt);
    expect(after[`${UNSW}|2026`].computedAt).toBeGreaterThan(views[`${UNSW}|2026`].computedAt);
    const now = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!;
    expect(names(block(now.blocks as Block[], "followUpGroups", "Needs follow-up"))).toEqual({ newcomer: ["Nia New"] });
  });

  test("editing someone redoes the current term; a removed member's weeklies are read again", async () => {
    const { t, ids } = await setup();
    await rebuild(t);
    const facts = await factDocs(t);
    const views = await viewDocs(t);
    vi.setSystemTime(NOW + DAY);
    await t.run((ctx) =>
      ctx.db.insert("attendanceAuditLog", { actorEmail: ADMIN, entityType: "member", action: "update", summary: "x", memberId: ids.ana })
    );
    await rebuild(t);
    expect(await factDocs(t)).toEqual(facts);
    const edited = await viewDocs(t);
    expect(edited[`${UNSW}|2026-T2`].computedAt).toBeGreaterThan(views[`${UNSW}|2026-T2`].computedAt);
    expect(edited[`${UNSW}|2026-T1`].computedAt).toBe(views[`${UNSW}|2026-T1`].computedAt);

    vi.setSystemTime(NOW + 2 * DAY);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("attendance").withIndex("by_member", (q) => q.eq("memberId", ids.ben)).collect()) {
        await ctx.db.delete(row._id);
      }
      await ctx.db.delete(ids.ben);
      await ctx.db.insert("attendanceAuditLog", { actorEmail: ADMIN, entityType: "member", action: "delete", summary: "x", memberId: ids.ben });
    });
    await rebuild(t);
    const after = await factDocs(t);
    expect(after[`${UNSW}|2025-T2`].attendance.map((a) => a.key)).toEqual([`member:${ids.ana}`]);
    expect(after[`${UNSW}|2026-T2`]).toEqual(facts[`${UNSW}|2026-T2`]);
  });

  test("a tag change re-reads every weekly; a deleted or imported weekly is picked up", async () => {
    const { t, ids } = await setup();
    await rebuild(t);
    const facts = await factDocs(t);
    vi.setSystemTime(NOW + DAY);
    await t.run((ctx) =>
      ctx.db.insert("attendanceAuditLog", { actorEmail: ADMIN, entityType: "tag", action: "update", summary: "x" })
    );
    await rebuild(t);
    expect(await factDocs(t)).toEqual(facts);
    expect((await indexDoc(t))!.computedAt).toBe(NOW + DAY);

    vi.setSystemTime(NOW + 2 * DAY);
    await t.run(async (ctx) => {
      const gone = ids.weeklies[0];
      for (const row of await ctx.db.query("attendance").withIndex("by_event", (q) => q.eq("eventId", gone)).collect()) {
        await ctx.db.delete(row._id);
      }
      await ctx.db.delete(gone);
      await ctx.db.insert("attendanceAuditLog", { actorEmail: ADMIN, entityType: "event", action: "delete", summary: "x", eventId: gone });
      // Imported: no change-log row, just a new event.
      const imported = await ctx.db.insert("events", {
        name: "Weeklies (imported)",
        dateStart: wed(2025, 6, 25),
        dateEnd: wed(2025, 6, 25),
        subgroups: [UNSW],
        tagIds: [ids.tag],
      });
      await ctx.db.insert("attendance", { eventId: imported, memberId: ids.cy, signInTime: 0 });
    });
    await rebuild(t);
    const t2 = (await factDocs(t))[`${UNSW}|2025-T2`];
    expect(t2.weeklies.map((w) => w.at)).toEqual([T2_2025[1], T2_2025[2], wed(2025, 6, 25)]);
  });

  test("the year and latest term are redone when a due date passes", async () => {
    const { t } = await setup();
    await rebuild(t);
    const views = await viewDocs(t);
    // The current term stops running 18 days after its last weekly.
    expect((await indexDoc(t))!.nextCompareAt).toBe(T2_2026[6] + 18 * DAY);
    await t.run(async (ctx) => {
      const index = (await ctx.db.query("weeklyInsightIndex").collect())[0];
      await ctx.db.patch(index._id, { nextCompareAt: NOW });
    });
    vi.setSystemTime(NOW + DAY);
    await rebuild(t);
    const after = await viewDocs(t);
    expect(after[`${UNSW}|2026`].computedAt).toBeGreaterThan(views[`${UNSW}|2026`].computedAt);
    expect(after[`${UNSW}|2026-T2`].computedAt).toBeGreaterThan(views[`${UNSW}|2026-T2`].computedAt);
    expect(after[`${UNSW}|2026-T1`].computedAt).toBe(views[`${UNSW}|2026-T1`].computedAt);
  });

  test("once the term stops running it loses \"so far\" and its follow-ups", async () => {
    const { t, leader } = await setup();
    await rebuild(t);
    // The setup's 5 Aug weekly has happened by then; the term ends after it.
    vi.setSystemTime(wed(2026, 8, 5) + 19 * DAY);
    await rebuild(t);
    const now = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!;
    expect((now.blocks[1] as { text: string }).text).toBe(
      "T2 2026 · 8 weeklies. Compared with T2 2025."
    );
    expect((await indexDoc(t))!.nextCompareAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("next year's comparison date is remembered", async () => {
    const { t } = await setup();
    vi.setSystemTime(wed(2027, 6, 1));
    await rebuild(t);
    expect((await indexDoc(t))!.nextCompareAt).toBe(Date.UTC(2027, 5, 3, 7));
  });

  test("a deploy that changes what views show redoes them all", async () => {
    const { t } = await setup();
    await rebuild(t);
    const views = await viewDocs(t);
    await t.run(async (ctx) => {
      const index = (await ctx.db.query("weeklyInsightIndex").collect())[0];
      await ctx.db.patch(index._id, { viewVersion: 0 });
    });
    vi.setSystemTime(NOW + DAY);
    await rebuild(t);
    const after = await viewDocs(t);
    for (const key of Object.keys(views)) expect(after[key].computedAt).toBeGreaterThan(views[key].computedAt);
  });

  test("staff signed in through their member row are still staff", async () => {
    const { t, leader, ids } = await setup();
    await t.run(async (ctx) => {
      const row = await ctx.db.insert("attendanceMembers", { name: "Lee Leader", email: LEADER });
      for (const a of await ctx.db.query("attendance").withIndex("by_email", (q) => q.eq("email", LEADER)).collect()) {
        await ctx.db.patch(a._id, { email: undefined, memberId: row });
      }
    });
    await rebuild(t);
    const now = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!;
    const lee = block(now.blocks, "people").rows.find((r) => r.name === "Lee Leader")!;
    expect(lee).toMatchObject({ section: "leader", category: { label: "Leader" } });
    void ids;
  });

  test("a forced rebuild redoes every view", async () => {
    const { t } = await setup();
    await rebuild(t);
    const views = await viewDocs(t);
    vi.setSystemTime(NOW + DAY);
    await rebuild(t, UNSW, true);
    const after = await viewDocs(t);
    for (const key of Object.keys(views)) expect(after[key].computedAt).toBeGreaterThan(views[key].computedAt);
  });

  test("a term that disappears takes its facts and views with it", async () => {
    const { t, ids } = await setup();
    await rebuild(t);
    vi.setSystemTime(NOW + DAY);
    await t.run(async (ctx) => {
      for (const id of ids.weeklies.slice(0, 3)) {
        await ctx.db.patch(id, { tagIds: [] });
        await ctx.db.insert("attendanceAuditLog", { actorEmail: ADMIN, entityType: "event", action: "update", summary: "x", eventId: id });
      }
    });
    await rebuild(t);
    expect(Object.keys(await factDocs(t))).not.toContain(`${UNSW}|2025-T2`);
    expect(Object.keys(await viewDocs(t))).not.toContain(`${UNSW}|2025`);
  });
});

describe("settings", () => {
  test("changing a number rebuilds every campus from its stored facts", async () => {
    const { t, leader } = await setup();
    await rebuild(t);
    const merged = await t.mutation(internal.weeklyInsights.setSettings, { followUpMisses: 3 });
    expect(merged.followUpMisses).toBe(3);
    expect(merged.regularShare).toBe(0.5);
    const again = await t.mutation(internal.weeklyInsights.setSettings, { followUpMisses: 2, termCampuses: [UNSW] });
    expect(again.followUpMisses).toBe(2);
    const row = await t.run((ctx) => ctx.db.query("weeklyInsightsSettings").unique());
    expect(row!.version).toBe(2);
    const jobs = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter((j) => j.name === "weeklyInsights:rebuildAll")
    );
    expect(jobs).toHaveLength(2);

    await t.mutation(internal.weeklyInsights.setSettings, { termCampuses: [] });
    vi.setSystemTime(NOW + DAY);
    await rebuild(t);
    const index = (await indexDoc(t))!;
    expect(index.settingsVersion).toBe(3);
    // UNSW now runs semesters.
    expect(index.periods[0].label).toBe("Sem 2 2026");
    expect((await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!.period).toBe("2026-S2");
  });

  test("rebuildAll schedules every campus this staff year, never SOW", async () => {
    const { t } = await setup();
    await t.run((ctx) => ctx.db.insert("universities", { name: "SOW", year: 2026 }));
    await t.mutation(internal.weeklyInsights.rebuildAll, { force: true });
    const jobs = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((j) => j.name === "weeklyInsights:rebuild")
        .map((j) => j.args[0] as { subgroup: string; force?: boolean })
    );
    const subgroups = jobs.map((j) => j.subgroup);
    for (const campus of [MQ, USYD, UNSW]) expect(subgroups).toContain(campus);
    expect(subgroups).not.toContain("SOW");
    expect(jobs.every((j) => j.force === true)).toBe(true);
  });
});

describe("Role option Visitor → Guest", () => {
  test("renames once; everyone tagged keeps the tag", async () => {
    const { t, ids } = await setup();
    expect(await t.mutation(internal.weeklyInsights.renameVisitorRole, {})).toEqual({ renamed: true });
    const role = await t.run((ctx) => ctx.db.get(ids.role));
    expect(role!.values).toEqual({ r1: "Member", r2: "Guest" });
    const guest = await t.run((ctx) => ctx.db.get(ids.guest));
    expect(guest!.metadata![ids.role]).toBe("r2");
    expect(await t.mutation(internal.weeklyInsights.renameVisitorRole, {})).toEqual({ renamed: false });
    await t.run((ctx) => ctx.db.delete(ids.role));
    expect(await t.mutation(internal.weeklyInsights.renameVisitorRole, {})).toEqual({ renamed: false });
  });
});

describe("member page", () => {
  test("a member: header, details, weeklies by term, week grid and every event", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const page = (await leader.query(api.weeklyInsights.member, { personKey: `member:${ids.ana}`, subgroup: UNSW }))!;
    expect(page.title).toBe("Ana Doe");
    const blocks = page.blocks as Block[];
    expect(blocks.map((b) => b.type)).toEqual(["memberHeader", "keyValues", "termHistory", "weekGrid", "eventList"]);
    expect(blocks[0]).toMatchObject({
      lines: ["UNSW", "Member"],
      category: { label: "Regular" },
      reason: "T2 2026: 5/7 · 71% · Came to 5 of 5, then missed the last 2",
      memberId: ids.ana,
    });
    expect(blocks[1]).toMatchObject({ rows: [{ label: "Email", value: "ana@example.com" }, { label: "Year", value: "2" }] });
    expect(block(blocks, "termHistory").rows.map((r) => r.label)).toEqual(["T2 2026", "T1 2026", "T2 2025"]);
    const events = block(blocks, "eventList").rows;
    expect(events[0]).toEqual({ title: "Weeklies", subtitle: "5 Aug · UNSW", tag: "Weekly" });
    expect(events.find((e) => e.title === "Social")!.tag).toBeUndefined();
  });

  test("staff, someone with no weeklies here, and an unknown key", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const staff = (await leader.query(api.weeklyInsights.member, { personKey: `staff:${LEADER}`, subgroup: UNSW }))!;
    expect(staff.blocks[0]).toMatchObject({ name: "Lee Leader", lines: ["UNSW", "Student Leader"], category: { label: "Leader" } });
    expect((staff.blocks.at(-1) as { rows: unknown[] }).rows).toHaveLength(11);
    const cy = (await leader.query(api.weeklyInsights.member, { personKey: `member:${ids.cy}`, subgroup: MQ }))!;
    expect(cy.blocks.map((b) => b.type)).toEqual(["memberHeader", "eventList"]);
    expect(cy.blocks[0]).toMatchObject({ lines: ["USYD"] });
    const bogus = (await leader.query(api.weeklyInsights.member, { personKey: "member:nope", subgroup: UNSW }))!;
    expect(bogus.title).toBe("Unknown");
    expect(bogus.blocks[0]).toMatchObject({ lines: ["No campus set"] });
    expect(await t.query(api.weeklyInsights.member, { personKey: `member:${ids.ana}`, subgroup: UNSW })).toBeNull();
  });
});

describe("combined weeklies, marks and suggestions", () => {
  test("a weekly shared with other campuses counts only when the setting says so", async () => {
    const { t } = await setup();
    await rebuild(t);
    expect((await factDocs(t))[`${UNSW}|2026-T2`].weeklies).toHaveLength(7);
    await t.mutation(internal.weeklyInsights.setSettings, { jointWeeklies: true });
    await rebuild(t);
    const t2 = (await factDocs(t))[`${UNSW}|2026-T2`];
    expect(t2.weeklies.map((w) => w.at)).toContain(wed(2026, 7, 15));
    expect((await indexDoc(t))!.weeklies.find((w) => w.at === wed(2026, 7, 15))!.joint).toBe(true);
  });

  test("a weekly's own term and week win over dates", async () => {
    const { t, ids } = await setup();
    await t.run((ctx) => ctx.db.patch(ids.weeklies[12], { weekly: { year: 2026, slot: 2, week: 9 } }));
    await rebuild(t);
    // 22 Jul is week 9 by its mark, so the unnamed 29 Jul after it is week 10.
    expect((await factDocs(t))[`${UNSW}|2026-T2`].weeklies.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 9, 10]);
  });

  test("suggests the term, week and name for a new weekly", async () => {
    const { t, leader, ids } = await setup();
    const next = (await leader.query(api.weeklyInsights.suggestWeekly, { subgroup: UNSW, dateStart: wed(2026, 8, 12) }))!;
    expect(next).toMatchObject({ system: "terms", suggested: { key: "2026-T2", week: 11 }, name: "Weeklies T2W11" });
    expect(next.options.map((o) => o.label)).toEqual(["T3 2025", "T1 2026", "T2 2026", "T3 2026"]);
    // Editing the 5 Aug weekly leaves it out of its own suggestion.
    const future = ids.weeklies.length; // the 5 Aug weekly isn't in `weeklies`
    void future;
    const own = (await leader.query(api.weeklyInsights.suggestWeekly, {
      subgroup: UNSW,
      dateStart: T2_2026[6],
      eventId: ids.weeklies[13],
    }))!;
    expect(own.suggested.week).toBe(9);
    const usyd = (await leader.query(api.weeklyInsights.suggestWeekly, { subgroup: USYD, dateStart: wed(2026, 7, 29) }))!;
    expect(usyd).toMatchObject({ system: "semesters", suggested: { key: "2026-S2", week: 1 }, name: "Weeklies S2W1" });
    expect(await t.query(api.weeklyInsights.suggestWeekly, { subgroup: UNSW, dateStart: NOW })).toBeNull();
  });
});

describe("backfilling weeklies' term and week", () => {
  const extras = (t: TestConvex<typeof schema>) =>
    t.run(async (ctx) => {
      const usydWeekly = await ctx.db.insert("events", {
        name: "WK #3",
        dateStart: wed(2026, 8, 12),
        dateEnd: wed(2026, 8, 12),
        subgroups: [USYD],
      });
      const season = await ctx.db.insert("events", {
        name: "Season S2W3",
        dateStart: wed(2026, 8, 13),
        dateEnd: wed(2026, 8, 13),
        subgroups: ["SOW"],
      });
      return { usydWeekly, season };
    });

  test("a dry run reports without writing; the real run fills in and tags, once", async () => {
    const { t, ids } = await setup();
    const { usydWeekly, season } = await extras(t);
    const dry = await t.mutation(internal.weeklyInsights.backfillWeeklies, { dryRun: true });
    expect(dry).toMatchObject({ marked: 17, tagged: 1 });
    expect(dry.byCampus.map((c) => c.campus)).toEqual([USYD, UNSW].sort());
    expect(dry.byCampus.find((c) => c.campus === USYD)!.terms).toEqual(["Sem 2 2026: W3"]);
    expect((await t.run((ctx) => ctx.db.get(ids.weeklies[0])))!.weekly).toBeUndefined();

    expect(await t.mutation(internal.weeklyInsights.backfillWeeklies, {})).toMatchObject({ marked: 17, tagged: 1 });
    const [first, usyd, mega, sow] = await t.run((ctx) =>
      Promise.all([ids.weeklies[0], usydWeekly, ids.mega, season].map((id) => ctx.db.get(id)))
    );
    expect(first!.weekly).toEqual({ year: 2025, slot: 2, week: 1 });
    expect(usyd).toMatchObject({ weekly: { year: 2026, slot: 2, week: 3 }, tagIds: [ids.tag] });
    expect(mega!.weekly).toBeUndefined();
    expect(sow!.weekly).toBeUndefined();
    const jobs = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter((j) => j.name === "weeklyInsights:rebuildAll")
    );
    expect(jobs.map((j) => j.args[0])).toEqual([{ force: true }]);
    expect(await t.mutation(internal.weeklyInsights.backfillWeeklies, {})).toMatchObject({ marked: 0, tagged: 0 });
  });

  test("makes the Weekly Meeting tag if there isn't one", async () => {
    const { t, ids } = await setup();
    await t.run(async (ctx) => {
      for (const e of await ctx.db.query("events").collect()) await ctx.db.patch(e._id, { tagIds: [] });
      await ctx.db.delete(ids.tag);
    });
    await t.mutation(internal.weeklyInsights.backfillWeeklies, {});
    const tags = await t.run((ctx) => ctx.db.query("attendanceTags").collect());
    expect(tags.map((tag) => tag.name)).toEqual(["Weekly Meeting"]);
  });
});

describe("creating an event as a Weekly", () => {
  const base = { name: "Weeklies T2W11", dateStart: wed(2026, 8, 12), dateEnd: wed(2026, 8, 12) + 7_200_000, subgroups: [UNSW] };

  test("stores its term and week and adds the Weekly Meeting tag", async () => {
    const { t, leader, ids } = await setup();
    const id = await leader.mutation(api.events.create, { ...base, weekly: { year: 2026, slot: 2, week: 11 } });
    const saved = await t.run((ctx) => ctx.db.get(id));
    expect(saved).toMatchObject({ weekly: { year: 2026, slot: 2, week: 11 }, tagIds: [ids.tag] });

    // Leaving it out on update keeps it; null makes it an ordinary event.
    await leader.mutation(api.events.update, { eventId: id, ...base, name: "Renamed", tagIds: [ids.tag] });
    expect((await t.run((ctx) => ctx.db.get(id)))!.weekly).toEqual({ year: 2026, slot: 2, week: 11 });
    await leader.mutation(api.events.update, { eventId: id, ...base, tagIds: [ids.tag], weekly: null });
    const plain = await t.run((ctx) => ctx.db.get(id));
    expect(plain!.weekly).toBeUndefined();
    expect(plain!.tagIds).toBeUndefined();
    const log = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(log.some((l) => l.detail?.includes("term and week"))).toBe(true);
  });

  test("checks the week, term and year, and makes the tag if needed", async () => {
    const { t, leader, ids } = await setup();
    const bad = (weekly: { year: number; slot: number; week: number }, subgroups = [UNSW]) =>
      leader.mutation(api.events.create, { ...base, subgroups, weekly });
    await expect(bad({ year: 2026, slot: 2, week: 0 })).rejects.toThrow(/1 to 20/);
    await expect(bad({ year: 2026, slot: 2, week: 2.5 })).rejects.toThrow(/1 to 20/);
    await expect(bad({ year: 2026, slot: 3, week: 1 }, [USYD])).rejects.toThrow(/semester doesn't exist/);
    await expect(bad({ year: 2026, slot: 4, week: 1 })).rejects.toThrow(/term doesn't exist/);
    await expect(bad({ year: 2028, slot: 1, week: 1 })).rejects.toThrow(/same year/);
    await t.run((ctx) => ctx.db.delete(ids.tag));
    const id = await leader.mutation(api.events.create, { ...base, weekly: { year: 2026, slot: 2, week: 11 } });
    const tags = await t.run((ctx) => ctx.db.query("attendanceTags").collect());
    expect(tags.map((tag) => tag.name)).toEqual(["Weekly Meeting"]);
    expect((await t.run((ctx) => ctx.db.get(id)))!.tagIds).toEqual([tags[0]._id]);
  });

  test("switching off Weekly keeps the event's other tags", async () => {
    const { t, leader, ids } = await setup();
    const social = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Social" }));
    const id = await leader.mutation(api.events.create, { ...base, tagIds: [social], weekly: { year: 2026, slot: 2, week: 11 } });
    await leader.mutation(api.events.update, { eventId: id, ...base, tagIds: [social, ids.tag], weekly: null });
    expect((await t.run((ctx) => ctx.db.get(id)))!.tagIds).toEqual([social]);
  });
});
