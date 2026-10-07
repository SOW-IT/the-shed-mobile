/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { emailLinkFor } from "./appInstalls";
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

const linkFor = (t: T, path: string, email = EVA) =>
  t.run((ctx) => emailLinkFor(ctx, email, path));

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

  test("emailed links to newer pages open the app only when every phone of theirs can", async () => {
    const t = await setup();
    expect(await linkFor(t, "/design-requests/x")).toBe("/design-requests/x");
    expect(await linkFor(t, EVENT)).toBe(EVENT);
    await asUser(t, EVA).mutation(api.appInstalls.report, { platform: "ios", version: "2.3.1" });
    expect(await linkFor(t, EVENT)).toBe(`${EVENT}#app`);
    await asUser(t, EVA).mutation(api.appInstalls.report, { platform: "android", version: "2.2.0" });
    expect(await linkFor(t, EVENT)).toBe(EVENT);
  });

  test("notification emails carry the tailored link", async () => {
    const t = await setup();
    await asUser(t, EVA).mutation(api.appInstalls.report, { platform: "android", version: "2.3.1" });
    await t.run((ctx) => notify(ctx, { to: EVA, subject: "Hi", body: "Body", url: EVENT }));
    await t.run((ctx) => notify(ctx, { to: EVA, subject: "No link", body: "Body" }));
    const bodies = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .map((f) => f.args[0] as { body?: string; subject?: string })
        .filter((a) => a.subject)
        .map((a) => a.body)
    );
    expect(bodies[0]).toMatch(/event-requests\/abc\/risk#app$/);
    expect(bodies[1]).toMatch(/Open in THE SHED: \S+$/);
  });

  test("an old app's bell gets no link to a page it can't open", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", { userEmail: ADMIN, title: "Event", body: "b", url: EVENT, read: false });
      await ctx.db.insert("notifications", { userEmail: ADMIN, title: "Design", body: "b", url: "/design-requests/x", read: false });
    });
    const urls = async (args: { appVersion?: string }) =>
      (await asUser(t, ADMIN).query(api.notifications.list, args))!.map((n) => [n.title, n.url]);
    expect(await urls({})).toEqual([
      ["Design", "/design-requests/x"],
      ["Event", null],
    ]);
    expect(await urls({ appVersion: "2.3.1" })).toEqual([
      ["Design", "/design-requests/x"],
      ["Event", EVENT],
    ]);
  });
});
