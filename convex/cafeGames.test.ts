import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { SEATS } from "../shared/world";
import { CAFE_AWAY_GRACE_MS, CAFE_CHALLENGE_MS, CAFE_KEEP_MS, CAFE_QUIET_MS, CAFE_TURN_MS, newBoard } from "../shared/cafeGames";

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
const REFILL = 13_000;
const near = (ms: number) => expect.closeTo(ms, -2);

const rows = (t: T) =>
  t.run(async (ctx) => ({
    challenges: await ctx.db.query("cafeChallenges").collect(),
    games: await ctx.db.query("cafeGames").collect(),
    boards: await ctx.db.query("cafeBoards").collect(),
    records: await ctx.db.query("cafeRecords").collect(),
    quiet: await ctx.db.query("cafeQuiet").collect(),
  }));

const inCafe = async (t: T, email: string) => {
  const who = asUser(t, email);
  await who.mutation(api.world.join, {});
  const moved = await who.mutation(api.world.travel, { to: "cafe" });
  if (!moved.ok) throw new Error("travel refused");
  const member = (await t.run((ctx) => ctx.db.query("worldMembers").withIndex("by_email", (q) => q.eq("email", email)).unique()))!;
  return { who, memberId: member._id, roomId: moved.roomId };
};

const trio = async () => {
  const t = newConvex();
  const anna = await inCafe(t, ANNA);
  const ben = await inCafe(t, BEN);
  const cara = await inCafe(t, CARA);
  later(REFILL);
  return { t, anna, ben, cara };
};

const startGame = async (kind = "fourInARow") => {
  const set = await trio();
  const { t, anna, ben } = set;
  expect(await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind })).toEqual({ ok: true });
  const [sent] = (await rows(t)).challenges;
  expect(await ben.who.mutation(api.cafeGames.respond, { challengeId: sent._id, accept: true })).toEqual({ ok: true });
  const game = (await rows(t)).games[0];
  return { ...set, gameId: game._id };
};

const boardOf = async (t: T, gameId: Id<"cafeGames">) =>
  (await t.run((ctx) => ctx.db.query("cafeBoards").withIndex("by_gameId", (q) => q.eq("gameId", gameId)).unique()))!;

