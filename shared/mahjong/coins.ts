import { pointsFor, type Pay } from "./game";
import { forCoins, type Settings } from "./table";

/**
 * Turning a hand's payments into SOW coins. Points × the table's stake are
 * coins. A human pays at most what they have. Bots play for the bank: what
 * a human pays a bot leaves the economy, and what a bot pays a human comes
 * from the bank, up to what the bank still pays that person today.
 */

type Payer = { human: boolean; balance: number };
/** Per seat: the change to their coins (or a bot's notional coins), and what the bank paid them. */
type Settled = { deltas: number[]; fromBank: number[] };

const POINTS_PER_COIN = 8;

export const coinsFor = (points: number, stake = 1) => Math.floor((points * stake) / POINTS_PER_COIN + 0.5);

export const settle = (pays: readonly Pay[], stake: number, seats: readonly Payer[]): Settled => {
  const deltas = seats.map(() => 0);
  const balance = seats.map((s) => s.balance);
  for (const pay of pays) {
    const owed = coinsFor(pay.points, stake);
    const paid = seats[pay.from].human && seats[pay.to].human ? Math.max(0, Math.min(owed, balance[pay.from])) : 0;
    balance[pay.from] -= paid;
    deltas[pay.from] -= paid;
    deltas[pay.to] += paid;
  }
  return { deltas, fromBank: seats.map(() => 0) };
};

export const coinsToSit = (s: Settings) => (forCoins(s) ? coinsFor(pointsFor(s.maxFaan), s.stake) : 0);

export const pointsOnly = (pays: readonly Pay[]): Settled => {
  const deltas = [0, 0, 0, 0];
  for (const pay of pays) {
    deltas[pay.from] -= pay.points;
    deltas[pay.to] += pay.points;
  }
  return { deltas, fromBank: [0, 0, 0, 0] };
};

export const giveUpCoins = (s: Settings) => (forCoins(s) ? coinsFor(pointsFor(s.minFaan), s.stake) : 0);

export const splitAmong = (amount: number, receivers: number) =>
  Array.from({ length: receivers }, (_, i) => Math.floor(amount / receivers) + (i < amount % receivers ? 1 : 0));
