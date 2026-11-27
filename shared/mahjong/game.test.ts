import { describe, expect, it } from "vitest";
import { botAnswer, botDiscard, botTurn } from "./bot";
import {
  actors,
  answerClaim,
  begin,
  CLAIM_MS,
  deadlineOf,
  declareKong,
  discard,
  INTRO_MS,
  newHand,
  nextDealer,
  paysFor,
  pointsFor,
  resolveClaims,
  selfWin,
  timeOut,
  TURN_MS,
  turnOptions,
  type Hand,
} from "./game";
import { applyMove, botMove, playBots } from "./play";
import { DEFAULT_SETTINGS, validSettings, type Settings } from "./table";
import { counts, kinds, seeded, tilesOf } from "./testTiles";
import { countsOf, kindOf, TILE_COUNT } from "./tiles";
import { HIDDEN, viewHand } from "./view";

const NOW = 1_000_000;

/**
 * A hand set up by hand: each seat's concealed tiles, the wall in draw
 * order, and whose turn it is (with the tile they just drew, if any).
 */
const rig = ({
  hands,
  wall = "",
  turn = 0,
  drawn = null,
  settings = {},
  dealer = 0,
}: {
  hands: [string, string, string, string];
  wall?: string;
  turn?: number;
  drawn?: number | null;
  settings?: Partial<Settings>;
  dealer?: number;
}): Hand => {
  const used = new Map<number, number>();
  const seats = hands.map((text) => ({ hand: tilesOf(text, used), melds: [], discards: [], turns: 1 }));
  return {
    step: 10,
    wall: tilesOf(wall, used),
    seats,
    dealer,
    roundWind: 0,
    dice: [1, 2, 3],
    breakAt: 6,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    stage: { kind: "turn", seat: turn, drawn, deadline: NOW + TURN_MS, replacement: false, claimed: false },
    last: null,
    calls: 1,
  };
};

const ok = (step: ReturnType<typeof discard>) => {
  if (!step.ok) throw new Error(step.reason);
  return step.hand;
};

const tileIn = (hand: Hand, seat: number, kindText: string) => hand.seats[seat].hand.find((t) => kindOf(t) === kinds(kindText)[0])!;

