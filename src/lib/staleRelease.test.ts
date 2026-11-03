import { afterEach, describe, expect, test, vi } from "vitest";
import {
  browserReloadHost,
  createStaleReloader,
  type ReloadHost,
  reloadAllowed,
  STALE_RELOAD_KEY,
  STALE_RELOAD_WINDOW_MS,
} from "./staleRelease";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

const host = (overrides: Partial<ReloadHost> = {}) => {
  const reloads: number[] = [];
  const storage = memoryStorage();
  let clock = 1_000_000;
  const value: ReloadHost & { reloads: number[]; tick: (ms: number) => void } = {
    storage,
    online: true,
    now: () => clock,
    reload: () => reloads.push(clock),
    reloads,
    tick: (ms: number) => {
      clock += ms;
    },
    ...overrides,
  };
  return value;
};

describe("reloadAllowed", () => {
  test("allows the first reload of a tab", () => {
    expect(reloadAllowed(null, 5_000)).toBe(true);
    expect(reloadAllowed("", 5_000)).toBe(true);
    expect(reloadAllowed("not a number", 5_000)).toBe(true);
  });

  test("refuses a second reload inside the window", () => {
    expect(reloadAllowed("10000", 10_000 + STALE_RELOAD_WINDOW_MS - 1)).toBe(false);
  });

  test("allows another reload once the window has passed, or if the clock went backwards", () => {
    expect(reloadAllowed("10000", 10_000 + STALE_RELOAD_WINDOW_MS)).toBe(true);
    expect(reloadAllowed("10000", 9_000)).toBe(true);
  });
});

describe("createStaleReloader", () => {
  test("reloads once, records when, and treats a repeat call as the same reload", () => {
    const tab = host();
    const reloader = createStaleReloader(() => tab);
    expect(reloader.canReload()).toBe(true);
    expect(reloader.reload()).toBe(true);
    expect(reloader.reload()).toBe(true);
    expect(tab.reloads).toHaveLength(1);
    expect(tab.storage?.getItem(STALE_RELOAD_KEY)).toBe("1000000");
    expect(reloader.canReload()).toBe(true);
  });

  test("falls back to the error screen if the new page fails again straight away", () => {
    const tab = host();
    createStaleReloader(() => tab).reload();
    tab.tick(5_000);
    const afterReload = createStaleReloader(() => tab);
    expect(afterReload.canReload()).toBe(false);
    expect(afterReload.reload()).toBe(false);
    expect(tab.reloads).toHaveLength(1);
  });

  test("reloads again for a later release", () => {
    const tab = host();
    createStaleReloader(() => tab).reload();
    tab.tick(STALE_RELOAD_WINDOW_MS + 1);
    expect(createStaleReloader(() => tab).reload()).toBe(true);
    expect(tab.reloads).toHaveLength(2);
  });

  test("never reloads off the web, offline, or without storage to guard the loop", () => {
    expect(createStaleReloader(() => null).reload()).toBe(false);
    const offline = host({ online: false });
    expect(createStaleReloader(() => offline).reload()).toBe(false);
    const noStorage = host({ storage: null });
    expect(createStaleReloader(() => noStorage).canReload()).toBe(false);
    expect(createStaleReloader(() => noStorage).reload()).toBe(false);
    expect(offline.reloads).toHaveLength(0);
    expect(noStorage.reloads).toHaveLength(0);
  });

  test("does not reload when storage throws", () => {
    const unreadable = host({
      storage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {},
      },
    });
    expect(createStaleReloader(() => unreadable).reload()).toBe(false);
    const unwritable = host({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      },
    });
    const reloader = createStaleReloader(() => unwritable);
    expect(reloader.canReload()).toBe(true);
    expect(reloader.reload()).toBe(false);
    expect(unwritable.reloads).toHaveLength(0);
  });
});

describe("browserReloadHost", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("has nothing to reload outside a browser", () => {
    expect(browserReloadHost()).toBeNull();
  });

  test("reloads the page and records the time in the tab's session storage", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const storage = memoryStorage();
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload }, sessionStorage: storage });
    vi.stubGlobal("navigator", { onLine: true });
    const reloader = createStaleReloader(browserReloadHost);
    expect(reloader.reload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.values.get(STALE_RELOAD_KEY)).toBe("1000000");
  });

  test("does not reload while the browser is offline", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload }, sessionStorage: memoryStorage() });
    vi.stubGlobal("navigator", { onLine: false });
    expect(createStaleReloader(browserReloadHost).reload()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  test("does not reload when session storage is blocked", () => {
    const reload = vi.fn();
    const blockedWindow = { location: { reload } };
    Object.defineProperty(blockedWindow, "sessionStorage", {
      get: () => {
        throw new Error("SecurityError");
      },
    });
    vi.stubGlobal("window", blockedWindow);
    vi.stubGlobal("navigator", { onLine: true });
    expect(browserReloadHost()?.storage).toBeNull();
    expect(createStaleReloader(browserReloadHost).reload()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
