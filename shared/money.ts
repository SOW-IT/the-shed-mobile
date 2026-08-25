export const currencyText = (text: string): string => {
  const [whole, ...rest] = text.replace(/[^0-9.]/g, "").split(".");
  if (rest.length === 0) return whole;
  const cents = rest.join("").slice(0, 2);
  return `${whole}.${cents}`;
};

export const formatAmount = (amount: number): string => {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