describe("settings and payouts", () => {
  it("checks settings", () => {
    expect(validSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(validSettings({ ...DEFAULT_SETTINGS, minFaan: 0 })).toBe(false);
    expect(validSettings({ ...DEFAULT_SETTINGS, minFaan: 11 })).toBe(false);
    expect(validSettings({ ...DEFAULT_SETTINGS, maxFaan: 14 })).toBe(false);
    expect(validSettings({ ...DEFAULT_SETTINGS, stake: 3 })).toBe(false);
    expect(validSettings({ ...DEFAULT_SETTINGS, minFaan: 2.5 })).toBe(false);
  });

  it("turns faan into points", () => {
    expect(pointsFor(3)).toBe(8);
    expect(pointsFor(10)).toBe(128);
    expect(pointsFor(99)).toBe(384);
    expect(pointsFor(-1)).toBe(1);
  });

  it("makes the discarder pay it all, and everyone pay half a self-draw", () => {
    expect(paysFor(2, 0, 8)).toEqual([{ from: 0, to: 2, points: 8 }]);
    expect(paysFor(2, null, 8)).toEqual([
      { from: 3, to: 2, points: 4 },
      { from: 0, to: 2, points: 4 },
      { from: 1, to: 2, points: 4 },
    ]);
    expect(paysFor(0, null, 1)[0].points).toBe(1);
  });
});

describe("dealing", () => {
  it("rolls for the dealer and deals 13 each and 14 to the dealer from the 136 tiles", () => {
    const hand = newHand({ settings: DEFAULT_SETTINGS, dealer: null, roundWind: 0, random: seeded(7), now: NOW });
    const total = hand.dice.reduce((a, b) => a + b, 0);
    expect(hand.dealer).toBe((total - 1) % 4);
    expect(hand.breakAt).toBe(total);
    hand.seats.forEach((s, seat) => {
      expect(s.hand).toHaveLength(seat === hand.dealer ? 14 : 13);
    });
    const all = [...hand.wall, ...hand.seats.flatMap((s) => s.hand)];
    expect(new Set(all).size).toBe(TILE_COUNT);
    expect(hand.stage).toEqual({ kind: "intro", until: NOW + INTRO_MS });
    expect(deadlineOf(hand)).toBe(NOW + INTRO_MS);
  });

  it("keeps a dealer it's given", () => {
    const hand = newHand({ settings: DEFAULT_SETTINGS, dealer: 2, roundWind: 1, random: seeded(3), now: NOW });
    expect(hand.dealer).toBe(2);
    expect(hand.wall.length + 13 * 4 + 1).toBe(136);
  });

  it("starts with the dealer's turn once the intro has played", () => {
    const hand = newHand({ settings: DEFAULT_SETTINGS, dealer: 1, roundWind: 0, random: seeded(1), now: NOW });
    const started = ok(begin(hand, NOW + INTRO_MS));
    expect(started.stage).toMatchObject({ kind: "turn", seat: 1, drawn: null });
    expect(begin(started, NOW).ok).toBe(false);
    expect(ok(timeOut(hand, NOW + INTRO_MS)).stage.kind).toBe("turn");
  });
});

describe("turns", () => {
  it("passes to the next seat, who draws from the front of the wall", () => {
    const hand = rig({ hands: ["123p 456p 789p 12s 45s RG", "1m", "2m", "3m"], wall: "9m 8m" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "R"), NOW));
    expect(after.stage).toMatchObject({ kind: "turn", seat: 1, drawn: tilesOf("9m", new Map([[26, 0]]))[0] });
    expect(after.seats[0].discards.map((d) => kindOf(d.tile))).toEqual(kinds("R"));
    expect(after.seats[1].hand).toHaveLength(2);
    expect(after.wall).toHaveLength(1);
    expect(after.last).toMatchObject({ kind: "draw", seat: 1 });
  });

  it("refuses moves out of turn and tiles you don't hold", () => {
    const hand = rig({ hands: ["123p RG", "1m", "2m", "3m"], wall: "9m" });
    expect(discard(hand, 1, hand.seats[1].hand[0], NOW)).toEqual({ ok: false, reason: "It's not your turn." });
    expect(discard(hand, 0, hand.seats[1].hand[0], NOW)).toEqual({ ok: false, reason: "That tile isn't in your hand." });
    expect(selfWin(hand, 1).ok).toBe(false);
    expect(declareKong(hand, 1, 0, NOW).ok).toBe(false);
  });

  it("ends in a draw when the wall runs out", () => {
    const hand = rig({ hands: ["123p RG", "1m", "2m", "3m"], wall: "" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "R"), NOW));
    expect(after.stage).toEqual({ kind: "over", result: { kind: "draw" } });
  });

  it("discards the drawn tile for a player who runs out of time", () => {
    const hand = rig({ hands: ["123p 456p RG", "1m", "2m", "3m"], wall: "9m 9m", drawn: null });
    hand.stage = { ...hand.stage, kind: "turn", seat: 0, drawn: hand.seats[0].hand[2], deadline: NOW, replacement: false, claimed: false };
    const after = ok(timeOut(hand, NOW));
    expect(after.seats[0].discards[0].tile).toBe(hand.seats[0].hand[2]);
    const noDraw = rig({ hands: ["123p RG", "1m", "2m", "3m"], wall: "9m" });
    expect(kindOf(ok(timeOut(noDraw, NOW)).seats[0].discards[0].tile)).toBe(kinds("G")[0]);
  });
});

