import { describe, expect, test } from "vitest";
import {
  campusCompatible,
  duplicatePairs,
  memberNameMatch,
  nameMatch,
  nameWords,
  oneEditApart,
  sameCampus,
} from "./mergeSuggestions";

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

describe("member pairs", () => {
  const pairMatch = (a: string, b: string) => memberNameMatch(nameWords(a), nameWords(b));
  const USYD = "University of Sydney";

  test("oneEditApart: exactly one letter added, dropped or changed", () => {
    expect(oneEditApart("hana doe", "hanna doe")).toBe(true);
    expect(oneEditApart("hanna doe", "hana doe")).toBe(true);
    expect(oneEditApart("hana doe", "hane doe")).toBe(true);
    expect(oneEditApart("hana doe", "hana doe")).toBe(false);
    expect(oneEditApart("hana doe", "hanz dor")).toBe(false);
    expect(oneEditApart("hana doe", "hannah doe")).toBe(false);
  });

  test("memberNameMatch: the staff rules first, then a one-letter slip on a full name", () => {
    expect(pairMatch("Hana Doe", "hana  doe")).toBe("same");
    expect(pairMatch("Alex Morgan", "Alexander Morgan")).toBe("short");
    expect(pairMatch("Hana Doe", "Hana Roe Doe")).toBe("middle");
    expect(pairMatch("Hana Doe", "Hanna Doe")).toBe("typo");
    expect(pairMatch("Hana Doe", "Hana Doer")).toBe("typo");
    expect(pairMatch("Ann", "Anne")).toBeNull();
    expect(pairMatch("Theo Quill", "Theo Varga")).toBeNull();
  });

  test("sameCampus: both the same, or both without one", () => {
    expect(sameCampus(USYD, " university of sydney ")).toBe(true);
    expect(sameCampus(undefined, undefined)).toBe(true);
    expect(sameCampus("", undefined)).toBe(true);
    expect(sameCampus(USYD, undefined)).toBe(false);
    expect(sameCampus(USYD, "University of New South Wales")).toBe(false);
  });

  test("duplicatePairs: compares people sharing a first or last name, once, smaller id first", () => {
    const person = (id: string, name: string, campus?: string) => ({
      id,
      words: nameWords(name),
      campus,
    });
    const pairs = duplicatePairs([
      person("m3", "Hana Doe", USYD),
      person("m1", "hana doe", USYD),
      person("m2", "Doe Hana", USYD),
      person("m4", "Hana Doe", "University of New South Wales"),
      person("m5", "Hana Doe"),
      person("m6", "Hanna Lee"),
      person("m7", "Hanne Lee"),
      person("m8", ""),
    ]).map((p) => [p.a.id, p.b.id, p.match]);
    expect(pairs).toHaveLength(4);
    expect(pairs).toEqual(
      expect.arrayContaining([
        ["m1", "m2", "order"],
        ["m1", "m3", "same"],
        ["m2", "m3", "order"],
        ["m6", "m7", "typo"],
      ])
    );
  });
});
