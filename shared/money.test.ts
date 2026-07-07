import { describe, expect, test } from "vitest";
import { currencyText, formatAmount } from "./money";

describe("currencyText", () => {
  test.each([
    ["12", "12"],
    ["12.", "12."], // trailing dot preserved mid-typing
    ["12.5", "12.5"],
    ["12.50", "12.50"],
    ["12.999", "12.99"], // capped at 2 fractional digits (truncated, not rounded)
    ["12.5.5", "12.55"], // stray extra dots collapse
    ["$1,234.50", "1234.50"], // symbols/commas stripped
    [".5", ".5"],
    ["0.001", "0.00"], // sub-cent truncates to 0.00
    ["abc", ""],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(currencyText(input)).toBe(expected);
  });
});

describe("formatAmount", () => {
  test.each<[number, string]>([
    [12, "12"], // whole dollars stay bare
    [12.5, "12.50"], // cents padded to 2 dp
    [12.1, "12.10"],
    [0, "0"],
    [1000, "1,000"], // thousands separator
    [1234.5, "1,234.50"],
    [1234567, "1,234,567"],
    [30.299999999999997, "30.30"], // float noise cleaned by rounding
  ])("%d -> %j", (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });
});
