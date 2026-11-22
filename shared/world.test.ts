import { describe, expect, test } from "vitest";
import {
  ASK_MS,
  BUCKETS,
  canHear,
  cleanLine,
  clampTarget,
  fullBucket,
  halfWidthAt,
  hash,
  HEAR_RADIUS,
  EMOTE_IDS,
  isEmote,
  isMutual,
  liveMutual,
  MUTUAL_MS,
  openAsk,
  LOOK_SIZES,
  isValidLook,
  lookFor,
  randomLook,
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
    expect(centre.x).toBeCloseTo(bath.x);
    expect(centre.z).toBeGreaterThan(bath.z + bath.rz);
  });
});

test("keeps a tap by the pond's west edge out of the pond, and narrows toward the front", () => {
  const pond = OBSTACLES[1];
  const out = clampTarget(-3.9, 2.2);
  expect(Math.hypot((out.x - pond.x) / pond.rx, (out.z - pond.z) / pond.rz)).toBeGreaterThanOrEqual(1);
  expect(out.x).toBeGreaterThanOrEqual(-halfWidthAt(out.z));
  expect(halfWidthAt(0)).toBe(WALK_BOUNDS.maxX);
  expect(clampTarget(99, WALK_BOUNDS.maxZ).x).toBeCloseTo(halfWidthAt(WALK_BOUNDS.maxZ));
  expect(halfWidthAt(WALK_BOUNDS.maxZ)).toBeLessThan(3);
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

test("isValidLook checks every part, and randomLook stays in range", () => {
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0 })).toBe(true);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0, hat: 4, accessory: 3 })).toBe(true);
  expect(isValidLook({ skin: 0, hair: 6, hairColour: 0, shirt: 0 })).toBe(false);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0, hat: 0.5 })).toBe(false);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: undefined as unknown as number })).toBe(false);
  for (const r of [0, 0.3, 0.55, 0.99]) expect(isValidLook(randomLook(() => r))).toBe(true);
  expect(isValidLook(randomLook())).toBe(true);
});

test("tagName shows a short first name", () => {
  expect(tagName("  Grace   Lee ")).toBe("Grace");
  expect(tagName("")).toBe("Someone");
  expect(tagName("Maximiliannnnnnnn")).toBe("Maximiliannnn…");
  expect(tagName("abcdefghijkl😀zzz")).toBe("abcdefghijkl😀…");
});

test("cleanLine trims, joins lines and caps the length", () => {
  expect(cleanLine("  hi\n  there ")).toBe("hi there");
  expect(cleanLine("   ")).toBeNull();
  expect(Array.from(cleanLine("🌸".repeat(200))!)).toHaveLength(MAX_SAY_LENGTH);
});

test("isEmote and isMutual know the choices, and nothing inherited", () => {
  expect(EMOTE_IDS).toContain("wave");
  expect([isEmote("wave"), isEmote("👋"), isEmote("toString")]).toEqual([true, false, false]);
  expect([isMutual("highFive"), isMutual("hug"), isMutual("constructor")]).toEqual([true, false, false]);
});

describe("mutual actions", () => {
  const ask = { kind: "highFive", to: "b", at: 1000 };
  const reply = { kind: "highFive", to: "a", askAt: 1000, at: 3000 };

  test("an ask is open for ASK_MS", () => {
    expect(openAsk(ask, 1000 + ASK_MS - 1)).toBe(ask);
    expect(openAsk(ask, 1000 + ASK_MS)).toBeNull();
    expect(openAsk(undefined, 0)).toBeNull();
  });

  test("plays from the answer for MUTUAL_MS, only when the ask and answer match", () => {
    const live = (r: typeof reply | undefined, now: number, a = ask) => liveMutual({ id: "a", ask: a }, { id: "b", reply: r }, now);
    expect(live(reply, 3000)).toEqual({ kind: "highFive", progress: 0 });
    expect(live(reply, 3000 + MUTUAL_MS / 2)!.progress).toBeCloseTo(0.5);
    expect(live(reply, 3000 + MUTUAL_MS)).toBeNull();
    expect(live(reply, 2999)).toBeNull();
    expect(live(undefined, 3000)).toBeNull();
    expect(live({ ...reply, to: "c" }, 3000)).toBeNull();
    expect(live(reply, 3000, { ...ask, to: "c" })).toBeNull();
    expect(live({ ...reply, askAt: 999 }, 3000)).toBeNull();
    expect(live({ ...reply, kind: "hug" }, 3000)).toBeNull();
    expect(live({ ...reply, kind: "hug" }, 3000, { ...ask, kind: "hug" })).toBeNull();
  });
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
    const third = BUCKETS.move.refillMs / 3;
    expect(takeToken("move", bucket, third)).toEqual({ ok: false, retryInMs: Math.ceil(BUCKETS.move.refillMs - third) });
    expect(takeToken("move", bucket, BUCKETS.move.refillMs).ok).toBe(true);
  });

  test("never banks more than the burst", () => {
    const r = takeToken("say", { tokens: 0, at: 0 }, 10 * 60_000);
    expect(r).toEqual({ ok: true, bucket: { tokens: BUCKETS.say.burst - 1, at: 10 * 60_000 } });
  });
});
