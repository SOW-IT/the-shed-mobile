import { describe, expect, test } from "vitest";
import { accountName, fullName, initials, NAME_STYLES, shortName, styledName } from "./names";

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

describe("styledName", () => {
  const all = (name: string) => NAME_STYLES.map((style) => styledName(name, style));

  test("initials, first name and last initial, and the full name", () => {
    expect(NAME_STYLES).toEqual(["initials", "short", "full"]);
    expect(all("Daniel Kim")).toEqual(["DK", "Daniel K.", "Daniel Kim"]);
  });

  test("a one-word name", () => {
    expect(all("Sijin")).toEqual(["S", "Sijin", "Sijin"]);
  });

  test("a name with more than two parts keeps the first and last for initials", () => {
    expect(all("Sam de la Cruz")).toEqual(["SC", "Sam C.", "Sam de la Cruz"]);
    expect(all("  ana   maria  lee ")).toEqual(["AL", "ana L.", "ana maria lee"]);
  });

  test("an empty name", () => {
    expect(all("")).toEqual(["?", "Someone", "Someone"]);
    expect(all("   ")).toEqual(["?", "Someone", "Someone"]);
  });

  test("accents and emoji are kept whole", () => {
    expect(initials("émile zola")).toBe("ÉZ");
    expect(initials("🙂 Joy")).toBe("🙂J");
    expect(fullName("🙂  Joy ")).toBe("🙂 Joy");
  });
});

describe("accountName", () => {
  test("a first.last name or email shows as First Last", () => {
    expect(accountName("daniel.kim", "daniel.kim@sow.org.au")).toBe("Daniel Kim");
    expect(accountName(undefined, "daniel.kim@sow.org.au")).toBe("Daniel Kim");
    expect(accountName("  ", "mary_jane.lee@sow.org.au")).toBe("Mary Jane Lee");
    expect(accountName("daniel.kim@sow.org.au", "daniel.kim@sow.org.au")).toBe("Daniel Kim");
  });

  test("a real name is kept as it is", () => {
    expect(accountName(" Daniel Kim ", "daniel.kim@sow.org.au")).toBe("Daniel Kim");
    expect(accountName("Mary-Jane", "mj@sow.org.au")).toBe("Mary-Jane");
    expect(accountName("Sijin", "sijin@sow.org.au")).toBe("Sijin");
  });

  test("an email part that isn't first.last stays as it is", () => {
    expect(accountName(null, "dkim@sow.org.au")).toBe("dkim");
    expect(accountName(null, "daniel.kim2@sow.org.au")).toBe("daniel.kim2");
  });
});
