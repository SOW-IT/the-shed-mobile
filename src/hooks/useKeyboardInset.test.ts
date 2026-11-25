import { beforeEach, expect, test, vi } from "vitest";
import { keyboardOverlap, watchKeyboardTop } from "./useKeyboardInset";

type KeyboardEvent = { endCoordinates: { screenY: number; height: number } };

const { listeners, platform, shown } = vi.hoisted(() => ({
  listeners: new Map<string, (e: KeyboardEvent) => void>(),
  platform: { OS: "android" },
  shown: { metrics: undefined as { screenY: number; height: number } | undefined },
}));

vi.mock("react-native", () => ({
  Platform: platform,
  Keyboard: {
    isVisible: () => shown.metrics !== undefined,
    metrics: () => shown.metrics,
    addListener: (event: string, fn: (e: KeyboardEvent) => void) => {
      listeners.set(event, fn);
      return { remove: () => listeners.delete(event) };
    },
  },
}));

beforeEach(() => {
  listeners.clear();
  shown.metrics = undefined;
});

test("on Android it follows the top of the keyboard while it's open", () => {
  platform.OS = "android";
  const seen: (number | null)[] = [];
  const stop = watchKeyboardTop((top) => seen.push(top));
  listeners.get("keyboardDidShow")!({ endCoordinates: { screenY: 520, height: 312 } });
  listeners.get("keyboardDidHide")!({ endCoordinates: { screenY: 832, height: 0 } });
  expect(seen).toEqual([520, null]);
  stop();
  expect(listeners.size).toBe(0);
});

test("a screen that opens while the keyboard is already up gets its top straight away", () => {
  platform.OS = "android";
  shown.metrics = { screenY: 520, height: 312 };
  const seen: (number | null)[] = [];
  watchKeyboardTop((top) => seen.push(top))();
  expect(seen).toEqual([520]);
});

test("iOS and the web leave it to the scroll view's own keyboard insets", () => {
  for (const os of ["ios", "web"]) {
    platform.OS = os;
    watchKeyboardTop(() => undefined)();
    expect(listeners.size).toBe(0);
  }
});

test("the scroll area gives up only the part the keyboard covers", () => {
  expect(keyboardOverlap({ y: 0, height: 832 }, 520)).toBe(312);
  expect(keyboardOverlap({ y: 90, height: 662 }, 520)).toBe(232);
  expect(keyboardOverlap({ y: 0, height: 520 }, 520)).toBe(0);
  expect(keyboardOverlap({ y: 0, height: 480 }, 520)).toBe(0);
  expect(keyboardOverlap({ y: 0, height: 520 }, 500, 312)).toBe(332);
});
