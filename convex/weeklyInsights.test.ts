/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { WeeklyBlock } from "../shared/weeklyInsightsView";
import type { WeeklyMark } from "../shared/weeklyInsights";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { readCampusWeeklyAverages } from "./weeklyInsights";

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
const T2_2026_WEEKS = [1, 2, 3, 4, 5, 8, 9];

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
    const lee = profile.memberId!;
    const tag = await ctx.db.insert("attendanceTags", { name: "Weeklies" });
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
      values: { r1: "Member", r2: "Alumni", r3: "Visitor" },
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

    const event = (name: string, at: number, subgroups = [UNSW], mark: WeeklyMark | null = null) =>
      ctx.db.insert("events", {
        name,
        dateStart: at,
        dateEnd: at + 2 * 3600_000,
        subgroups,
        tagIds: mark ? [tag] : [],
        ...(mark ? { weekly: mark } : {}),
      });
    const signIn = (eventId: Id<"events">, memberId: Id<"attendanceMembers">) =>
      ctx.db.insert("attendance", { eventId, memberId, signInTime: Date.now() });
    const weeklies: Id<"events">[] = [];
    for (const [i, at] of T2_2025.entries()) {
      const e = await event("Weeklies", at, [UNSW], { year: 2025, slot: 2, week: i + 1 });
      weeklies.push(e);
      await signIn(e, ana);
      await signIn(e, ben);
    }
    for (const [i, at] of T1_2026.entries()) {
      const e = await event("Weeklies", at, [UNSW], { year: 2026, slot: 1, week: i + 1 });
      weeklies.push(e);
      await signIn(e, ana);
      await signIn(e, lee);
      if (i === 0) await signIn(e, cy);
    }
    for (const [i, at] of T2_2026.entries()) {
      const e = await event("Weeklies", at, [UNSW], { year: 2026, slot: 2, week: T2_2026_WEEKS[i] });
      weeklies.push(e);
      await signIn(e, lee);
      if (i < 5) await signIn(e, ana);
      if (i === 5) await signIn(e, newbie);
      if (i === 6) await signIn(e, guest);
    }
    // A Mega Weeklies shared with another campus: never counted by default.
    const mega = await event("Mega weeklies", wed(2026, 7, 15), [UNSW, USYD], { year: 2026, slot: 2, week: 7 });
    await signIn(mega, ana);
    await signIn(mega, cy);
    // Not held (nobody came), not yet held, and not a weekly at all.
    await event("Weeklies", wed(2026, 7, 15), [UNSW], { year: 2026, slot: 2, week: 7 });
    const future = await event("Weeklies", wed(2026, 8, 5), [UNSW], { year: 2026, slot: 2, week: 10 });
    await signIn(future, ana);
    const social = await event("Social", wed(2026, 7, 10), [UNSW]);
    await signIn(social, ana);
    return { tag, campus, role, lee, ana, ben, cy, newbie, guest, weeklies, social, mega };
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
    // Each year's terms, newest first, then that whole year.
    expect(index.periods.map((p) => p.label)).toEqual([
      "2026 T2",
      "2026 T1",
      "2026",
      "2025 T2",
      "2025",
    ]);
    expect(index.currentKey).toBe("2026-T2");
    // Recent held weeklies for the SOW comparison; the shared Mega weeklies
    // (15 Jul) isn't one of them.
    expect(index.weeklies.at(-1)).toMatchObject({ at: T2_2026[6], count: 2, joint: false });
    expect(index.weeklies.find((w) => w.at === wed(2026, 7, 15))).toMatchObject({ count: 2, joint: true });
    expect(index.weeklies.some((w) => w.at === wed(2026, 8, 5))).toBe(false);
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

  test("a hand-set Visitor is a visitor at their own campus; a saved Guest or Newcomer counts for nothing", async () => {
    const { t, leader, ids } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch("attendanceMembers", ids.ana, { metadata: { [ids.campus]: "c1", [ids.role]: "r3" } });
      await ctx.db.patch("attendanceMetadata", ids.role, {
        values: { r1: "Member", r2: "Alumni", r3: "Visitor", r4: "Guest", r5: "Newcomer" },
      });
      await ctx.db.patch("attendanceMembers", ids.guest, { metadata: { [ids.role]: "r4" } });
      await ctx.db.patch("attendanceMembers", ids.newbie, { metadata: { [ids.campus]: "c1", [ids.role]: "r5" } });
    });
    await rebuild(t);
    const now = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!;
    const people = block(now.blocks as Block[], "people");
    const row = (name: string) => people.rows.find((r) => r.name === name)!;
    expect([row("Ana Doe").category.label, row("Ana Doe").section]).toEqual(["Visitor", "campus"]);
    // Guest is no longer a Role: they're judged on their weeklies.
    expect(row("Gil Guest").category.label).not.toBe("Staff, alumni & guests");
    expect(row("Nia New").category.label).toBe("Newcomer");
    const saved = (await t.run((ctx) => ctx.db.query("weeklyCategories").collect()))[0];
    expect(saved.people).toContainEqual({ key: `member:${ids.ana}`, category: "visitor" });
  });

  test("other periods, unknown periods and access", async () => {
    const { t, leader } = await setup();
    await rebuild(t);
    const past = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period: "2025-T2" }))!;
    expect(past.period).toBe("2025-T2");
    expect((past.blocks as Block[]).some((b) => b.type === "followUpGroups")).toBe(false);
    const year = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period: "2026" }))!;
    expect((year.blocks[1] as { text: string }).text).toMatch(/^2026: 11 weeklies in T1 and T2, compared with 2025 up to T2 week \d+\.$/);
    expect((await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period: "nope" }))!.period).toBe("2026-T2");
    expect(await t.query(api.weeklyInsights.view, { subgroup: UNSW })).toBeNull();
  });

  test("the period picker says term or semester, as the campus counts them", async () => {
    const { t, leader } = await setup();
    await rebuild(t);
    await rebuild(t, MQ);
    expect(await leader.query(api.weeklyInsights.view, { subgroup: UNSW })).toMatchObject({
      pickerTitle: "Term or year",
      pickerLabel: "Term",
    });
    expect(await leader.query(api.weeklyInsights.view, { subgroup: MQ })).toMatchObject({
      period: null,
      pickerTitle: "Semester or year",
      pickerLabel: "Semester",
    });
    expect(await leader.query(api.weeklyInsights.view, { subgroup: USYD })).toMatchObject({
      blocks: [{ title: "Not ready yet" }],
      pickerTitle: "Semester or year",
    });
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
        weekly: { year: 2025, slot: 2, week: 4 },
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
      "T2 2026: 8 weeklies, compared with T1 2026."
    );
    expect((await indexDoc(t))!.nextCompareAt).toBe(Date.UTC(2026, 11, 31, 13));
  });

  test("it waits for the running term's end, then for the next new year in Sydney", async () => {
    const { t } = await setup();
    await rebuild(t);
    expect((await indexDoc(t))!.nextCompareAt).toBe(T2_2026[6] + 18 * DAY);
    vi.setSystemTime(wed(2027, 6, 1));
    await rebuild(t);
    expect((await indexDoc(t))!.nextCompareAt).toBe(Date.UTC(2027, 11, 31, 13));
    await rebuild(t, MQ);
    expect((await indexDoc(t, MQ))!.nextCompareAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("a finished year is compared with the whole year before once the new year starts", async () => {
    const { t } = await setup();
    vi.setSystemTime(wed(2026, 12, 2));
    await rebuild(t);
    const yearView = async () => (await viewDocs(t))[`${UNSW}|2026`].blocks as Block[];
    expect(block(await yearView(), "multiBars", "Weeklies average by term").subtitle).toBe("Against 2025 up to T2 week 10");
    expect((await indexDoc(t))!.nextCompareAt).toBe(Date.UTC(2026, 11, 31, 13));
    vi.setSystemTime(Date.UTC(2026, 11, 31, 16));
    await rebuild(t);
    const after = await yearView();
    expect(block(after, "multiBars", "Weeklies average by term").subtitle).toBe("Against 2025");
    expect((after[1] as { text: string }).text).toBe("2026: 12 weeklies in T1 and T2, compared with 2025.");
    expect((await indexDoc(t))!.nextCompareAt).toBe(Date.UTC(2027, 11, 31, 13));
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

  test("staff are keyed by their member row", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const now = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!;
    const lee = block(now.blocks, "people").rows.find((r) => r.name === "Lee Leader")!;
    expect(lee).toMatchObject({ key: `member:${ids.lee}`, section: "leader", category: { label: "Leader" } });
    expect((await indexDoc(t))!.weeklies.at(-1)).toMatchObject({ at: T2_2026[6], count: 2 });
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
        await ctx.db.patch(id, { tagIds: [], weekly: undefined });
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
    expect(index.periods[0].label).toBe("2026 Sem 2");
    expect((await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!.period).toBe("2026-S2");
  });

  test("rebuildAll's nightly run does nothing where nightly jobs are paused", async () => {
    const { t } = await setup();
    vi.stubEnv("NIGHTLY_JOBS_PAUSED", "true");
    try {
      await t.mutation(internal.weeklyInsights.rebuildAll, { nightly: true });
      const jobs = await t.run(
        async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length
      );
      expect(jobs).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
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

describe("year so far", () => {
  test("compared with last year up to the same term and week, chart included", async () => {
    const { t, leader, ids } = await setup();
    // T2 2025's third weekly (18 Jun) gets a third person: 2, 2, 3.
    await t.run((ctx) => ctx.db.insert("attendance", { eventId: ids.weeklies[2], memberId: ids.cy, signInTime: 0 }));
    vi.setSystemTime(Date.UTC(2026, 5, 12, 2)); // Fri 12 Jun 2026: T2 has had 2 weeklies.
    await rebuild(t);
    const blocks = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period: "2026" }))!.blocks as Block[];
    const chart = block(blocks, "multiBars", "Weeklies average by term");
    expect(chart.subtitle).toBe("Against 2025 up to T2 week 2");
    // T2 2026 has had 2 weeklies, so T2 2025 counts its first two weeks.
    expect(chart.points.find((p) => p.label === "T2")!.segments[1].value).toBe(2);
    expect((blocks[1] as { text: string }).text).toMatch(/, compared with 2025 up to T2 week 2\.$/);
    expect(
      blocks.flatMap((b) => (b.type === "cards" ? b.cards : [])).map((c) => c.hint)
    ).toEqual(["vs 2", "vs 2", "vs 2", "vs 2", undefined, "vs 100%"]);
    // T2 2025's own page still shows the whole term.
    const t2 = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period: "2025-T2" }))!.blocks as Block[];
    expect(block(t2, "cards").cards[0].value).toBe("2.3");
  });
});

describe("a term that's gone", () => {
  test("the term after it is redone against its new term before", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const caption = async (period: string) =>
      ((await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period }))!.blocks[1] as { text: string }).text;
    expect(await caption("2026-T1")).toBe("T1 2026: 4 weeklies, compared with T2 2025.");
    vi.setSystemTime(NOW + DAY);
    await t.run(async (ctx) => {
      for (const eventId of ids.weeklies.slice(0, T2_2025.length)) {
        for (const row of await ctx.db.query("attendance").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()) {
          await ctx.db.delete(row._id);
        }
        await ctx.db.insert("attendanceAuditLog", { actorEmail: ADMIN, entityType: "attendance", action: "delete", summary: "x", eventId });
      }
    });
    await rebuild(t);
    expect(Object.keys(await factDocs(t)).sort()).toEqual([`${UNSW}|2026-T1`, `${UNSW}|2026-T2`]);
    expect(await caption("2026-T1")).toBe("T1 2026: 4 weeklies.");
  });
});