describe("self-drawn wins", () => {
  const ready = "123p 456p 789p RRR 5p";

  it("wins when the hand is worth the minimum", () => {
    const hand = rig({ hands: [`${ready} 5p`, "1m", "2m", "3m"], wall: "9m" });
    hand.stage = { kind: "turn", seat: 0, drawn: hand.seats[0].hand[14 - 1], deadline: NOW, replacement: false, claimed: false };
    expect(turnOptions(hand, 0).win).not.toBeNull();
    const won = ok(selfWin(hand, 0));
    expect(won.stage.kind).toBe("over");
    const result = won.stage.kind === "over" ? won.stage.result : null;
    expect(result).toMatchObject({ kind: "win", winner: 0, from: null });
    if (result?.kind !== "win") throw new Error("no win");
    expect(result.lines.map((l) => l.id)).toEqual(expect.arrayContaining(["mixedSuit", "dragonPong", "selfDrawn", "concealed"]));
    expect(result.faan).toBe(6);
    expect(result.points).toBe(32);
    expect(result.pays).toHaveLength(3);
  });

  it("can't win below the minimum", () => {
    const hand = rig({ hands: ["123p 456s 789m 234s 11m", "1m", "2m", "3m"], wall: "9p", settings: { minFaan: 4 } });
    expect(turnOptions(hand, 0).win).toBeNull();
    expect(selfWin(hand, 0)).toEqual({ ok: false, reason: "That hand isn't worth 4 faan." });
    const enough = rig({ hands: ["123p 456s 789m 234s 11m", "1m", "2m", "3m"], wall: "9p", settings: { minFaan: 3 } });
    expect(turnOptions(enough, 0).win?.total).toBe(3);
    expect(selfWin(enough, 0).ok).toBe(true);
  });

  it("counts a heavenly hand on the dealer's first 14", () => {
    const hand = rig({ hands: [`${ready} 5p`, "1m", "2m", "3m"] });
    hand.calls = 0;
    hand.seats[0].turns = 0;
    const won = ok(selfWin(hand, 0));
    expect(won.stage.kind === "over" && won.stage.result.kind === "win" && won.stage.result.lines[0].id).toBe("heavenly");
  });
});

