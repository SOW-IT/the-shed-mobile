import { cappedFaan, scoreWin, type FaanLine, type MeldShape, type Scored } from "./faan";
import { isComplete } from "./hand";
import { claimMsOf, turnMsOf, type Settings } from "./table";
import { allTiles, countsOf, isSuited, kindOf, shuffled, sortTiles, suitOf } from "./tiles";

/**
 * One hand of Hong Kong mahjong, as pure functions over a plain object the
 * server keeps. Seats are 0–3 in turn order (East, South, West, North as
 * laid out at the table); play passes 0 → 1 → 2 → 3, so each seat's
 * left-hand neighbour, whose discards it can chow, is the seat before it.
 *
 * The stages: intro (dice, wall split and deal, timed for the animation),
 * turn (the seat to act holds 14), claim (a discard someone can take, or a
 * promoted kong someone can rob), and over.
 */

const SEATS = 4;
export const INTRO_MS = 5200;
export const TURN_MS = 30_000;


type Meld = { type: "chow" | "pong" | "kong"; kind: number; tiles: number[]; concealed?: boolean; from?: number; claimed?: number };
export type Discard = { tile: number; taken?: boolean };
export type SeatHand = { hand: number[]; melds: Meld[]; discards: Discard[]; turns: number };

/** What someone can do with a discard. A chow is the two tiles from their hand it uses. */
export type Offer = { hu: boolean; pong: boolean; kong: boolean; chows: number[][] };
export type Answer = { kind: "pass" } | { kind: "hu" } | { kind: "pong" } | { kind: "kong" } | { kind: "chow"; option: number };

export type Pay = { from: number; to: number; points: number };
export type Result =
  | { kind: "win"; winner: number; from: number | null; tile: number; lines: FaanLine[]; faan: number; points: number; pays: Pay[]; hand: number[]; robbed?: boolean }
  | { kind: "draw" };

export type Stage =
  | { kind: "intro"; until: number }
  | { kind: "turn"; seat: number; drawn: number | null; deadline: number; replacement: boolean; claimed: boolean }
  | { kind: "claim"; from: number; tile: number; deadline: number; rob: boolean; offers: (Offer | null)[]; answers: (Answer | null)[] }
  | { kind: "over"; result: Result };

export type EventKind = "deal" | "draw" | "discard" | "chow" | "pong" | "kong" | "hu" | "drawn";
export type GameEvent = { kind: EventKind; seat: number; tile?: number; step: number };

export type Hand = {
  step: number;
  wall: number[];
  seats: SeatHand[];
  dealer: number;
  roundWind: number;
  dice: number[];
  /** Where the wall was broken: the stack count from the dealer's side, for the animation. */
  breakAt: number;
  settings: Settings;
  stage: Stage;
  last: GameEvent | null;
  calls: number;
};

type Fail = { ok: false; reason: string };
export type Step = { ok: true; hand: Hand } | Fail;
const fail = (reason: string): Fail => ({ ok: false, reason });

export const seatWindOf = (hand: Pick<Hand, "dealer">, seat: number) => (seat - hand.dealer + SEATS) % SEATS;
const nextSeat = (seat: number) => (seat + 1) % SEATS;

/** Points for a faan count: the Hong Kong "half-spicy" table, doubling to 4 faan, then half-steps. */
const POINTS = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384] as const;
export const pointsFor = (faan: number) => POINTS[Math.max(0, Math.min(POINTS.length - 1, faan))];

/** Who pays whom: off a discard the discarder pays it all; self-drawn, each other seat pays half (rounded up). */
export const paysFor = (winner: number, from: number | null, points: number): Pay[] =>
  from === null
    ? [1, 2, 3].map((d) => ({ from: (winner + d) % SEATS, to: winner, points: Math.ceil(points / 2) }))
    : [{ from, to: winner, points }];

const rollDie = (random: () => number) => Math.min(6, 1 + Math.floor(random() * 6));

const stamp = (hand: Hand, event: Omit<GameEvent, "step">): Hand => {
  const step = hand.step + 1;
  return { ...hand, step, last: { ...event, step } };
};

const withSeat = (hand: Hand, seat: number, change: (s: SeatHand) => SeatHand): Hand => ({
  ...hand,
  seats: hand.seats.map((s, i) => (i === seat ? change(s) : s)),
});

