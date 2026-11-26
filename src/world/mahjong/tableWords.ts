import { FAAN, type FaanId } from "../../../shared/mahjong/faan";
import type { Answer, Offer } from "../../../shared/mahjong/game";
import { kindOf, tileName, WIND_CHARS, WIND_NAMES } from "../../../shared/mahjong/tiles";

/** Where a seat sits on screen for someone at `viewer`: you at the bottom, the next seat on your right. */
export type Side = "bottom" | "right" | "top" | "left";
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