describe("claims", () => {
  it("offers a chow only to the next seat, and a pong to anyone", () => {
    const hand = rig({ hands: ["123p 456p 789p 2s RG", "13s 99m", "33s 88m", "4s 77m"], wall: "1m 1m" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "2s"), NOW));
    expect(after.stage.kind).toBe("claim");
    if (after.stage.kind !== "claim") return;
    expect(after.stage.offers[1]).toEqual({ hu: false, pong: false, kong: false, chows: [[tileIn(hand, 1, "1s"), tileIn(hand, 1, "3s")]] });
    expect(after.stage.offers[2]).toBeNull();
    expect(after.stage.offers[3]).toBeNull();
    expect(after.stage.deadline).toBe(NOW + CLAIM_MS);
    expect(actors(after)).toEqual([1]);
  });

  it("lists each way to chow", () => {
    const hand = rig({ hands: ["4s RG", "23s 56s 9m", "1m", "1m"], wall: "1p 1p" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "4s"), NOW));
    if (after.stage.kind !== "claim") throw new Error("no claim");
    expect(after.stage.offers[1]!.chows.map((c) => c.map(kindOf))).toEqual([kinds("23s"), kinds("35s"), kinds("56s")]);
  });

  it("gives a pong priority over a chow", () => {
    const hand = rig({ hands: ["2s RG", "13s 99m", "22s 88m", "4s 77m"], wall: "1m 1m" });
    let after = ok(discard(hand, 0, tileIn(hand, 0, "2s"), NOW));
    after = ok(answerClaim(after, 1, { kind: "chow", option: 0 }, NOW));
    expect(after.stage.kind).toBe("claim");
    after = ok(answerClaim(after, 2, { kind: "pong" }, NOW));
    expect(after.stage).toMatchObject({ kind: "turn", seat: 2, drawn: null, claimed: true });
    expect(after.seats[2].melds[0]).toMatchObject({ type: "pong", kind: kinds("2s")[0], from: 0 });
    expect(after.seats[0].discards[0].taken).toBe(true);
    expect(after.last).toMatchObject({ kind: "pong", seat: 2 });
    expect(turnOptions(after, 2)).toEqual({ win: null, kongs: [] });
  });

  it("gives a win priority over a pong, and the first winner after the discarder the tile", () => {
    const hand = rig({ hands: ["5p 9m", "55p 11m 99s", "123p 789p 111s RRR 5p", "46p 123s 789s GGG EE"], wall: "1m 1m", settings: { minFaan: 1 } });
    let after = ok(discard(hand, 0, tileIn(hand, 0, "5p"), NOW));
    if (after.stage.kind !== "claim") throw new Error("no claim");
    expect(after.stage.offers[2]!.hu).toBe(true);
    expect(after.stage.offers[3]!.hu).toBe(true);
    after = ok(answerClaim(after, 1, { kind: "pong" }, NOW));
    after = ok(answerClaim(after, 3, { kind: "hu" }, NOW));
    after = ok(answerClaim(after, 2, { kind: "hu" }, NOW));
    expect(after.stage.kind === "over" && after.stage.result).toMatchObject({ kind: "win", winner: 2, from: 0 });
  });

  it("refuses claims that aren't on offer", () => {
    const hand = rig({ hands: ["2s RG", "13s 99m", "22s 88m", "4s 77m"], wall: "1m 1m" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "2s"), NOW));
    expect(answerClaim(after, 3, { kind: "pass" }, NOW)).toEqual({ ok: false, reason: "You can't claim that." });
    expect(answerClaim(after, 2, { kind: "chow", option: 0 }, NOW)).toEqual({ ok: false, reason: "You can't claim that." });
    expect(answerClaim(after, 2, { kind: "kong" }, NOW)).toEqual({ ok: false, reason: "You can't claim that." });
    const answered = ok(answerClaim(after, 1, { kind: "pass" }, NOW));
    expect(answerClaim(answered, 1, { kind: "pass" }, NOW)).toEqual({ ok: false, reason: "You've answered." });
    expect(answerClaim(hand, 1, { kind: "pass" }, NOW)).toEqual({ ok: false, reason: "That tile's gone." });
    expect(resolveClaims(hand, NOW).ok).toBe(false);
  });

  it("passes everyone who didn't answer when the window closes, and play moves on", () => {
    const hand = rig({ hands: ["2s RG", "13s 99m", "22s 88m", "4s 77m"], wall: "1m 1m" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "2s"), NOW));
    const closed = ok(timeOut(after, NOW + CLAIM_MS));
    expect(closed.stage).toMatchObject({ kind: "turn", seat: 1 });
  });

  it("claims a chow and an exposed kong", () => {
    const hand = rig({ hands: ["2s RG", "13s 99m", "222s 8m", "4s 77m"], wall: "1m 5m" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "2s"), NOW));
    let kong = ok(answerClaim(after, 1, { kind: "pass" }, NOW));
    kong = ok(answerClaim(kong, 2, { kind: "kong" }, NOW));
    expect(kong.seats[2].melds[0]).toMatchObject({ type: "kong", kind: kinds("2s")[0] });
    expect(kong.stage).toMatchObject({ kind: "turn", seat: 2, replacement: true });
    expect(kindOf(kong.seats[2].hand.at(-1)!)).toBe(kinds("5m")[0]);
    const chow = ok(answerClaim(ok(answerClaim(after, 2, { kind: "pass" }, NOW)), 1, { kind: "chow", option: 0 }, NOW));
    expect(chow.seats[1].melds[0]).toMatchObject({ type: "chow", kind: kinds("1s")[0] });
    expect(chow.stage).toMatchObject({ kind: "turn", seat: 1, claimed: true });
  });

  it("lets only a win take the last discard", () => {
    const hand = rig({ hands: ["2s RG", "13s 99m", "22s 88m", "4s 77m"], wall: "" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "2s"), NOW));
    expect(after.stage).toEqual({ kind: "over", result: { kind: "draw" } });
  });
});