describe("the same-table prompt", () => {
  test("sitting at the same table prompts both people, with no game picked yet", async () => {
    const { t, anna, ben, cara } = await trio();
    await anna.who.mutation(api.world.sit, { seat: "table-a-left" });
    expect((await rows(t)).challenges).toHaveLength(0);
    await ben.who.mutation(api.world.sit, { seat: "table-a-right" });
    const { challenges, quiet } = await rows(t);
    expect(challenges).toMatchObject([{ from: BEN, to: ANNA, table: "table-a", expiresAt: near(Date.now() + CAFE_CHALLENGE_MS) }]);
    expect(challenges[0].kind).toBeUndefined();
    expect(quiet).toHaveLength(1);
    expect((await anna.who.query(api.cafeGames.mine, {}))?.challenges).toMatchObject([{ other: ben.memberId, picked: "nobody", table: "table-a" }]);
    expect((await ben.who.query(api.cafeGames.mine, {}))?.challenges).toMatchObject([{ other: anna.memberId, picked: "nobody" }]);
    expect((await cara.who.query(api.cafeGames.mine, {}))?.challenges).toEqual([]);
  });

  test("other tables, the couch and other places don't prompt", async () => {
    const { t, anna, ben, cara } = await trio();
    await anna.who.mutation(api.world.sit, { seat: "table-a-left" });
    await ben.who.mutation(api.world.sit, { seat: "table-b-right" });
    await cara.who.mutation(api.world.sit, { seat: "couch-0" });
    expect((await rows(t)).challenges).toHaveLength(0);
    const elsewhere = newConvex();
    const dana = asUser(elsewhere, "dana@sow.org.au");
    await dana.mutation(api.world.join, {});
    await dana.mutation(api.world.travel, { to: "chapel" });
    await dana.mutation(api.world.sit, { seat: SEATS.chapel[0].id });
    expect((await rows(elsewhere)).challenges).toHaveLength(0);
  });

  test("standing and sitting again doesn't prompt the same pair for a few minutes", async () => {
    const { t, anna, ben } = await trio();
    await anna.who.mutation(api.world.sit, { seat: "table-a-left" });
    await ben.who.mutation(api.world.sit, { seat: "table-a-right" });
    const [first] = (await rows(t)).challenges;
    await anna.who.mutation(api.cafeGames.respond, { challengeId: first._id, accept: false });
    later(2000);
    await ben.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    await ben.who.mutation(api.world.sit, { seat: "table-a-right" });
    expect((await rows(t)).challenges).toHaveLength(0);
    later(CAFE_QUIET_MS);
    await t.mutation(internal.cafeGames.forget, { pair: `${ANNA} ${BEN}` });
    expect((await rows(t)).quiet).toHaveLength(0);
    await ben.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    await ben.who.mutation(api.world.sit, { seat: "table-a-right" });
    expect((await rows(t)).challenges).toHaveLength(1);
  });

  test("a quiet mark refreshed since isn't forgotten early", async () => {
    const { t } = await trio();
    await t.run((ctx) => ctx.db.insert("cafeQuiet", { pair: "x y", at: Date.now() }));
    await t.mutation(internal.cafeGames.forget, { pair: "x y" });
    await t.mutation(internal.cafeGames.forget, { pair: "nobody" });
    expect((await rows(t)).quiet).toHaveLength(1);
  });

  test("no prompt between blocked people, people already asked, or someone playing", async () => {
    const { t, anna, ben, cara } = await trio();
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: BEN, blockedName: "ben" }));
    await anna.who.mutation(api.world.sit, { seat: "table-a-left" });
    await ben.who.mutation(api.world.sit, { seat: "table-a-right" });
    expect((await rows(t)).challenges).toHaveLength(0);
    await cara.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "ticTacToe" });
    await ben.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    await cara.who.mutation(api.world.sit, { seat: "table-b-left" });
    await ben.who.mutation(api.world.sit, { seat: "table-b-right" });
    expect((await rows(t)).challenges).toHaveLength(1);
    const [asked] = (await rows(t)).challenges;
    await ben.who.mutation(api.cafeGames.respond, { challengeId: asked._id, accept: true });
    later(REFILL);
    const dana = await inCafe(t, "dana@sow.org.au");
    await dana.who.mutation(api.world.sit, { seat: "table-c-left" });
    await cara.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    await cara.who.mutation(api.world.sit, { seat: "table-c-right" });
    expect((await rows(t)).challenges).toHaveLength(0);
  });

  test("either person picks a game and the other accepts", async () => {
    const { t, anna, ben } = await trio();
    await anna.who.mutation(api.world.sit, { seat: "table-a-left" });
    await ben.who.mutation(api.world.sit, { seat: "table-a-right" });
    const [prompt] = (await rows(t)).challenges;
    expect(await anna.who.mutation(api.cafeGames.respond, { challengeId: prompt._id, accept: true })).toEqual({ ok: false, reason: "Pick a game first." });
    await expect(anna.who.mutation(api.cafeGames.pick, { challengeId: prompt._id, kind: "chess" })).rejects.toThrow(/Pick a game/);
    expect(await anna.who.mutation(api.cafeGames.pick, { challengeId: prompt._id, kind: "dotsAndBoxes" })).toEqual({ ok: true });
    expect(await ben.who.mutation(api.cafeGames.pick, { challengeId: prompt._id, kind: "ticTacToe" })).toEqual({ ok: false, reason: "They've picked one already." });
    expect((await ben.who.query(api.cafeGames.mine, {}))?.challenges).toMatchObject([{ kind: "dotsAndBoxes", picked: "them" }]);
    expect(await anna.who.mutation(api.cafeGames.respond, { challengeId: prompt._id, accept: true })).toEqual({ ok: false, reason: "Waiting for them to answer." });
    expect(await ben.who.mutation(api.cafeGames.respond, { challengeId: prompt._id, accept: true })).toEqual({ ok: true });
    const { games, challenges } = await rows(t);
    expect(challenges).toEqual([]);
    expect(games).toMatchObject([{ kind: "dotsAndBoxes", a: ANNA, b: BEN }]);
  });
});

