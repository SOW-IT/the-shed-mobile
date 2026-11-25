import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { currentStaffYear } from "./model";
import { SEEN_WRITE_INTERVAL_MS } from "./presence";
import { APP_PING_MS, APP_WRITE_GAP_MS, IN_APP_MS } from "../shared/appPresence";
import { lookFor, OFFLINE_ALL_MAX, OFFLINE_FIRST, withHeight } from "../shared/world";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";
const DEE = "dee@sow.org.au";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

const staff = (t: T, people: { email: string; name: string; year?: number }[]) =>
  t.run(async (ctx) => {
    for (const p of people) await ctx.db.insert("staffProfiles", { email: p.email, name: p.name, year: p.year ?? currentStaffYear() });
  });

const rows = (t: T) =>
  t.run(async (ctx) => ({
    app: await ctx.db.query("appPresence").collect(),
    seen: await ctx.db.query("lastSeen").collect(),
  }));

const inAppNames = async (t: T, email: string, limit = OFFLINE_FIRST) =>
  (await asUser(t, email).query(api.world.inApp, { limit, tick: 0 })).people.map((p) => p.name);

const offlineNames = async (t: T, email: string) =>
  (await asUser(t, email).query(api.world.offlineRecent, { limit: OFFLINE_ALL_MAX, skipInApp: true, tick: 0 })).people.map((p) => p.name);

describe("the app heartbeat", () => {
  test("writes when someone opens the app, then at most once a gap, and their last seen every few minutes", async () => {
    const t = newConvex();
    await t.mutation(api.presence.appHeartbeat, {});
    expect(await rows(t)).toEqual({ app: [], seen: [] });

    const ben = asUser(t, BEN);
    await ben.mutation(api.presence.appHeartbeat, {});
    const first = await rows(t);
    expect(first.app).toEqual([expect.objectContaining({ email: BEN, appSeenAt: expect.closeTo(PINNED_NOW, -1) })]);
    expect(first.seen).toEqual([expect.objectContaining({ email: BEN, at: first.app[0].appSeenAt })]);
    const start = first.app[0].appSeenAt;

    vi.setSystemTime(start + APP_WRITE_GAP_MS - 1);
    await ben.mutation(api.presence.appHeartbeat, {});
    expect((await rows(t)).app[0].appSeenAt).toBe(start);

    vi.setSystemTime(start + APP_WRITE_GAP_MS);
    await ben.mutation(api.presence.appHeartbeat, {});
    expect((await rows(t)).app).toEqual([expect.objectContaining({ appSeenAt: start + APP_WRITE_GAP_MS })]);
    expect((await rows(t)).seen[0].at).toBe(start);

    vi.setSystemTime(start + SEEN_WRITE_INTERVAL_MS);
    await ben.mutation(api.presence.appHeartbeat, {});
    expect((await rows(t)).seen).toEqual([expect.objectContaining({ at: start + SEEN_WRITE_INTERVAL_MS })]);
  });

  test("leaving the app clears it and marks them seen just now; nothing to clear writes nothing", async () => {
    const t = newConvex();
    const ben = asUser(t, BEN);
    await t.mutation(api.presence.appAway, {});
    await ben.mutation(api.presence.appAway, {});
    expect(await rows(t)).toEqual({ app: [], seen: [] });

    await ben.mutation(api.presence.appHeartbeat, {});
    vi.setSystemTime(PINNED_NOW + APP_PING_MS);
    await ben.mutation(api.presence.appAway, {});
    const after = await rows(t);
    expect(after.app).toEqual([]);
    expect(after.seen).toEqual([expect.objectContaining({ email: BEN, at: expect.closeTo(PINNED_NOW + APP_PING_MS, -1) })]);
  });
});

