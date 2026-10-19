import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
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

const addProfile = (t: TestConvex<typeof schema>, email: string, year = YEAR) =>
  t.run((ctx) =>
    ctx.db.insert("staffProfiles", {
      email,
      year,
      assignments: [{ role: "Student Leader", university: "USYD" }],
    })
  );

const generalView = (t: TestConvex<typeof schema>) =>
  t.query(api.generalMetrics.view, { scope: "all" });

describe("Insights staff trends snapshot", () => {
  test("the General view reads the snapshot until the next rebuild", async () => {
    const t = convexTest(schema, modules);
    await addProfile(t, "ann@sow.org.au");
    await addProfile(t, "ann@sow.org.au", YEAR - 1);
    const before = await generalView(t);

    await t.mutation(internal.generalMetrics.recomputeStaffTrends, {});
    await addProfile(t, "ben@sow.org.au");
    expect(await generalView(t)).toEqual(before);

    await t.mutation(internal.generalMetrics.recomputeStaffTrends, {});
    expect(await generalView(t)).not.toEqual(before);
  });

  test("a snapshot from another staff year is ignored, and a rebuild leaves one row", async () => {
    const t = convexTest(schema, modules);
    await addProfile(t, "ann@sow.org.au");
    await t.mutation(internal.generalMetrics.recomputeStaffTrends, {});
    const current = await t.run((ctx) => ctx.db.query("staffTrendsSnapshots").first());
    await t.run(async (ctx) => {
      await ctx.db.patch(current!._id, { staffYear: YEAR - 1 });
      await ctx.db.insert("staffTrendsSnapshots", { staffYear: YEAR - 1, trends: current!.trends });
    });
    await addProfile(t, "ben@sow.org.au");
    const live = await generalView(t);

    await t.mutation(internal.generalMetrics.recomputeStaffTrends, {});
    const rows = await t.run((ctx) => ctx.db.query("staffTrendsSnapshots").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].staffYear).toBe(YEAR);
    expect(await generalView(t)).toEqual(live);
  });
});