describe("tap to challenge", () => {
  test("a challenge goes to them; accepting starts a game with the challenger first", async () => {
    const { t, anna, ben, gameId } = await startGame("ticTacToe");
    const mine = await anna.who.query(api.cafeGames.mine, {});
    expect(mine?.game).toMatchObject({ id: gameId, kind: "ticTacToe", side: "a", opponent: ben.memberId, away: false, board: { turn: "a" } });
    expect((await ben.who.query(api.cafeGames.mine, {}))?.game).toMatchObject({ side: "b", opponent: anna.memberId });
    expect((await boardOf(t, gameId)).turnEndsAt).toEqual(near(Date.now() + CAFE_TURN_MS));
  });

  test("a new challenge replaces your last one", async () => {
    const { t, anna, ben, cara } = await trio();
    await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" });
    await anna.who.mutation(api.cafeGames.challenge, { to: cara.memberId, kind: "fiveInARow" });
    expect((await rows(t)).challenges).toMatchObject([{ to: CARA, kind: "fiveInARow", pickedBy: ANNA }]);
    expect((await anna.who.query(api.cafeGames.mine, {}))?.challenges).toMatchObject([{ picked: "me", otherName: "cara" }]);
  });

  test("refused outside the Café, to yourself, to someone gone or blocked, and too often", async () => {
    const { t, anna, ben, cara } = await trio();
    await expect(anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "go" })).rejects.toThrow(/Pick a game/);
    expect(await anna.who.mutation(api.cafeGames.challenge, { to: anna.memberId, kind: "fourInARow" })).toEqual({ ok: false, reason: "That's you." });
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: CARA, blockedEmail: ANNA, blockedName: "anna" }));
    expect(await anna.who.mutation(api.cafeGames.challenge, { to: cara.memberId, kind: "fourInARow" })).toEqual({ ok: false, reason: "They've left the Café." });
    await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" });
    await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" });
    await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" });
    expect(await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" })).toMatchObject({ ok: false, retryInMs: expect.any(Number) });
    later(REFILL);
    await ben.who.mutation(api.world.travel, { to: "garden" });
    expect(await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" })).toEqual({ ok: false, reason: "They've left the Café." });
    expect(await ben.who.mutation(api.cafeGames.challenge, { to: anna.memberId, kind: "fourInARow" })).toEqual({ ok: false, reason: "Games are played in the Café." });
  });

  test("a challenge runs out after about 30 seconds", async () => {
    const { t, anna, ben } = await trio();
    await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" });
    const [sent] = (await rows(t)).challenges;
    await t.mutation(internal.cafeGames.expire, { challengeId: sent._id });
    expect((await rows(t)).challenges).toHaveLength(1);
    later(CAFE_CHALLENGE_MS);
    expect(await ben.who.mutation(api.cafeGames.respond, { challengeId: sent._id, accept: true })).toEqual({ ok: false, reason: "That's gone. Ask them again." });
    expect(await ben.who.mutation(api.cafeGames.pick, { challengeId: sent._id, kind: "ticTacToe" })).toEqual({ ok: false, reason: "That's gone." });
    await t.mutation(internal.cafeGames.expire, { challengeId: sent._id });
    expect((await rows(t)).challenges).toHaveLength(0);
  });

  test("declining removes it and keeps the pair quiet", async () => {
    const { t, anna, ben } = await trio();
    await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" });
    const [sent] = (await rows(t)).challenges;
    expect(await ben.who.mutation(api.cafeGames.respond, { challengeId: sent._id, accept: false })).toEqual({ ok: true });
    const { challenges, quiet } = await rows(t);
    expect(challenges).toEqual([]);
    expect(quiet).toMatchObject([{ pair: `${ANNA} ${BEN}` }]);
  });

  test("accepting after the challenger left, or once someone's playing, is refused", async () => {
    const { t, anna, ben, cara } = await trio();
    await anna.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" });
    await cara.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "ticTacToe" });
    const sent = (await rows(t)).challenges;
    await t.run((ctx) =>
      ctx.db.insert("cafeGames", { roomId: anna.roomId, kind: "fourInARow", a: ANNA, b: "x@sow.org.au", aName: "anna", bName: "x", startedAt: Date.now() })
    );
    expect(await ben.who.mutation(api.cafeGames.respond, { challengeId: sent[0]._id, accept: true })).toEqual({ ok: false, reason: "One of you is already playing." });
    await cara.who.mutation(api.world.travel, { to: "garden" });
    expect(await ben.who.mutation(api.cafeGames.respond, { challengeId: sent[1]._id, accept: true })).toEqual({ ok: false, reason: "They've left the Café." });
  });
});

