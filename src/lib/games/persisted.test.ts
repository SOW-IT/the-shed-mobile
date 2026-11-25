import { beforeEach, describe, expect, it, vi } from "vitest";

type Write = { value: string; finish: (saved: boolean) => void };
const writes: Write[] = [];
let nextRead: Promise<string | null> = Promise.resolve(null);

vi.mock("../deviceStorage", () => ({
  readStored: () => nextRead,
  tryWriteStored: (_key: string, value: string) =>
    new Promise<boolean>((finish) => {
      writes.push({ value, finish });
    }),
}));

const { persisted } = await import("./persisted");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("persisted", () => {
  beforeEach(() => {
    writes.length = 0;
    nextRead = Promise.resolve(null);
  });

  it("waits for the saved best to load before a run can change it", async () => {
    let finishRead: (saved: string | null) => void = () => {};
    nextRead = new Promise((resolve) => {
      finishRead = resolve;
    });
    const best = persisted<number>("test.loading", Number, 0, String);
    const run = best.update((current) => Math.max(current, 100));
    await settle();
    expect(writes).toEqual([]);
    finishRead("200");
    await run;
    expect(best.get()).toBe(200);
    expect(writes).toEqual([]);
  });

  it("writes one at a time, so a slow earlier write can't hide a newer one that failed", async () => {
    const best = persisted<number>("test.best", Number, 0, String);
    const first = best.update(() => 100);
    await settle();
    const second = best.update(() => 200);
    await settle();
    expect(writes.map((w) => w.value)).toEqual(["100"]);
    writes[0].finish(true);
    await first;
    await settle();
    expect(writes.map((w) => w.value)).toEqual(["100", "200"]);
    writes[1].finish(false);
    await second;
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
