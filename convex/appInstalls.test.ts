/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { NewerPage } from "../shared/appLinks";
import { api, internal } from "./_generated/api";
import { appOpensFor, emailLinkFor } from "./appInstalls";
import { notify } from "./requests";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ADMIN = "admin@sow.org.au";
const EVA = "eva@sow.org.au";
const EVENT = "/event-requests/abc/risk";

const newerPages = vi.hoisted(() => ({ list: [] as NewerPage[] }));

vi.mock("../shared/appLinks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/appLinks")>();
  return {
    ...actual,
    versionNeededFor: (path: string) => actual.versionNeededFor(path, newerPages.list),
    appCanOpen: (path: string, version: string | null | undefined) =>
      actual.appCanOpen(path, version, newerPages.list),
  };
});

const PAGES_NEWER_THAN_SOME_APPS: NewerPage[] = [
  { prefix: "/design-requests", since: "2.2.0" },
  { prefix: "/event-requests", since: "2.3.0" },
];

afterEach(() => {
  newerPages.list = [];
});

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

  test("with no page newer than a supported app, every link opens in the app", async () => {
    const t = await setup();
    expect(await linkFor(t, EVENT)).toBe(EVENT);
    await asUser(t, EVA).mutation(api.appInstalls.report, { platform: "android", version: "2.9.0" });
    expect(await linkFor(t, EVENT)).toBe(EVENT);
    expect(await t.run((ctx) => appOpensFor(ctx, EVA, EVENT))).toBe(true);
    expect(await t.run((ctx) => appOpensFor(ctx, ADMIN, "/design-requests/x"))).toBe(true);
    await t.run((ctx) =>
      ctx.db.insert("notifications", { userEmail: ADMIN, title: "Event", body: "b", url: EVENT, read: false })
    );
    const feed = await asUser(t, ADMIN).query(api.notifications.list, {});
    expect(feed!.map((n) => n.url)).toEqual([EVENT]);
  });

  test("emailed links to newer pages open the app only when every phone of theirs can", async () => {
    newerPages.list = PAGES_NEWER_THAN_SOME_APPS;
    const t = await setup();
    expect(await linkFor(t, "/design-requests/x")).toBe("/design-requests/x");
    expect(await linkFor(t, EVENT)).toBe(EVENT);
    await asUser(t, EVA).mutation(api.appInstalls.report, { platform: "ios", version: "2.3.1" });
    expect(await linkFor(t, EVENT)).toBe(`${EVENT}#app`);
    await asUser(t, EVA).mutation(api.appInstalls.report, { platform: "android", version: "2.2.0" });
    expect(await linkFor(t, EVENT)).toBe(EVENT);
  });

  test("notification emails carry the tailored link", async () => {
    newerPages.list = PAGES_NEWER_THAN_SOME_APPS;
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
    newerPages.list = PAGES_NEWER_THAN_SOME_APPS;
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", { userEmail: ADMIN, title: "Event", body: "b", url: EVENT, read: false });
      await ctx.db.insert("notifications", { userEmail: ADMIN, title: "Design", body: "b", url: "/design-requests/x", read: false });
    });
    const urls = async (args: { appVersion?: string }) =>
      (await asUser(t, ADMIN).query(api.notifications.list, args))!.map((n) => [n.title, n.url]);
    expect(await urls({})).toEqual([
      ["Design", null],
      ["Event", null],
    ]);
    expect(await urls({ appVersion: "2.1.9" })).toEqual([
      ["Design", null],
      ["Event", null],
    ]);
    expect(await urls({ appVersion: "2.3.1" })).toEqual([
      ["Design", "/design-requests/x"],
      ["Event", EVENT],
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
