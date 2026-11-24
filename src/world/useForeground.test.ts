import { afterEach, describe, expect, it, vi } from "vitest";
import { isAppActive, subscribeForeground } from "./useForeground";

const { listeners, state } = vi.hoisted(() => ({
  listeners: new Set<(state: string) => void>(),
  state: { currentState: "active" },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    get currentState() {
      return state.currentState;
    },
    addEventListener: (_event: string, fn: (next: string) => void) => {
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    },
  },
}));

describe("useForeground", () => {
  afterEach(() => {
    state.currentState = "active";
    listeners.clear();
  });

  it("reports whether AppState is active", () => {
    expect(isAppActive()).toBe(true);
    state.currentState = "background";
    expect(isAppActive()).toBe(false);
  });

  it("notifies subscribers only when foreground state flips", () => {
    const seen: boolean[] = [];
    const stop = subscribeForeground((active) => seen.push(active));
    state.currentState = "background";
    for (const fn of listeners) fn("background");
    state.currentState = "inactive";
    for (const fn of listeners) fn("inactive");
    state.currentState = "active";
    for (const fn of listeners) fn("active");
    stop();
    state.currentState = "background";
    for (const fn of listeners) fn("background");
    expect(seen).toEqual([false, true]);
  });
});