describe("one game at a time", () => {
  test("nobody playing can challenge or be challenged", async () => {
    const { anna, ben, cara } = await startGame();
    expect(await cara.who.mutation(api.cafeGames.challenge, { to: ben.memberId, kind: "fourInARow" })).toEqual({ ok: false, reason: "They're playing a game already." });
    expect(await anna.who.mutation(api.cafeGames.challenge, { to: cara.memberId, kind: "fourInARow" })).toEqual({ ok: false, reason: "Finish your game first." });
  });
});

describe("moves", () => {
  test("the server turns away moves out of turn, illegal moves and strangers", async () => {
    const { anna, ben, cara, gameId } = await startGame();
    expect(await ben.who.mutation(api.cafeGames.move, { gameId, move: 0 })).toEqual({ ok: false, reason: "It's not your turn." });
    expect(await anna.who.mutation(api.cafeGames.move, { gameId, move: 9 })).toEqual({ ok: false, reason: "You can't go there." });
    expect(await cara.who.mutation(api.cafeGames.move, { gameId, move: 0 })).toEqual({ ok: false, reason: "That isn't your game." });
    expect(await anna.who.mutation(api.cafeGames.move, { gameId, move: 3 })).toEqual({ ok: true });
    expect(await anna.who.mutation(api.cafeGames.move, { gameId, move: 3 })).toEqual({ ok: false, reason: "It's not your turn." });
  });

  test("a win ends the game, records it for both, and shows to spectators until then", async () => {
    const { anna, ben, cara, gameId } = await startGame();
    expect(await cara.who.query(api.cafeGames.playing, { roomId: cara.roomId })).toEqual([{ a: anna.memberId, b: ben.memberId, kind: "fourInARow" }]);
    for (const [who, column] of [[anna, 0], [ben, 1], [anna, 0], [ben, 1], [anna, 0], [ben, 1]] as const) {
      expect(await who.who.mutation(api.cafeGames.move, { gameId, move: column })).toEqual({ ok: true });
    }
    await anna.who.mutation(api.cafeGames.move, { gameId, move: 0 });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game).toMatchObject({ result: { winner: "a", why: "played" }, board: { line: [14, 21, 28, 35] } });
    expect(await ben.who.mutation(api.cafeGames.move, { gameId, move: 2 })).toEqual({ ok: false, reason: "That game's over." });
    expect(await cara.who.query(api.cafeGames.playing, { roomId: cara.roomId })).toEqual([]);
    expect(await cara.who.query(api.cafeGames.record, { memberId: anna.memberId })).toEqual([{ kind: "fourInARow", wins: 1, losses: 0, draws: 0 }]);
    expect(await cara.who.query(api.cafeGames.record, { memberId: ben.memberId })).toEqual([{ kind: "fourInARow", wins: 0, losses: 1, draws: 0 }]);
  });

  test("records add up across games, draws included", async () => {
    const { t, anna, ben, gameId } = await startGame("ticTacToe");
    const game = (await t.run((ctx) => ctx.db.get("cafeGames", gameId)))!;
    await t.run(async (ctx) => {
      await ctx.db.insert("cafeRecords", { email: ANNA, kind: "ticTacToe", wins: 2, losses: 1, draws: 0 });
    });
    const board = await boardOf(t, gameId);
    await t.run((ctx) => ctx.db.patch("cafeBoards", board._id, { board: { ...board.board, cells: [1, 2, 1, 1, 2, 2, 2, 1, 0], turn: "a" } }));
    await anna.who.mutation(api.cafeGames.move, { gameId, move: 8 });
    expect(game.kind).toBe("ticTacToe");
    expect(await ben.who.query(api.cafeGames.record, { memberId: anna.memberId })).toEqual([{ kind: "ticTacToe", wins: 2, losses: 1, draws: 1 }]);
    expect(await anna.who.query(api.cafeGames.record, { memberId: ben.memberId })).toEqual([{ kind: "ticTacToe", wins: 0, losses: 0, draws: 1 }]);
  });

  test("giving up loses the game", async () => {
    const { anna, ben, cara, gameId } = await startGame();
    expect(await cara.who.mutation(api.cafeGames.giveUp, { gameId })).toEqual({ ok: false, reason: "That game's over." });
    expect(await ben.who.mutation(api.cafeGames.giveUp, { gameId })).toEqual({ ok: true });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game?.result).toEqual({ winner: "a", why: "gaveUp" });
    expect(await ben.who.mutation(api.cafeGames.giveUp, { gameId })).toEqual({ ok: false, reason: "That game's over." });
  });
});

