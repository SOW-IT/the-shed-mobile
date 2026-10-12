import { describe, expect, test } from "vitest";
import { churchAcronym, churchPagePath } from "./churches";

describe("churchAcronym", () => {
  test("the first letter of each word, without what's in brackets", () => {
    expect(churchAcronym("Harbour City Church")).toBe("HCC");
    expect(churchAcronym("Sydney Young Nak Church")).toBe("SYNC");
    expect(churchAcronym("Sydney Sae Soon Presbyterian Church (New Life)")).toBe("SSSPC");
    expect(churchAcronym("Living Hope Presbyterian Church")).toBe("LHPC");
  });

  test("skips small words, keeps letters and numbers from any script", () => {
    expect(churchAcronym("Church of the Good Shepherd")).toBe("CGS");
    expect(churchAcronym("St. Paul's Anglican - Carlingford")).toBe("SPAC");
    expect(churchAcronym("새순 장로교회")).toBe("새장");
    expect(churchAcronym("3rd Street Chapel")).toBe("3SC");
  });

  test("falls back to the name when nothing is left", () => {
    expect(churchAcronym(" (New Life) ")).toBe("(New Life)");
  });
});

test("churchPagePath opens the Churches page on one church", () => {
  expect(churchPagePath("abc123")).toBe("/churches?church=abc123");
});
