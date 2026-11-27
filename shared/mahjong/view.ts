import { seatWindOf, turnOptions, type Discard, type GameEvent, type Hand, type Offer, type Result } from "./game";

/**
 * What one person may see of a hand: their own concealed tiles and options,
 * and for everyone the melds, flowers, discards and tile counts. A watcher
 * (seat null) sees no concealed tiles at all, and nobody sees the wall.
 * A concealed kong shows as four backs (-1) to everyone but its owner until
 * the hand is over.
 */

export const HIDDEN = -1;

export type MeldView = { type: "chow" | "pong" | "kong"; tiles: number[]; concealed: boolean; from: number | null; claimed: number | null };
export type SeatView = { wind: number; concealed: number; hand: number[] | null; melds: MeldView[]; discards: Discard[] };
export type StageView =
  | { kind: "intro"; until: number }
  | { kind: "turn"; seat: number; deadline: number; claimed: boolean }
  | { kind: "claim"; from: number; tile: number; deadline: number; rob: boolean }
  | { kind: "over"; result: Result };
export type MineView = {
  drawn: number | null;
  win: { faan: number } | null;
  kongs: number[];
  offer: Offer | null;
  answered: boolean;
};
export type HandView = {
  step: number;
  dealer: number;
  roundWind: number;
  dice: number[];
  breakAt: number;
  wallLeft: number;
  seats: SeatView[];
  stage: StageView;
  last: GameEvent | null;
  mine: MineView | null;
};

const stageView = (hand: Hand): StageView => {
  const stage = hand.stage;
  if (stage.kind === "intro") return { kind: "intro", until: stage.until };
  if (stage.kind === "turn") return { kind: "turn", seat: stage.seat, deadline: stage.deadline, claimed: stage.claimed };
  if (stage.kind === "over") return { kind: "over", result: stage.result };
  // Who could claim stays hidden: it would tell everyone what they hold.
  return { kind: "claim", from: stage.from, tile: stage.tile, deadline: stage.deadline, rob: stage.rob };
};

const mineView = (hand: Hand, seat: number): MineView => {
  const stage = hand.stage;
  const options = turnOptions(hand, seat);
  const turn = stage.kind === "turn" && stage.seat === seat;
  return {
    drawn: turn ? stage.drawn : null,
    win: options.win ? { faan: Math.min(options.win.limit ? hand.settings.maxFaan : options.win.total, hand.settings.maxFaan) } : null,
    kongs: options.kongs,
    offer: stage.kind === "claim" ? stage.offers[seat] : null,
    answered: stage.kind === "claim" && stage.answers[seat] !== null,
  };
};

export const viewHand = (hand: Hand, viewer: number | null): HandView => {
  const ended = hand.stage.kind === "over";
  const last = hand.last && hand.last.kind === "draw" && hand.last.seat !== viewer ? { ...hand.last, tile: undefined } : hand.last;
  return {
    step: hand.step,
    dealer: hand.dealer,
    roundWind: hand.roundWind,
    dice: hand.dice,
    breakAt: hand.breakAt,
    wallLeft: hand.wall.length,
    seats: hand.seats.map((s, seat) => ({
      wind: seatWindOf(hand, seat),
      concealed: s.hand.length,
      hand: seat === viewer ? s.hand : null,
      melds: s.melds.map((m) => ({
        type: m.type,
        tiles: m.concealed && seat !== viewer && !ended ? m.tiles.map(() => HIDDEN) : m.tiles,
        concealed: m.concealed === true,
        from: m.from ?? null,
        claimed: m.claimed ?? null,
      })),
      discards: s.discards,
    })),
    stage: stageView(hand),
    last: last ? (({ tile, ...rest }) => (tile === undefined ? rest : { ...rest, tile }))(last) : null,
    mine: viewer === null ? null : mineView(hand, viewer),
  };
};
