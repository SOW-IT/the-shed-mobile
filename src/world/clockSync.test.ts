import { describe, expect, test } from "vitest";
import { MAX_CLOCK_RTT_MS, nextClockOffset } from "./clockSync";

describe("nextClockOffset", () => {
  test("takes the first low-RTT reply as the offset and smooths later ones", () => {
    const first = nextClockOffset(null, 10_520, 10_000, 10_040);
    expect(first).toEqual({ offset: 500, rtt: 40 });
    const second = nextClockOffset(first, 20_420, 20_000, 20_040);
    expect(second?.offset).toBe(480);
  });

  test("ignores a reply queued across a long offline or background pause once a good offset is known", () => {
    const settled = { offset: 25, rtt: 40 };
    expect(nextClockOffset(settled, 100_000, 10_000, 100_000)).toBe(settled);
    expect(nextClockOffset(settled, 12_001, 10_000, 10_000 + MAX_CLOCK_RTT_MS + 1)).toBe(settled);
  });

  test("a first reply slower than the limit still sets the offset", () => {
    expect(nextClockOffset(null, 13_500, 10_000, 13_000)).toEqual({ offset: 2000, rtt: 3000 });
  });

  test("on a slow connection keeps the lowest-RTT sample until a fast reply replaces it", () => {
    const queued = nextClockOffset(null, 100_000, 10_000, 100_000);
    expect(queued).toEqual({ offset: 45_000, rtt: 90_000 });
    const slow = nextClockOffset(queued, 23_000, 20_000, 23_000);
    expect(slow).toEqual({ offset: 1500, rtt: 3000 });
    expect(nextClockOffset(slow, 34_000, 30_000, 34_000)).toBe(slow);
    expect(nextClockOffset(slow, 40_100, 40_000, 40_100)).toEqual({ offset: 50, rtt: 100 });
  });

  test("accepts a reply right on the RTT limit as a fast one", () => {
    const slow = { offset: 9000, rtt: 5000 };
    expect(nextClockOffset(slow, 11_000, 10_000, 10_000 + MAX_CLOCK_RTT_MS)).toEqual({ offset: 0, rtt: MAX_CLOCK_RTT_MS });
  });

  test("ignores negative or non-finite round-trip times", () => {
    const settled = { offset: 15, rtt: 40 };
    expect(nextClockOffset(settled, 10_000, 10_500, 10_000)).toBe(settled);
    expect(nextClockOffset(settled, 10_000, Number.NaN, 10_050)).toBe(settled);
    expect(nextClockOffset(null, 10_000, 10_500, 10_000)).toBeNull();
  });
});
