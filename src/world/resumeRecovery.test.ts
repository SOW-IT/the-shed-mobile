import { describe, expect, test } from "vitest";
import type { Walk } from "@shared/world";
import { canRecover, keepWalkOnRejoin, shouldAdoptServerWalk } from "./resumeRecovery";

const walk = (startedAt: number, toX = 0, toZ = 0): Walk => ({
  fromX: 0,
  fromZ: 0,
  toX,
  toZ,
  startedAt,
});

describe("canRecover", () => {
  test("allows recovery once when enabled and not already joining", () => {
    expect(canRecover({ enabled: true, joining: false, currentMemberId: "m1", forMemberId: "m1" })).toBe(true);
    expect(canRecover({ enabled: true, joining: false, currentMemberId: "m1" })).toBe(true);
  });

  test("blocks overlapping triggers while a join is already in flight", () => {
    expect(canRecover({ enabled: true, joining: true, currentMemberId: "m1", forMemberId: "m1" })).toBe(false);
    expect(canRecover({ enabled: false, joining: false, currentMemberId: "m1", forMemberId: "m1" })).toBe(false);
  });

  test("ignores a late trigger from an older member id after recovery succeeded", () => {
    expect(canRecover({ enabled: true, joining: false, currentMemberId: "m2", forMemberId: "m1" })).toBe(false);
    expect(canRecover({ enabled: true, joining: false, currentMemberId: "m2", forMemberId: "m2" })).toBe(true);
  });
});

describe("keepWalkOnRejoin", () => {
  test("keeps the local walk when rejoining the same place, resets across places", () => {
    expect(keepWalkOnRejoin({ roomId: "r1", place: "garden" }, { roomId: "r1", place: "garden" })).toBe(true);
    expect(keepWalkOnRejoin({ roomId: "r1", place: "home" }, { roomId: "r2", place: "garden" })).toBe(false);
    expect(keepWalkOnRejoin(null, { roomId: "r1", place: "garden" })).toBe(false);
  });

  test("a public place keeps the walk in a new room, a home or backyard only in the same room", () => {
    expect(keepWalkOnRejoin({ roomId: "r1", place: "garden" }, { roomId: "r2", place: "garden" })).toBe(true);
    expect(keepWalkOnRejoin({ roomId: "h1", place: "home" }, { roomId: "h2", place: "home" })).toBe(false);
    expect(keepWalkOnRejoin({ roomId: "h1", place: "home" }, { roomId: "h1", place: "home" })).toBe(true);
    expect(keepWalkOnRejoin({ roomId: "b1", place: "backyard" }, { roomId: "b2", place: "backyard" })).toBe(false);
  });
});

describe("shouldAdoptServerWalk", () => {
  test("does not overwrite a predicted tap while rejoining, queued or in flight", () => {
    const local = walk(1000, 3, -2);
    const spawn = walk(2500, 0, 0);
    expect(shouldAdoptServerWalk({ serverWalk: spawn, localWalk: local, predicting: true, joining: true, hasPending: false, inFlight: false })).toBe(false);
    expect(shouldAdoptServerWalk({ serverWalk: spawn, localWalk: local, predicting: true, joining: false, hasPending: true, inFlight: false })).toBe(false);
    expect(shouldAdoptServerWalk({ serverWalk: spawn, localWalk: local, predicting: true, joining: false, hasPending: false, inFlight: true })).toBe(false);
  });

  test("adopts the first walk, any newer walk when settled, or a walk well after ours while predicting", () => {
    const local = walk(1000, 3, -2);
    expect(shouldAdoptServerWalk({ serverWalk: null, localWalk: local, predicting: false, joining: false, hasPending: false, inFlight: false })).toBe(false);
    expect(shouldAdoptServerWalk({ serverWalk: walk(500), localWalk: null, predicting: false, joining: false, hasPending: false, inFlight: false })).toBe(true);
    expect(shouldAdoptServerWalk({ serverWalk: walk(1001), localWalk: local, predicting: false, joining: false, hasPending: false, inFlight: false })).toBe(true);
    expect(shouldAdoptServerWalk({ serverWalk: walk(1000), localWalk: local, predicting: false, joining: false, hasPending: false, inFlight: false })).toBe(false);
    expect(shouldAdoptServerWalk({ serverWalk: walk(1500), localWalk: local, predicting: true, joining: false, hasPending: false, inFlight: false })).toBe(false);
    expect(shouldAdoptServerWalk({ serverWalk: walk(2001), localWalk: local, predicting: true, joining: false, hasPending: false, inFlight: false })).toBe(true);
  });
});
