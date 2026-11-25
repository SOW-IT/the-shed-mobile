import { beforeEach, expect, test, vi } from "vitest";
import { watchKeyboardInset } from "./useKeyboardInset";

const { listeners, platform } = vi.hoisted(() => ({
  listeners: new Map<string, (e: { endCoordinates: { height: number } }) => void>(),
  platform: { OS: "android" },
}));

vi.mock("react-native", () => ({
  Platform: platform,
  Keyboard: {
    addListener: (event: string, fn: (e: { endCoordinates: { height: number } }) => void) => {
      listeners.set(event, fn);
      return { remove: () => listeners.delete(event) };
    },
  },
}));

beforeEach(() => {
  listeners.clear();
});

test("on Android the scroll area gives up the keyboard's height while it's open", () => {
  platform.OS = "android";
  const seen: number[] = [];
  const stop = watchKeyboardInset((inset) => seen.push(inset));
  listeners.get("keyboardDidShow")!({ endCoordinates: { height: 312 } });
  listeners.get("keyboardDidHide")!({ endCoordinates: { height: 0 } });
  expect(seen).toEqual([312, 0]);
  stop();
  expect(listeners.size).toBe(0);
});

test("iOS and the web leave it to the scroll view's own keyboard insets", () => {
  for (const os of ["ios", "web"]) {
    platform.OS = os;
    watchKeyboardInset(() => undefined)();
    expect(listeners.size).toBe(0);
  }
});
