import { expect, test } from "vitest";
import { lightToDark, people } from "./palette";

test("skins are offered lightest first without changing what a saved index means", () => {
  const order = lightToDark(people.skins);
  expect([...order].sort((a, b) => a - b)).toEqual(people.skins.map((_, i) => i));
  expect(order[0]).toBe(1);
  expect(order[order.length - 1]).toBe(7);
});
