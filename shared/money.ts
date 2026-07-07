/**
 * Money helpers for the request / receipt / pay surfaces. Deliberately free of
 * any react-native imports (unlike the rest of the ui format helpers) so the
 * logic is unit-testable by the edge-runtime vitest suite. Re-exported from
 * `@/components/ui` via format.ts, so call sites keep importing from there.
 */

/**
 * Keeps digits and a single decimal point, capped at 2 fractional digits — for
 * $ amount inputs (dollars and cents). A trailing point is preserved while
 * typing (e.g. "12." stays "12." so the next keystroke lands after the dot).
 * Extra fractional digits are TRUNCATED, not rounded, so what you typed is what
 * you keep; `formatAmount` rounds on display and the two agree for any value the
 * 2-digit cap allows.
 */
export const currencyText = (text: string): string => {
  const [whole, ...rest] = text.replace(/[^0-9.]/g, "").split(".");
  if (rest.length === 0) return whole;
  const cents = rest.join("").slice(0, 2);
  return `${whole}.${cents}`;
};

/**
 * Formats a $ amount for display: a whole-dollar value stays bare ("12"), any
 * value with cents is shown to exactly 2 decimals ("12.5" → "12.50"), and the
 * dollars carry thousands separators ("1234.5" → "1,234.50"). Used for every
 * money figure — request/receipt/paid amounts and the Director-approval
 * threshold — so they read consistently. Grouping is done manually rather than
 * via `toLocaleString` so it doesn't depend on the JS engine's Intl support on
 * device.
 */
export const formatAmount = (amount: number): string => {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
