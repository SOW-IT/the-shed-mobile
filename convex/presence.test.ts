/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { SEEN_WRITE_INTERVAL_MS } from "./presence";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ADMIN = "admin@sow.org.au";
const HANA = "hana.doe@sow.org.au";
const NOW = new Date("2026-10-09T10:00:00+11:00").getTime();
const MIN = 60_000;
const YEAR = staffYearForDate(new Date(NOW));

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const seen = () => t.run((ctx) => ctx.db.query("lastSeen").collect());
  return { t, seen, admin: asUser(t, ADMIN) };
}

describe("markSeen", () => {
  test("records when someone has The SHED open, at most every few minutes", async () => {
    const { t, seen } = await setup();
    await t.mutation(api.presence.markSeen, {});
    expect(await seen()).toEqual([]);

    const hana = asUser(t, HANA);
    await hana.mutation(api.presence.markSeen, {});
    vi.setSystemTime(NOW + SEEN_WRITE_INTERVAL_MS - 1);
    await hana.mutation(api.presence.markSeen, {});
    expect(await seen()).toEqual([expect.objectContaining({ email: HANA, at: NOW })]);

    vi.setSystemTime(NOW + SEEN_WRITE_INTERVAL_MS);
    await hana.mutation(api.presence.markSeen, {});
    expect(await seen()).toEqual([
      expect.objectContaining({ email: HANA, at: NOW + SEEN_WRITE_INTERVAL_MS }),
    ]);
  });
});

describe("Last online on a profile", () => {
  test("is the latest of the app's reports and sign-in activity, either email spelling", async () => {
    // Signed in as the old @sowaustralia.com address, months ago. (Documents
    // are stamped in order, so the clock only moves forward from here.)
    vi.setSystemTime(NOW - 90 * 24 * 60 * MIN);
    const { t, admin } = await setup();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "hana.doe@sowaustralia.com" })
    );
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("authSessions", { userId, expirationTime: NOW })
    );
    const at = async (ms: number, write: () => Promise<unknown>) => {
      vi.setSystemTime(ms);
      await write();
      vi.setSystemTime(NOW);
    };
    const profile = () => admin.query(api.profile.get, { email: HANA });
    // Documents made in the same millisecond are stamped a fraction apart.
    const atMs = (ms: number) => expect.closeTo(ms, 0);
    vi.setSystemTime(NOW);

    expect((await profile())?.lastOnlineAt).toEqual(atMs(NOW - 90 * 24 * 60 * MIN));

    // The session refreshed while the app was open.
    await at(NOW - 3 * 60 * MIN, () =>
      t.run((ctx) =>
        ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: NOW + 60 * MIN })
      )
    );
    expect((await profile())?.lastOnlineAt).toEqual(atMs(NOW - 3 * 60 * MIN));

    // The phone app checked in more recently.
    await at(NOW - 60 * MIN, () =>
      t.run((ctx) =>
        ctx.db.insert("appInstalls", {
          email: HANA,
          platform: "ios",
          version: "2.4.4",
          seenAt: NOW - 60 * MIN,
        })
      )
    );
    expect((await profile())?.lastOnlineAt).toBe(NOW - 60 * MIN);

    // And the app has said it's open since.
    await at(NOW - 2 * MIN, () =>
      asUser(t, "hana.doe@sowaustralia.com").mutation(api.presence.markSeen, {})
    );
    expect(await profile()).toMatchObject({
      lastOnlineAt: NOW - 2 * MIN,
      hasSignedIn: true,
    });
  });

  test("someone who hasn't signed in has no Last online; signed-out viewers see neither", async () => {
    const { t, admin } = await setup();
    expect(await admin.query(api.profile.get, { email: HANA })).toMatchObject({
      lastOnlineAt: null,
      hasSignedIn: false,
    });
    await t.run((ctx) => ctx.db.insert("users", { email: HANA }));
    expect(await t.query(api.profile.get, { email: HANA })).toMatchObject({
      lastOnlineAt: null,
      hasSignedIn: null,
    });
  });
});

describe("Admin → Users", () => {
  test("marks staff who have never signed in", async () => {
    const { t, admin } = await setup();
    await t.run(async (ctx) => {
      for (const email of [HANA, "mia.doe@sow.org.au"]) {
        await ctx.db.insert("staffProfiles", {
          email,
          year: YEAR,
          assignments: [{ role: "Staff", department: "Data and IT" }],
        });
      }
      await ctx.db.insert("users", { email: "hana.doe@sowaustralia.com" });
      await ctx.db.insert("users", { email: ADMIN });
      await ctx.db.insert("users", {});
    });
    const profiles = await admin.query(api.admin.listStaffProfiles, { year: YEAR });
    const signedIn = Object.fromEntries((profiles ?? []).map((p) => [p.email, p.signedIn]));
    expect(signedIn).toMatchObject({
      [ADMIN]: true,
      [HANA]: true,
      "mia.doe@sow.org.au": false,
    });
  });
});
