import { expect, test } from "vitest";
import { phaseAt, phaseFor, STILL_PHASE, wanderAt, zoneOf } from "./animalMotion";

test("a full coop splits into four corners and a barn into halves", () => {
  expect([0, 1, 2, 3].map((slot) => zoneOf(slot, 4))).toEqual([
    { u0: 0, u1: 0.5, v0: 0, v1: 0.5 },
    { u0: 0.5, u1: 1, v0: 0, v1: 0.5 },
    { u0: 0, u1: 0.5, v0: 0.5, v1: 1 },
    { u0: 0.5, u1: 1, v0: 0.5, v1: 1 },
  ]);
  expect(zoneOf(1, 2)).toEqual({ u0: 0.5, u1: 1, v0: 0, v1: 1 });
});

test("animals wander inside their own corner, and a frail one stands still", () => {
  const zone = zoneOf(3, 4);
  for (let phase = 0; phase < 1; phase += 0.01) {
    const w = wanderAt(12345, phase, 0.3, zone);
    expect(w.u).toBeGreaterThanOrEqual(zone.u0);
    expect(w.u).toBeLessThanOrEqual(zone.u1);
    expect(w.v).toBeGreaterThanOrEqual(zone.v0);
    expect(w.v).toBeLessThanOrEqual(zone.v1);
  }
  expect(wanderAt(7, 0.2, null, zone)).toEqual(wanderAt(7, 0.8, null, zone));
});

test("drawing and taps use the same phase: the clock when live, a fixed one when still", () => {
  const at = Date.UTC(2026, 10, 26, 3, 0, 7);
  expect(phaseFor(true, at)).toBe(phaseAt(at));
  expect(phaseFor(false, at)).toBe(STILL_PHASE);
});
