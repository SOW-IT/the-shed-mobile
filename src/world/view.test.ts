import { expect, test } from "vitest";
import { hearingLabel, pickView } from "./view";

test("offline always shows the list; otherwise a choice wins, then VoiceOver", () => {
  expect(pickView({ offline: true, screenReader: false, chosen: "garden" })).toBe("list");
  expect(pickView({ offline: false, screenReader: true, chosen: "garden" })).toBe("garden");
  expect(pickView({ offline: false, screenReader: true, chosen: null })).toBe("list");
  expect(pickView({ offline: false, screenReader: false, chosen: null })).toBe("garden");
  expect(pickView({ offline: false, screenReader: false, chosen: "garden", canDraw: false })).toBe("list");
});

test("hearingLabel counts people", () => {
  expect([0, 1, 2].map(hearingLabel)).toEqual([
    "Nobody can hear you yet",
    "1 person can hear you",
    "2 people can hear you",
  ]);
});
