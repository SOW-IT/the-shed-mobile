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
  test("orders the roster the same way as reading every event's attendance", async () => {
    const { t, current } = await setup();
    const live = await rosterNames(t, current);
    expect(live).toEqual(["Cat", "Ann", "Ben"]);

    await t.mutation(internal.rosterHistory.rebuild, {});
    expect(await rosterNames(t, current)).toEqual(live);
  });

  test("uses last night's snapshot instead of today's sign-ins", async () => {
    const { t, current, tagged, ben } = await setup();
    await t.mutation(internal.rosterHistory.rebuild, { year: YEAR });
    await t.run((ctx) =>
      ctx.db.insert("attendance", { eventId: tagged, memberId: ben, signInTime: 2 })
    );
    expect(await rosterNames(t, current)).toEqual(["Cat", "Ann", "Ben"]);

    await t.mutation(internal.rosterHistory.rebuild, { year: YEAR });
    expect(await rosterNames(t, current)).toEqual(["Ben", "Cat", "Ann"]);
  });

  test("a rebuild keeps one snapshot per year, and another year is read live", async () => {
    const { t, current } = await setup();
    await t.run(async (ctx) => {
      const empty = { builtAt: 0, events: [], members: [] };
      await ctx.db.insert("rosterHistorySnapshots", { year: YEAR, ...empty });
      await ctx.db.insert("rosterHistorySnapshots", { year: YEAR, ...empty });
      await ctx.db.insert("rosterHistorySnapshots", { year: YEAR - 1, ...empty });
    });
    await t.mutation(internal.rosterHistory.rebuild, {});
    const snapshots = await t.run((ctx) => ctx.db.query("rosterHistorySnapshots").collect());
    expect(snapshots.filter((s) => s.year === YEAR)).toHaveLength(1);
    expect(snapshots.find((s) => s.year === YEAR)!.events).toHaveLength(4);

    expect(await rosterNames(t, current, YEAR + 1)).toEqual(["Ann", "Ben", "Cat"]);
  });

  test("the nightly metrics rebuild refreshes the snapshot", async () => {
    const { t } = await setup();
    await t.mutation(internal.attendanceMetrics.recomputeAll, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const snapshot = await t.run((ctx) => ctx.db.query("rosterHistorySnapshots").first());
    expect(snapshot?.year).toBe(YEAR);
    expect(snapshot?.members.length).toBe(3);
  });
});
