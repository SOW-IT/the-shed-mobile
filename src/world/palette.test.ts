import { expect, test } from "vitest";
import { customColour, LOOK_SIZES } from "../../shared/world";
import { favouriteColour, hexRgb, isLight, lightToDark, pantsColour, people, rgbHex, shirtColour, signal, signalColour } from "./palette";

test("skins are offered lightest first without changing what a saved index means", () => {
  const order = lightToDark(people.skins);
  expect([...order].sort((a, b) => a - b)).toEqual(people.skins.map((_, i) => i));
  expect(order[0]).toBe(8);
  expect(order[order.length - 1]).toBe(11);
});

test("every palette has a colour for each choice of its part", () => {
  expect(people.skins).toHaveLength(LOOK_SIZES.skin);
  expect(people.hairColours).toHaveLength(LOOK_SIZES.hairColour);
  expect(people.shirts).toHaveLength(LOOK_SIZES.shirt);
  expect(people.pants).toHaveLength(LOOK_SIZES.pantsColour);
  expect(people.favourites).toHaveLength(LOOK_SIZES.favourite);
  expect(people.backdrops).toHaveLength(LOOK_SIZES.backdrop);
  // After "None".
  expect(people.eyeshadow).toHaveLength(LOOK_SIZES.eyeshadow - 1);
  expect(people.lipstick).toHaveLength(LOOK_SIZES.lipstick - 1);
  // "Match hair", then each hair colour.
  expect(LOOK_SIZES.browColour).toBe(people.hairColours.length + 1);
});

test("isLight tells pale colours from dark ones", () => {
  expect([isLight(people.collar), isLight(people.shirts[8])]).toEqual([true, false]);
});

test("ping bars are green at three or four, amber at two and red at one", () => {
  expect([4, 3, 2, 1].map(signalColour)).toEqual([signal.good, signal.good, signal.fair, signal.poor]);
});

test("a look's top, bottoms and favourite colours come from the palette or a custom colour", () => {
  const plain = { skin: 0, hair: 0, hairColour: 0, shirt: 3 };
  expect(shirtColour(plain)).toBe(people.shirts[3]);
  expect(shirtColour({ ...plain, shirt: 99 })).toBe(people.shirts[0]);
  expect(shirtColour({ ...plain, shirt: customColour(0x2e3f5e) })).toBe(rgbHex(0x2e3f5e));
  expect(pantsColour(plain)).toBe(people.pants[0]);
  expect(pantsColour({ ...plain, pantsColour: 9 })).toBe(people.pants[9]);
  expect(pantsColour({ ...plain, pantsColour: customColour(0x0a0b0c) })).toBe(rgbHex(0x0a0b0c));
  expect(favouriteColour(plain)).toBeNull();
  expect(favouriteColour({ ...plain, favourite: 0 })).toBeNull();
  expect(favouriteColour({ ...plain, favourite: 5 })).toBe(people.favourites[5]);
  expect(favouriteColour({ ...plain, favourite: customColour(0xffffff) })).toBe(rgbHex(0xffffff));
});

test("hex and 0xRRGGBB convert both ways", () => {
  expect(rgbHex(0x00ff0a)).toMatch(/^#00ff0a$/);
  expect(rgbHex(0x2e3f5e)).toMatch(/^#2e3f5e$/);
  expect(hexRgb(rgbHex(0x00ff0a).toUpperCase())).toBe(0x00ff0a);
  expect(hexRgb(rgbHex(0x123456))).toBe(0x123456);
});
