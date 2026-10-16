import { describe, expect, test } from "vitest";
import { pinSize } from "./churchPins";

describe("pinSize", () => {
  test("the church most people go to gets the biggest label, nobody the smallest", () => {
    expect(pinSize(24, 24)).toEqual({ fontSize: 17, height: 34, paddingHorizontal: 14 });
    expect(pinSize(0, 24)).toEqual({ fontSize: 11, height: 22, paddingHorizontal: 8 });
  });

  test("size follows the square root of the share, so a few people still show", () => {
    expect(pinSize(6, 24)).toEqual({ fontSize: 14, height: 28, paddingHorizontal: 11 });
    expect(pinSize(1, 24).fontSize).toBeGreaterThan(pinSize(0, 24).fontSize);
    expect(pinSize(5, 24).fontSize).toBeLessThan(pinSize(7, 24).fontSize);
  });

  test("no one anywhere, or a count out of range, stays within the sizes", () => {
    expect(pinSize(0, 0)).toEqual(pinSize(0, 24));
    expect(pinSize(30, 24)).toEqual(pinSize(24, 24));
    expect(pinSize(-1, 24)).toEqual(pinSize(0, 24));
  });
});
