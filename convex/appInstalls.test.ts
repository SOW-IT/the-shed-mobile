/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { notify } from "./requests";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ADMIN = "admin@sow.org.au";
const EVA = "eva@sow.org.au";
const EVENT = "/event-requests/abc/risk";

type T = TestConvex<typeof schema>;
const asUser = (t: T, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  return t;
}

describe("app versions", () => {
  test("the app reports its version per kind of phone", async () => {
    const t = await setup();
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
    const t = await setup();
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
    const t = await setup();
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
