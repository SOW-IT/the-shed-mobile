import { describe, expect, test } from "vitest";
import { BALL_HOME, ballAt, KICK_SPEED, kickBall, kickDirection, restingBall, type Ball } from "./ball";
import { halfWidthAt, inWater, PLACE_OBSTACLES, WALK_BOUNDS } from "./world";

const at = (x: number, z: number, vx = 0, vz = 0): Ball => ({ x, z, vx, vz, at: 1000 });
const inside = (b: { x: number; z: number }) =>
  b.z >= WALK_BOUNDS.minZ && b.z <= WALK_BOUNDS.maxZ && Math.abs(b.x) <= halfWidthAt(b.z) + 1e-9;

describe("the beach ball rolling", () => {
  test("a ball nobody kicked rests where it starts", () => {
    const ball = ballAt(restingBall(), 50_000);
    expect(ball).toMatchObject({ ...BALL_HOME, vx: 0, vz: 0, rolling: false, floating: false, travelled: 0 });
  });

  test("a kick rolls it the kicked way, slowing until it stops", () => {
    const kicked = kickBall(restingBall(), { x: 1, z: 0 }, 1000);
    expect(kicked).toEqual({ ...BALL_HOME, vx: KICK_SPEED, vz: 0, at: 1000 });
    const soon = ballAt(kicked, 1300);
    expect(soon.x).toBeGreaterThan(BALL_HOME.x);
    expect(soon.rolling).toBe(true);
    expect(Math.hypot(soon.vx, soon.vz)).toBeLessThan(KICK_SPEED);
    const later = ballAt(kicked, 30_000);
    expect(later.rolling).toBe(false);
    expect(later.vx).toBe(0);
    expect(ballAt(kicked, 60_000)).toEqual(later);
  });

  test("every phone rolls it to the same spot from the same kick", () => {
    const kicked = kickBall(restingBall(), { x: 0.6, z: -0.8 }, 1000);
    expect(ballAt(kicked, 2345)).toEqual(ballAt({ ...kicked }, 2345));
  });

  test("it bounces off every edge people can reach and never leaves it", () => {
    for (const [vx, vz] of [[30, 0], [-30, 0], [0, 30], [0, -30], [20, 20], [-20, -25]]) {
      const ball = at(0, 0, vx, vz);
      for (let t = 1000; t <= 13_000; t += 250) expect(inside(ballAt(ball, t))).toBe(true);
    }
    const right = ballAt(at(halfWidthAt(0) - 0.1, 0, 8, 0), 1400);
    expect(right.vx).toBeLessThan(0);
    const front = ballAt(at(0, WALK_BOUNDS.maxZ - 0.1, 0, 8), 1400);
    expect(front.vz).toBeLessThan(0);
  });

  test("it floats out into the sea, slows faster there, and stays inside the edge", () => {
    const out = ballAt(at(0, -6.8, 0, -6), 20_000);
    expect(out.floating).toBe(true);
    expect(inWater("beach", out)).toBe(true);
    expect(out.z).toBeGreaterThanOrEqual(WALK_BOUNDS.minZ);
    const sand = ballAt(at(0, 4, 0, -3), 1500);
    const sea = ballAt(at(0, -8, 0, -3), 1500);
    expect(Math.abs(sea.vz)).toBeLessThan(Math.abs(sand.vz));
  });

  test("it bounces off the sandcastle instead of rolling through it", () => {
    const castle = PLACE_OBSTACLES.beach.find((o) => o.id === "castle")!;
    const ball = ballAt(at(castle.x - 1.5, castle.z, 4, 0), 3000);
    expect(ball.x).toBeLessThan(castle.x - castle.rx);
    const hits = ballAt(at(castle.x - 1.5, castle.z, 4, 0), 1500);
    expect(hits.vx).toBeLessThanOrEqual(0);
  });

  test("time before the kick leaves it where it was kicked", () => {
    expect(ballAt(at(1, 1, 5, 0), 500)).toMatchObject({ x: 1, z: 1, rolling: true, travelled: 0 });
  });
});

describe("which way a kick sends it", () => {
  test("the way asked, made a unit length", () => {
    expect(kickDirection({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 3 })).toEqual({ x: 0, z: 1 });
  });

  test("from the kicker to the ball when no way is given or it's nonsense", () => {
    expect(kickDirection({ x: 0, z: 0 }, { x: 0, z: -2 })).toEqual({ x: 0, z: -1 });
    expect(kickDirection({ x: 0, z: 0 }, { x: 3, z: 4 }, { x: Number.NaN, z: 1 })).toEqual({ x: 0.6, z: 0.8 });
    expect(kickDirection({ x: 0, z: 0 }, { x: 3, z: 4 }, { x: 0, z: 0 })).toEqual({ x: 0.6, z: 0.8 });
  });

  test("straight up the beach when the kicker stands on the ball", () => {
    expect(kickDirection({ x: 1, z: 1 }, { x: 1, z: 1 })).toEqual({ x: 0, z: -1 });
  });
});