describe("the turn timer", () => {
  test("a missed turn passes; a second miss in a row loses; old timers do nothing", async () => {
    const { t, anna, ben, gameId } = await startGame();
    later(CAFE_TURN_MS);
    await t.mutation(internal.cafeGames.timeout, { gameId, moves: 0 });
    expect((await boardOf(t, gameId))).toMatchObject({ moves: 1, board: { turn: "b", missed: { a: 1, b: 0 } } });
    await t.mutation(internal.cafeGames.timeout, { gameId, moves: 0 });
    expect((await boardOf(t, gameId)).moves).toBe(1);
    await ben.who.mutation(api.cafeGames.move, { gameId, move: 0 });
    later(CAFE_TURN_MS);
    await t.mutation(internal.cafeGames.timeout, { gameId, moves: 2 });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game?.result).toEqual({ winner: "b", why: "timeout" });
    await t.mutation(internal.cafeGames.timeout, { gameId, moves: 2 });
  });
});

describe("leaving forfeits after a grace period", () => {
  test("stepping out and back in time keeps the game going", async () => {
    const { t, anna, gameId } = await startGame();
    await anna.who.mutation(api.world.travel, { to: "garden" });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game?.away).toBe(true);
    later(REFILL / 2);
    await anna.who.mutation(api.world.travel, { to: "chapel" });
    later(REFILL / 2);
    await anna.who.mutation(api.world.travel, { to: "cafe" });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game?.away).toBe(false);
    later(CAFE_AWAY_GRACE_MS);
    await t.mutation(internal.cafeGames.checkAway, { gameId });
    expect((await rows(t)).games[0].endedAt).toBeUndefined();
  });

  test("leaving the World for longer than the grace period loses", async () => {
    const { t, anna, ben, gameId } = await startGame();
    await ben.who.mutation(api.world.leave, {});
    later(CAFE_AWAY_GRACE_MS - 1000);
    await t.mutation(internal.cafeGames.checkAway, { gameId });
    expect((await rows(t)).games[0].endedAt).toBeUndefined();
    later(1000);
    await t.mutation(internal.cafeGames.checkAway, { gameId });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game?.result).toEqual({ winner: "a", why: "left" });
    await t.mutation(internal.cafeGames.checkAway, { gameId });
  });

  test("leaving and coming back to the World in time keeps it", async () => {
    const { t, ben } = await startGame();
    await ben.who.mutation(api.world.leave, {});
    later(5000);
    await ben.who.mutation(api.world.join, {});
    expect((await rows(t)).games[0].awayB).toBeUndefined();
  });

  test("player a leaving loses too, and both gone ends it with no record", async () => {
    const first = await startGame();
    await first.anna.who.mutation(api.world.travel, { to: "garden" });
    later(CAFE_AWAY_GRACE_MS);
    await first.t.mutation(internal.cafeGames.checkAway, { gameId: first.gameId });
    expect((await rows(first.t)).games[0].result).toEqual({ winner: "b", why: "left" });
    const second = await startGame();
    await second.anna.who.mutation(api.world.leave, {});
    await second.ben.who.mutation(api.world.leave, {});
    later(CAFE_AWAY_GRACE_MS);
    await second.t.mutation(internal.cafeGames.checkAway, { gameId: second.gameId });
    const { games, records } = await rows(second.t);
    expect(games[0].result).toEqual({ winner: "draw", why: "abandoned" });
    expect(records).toEqual([]);
  });
});

