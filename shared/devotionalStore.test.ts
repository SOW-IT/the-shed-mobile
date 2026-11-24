import { describe, expect, test, vi } from "vitest";
import { createDevotionalStore, type DevotionalStorageBackend } from "./devotionalStore";

const ANNA = "anna@sow.org.au";
const DAY = "2026-11-24";

const memoryBackend = (): { backend: DevotionalStorageBackend; data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    backend: {
      read: async (key) => data.get(key) ?? null,
      write: async (key, value) => {
        data.set(key, value);
        return true;
      },
    },
  };
};

const stored = (data: Map<string, string>) => JSON.parse([...data.values()][0]) as Record<string, unknown>;

describe("devotional local storage and sync", () => {
  test("saves every change locally straight away and queues it for sync", async () => {
    const { backend, data } = memoryBackend();
    const store = createDevotionalStore(backend);

    const { draft, persisted } = await store.saveLocal(
      ANNA,
      DAY,
      { passage: "Psalm 23", notes: "Shepherd", prayerPoints: "Guide me" },
      null,
      1000
    );
    await store.saveLocal(ANNA, "2026-11-23", { passage: "Psalm 22", notes: "Older", prayerPoints: "" }, 400, 1100);
    expect(persisted).toBe(true);
    expect(draft).toMatchObject({ dirty: true, base: null, conflict: false });
    expect(store.getDirty(ANNA).map((d) => d.date)).toEqual(["2026-11-23", DAY]);
    expect(data.size).toBe(1);

    const fresh = createDevotionalStore(backend);
    await Promise.all([fresh.load(ANNA), fresh.load(ANNA)]);
    await fresh.load(ANNA);
    expect(fresh.getDrafts(ANNA)[DAY]).toEqual(draft);
    expect(fresh.getDrafts(ANNA)["2026-11-23"].base).toBe(400);
    expect(fresh.getDirty(ANNA)).toHaveLength(2);
  });

  test("keeps drafts already on the phone when an edit lands before they're read", async () => {
    const { backend, data } = memoryBackend();
    await createDevotionalStore(backend).saveLocal(ANNA, "2026-11-01", { passage: "", notes: "Old", prayerPoints: "" }, null, 10);

    const store = createDevotionalStore(backend);
    await store.saveLocal(ANNA, DAY, { passage: "", notes: "New", prayerPoints: "" }, null, 20);
    expect(Object.keys(stored(data)).filter((k) => k !== "removed").sort()).toEqual(["2026-11-01", DAY]);
    expect(store.getDrafts(ANNA)["2026-11-01"].notes).toBe("Old");
  });

  test("says when the phone couldn't store the edit, and tries again when asked", async () => {
    let full = true;
    const store = createDevotionalStore({ read: async () => null, write: async () => !full });
    const { persisted } = await store.saveLocal(ANNA, DAY, { passage: "", notes: "x", prayerPoints: "" }, null);
    expect(persisted).toBe(false);
    expect(store.getDirty(ANNA)).toHaveLength(1);
    expect(await store.persistNow(ANNA)).toBe(false);
    full = false;
    expect(await store.persistNow(ANNA)).toBe(true);

    const throwing = createDevotionalStore({
      read: async () => null,
      write: () => Promise.reject(new Error("full")),
    });
    expect((await throwing.saveLocal(ANNA, DAY, { passage: "", notes: "x", prayerPoints: "" }, null)).persisted).toBe(false);
  });

  test("clears dirty only for the text the server saved, and rebases a newer edit on it", async () => {
    const { backend } = memoryBackend();
    const store = createDevotionalStore(backend);
    const v1 = { passage: "ps 23", notes: "v1", prayerPoints: "" };

    await store.saveLocal(ANNA, DAY, v1, null, 1000);
    await store.markSynced(ANNA, DAY, v1, { passage: "Psalm 23", deleted: false, updatedAt: 1500 });
    expect(store.getDirty(ANNA)).toHaveLength(0);
    expect(store.getDrafts(ANNA)[DAY]).toMatchObject({ passage: "Psalm 23", dirty: false, updatedAt: 1500, base: 1500 });

    const v2 = { passage: "Psalm 23", notes: "v2", prayerPoints: "" };
    await store.saveLocal(ANNA, DAY, v2, 1500, 2000);
    await store.saveLocal(ANNA, DAY, { passage: "Psalm 23", notes: "v3", prayerPoints: "" }, 9999, 2000);
    await store.markSynced(ANNA, DAY, v2, { passage: "Psalm 23", deleted: false, updatedAt: 2500 });
    expect(store.getDrafts(ANNA)[DAY]).toMatchObject({ notes: "v3", dirty: true, base: 2500 });

    await store.markSynced(ANNA, "2026-11-20", v1, { passage: "Psalm 1", deleted: false, updatedAt: 200 });
    expect(store.getDrafts(ANNA)["2026-11-20"]).toBeUndefined();
  });

  test("a deleted day has no server copy to base the next edit on", async () => {
    const store = createDevotionalStore(memoryBackend().backend);
    const empty = { passage: "", notes: "", prayerPoints: "" };
    await store.saveLocal(ANNA, DAY, empty, 700, 1000);
    await store.markSynced(ANNA, DAY, empty, { passage: "", deleted: true, updatedAt: 1200 });
    expect(store.getDrafts(ANNA)[DAY]).toMatchObject({ dirty: false, base: null });
  });

  test("holds a conflicting draft until the person picks a version", async () => {
    const store = createDevotionalStore(memoryBackend().backend);
    const theirs = { date: DAY, passage: "Psalm 1", notes: "Laptop", prayerPoints: "", updatedAt: 5000 };

    await store.markConflict(ANNA, DAY, null);
    expect(store.getDrafts(ANNA)[DAY]).toBeUndefined();

    await store.saveLocal(ANNA, DAY, { passage: "", notes: "Phone", prayerPoints: "" }, 1000, 2000);
    await store.markConflict(ANNA, DAY, 900);
    expect(store.getDrafts(ANNA)[DAY].conflict).toBe(false);
    await store.markConflict(ANNA, DAY, 1000);
    await store.markConflict(ANNA, DAY, 1000);
    expect(store.getDrafts(ANNA)[DAY]).toMatchObject({ conflict: true, base: 1000 });

    await store.saveLocal(ANNA, DAY, { passage: "", notes: "Phone 2", prayerPoints: "" }, 5000, 2100);
    expect(store.getDrafts(ANNA)[DAY]).toMatchObject({ conflict: true, base: 1000, notes: "Phone 2" });

    await store.keepMine(ANNA, DAY, theirs);
    expect(store.getDrafts(ANNA)[DAY]).toMatchObject({ conflict: false, base: 5000, dirty: true, notes: "Phone 2" });

    await store.markConflict(ANNA, DAY, 5000);
    await store.takeTheirs(ANNA, DAY, theirs);
    expect(store.getDrafts(ANNA)[DAY]).toMatchObject({ notes: "Laptop", dirty: false, base: 5000, conflict: false });
    await store.keepMine(ANNA, DAY, theirs);
    expect(store.getDrafts(ANNA)[DAY].dirty).toBe(false);

    await store.takeTheirs(ANNA, DAY, null);
    expect(store.getDrafts(ANNA)[DAY]).toBeUndefined();
  });

  test("a failed read never overwrites what's stored, and is tried again", async () => {
    const { backend, data } = memoryBackend();
    await createDevotionalStore(backend).saveLocal(ANNA, "2026-11-23", { passage: "", notes: "Unsynced", prayerPoints: "" }, null);
    let broken = true;
    const store = createDevotionalStore({
      read: (key) => (broken ? Promise.reject(new Error("read")) : backend.read(key)),
      write: backend.write,
    });
    await store.load(ANNA);
    const { persisted } = await store.saveLocal(ANNA, DAY, { passage: "", notes: "New", prayerPoints: "" }, null);
    expect(persisted).toBe(false);
    expect(Object.keys(stored(data))).toContain("2026-11-23");
    expect(store.getDrafts(ANNA)[DAY].notes).toBe("New");

    broken = false;
    await store.load(ANNA);
    expect(store.getDrafts(ANNA)["2026-11-23"].notes).toBe("Unsynced");
    expect(await store.persistNow(ANNA)).toBe(true);
    expect(Object.keys(stored(data)).filter((k) => k !== "removed").sort()).toEqual(["2026-11-23", DAY]);
  });

  test("two tabs keep each other's drafts and deletions", async () => {
    const { backend, data } = memoryBackend();
    const tabA = createDevotionalStore(backend);
    const tabB = createDevotionalStore(backend);
    await tabA.load(ANNA);
    await tabB.load(ANNA);

    await tabA.saveLocal(ANNA, "2026-11-20", { passage: "", notes: "A", prayerPoints: "" }, null);
    await tabB.saveLocal(ANNA, "2026-11-21", { passage: "", notes: "B", prayerPoints: "" }, null);
    expect(Object.keys(stored(data)).filter((k) => k !== "removed").sort()).toEqual(["2026-11-20", "2026-11-21"]);
    expect(tabB.getDrafts(ANNA)["2026-11-20"].notes).toBe("A");

    await tabB.takeTheirs(ANNA, "2026-11-20", null);
    await tabA.saveLocal(ANNA, "2026-11-22", { passage: "", notes: "A2", prayerPoints: "" }, null);
    expect(Object.keys(stored(data)).filter((k) => k !== "removed").sort()).toEqual(["2026-11-21", "2026-11-22"]);
    expect(tabA.getDrafts(ANNA)["2026-11-20"]).toBeUndefined();

    await tabA.saveLocal(ANNA, "2026-11-20", { passage: "", notes: "again", prayerPoints: "" }, null);
    await tabB.persistNow(ANNA);
    expect(tabB.getDrafts(ANNA)["2026-11-20"].notes).toBe("again");

    const reader = createDevotionalStore(backend);
    await reader.load(ANNA);
    expect(Object.keys(reader.getDrafts(ANNA)).sort()).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
    data.set([...data.keys()][0], JSON.stringify({ removed: { "not-a-day": 1, "2026-11-01": "x" } }));
    expect(await reader.persistNow(ANNA)).toBe(true);
    data.set([...data.keys()][0], "{bad json");
    expect(await reader.persistNow(ANNA)).toBe(true);
  });

  test("isolates drafts per account, handles empty storage and notifies subscribers", async () => {
    const { backend } = memoryBackend();
    const store = createDevotionalStore(backend);
    const listener = vi.fn();
    const unsub = store.subscribe(ANNA, listener);
    const noopUnsub = store.subscribe(null, listener);
    noopUnsub();

    await store.load("ben@sow.org.au");
    await store.saveLocal(ANNA, DAY, { passage: "John 1:1", notes: "Private", prayerPoints: "" }, null);
    expect(listener).toHaveBeenCalled();
    expect(store.getDrafts("ben@sow.org.au")).toEqual({});
    expect(store.getDrafts(null)).toEqual({});
    expect(store.getDirty(null)).toEqual([]);

    unsub();
  });
});
