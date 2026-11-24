import { expect, test } from "vitest";
import { nextShown } from "./progressive";

test("tiles come in a batch at a time and stop at the last one", () => {
  expect(nextShown(8, 28, 8)).toBe(16);
  expect(nextShown(24, 28, 8)).toBe(28);
  expect(nextShown(28, 28, 8)).toBe(28);
});

test("a batch of zero still moves on by one", () => {
  expect(nextShown(3, 10, 0)).toBe(4);
});
