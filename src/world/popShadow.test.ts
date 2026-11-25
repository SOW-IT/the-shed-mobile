import { expect, test, vi } from "vitest";
import { hud } from "./palette";
import { popShadow } from "./popShadow";

const { platform } = vi.hoisted(() => ({ platform: { OS: "android" } }));

vi.mock("react-native", () => ({ Platform: platform }));

test("Android gets the hard drop under HUD pills as a box shadow, since it ignores shadow offsets", () => {
  platform.OS = "android";
  expect(popShadow()).toEqual({ boxShadow: `0px 3px 0px ${hud.forest}` });
  expect(popShadow(5)).toEqual({ boxShadow: `0px 5px 0px ${hud.forest}` });
});

test("iOS and the web keep the shadow props", () => {
  platform.OS = "ios";
  expect(popShadow()).toEqual({ shadowColor: hud.forest, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0 });
});