const drawInto = (hand: Hand, seat: number, fromBack: boolean): { hand: Hand; tile: number } | null => {
  const wall = [...hand.wall];
  const tile = fromBack ? wall.pop() : wall.shift();
  if (tile === undefined) return null;
  return { hand: withSeat({ ...hand, wall }, seat, (s) => ({ ...s, hand: [...s.hand, tile] })), tile };
};

const meldShapes = (melds: readonly Meld[]): MeldShape[] => melds.map((m) => ({ type: m.type, kind: m.kind, concealed: m.concealed }));

const over = (hand: Hand, result: Result, event: Omit<GameEvent, "step">): Hand => ({ ...stamp(hand, event), stage: { kind: "over", result } });

const drawnGame = (hand: Hand) => over(hand, { kind: "draw" }, { kind: "drawn", seat: hand.dealer });

/** A new hand: dice, the wall broken where they say, and 13 tiles each (14 for the dealer), flowers replaced. */
export const newHand = ({
  settings,
  dealer,
  roundWind,
  random,
  now,
}: {
  settings: Settings;
  /** Null for the table's first hand: the dice pick the dealer. */
  dealer: number | null;
  roundWind: number;
  random: () => number;
  now: number;
}): Hand => {
  const dice = [rollDie(random), rollDie(random), rollDie(random)];
  const total = dice[0] + dice[1] + dice[2];
  const first = dealer ?? (total - 1) % SEATS;
  const wall = shuffled(allTiles(), random);
  const seats: SeatHand[] = Array.from({ length: SEATS }, () => ({ hand: [], melds: [], discards: [], turns: 0 }));
  const order = [0, 1, 2, 3].map((d) => (first + d) % SEATS);
  for (let round = 0; round < 3; round++) for (const seat of order) seats[seat].hand.push(...wall.splice(0, 4));
  for (const seat of order) seats[seat].hand.push(wall.shift()!);
  seats[first].hand.push(wall.shift()!);
  for (const seat of order) seats[seat].hand = sortTiles(seats[seat].hand);
  return {
    step: 0,
    wall,
    seats,
    dealer: first,
    roundWind,
    dice,
    breakAt: total,
    settings,
    stage: { kind: "intro", until: now + INTRO_MS },
    last: { kind: "deal", seat: first, step: 0 },
    calls: 0,
  };
};

/** The dice and deal have played: the dealer's turn, holding 14. */
export const begin = (hand: Hand, now: number): Step => {
  if (hand.stage.kind !== "intro") return fail("The hand has started.");
  return { ok: true, hand: { ...hand, stage: { kind: "turn", seat: hand.dealer, drawn: null, deadline: now + turnMsOf(hand.settings), replacement: false, claimed: false } } };
};

const turnFor = (hand: Hand, seat: number, now: number): Hand => {
  const drawn = drawInto(hand, seat, false);
  if (!drawn) return drawnGame(hand);
  const next = stamp(drawn.hand, { kind: "draw", seat, tile: drawn.tile });
  return { ...next, stage: { kind: "turn", seat, drawn: drawn.tile, deadline: now + turnMsOf(hand.settings), replacement: false, claimed: false } };
};

const replacementFor = (hand: Hand, seat: number, now: number, event: Omit<GameEvent, "step">): Hand => {
  const stamped = stamp(hand, event);
  const drawn = drawInto(stamped, seat, true);
  if (!drawn) return drawnGame(stamped);
  return { ...drawn.hand, stage: { kind: "turn", seat, drawn: drawn.tile, deadline: now + turnMsOf(hand.settings), replacement: true, claimed: false } };
};

type WinFlags = { selfDrawn: boolean; kongWin?: boolean; lastTile?: boolean; robbedKong?: boolean; heavenly?: boolean; earthly?: boolean };

/** What a seat's hand scores with `tiles` as its concealed tiles, or null when it isn't a win. */
const scoreFor = (hand: Hand, seat: number, tiles: readonly number[], winTile: number, flags: WinFlags): Scored | null => {
  const s = hand.seats[seat];
  const counts = countsOf(tiles);
  if (!isComplete(counts, s.melds.length)) return null;
  return scoreWin({
    counts,
    melds: meldShapes(s.melds),
    winKind: kindOf(winTile),
    seatWind: seatWindOf(hand, seat),
    roundWind: hand.roundWind,
    ...flags,
  });
};

const enough = (hand: Hand, scored: Scored | null): scored is Scored => scored !== null && cappedFaan(scored, hand.settings.maxFaan) >= hand.settings.minFaan;

