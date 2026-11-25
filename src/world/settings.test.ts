import { afterEach, expect, test, vi } from "vitest";

const { saved, phone } = vi.hoisted(() => ({ saved: new Map<string, string>(), phone: { os: "web", slow: new Set<string>() } }));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return phone.os;
    },
  },
}));
vi.mock("react-native-reanimated", () => ({ useReducedMotion: () => false }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => saved.get(key) ?? null,
  setItemAsync: (key: string, value: string) =>
    new Promise<void>((resolve) =>
      setTimeout(() => {
        saved.set(key, value);
        resolve();
      }, phone.slow.has(value) ? 20 : 0)
    ),
  deleteItemAsync: async (key: string) => {
    saved.delete(key);
  },
}));

type Settings = typeof import("./settings");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const fresh = async (
  stored: Record<string, string> = {},
  { unwritable = [], meanwhile }: { unwritable?: string[]; meanwhile?: (settings: Settings) => void } = {}
) => {
  vi.resetModules();
  saved.clear();
  for (const [key, value] of Object.entries(stored)) saved.set(key, value);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (unwritable.includes(key)) throw new Error("storage full");
        saved.set(key, value);
      },
      removeItem: (key: string) => saved.delete(key),
    },
  });
  const settings = await import("./settings");
  for (const store of Object.values(settings.WORLD_SETTINGS)) store.subscribe(() => undefined);
  meanwhile?.(settings);
  await settle();
  return settings;
};

afterEach(() => {
  vi.unstubAllGlobals();
  phone.os = "web";
  phone.slow.clear();
});

test("a new device starts with times and ping off, motion following the phone, every tag, and names as Daniel K.", async () => {
  const { WORLD_SETTINGS } = await fresh();
  expect(WORLD_SETTINGS.chatTimes.get()).toBe("off");
  expect(WORLD_SETTINGS.pingMs.get()).toBe("off");
  expect(WORLD_SETTINGS.motion.get()).toBe("auto");
  expect(WORLD_SETTINGS.nameTags.get()).toBe("all");
  expect(WORLD_SETTINGS.names.get()).toBe("short");
  expect(saved.size).toBe(0);
});

test("each choice is saved on this device and comes back next time", async () => {
  const first = await fresh();
  first.WORLD_SETTINGS.chatTimes.set("on");
  first.WORLD_SETTINGS.pingMs.set("on");
  first.WORLD_SETTINGS.motion.set("saver");
  first.WORLD_SETTINGS.nameTags.set("near");
  first.WORLD_SETTINGS.names.set("full");
  await settle();
  expect(Object.fromEntries(saved)).toEqual({
    worldChatTimes: "on",
    worldPingMs: "on",
    worldMotion: "saver",
    worldNameTags: "near",
    worldNames: "full",
  });
  const next = await fresh(Object.fromEntries(saved));
  expect(next.WORLD_SETTINGS.chatTimes.get()).toBe("on");
  expect(next.WORLD_SETTINGS.pingMs.get()).toBe("on");
  expect(next.WORLD_SETTINGS.motion.get()).toBe("saver");
  expect(next.WORLD_SETTINGS.nameTags.get()).toBe("near");
  expect(next.WORLD_SETTINGS.names.get()).toBe("full");
});

test("anything else saved under a key is ignored", async () => {
  const { WORLD_SETTINGS } = await fresh({ worldNames: "nickname", worldPingMs: "maybe", worldMotion: "fast" });
  expect(WORLD_SETTINGS.names.get()).toBe("short");
  expect(WORLD_SETTINGS.pingMs.get()).toBe("off");
  expect(WORLD_SETTINGS.motion.get()).toBe("auto");
});

test("an old First name chat choice becomes Daniel K., and nothing old leaves the default", async () => {
  const first = await fresh({ worldChatNames: "first" });
  expect(first.WORLD_SETTINGS.names.get()).toBe("short");
  expect(Object.fromEntries(saved)).toEqual({ worldNames: "short" });
  const odd = await fresh({ worldChatNames: "nickname", worldCardNames: "nickname" });
  expect(odd.WORLD_SETTINGS.names.get()).toBe("short");
  expect(saved.size).toBe(0);
});

