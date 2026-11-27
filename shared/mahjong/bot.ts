import { seatWindOf, turnOptions, type Answer, type Hand, type Offer } from "./game";
import { shanten } from "./hand";
import { countsOf, isDragon, isHonour, isSuited, kindOf, KINDS, suitOf, windKind, type Suit } from "./tiles";

/**
 * The bots: tile efficiency (shanten, then how many unseen tiles help),
 * bent toward hands that reach the faan minimum (one suit, value pongs,
 * all pongs). They always answer at once, so they never hold up the clock.
 */

type BotMove = { kind: "discard"; tile: number } | { kind: "win" } | { kind: "kong"; tileKind: number };

/** Every tile anyone can see: discards, melds and flowers, and the bot's own hand. */
const seenCounts = (hand: Hand, seat: number) => {
  const seen = countsOf(hand.seats[seat].hand);
  for (const [i, s] of hand.seats.entries()) {
    for (const d of s.discards) if (!d.taken) seen[kindOf(d.tile)]++;
    for (const m of s.melds) if (i === seat || !m.concealed) for (const t of m.tiles) seen[kindOf(t)]++;
  }
  return seen;
};

const valueKinds = (hand: Hand, seat: number) => new Set([31, 32, 33, windKind(seatWindOf(hand, seat)), windKind(hand.roundWind)]);

/** The suit worth chasing for a one-suit hand, when the hand leans that way. */
const flushSuit = (hand: Hand, seat: number): Suit | null => {
  const s = hand.seats[seat];
  const kinds = [...s.hand.map(kindOf), ...s.melds.flatMap((m) => m.tiles.map(kindOf))];
  const bySuit = [0, 0, 0];
  for (const k of kinds) if (isSuited(k)) bySuit[suitOf(k)]++;
  const honours = kinds.filter(isHonour).length;
  const best = bySuit.indexOf(Math.max(...bySuit)) as Suit;
  const meldSuits = new Set(s.melds.filter((m) => isSuited(m.kind)).map((m) => suitOf(m.kind)));
  if (meldSuits.size > 1 || (meldSuits.size === 1 && !meldSuits.has(best))) return null;
  return bySuit[best] + honours >= 9 ? best : null;
};

/** How much a bot wants to keep a kind, beyond efficiency. */
const keepWeight = (hand: Hand, seat: number, kind: number, counts: readonly number[], flush: Suit | null) => {
  let weight = 0;
  const values = valueKinds(hand, seat);
  if (values.has(kind)) weight += counts[kind] >= 2 ? 6 : 1;
  if (isHonour(kind) && !values.has(kind) && counts[kind] === 1) weight -= 2;
  if (flush !== null) weight += isSuited(kind) && suitOf(kind) !== flush ? -8 : 3;
  return weight;
};

const ukeire = (counts: number[], melds: number, seen: readonly number[], now: number) => {
  let useful = 0;
  for (let kind = 0; kind < KINDS; kind++) {
    const left = 4 - seen[kind];
    if (left <= 0) continue;
    counts[kind]++;
    if (shanten(counts, melds) < now) useful += left;
    counts[kind]--;
  }
  return useful;
};

/** The tile a bot lets go of. */
export const botDiscard = (hand: Hand, seat: number): number => {
  const s = hand.seats[seat];
  const counts = countsOf(s.hand);
  const seen = seenCounts(hand, seat);
  const flush = flushSuit(hand, seat);
  const melds = s.melds.length;
  let best: { tile: number; score: number } | null = null;
  const tried = new Set<number>();
  for (const tile of s.hand) {
    const kind = kindOf(tile);
    if (tried.has(kind)) continue;
    tried.add(kind);
    counts[kind]--;
    const after = shanten(counts, melds);
    const score = -after * 1000 + ukeire(counts, melds, seen, after) - keepWeight(hand, seat, kind, counts, flush) * 4 * (counts[kind] + 1);
    counts[kind]++;
    if (!best || score > best.score) best = { tile, score };
  }
  return best!.tile;
};

/** A bot's turn: win when it can, kong when it costs nothing, else discard. */
export const botTurn = (hand: Hand, seat: number): BotMove => {
  const options = turnOptions(hand, seat);
  if (options.win) return { kind: "win" };
  const s = hand.seats[seat];
  const counts = countsOf(s.hand);
  const before = shanten(counts, s.melds.length);
  for (const kind of options.kongs) {
    const promoted = counts[kind] === 1;
    counts[kind] -= promoted ? 1 : 4;
    const after = shanten(counts, s.melds.length + (promoted ? 0 : 1));
    counts[kind] += promoted ? 1 : 4;
    if (after <= before) return { kind: "kong", tileKind: kind };
  }
  return { kind: "discard", tile: botDiscard(hand, seat) };
};

/** A bot's answer to a discard it could claim. */
export const botAnswer = (hand: Hand, seat: number, offer: Offer, tile: number): Answer => {
  if (offer.hu) return { kind: "hu" };
  const s = hand.seats[seat];
  const kind = kindOf(tile);
  const counts = countsOf(s.hand);
  const melds = s.melds.length;
  const before = shanten(counts, melds);
  const flush = flushSuit(hand, seat);
  const fits = flush === null ? valueKinds(hand, seat).has(kind) || isDragon(kind) : !isSuited(kind) || suitOf(kind) === flush;
  const pairs = counts.filter((n) => n >= 2).length;
  if (offer.pong) {
    counts[kind] -= 2;
    // After a pong it discards: the best it can do is the shanten with one tile fewer.
    const after = bestAfterDiscard(counts, melds + 1);
    counts[kind] += 2;
    if (offer.kong && fits) return { kind: "kong" };
    if (after < before && (fits || pairs >= 4)) return { kind: "pong" };
  }
  if (offer.chows.length > 0 && flush !== null && isSuited(kind) && suitOf(kind) === flush) {
    let pick: { option: number; after: number } | null = null;
    offer.chows.forEach((used, option) => {
      for (const t of used) counts[kindOf(t)]--;
      const after = bestAfterDiscard(counts, melds + 1);
      for (const t of used) counts[kindOf(t)]++;
      if (after < before && (!pick || after < pick.after)) pick = { option, after };
    });
    const chosen = pick as { option: number; after: number } | null;
    if (chosen) return { kind: "chow", option: chosen.option };
  }
  return { kind: "pass" };
};

const bestAfterDiscard = (counts: number[], melds: number) => {
  let best = 8;
  for (let kind = 0; kind < KINDS; kind++) {
    if (counts[kind] === 0) continue;
    counts[kind]--;
    best = Math.min(best, shanten(counts, melds));
    counts[kind]++;
  }
  return best;
};
