import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createDevotionalAutosave,
  createDevotionalSyncHolds,
  DEVOTIONAL_AUTOSAVE_DELAY_MS,
  devotionalSyncHoldKey,
} from "./devotionalAutosave";

const setup = (writeLocal: (text: string) => Promise<unknown> = () => Promise.resolve(true)) => {
  const writes: string[] = [];
  const autosave = createDevotionalAutosave<string>({
    writeLocal: (text) => {
      writes.push(text);
      return writeLocal(text);
    },
  });
  return { autosave, writes };
};

describe("devotional autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("writes once, 500 ms after the last keystroke, with the latest text", async () => {
    const { autosave, writes } = setup();
    autosave.edit("A");
    await vi.advanceTimersByTimeAsync(300);
    autosave.edit("Ab");
    await vi.advanceTimersByTimeAsync(300);
    autosave.edit("Abi");
    await vi.advanceTimersByTimeAsync(DEVOTIONAL_AUTOSAVE_DELAY_MS - 1);
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual(["Abi"]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(writes).toEqual(["Abi"]);
  });

  test("flushing on leave writes the text typed in the last 500 ms before the cloud save", async () => {
    const order: string[] = [];
    const { autosave } = setup(async (text) => {
      order.push(`local:${text}`);
    });
    autosave.edit("Abide");
    await vi.advanceTimersByTimeAsync(100);
    await autosave.flushLocal();
    order.push("cloud");
    expect(order).toEqual(["local:Abide", "cloud"]);
    await vi.advanceTimersByTimeAsync(DEVOTIONAL_AUTOSAVE_DELAY_MS);
    expect(order).toEqual(["local:Abide", "cloud"]);
  });

  test("leaving with nothing typed makes no local write", async () => {
    const { autosave, writes } = setup();
    await autosave.flushLocal();
    await vi.advanceTimersByTimeAsync(DEVOTIONAL_AUTOSAVE_DELAY_MS);
    expect(writes).toEqual([]);
  });

  test("a flush waits for a local write already under way", async () => {
    let finish: () => void = () => {};
    const { autosave, writes } = setup(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    autosave.edit("Abide");
    await vi.advanceTimersByTimeAsync(DEVOTIONAL_AUTOSAVE_DELAY_MS);
    expect(writes).toEqual(["Abide"]);
    let flushed = false;
    void autosave.flushLocal().then(() => {
      flushed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(false);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(true);
    expect(writes).toEqual(["Abide"]);
  });

  test("a failed local write still settles the flush and later writes go through", async () => {
    const { autosave, writes } = setup((text) => (text === "bad" ? Promise.reject(new Error("disk")) : Promise.resolve()));
    autosave.edit("bad");
    await expect(autosave.flushLocal()).resolves.toBeUndefined();
    autosave.edit("good");
    await autosave.flushLocal();
    expect(writes).toEqual(["bad", "good"]);
  });

  test("cancel drops the pending write", async () => {
    const { autosave, writes } = setup();
    autosave.edit("Mine");
    autosave.cancel();
    await vi.advanceTimersByTimeAsync(DEVOTIONAL_AUTOSAVE_DELAY_MS * 2);
    await autosave.flushLocal();
    expect(writes).toEqual([]);
  });

  test("a custom delay is honoured", async () => {
    const writes: string[] = [];
    const autosave = createDevotionalAutosave<string>({
      writeLocal: async (text) => {
        writes.push(text);
      },
      delayMs: 50,
    });
    autosave.edit("A");
    await vi.advanceTimersByTimeAsync(50);
    expect(writes).toEqual(["A"]);
  });
});

describe("devotional sync holds", () => {
  test("keys ignore email case and spaces", () => {
    expect(devotionalSyncHoldKey(" Dan@Example.com ", "2026-11-26")).toBe("dan@example.com/2026-11-26");
  });

  test("a day stays held until every hold on it is released", () => {
    const holds = createDevotionalSyncHolds();
    const seen: number[] = [];
    const unsubscribe = holds.subscribe(() => seen.push(holds.held().size));
    const first = holds.hold("a/2026-11-26");
    const second = holds.hold("a/2026-11-26");
    expect(holds.held().has("a/2026-11-26")).toBe(true);
    first();
    first();
    expect(holds.held().has("a/2026-11-26")).toBe(true);
    second();
    expect(holds.held().has("a/2026-11-26")).toBe(false);
    unsubscribe();
    holds.hold("a/2026-11-27");
    expect(seen).toEqual([1, 1, 1, 0]);
  });

  test("each change hands out a new set so subscribers re-render", () => {
    const holds = createDevotionalSyncHolds();
    const before = holds.held();
    const release = holds.hold("a/2026-11-26");
    const during = holds.held();
    release();
    expect(during).not.toBe(before);
    expect(holds.held()).not.toBe(during);
  });
});
