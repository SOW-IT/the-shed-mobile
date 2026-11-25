import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { currentStaffYear } from "./model";
import { lookFor, OFFLINE_ALL_MAX, OFFLINE_FIRST, withHeight } from "../shared/world";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
const MINUTE = 60_000;

const staff = (t: T, people: { email: string; name?: string; year?: number }[]) =>
  t.run(async (ctx) => {
    const ids: Id<"staffProfiles">[] = [];
    for (const p of people) ids.push(await ctx.db.insert("staffProfiles", { email: p.email, name: p.name, year: p.year ?? currentStaffYear() }));
    return ids;
  });

/** Marks someone online in the app `minutesAgo` minutes before now. */
const seen = (t: T, email: string, minutesAgo: number) =>
  t.run((ctx) => ctx.db.insert("lastSeen", { email, at: Date.now() - minutesAgo * MINUTE }));

describe("the offline list", () => {
  test("most recently online first, then people never seen by name; not you, not anyone here, not anyone blocked", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await staff(t, [
      { email: ANNA, name: "Anna" },
      { email: BEN, name: "Ben" },
      { email: CARA, name: "Cara" },
      { email: "dee@sow.org.au", name: "Dee" },
      { email: "eve@sow.org.au", name: "Eve" },
      { email: "zed@sow.org.au", name: "Zed" },
      { email: "amy@sow.org.au", name: "Amy" },
      { email: "blocked@sow.org.au", name: "Blocked" },
      { email: "old@sow.org.au", name: "Old", year: currentStaffYear() - 1 },
    ]);
    await seen(t, "dee@sow.org.au", 300);
    await seen(t, BEN, 5);
    await seen(t, "eve@sow.org.au", 60);
    await seen(t, ANNA, 0);
    await seen(t, CARA, 1);
    await seen(t, "old@sow.org.au", 2);
    await seen(t, "blocked@sow.org.au", 3);
    await seen(t, "visitor@gmail.com", 4);
    await anna.mutation(api.world.join, {});
    await asUser(t, CARA).mutation(api.world.join, {});
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: "blocked@sow.org.au", blockedName: "Blocked" }));

    const list = await anna.query(api.world.offlineRecent, { limit: OFFLINE_FIRST });
    expect(list.people.map((p) => p.name)).toEqual(["Ben", "Eve", "Dee", "Amy", "Zed"]);
    expect(list.more).toBe(false);
    expect(list.people[0].lastOnlineAt).toEqual(expect.closeTo(PINNED_NOW - 5 * MINUTE, -2));
    expect(list.people.find((p) => p.name === "Amy")!.lastOnlineAt).toBeNull();
    await expect(t.query(api.world.offlineRecent, { limit: 10 })).rejects.toThrow(/signed in/);
  });

  test("starts at 10 and says there are more; Show all brings the rest, up to the cap", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const people = Array.from({ length: 25 }, (_, i) => ({ email: `s${String(i).padStart(2, "0")}@sow.org.au`, name: `S${String(i).padStart(2, "0")}` }));
    await staff(t, people);
    // The first 15 have been online, s00 most recently; the last 10 never.
    for (let i = 0; i < 15; i++) await seen(t, people[i].email, i + 1);

    const first = await anna.query(api.world.offlineRecent, { limit: OFFLINE_FIRST });
    expect(first.people).toHaveLength(OFFLINE_FIRST);
    expect(first.people.map((p) => p.name)).toEqual(people.slice(0, 10).map((p) => p.name));
    expect(first.more).toBe(true);

    const all = await anna.query(api.world.offlineRecent, { limit: OFFLINE_ALL_MAX });
    expect(all.people.map((p) => p.name)).toEqual(people.map((p) => p.name));
    expect(all.more).toBe(false);

    // Exactly the limit, and nobody left: no "Show all".
    expect((await anna.query(api.world.offlineRecent, { limit: 25 })).more).toBe(false);
    expect((await anna.query(api.world.offlineRecent, { limit: 24 })).more).toBe(true);
    // The limit is kept between 1 and the cap.
    expect((await anna.query(api.world.offlineRecent, { limit: 0 })).people).toHaveLength(1);
    expect((await anna.query(api.world.offlineRecent, { limit: 5000 })).people).toHaveLength(25);
  });

  test("each person comes with their look: the saved one, or the one picked from their email", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await staff(t, [{ email: BEN, name: "Ben" }, { email: CARA, name: "Cara" }]);
    const saved = { ...lookFor("someone-else"), height: 1 };
    await t.run((ctx) => ctx.db.insert("worldLooks", { email: BEN, look: saved, updatedAt: Date.now() }));
    const list = await anna.query(api.world.offlineRecent, { limit: OFFLINE_FIRST });
    expect(list.people.find((p) => p.name === "Ben")!.look).toEqual(saved);
    expect(list.people.find((p) => p.name === "Cara")!.look).toEqual(withHeight(lookFor(CARA), CARA));
  });
});

describe("a home's door", () => {
  const backTo = async (t: T, email: string) => {
    const who = asUser(t, email);
    const member = await t.run((ctx) =>
      ctx.db
        .query("worldMembers")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first()
    );
    return (await who.query(api.worldHome.home, { roomId: member!.roomId }))?.backTo;
  };

  test("leads back to the place you came from, even after leaving the World and coming back", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    later(5000);
    await anna.mutation(api.world.travel, { to: "cafe" });
    later(5000);
    expect(await anna.mutation(api.world.travel, { to: "home" })).toMatchObject({ ok: true, place: "home" });
    expect(await backTo(t, ANNA)).toBe("cafe");

    // Leave from home and come back later: you're home again, and the door still leads to the Café.
    later(5000);
    await anna.mutation(api.world.leave, {});
    later(60 * MINUTE);
    expect(await anna.mutation(api.world.join, {})).toMatchObject({ place: "home" });
    expect(await backTo(t, ANNA)).toBe("cafe");

    later(5000);
    expect(await anna.mutation(api.world.travel, { to: "cafe" })).toMatchObject({ ok: true, place: "cafe" });
    // Going home from the Chapel next time leads back to the Chapel.
    later(5000);
    await anna.mutation(api.world.travel, { to: "chapel" });
    later(5000);
    await anna.mutation(api.world.travel, { to: "home" });
    expect(await backTo(t, ANNA)).toBe("chapel");
  });

  test("leads to the Garden when there's no place to go back to", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    later(5000);
    await anna.mutation(api.world.travel, { to: "home" });
    expect(await backTo(t, ANNA)).toBe("garden");
    // A place that's no longer a place reads as the Garden too.
    await t.run(async (ctx) => {
      const visitor = await ctx.db
        .query("worldVisitors")
        .withIndex("by_email", (q) => q.eq("email", ANNA))
        .unique();
      await ctx.db.patch("worldVisitors", visitor!._id, { homeFrom: "moon" });
    });
    expect(await backTo(t, ANNA)).toBe("garden");
  });
});
