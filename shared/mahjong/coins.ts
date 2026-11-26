import type { Pay } from "./game";

/**
 * Turning a hand's payments into SOW coins. Points × the table's stake are
 * coins. A human pays at most what they have. Bots play for the bank: what
 * a human pays a bot leaves the economy, and what a bot pays a human comes
 * from the bank, up to what the bank still pays that person today.
 */

export const MAHJONG_BANK_DAILY_CAP = 200;

type Payer = { human: boolean; balance: number; bankLeft: number };
/** Per seat: the change to their coins (or a bot's notional coins), and what the bank paid them. */
type Settled = { deltas: number[]; fromBank: number[] };

export const settle = (pays: readonly Pay[], stake: number, seats: readonly Payer[]): Settled => {
  const deltas = seats.map(() => 0);
  const fromBank = seats.map(() => 0);
  const balance = seats.map((s) => s.balance);
  const bankLeft = seats.map((s) => s.bankLeft);
  for (const pay of pays) {
    const owed = pay.points * stake;
    const payer = seats[pay.from];
    const winner = seats[pay.to];
    let paid: number;
    if (payer.human) {
      paid = Math.max(0, Math.min(owed, balance[pay.from]));
      balance[pay.from] -= paid;
    } else if (winner.human) {
      paid = Math.max(0, Math.min(owed, bankLeft[pay.to]));
      bankLeft[pay.to] -= paid;
      fromBank[pay.to] += paid;
    } else {
      paid = owed;
    }
    deltas[pay.from] -= paid;
    deltas[pay.to] += paid;
  }
  return { deltas, fromBank };
};

/** What the bank can still pay someone today, from what it has paid them. */
export const bankLeftToday = (paidDay: string | undefined, paidToday: number | undefined, today: string) =>
  Math.max(0, MAHJONG_BANK_DAILY_CAP - (paidDay === today ? (paidToday ?? 0) : 0));
