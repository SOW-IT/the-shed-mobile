/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { fingerprintOf } from "./appErrors";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";
const STAFF = "stella@sow.org.au";
const NOW = Date.now();

type T = TestConvex<typeof schema>;
const asUser = (t: T, email: string) => t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Marketing",
    division: "Engagement",
  });
  await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
    year: YEAR,
    email: STAFF,
    roles: ["Staff"],
    department: "Marketing",
  });
  return t;
}

const crash = (over: Partial<{ message: string; stack: string; route: string; platform: string; version: string }> = {}) => ({
  message: "Cannot read properties of undefined (reading 'name')",
  stack: "TypeError: Cannot read properties of undefined\n    at RosterRow",
  route: "/attendance/event/ns7c10ak3hmq5jxg86yxng36r98g85vj",
  platform: "ios",
  version: "2.9.19",
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("reporting app errors", () => {
  test("the same error from anyone is one row that counts up, with the last person who hit it", async () => {
    const t = await setup();
    const first = await asUser(t, STAFF).mutation(api.appErrors.report, crash());
    expect(first.repeated).toBe(false);
    vi.setSystemTime(NOW + 60_000);
    const again = await t.mutation(api.appErrors.report, crash({ stack: "TypeError: newer stack" }));
    expect(again).toEqual({ fingerprint: first.fingerprint, repeated: false });
    vi.setSystemTime(NOW + 120_000);
    await asUser(t, ADMIN).mutation(api.appErrors.report, crash());

    const recent = (await asUser(t, ADMIN).query(api.appErrors.recent, {}))!;
    expect(recent.days).toBe(7);
    expect(recent.errors).toHaveLength(1);
    expect(recent.errors[0]).toMatchObject({
      message: crash().message,
      stack: crash().stack,
      route: crash().route,
      platform: "ios",
      version: "2.9.19",
      lastEmail: ADMIN,
      count: 3,
      firstAt: NOW,
      lastAt: NOW + 120_000,
    });
  });

  test("a crash loop is counted once per five seconds", async () => {
    const t = await setup();
    await t.mutation(api.appErrors.report, crash());
    vi.setSystemTime(NOW + 1000);
    expect(await t.mutation(api.appErrors.report, crash())).toMatchObject({ repeated: true });
    vi.setSystemTime(NOW + 6000);
    expect(await t.mutation(api.appErrors.report, crash())).toMatchObject({ repeated: false });
    const recent = (await asUser(t, ADMIN).query(api.appErrors.recent, {}))!;
    expect(recent.errors[0].count).toBe(2);
  });

  test("ids and numbers in the message don't split one error into many; route, platform and version do", async () => {
    expect(fingerprintOf({ message: "Document kh78rsy9h0tbr95ms2nj4bzsm58d6xzk not found", platform: "ios" })).toBe(
      fingerprintOf({ message: "Document kh7dg4s2v9zf7w6bqa1zg82w3h8a9fka not found", platform: "ios" })
    );
    expect(fingerprintOf({ message: "Timed out after 30000 ms", platform: "web" })).toBe(
      fingerprintOf({ message: "Timed out after 45000 ms", platform: "web" })
    );
    const base = { message: "boom", platform: "ios", version: "2.9.19", route: "/home" };
    expect(fingerprintOf({ ...base, platform: "android" })).not.toBe(fingerprintOf(base));
    expect(fingerprintOf({ ...base, version: "2.9.20" })).not.toBe(fingerprintOf(base));
    expect(fingerprintOf({ ...base, route: "/org" })).not.toBe(fingerprintOf(base));
  });

  test("one crash on two events' pages is one error; a long platform or version is cut short", async () => {
    const t = await setup();
    await t.mutation(api.appErrors.report, crash({ route: "/attendance/event/ns7c10ak3hmq5jxg86yxng36r98g85vj" }));
    vi.setSystemTime(NOW + 60_000);
    await t.mutation(api.appErrors.report, crash({ route: "/attendance/event/ns73qvxfgcvyzzvdw9nm0sqcm98gnhnn" }));
    let errors = (await asUser(t, ADMIN).query(api.appErrors.recent, {}))!.errors;
    expect(errors).toHaveLength(1);
    expect(errors[0].count).toBe(2);

    await t.mutation(api.appErrors.report, crash({ message: "other", platform: "p".repeat(500), version: "9".repeat(500) }));
    await t.mutation(api.appErrors.report, crash({ message: "blank platform", platform: "   ", version: "  " }));
    errors = (await asUser(t, ADMIN).query(api.appErrors.recent, {}))!.errors;
    const other = errors.find((e) => e.message === "other")!;
    expect(other.platform).toHaveLength(16);
    expect(other.version).toHaveLength(32);
    expect(errors.find((e) => e.message === "blank platform")).toMatchObject({ platform: "unknown", version: null });
  });

  test("past 200 errors in an hour, new kinds of error are dropped; known ones still count", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 200; i++) {
        await ctx.db.insert("appErrors", {
          fingerprint: `f${i}`,
          message: `flood ${i}`,
          platform: "web",
          count: 1,
          firstAt: NOW,
          lastAt: NOW,
        });
      }
    });
    expect(await t.mutation(api.appErrors.report, crash({ message: "brand new" }))).toMatchObject({ repeated: true });
    const rows = await t.run((ctx) => ctx.db.query("appErrors").collect());
    expect(rows.some((r) => r.message === "brand new")).toBe(false);
  });

  test("long messages and stacks are trimmed, and an empty message is refused", async () => {
    const t = await setup();
    await t.mutation(api.appErrors.report, crash({ message: "x".repeat(900), stack: "y".repeat(9000), route: "/r".repeat(300) }));
    const [row] = (await asUser(t, ADMIN).query(api.appErrors.recent, {}))!.errors;
    expect(row.message).toHaveLength(500);
    expect(row.stack).toHaveLength(4000);
    expect(row.route).toHaveLength(200);
    await expect(t.mutation(api.appErrors.report, crash({ message: "   " }))).rejects.toThrow(/message/);
    await t.mutation(api.appErrors.report, crash({ message: "no stack", stack: undefined, route: undefined, version: undefined }));
    const bare = (await asUser(t, ADMIN).query(api.appErrors.recent, {}))!.errors.find((e) => e.message === "no stack")!;
    expect(bare).toMatchObject({ stack: null, route: null, version: null });
  });

  test("errors not seen for 30 days are purged nightly, in batches", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 501; i++) {
        await ctx.db.insert("appErrors", {
          fingerprint: `old${i}`,
          message: `old ${i}`,
          platform: "ios",
          count: 1,
          firstAt: NOW - 40 * 24 * 60 * 60 * 1000,
          lastAt: NOW - 31 * 24 * 60 * 60 * 1000,
        });
      }
    });
    await t.mutation(api.appErrors.report, crash({ message: "fresh" }));
    expect(await t.mutation(internal.appErrors.purgeOld, {})).toBe(500);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await t.run((ctx) => ctx.db.query("appErrors").collect());
    expect(left.map((r) => r.message)).toEqual(["fresh"]);
  });

  test("only admins read the list; old errors drop off after seven days; clearing removes a row", async () => {
    const t = await setup();
    const { fingerprint } = await t.mutation(api.appErrors.report, crash({ message: "old" }));
    vi.setSystemTime(NOW + 8 * 24 * 60 * 60 * 1000);
    await t.mutation(api.appErrors.report, crash({ message: "new" }));
    expect(await asUser(t, STAFF).query(api.appErrors.recent, {})).toBeNull();
    expect(await t.query(api.appErrors.recent, {})).toBeNull();
    const recent = (await asUser(t, ADMIN).query(api.appErrors.recent, {}))!;
    expect(recent.errors.map((e) => e.message)).toEqual(["new"]);
    expect(fingerprint).not.toBe(recent.errors[0].id);

    await expect(asUser(t, STAFF).mutation(api.appErrors.dismiss, { id: recent.errors[0].id })).rejects.toThrow();
    await asUser(t, ADMIN).mutation(api.appErrors.dismiss, { id: recent.errors[0].id });
    expect((await asUser(t, ADMIN).query(api.appErrors.recent, {}))!.errors).toEqual([]);
    await expect(asUser(t, ADMIN).mutation(api.appErrors.dismiss, { id: recent.errors[0].id })).rejects.toThrow(/already/);
  });
});
