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

/** The hand tiles a claim would use, to light them up: two for a pong, three for a kong, the chow's other two; none to win or pass. */
export const claimUses = (choice: ClaimChoice, hand: readonly number[], tile: number): number[] => {
  const kind = choice.answer.kind;
  if (kind === "pong" || kind === "kong") return hand.filter((t) => kindOf(t) === kindOf(tile)).slice(0, kind === "pong" ? 2 : 3);
  if (kind === "chow") return (choice.tiles ?? []).filter((t) => t !== tile);
  return [];
};

/** The claim lit before you pick one: a pong or kong, else the first chow. */
export const firstClaim = (choices: readonly ClaimChoice[]) => choices.find((c) => c.answer.kind === "pong" || c.answer.kind === "kong") ?? choices.find((c) => c.answer.kind === "chow") ?? null;

export const faanLine = (id: string) => (Object.hasOwn(FAAN, id) ? FAAN[id as FaanId] : { zh: "", en: id, faan: 0 });

export const coinsWords = (delta: number) => (delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "0");

/** The title of the round's breakdown. */
export const resultTitle = (result: { kind: "draw" } | { kind: "win"; winner: number; from: number | null; robbed?: boolean }, names: readonly string[], viewer: number | null) => {
  if (result.kind === "draw") return "Drawn hand";
  const who = result.winner === viewer ? "You win" : `${names[result.winner]} wins`;
  if (result.from === null) return `${who}, self-drawn`;
  const whose = result.from === viewer ? "your" : `${names[result.from]}'s`;
  return result.robbed ? `${who}, robbing ${whose} kong` : `${who} off ${whose} discard`;
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

export const leaveQuestion = (stage: string, seated: boolean, forCoins: boolean, cost: number) => {
  if (!seated || stage === "over") return null;
  const bot = forCoins ? "A bot plays your seat for the rest of this hand." : "A bot plays your seat until you sit back down.";
  const coins = !forCoins ? null : cost > 0 ? `You'll lose ${cost} SOW coin${cost === 1 ? "" : "s"}, shared between the other players.` : "You won't lose any SOW coins.";
  return { title: forCoins ? "Give up this hand?" : "Leave the table?", lines: coins ? [bot, coins] : [bot], leave: forCoins && cost > 0 ? `Give up (−${cost})` : "Leave" };
};

/** The seats the host would start without: people (not bots, not the host) who haven't said they're ready. */
export const lobbyWaiting = (seats: readonly { kind: string; ready: boolean }[], hostSeat: number) => seats.flatMap((s, i) => (s.kind === "human" && i !== hostSeat && !s.ready ? [i] : []));

/** A host's "take them off?" question, which stands only while that same person is still in that seat and no countdown is running. */
type Removal = { seat: number; member: string | null; name: string };
export const removalStands = (removing: Removal | null, seats: readonly { kind: string; isMe: boolean; member: string | null; name: string }[], isHost: boolean, counting: boolean) => {
  const seat = removing && seats[removing.seat];
  return removing !== null && seat !== null && seat !== undefined && isHost && !counting && seat.kind === "human" && !seat.isMe && seat.member === removing.member && seat.name === removing.name;
};

export const zoomShown = (zoomed: number | null, stage: string) => (stage === "over" ? null : zoomed);