describe("In the app", () => {
  test("lists people with the app open in the last few minutes, by name, with their looks", async () => {
    const t = newConvex();
    await staff(t, [
      { email: ANNA, name: "Anna" },
      { email: BEN, name: "Ben" },
      { email: CARA, name: "Cara" },
    ]);
    const saved = { ...lookFor("someone-else"), height: 1 };
    await t.run((ctx) => ctx.db.insert("worldLooks", { email: CARA, look: saved, updatedAt: Date.now() }));
    await asUser(t, CARA).mutation(api.presence.appHeartbeat, {});
    await asUser(t, BEN).mutation(api.presence.appHeartbeat, {});
    await asUser(t, ANNA).mutation(api.presence.appHeartbeat, {});

    const list = await asUser(t, ANNA).query(api.world.inApp, { limit: OFFLINE_FIRST, tick: 0 });
    expect(list.people.map((p) => p.name)).toEqual(["Ben", "Cara"]);
    expect(list.people[0].look).toEqual(withHeight(lookFor(BEN), BEN));
    expect(list.people[1].look).toEqual(saved);
    expect(list.more).toBe(false);
    await expect(t.query(api.world.inApp, { limit: 10, tick: 0 })).rejects.toThrow(/signed in/);
  });

  test("drops someone to the offline list, with their last seen, once the window passes without a heartbeat", async () => {
    const t = newConvex();
    await staff(t, [
      { email: ANNA, name: "Anna" },
      { email: BEN, name: "Ben" },
    ]);
    await asUser(t, BEN).mutation(api.presence.appHeartbeat, {});
    later(APP_PING_MS);
    await asUser(t, BEN).mutation(api.presence.appHeartbeat, {});
    expect(await inAppNames(t, ANNA)).toEqual(["Ben"]);
    expect(await offlineNames(t, ANNA)).toEqual([]);

    later(IN_APP_MS - 1);
    expect(await inAppNames(t, ANNA)).toEqual(["Ben"]);
    later(1);
    expect(await inAppNames(t, ANNA)).toEqual([]);
    const offline = await asUser(t, ANNA).query(api.world.offlineRecent, { limit: OFFLINE_FIRST, skipInApp: true, tick: 1 });
    expect(offline.people).toEqual([expect.objectContaining({ name: "Ben", lastOnlineAt: expect.closeTo(PINNED_NOW, -1) })]);
  });

  test("leaving the app moves them to the offline list straight away", async () => {
    const t = newConvex();
    await staff(t, [
      { email: ANNA, name: "Anna" },
      { email: BEN, name: "Ben" },
    ]);
    await asUser(t, BEN).mutation(api.presence.appHeartbeat, {});
    later(30_000);
    await asUser(t, BEN).mutation(api.presence.appAway, {});
    expect(await inAppNames(t, ANNA)).toEqual([]);
    const offline = await asUser(t, ANNA).query(api.world.offlineRecent, { limit: OFFLINE_FIRST, skipInApp: true, tick: 0 });
    expect(offline.people).toEqual([expect.objectContaining({ name: "Ben", lastOnlineAt: expect.closeTo(PINNED_NOW + 30_000, -1) })]);
  });

  test("entering the World moves someone to online, and leaving it brings them back", async () => {
    const t = newConvex();
    await staff(t, [
      { email: ANNA, name: "Anna" },
      { email: BEN, name: "Ben" },
    ]);
    const ben = asUser(t, BEN);
    await ben.mutation(api.presence.appHeartbeat, {});
    expect(await inAppNames(t, ANNA)).toEqual(["Ben"]);

    await ben.mutation(api.world.join, {});
    expect(await inAppNames(t, ANNA)).toEqual([]);
    expect(await offlineNames(t, ANNA)).toEqual([]);

    later(5000);
    await ben.mutation(api.world.leave, {});
    expect(await inAppNames(t, ANNA)).toEqual(["Ben"]);
  });

  test("never lists you, people blocked either way, people without a staff profile this year", async () => {
    const t = newConvex();
    await staff(t, [
      { email: ANNA, name: "Anna" },
      { email: BEN, name: "Ben" },
      { email: CARA, name: "Cara" },
      { email: DEE, name: "Dee" },
      { email: "old@sow.org.au", name: "Old", year: currentStaffYear() - 1 },
    ]);
    for (const email of [ANNA, BEN, CARA, DEE, "old@sow.org.au", "visitor@gmail.com"]) {
      await asUser(t, email).mutation(api.presence.appHeartbeat, {});
    }
    await t.run(async (ctx) => {
      await ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: BEN, blockedName: "Ben" });
      await ctx.db.insert("worldBlocks", { email: CARA, blockedEmail: ANNA, blockedName: "Anna" });
    });
    expect(await inAppNames(t, ANNA)).toEqual(["Dee"]);
    expect(await inAppNames(t, DEE)).toEqual(["Anna", "Ben", "Cara"]);
  });

  test("shows 10 at first and says there are more; Show more brings 10 more, up to the cap", async () => {
    const t = newConvex();
    const people = Array.from({ length: 25 }, (_, i) => ({ email: `s${String(i).padStart(2, "0")}@sow.org.au`, name: `S${String(i).padStart(2, "0")}` }));
    await staff(t, [{ email: ANNA, name: "Anna" }, ...people]);
    for (const p of [...people].reverse()) await asUser(t, p.email).mutation(api.presence.appHeartbeat, {});
    const anna = asUser(t, ANNA);

    const shown = [];
    for (let limit = OFFLINE_FIRST; ; limit += OFFLINE_FIRST) {
      const list = await anna.query(api.world.inApp, { limit, tick: 0 });
      shown.push(list.people.map((p) => p.name));
      if (!list.more) break;
    }
    expect(shown.map((names) => names.length)).toEqual([10, 20, 25]);
    expect(shown[2]).toEqual(people.map((p) => p.name));
    expect(shown[1].slice(0, 10)).toEqual(shown[0]);
    expect((await anna.query(api.world.inApp, { limit: 0, tick: 0 })).people).toHaveLength(1);
    expect((await anna.query(api.world.inApp, { limit: 5000, tick: 0 })).people).toHaveLength(25);
  });

  test("older apps, which don't ask to skip people in the app, still see them on the offline list", async () => {
    const t = newConvex();
    await staff(t, [
      { email: ANNA, name: "Anna" },
      { email: BEN, name: "Ben" },
    ]);
    await asUser(t, BEN).mutation(api.presence.appHeartbeat, {});
    const old = await asUser(t, ANNA).query(api.world.offlineRecent, { limit: OFFLINE_FIRST });
    expect(old.people.map((p) => p.name)).toEqual(["Ben"]);
  });
});
