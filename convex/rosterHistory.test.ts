import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const PINNED_NOW = staffYearStartMs(staffYearForDate(new Date())) + 150 * 86_400_000;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});
const YEAR = staffYearForDate(new Date(PINNED_NOW));
const DAY = 86_400_000;

const ADMIN = "admin@sow.org.au";
const USYD = "University of Sydney";
const MACQ = "Macquarie University";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: MACQ });
  const ids = await t.run(async (ctx) => {
    const tagX = await ctx.db.insert("attendanceTags", { name: "Outreach" });
    const member = (name: string) => ctx.db.insert("attendanceMembers", { name });
    const event = (name: string, daysAgo: number, subgroups: string[], tagIds?: Id<"attendanceTags">[]) =>
      ctx.db.insert("events", {
        name,
        dateStart: PINNED_NOW - daysAgo * DAY,
        dateEnd: PINNED_NOW - daysAgo * DAY + 3_600_000,
        subgroups,
        ...(tagIds ? { tagIds } : {}),
      });
    const ann = await member("Ann");
    const ben = await member("Ben");
    const cat = await member("Cat");
    const tagged = await event("Tagged night", 3, [USYD], [tagX]);
    const plain = await event("Plain night", 2, [USYD]);
    const elsewhere = await event("Macquarie night", 1, [MACQ]);
    const current = await event("Tonight", 0, [USYD], [tagX]);
    const attend = (eventId: Id<"events">, memberId: Id<"attendanceMembers">) =>
      ctx.db.insert("attendance", { eventId, memberId, signInTime: 1 });
    await attend(tagged, cat);
    await attend(plain, ann);
    await attend(plain, ben);
    await attend(elsewhere, ann);
    await attend(current, ben);
    return { ann, ben, cat, current, tagged };
  });
  return { t, ...ids };
}

const rosterNames = async (t: TestConvex<typeof schema>, eventId: Id<"events">, year = YEAR) =>
  (await asUser(t, ADMIN).query(api.attendance.roster, { year, eventId }))
    .map((row) => row.name)
    .filter((name) => ["Ann", "Ben", "Cat"].includes(name));

