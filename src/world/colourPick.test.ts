import { expect, test } from "vitest";
import { hslToRgb, parseHex, rgbToHsl, sliderColour } from "./colourPick";

test("HSL turns into the colours you'd expect", () => {
  expect(hslToRgb({ h: 0, s: 1, l: 0.5 })).toBe(0xff0000);
  expect(hslToRgb({ h: 1 / 3, s: 1, l: 0.5 })).toBe(0x00ff00);
  expect(hslToRgb({ h: 2 / 3, s: 1, l: 0.5 })).toBe(0x0000ff);
  expect(hslToRgb({ h: 1 / 6, s: 1, l: 0.5 })).toBe(0xffff00);
  expect(hslToRgb({ h: 0.5, s: 1, l: 0.5 })).toBe(0x00ffff);
  expect(hslToRgb({ h: 5 / 6, s: 1, l: 0.5 })).toBe(0xff00ff);
  expect(hslToRgb({ h: 0.3, s: 0, l: 0 })).toBe(0x000000);
  expect(hslToRgb({ h: 0.3, s: 0, l: 1 })).toBe(0xffffff);
  // Hue wraps; strength and lightness are held to 0 to 1.
  expect(hslToRgb({ h: 1, s: 2, l: 0.5 })).toBe(0xff0000);
  expect(hslToRgb({ h: -1 / 3, s: 1, l: 0.5 })).toBe(0x0000ff);
});

test("a colour goes to HSL and back unchanged", () => {
  for (const rgb of [0x2e3f5e, 0xc9603a, 0xf6d365, 0x3e9a9a, 0x8a5cc2, 0x808080, 0xffffff, 0x000000, 0x123456, 0xfe01dc]) {
    expect(hslToRgb(rgbToHsl(rgb))).toBe(rgb);
  }
  expect(rgbToHsl(0x808080).s).toBe(0);
});

test("a typed hex code is read with or without the hash, short or long", () => {
  // Built, as lint keeps colour literals to the palette.
  const hash = "#";
  expect(parseHex(`${hash}3a64b8`)).toBe(0x3a64b8);
  expect(parseHex(" 3A64B8 ")).toBe(0x3a64b8);
  expect(parseHex(`${hash}36b`)).toBe(0x3366bb);
  expect([parseHex(""), parseHex(`${hash}3a64b`), parseHex(`${hash}zzzzzz`), parseHex(`${hash}3a64b8a`)]).toEqual([null, null, null, null]);
});

test("the hue track is a vivid rainbow; the others vary only their own part", () => {
  const grey = { h: 0.6, s: 0, l: 0.5 };
  expect(sliderColour("h", grey, 0)).toBe(hslToRgb({ h: 0, s: 0.55, l: 0.55 }));
  expect(sliderColour("s", grey, 1)).toBe(hslToRgb({ h: 0.6, s: 1, l: 0.5 }));
  expect(sliderColour("l", grey, 0)).toBe(0x000000);
});
