import { describe, expect, test } from "vitest";
import {
  BUCKETS,
  canHear,
  cleanLine,
  clampTarget,
  fullBucket,
  hash,
  HEAR_RADIUS,
  isEmote,
  LOOK_SIZES,
  lookFor,
  MAX_SAY_LENGTH,
  OBSTACLES,
  posAt,
  SPAWN,
  spawnFor,
  tagName,
  takeToken,
  WALK_BOUNDS,
  WALK_SPEED,
} from "./world";

describe("posAt", () => {
  const walk = { fromX: 0, fromZ: 0, toX: 3, toZ: 4, startedAt: 1000 };
  const duration = (5 / WALK_SPEED) * 1000;

  test("walks a straight line at the walking speed", () => {
    expect(posAt(walk, 1000)).toMatchObject({ x: 0, z: 0, walking: true });
    const half = posAt(walk, 1000 + duration / 2);
    expect(half.x).toBeCloseTo(1.5);
    expect(half.z).toBeCloseTo(2);
    expect(posAt(walk, 1000 + duration)).toMatchObject({ x: 3, z: 4, walking: false, arrivesAt: 1000 + duration });
    expect(posAt(walk, 0)).toMatchObject({ x: 0, z: 0 });
    expect(posAt(walk, 1000).heading).toBeCloseTo(Math.atan2(3, 4));
  });

  test("standing still faces the camera", () => {
    expect(posAt({ fromX: 1, fromZ: 1, toX: 1, toZ: 1, startedAt: 0 }, 5)).toEqual({
      x: 1,
      z: 1,
      walking: false,
      heading: 0,
      arrivesAt: 0,
    });
  });
});

test("canHear stops at the hearing radius", () => {
  expect(canHear({ x: 0, z: 0 }, { x: HEAR_RADIUS, z: 0 })).toBe(true);
  expect(canHear({ x: 0, z: 0 }, { x: HEAR_RADIUS + 0.01, z: 0 })).toBe(false);
});

describe("clampTarget", () => {
  test("keeps a spot inside the courtyard", () => {
    expect(clampTarget(1, 1)).toEqual({ x: 1, z: 1 });
    expect(clampTarget(99, -99)).toEqual({ x: WALK_BOUNDS.maxX, z: WALK_BOUNDS.minZ });
    expect(clampTarget(Number.NaN, 0)).toEqual(SPAWN);
  });

  test("pushes a spot out of an obstacle", () => {
    const bath = OBSTACLES[0];
    const out = clampTarget(bath.x + 0.2, bath.z);
    expect(out.x).toBeGreaterThan(bath.x + bath.rx);
    expect(out.z).toBeCloseTo(bath.z);
    const centre = clampTarget(bath.x, bath.z);
    expect(centre.x).toBe(bath.x);
    expect(centre.z).toBeGreaterThan(bath.z + bath.rz);
  });
});

test("spawnFor stays near the spawn point and is stable", () => {
  const a = spawnFor("anna@sow.org.au");
  expect(a).toEqual(spawnFor("anna@sow.org.au"));
  expect(Math.abs(a.x - SPAWN.x)).toBeLessThanOrEqual(1);
  expect(SPAWN.z - a.z).toBeLessThanOrEqual(0.8);
});

test("lookFor picks a stable look in range", () => {
  expect(hash("a")).not.toBe(hash("b"));
  for (const seed of ["a", "b", "anna@sow.org.au", ""]) {
    const look = lookFor(seed);
    expect(look).toEqual(lookFor(seed));
    expect(look.skin).toBeLessThan(LOOK_SIZES.skin);
    expect(look.hair).toBeLessThan(LOOK_SIZES.hair);
    expect(look.hairColour).toBeLessThan(LOOK_SIZES.hairColour);
    expect(look.shirt).toBeLessThan(LOOK_SIZES.shirt);
  }
});

test("tagName shows a short first name", () => {
  expect(tagName("  Grace   Lee ")).toBe("Grace");
  expect(tagName("")).toBe("Someone");
  expect(tagName("Maximiliannnnnnnn")).toBe("Maximiliannnn…");
});

test("cleanLine trims, joins lines and caps the length", () => {
  expect(cleanLine("  hi\n  there ")).toBe("hi there");
  expect(cleanLine("   ")).toBeNull();
  expect(Array.from(cleanLine("🌸".repeat(200))!)).toHaveLength(MAX_SAY_LENGTH);
});

test("isEmote knows the emote tray", () => {
  expect(isEmote("👋")).toBe(true);
  expect(isEmote("💩")).toBe(false);
});

describe("takeToken", () => {
  test("allows a burst, then one per refill", () => {
    let bucket = fullBucket("move", 0);
    for (let i = 0; i < BUCKETS.move.burst; i++) {
      const r = takeToken("move", bucket, 0);
      if (!r.ok) throw new Error("burst refused");
      bucket = r.bucket;
    }
    expect(takeToken("move", bucket, 0)).toEqual({ ok: false, retryInMs: BUCKETS.move.refillMs });
    expect(takeToken("move", bucket, 1000)).toEqual({ ok: false, retryInMs: 2000 });
    expect(takeToken("move", bucket, BUCKETS.move.refillMs).ok).toBe(true);
  });

  test("never banks more than the burst", () => {
    const r = takeToken("say", { tokens: 0, at: 0 }, 10 * 60_000);
    expect(r).toEqual({ ok: true, bucket: { tokens: BUCKETS.say.burst - 1, at: 10 * 60_000 } });
  });
});
