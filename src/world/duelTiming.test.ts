import { describe, expect, it } from "vitest";
import type { DuelView } from "./duel";
import { nextDuelWakeMs } from "./duelTiming";

const baseDuel: DuelView = {
  id: "d1",
  a: "m1",
  b: "m2",
  round: 1,
  startsAt: 10_000,
  endsAt: 15_000,
  done: false,
};

describe("nextDuelWakeMs", () => {
  it("returns null when there is no duel", () => {
    expect(nextDuelWakeMs(null, 10_000, false)).toBeNull();
  });

  it("waits until startsAt before a round begins", () => {
    expect(nextDuelWakeMs(baseDuel, 9_200, false)).toBe(800);
  });

  it("wakes on integer second countdown boundaries while choosing", () => {
    expect(nextDuelWakeMs(baseDuel, 10_000, false)).toBe(1001);
    expect(nextDuelWakeMs(baseDuel, 10_350, false)).toBe(651);
    expect(nextDuelWakeMs(baseDuel, 14_700, false)).toBe(301);
  });

  it("returns null after round ends while waiting for server resolution", () => {
    expect(nextDuelWakeMs(baseDuel, 15_000, false)).toBeNull();
  });

  it("wakes for result reveal when showResult is enabled and stops once revealed", () => {
    const doneDuel: DuelView = {
      ...baseDuel,
      done: true,
      shown: { a: "rock", b: "scissors", at: 15_500, winner: "a" },
    };
    expect(nextDuelWakeMs(doneDuel, 15_100, false)).toBeNull();
    expect(nextDuelWakeMs(doneDuel, 15_100, true)).toBe(400);
    expect(nextDuelWakeMs(doneDuel, 15_500, true)).toBeNull();
  });
});
