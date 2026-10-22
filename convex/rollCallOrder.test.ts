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
const HOUR = 3_600_000;

const ADMIN = "admin@sow.org.au";
const USYD = "University of Sydney";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  const ids = await t.run(async (ctx) => ({
    tag: await ctx.db.insert("attendanceTags", { name: "Outreach" }),
    ann: await ctx.db.insert("attendanceMembers", { name: "Ann" }),
    ben: await ctx.db.insert("attendanceMembers", { name: "Ben" }),
    cat: await ctx.db.insert("attendanceMembers", { name: "Cat" }),
  }));
  const past = (daysAgo: number, people: Id<"attendanceMembers">[]) =>
    t.run(async (ctx) => {
      const eventId = await ctx.db.insert("events", {
        name: `Night ${daysAgo}`,
        dateStart: PINNED_NOW - daysAgo * DAY,
        dateEnd: PINNED_NOW - daysAgo * DAY + HOUR,
        subgroups: [USYD],
      });
      for (const memberId of people) {
        await ctx.db.insert("attendance", { eventId, memberId, signInTime: 1 });
      }
      return eventId;
    });
  await past(2, [ids.ann, ids.ben]);
  await past(9, [ids.ann]);
  await t.mutation(internal.rosterHistory.rebuild, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, admin, past, ...ids };
}

const createEvent = async (
  admin: ReturnType<typeof asUser>,
  fields: { daysAhead?: number; tagIds?: Id<"attendanceTags">[] } = {}
) =>
  await admin.mutation(api.events.create, {
    name: "Tonight",
    dateStart: PINNED_NOW + (fields.daysAhead ?? 0) * DAY + HOUR,
    dateEnd: PINNED_NOW + (fields.daysAhead ?? 0) * DAY + 3 * HOUR,
    subgroups: [USYD],
    ...(fields.tagIds ? { tagIds: fields.tagIds } : {}),
  });

const orderOf = (t: TestConvex<typeof schema>, eventId: Id<"events">) =>
  t.run((ctx) =>
    ctx.db
      .query("rollCallOrders")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique()
  );

const pendingRanks = async (t: TestConvex<typeof schema>) =>
  (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).filter(
    (job) => job.name.includes("rollCallOrder") && job.state.kind === "pending"
  ).length;

const rosterNames = async (t: TestConvex<typeof schema>, eventId: Id<"events">) =>
  (await asUser(t, ADMIN).query(api.attendance.roster, { year: YEAR, eventId }))
    .map((row) => row.name)
    .filter((name) => ["Ann", "Ben", "Cat"].includes(name));

