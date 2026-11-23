import { describe, expect, test } from "vitest";
import { isTagColour, TAG_COLOUR_HEX, TAG_COLOUR_NAMES, tagColourHex, tagHexOf } from "./attendanceTags";

describe("tagColourHex", () => {
  test("maps known colour names", () => {
    expect(tagColourHex("red")).toBe(TAG_COLOUR_HEX.red);
    expect(tagColourHex("emerald")).toBe(TAG_COLOUR_HEX.emerald);
  });

  test("falls back to blue for unknown or missing names", () => {
    expect(tagColourHex()).toBe(TAG_COLOUR_HEX.blue);
    expect(tagColourHex("not-a-colour")).toBe(TAG_COLOUR_HEX.blue);
  });
});

describe("the palette", () => {
  test("has a distinct shade for every name", () => {
    expect(TAG_COLOUR_NAMES).toHaveLength(30);
    expect(Object.keys(TAG_COLOUR_HEX)).toEqual([...TAG_COLOUR_NAMES]);
    expect(new Set(Object.values(TAG_COLOUR_HEX)).size).toBe(TAG_COLOUR_NAMES.length);
  });

  test("isTagColour knows only the palette's names", () => {
    expect(isTagColour("navy")).toBe(true);
    expect(isTagColour("constructor")).toBe(false);
    expect(isTagColour(undefined)).toBe(false);
    expect(tagColourHex("constructor")).toBe(TAG_COLOUR_HEX.blue);
  });
});

describe("tagHexOf", () => {
  test("a palette name or a stored hex gives its hex; nothing else gives one", () => {
    expect(tagHexOf("orange")).toBe(TAG_COLOUR_HEX.orange);
    expect(tagHexOf("#123456")).toBe("#123456");
    expect(tagHexOf("tangerine")).toBeUndefined();
    expect(tagHexOf(undefined)).toBeUndefined();
    expect(tagHexOf(null)).toBeUndefined();
  });
});
