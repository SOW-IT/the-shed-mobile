import { beforeEach, describe, expect, it, vi } from "vitest";

type Write = { value: string; finish: (saved: boolean) => void };
const writes: Write[] = [];

vi.mock("../deviceStorage", () => ({
  readStored: async () => null,
  tryWriteStored: (_key: string, value: string) =>
    new Promise<boolean>((finish) => {
      writes.push({ value, finish });
    }),
}));

const { persisted } = await import("./persisted");

/** Lets queued promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("persisted", () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it("writes one at a time, so a slow earlier write can't hide a newer one that failed", async () => {
    const best = persisted<number>("test.best", Number, 0, String);
    const first = best.update(() => 100);
    await settle();
    const second = best.update(() => 200);
    await settle();
    // Only the first write has started; the second waits for it.
    expect(writes.map((w) => w.value)).toEqual(["100"]);
    writes[0].finish(true);
    await first;
    await settle();
    expect(writes.map((w) => w.value)).toEqual(["100", "200"]);
    writes[1].finish(false);
    await second;
    // 200 never saved, so a change that leaves the value alone still retries it.
    const retry = best.update((current) => Math.max(current, 90));
    await settle();
    expect(writes.map((w) => w.value)).toEqual(["100", "200", "200"]);
    writes[2].finish(true);
    await retry;
    expect(best.get()).toBe(200);
  });

  it("skips a change that leaves a saved value alone", async () => {
    const best = persisted<number>("test.same", Number, 0, String);
    const first = best.update(() => 5);
    await settle();
    writes[0].finish(true);
    await first;
    await best.update((current) => current);
    expect(writes).toHaveLength(1);
  });
});
