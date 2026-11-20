import { describe, expect, test } from "vitest";
import { pctText, round1 } from "./numbers";

describe("numbers", () => {
  test("round1 keeps one decimal place", () => {
    expect(round1(2.345)).toBe(2.3);
  });

  test("pctText reads a share as a whole percentage", () => {
    expect(pctText(0)).toBe("0%");
    expect(pctText(0.456)).toBe("46%");
    expect(pctText(1)).toBe("100%");
  });
});
