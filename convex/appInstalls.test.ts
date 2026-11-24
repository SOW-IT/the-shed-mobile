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

describe("over-the-air versions", () => {
  const policy = (t: Awaited<ReturnType<typeof seeded>>) =>
    t.run((ctx) => ctx.db.query("appUpdatePolicy").collect());

  const afterOta = async () => {
    const t = await seeded();
    await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", recommended: "2.12.18", minimum: "2.10.0" });
    await t.mutation(internal.appInstalls.raiseLatestOta, { platform: "ios", version: "2.12.40" });
    return t;
  };

  test("an app that doesn't say it takes over-the-air updates is only measured against the store versions", async () => {
    const t = await afterOta();
    expect(await t.query(api.appInstalls.updateStatus, { platform: "ios", version: "2.12.36" })).toEqual({
      status: "ok",
      latest: "2.12.18",
      message: null,
    });
    expect(await t.query(api.appInstalls.updateStatus, { platform: "ios", version: "2.12.10" })).toEqual({
      status: "recommended",
      latest: "2.12.18",
      message: null,
    });
    expect(await t.query(api.appInstalls.updateStatus, { platform: "ios", version: "2.9.0" })).toEqual({
      status: "required",
      latest: "2.12.18",
      message: null,
    });
  });

  test("an app that takes over-the-air updates hears about the newest one and the store version apart", async () => {
    const t = await afterOta();
    const status = (version: string) =>
      t.query(api.appInstalls.updateStatus, { platform: "ios", version, ota: true });
    expect(await status("2.12.36")).toEqual({
      status: "recommended",
      latest: "2.12.40",
      message: null,
      storeVersion: "2.12.18",
    });
    expect(await status("2.12.40")).toEqual({ status: "ok", latest: "2.12.40", message: null, storeVersion: "2.12.18" });
    expect(await status("2.9.0")).toMatchObject({ status: "required", latest: "2.12.40", storeVersion: "2.12.18" });
    await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", recommended: "2.13.0" });
    expect(await status("2.12.40")).toMatchObject({ status: "recommended", latest: "2.13.0", storeVersion: "2.13.0" });
  });

  test("with no policy every app is up to date", async () => {
    const t = await seeded();
    expect(await t.query(api.appInstalls.updateStatus, { platform: "android", version: "2.12.36" })).toEqual({
      status: "ok",
      latest: null,
      message: null,
    });
    expect(
      await t.query(api.appInstalls.updateStatus, { platform: "android", version: "2.12.36", ota: true })
    ).toEqual({ status: "ok", latest: null, message: null, storeVersion: null });
  });

  test("raising it leaves the recommended version, minimum and message alone", async () => {
    const t = await seeded();
    await t.mutation(internal.appInstalls.setUpdatePolicy, {
      platform: "android",
      minimum: "2.10.0",
      recommended: "2.12.9",
      message: "New check-in",
    });
    expect(
      await t.mutation(internal.appInstalls.raiseLatestOta, { platform: "android", version: "2.12.10" })
    ).toEqual({ raised: true, previous: null, latestOta: "2.12.10" });
    expect(
      await t.mutation(internal.appInstalls.raiseLatestOta, { platform: "android", version: "2.12.11" })
    ).toEqual({ raised: true, previous: "2.12.10", latestOta: "2.12.11" });
    expect(
      (await policy(t)).map(({ minimum, recommended, latestOta, message }) => [minimum, recommended, latestOta, message])
    ).toEqual([["2.10.0", "2.12.9", "2.12.11", "New check-in"]]);
  });

  test("sets it when there is no policy yet", async () => {
    const t = await seeded();
    expect(
      await t.mutation(internal.appInstalls.raiseLatestOta, { platform: "ios", version: "2.12.38" })
    ).toEqual({ raised: true, previous: null, latestOta: "2.12.38" });
    expect((await policy(t)).map(({ platform, recommended, latestOta }) => [platform, recommended, latestOta])).toEqual([
      ["ios", undefined, "2.12.38"],
    ]);
  });

  test.each([["2.12.38"], ["2.12.37"], ["2.9.40"]])("never lowers 2.12.38 to %s", async (version) => {
    const t = await seeded();
    await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", latestOta: "2.12.38" });
    expect(await t.mutation(internal.appInstalls.raiseLatestOta, { platform: "ios", version })).toEqual({
      raised: false,
      previous: "2.12.38",
      latestOta: "2.12.38",
    });
    expect((await policy(t)).map(({ latestOta }) => latestOta)).toEqual(["2.12.38"]);
  });

  test("leaves the other platform alone", async () => {
    const t = await seeded();
    await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", latestOta: "2.12.1" });
    await t.mutation(internal.appInstalls.raiseLatestOta, { platform: "android", version: "2.12.38" });
    expect(
      (await policy(t)).map(({ platform, latestOta }) => [platform, latestOta]).sort()
    ).toEqual([
      ["android", "2.12.38"],
      ["ios", "2.12.1"],
    ]);
  });

  test("setting the policy by hand keeps it, and can clear it", async () => {
    const t = await afterOta();
    expect(await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", recommended: "2.12.20" })).toEqual({
      minimum: "2.10.0",
      recommended: "2.12.20",
      latestOta: "2.12.40",
      message: null,
    });
    await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", latestOta: null });
    expect((await policy(t)).map(({ latestOta }) => latestOta)).toEqual([undefined]);
  });

  test("refuses something that isn't a version", async () => {
    const t = await seeded();
    await expect(
      t.mutation(internal.appInstalls.raiseLatestOta, { platform: "ios", version: "latest" })
    ).rejects.toThrow(/isn't an app version/);
    await expect(
      t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", latestOta: "soon" })
    ).rejects.toThrow(/isn't an app version/);
    expect(await policy(t)).toEqual([]);
  });
});