describe("someone who left staff", () => {
  test("they stay a leader in the terms they served and the rebuild re-reads them", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const views = await viewDocs(t);
    vi.setSystemTime(NOW + DAY);
    const result = await t.mutation(internal.staffLeavers.staffRollover, { year: 2027, dryRun: false });
    expect(result).toMatchObject({ left: 1, details: [{ email: LEADER, action: "left" }] });
    const left = (await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect())).find(
      (l) => l.action === "member.leftStaff"
    )!;
    expect(left).toMatchObject({ memberId: ids.lee, subjectEmail: LEADER });
    const check = await t.query(internal.weeklyInsights.checkChanges, { subgroup: UNSW, now: NOW + DAY });
    expect(check.memberKeys).toEqual([`member:${ids.lee}`]);
    expect(check.goneMemberKeys).toEqual([`staff:${LEADER}`]);
    await rebuild(t);
    expect((await viewDocs(t))[`${UNSW}|2026-T2`].computedAt).toBeGreaterThan(views[`${UNSW}|2026-T2`].computedAt);
    const t2 = (await leader.query(api.weeklyInsights.view, { subgroup: UNSW, period: "2026-T2" }))!.blocks as Block[];
    expect(block(t2, "people").rows.find((r) => r.key === `member:${ids.lee}`)).toMatchObject({
      name: "Lee Leader",
      category: { label: "Leader" },
    });
  });

  test("a member with an email edited since the last build re-reads that email's weeklies", async () => {
    const { t, ids } = await setup();
    await rebuild(t);
    vi.setSystemTime(NOW + DAY);
    await t.run((ctx) =>
      ctx.db.insert("attendanceAuditLog", { actorEmail: ADMIN, entityType: "member", action: "update", summary: "x", memberId: ids.ana })
    );
    const check = await t.query(internal.weeklyInsights.checkChanges, { subgroup: UNSW, now: NOW + DAY });
    expect(check.memberKeys).toEqual([`member:${ids.ana}`, "staff:ana@example.com"]);
    expect(check.needsBuild).toBe(true);
  });
});

