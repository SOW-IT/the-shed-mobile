import { describe, expect, it } from "vitest";
import type { DuelView } from "./duel";
import { duelWakeDelay, nextDuelWakeMs } from "./duelTiming";

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

describe("duelWakeDelay", () => {
  it("counts from the real time, so a duel that arrives after a long quiet still starts on time", () => {
    expect(duelWakeDelay(baseDuel, 1_000, 9_500, false)).toBe(500);
    expect(duelWakeDelay(baseDuel, 1_000, 12_000, false)).toBe(0);
  });

  it("wakes again after each countdown step, even when the step is the same length", () => {
    expect(duelWakeDelay(baseDuel, 11_001, 11_001, false)).toBe(1000);
    expect(duelWakeDelay(baseDuel, 12_001, 12_001, false)).toBe(1000);
  });

  it("does nothing without a duel", () => {
    expect(duelWakeDelay(null, 0, 0, false)).toBeNull();
  });
});
