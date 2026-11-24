import { describe, expect, test, vi } from "vitest";
import { createDevotionalStore, type DevotionalStorageBackend } from "./devotionalStore";

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

describe("devotional local storage and sync", () => {
  test("saves every change locally straight away and queues it for sync", async () => {
    const { backend, data } = memoryBackend();
    const store = createDevotionalStore(backend);

    const draft = await store.saveLocal(
      "anna@sow.org.au",
      "2026-11-24",
      { passage: "Psalm 23", notes: "Shepherd", prayerPoints: "Guide me" },
      1000
    );
    await store.saveLocal(
      "anna@sow.org.au",
      "2026-11-23",
      { passage: "Psalm 22", notes: "Older", prayerPoints: "" },
      1100
    );
    expect(draft.dirty).toBe(true);
    expect(store.getDirty("anna@sow.org.au").map((d) => d.date)).toEqual(["2026-11-23", "2026-11-24"]);
    expect(data.size).toBe(1);

    const fresh = createDevotionalStore(backend);
    const p1 = fresh.load("anna@sow.org.au");
    const p2 = fresh.load("anna@sow.org.au");
    await Promise.all([p1, p2]);
    await fresh.load("anna@sow.org.au");
    expect(fresh.getDrafts("anna@sow.org.au")["2026-11-24"]).toEqual(draft);
    expect(fresh.getDirty("anna@sow.org.au")).toHaveLength(2);
  });

  test("marks a draft synced only when no newer local edit happened in flight", async () => {
    const { backend } = memoryBackend();
    const store = createDevotionalStore(backend);

    const first = await store.saveLocal(
      "anna@sow.org.au",
      "2026-11-24",
      { passage: "ps 23", notes: "v1", prayerPoints: "" },
      1000
    );
    await store.markSynced("anna@sow.org.au", "2026-11-24", "Psalm 23", first.updatedAt, 1500);
    expect(store.getDirty("anna@sow.org.au")).toHaveLength(0);
    expect(store.getDrafts("anna@sow.org.au")["2026-11-24"]).toMatchObject({
      passage: "Psalm 23",
      dirty: false,
      updatedAt: 1500,
    });

    const second = await store.saveLocal(
      "anna@sow.org.au",
      "2026-11-24",
      { passage: "Psalm 23", notes: "v2", prayerPoints: "" },
      2000
    );
    await store.saveLocal(
      "anna@sow.org.au",
      "2026-11-24",
      { passage: "Psalm 23", notes: "v3", prayerPoints: "" },
      3000
    );
    await store.markSynced("anna@sow.org.au", "2026-11-24", "Psalm 23", second.updatedAt, 2500);
    expect(store.getDirty("anna@sow.org.au")).toHaveLength(1);
    expect(store.getDrafts("anna@sow.org.au")["2026-11-24"].notes).toBe("v3");

    await store.markSynced("anna@sow.org.au", "2026-11-20", "Psalm 1", 100, 200);
  });

  test("isolates drafts per account, handles empty storage and notifies subscribers", async () => {
    const { backend } = memoryBackend();
    const store = createDevotionalStore(backend);
    const listener = vi.fn();
    const unsub = store.subscribe("anna@sow.org.au", listener);
    const noopUnsub = store.subscribe(null, listener);
    noopUnsub();

    await store.load("ben@sow.org.au");
    await store.saveLocal(
      "anna@sow.org.au",
      "2026-11-24",
      { passage: "John 1:1", notes: "Private", prayerPoints: "" }
    );
    expect(listener).toHaveBeenCalled();
    expect(store.getDrafts("ben@sow.org.au")).toEqual({});
    expect(store.getDrafts(null)).toEqual({});
    expect(store.getDirty(null)).toEqual([]);

    unsub();
  });
});
