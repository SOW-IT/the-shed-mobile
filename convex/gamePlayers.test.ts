import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, newConvex, type T } from "../test/convexFixture";
import { PLAYING_BEAT_MS, PLAYING_READ_LIMIT, PLAYING_SCAN, PLAYING_SHOWN, PLAYING_TTL_MS } from "../shared/games";
import { withHeight } from "../shared/world";
import { BLOCKED_BY_SCAN } from "./world";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";
const look = { skin: 3, hair: 6, hairColour: 2, shirt: 4, hat: 1 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_800_000_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

const tables = (t: T) =>
  t.run(async (ctx) => ({
    players: await ctx.db.query("gamePlayers").collect(),
    beats: await ctx.db.query("gamePlayerBeats").collect(),
  }));

const named = async (t: T, email: string, name: string) => {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { email, name });
  });
};

describe("playing and left", () => {
  test("going into a game marks you on it with your name, once", async () => {
    const t = newConvex();
    await named(t, ANNA, "Anna Bell");
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    const { players, beats } = await tables(t);
    expect(players).toMatchObject([{ email: ANNA, game: "runner", name: "Anna Bell" }]);
    expect(beats).toHaveLength(1);
  });

  test("signed out, playing is refused", async () => {
    const t = newConvex();
    await expect(t.mutation(api.gamePlayers.playing, { game: "runner" })).rejects.toThrow();
  });

  test("a beat writes only the heartbeat, and not more than once a beat", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gamePlayers.playing, { game: "flappy" });
    const first = (await tables(t)).beats[0].lastSeen;
    later(1000);
    await anna.mutation(api.gamePlayers.playing, { game: "flappy" });
    expect((await tables(t)).beats[0].lastSeen).toBe(first);
    later(PLAYING_BEAT_MS);
    await anna.mutation(api.gamePlayers.playing, { game: "flappy" });
    const { players, beats } = await tables(t);
    expect(beats[0].lastSeen).toBe(Date.now());
    expect(players[0].since).toBe(first);
  });

  test("going into another game moves you to it", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    later(5000);
    await anna.mutation(api.gamePlayers.playing, { game: "glider" });
    expect((await tables(t)).players).toMatchObject([{ game: "glider", since: Date.now() }]);
  });

  test("playing Hop shows on its row like any game", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.gamePlayers.playing, { game: "hop" });
    expect((await tables(t)).players).toMatchObject([{ game: "hop" }]);
    expect(await asUser(t, BEN).query(api.gamePlayers.nowPlaying, {})).toMatchObject([{ game: "hop", count: 1 }]);
  });

  test("switching game picks up a name changed since you went in", async () => {
    const t = newConvex();
    await named(t, ANNA, "Anna Bell");
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").first();
      await ctx.db.patch("users", user!._id, { name: "Anna Bell-Cho" });
    });
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    expect((await tables(t)).players).toMatchObject([{ name: "Anna Bell" }]);
    await anna.mutation(api.gamePlayers.playing, { game: "flappy" });
    expect((await tables(t)).players).toMatchObject([{ game: "flappy", name: "Anna Bell-Cho" }]);
  });

  test("leaving takes you off at once; leaving a game you've switched from does nothing", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    await anna.mutation(api.gamePlayers.playing, { game: "shooter" });
    await anna.mutation(api.gamePlayers.left, { game: "runner" });
    expect((await tables(t)).players).toHaveLength(1);
    await anna.mutation(api.gamePlayers.left, { game: "shooter" });
    expect(await tables(t)).toEqual({ players: [], beats: [] });
  });

  test("leaving signed out, or when not in a game, does nothing", async () => {
    const t = newConvex();
    await t.mutation(api.gamePlayers.left, { game: "runner" });
    await asUser(t, ANNA).mutation(api.gamePlayers.left, { game: "runner" });
    expect(await tables(t)).toEqual({ players: [], beats: [] });
  });

  test("a heartbeat lost on its own starts again on the next beat", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    await t.run(async (ctx) => {
      for (const beat of await ctx.db.query("gamePlayerBeats").collect()) await ctx.db.delete("gamePlayerBeats", beat._id);
    });
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    expect((await tables(t)).beats).toHaveLength(1);
  });
});

describe("expire", () => {
  test("clears a player not heard from for the time limit", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.gamePlayers.playing, { game: "runner" });
    const beatId = (await tables(t)).beats[0]._id;
    later(PLAYING_TTL_MS);
    await t.mutation(internal.gamePlayers.expire, { beatId });
    expect(await tables(t)).toEqual({ players: [], beats: [] });
  });

  test("keeps a player still beating, and checks again when they'd run out", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    const beatId = (await tables(t)).beats[0]._id;
    later(PLAYING_BEAT_MS);
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    later(PLAYING_TTL_MS - PLAYING_BEAT_MS);
    await t.mutation(internal.gamePlayers.expire, { beatId });
    expect((await tables(t)).players).toHaveLength(1);
    const next = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(next.filter((job) => job.state.kind === "pending").map((job) => job.scheduledTime)).toContain(Date.now() + PLAYING_BEAT_MS);
    later(PLAYING_BEAT_MS);
    await t.mutation(internal.gamePlayers.expire, { beatId });
    expect(await tables(t)).toEqual({ players: [], beats: [] });
  });

  test("ends quietly once the player has left", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    const beatId = (await tables(t)).beats[0]._id;
    await anna.mutation(api.gamePlayers.left, { game: "runner" });
    later(PLAYING_TTL_MS);
    await anna.mutation(api.gamePlayers.playing, { game: "runner" });
    await t.mutation(internal.gamePlayers.expire, { beatId });
    expect((await tables(t)).players).toHaveLength(1);
  });
});

