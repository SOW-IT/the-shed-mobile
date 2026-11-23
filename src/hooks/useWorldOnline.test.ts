import { expect, test } from "vitest";
import { onlineText } from "./useWorldOnline";

test("the online note shows a count, and nothing when nobody is on", () => {
  expect(onlineText(3)).toBe("3 online");
  expect(onlineText(1)).toBe("1 online");
  expect(onlineText(0)).toBeUndefined();
});
