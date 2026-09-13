import { describe, expect, test } from "vitest";
import { currencyText, formatAmount, roundToCents, sumAmounts, toCents } from "./money";

describe("cents helpers", () => {
  test("toCents rounds to whole cents", () => {
    expect(toCents(30.299999999999997)).toBe(3030);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(2.675)).toBe(268);
    expect(toCents(-1.005)).toBe(-100);
    expect(toCents(Infinity)).toBe(Infinity);
  });
  test("roundToCents removes float drift", () => {
    expect(roundToCents(0.1 + 0.2)).toBe(0.3);
  });
  test("sumAmounts adds in cents", () => {
    expect(sumAmounts([10.1, 20.2])).toBe(30.3);
    expect(sumAmounts([])).toBe(0);
  });
});

describe("currencyText", () => {
  test.each([
    ["12", "12"],
    ["12.", "12."],
    ["12.5", "12.5"],
    ["12.50", "12.50"],
    ["12.999", "12.99"],
    ["12.5.5", "12.55"],
    ["$1,234.50", "1234.50"],
    [".5", ".5"],
    ["0.001", "0.00"],
    ["abc", ""],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(currencyText(input)).toBe(expected);
  });
});

describe("formatAmount", () => {
  test.each<[number, string]>([
    [12, "12"],
    [12.5, "12.50"],
    [12.1, "12.10"],
    [0, "0"],
    [1000, "1,000"],
    [1234.5, "1,234.50"],
    [1234567, "1,234,567"],
    [30.299999999999997, "30.30"],
  ])("%d -> %j", (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });
});