describe("roll call order", () => {
  test("a new event is ranked straight away, most likely first", async () => {
    const { t, admin, ann, ben } = await setup();
    const eventId = await createEvent(admin);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const order = await orderOf(t, eventId);
    expect(order!.memberIds).toEqual([ann, ben]);
    expect(order!.scores[0]).toBeGreaterThan(order!.scores[1]);
    expect(await rosterNames(t, eventId)).toEqual(["Ann", "Ben", "Cat"]);
  });

  test("the roll call follows the stored order", async () => {
    const { t, admin, cat } = await setup();
    const eventId = await createEvent(admin);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      const order = await ctx.db
        .query("rollCallOrders")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .unique();
      await ctx.db.patch(order!._id, { memberIds: [cat], scores: [99] });
    });
    expect(await rosterNames(t, eventId)).toEqual(["Cat", "Ann", "Ben"]);
  });

  test("renaming an event or moving its end doesn't rank it again", async () => {
    const { t, admin } = await setup();
    const eventId = await createEvent(admin);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const event = (await t.run((ctx) => ctx.db.get(eventId)))!;
    await admin.mutation(api.events.update, {
      eventId,
      name: "Renamed",
      dateStart: event.dateStart,
      dateEnd: event.dateEnd + HOUR,
      subgroups: event.subgroups,
    });
    expect(await pendingRanks(t)).toBe(0);
  });

  test("changing an event's tags, groups or date ranks it again", async () => {
    const { t, admin, tag } = await setup();
    const eventId = await createEvent(admin);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const event = (await t.run((ctx) => ctx.db.get(eventId)))!;
    await admin.mutation(api.events.update, {
      eventId,
      name: event.name,
      dateStart: event.dateStart,
      dateEnd: event.dateEnd,
      subgroups: event.subgroups,
      tagIds: [tag],
    });
    expect(await pendingRanks(t)).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await admin.mutation(api.events.update, {
      eventId,
      name: event.name,
      dateStart: event.dateStart + HOUR,
      dateEnd: event.dateEnd + HOUR,
      subgroups: event.subgroups,
      tagIds: [tag],
    });
    expect(await pendingRanks(t)).toBe(1);
  });

  test("ranking again with no new events leaves the stored order alone", async () => {
    const { t, admin } = await setup();
    const eventId = await createEvent(admin);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const before = await orderOf(t, eventId);
    expect(await t.mutation(internal.rollCallOrder.rank, { eventId })).toBe("unchanged");

    await t.mutation(internal.rosterHistory.rebuild, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await orderOf(t, eventId))!._creationTime).toBe(before!._creationTime);
    expect((await orderOf(t, eventId))!.builtAt).toBe(before!.builtAt);
  });

  test("a new event that changes nobody's place doesn't rewrite the order", async () => {
    const { t, admin, past } = await setup();
    const eventId = await createEvent(admin);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const before = await orderOf(t, eventId);
    await past(1, []);
    await t.mutation(internal.rosterHistory.rebuild, {});
    expect(await t.mutation(internal.rollCallOrder.rank, { eventId })).toBe("same order");
    expect((await orderOf(t, eventId))!.builtAt).toBe(before!.builtAt);
  });

  test("new sign-ins rank it again once the nightly snapshot has them", async () => {
    const { t, admin, past, ben, cat } = await setup();
    const eventId = await createEvent(admin);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await past(1, [cat, ben]);
    expect(await t.mutation(internal.rollCallOrder.rank, { eventId })).toBe("unchanged");
    await t.mutation(internal.rosterHistory.rebuild, {});
    expect(await rosterNames(t, eventId)).toEqual(["Ben", "Ann", "Cat"]);
    expect(await t.mutation(internal.rollCallOrder.rank, { eventId })).toBe("unchanged");
  });

  test("a recent past event is ranked from what happened before it", async () => {
    const { t, past, ann, ben } = await setup();
    await past(8, [ben]);
    const recent = await past(5, []);
    await t.mutation(internal.rosterHistory.rebuild, {});
    expect(await t.mutation(internal.rollCallOrder.rank, { eventId: recent })).toBe("saved");
    expect((await orderOf(t, recent))!.memberIds).toEqual([ben, ann]);
  });

  test("an event over 30 days old isn't ranked", async () => {
    const { t, past } = await setup();
    const old = await past(60, []);
    expect(await t.mutation(internal.rollCallOrder.rank, { eventId: old })).toBeNull();
    expect(await orderOf(t, old)).toBeNull();
  });

  test("an event over a week away is left for the nightly run", async () => {
    const { t, admin } = await setup();
    await createEvent(admin, { daysAhead: 10 });
    expect(await pendingRanks(t)).toBe(0);
  });

  test("the nightly snapshot ranks events on now or in the next week", async () => {
    const { t } = await setup();
    const at = async (daysFromNow: number, lengthDays = 0.1) =>
      await t.run((ctx) =>
        ctx.db.insert("events", {
          name: `Event ${daysFromNow}`,
          dateStart: PINNED_NOW + daysFromNow * DAY,
          dateEnd: PINNED_NOW + (daysFromNow + lengthDays) * DAY,
          subgroups: [USYD],
        })
      );
    const camp = await at(-2, 4);
    const soon = await at(3);
    const later = await at(10);
    const over = await at(-1);
    await t.mutation(internal.rosterHistory.rebuild, {});
    expect(await orderOf(t, camp)).not.toBeNull();
    expect(await orderOf(t, soon)).not.toBeNull();
    expect(await orderOf(t, later)).toBeNull();
    expect(await orderOf(t, over)).toBeNull();
  });

  test("deleting an event deletes its order", async () => {
    const { t, admin } = await setup();
    const eventId = await createEvent(admin);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await admin.mutation(api.events.remove, { eventId });
    expect(await t.run((ctx) => ctx.db.query("rollCallOrders").collect())).toEqual([]);
  });

  test("without a snapshot nothing is ranked, and the roll call sorts by campus then name", async () => {
    const { t, admin } = await setup();
    await t.run(async (ctx) => {
      for (const snapshot of await ctx.db.query("rosterHistorySnapshots").collect()) {
        await ctx.db.delete(snapshot._id);
      }
    });
    const eventId = await createEvent(admin);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await orderOf(t, eventId)).toBeNull();
    expect(await rosterNames(t, eventId)).toEqual(["Ann", "Ben", "Cat"]);
  });

  test("ranking a deleted event does nothing", async () => {
    const { t, admin } = await setup();
    const eventId = await createEvent(admin, { daysAhead: 1 });
    await t.run((ctx) => ctx.db.delete(eventId));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.mutation(internal.rollCallOrder.rank, { eventId })).toBeNull();
  });
});
