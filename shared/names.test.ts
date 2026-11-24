import { describe, expect, test } from "vitest";
import { shortName } from "./names";

describe("shortName", () => {
  test("first name and the last name's initial", () => {
    expect(shortName("Daniel Kim")).toBe("Daniel K.");
    expect(shortName("Sam de la Cruz")).toBe("Sam C.");
    expect(shortName("  ana   lee ")).toBe("ana L.");
    expect(shortName("Émile zola")).toBe("Émile Z.");
  });

  test("a one-word name stays as it is", () => {
    expect(shortName("Sijin")).toBe("Sijin");
  });

  test("a blank name is Someone", () => {
    expect(shortName("")).toBe("Someone");
    expect(shortName("   ")).toBe("Someone");
  });

  test("a long first name is cut, never through an emoji", () => {
    expect(shortName("Bartholomewwwwwwww Smith")).toBe("Bartholomewww… S.");
    expect(shortName("😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀 Lee")).toBe("😀😀😀😀😀😀😀😀😀😀😀😀😀… L.");
  });
});