describe("kongs", () => {
  it("declares a concealed kong and draws from the back", () => {
    const hand = rig({ hands: ["1111p 23p RG", "1m", "2m", "3m"], wall: "9m 5m" });
    expect(turnOptions(hand, 0).kongs).toEqual([0]);
    const after = ok(declareKong(hand, 0, 0, NOW));
    expect(after.seats[0].melds[0]).toMatchObject({ type: "kong", kind: 0, concealed: true });
    expect(after.stage).toMatchObject({ kind: "turn", seat: 0, replacement: true });
    expect(kindOf(after.seats[0].hand.at(-1)!)).toBe(kinds("5m")[0]);
    expect(declareKong(hand, 0, 1, NOW)).toEqual({ ok: false, reason: "You can't kong that." });
  });

  it("promotes a pong, and the kong can be robbed", () => {
    const hand = rig({ hands: ["1p RG 99s", "23p 456p 789p RRR 99m", "1m", "3m"], wall: "9m 5m" });
    hand.seats[0].melds = [{ type: "pong", kind: 0, tiles: [1, 2, 3], from: 2 }];
    hand.seats[0].hand = [0, ...hand.seats[0].hand.slice(1)];
    expect(turnOptions(hand, 0).kongs).toEqual([0]);
    const robbing = ok(declareKong(hand, 0, 0, NOW));
    expect(robbing.stage).toMatchObject({ kind: "claim", rob: true, from: 0 });
    const robbed = ok(answerClaim(robbing, 1, { kind: "hu" }, NOW));
    expect(robbed.stage.kind === "over" && robbed.stage.result.kind === "win" && robbed.stage.result.lines.map((l) => l.id)).toContain("robbedKong");
    expect(robbed.seats[0].hand).not.toContain(0);
    const kept = ok(answerClaim(robbing, 1, { kind: "pass" }, NOW));
    expect(kept.seats[0].melds[0]).toMatchObject({ type: "kong", tiles: [1, 2, 3, 0] });
    expect(kept.stage).toMatchObject({ kind: "turn", seat: 0, replacement: true });
  });

  it("promotes straight away when nobody can rob it", () => {
    const hand = rig({ hands: ["1p RG 99s", "5m", "1m", "3m"], wall: "9m 5m" });
    hand.seats[0].melds = [{ type: "pong", kind: 0, tiles: [1, 2, 3], from: 2 }];
    hand.seats[0].hand = [0, ...hand.seats[0].hand.slice(1)];
    const after = ok(declareKong(hand, 0, 0, NOW));
    expect(after.stage).toMatchObject({ kind: "turn", seat: 0, replacement: true });
  });

  it("a concealed kong ends the untouched first turn, so its replacement can't be an earthly hand", () => {
    const hand = rig({ hands: ["2m", "1111m 123p 456p 78s 55s", "3m", "4m"], wall: "2m 9s", turn: 1 });
    hand.calls = 0;
    for (const s of hand.seats) s.turns = 0;
    const after = ok(declareKong(hand, 1, kinds("1m")[0], NOW));
    expect(after.calls).toBe(1);
    const won = ok(selfWin(after, 1));
    const lines = won.stage.kind === "over" && won.stage.result.kind === "win" ? won.stage.result.lines.map((l) => l.id) : [];
    expect(lines).toContain("kongWin");
    expect(lines).not.toContain("earthly");
  });

  it("can't kong with an empty wall", () => {
    const hand = rig({ hands: ["1111p 23p RG", "1m", "2m", "3m"], wall: "" });
    expect(turnOptions(hand, 0).kongs).toEqual([]);
  });
});

describe("dealer rotation", () => {
  it("keeps the dealer on a dealer win or a draw, and passes it otherwise", () => {
    const win = (winner: number) => ({ kind: "win" as const, winner, from: null, tile: 0, lines: [], faan: 3, points: 8, pays: [], hand: [] });
    expect(nextDealer(1, { kind: "draw" }, 1, 0)).toEqual({ dealer: 1, roundWind: 0 });
    expect(nextDealer(1, win(1), 1, 0)).toEqual({ dealer: 1, roundWind: 0 });
    expect(nextDealer(1, win(2), 1, 0)).toEqual({ dealer: 2, roundWind: 0 });
    expect(nextDealer(0, win(2), 1, 0)).toEqual({ dealer: 1, roundWind: 1 });
  });
});

