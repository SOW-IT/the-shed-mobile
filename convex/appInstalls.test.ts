import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { notify } from "./requests";
import { ADMIN, asUser, seeded } from "../test/convexFixture";

const EVA = "eva@sow.org.au";
const EVENT = "/event-requests/abc/risk";

describe("app versions", () => {
  test("the app reports its version per kind of phone", async () => {
    const t = await seeded();
    expect(await t.mutation(api.appInstalls.report, { platform: "ios", version: "2.3.1" })).toBeNull();
    await expect(
      asUser(t, EVA).mutation(api.appInstalls.report, { platform: "ios", version: "latest" })
    ).rejects.toThrow(/isn't an app version/);
    await asUser(t, EVA).mutation(api.appInstalls.report, { platform: "ios", version: "2.3.1" });
    await asUser(t, EVA).mutation(api.appInstalls.report, { platform: "ios", version: "2.3.2" });
    const rows = await t.run((ctx) => ctx.db.query("appInstalls").collect());
    expect(rows.map((r) => [r.email, r.platform, r.version])).toEqual([[EVA, "ios", "2.3.2"]]);
  });

  test("emailed and bell links point straight at the page, whatever app version reported in", async () => {
    const t = await seeded();
    await asUser(t, ADMIN).mutation(api.appInstalls.report, { platform: "android", version: "2.9.25" });
    await t.run((ctx) => notify(ctx, { to: ADMIN, subject: "Hi", body: "Body", url: EVENT }));
    await t.run((ctx) => notify(ctx, { to: ADMIN, subject: "No link", body: "Body" }));
    const bodies = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .map((f) => f.args[0] as { body?: string; subject?: string })
        .filter((a) => a.subject)
        .map((a) => a.body)
    );
    expect(bodies[0]).toMatch(/event-requests\/abc\/risk$/);
    expect(bodies[1]).toMatch(/Open in THE SHED: \S+$/);
    const feed = await asUser(t, ADMIN).query(api.notifications.feed, {
      paginationOpts: { numItems: 10, cursor: null },
      appVersion: "2.9.25",
    });
    expect(feed!.page.map((n) => [n.title, n.url])).toEqual([
      ["No link", null],
      ["Hi", EVENT],
    ]);
  });
});

describe("update status", () => {
  test("names the newer of the recommended and minimum versions as the one to update to", async () => {
    const t = await seeded();
    await t.mutation(internal.appInstalls.setUpdatePolicy, {
      platform: "android",
      recommended: "2.9.1",
      minimum: "2.9.4",
    });
    expect(
      await t.query(api.appInstalls.updateStatus, { platform: "android", version: "2.9.0" })
    ).toEqual({ status: "required", latest: "2.9.4", message: null });
    await t.mutation(internal.appInstalls.setUpdatePolicy, {
      platform: "android",
      recommended: "2.10.0",
    });
    expect(
      await t.query(api.appInstalls.updateStatus, { platform: "android", version: "2.9.4" })
    ).toEqual({ status: "recommended", latest: "2.10.0", message: null });
    await t.mutation(internal.appInstalls.setUpdatePolicy, {
      platform: "android",
      recommended: "2.9.4",
    });
    expect(
      await t.query(api.appInstalls.updateStatus, { platform: "android", version: "2.9.4" })
    ).toEqual({ status: "ok", latest: "2.9.4", message: null });
  });
});

describe("raising the recommended version", () => {
  const policy = (t: Awaited<ReturnType<typeof seeded>>) =>
    t.run((ctx) => ctx.db.query("appUpdatePolicy").collect());

  test("sets it when there is no policy yet", async () => {
    const t = await seeded();
    expect(
      await t.mutation(internal.appInstalls.raiseRecommended, { platform: "ios", version: "2.12.38" })
    ).toEqual({ raised: true, previous: null, recommended: "2.12.38" });
    expect((await policy(t)).map(({ platform, recommended, minimum }) => [platform, recommended, minimum])).toEqual([
      ["ios", "2.12.38", undefined],
    ]);
  });

  test("raises an older version and keeps the minimum and message", async () => {
    const t = await seeded();
    await t.mutation(internal.appInstalls.setUpdatePolicy, {
      platform: "android",
      minimum: "2.10.0",
      recommended: "2.12.9",
      message: "New check-in",
    });
    expect(
      await t.mutation(internal.appInstalls.raiseRecommended, { platform: "android", version: "2.12.10" })
    ).toEqual({ raised: true, previous: "2.12.9", recommended: "2.12.10" });
    expect(
      await t.query(api.appInstalls.updateStatus, { platform: "android", version: "2.12.9" })
    ).toEqual({ status: "recommended", latest: "2.12.10", message: "New check-in" });
    expect((await policy(t)).map(({ minimum }) => minimum)).toEqual(["2.10.0"]);
  });

  test.each([["2.12.38"], ["2.12.37"], ["2.9.40"]])("never lowers 2.12.38 to %s", async (version) => {
    const t = await seeded();
    await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", recommended: "2.12.38" });
    expect(await t.mutation(internal.appInstalls.raiseRecommended, { platform: "ios", version })).toEqual({
      raised: false,
      previous: "2.12.38",
      recommended: "2.12.38",
    });
    expect((await policy(t)).map(({ recommended }) => recommended)).toEqual(["2.12.38"]);
  });

  test("leaves the other platform alone", async () => {
    const t = await seeded();
    await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", recommended: "2.12.1" });
    await t.mutation(internal.appInstalls.raiseRecommended, { platform: "android", version: "2.12.38" });
    expect(
      (await policy(t)).map(({ platform, recommended }) => [platform, recommended]).sort()
    ).toEqual([
      ["android", "2.12.38"],
      ["ios", "2.12.1"],
    ]);
  });

  test("refuses something that isn't a version", async () => {
    const t = await seeded();
    await expect(
      t.mutation(internal.appInstalls.raiseRecommended, { platform: "ios", version: "latest" })
    ).rejects.toThrow(/isn't an app version/);
    expect(await policy(t)).toEqual([]);
  });
});