describe("nowPlaying", () => {
  test("is empty signed out", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.gamePlayers.playing, { game: "runner" });
    expect(await t.query(api.gamePlayers.nowPlaying, {})).toEqual([]);
  });

  test("lists who else is in each game with their World look, newest first, and leaves you out", async () => {
    const t = newConvex();
    await named(t, ANNA, "Anna Bell");
    await named(t, BEN, "Ben Cho");
    await asUser(t, ANNA).mutation(api.world.saveLook, { look });
    await asUser(t, ANNA).mutation(api.gamePlayers.playing, { game: "runner" });
    later(1000);
    await asUser(t, BEN).mutation(api.gamePlayers.playing, { game: "runner" });
    await asUser(t, CARA).mutation(api.gamePlayers.playing, { game: "glider" });
    const seen = await asUser(t, CARA).query(api.gamePlayers.nowPlaying, {});
    expect(seen).toMatchObject([
      {
        game: "runner",
        count: 2,
        more: false,
        players: [
          { name: "Ben Cho", look: null },
          { name: "Anna Bell", look: withHeight(look, ANNA) },
        ],
      },
    ]);
  });

  test("shows the first few faces and counts everyone", async () => {
    const t = newConvex();
    for (let i = 0; i < PLAYING_SHOWN + 2; i++) {
      await asUser(t, `p${i}@sow.org.au`).mutation(api.gamePlayers.playing, { game: "shooter" });
      later(10);
    }
    const [shooter] = await asUser(t, ANNA).query(api.gamePlayers.nowPlaying, {});
    expect(shooter.count).toBe(PLAYING_SHOWN + 2);
    expect(shooter.players).toHaveLength(PLAYING_SHOWN);
  });

  test("says when there are more than it read", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      for (let i = 0; i <= PLAYING_SCAN; i++) {
        await ctx.db.insert("gamePlayers", { email: `p${i}@sow.org.au`, game: "flappy", name: `P${i}`, since: i });
      }
    });
    const [flappy] = await asUser(t, ANNA).query(api.gamePlayers.nowPlaying, {});
    expect(flappy).toMatchObject({ count: PLAYING_SCAN, more: true });
  });

  test("exactly the limit is counted in full, with no \"+\"", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      for (let i = 0; i < PLAYING_SCAN; i++) {
        await ctx.db.insert("gamePlayers", { email: `p${i}@sow.org.au`, game: "flappy", name: `P${i}`, since: i });
      }
    });
    const [flappy] = await asUser(t, ANNA).query(api.gamePlayers.nowPlaying, {});
    expect(flappy).toMatchObject({ count: PLAYING_SCAN, more: false });
  });

  test("reads past a run of people you've blocked to find someone older who's playing", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("gamePlayers", { email: BEN, game: "glider", name: "Ben Cho", since: 1 });
      for (let i = 0; i < PLAYING_SCAN + 5; i++) {
        const blocked = `b${i}@sow.org.au`;
        await ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: blocked, blockedName: `B${i}` });
        await ctx.db.insert("gamePlayers", { email: blocked, game: "glider", name: `B${i}`, since: 100 + i });
      }
    });
    const seen = await asUser(t, ANNA).query(api.gamePlayers.nowPlaying, {});
    expect(seen).toMatchObject([{ game: "glider", count: 1, more: false, players: [{ name: "Ben Cho" }] }]);
  });

  test("stops at the read limit: past 500 rows nobody can see, an older player stays unread", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("gamePlayers", { email: BEN, game: "glider", name: "Ben Cho", since: 1 });
      for (let i = 0; i < PLAYING_READ_LIMIT; i++) {
        await ctx.db.insert("gamePlayers", { email: `x${i}@sow.org.au`, game: "glider", name: `X${i}`, since: 100 + i });
        await ctx.db.insert("worldBlocks", { email: `x${i}@sow.org.au`, blockedEmail: ANNA, blockedName: "Anna" });
      }
    });
    const [glider] = await asUser(t, ANNA).query(api.gamePlayers.nowPlaying, {});
    expect(glider).toBeUndefined();
    expect(await asUser(t, CARA).query(api.gamePlayers.nowPlaying, {})).toMatchObject([{ game: "glider", count: PLAYING_SCAN, more: true }]);
  });

  test("still hides someone who blocked you when more people block you than the World reads at once", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      // More than the scan reads, with Ben's block last, past it.
      for (let i = 0; i <= BLOCKED_BY_SCAN; i++) await ctx.db.insert("worldBlocks", { email: `s${i}@sow.org.au`, blockedEmail: ANNA, blockedName: "Anna" });
      await ctx.db.insert("worldBlocks", { email: BEN, blockedEmail: ANNA, blockedName: "Anna" });
    });
    await asUser(t, BEN).mutation(api.gamePlayers.playing, { game: "runner" });
    await asUser(t, CARA).mutation(api.gamePlayers.playing, { game: "runner" });
    const seen = await asUser(t, ANNA).query(api.gamePlayers.nowPlaying, {});
    expect(seen).toMatchObject([{ game: "runner", count: 1 }]);
  });

  test("hides people blocked in the World, either way", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: BEN, blockedName: "Ben" });
      await ctx.db.insert("worldBlocks", { email: CARA, blockedEmail: ANNA, blockedName: "Anna" });
    });
    await asUser(t, BEN).mutation(api.gamePlayers.playing, { game: "runner" });
    await asUser(t, CARA).mutation(api.gamePlayers.playing, { game: "runner" });
    expect(await asUser(t, ANNA).query(api.gamePlayers.nowPlaying, {})).toEqual([]);
    expect(await asUser(t, "dan@sow.org.au").query(api.gamePlayers.nowPlaying, {})).toMatchObject([{ game: "runner", count: 2 }]);
  });
});
