import { botAnswer, botTurn } from "./bot";
import { actors, answerClaim, declareKong, discard, selfWin, type Answer, type Hand, type Step } from "./game";

/** One seat's move as the server takes it from a phone: everything a player can do in a hand. */
export type Move = { kind: "discard"; tile: number } | { kind: "win" } | { kind: "kong"; tileKind: number } | { kind: "answer"; answer: Answer };

export const applyMove = (hand: Hand, seat: number, move: Move, now: number): Step => {
  if (move.kind === "discard") return discard(hand, seat, move.tile, now);
  if (move.kind === "win") return selfWin(hand, seat);
  if (move.kind === "kong") return declareKong(hand, seat, move.tileKind, now);
  return answerClaim(hand, seat, move.answer, now);
};

/** What a bot does at this seat now, or null when it has nothing to do. */
export const botMove = (hand: Hand, seat: number): Move | null => {
  const stage = hand.stage;
  if (stage.kind === "turn" && stage.seat === seat) return botTurn(hand, seat);
  if (stage.kind === "claim") {
    const offer = stage.offers[seat];
    if (!offer || stage.answers[seat] !== null) return null;
    return { kind: "answer", answer: botAnswer(hand, seat, offer, stage.tile) };
  }
  return null;
};

/**
 * Lets every bot that has to act now do so, once each: the bot whose turn
 * it is plays, and bots answer an open claim window together. Humans who
 * still have to act are left to answer (or time out).
 */
export const playBots = (hand: Hand, bots: readonly boolean[], now: number): Hand => {
  let current = hand;
  for (const seat of actors(hand)) {
    if (!bots[seat]) continue;
    const move = botMove(current, seat);
    if (!move) continue;
    const step = applyMove(current, seat, move, now);
    if (step.ok) current = step.hand;
    if (current.stage.kind !== hand.stage.kind || current.step !== hand.step) break;
  }
  return current;
};