describe("rematch and clean-up", () => {
  test("both asking for a rematch starts a new game with the other player first", async () => {
    const { t, anna, ben, gameId } = await startGame();
    expect(await anna.who.mutation(api.cafeGames.rematch, { gameId })).toEqual({ ok: false, reason: "That game's gone." });
    await anna.who.mutation(api.cafeGames.giveUp, { gameId });
    expect(await anna.who.mutation(api.cafeGames.rematch, { gameId })).toEqual({ ok: true });
    expect(await anna.who.mutation(api.cafeGames.rematch, { gameId })).toEqual({ ok: true });
    expect((await ben.who.query(api.cafeGames.mine, {}))?.game?.rematch).toBe("a");
    expect(await ben.who.mutation(api.cafeGames.rematch, { gameId })).toEqual({ ok: true });
    const games = (await rows(t)).games;
    expect(games).toHaveLength(2);
    expect(games[1]).toMatchObject({ a: BEN, b: ANNA });
    expect(games[0].next).toBe(games[1]._id);
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game).toMatchObject({ id: games[1]._id, side: "b" });
    expect(await ben.who.mutation(api.cafeGames.rematch, { gameId })).toEqual({ ok: true });
  });

  test("a rematch needs both still in the Café and free", async () => {
    const { t, anna, ben, cara, gameId } = await startGame();
    await anna.who.mutation(api.cafeGames.giveUp, { gameId });
    await anna.who.mutation(api.cafeGames.rematch, { gameId });
    await t.run((ctx) =>
      ctx.db.insert("cafeGames", { roomId: cara.roomId, kind: "fourInARow", a: ANNA, b: CARA, aName: "anna", bName: "cara", startedAt: Date.now() })
    );
    expect(await ben.who.mutation(api.cafeGames.rematch, { gameId })).toEqual({ ok: false, reason: "One of you is already playing." });
    await anna.who.mutation(api.world.travel, { to: "garden" });
    expect(await ben.who.mutation(api.cafeGames.rematch, { gameId })).toEqual({ ok: false, reason: "They've left the Café." });
  });

  test("an abandoned game can't be replayed", async () => {
    const { t, anna, gameId } = await startGame();
    await t.run((ctx) => ctx.db.patch("cafeGames", gameId, { endedAt: Date.now(), result: { winner: "draw", why: "abandoned" } }));
    expect(await anna.who.mutation(api.cafeGames.rematch, { gameId })).toEqual({ ok: false, reason: "That game's gone." });
  });

  test("a finished game and its board go a couple of minutes after the end", async () => {
    const { t, anna, gameId } = await startGame();
    await t.mutation(internal.cafeGames.clear, { gameId });
    expect((await rows(t)).games).toHaveLength(1);
    await anna.who.mutation(api.cafeGames.giveUp, { gameId });
    later(CAFE_KEEP_MS);
    await t.mutation(internal.cafeGames.clear, { gameId });
    const { games, boards, records } = await rows(t);
    expect(games).toEqual([]);
    expect(boards).toEqual([]);
    expect(records).toHaveLength(2);
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game).toBeNull();
    await t.mutation(internal.cafeGames.clear, { gameId });
  });
});

describe("closing a finished game", () => {
  test("a closed result stays closed for that player only, across fresh loads", async () => {
    const { t, anna, ben, cara, gameId } = await startGame();
    expect(await anna.who.mutation(api.cafeGames.close, { gameId })).toEqual({ ok: false, reason: "Finish your game first." });
    expect(await cara.who.mutation(api.cafeGames.close, { gameId })).toEqual({ ok: false, reason: "That isn't your game." });
    await ben.who.mutation(api.cafeGames.giveUp, { gameId });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game).toMatchObject({ id: gameId, result: { winner: "a", why: "gaveUp" } });
    expect(await anna.who.mutation(api.cafeGames.close, { gameId })).toEqual({ ok: true });
    expect(await anna.who.mutation(api.cafeGames.close, { gameId })).toEqual({ ok: true });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game).toBeNull();
    expect((await ben.who.query(api.cafeGames.mine, {}))?.game).toMatchObject({ id: gameId });
    expect(await ben.who.mutation(api.cafeGames.close, { gameId })).toEqual({ ok: true });
    expect((await ben.who.query(api.cafeGames.mine, {}))?.game).toBeNull();
    expect((await rows(t)).games[0]).toMatchObject({ closedA: true, closedB: true });
    later(CAFE_KEEP_MS);
    await t.mutation(internal.cafeGames.clear, { gameId });
    expect(await anna.who.mutation(api.cafeGames.close, { gameId })).toEqual({ ok: true });
  });

  test("a closed game doesn't hide the next one, and an older result never comes back", async () => {
    const { t, anna, ben, gameId } = await startGame();
    await ben.who.mutation(api.cafeGames.giveUp, { gameId });
    await anna.who.mutation(api.cafeGames.rematch, { gameId });
    await ben.who.mutation(api.cafeGames.rematch, { gameId });
    const next = (await rows(t)).games[1]._id;
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game).toMatchObject({ id: next });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game?.result).toBeUndefined();
    await anna.who.mutation(api.cafeGames.giveUp, { gameId: next });
    await anna.who.mutation(api.cafeGames.close, { gameId: next });
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game).toBeNull();
  });
});