const selfFlags = (hand: Hand, seat: number, stage: Extract<Stage, { kind: "turn" }>): WinFlags => {
  const untouched = hand.calls === 0 && hand.seats[seat].turns === 0;
  return {
    selfDrawn: true,
    kongWin: stage.replacement,
    lastTile: hand.wall.length === 0,
    heavenly: untouched && seat === hand.dealer && stage.drawn === null,
    earthly: untouched && seat !== hand.dealer,
  };
};

const turnOf = (hand: Hand, seat: number) => (hand.stage.kind === "turn" && hand.stage.seat === seat ? hand.stage : null);

type TurnOptions = { win: Scored | null; kongs: number[] };

/** What the seat whose turn it is can do besides discarding. */
export const turnOptions = (hand: Hand, seat: number): TurnOptions => {
  const stage = turnOf(hand, seat);
  if (!stage || stage.claimed) return { win: null, kongs: [] };
  const s = hand.seats[seat];
  const winTile = stage.drawn ?? s.hand[s.hand.length - 1];
  const scored = scoreFor(hand, seat, s.hand, winTile, selfFlags(hand, seat, stage));
  const counts = countsOf(s.hand);
  const kongs = hand.wall.length === 0 ? [] : counts.flatMap((n, kind) => (n === 4 || (n > 0 && s.melds.some((m) => m.type === "pong" && m.kind === kind)) ? [kind] : []));
  return { win: enough(hand, scored) ? scored : null, kongs };
};

const winResult = (hand: Hand, winner: number, from: number | null, tile: number, scored: Scored, tiles: number[]): Result => {
  const faan = cappedFaan(scored, hand.settings.maxFaan);
  const points = pointsFor(faan);
  return { kind: "win", winner, from, tile, lines: scored.lines, faan, points, pays: paysFor(winner, from, points), hand: sortTiles(tiles) };
};

export const selfWin = (hand: Hand, seat: number): Step => {
  const stage = turnOf(hand, seat);
  if (!stage) return fail("It's not your turn.");
  const { win } = turnOptions(hand, seat);
  if (!win) return fail(`That hand isn't worth ${hand.settings.minFaan} faan.`);
  const tiles = hand.seats[seat].hand;
  const tile = stage.drawn ?? tiles[tiles.length - 1];
  return { ok: true, hand: over(hand, winResult(hand, seat, null, tile, win, tiles), { kind: "hu", seat, tile }) };
};

const discardOffers = (hand: Hand, from: number, tile: number, rob: boolean): (Offer | null)[] => {
  const kind = kindOf(tile);
  const lastDiscard = hand.wall.length === 0;
  return hand.seats.map((s, seat) => {
    if (seat === from) return null;
    const scored = scoreFor(hand, seat, [...s.hand, tile], tile, {
      selfDrawn: false,
      robbedKong: rob,
      earthly: !rob && hand.calls === 0 && s.turns === 0 && from === hand.dealer && hand.seats[from].turns === 1,
    });
    const hu = enough(hand, scored);
    const same = s.hand.filter((t) => kindOf(t) === kind);
    const pong = !rob && !lastDiscard && same.length >= 2;
    const kong = !rob && !lastDiscard && same.length >= 3;
    const chows: number[][] = [];
    if (!rob && !lastDiscard && seat === nextSeat(from) && isSuited(kind)) {
      const pick = (k: number) => (k >= 0 && k < 27 && suitOf(k) === suitOf(kind) ? s.hand.find((t) => kindOf(t) === k) : undefined);
      for (const [a, b] of [
        [kind - 2, kind - 1],
        [kind - 1, kind + 1],
        [kind + 1, kind + 2],
      ]) {
        const ta = pick(a);
        const tb = pick(b);
        if (ta !== undefined && tb !== undefined) chows.push([ta, tb]);
      }
    }
    return hu || pong || kong || chows.length > 0 ? { hu, pong, kong, chows } : null;
  });
};

const openClaims = (hand: Hand, from: number, tile: number, rob: boolean, now: number): Hand | null => {
  const offers = discardOffers(hand, from, tile, rob);
  if (offers.every((o) => o === null)) return null;
  return { ...hand, stage: { kind: "claim", from, tile, deadline: now + claimMsOf(hand.settings), rob, offers, answers: offers.map(() => null) } };
};

