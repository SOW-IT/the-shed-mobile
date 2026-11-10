import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { type T, YEAR, newConvex, pinClock } from "../test/convexFixture";

pinClock();

const addProfile = (t: T, email: string, year = YEAR) =>
  t.run((ctx) =>
    ctx.db.insert("staffProfiles", {
      email,
      year,
      assignments: [{ role: "Student Leader", university: "USYD" }],
    })
  );

const generalView = (t: T) =>
  t.query(api.generalMetrics.view, { scope: "all" });

describe("Insights staff trends snapshot", () => {
  test("the General view reads the snapshot until the next rebuild", async () => {
    const t = newConvex();
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
    const t = newConvex();
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
