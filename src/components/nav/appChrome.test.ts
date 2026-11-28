import { describe, expect, it, vi } from "vitest";
import { appChromeHidden, holdAppChrome, subscribeAppChrome } from "./appChrome";

describe("hiding the app's chrome (the mahjong table's full screen)", () => {
  it("hides while anything holds it, and comes back when the last lets go", () => {
    expect(appChromeHidden()).toBe(false);
    const table = holdAppChrome();
    const watching = holdAppChrome();
    expect(appChromeHidden()).toBe(true);
    table();
    expect(appChromeHidden()).toBe(true);
    watching();
    expect(appChromeHidden()).toBe(false);
  });

  it("counts a release once, however often it's called", () => {
    const release = holdAppChrome();
    const other = holdAppChrome();
    release();
    release();
    expect(appChromeHidden()).toBe(true);
    other();
    expect(appChromeHidden()).toBe(false);
  });

  it("tells listeners each time, until they unsubscribe", () => {
    const listener = vi.fn();
    const stop = subscribeAppChrome(listener);
    const release = holdAppChrome();
    release();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    holdAppChrome()();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
