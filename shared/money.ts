export const currencyText = (text: string): string => {
  const [whole, ...rest] = text.replace(/[^0-9.]/g, "").split(".");
  if (rest.length === 0) return whole;
  const cents = rest.join("").slice(0, 2);
  return `${whole}.${cents}`;
};

/**
 * Whole cents for `amount`, so two dollar values can be compared exactly.
 * The product is trimmed to 15 significant digits first so binary float noise
 * (1.005 * 100 = 100.49999999999999) rounds the way the decimal input reads.
 */
export const toCents = (amount: number): number =>
  Number.isFinite(amount)
    ? Math.round(Number((amount * 100).toPrecision(15)))
    : Math.round(amount * 100);

/** `amount` rounded to the nearest cent (removes float drift from sums). */
export const roundToCents = (amount: number): number => toCents(amount) / 100;

/** Sum of dollar amounts, rounded to cents so 10.10 + 20.20 is 30.3 not 30.299999. */
export const sumAmounts = (amounts: readonly number[]): number =>
  amounts.reduce((cents, amount) => cents + toCents(amount), 0) / 100;

export const formatAmount = (amount: number): string => {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