describe("sign-in tags", () => {
  test("newcomers and visitors from the last build; a shared event only tags newcomers", async () => {
    const { t, leader, ids } = await setup();
    expect(await leader.query(api.weeklyInsights.signInTags, { eventId: ids.weeklies[0] })).toEqual([]);
    await rebuild(t);
    const saved = (await t.run((ctx) => ctx.db.query("weeklyCategories").collect()))[0];
    expect(saved).toMatchObject({ subgroup: UNSW, termKey: "2026-T2" });
    expect(saved.people).toContainEqual({ key: `member:${ids.lee}`, category: "leader" });
    expect(saved.people.some((p) => p.key.startsWith("staff:"))).toBe(false);

    expect(await leader.query(api.weeklyInsights.signInTags, { eventId: ids.weeklies[0] })).toEqual([
      { key: `member:${ids.newbie}`, label: "Newcomer", colour: "#8B5CF6" },
      { key: `member:${ids.cy}`, label: "Visitor", colour: "#3B82F6" },
    ]);
    expect(await leader.query(api.weeklyInsights.signInTags, { eventId: ids.mega })).toEqual([
      { key: `member:${ids.newbie}`, label: "Newcomer", colour: "#8B5CF6" },
    ]);
    expect(await t.query(api.weeklyInsights.signInTags, { eventId: ids.mega })).toEqual([]);
    await t.run((ctx) => ctx.db.delete(ids.social));
    expect(await leader.query(api.weeklyInsights.signInTags, { eventId: ids.social })).toEqual([]);

    // The latest term loses all its weeklies: the term before becomes the
    // latest, and its categories replace the old ones.
    vi.setSystemTime(NOW + DAY);
    await t.run(async (ctx) => {
      for (const eventId of ids.weeklies.slice(T2_2025.length + T1_2026.length)) {
        for (const row of await ctx.db.query("attendance").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()) {
          await ctx.db.delete(row._id);
        }
        await ctx.db.insert("attendanceAuditLog", { actorEmail: ADMIN, entityType: "attendance", action: "delete", summary: "x", eventId });
      }
    });
    const before = (await viewDocs(t))[`${UNSW}|2026-T1`].computedAt;
    await rebuild(t);
    expect((await indexDoc(t))!.currentKey).toBe("2026-T1");
    expect((await viewDocs(t))[`${UNSW}|2026-T1`].computedAt).toBeGreaterThan(before);
    const after = (await t.run((ctx) => ctx.db.query("weeklyCategories").collect()))[0];
    expect(after.termKey).toBe("2026-T1");
    expect(await leader.query(api.weeklyInsights.signInTags, { eventId: ids.weeklies[0] })).toEqual([
      { key: `member:${ids.cy}`, label: "Visitor", colour: "#3B82F6" },
    ]);

    // A campus left with no weeklies drops its tags.
    const { _id, _creationTime, ...index } = (await indexDoc(t))!;
    await t.mutation(internal.weeklyInsights.saveIndex, {
      ...index,
      viewVersion: index.viewVersion!,
      periods: [],
      currentKey: null,
    });
    expect(await t.run((ctx) => ctx.db.query("weeklyCategories").collect())).toEqual([]);
    await t.mutation(internal.weeklyInsights.saveIndex, { ...index, viewVersion: 3, periods: [], currentKey: null });
  });
});