export const discard = (hand: Hand, seat: number, tile: number, now: number): Step => {
  if (!turnOf(hand, seat)) return fail("It's not your turn.");
  const s = hand.seats[seat];
  if (!s.hand.includes(tile)) return fail("That tile isn't in your hand.");
  const after = stamp(
    withSeat(hand, seat, (x) => ({ ...x, hand: sortTiles(x.hand.filter((t) => t !== tile)), discards: [...x.discards, { tile }], turns: x.turns + 1 })),
    { kind: "discard", seat, tile }
  );
  return { ok: true, hand: openClaims(after, seat, tile, false, now) ?? turnFor(after, nextSeat(seat), now) };
};

const promote = (hand: Hand, seat: number, tile: number, now: number): Hand => {
  const kind = kindOf(tile);
  const changed = withSeat(hand, seat, (s) => ({
    ...s,
    hand: s.hand.filter((t) => t !== tile),
    melds: s.melds.map((m) => (m.type === "pong" && m.kind === kind ? { ...m, type: "kong" as const, tiles: [...m.tiles, tile] } : m)),
  }));
  return replacementFor(changed, seat, now, { kind: "kong", seat, tile });
};

/** A concealed kong (four in hand) or a promoted kong (the fourth onto a pong), then a tile from the back. */
export const declareKong = (hand: Hand, seat: number, kind: number, now: number): Step => {
  if (!turnOf(hand, seat)) return fail("It's not your turn.");
  if (!turnOptions(hand, seat).kongs.includes(kind)) return fail("You can't kong that.");
  const s = hand.seats[seat];
  const tiles = s.hand.filter((t) => kindOf(t) === kind);
  if (tiles.length === 4) {
    const changed = withSeat({ ...hand, calls: hand.calls + 1 }, seat, (x) => ({
      ...x,
      hand: x.hand.filter((t) => kindOf(t) !== kind),
      melds: [...x.melds, { type: "kong", kind, tiles, concealed: true }],
    }));
    return { ok: true, hand: replacementFor(changed, seat, now, { kind: "kong", seat }) };
  }
  const tile = tiles[0];
  const robbing = openClaims(stamp(hand, { kind: "kong", seat, tile }), seat, tile, true, now);
  return { ok: true, hand: robbing ?? promote(hand, seat, tile, now) };
};

const takeDiscard = (hand: Hand, from: number): Hand =>
  withSeat(hand, from, (s) => ({ ...s, discards: s.discards.map((d, i) => (i === s.discards.length - 1 ? { ...d, taken: true } : d)) }));

const claimMeld = (hand: Hand, seat: number, from: number, tile: number, used: number[], type: Meld["type"]): Hand => {
  const kinds = [...used, tile].map(kindOf);
  const meld: Meld = { type, kind: Math.min(...kinds), tiles: sortTiles([...used, tile]), from, claimed: tile };
  return withSeat(takeDiscard({ ...hand, calls: hand.calls + 1 }, from), seat, (s) => ({ ...s, hand: s.hand.filter((t) => !used.includes(t)), melds: [...s.melds, meld] }));
};