test("an old chat names choice is carried over once, then the old keys are gone", async () => {
  const { WORLD_SETTINGS } = await fresh({ worldChatNames: "initials" });
  expect(WORLD_SETTINGS.names.get()).toBe("initials");
  expect(Object.fromEntries(saved)).toEqual({ worldNames: "initials" });
  const next = await fresh(Object.fromEntries(saved));
  expect(next.WORLD_SETTINGS.names.get()).toBe("initials");
});

test("both old settings saved: the player names one wins", async () => {
  const initials = await fresh({ worldChatNames: "first", worldCardNames: "initials" });
  expect(initials.WORLD_SETTINGS.names.get()).toBe("initials");
  const { WORLD_SETTINGS } = await fresh({ worldChatNames: "first", worldCardNames: "full" });
  expect(WORLD_SETTINGS.names.get()).toBe("full");
  expect(Object.fromEntries(saved)).toEqual({ worldNames: "full" });
});

test("a Names choice already saved is kept, and the old keys are cleared", async () => {
  const { WORLD_SETTINGS } = await fresh({ worldNames: "full", worldChatNames: "initials" });
  expect(WORLD_SETTINGS.names.get()).toBe("full");
  expect(Object.fromEntries(saved)).toEqual({ worldNames: "full" });
});

test("a Names choice made while the old one is being read is kept", async () => {
  const { WORLD_SETTINGS } = await fresh(
    { worldChatNames: "initials" },
    { meanwhile: (settings) => settings.WORLD_SETTINGS.names.set("full") }
  );
  expect(WORLD_SETTINGS.names.get()).toBe("full");
  expect(Object.fromEntries(saved)).toEqual({ worldNames: "full" });
});

test("the old keys stay until the carried-over choice is saved", async () => {
  const { WORLD_SETTINGS } = await fresh({ worldChatNames: "initials" }, { unwritable: ["worldNames"] });
  expect(WORLD_SETTINGS.names.get()).toBe("initials");
  expect(Object.fromEntries(saved)).toEqual({ worldChatNames: "initials" });
  const next = await fresh(Object.fromEntries(saved));
  expect(next.WORLD_SETTINGS.names.get()).toBe("initials");
  expect(Object.fromEntries(saved)).toEqual({ worldNames: "initials" });
});

test("a Names choice made during the carry-over that fails to save keeps the old keys", async () => {
  const { WORLD_SETTINGS } = await fresh(
    { worldChatNames: "initials" },
    { unwritable: ["worldNames"], meanwhile: (settings) => settings.WORLD_SETTINGS.names.set("full") }
  );
  expect(WORLD_SETTINGS.names.get()).toBe("full");
  expect(Object.fromEntries(saved)).toEqual({ worldChatNames: "initials" });
});

test("on a phone, a Names choice made while the carried-over one is still saving is what's saved", async () => {
  phone.os = "ios";
  phone.slow.add("initials");
  const { WORLD_SETTINGS } = await fresh({ worldChatNames: "initials" });
  expect(WORLD_SETTINGS.names.get()).toBe("initials");
  WORLD_SETTINGS.names.set("full");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(WORLD_SETTINGS.names.get()).toBe("full");
  expect(Object.fromEntries(saved)).toEqual({ worldNames: "full" });
});

test("battery saver follows Reduce Motion until it's set by hand", async () => {
  const { saverOn } = await fresh();
  expect(saverOn("auto", false)).toBe(false);
  expect(saverOn("auto", true)).toBe(true);
  expect(saverOn("full", true)).toBe(false);
  expect(saverOn("saver", false)).toBe(true);
});

test("near-me tags hide only far people who aren't saying or doing anything", async () => {
  const { tagShown } = await fresh();
  const near = 5;
  const far = near + 1;
  expect(tagShown({ mode: "all", me: false, distance: far, speaking: false })).toBe(true);
  expect(tagShown({ mode: "near", me: false, distance: far, speaking: false })).toBe(false);
  expect(tagShown({ mode: "near", me: false, distance: near, speaking: false })).toBe(true);
  expect(tagShown({ mode: "near", me: false, distance: far, speaking: true })).toBe(true);
  expect(tagShown({ mode: "near", me: true, distance: null, speaking: false })).toBe(true);
  expect(tagShown({ mode: "near", me: false, distance: null, speaking: false })).toBe(false);
});