describe("member page", () => {
  test("shows their church: a member's own, or a staff person's from their Profile", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const grace = await t.run((ctx) =>
      ctx.db.insert("churches", { name: "Grace Church", nameKey: "grace church", addedBy: "x" })
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: LEADER, churchId: grace });
      await ctx.db.patch("attendanceMembers", ids.ana, { churchId: grace });
    });
    const details = async (personKey: string) => {
      const page = (await leader.query(api.weeklyInsights.member, { personKey, subgroup: UNSW }))!;
      return block(page.blocks as Block[], "keyValues")?.rows ?? [];
    };
    const churchRow = { label: "Church", value: "Grace Church", link: expect.stringMatching(/^\/churches\?church=/) };
    expect(await details(`member:${ids.ana}`)).toContainEqual(churchRow);
    expect(await details(`member:${ids.lee}`)).toContainEqual(churchRow);
    expect(await details(`member:${ids.lee}`)).toContainEqual({ label: "Email", value: LEADER });
    expect(await details(`member:${ids.ben}`)).not.toContainEqual(expect.objectContaining({ label: "Church" }));
  });

  test("a member: header, details, weeklies by term, week grid and every event", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const page = (await leader.query(api.weeklyInsights.member, { personKey: `member:${ids.ana}`, subgroup: UNSW }))!;
    expect(page.title).toBe("Ana Doe");
    const blocks = page.blocks as Block[];
    expect(blocks.map((b) => b.type)).toEqual(["memberHeader", "keyValues", "termHistory", "weekGrid", "eventList"]);
    expect(blocks[0]).toMatchObject({
      lines: ["UNSW"],
      category: { label: "Regular" },
      reason: "T2 2026: 5/7 · 71%\nLast came T2W5 (1 Jul)\nCame to 5 of 5, then missed the last 2",
      memberId: ids.ana,
    });
    expect(blocks[1]).toMatchObject({ rows: [{ label: "Email", value: "ana@example.com" }, { label: "Year", value: "2" }] });
    expect(block(blocks, "termHistory").rows.map((r) => r.label)).toEqual(["T2 2026", "T1 2026", "T2 2025"]);
    const events = block(blocks, "eventList").rows;
    expect(events[0]).toEqual({ title: "Weeklies", subtitle: "5 Aug · UNSW", tag: "Weekly" });
    expect(events.find((e) => e.title === "Social")!.tag).toBeUndefined();
    expect(block(blocks, "weekGrid")).toMatchObject({ title: "T2 2026", subtitle: "Weeklies attended this term" });
  });

  test("once the latest term has finished, the week grid doesn't call it this term", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    vi.setSystemTime(T2_2026[6] + 19 * DAY);
    const page = (await leader.query(api.weeklyInsights.member, { personKey: `member:${ids.ana}`, subgroup: UNSW }))!;
    expect(block(page.blocks as Block[], "weekGrid")).toMatchObject({ title: "T2 2026", subtitle: "Weeklies attended" });
  });

  test("opened without a campus, it shows who they are this staff year and every event", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const page = (await leader.query(api.weeklyInsights.member, { personKey: `member:${ids.lee}`, subgroup: "" }))!;
    expect(page.blocks.map((b) => b.type)).toEqual(["memberHeader", "keyValues", "eventList"]);
    expect(page.blocks[0]).toMatchObject({ name: "Lee Leader", lines: ["UNSW", "Student Leader"] });
    expect((page.blocks.at(-1) as { rows: unknown[] }).rows).toHaveLength(11);
  });

  test("lists each event once and skips deleted ones", async () => {
    const { t, leader, ids } = await setup();
    const events = async () => {
      const page = (await leader.query(api.weeklyInsights.member, { personKey: `member:${ids.ana}`, subgroup: UNSW }))!;
      return block(page.blocks as Block[], "eventList").rows;
    };
    const before = await events();
    await t.run(async (ctx) => {
      await ctx.db.insert("attendance", { eventId: ids.social, memberId: ids.ana, signInTime: 1 });
      const gone = await ctx.db.insert("events", { name: "Gone", dateStart: NOW, dateEnd: NOW, subgroups: [UNSW] });
      await ctx.db.insert("attendance", { eventId: gone, memberId: ids.ana, signInTime: 1 });
      await ctx.db.delete(gone);
    });
    expect(await events()).toEqual(before);
  });

  test("a staff year with no campus role falls back to the member's own campus", async () => {
    const { t, ids } = await setup();
    await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "dir@sow.org.au" });
      await ctx.db.insert("staffProfiles", {
        email: "dir@sow.org.au",
        year: 2026,
        name: "Dee Director",
        userId: id,
        memberId: ids.ana,
        assignments: [{ role: "Director" }],
      });
    });
    const [ana] = await t.query(internal.weeklyInsights.gatherPeople, { keys: [`member:${ids.ana}`], years: [2026] });
    expect(ana).toMatchObject({ name: "Dee Director", infoByYear: { "2026": { campus: UNSW, roles: ["Director"] } } });
  });

  test("staff, someone with no weeklies here, and an unknown key", async () => {
    const { t, leader, ids } = await setup();
    await rebuild(t);
    const staff = (await leader.query(api.weeklyInsights.member, { personKey: `member:${ids.lee}`, subgroup: UNSW }))!;
    expect(staff.blocks[0]).toMatchObject({ name: "Lee Leader", lines: ["UNSW", "Student Leader"], category: { label: "Leader" } });
    expect((staff.blocks.at(-1) as { rows: unknown[] }).rows).toHaveLength(11);
    const cy = (await leader.query(api.weeklyInsights.member, { personKey: `member:${ids.cy}`, subgroup: MQ }))!;
    expect(cy.blocks.map((b) => b.type)).toEqual(["memberHeader", "eventList"]);
    expect(cy.blocks[0]).toMatchObject({ lines: ["USYD"] });
    const bogus = (await leader.query(api.weeklyInsights.member, { personKey: "member:nope", subgroup: UNSW }))!;
    expect(bogus.title).toBe("Unknown");
    expect(bogus.blocks[0]).toMatchObject({ lines: ["No campus set"] });
    const legacy = (await leader.query(api.weeklyInsights.member, { personKey: `staff:${LEADER}`, subgroup: UNSW }))!;
    expect(legacy.title).toBe("Unknown");
    expect(legacy.blocks.map((b) => b.type)).toEqual(["memberHeader", "eventList"]);
    expect(await t.query(api.weeklyInsights.member, { personKey: `member:${ids.ana}`, subgroup: UNSW })).toBeNull();
  });
});

