import { describe, expect, test } from "vitest";
import { MAX_CLOCK_RTT_MS, nextClockOffset } from "./clockSync";

describe("nextClockOffset", () => {
  test("takes the first low-RTT reply as the offset and smooths later ones", () => {
    const first = nextClockOffset(null, 10_520, 10_000, 10_040);
    expect(first).toBe(500);
    const second = nextClockOffset(first, 20_420, 20_000, 20_040);
    expect(second).toBe(480);
  });

  test("ignores a reply queued across a long offline or background pause", () => {
    // Heartbeat queued for 90s while offline: server answers at receivedAt,
    // which would otherwise look like a +45s clock offset.
    expect(nextClockOffset(25, 100_000, 10_000, 100_000)).toBe(25);
    expect(nextClockOffset(null, 100_000, 10_000, 100_000)).toBeNull();
    expect(nextClockOffset(10, 12_001, 10_000, 10_000 + MAX_CLOCK_RTT_MS + 1)).toBe(10);
  });

  test("accepts a reply right on the RTT limit", () => {
    expect(nextClockOffset(null, 11_000, 10_000, 10_000 + MAX_CLOCK_RTT_MS)).toBe(0);
  });

  test("ignores negative or non-finite round-trip times", () => {
    expect(nextClockOffset(15, 10_000, 10_500, 10_000)).toBe(15);
    expect(nextClockOffset(15, 10_000, Number.NaN, 10_050)).toBe(15);
  });
});
