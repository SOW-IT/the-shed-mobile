import { afterEach, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-secure-store", () => ({}));

const saved = new Map<string, string>();

const freshStore = async (stored?: string) => {
  vi.resetModules();
  saved.clear();
  if (stored !== undefined) saved.set("worldPingMs", stored);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    },
  });
  const { pingMsStore } = await import("./pingMs");
  const changed = vi.fn();
  pingMsStore.subscribe(changed);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { store: pingMsStore, changed };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("milliseconds are off until someone turns them on", async () => {
  const { store } = await freshStore();
  expect(store.get()).toBe(false);
  expect(saved.has("worldPingMs")).toBe(false);
});

test("turning them on and off is remembered on this device", async () => {
  const { store } = await freshStore();
  store.set(true);
  expect(store.get()).toBe(true);
  expect(saved.get("worldPingMs")).toBe("on");
  store.set(false);
  expect(store.get()).toBe(false);
  expect(saved.get("worldPingMs")).toBe("off");
});

test("the next visit starts how it was left", async () => {
  const on = await freshStore("on");
  expect(on.store.get()).toBe(true);
  expect(on.changed).toHaveBeenCalledTimes(1);
  const off = await freshStore("off");
  expect(off.store.get()).toBe(false);
});

test("anything else saved under the key is ignored", async () => {
  const { store, changed } = await freshStore("maybe");
  expect(store.get()).toBe(false);
  expect(changed).not.toHaveBeenCalled();
});