describe("what each person sees", () => {
  it("shows a player only their own concealed tiles, and a watcher none", () => {
    const hand = newHand({ settings: DEFAULT_SETTINGS, dealer: 0, roundWind: 0, random: seeded(5), now: NOW });
    const mine = viewHand(hand, 2);
    expect(mine.seats[2].hand).toEqual(hand.seats[2].hand);
    expect(mine.seats.filter((_, i) => i !== 2).every((s) => s.hand === null)).toBe(true);
    expect(mine.mine).not.toBeNull();
    const watcher = viewHand(hand, null);
    expect(watcher.seats.every((s) => s.hand === null)).toBe(true);
    expect(watcher.mine).toBeNull();
    expect(watcher.seats.map((s) => s.concealed)).toEqual(hand.seats.map((s) => s.hand.length));
    expect(JSON.stringify(watcher)).not.toContain("wall\"");
    expect(watcher.wallLeft).toBe(hand.wall.length);
  });

  it("hides a drawn tile and a concealed kong from everyone else", () => {
    const hand = rig({ hands: ["1111p 23p RG", "1m", "2m", "3m"], wall: "9m 5m 4m" });
    const konged = ok(declareKong(hand, 0, 0, NOW));
    expect(viewHand(konged, 1).seats[0].melds[0].tiles).toEqual([HIDDEN, HIDDEN, HIDDEN, HIDDEN]);
    expect(viewHand(konged, null).seats[0].melds[0].tiles).toEqual([HIDDEN, HIDDEN, HIDDEN, HIDDEN]);
    expect(viewHand(konged, 0).seats[0].melds[0].tiles).toEqual([0, 1, 2, 3]);
    const drew = ok(discard(konged, 0, tileIn(konged, 0, "R"), NOW));
    expect(viewHand(drew, 1).last).toMatchObject({ kind: "draw", seat: 1, tile: drew.last!.tile });
    expect(viewHand(drew, 2).last).toEqual({ kind: "draw", seat: 1, step: drew.step });
    expect(viewHand(drew, null).last?.tile).toBeUndefined();
    expect(viewHand(drew, 1).mine?.drawn).toBe(drew.last!.tile);
  });

  it("tells a player their options, but nobody else who can claim", () => {
    const hand = rig({ hands: ["2s RG", "13s 99m", "22s 88m", "4s 77m"], wall: "1m 1m" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "2s"), NOW));
    expect(viewHand(after, 2).mine?.offer).toMatchObject({ pong: true });
    expect(viewHand(after, 3).mine?.offer).toBeNull();
    expect(viewHand(after, null).stage).toEqual({ kind: "claim", from: 0, tile: after.last!.tile, deadline: NOW + CLAIM_MS, rob: false });
    const answered = ok(answerClaim(after, 2, { kind: "pass" }, NOW));
    expect(viewHand(answered, 2).mine?.answered).toBe(true);
    const turn = viewHand(hand, 0);
    expect(turn.stage).toEqual({ kind: "turn", seat: 0, deadline: NOW + TURN_MS, claimed: false });
  });

  it("shows the result to everyone when the hand is over", () => {
    const hand = rig({ hands: ["1111p 23p RG", "1m", "2m", "3m"], wall: "" });
    const over = ok(discard(hand, 0, tileIn(hand, 0, "R"), NOW));
    expect(timeOut(over, NOW)).toEqual({ ok: false, reason: "The hand is over." });
    expect(deadlineOf(over)).toBeNull();
    expect(viewHand(over, null).stage).toEqual({ kind: "over", result: { kind: "draw" } });
    expect(viewHand(over, null).mine).toBeNull();
  });
});

