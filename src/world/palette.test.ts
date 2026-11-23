import { expect, test } from "vitest";
import { LOOK_SIZES } from "../../shared/world";
import { isLight, lightToDark, people, signal, signalColour } from "./palette";

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