/** Settles a claim window: Hu first (the first winner after the discarder), then a pong or kong, then a chow. */
export const resolveClaims = (hand: Hand, now: number): Step => {
  const stage = hand.stage;
  if (stage.kind !== "claim") return fail("There's nothing to claim.");
  const { from, tile, answers } = stage;
  const order = [1, 2, 3].map((d) => (from + d) % SEATS);
  const winner = order.find((seat) => answers[seat]?.kind === "hu");
  if (winner !== undefined) {
    const s = hand.seats[winner];
    const tiles = [...s.hand, tile];
    const scored = scoreFor(hand, winner, tiles, tile, {
      selfDrawn: false,
      robbedKong: stage.rob,
      earthly: !stage.rob && hand.calls === 0 && s.turns === 0 && from === hand.dealer && hand.seats[from].turns === 1,
    })!;
    const won = stage.rob ? withSeat(hand, from, (x) => ({ ...x, hand: x.hand.filter((t) => t !== tile) })) : takeDiscard(hand, from);
    const result = winResult(hand, winner, from, tile, scored, tiles);
    return { ok: true, hand: over(won, stage.rob && result.kind === "win" ? { ...result, robbed: true } : result, { kind: "hu", seat: winner, tile }) };
  }
  if (stage.rob) return { ok: true, hand: promote({ ...hand, stage: { kind: "turn", seat: from, drawn: null, deadline: now, replacement: false, claimed: false } }, from, tile, now) };
  const kind = kindOf(tile);
  const big = order.find((seat) => answers[seat]?.kind === "pong" || answers[seat]?.kind === "kong");
  if (big !== undefined) {
    const isKong = answers[big]?.kind === "kong";
    const used = hand.seats[big].hand.filter((t) => kindOf(t) === kind).slice(0, isKong ? 3 : 2);
    const claimed = claimMeld(hand, big, from, tile, used, isKong ? "kong" : "pong");
    if (isKong) return { ok: true, hand: replacementFor(claimed, big, now, { kind: "kong", seat: big, tile }) };
    const next = stamp(claimed, { kind: "pong", seat: big, tile });
    return { ok: true, hand: { ...next, stage: { kind: "turn", seat: big, drawn: null, deadline: now + turnMsOf(hand.settings), replacement: false, claimed: true } } };
  }
  const chower = order.find((seat) => answers[seat]?.kind === "chow");
  if (chower !== undefined) {
    const answer = answers[chower] as Extract<Answer, { kind: "chow" }>;
    const used = stage.offers[chower]!.chows[answer.option];
    const next = stamp(claimMeld(hand, chower, from, tile, used, "chow"), { kind: "chow", seat: chower, tile });
    return { ok: true, hand: { ...next, stage: { kind: "turn", seat: chower, drawn: null, deadline: now + turnMsOf(hand.settings), replacement: false, claimed: true } } };
  }
  return { ok: true, hand: turnFor({ ...hand, stage: { ...stage } }, nextSeat(from), now) };
};

const allowed = (offer: Offer, answer: Answer) => {
  if (answer.kind === "pass") return true;
  if (answer.kind === "chow") return Number.isInteger(answer.option) && answer.option >= 0 && answer.option < offer.chows.length;
  return offer[answer.kind];
};

/** A seat's answer to a claim window; the window settles once everyone who could claim has answered. */
export const answerClaim = (hand: Hand, seat: number, answer: Answer, now: number): Step => {
  const stage = hand.stage;
  if (stage.kind !== "claim") return fail("That tile's gone.");
  const offer = stage.offers[seat];
  if (!offer) return fail("You can't claim that.");
  if (stage.answers[seat] !== null) return fail("You've answered.");
  if (!allowed(offer, answer)) return fail("You can't claim that.");
  const answers = stage.answers.map((a, i) => (i === seat ? answer : a));
  const next: Hand = { ...hand, stage: { ...stage, answers } };
  const waiting = stage.offers.some((o, i) => o !== null && answers[i] === null);
  return waiting ? { ok: true, hand: next } : resolveClaims(next, now);
};

/** Seats that have to act now: whose turn it is, or who can still answer a claim. */
export const actors = (hand: Hand): number[] => {
  const stage = hand.stage;
  if (stage.kind === "turn") return [stage.seat];
  if (stage.kind === "claim") return stage.offers.flatMap((o, i) => (o !== null && stage.answers[i] === null ? [i] : []));
  return [];
};

export const deadlineOf = (hand: Hand) => (hand.stage.kind === "intro" ? hand.stage.until : hand.stage.kind === "over" ? null : hand.stage.deadline);

/** The clock ran out: the intro ends, a turn discards its drawn tile (or the last in hand), and unanswered claims pass. */
export const timeOut = (hand: Hand, now: number): Step => {
  const stage = hand.stage;
  if (stage.kind === "intro") return begin(hand, now);
  if (stage.kind === "turn") {
    const tiles = hand.seats[stage.seat].hand;
    return discard(hand, stage.seat, stage.drawn ?? tiles[tiles.length - 1], now);
  }
  if (stage.kind === "claim") return resolveClaims({ ...hand, stage: { ...stage, answers: stage.answers.map((a, i) => a ?? (stage.offers[i] ? { kind: "pass" } : null)) } }, now);
  return fail("The hand is over.");
};

/** Who deals next, and in which round: the dealer stays after winning or a drawn hand. */
export const nextDealer = (dealer: number, result: Result, firstDealer: number, roundWind: number) => {
  if (result.kind === "win" && result.winner === dealer) return { dealer, roundWind };
  const next = nextSeat(dealer);
  return { dealer: next, roundWind: next === firstDealer ? (roundWind + 1) % SEATS : roundWind };
};