describe("combined weeklies, marks and suggestions", () => {
  test("a weekly shared with other campuses counts only when the setting says so", async () => {
    const { t } = await setup();
    await rebuild(t);
    expect((await factDocs(t))[`${UNSW}|2026-T2`].weeklies).toHaveLength(7);
    await t.mutation(internal.weeklyInsights.setSettings, { jointWeeklies: true });
    const scheduled = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map((f) => f.name)
    );
    expect(scheduled).toEqual(
      expect.arrayContaining([
        expect.stringContaining("weeklyInsights:rebuildAll"),
        expect.stringContaining("generalMetrics:recomputeCampusWeeklyAttendance"),
      ])
    );
    await rebuild(t);
    const t2 = (await factDocs(t))[`${UNSW}|2026-T2`];
    expect(t2.weeklies.map((w) => w.at)).toContain(wed(2026, 7, 15));
    expect((await indexDoc(t))!.weeklies.find((w) => w.at === wed(2026, 7, 15))!.joint).toBe(true);
  });

  test("a weekly's own term and week win over dates", async () => {
    const { t, ids } = await setup();
    await t.run((ctx) => ctx.db.patch(ids.weeklies[12], { weekly: { year: 2026, slot: 1, week: 11 } }));
    await rebuild(t);
    const facts = await factDocs(t);
    expect(facts[`${UNSW}|2026-T1`].weeklies.map((w) => [w.at, w.week])).toEqual([
      ...T1_2026.map((at, i) => [at, i + 1]),
      [T2_2026[5], 11],
    ]);
    expect(facts[`${UNSW}|2026-T2`].weeklies.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 9]);
  });

  test("suggests the term, week and name for a new weekly", async () => {
    const { t, leader, ids } = await setup();
    const next = (await leader.query(api.weeklyInsights.suggestWeekly, { subgroup: UNSW, dateStart: wed(2026, 8, 12) }))!;
    expect(next).toMatchObject({ system: "terms", suggested: { key: "2026-T2", week: 11 }, name: "T2W11" });
    expect(next.options.map((o) => o.label)).toEqual(["T1 2026", "T2 2026", "T3 2026"]);
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
    expect(usyd).toMatchObject({ system: "semesters", suggested: { key: "2026-S2", week: 1 }, name: "S2W1" });
    expect(await t.query(api.weeklyInsights.suggestWeekly, { subgroup: UNSW, dateStart: NOW })).toBeNull();
  });
});

