import { FAAN, type FaanId } from "../../../shared/mahjong/faan";
import { INTRO_MS, type Answer, type Offer } from "../../../shared/mahjong/game";
import { kindOf, tileName, WIND_CHARS, WIND_NAMES } from "../../../shared/mahjong/tiles";

/** Where a seat sits on screen for someone at `viewer`: you at the bottom, the next seat on your right. */
type Side = "bottom" | "right" | "top" | "left";
const SIDES: readonly Side[] = ["bottom", "right", "top", "left"];
export const sideOf = (seat: number, viewer: number): Side => SIDES[(seat - viewer + 4) % 4];
export const seatAt = (side: Side, viewer: number) => (viewer + SIDES.indexOf(side)) % 4;

export const roundWords = (roundWind: number) => `${WIND_NAMES[roundWind]} Round`;
export const windBadge = (wind: number) => WIND_CHARS[wind];
export const windWords = (wind: number) => `${WIND_NAMES[wind]} wind`;

/** One button of the claim bar, and the answer it sends. */
type ClaimChoice = { key: string; label: string; answer: Answer; tiles?: number[] };

/** The claim bar's buttons for an offer, Hu first, one Chow per way to make it, Pass last. */
export const claimChoices = (offer: Offer, tile: number): ClaimChoice[] => {
  const choices: ClaimChoice[] = [];
  if (offer.hu) choices.push({ key: "hu", label: "Hu", answer: { kind: "hu" } });
  if (offer.kong) choices.push({ key: "kong", label: "Kong", answer: { kind: "kong" } });
  if (offer.pong) choices.push({ key: "pong", label: "Pong", answer: { kind: "pong" } });
  offer.chows.forEach((used, option) => {
    choices.push({ key: `chow-${option}`, label: "Chow", answer: { kind: "chow", option }, tiles: [...used, tile].sort((a, b) => kindOf(a) - kindOf(b)) });
  });
  choices.push({ key: "pass", label: "Pass", answer: { kind: "pass" } });
  return choices;
};

export const faanLine = (id: string) => (Object.hasOwn(FAAN, id) ? FAAN[id as FaanId] : { zh: "", en: id, faan: 0 });

export const coinsWords = (delta: number) => (delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "0");

/** The title of the round's breakdown. */
export const resultTitle = (result: { kind: "draw" } | { kind: "win"; winner: number; from: number | null }, names: readonly string[], viewer: number | null) => {
  if (result.kind === "draw") return "Drawn hand";
  const who = result.winner === viewer ? "You win" : `${names[result.winner]} wins`;
  return result.from === null ? `${who}, self-drawn` : `${who} off ${result.from === viewer ? "your" : `${names[result.from]}'s`} discard`;
};

export const tileLabel = (tile: number) => (tile < 0 ? "Face down" : tileName(kindOf(tile)));

export const secondsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));

/** When each part of the intro plays, in ms from the start of the hand. */
export const INTRO = { diceLand: 1300, wall: 1800, split: 2300, deal: 2700, dealt: 4500 } as const;

/** How far into the intro a hand is, never before its start (a phone's clock can run behind the server's). */
export const introElapsed = (until: number, now: number) => Math.min(INTRO_MS, Math.max(0, INTRO_MS - (until - now)));

/** The face a tumbling die shows: always 1 to 6. */
export const tumblingFace = (value: number, elapsed: number, index: number) => ((((value - 1 + Math.floor(elapsed / 120) + index) % 6) + 6) % 6) + 1;

/** How many of your tiles are dealt so far: four at a time to each seat, then one more. */
export const dealtCount = (elapsed: number, total: number, calm: boolean) => {
  if (calm || elapsed >= INTRO.dealt) return total;
  if (elapsed < INTRO.deal) return 0;
  const rounds = Math.floor(((elapsed - INTRO.deal) / (INTRO.dealt - INTRO.deal)) * 4) + 1;
  return Math.min(total, rounds * 4);
};


const HONOUR_INDEX = ["E", "S", "W", "N", "C", "F", "P"] as const;

export const tileIndex = (kind: number) => (kind < 27 ? String((kind % 9) + 1) : HONOUR_INDEX[kind - 27]);

export const handRows = (tiles: readonly number[], drawn: number | null, twoRows: boolean): number[][] => {
  if (!twoRows) return [[...tiles]];
  const held = tiles.filter((t) => t !== drawn);
  const top = Math.ceil(held.length / 2);
  const bottom = [...held.slice(top), ...(drawn !== null && tiles.includes(drawn) ? [drawn] : [])];
  return [held.slice(0, top), bottom];
};
