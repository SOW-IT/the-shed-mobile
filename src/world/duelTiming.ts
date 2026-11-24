import { choosing, type DuelView } from "./duel";

export const nextDuelWakeMs = (
  duel: DuelView | null,
  now: number,
  showResult: boolean
): number | null => {
  if (!duel) return null;
  if (!duel.done) {
    if (now < duel.startsAt) return Math.max(16, duel.startsAt - now);
    if (choosing(duel, now)) {
      const remaining = duel.endsAt - now;
      const nextSecond = remaining % 1000 || 1000;
      return Math.max(16, Math.min(remaining, nextSecond) + 1);
    }
    return null;
  }
  if (showResult && duel.shown && now < duel.shown.at) {
    return Math.max(16, duel.shown.at - now);
  }
  return null;
};