describe("head-to-head", () => {
  test("wins and draws between two people, from each side, and nothing for yourself, strangers or a block", async () => {
    const { t, anna, ben, cara, gameId } = await startGame();
    expect(await anna.who.query(api.cafeGames.versus, { memberId: ben.memberId })).toBeNull();
    await ben.who.mutation(api.cafeGames.giveUp, { gameId });
    expect(await anna.who.query(api.cafeGames.versus, { memberId: ben.memberId })).toEqual({ mine: 1, theirs: 0, draws: 0 });
    expect(await ben.who.query(api.cafeGames.versus, { memberId: anna.memberId })).toEqual({ mine: 0, theirs: 1, draws: 0 });
    await anna.who.mutation(api.cafeGames.rematch, { gameId });
    await ben.who.mutation(api.cafeGames.rematch, { gameId });
    const second = (await rows(t)).games[1]._id;
    await anna.who.mutation(api.cafeGames.giveUp, { gameId: second });
    expect(await anna.who.query(api.cafeGames.versus, { memberId: ben.memberId })).toEqual({ mine: 1, theirs: 1, draws: 0 });
    await ben.who.mutation(api.cafeGames.rematch, { gameId: second });
    await anna.who.mutation(api.cafeGames.rematch, { gameId: second });
    const third = (await rows(t)).games[2];
    const board = await boardOf(t, third._id);
    await t.run((ctx) => ctx.db.patch("cafeGames", third._id, { kind: "ticTacToe" }));
    await t.run((ctx) => ctx.db.patch("cafeBoards", board._id, { board: { ...newBoard("ticTacToe"), cells: [1, 2, 1, 1, 2, 2, 2, 1, 0], turn: "a" } }));
    await anna.who.mutation(api.cafeGames.move, { gameId: third._id, move: 8 });
    expect(await ben.who.query(api.cafeGames.versus, { memberId: anna.memberId })).toEqual({ mine: 1, theirs: 1, draws: 1 });
    expect((await t.run((ctx) => ctx.db.query("cafeVersus").collect())).length).toBe(1);
    expect(await anna.who.query(api.cafeGames.versus, { memberId: anna.memberId })).toBeNull();
    expect(await cara.who.query(api.cafeGames.versus, { memberId: anna.memberId })).toBeNull();
    expect(await t.query(api.cafeGames.versus, { memberId: anna.memberId })).toBeNull();
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: BEN, blockedEmail: ANNA, blockedName: "anna" }));
    expect(await anna.who.query(api.cafeGames.versus, { memberId: ben.memberId })).toBeNull();
  });

  test("an abandoned game doesn't count", async () => {
    const { t, anna, ben, gameId } = await startGame();
    await anna.who.mutation(api.world.leave, {});
    await ben.who.mutation(api.world.leave, {});
    later(CAFE_AWAY_GRACE_MS);
    await t.mutation(internal.cafeGames.checkAway, { gameId });
    expect(await t.run((ctx) => ctx.db.query("cafeVersus").collect())).toEqual([]);
  });
});

describe("who can see what", () => {
  test("nothing for people outside the World or the room, and no records across a block", async () => {
    const { t, anna, ben, cara } = await startGame();
    const stranger = asUser(t, "dana@sow.org.au");
    expect(await stranger.query(api.cafeGames.mine, {})).toBeNull();
    expect(await stranger.query(api.cafeGames.playing, { roomId: anna.roomId })).toBeNull();
    expect(await t.query(api.cafeGames.record, { memberId: anna.memberId })).toEqual([]);
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: CARA, blockedEmail: ANNA, blockedName: "anna" }));
    expect(await cara.who.query(api.cafeGames.record, { memberId: anna.memberId })).toEqual([]);
    expect(await cara.who.query(api.cafeGames.playing, { roomId: cara.roomId })).toEqual([]);
    await ben.who.mutation(api.world.travel, { to: "garden" });
    expect(await anna.who.query(api.cafeGames.playing, { roomId: anna.roomId })).toEqual([]);
    expect((await anna.who.query(api.cafeGames.mine, {}))?.game?.opponent).toBeNull();
  });
});