describe("bots", () => {
  it("wins when it can", () => {
    const hand = rig({ hands: ["123p 456p 789p RRR 55p", "1m", "2m", "3m"] });
    expect(botTurn(hand, 0)).toEqual({ kind: "win" });
  });

  it("lets go of the tile that helps least", () => {
    const hand = rig({ hands: ["123p 456p 789p 234s 55s N", "1m", "2m", "3m"] });
    expect(kindOf(botDiscard(hand, 0))).toBe(kinds("N")[0]);
  });

  it("chases one suit when the hand leans that way", () => {
    const hand = rig({ hands: ["123p 456p 789p 23p 5p 9s 9m", "1m", "2m", "3m"] });
    expect(kinds("9s 9m")).toContain(kindOf(botDiscard(hand, 0)));
  });

  it("kongs when it costs nothing", () => {
    const hand = rig({ hands: ["1111p 234s 567s 99m E", "1m", "2m", "3m"], wall: "5m 5m" });
    expect(botTurn(hand, 0)).toEqual({ kind: "kong", tileKind: 0 });
  });

  it("claims a win, pongs a dragon and passes what doesn't help", () => {
    const winner = rig({ hands: ["1m", "123p 456p 789p RRR 5p", "1s", "1s"], wall: "1m" });
    expect(botAnswer(winner, 1, { hu: true, pong: false, kong: false, chows: [] }, 16)).toEqual({ kind: "hu" });
    const dragons = rig({ hands: ["1m", "GG 147p 258s 369m E", "1s", "1s"], wall: "1m" });
    expect(botAnswer(dragons, 1, { hu: false, pong: true, kong: false, chows: [] }, 128)).toEqual({ kind: "pong" });
    const nothing = rig({ hands: ["1m", "55m 147p 258s 369p E", "1s", "1s"], wall: "1m" });
    expect(botAnswer(nothing, 1, { hu: false, pong: true, kong: false, chows: [] }, 88)).toEqual({ kind: "pass" });
  });

  it("chows inside the suit it's chasing", () => {
    const hand = rig({ hands: ["1m", "13p 567p 89p 22p EE 5s", "1s", "1s"], wall: "1m" });
    const offer = { hu: false, pong: false, kong: false, chows: [[hand.seats[1].hand[0], hand.seats[1].hand[1]]] };
    expect(botAnswer(hand, 1, offer, 4)).toEqual({ kind: "chow", option: 0 });
  });

  it("knows when a bot has nothing to do", () => {
    const hand = rig({ hands: ["123p RG", "1m", "2m", "3m"], wall: "9m" });
    expect(botMove(hand, 1)).toBeNull();
    expect(applyMove(hand, 0, { kind: "win" }, NOW).ok).toBe(false);
    expect(applyMove(hand, 0, { kind: "kong", tileKind: 0 }, NOW).ok).toBe(false);
    expect(applyMove(hand, 0, { kind: "answer", answer: { kind: "pass" } }, NOW).ok).toBe(false);
  });

  it("plays whole hands to the end without stalling, keeping every tile", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = seeded(seed);
      let hand = ok(begin(newHand({ settings: { ...DEFAULT_SETTINGS, minFaan: seed % 3 === 0 ? 1 : 3 }, dealer: null, roundWind: 0, random, now: NOW }), NOW));
      let moves = 0;
      while (hand.stage.kind !== "over") {
        const next = playBots(hand, [true, true, true, true], NOW);
        expect(next.step !== hand.step || next.stage !== hand.stage).toBe(true);
        hand = next;
        moves++;
        expect(moves).toBeLessThan(400);
      }
      const tiles = [...hand.wall, ...hand.seats.flatMap((s) => [...s.hand, ...s.discards.filter((d) => !d.taken).map((d) => d.tile), ...s.melds.flatMap((m) => m.tiles)])];
      const won = hand.stage.result.kind === "win" ? hand.stage.result : null;
      // A robbed kong's tile leaves the robbed hand for the winner's.
      if (won && won.from !== null && !tiles.includes(won.tile)) tiles.push(won.tile);
      expect(new Set(tiles).size).toBe(TILE_COUNT);
      expect(countsOf(tiles).every((n) => n === 4)).toBe(true);
    }
  });

  it("waits for a human in a claim window", () => {
    const hand = rig({ hands: ["2s RG", "13s 99m", "22s 88m", "4s 77m"], wall: "1m 1m" });
    const after = ok(discard(hand, 0, tileIn(hand, 0, "2s"), NOW));
    const played = playBots(after, [false, false, true, false], NOW);
    expect(played.stage.kind).toBe("claim");
    expect(actors(played)).toEqual([1]);
    expect(playBots(hand, [false, false, false, false], NOW)).toBe(hand);
  });
});

it("counts helper hands", () => {
  expect(counts("11p")[0]).toBe(2);
});
