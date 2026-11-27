import { expect, test } from "vitest";
import {
  COLOUR_PARTS,
  CUSTOM_COLOUR,
  customColour,
  customRgb,
  FULL_OUTFITS,
  isValidLook,
  LOOK_SIZES,
  lookPart,
  OUTFIT,
  OUTFITS,
  randomLook,
  SLEEVELESS,
  SLEEVES,
  sleevesOf,
} from "./world";

const plain = { skin: 0, hair: 0, hairColour: 0, shirt: 0 };

test("the new tops are appended, so a saved outfit keeps its meaning", () => {
  expect(OUTFITS.slice(0, 12)).toEqual(["T-shirt", "Dress", "Skirt", "Overalls", "Striped tee", "Hoodie", "Collared", "Jacket", "Jumper", "Polka dots", "Flannel", "Tie-dye tank"]);
  expect(OUTFITS.slice(12)).toEqual(["Tank top", "Sailor top", "Sweater vest", "Sundress", "Jumpsuit", "Hawaiian shirt"]);
  expect(LOOK_SIZES.outfit).toBe(OUTFITS.length);
  expect(OUTFIT["Tank top"]).toBe(12);
  expect(FULL_OUTFITS).toEqual([1, 2, 3, 15, 16]);
});

test("sleeves are none, short or long, and none before anyone picks", () => {
  expect(SLEEVES).toEqual(["None", "Short", "Long"]);
  expect(LOOK_SIZES.sleeves).toBe(SLEEVES.length);
  expect(lookPart(plain, "sleeves")).toBe(0);
  expect(isValidLook({ ...plain, sleeves: 2 })).toBe(true);
  expect(isValidLook({ ...plain, sleeves: 3 })).toBe(false);
});

test("a top without a sleeves choice draws none, whatever was picked", () => {
  expect(sleevesOf({ ...plain, outfit: OUTFIT.Collared, sleeves: 2 })).toBe(2);
  expect(sleevesOf({ ...plain, sleeves: 1 })).toBe(1);
  for (const outfit of SLEEVELESS) expect(sleevesOf({ ...plain, outfit, sleeves: 2 })).toBe(0);
  expect(SLEEVELESS.map((i) => OUTFITS[i])).toEqual(["Hoodie", "Tie-dye tank", "Tank top", "Sundress"]);
});

test("a custom colour is kept past the palette's end, and only top, bottoms and favourite take one", () => {
  expect(COLOUR_PARTS).toEqual(["shirt", "pantsColour", "favourite"]);
  const navy = customColour(0x2e3f5e);
  expect(navy).toBe(CUSTOM_COLOUR + 0x2e3f5e);
  expect(customRgb(navy)).toBe(0x2e3f5e);
  expect(customRgb(customColour(0))).toBe(0);
  expect(customRgb(customColour(0xffffff))).toBe(0xffffff);
  expect([customRgb(undefined), customRgb(3), customRgb(CUSTOM_COLOUR - 1), customRgb(CUSTOM_COLOUR * 2), customRgb(CUSTOM_COLOUR + 0.5)]).toEqual([null, null, null, null, null]);
  for (const part of COLOUR_PARTS) {
    expect(isValidLook({ ...plain, [part]: navy })).toBe(true);
    expect(isValidLook({ ...plain, [part]: CUSTOM_COLOUR * 2 })).toBe(false);
    expect(isValidLook({ ...plain, [part]: LOOK_SIZES[part] })).toBe(false);
  }
  expect(isValidLook({ ...plain, hairColour: navy })).toBe(false);
  expect(isValidLook({ ...plain, backdrop: navy })).toBe(false);
  // Read as a palette choice, a custom colour is the default, as an app from before draws it.
  expect(lookPart({ ...plain, favourite: navy }, "favourite")).toBe(0);
});

test("Randomise picks sleeves and only palette colours", () => {
  for (const r of [0, 0.5, 0.99]) {
    const look = randomLook(() => r);
    expect(look.sleeves).toBeLessThan(LOOK_SIZES.sleeves);
    expect(look.shirt).toBeLessThan(LOOK_SIZES.shirt);
    expect(look.pantsColour).toBeLessThan(LOOK_SIZES.pantsColour);
    expect(look.favourite).toBeLessThan(LOOK_SIZES.favourite);
  }
});
