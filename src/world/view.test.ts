import { expect, test } from "vitest";
import { pickView } from "./view";

test("offline or Android always shows the list; otherwise VoiceOver picks it", () => {
  expect(pickView({ offline: true, screenReader: false })).toBe("list");
  expect(pickView({ offline: false, screenReader: true })).toBe("list");
  expect(pickView({ offline: false, screenReader: false })).toBe("garden");
  expect(pickView({ offline: false, screenReader: false, canDraw: false })).toBe("list");
});
