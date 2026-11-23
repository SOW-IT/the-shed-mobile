import { expect, test } from "vitest";
import { onlineNow, onlineText } from "./useWorldOnline";

test("the online note shows a count, and nothing when nobody is on", () => {
  expect(onlineText(3)).toBe("3 online");
  expect(onlineText(1)).toBe("1 online");
  expect(onlineText(0)).toBeUndefined();
  expect(onlineText(undefined)).toBeUndefined();
});

test("the Games list says who's on only once the count has loaded", () => {
  expect(onlineNow(undefined)).toBeUndefined();
  expect(onlineNow(0)).toBe("Nobody online right now");
  expect(onlineNow(4)).toBe("4 online now");
});
