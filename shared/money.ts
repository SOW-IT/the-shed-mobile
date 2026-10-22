export const currencyText = (text: string): string => {
  const [whole, ...rest] = text.replace(/[^0-9.]/g, "").split(".");
  if (rest.length === 0) return whole;
  const cents = rest.join("").slice(0, 2);
  return `${whole}.${cents}`;
};

export const toCents = (amount: number): number =>
  Number.isFinite(amount)
    ? Math.round(Number((amount * 100).toPrecision(15)))
    : Math.round(amount * 100);

export const roundToCents = (amount: number): number => toCents(amount) / 100;

export const sumAmounts = (amounts: readonly number[]): number =>
  amounts.reduce((cents, amount) => cents + toCents(amount), 0) / 100;

export const formatAmount = (amount: number): string => {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

export const money = (amount: number) => `${amount < 0 ? "-" : ""}$${formatAmount(Math.abs(amount))}`;
