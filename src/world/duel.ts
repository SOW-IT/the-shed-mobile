import {
  chantAt,
  DUEL_LOSER_EMOTE,
  DUEL_PICKS,
  DUEL_REVEAL_MS,
  DUEL_WINNER_EMOTE,
  EMOTE_MS,
  isDuelPick,
  type EmoteId,
} from "../../shared/world";

export type DuelView = {
  id: string;
  a: string;
  b: string;
  round: number;
  startsAt: number;
  endsAt: number;
  done: boolean;
  myPick?: string;
  shown?: { a: string; b: string; at: number; winner: "a" | "b" | "draw" };
};

type DuelLook = {
  opponent: string;
  chant: string | null;
  pickIcon: string | null;
  result: { emote: EmoteId; p: number } | null;
};

export const duelFor = <D extends DuelView>(duels: readonly D[], memberId: string, now: number): D | null => {
  const theirs = duels.filter((duel) => (duel.a === memberId || duel.b === memberId) && duelStillShowing(duel, now));
  return theirs.find((duel) => !duel.done) ?? theirs[0] ?? null;
};

const duelStillShowing = (duel: DuelView, now: number) =>
  !duel.done || (duel.shown !== undefined && now < duel.shown.at + DUEL_REVEAL_MS + EMOTE_MS);

export const duelLookFor = (duels: readonly DuelView[], memberId: string, now: number): DuelLook | null => {
  const duel = duelFor(duels, memberId, now);
  if (!duel) return null;
  const side = duel.a === memberId ? "a" : "b";
  const opponent = side === "a" ? duel.b : duel.a;
  const shown = duel.shown;
  const revealing = shown !== undefined && now >= shown.at && now < shown.at + DUEL_REVEAL_MS;
  const mine = shown?.[side];
  const pickIcon = revealing && isDuelPick(mine) ? DUEL_PICKS[mine].icon : null;
  const chant = revealing ? chantAt(shown.at, now) : duel.done ? null : chantAt(duel.endsAt, now);
  const resultFrom = shown ? shown.at + DUEL_REVEAL_MS : 0;
  const result =
    duel.done && shown && shown.winner !== "draw" && now >= resultFrom && now < resultFrom + EMOTE_MS
      ? { emote: shown.winner === side ? DUEL_WINNER_EMOTE : DUEL_LOSER_EMOTE, p: (now - resultFrom) / EMOTE_MS }
      : null;
  return { opponent, chant, pickIcon, result };
};

export const choosing = (duel: DuelView | null, now: number) =>
  duel !== null && !duel.done && now >= duel.startsAt && now < duel.endsAt;
