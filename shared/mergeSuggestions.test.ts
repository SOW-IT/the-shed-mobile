import { describe, expect, test } from "vitest";
import { campusCompatible, nameMatch, nameWords } from "./mergeSuggestions";

const match = (a: string, b: string) => nameMatch(nameWords(a), nameWords(b));

describe("nameWords", () => {
  test("drops case, accents, punctuation and digits", () => {
    expect(nameWords("  Li-Na  Wu ")).toEqual(["li", "na", "wu"]);
    expect(nameWords("Sam Doe (2005)")).toEqual(["sam", "doe"]);
    expect(nameWords("Zoë D'Arcy")).toEqual(["zoe", "d", "arcy"]);
    expect(nameWords("  ")).toEqual([]);
  });
});

describe("nameMatch", () => {
  test("the same name, however it was typed", () => {
    expect(match("Hana Doe", "hana  DOE")).toBe("same");
    expect(match("Grace", "grace")).toBe("same");
  });

  test("spacing, order and added middle names", () => {
    expect(match("Li Na Wu", "Lina Wu")).toBe("spacing");
    expect(match("Doe Hana", "Hana Doe")).toBe("order");
    expect(match("Mary Jane Doe", "Mary Doe")).toBe("middle");
    expect(match("Mary Doe", "Mary Jane Doe")).toBe("middle");
  });

  test("a shortened first name with the same surname", () => {
    expect(match("Alex Morgan", "Alexander Morgan")).toBe("short");
    expect(match("Katherine Rowe", "Kat Rowe")).toBe("short");
    expect(match("Sam Doe", "Samuel (Sam Joon) Doe")).toBe("short");
  });

  test("different people", () => {
    expect(match("Li Na Wu", "Li Ma Wu")).toBeNull();
    expect(match("Theo Quill", "Theo Varga")).toBeNull();
    expect(match("Danee Doe", "Daniel Doe")).toBeNull();
    expect(match("Al Doe", "Alice Doe")).toBeNull();
    expect(match("Grace", "Grace Doe")).toBeNull();
    expect(match("", "Grace Doe")).toBeNull();
  });
});

describe("campusCompatible", () => {
  const USYD = "University of Sydney";
  test("only a different campus on both sides rules a match out", () => {
    expect(campusCompatible([USYD], " university of sydney")).toBe(true);
    expect(campusCompatible([USYD], "Macquarie University")).toBe(false);
    expect(campusCompatible([USYD, "Macquarie University"], "Macquarie University")).toBe(
      true
    );
    expect(campusCompatible([], "Macquarie University")).toBe(true);
    expect(campusCompatible([USYD], undefined)).toBe(true);
  });
});