describe("creating an event as a Weekly", () => {
  const base = { name: "Weeklies T2W11", dateStart: wed(2026, 8, 12), dateEnd: wed(2026, 8, 12) + 7_200_000, subgroups: [UNSW] };

  test("stores its term and week and adds the Weeklies tag", async () => {
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
    await expect(bad({ year: 2026, slot: 2, week: 0 })).rejects.toThrow(/1 to 14/);
    await expect(bad({ year: 2026, slot: 2, week: 2.5 })).rejects.toThrow(/1 to 14/);
    await expect(bad({ year: 2026, slot: 2, week: 15 })).rejects.toThrow("The week should be a number from 1 to 14.");
    await expect(bad({ year: 2026, slot: 3, week: 1 }, [USYD])).rejects.toThrow(/semester doesn't exist/);
    await expect(bad({ year: 2026, slot: 4, week: 1 })).rejects.toThrow(/term doesn't exist/);
    await expect(bad({ year: 2028, slot: 1, week: 1 })).rejects.toThrow("The term should be in 2026, the year of the date.");
    await expect(bad({ year: 2027, slot: 1, week: 1 })).rejects.toThrow(/should be in 2026/);
    await expect(bad({ year: 2025, slot: 2, week: 1 }, [USYD])).rejects.toThrow("The semester should be in 2026, the year of the date.");
    await t.run((ctx) => ctx.db.delete(ids.tag));
    const id = await leader.mutation(api.events.create, { ...base, weekly: { year: 2026, slot: 2, week: 11 } });
    const tags = await t.run((ctx) => ctx.db.query("attendanceTags").collect());
    expect(tags.map((tag) => tag.name)).toEqual(["Weeklies"]);
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

describe("the Weeklies tag on events", () => {
  const base = { name: "T2W11", dateStart: wed(2026, 8, 12), dateEnd: wed(2026, 8, 12) + 7_200_000, subgroups: [UNSW] };
  const saved = (t: TestConvex<typeof schema>, id: Id<"events">) => t.run(async (ctx) => (await ctx.db.get(id))!);
  const tagNames = (t: TestConvex<typeof schema>) =>
    t.run(async (ctx) => (await ctx.db.query("attendanceTags").collect()).map((tag) => tag.name));

  test("the Weeklies tag is reused, not duplicated, and goes first", async () => {
    const { t, leader, ids } = await setup();
    const social = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Social" }));
    const id = await leader.mutation(api.events.create, { ...base, tagIds: [social], weekly: { year: 2026, slot: 2, week: 11 } });
    expect((await saved(t, id)).tagIds).toEqual([ids.tag, social]);
    expect(await tagNames(t)).toEqual(["Weeklies", "Social"]);
  });

  test("with a second Weeklies tag, a weekly carries only the first", async () => {
    const { t, leader, ids } = await setup();
    const second = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Weeklies", list: "weeklies" }));
    const social = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Social" }));
    const id = await leader.mutation(api.events.create, {
      ...base,
      tagIds: [social, second],
      weekly: { year: 2026, slot: 2, week: 11 },
    });
    expect((await saved(t, id)).tagIds).toEqual([ids.tag, social]);
    await leader.mutation(api.events.update, { eventId: id, ...base, tagIds: [second, ids.tag, social], weekly: null });
    expect((await saved(t, id)).tagIds).toEqual([social]);
  });

  test("an org-wide (SOW) event with the tag isn't a weekly and loses the tag", async () => {
    const { t, leader, ids } = await setup();
    const social = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Social" }));
    const sow = await leader.mutation(api.events.create, { ...base, name: "WEEKLIES T2W11", subgroups: ["SOW", UNSW], tagIds: [ids.tag, social] });
    const doc = await saved(t, sow);
    expect(doc.weekly).toBeUndefined();
    expect(doc.tagIds).toEqual([social]);
    const only = await leader.mutation(api.events.create, { ...base, subgroups: ["ALL"], tagIds: [ids.tag] });
    expect((await saved(t, only)).tagIds).toBeUndefined();
  });

  test("an ordinary event never keeps the weekly tag", async () => {
    const { t, leader, ids } = await setup();
    const id = await leader.mutation(api.events.create, { ...base, name: "Weeklies", tagIds: [ids.tag] });
    await leader.mutation(api.events.update, { eventId: id, ...base, name: "Social night", tagIds: [ids.tag], weekly: null });
    const doc = await saved(t, id);
    expect(doc.weekly).toBeUndefined();
    expect(doc.tagIds).toBeUndefined();
  });

  test("a suggestion also gives the campus's latest weekly and the weeks already taken", async () => {
    const { leader, ids } = await setup();
    const next = (await leader.query(api.weeklyInsights.suggestWeekly, { subgroup: UNSW, dateStart: wed(2026, 8, 12) }))!;
    expect(next.previous).toEqual({ dateStart: wed(2026, 8, 5), dateEnd: wed(2026, 8, 5) + 2 * 3600_000 });
    expect(next.taken!.map((w) => `${w.year}-${w.slot}-${w.week}`)).toEqual([
      ...[1, 2, 3, 4].map((w) => `2026-1-${w}`),
      ...[1, 2, 3, 4, 5, 7, 8, 9, 10].map((w) => `2026-2-${w}`),
    ]);
    expect(next.taken!.every((w) => w.name === "Weeklies")).toBe(true);
    const lastYear = (await leader.query(api.weeklyInsights.suggestWeekly, { subgroup: UNSW, dateStart: wed(2025, 6, 25) }))!;
    expect(lastYear.taken!.map((w) => w.week)).toEqual([1, 2, 3]);
    const editing = (await leader.query(api.weeklyInsights.suggestWeekly, {
      subgroup: UNSW,
      dateStart: wed(2026, 8, 5),
      eventId: ids.weeklies.at(-1)!,
    }))!;
    expect(editing.taken!.some((w) => w.slot === 2 && w.week === 9)).toBe(false);
    const none = (await leader.query(api.weeklyInsights.suggestWeekly, { subgroup: MQ, dateStart: wed(2026, 8, 12) }))!;
    expect(none).toMatchObject({ previous: null, taken: [] });
  });

  test("a suggestion reads the newest events, so years of old events don't hide the latest weekly", async () => {
    const { t, leader } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 5000; i++) {
        const at = Date.UTC(2020, 0, 1) + i * 3600_000;
        await ctx.db.insert("events", { name: `Old ${i}`, dateStart: at, dateEnd: at, subgroups: [MQ] });
      }
    });
    const next = (await leader.query(api.weeklyInsights.suggestWeekly, { subgroup: UNSW, dateStart: wed(2026, 8, 12) }))!;
    expect(next).toMatchObject({ suggested: { key: "2026-T2", week: 11 }, name: "T2W11" });
    expect(next.previous).toEqual({ dateStart: wed(2026, 8, 5), dateEnd: wed(2026, 8, 5) + 2 * 3600_000 });
  });
});

describe("2.6.4 regressions", () => {
  test("merging a duplicate away leaves no Unknown behind and gives the kept person the weeklies", async () => {
    const { t, leader, ids } = await setup();
    const dup = await t.run(async (ctx) => {
      const id = await ctx.db.insert("attendanceMembers", { name: "Ana D", metadata: {} });
      for (const eventId of ids.weeklies.slice(-2)) {
        await ctx.db.insert("attendance", { eventId, memberId: id, signInTime: NOW - DAY });
      }
      return id;
    });
    await rebuild(t);
    const before = block((await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!.blocks as Block[], "people");
    expect(before.rows.some((r) => r.name === "Ana D")).toBe(true);

    await leader.mutation(api.attendanceMembers.merge, { removeId: dup, keep: { memberId: ids.ana }, resolutions: {} });
    await rebuild(t);

    const after = block((await leader.query(api.weeklyInsights.view, { subgroup: UNSW }))!.blocks as Block[], "people");
    expect(after.rows.map((r) => r.name)).not.toContain("Unknown");
    expect(after.rows.map((r) => r.name)).not.toContain("Ana D");
    const facts = Object.values(await factDocs(t)).flatMap((f) => f.attendance.map((a) => a.key));
    expect(facts).not.toContain(`member:${dup}`);
    const ana = Object.values(await factDocs(t))
      .find((f) => f.termKey === "2026-T2")!
      .attendance.find((a) => a.key === `member:${ids.ana}`)!;
    expect(ana.indexes).toHaveLength(7);
  });

  test("the SOW campus comparison counts shared weeklies only when collaborative is on", async () => {
    const { t, ids } = await setup();
    await t.run((ctx) => ctx.db.insert("attendance", { eventId: ids.mega, memberId: ids.ben, signInTime: wed(2026, 7, 15) }));
    await rebuild(t);
    const [withShared, without] = await t.run(async (ctx) => [
      await readCampusWeeklyAverages(ctx, 2026, 4, true),
      await readCampusWeeklyAverages(ctx, 2026, 4, false),
    ]);
    const unsw = (rows: { campus: string; avgWeekly: number }[]) => rows.find((r) => r.campus === UNSW)?.avgWeekly;
    expect(unsw(withShared)).toBeDefined();
    expect(unsw(withShared)).not.toBe(unsw(without));
  });

  test("a staff profile change in Admin, and a member field change, trigger a rebuild", async () => {
    const { t, admin } = await setup();
    await rebuild(t);
    const check = () => t.query(internal.weeklyInsights.checkChanges, { subgroup: UNSW, now: NOW });
    expect((await check()).needsBuild).toBe(false);

    await admin.mutation(api.admin.setStaffProfile, {
      email: LEADER,
      year: 2026,
      roles: ["Student Leader", "Executive"],
      university: UNSW,
    });
    const afterProfile = await check();
    expect(afterProfile.needsBuild).toBe(true);
    expect(afterProfile.memberKeys.some((k) => k.startsWith("member:"))).toBe(true);
    await rebuild(t);
    expect((await check()).needsBuild).toBe(false);

    await t.run((ctx) =>
      ctx.db.insert("attendanceAuditLog", {
        actorEmail: ADMIN,
        entityType: "metadata",
        action: "metadata.update",
        summary: 'Updated member field "Role"',
      })
    );
    const afterField = await check();
    expect(afterField).toMatchObject({ needsBuild: true, metadataChanged: true });
  });
});
