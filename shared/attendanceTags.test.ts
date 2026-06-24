import { describe, expect, test } from "vitest";
import { TAG_COLOUR_HEX, tagColourHex } from "./attendanceTags";

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