describe("roster history snapshot", () => {
  test("sorts by name until the nightly snapshot ranks the event", async () => {
    const { t, current } = await setup();
    expect(await rosterNames(t, current)).toEqual(["Ann", "Ben", "Cat"]);

    await t.mutation(internal.rosterHistory.rebuild, {});
    expect(await rosterNames(t, current)).toEqual(["Cat", "Ann", "Ben"]);
  });

  test("uses last night's snapshot instead of today's sign-ins", async () => {
    const { t, current, tagged, ben } = await setup();
    await t.mutation(internal.rosterHistory.rebuild, {});
    await t.run((ctx) =>
      ctx.db.insert("attendance", { eventId: tagged, memberId: ben, signInTime: 2 })
    );
    expect(await rosterNames(t, current)).toEqual(["Cat", "Ann", "Ben"]);

    await t.mutation(internal.rosterHistory.rebuild, {});
    expect(await rosterNames(t, current)).toEqual(["Ben", "Cat", "Ann"]);
  });

  test("a rebuild leaves one snapshot, whatever year the old ones were for", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      const empty = { builtAt: 0, events: [], members: [] };
      await ctx.db.insert("rosterHistorySnapshots", { year: YEAR, ...empty });
      await ctx.db.insert("rosterHistorySnapshots", { year: YEAR, ...empty });
      await ctx.db.insert("rosterHistorySnapshots", { year: YEAR - 1, ...empty });
    });
    await t.mutation(internal.rosterHistory.rebuild, {});
    const snapshots = await t.run((ctx) => ctx.db.query("rosterHistorySnapshots").collect());
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].year).toBe(YEAR);
    expect(snapshots[0].members).toHaveLength(3);
  });

  test("keeps sign-ins from before the staff year started", async () => {
    const { t, ann } = await setup();
    await t.run(async (ctx) => {
      const lastYear = await ctx.db.insert("events", {
        name: "Last year's night",
        dateStart: staffYearStartMs(YEAR) - 10 * DAY,
        dateEnd: staffYearStartMs(YEAR) - 10 * DAY + 3_600_000,
        subgroups: [USYD],
      });
      await ctx.db.insert("attendance", { eventId: lastYear, memberId: ann, signInTime: 1 });
    });
    await t.mutation(internal.rosterHistory.rebuild, {});
    const snapshot = await t.run((ctx) => ctx.db.query("rosterHistorySnapshots").first());
    expect(snapshot!.events.map((e) => e.dateStart)).toContain(staffYearStartMs(YEAR) - 10 * DAY);
    expect(snapshot!.members.find((m) => m.memberId === ann)!.events).toHaveLength(3);
  });

  test("the nightly metrics rebuild refreshes the snapshot, then ranks this week's events", async () => {
    const { t, current } = await setup();
    await t.mutation(internal.attendanceMetrics.recomputeAll, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const snapshot = await t.run((ctx) => ctx.db.query("rosterHistorySnapshots").first());
    expect(snapshot?.year).toBe(YEAR);
    expect(snapshot?.members.length).toBe(3);
    const order = await t.run((ctx) =>
      ctx.db
        .query("rollCallOrders")
        .withIndex("by_eventId", (q) => q.eq("eventId", current))
        .unique()
    );
    expect(order?.memberIds.length).toBeGreaterThan(0);
  });

  test("a nightly rebuild only re-reads events whose sign-in count changed", async () => {
    const { t, tagged, ann } = await setup();
    const setCount = (count: number) =>
      t.run(async (ctx) => {
        const row = await ctx.db
          .query("eventAttendanceCounts")
          .withIndex("by_eventId", (q) => q.eq("eventId", tagged))
          .first();
        if (row) await ctx.db.patch(row._id, { count });
        else await ctx.db.insert("eventAttendanceCounts", { eventId: tagged, count });
      });
    const taggedAttendees = async () => {
      const snapshot = await t.run((ctx) => ctx.db.query("rosterHistorySnapshots").first());
      const index = snapshot!.events.findIndex((e) => e.eventId === tagged);
      return snapshot!.members.filter((m) => m.events.includes(index)).map((m) => m.memberId);
    };
    await setCount(1);
    await t.mutation(internal.rosterHistory.rebuild, {});
    await t.run((ctx) => ctx.db.insert("attendance", { eventId: tagged, memberId: ann, signInTime: 2 }));

    await t.mutation(internal.rosterHistory.rebuild, {});
    expect(await taggedAttendees()).not.toContain(ann);

    await setCount(2);
    await t.mutation(internal.rosterHistory.rebuild, {});
    expect(await taggedAttendees()).toContain(ann);
  });

  test("a full rebuild re-reads everything once a week", async () => {
    const { t, tagged, ann } = await setup();
    await t.run((ctx) => ctx.db.insert("eventAttendanceCounts", { eventId: tagged, count: 1 }));
    await t.mutation(internal.rosterHistory.rebuild, {});
    const firstFull = (await t.run((ctx) => ctx.db.query("rosterHistorySnapshots").first()))!.fullAt;
    await t.run((ctx) => ctx.db.insert("attendance", { eventId: tagged, memberId: ann, signInTime: 2 }));

    vi.setSystemTime(PINNED_NOW + DAY);
    await t.mutation(internal.rosterHistory.rebuild, {});
    let snapshot = (await t.run((ctx) => ctx.db.query("rosterHistorySnapshots").first()))!;
    expect(snapshot.fullAt).toBe(firstFull);

    vi.setSystemTime(PINNED_NOW + 8 * DAY);
    await t.mutation(internal.rosterHistory.rebuild, {});
    snapshot = (await t.run((ctx) => ctx.db.query("rosterHistorySnapshots").first()))!;
    expect(snapshot.fullAt).toBeGreaterThan(firstFull!);
    const index = snapshot.events.findIndex((e) => e.eventId === tagged);
    expect(snapshot.members.find((m) => m.memberId === ann)!.events).toContain(index);
  });
});
