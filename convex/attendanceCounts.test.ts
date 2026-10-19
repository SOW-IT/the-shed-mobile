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

const ADMIN = "admin@sow.org.au";
const USYD = "University of Sydney";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await asUser(t, ADMIN).mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  return t;
}

const createEvent = (t: TestConvex<typeof schema>, name = "Outreach", offset = 0) =>
  asUser(t, ADMIN).mutation(api.events.create, {
    name,
    dateStart: Date.now() + offset,
    dateEnd: Date.now() + offset + 3_600_000,
    subgroups: [USYD],
  });

const addMembers = (t: TestConvex<typeof schema>, names: string[]) =>
  t.run(async (ctx) => {
    const ids: Id<"attendanceMembers">[] = [];
    for (const name of names) ids.push(await ctx.db.insert("attendanceMembers", { name }));
    return ids;
  });

const storedCount = (t: TestConvex<typeof schema>, eventId: Id<"events">) =>
  t.run(async (ctx) => (await ctx.db.get(eventId))?.attendanceCount ?? null);

const listedCount = async (t: TestConvex<typeof schema>, eventId: Id<"events">) => {
  const list = await asUser(t, ADMIN).query(api.events.listBySubgroup, { subgroup: USYD });
  return list.events.find((e) => e._id === eventId)?.attendanceCount;
};

describe("event attendance counts", () => {
  test("signing in and out keeps the count on the event", async () => {
    const t = await setup();
    const eventId = await createEvent(t);
    const [ann, ben] = await addMembers(t, ["Ann", "Ben"]);
    expect(await storedCount(t, eventId)).toBeNull();
    expect(await listedCount(t, eventId)).toBe(0);

    const admin = asUser(t, ADMIN);
    await admin.mutation(api.attendance.signIn, { eventId, memberId: ann });
    await admin.mutation(api.attendance.signIn, { eventId, memberId: ben });
    expect(await storedCount(t, eventId)).toBe(2);
    expect(await listedCount(t, eventId)).toBe(2);

    await admin.mutation(api.attendance.signOut, { eventId, memberId: ann });
    expect(await storedCount(t, eventId)).toBe(1);
    expect(await listedCount(t, eventId)).toBe(1);
  });

  test("the list shows the stored count without reading the event's rows", async () => {
    const t = await setup();
    const eventId = await createEvent(t);
    const [ann, ben] = await addMembers(t, ["Ann", "Ben"]);
    await asUser(t, ADMIN).mutation(api.attendance.signIn, { eventId, memberId: ann });
    await t.run((ctx) =>
      ctx.db.insert("attendance", { eventId, memberId: ben, signInTime: Date.now() })
    );
    expect(await listedCount(t, eventId)).toBe(1);
  });

  test("an event with no stored count is counted from its rows", async () => {
    const t = await setup();
    const eventId = await createEvent(t);
    const [ann, ben] = await addMembers(t, ["Ann", "Ben"]);
    await t.run(async (ctx) => {
      for (const memberId of [ann, ben]) {
        await ctx.db.insert("attendance", { eventId, memberId, signInTime: Date.now() });
      }
    });
    expect(await listedCount(t, eventId)).toBe(2);
  });

  test("merging a member who signed in to the same event lowers that event's count", async () => {
    const t = await setup();
    const eventId = await createEvent(t);
    const [ann, annAgain] = await addMembers(t, ["Ann", "Ann Again"]);
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.attendance.signIn, { eventId, memberId: ann });
    await admin.mutation(api.attendance.signIn, { eventId, memberId: annAgain });
    expect(await storedCount(t, eventId)).toBe(2);
    await t.run(async (ctx) => {
      const { moveAttendance } = await import("./staffMembers");
      await moveAttendance(ctx, annAgain, ann);
    });
    expect(await storedCount(t, eventId)).toBe(1);
  });

  test("the backfill stores every event's count, in batches", async () => {
    const t = await setup();
    const eventIds: Id<"events">[] = [];
    for (let i = 0; i < 30; i++) eventIds.push(await createEvent(t, `Event ${i}`, i * 60_000));
    const [ann] = await addMembers(t, ["Ann"]);
    await t.run(async (ctx) => {
      await ctx.db.insert("attendance", { eventId: eventIds[0], memberId: ann, signInTime: 1 });
      await ctx.db.insert("attendance", { eventId: eventIds[29], memberId: ann, signInTime: 1 });
    });

    await t.mutation(internal.attendanceCounts.backfill, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const counts = await t.run(async (ctx) =>
      Promise.all(eventIds.map(async (id) => (await ctx.db.get(id))?.attendanceCount))
    );
    expect(counts[0]).toBe(1);
    expect(counts[29]).toBe(1);
    expect(counts.slice(1, 29).every((count) => count === 0)).toBe(true);
  });

  test("the backfill leaves a correct count alone and ignores a deleted event", async () => {
    const t = await setup();
    const eventId = await createEvent(t);
    await t.run((ctx) => ctx.db.patch(eventId, { attendanceCount: 0 }));
    await t.mutation(internal.attendanceCounts.backfill, { cursor: null });
    expect(await storedCount(t, eventId)).toBe(0);

    await t.run(async (ctx) => {
      const { recountEventAttendance } = await import("./attendanceCounts");
      await ctx.db.delete(eventId);
      await recountEventAttendance(ctx, eventId);
    });
    expect(await t.run((ctx) => ctx.db.get(eventId))).toBeNull();
  });
});
