import { describe, expect, test } from "vitest";
import { birdX, FLAPPY, flap, gapHeight, newFlappy, pipeSpeed, stepFlappy, type FlappyState } from "./flappy";
import { between, random } from "./random";
import {
  duck,
  jump,
  newRunner,
  onGround,
  RUNNER,
  runnerHeight,
  runnerSpeed,
  sliding,
  stepRunner,
  type RunnerState,
} from "./runner";
import { moveShooter, newShooter, SHOOTER, spawnInterval, stepShooter, type ShooterState } from "./shooter";

const FRAME = 1 / 60;

const runFor = <S extends { over: boolean }>(state: S, seconds: number, step: (s: S, dt: number) => S, act?: (s: S) => S) => {
  let current = state;
  for (let t = 0; t < seconds && !current.over; t += FRAME) {
    current = step(act ? act(current) : current, FRAME);
  }
  return current;
};

describe("random", () => {
  test("is repeatable from a seed and stays in range", () => {
    const a = { seed: 42 };
    const b = { seed: 42 };
    const draws = Array.from({ length: 50 }, () => random(a));
    expect(Array.from({ length: 50 }, () => random(b))).toEqual(draws);
    expect(draws.every((n) => n >= 0 && n < 1)).toBe(true);
    const ranged = between({ seed: 7 }, 10, 20);
    expect(ranged).toBeGreaterThanOrEqual(10);
    expect(ranged).toBeLessThan(20);
  });
});

describe("shooter", () => {
  const quiet = (state: ShooterState): ShooterState => ({ ...state, spawnIn: 1e9 });

  test("the score rises the longer you survive, and the plane fires on its own", () => {
    const state = runFor(quiet(newShooter(360, 640, 1)), 3, stepShooter);
    expect(state.over).toBe(false);
    expect(state.score).toBe(Math.floor(state.time * SHOOTER.pointsPerSecond));
    expect(state.score).toBeGreaterThanOrEqual(29);
    expect(state.shots.length).toBeGreaterThan(0);
    expect(state.shots.every((shot) => shot.vy < 0)).toBe(true);
  });

  test("shooting an enemy down scores its points", () => {
    let state = quiet(newShooter(360, 640, 1));
    state = {
      ...state,
      enemies: [{ id: 999, kind: "small", x: state.player.x, y: 300, vx: 0, vy: 0, hp: 1, fireIn: 99 }],
    };
    state = runFor(state, 1, stepShooter);
    expect(state.kills).toBe(1);
    expect(state.score).toBe(Math.floor(state.time * SHOOTER.pointsPerSecond) + SHOOTER.smallPoints);
  });

  test("an enemy bullet on the plane ends the run, and nothing moves after", () => {
    let state = quiet(newShooter(360, 640, 1));
    const { x, y } = state.player;
    state = { ...state, bullets: [{ id: 999, x, y: y - 40, vx: 0, vy: 200 }] };
    state = runFor(state, 1, stepShooter);
    expect(state.over).toBe(true);
    expect(stepShooter(state, FRAME)).toBe(state);
    expect(moveShooter(state, 10, 10)).toBe(state);
  });

  test("enemies come in from outside the edges, faster as time goes on", () => {
    expect(spawnInterval(0)).toBeGreaterThan(spawnInterval(60));
    expect(spawnInterval(1000)).toBe(0.3);
    let state = newShooter(360, 640, 3);
    const seen: { x: number; y: number }[] = [];
    for (let i = 0; i < 600; i++) {
      const known = new Set(state.enemies.map((enemy) => enemy.id));
      state = stepShooter({ ...state, bullets: [] }, FRAME);
      for (const enemy of state.enemies) if (!known.has(enemy.id)) seen.push(enemy);
    }
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.every((e) => e.x < 0 || e.x > 360 || e.y < 0)).toBe(true);
  });

  test("dragging moves the plane but keeps it on the board", () => {
    const state = newShooter(360, 640, 1);
    expect(moveShooter(state, -1000, -1000).player).toEqual({ x: SHOOTER.planeSize / 2, y: 640 * 0.3 });
    expect(moveShooter(state, 1000, 1000).player).toEqual({ x: 360 - SHOOTER.planeSize / 2, y: 640 - SHOOTER.planeSize / 2 });
  });
});

describe("runner", () => {
  const withObstacle = (state: RunnerState, kind: "low" | "high"): RunnerState => ({
    ...state,
    nextIn: 1e9,
    obstacles: [
      kind === "low"
        ? { id: 999, kind, x: 200, width: 30, height: 46, bottom: 0 }
        : { id: 999, kind, x: 200, width: 46, height: RUNNER.highHeight, bottom: RUNNER.highBottom },
    ],
  });
  const nearby = (state: RunnerState) => state.obstacles.some((o) => o.x < RUNNER.x + 90 && o.x > RUNNER.x - 10);

  test("speeds up over time, up to a top speed, and scores the distance", () => {
    expect(runnerSpeed(0)).toBe(RUNNER.startSpeed);
    expect(runnerSpeed(10)).toBeGreaterThan(RUNNER.startSpeed);
    expect(runnerSpeed(1000)).toBe(RUNNER.topSpeed);
    const state = runFor({ ...newRunner(400, 1), nextIn: 1e9 }, 2, stepRunner);
    expect(state.score).toBe(Math.floor(state.distance / RUNNER.stride));
    expect(state.score).toBeGreaterThan(40);
  });

  test("running into a low obstacle ends the run; jumping clears it", () => {
    expect(runFor(withObstacle(newRunner(400, 1), "low"), 2, stepRunner).over).toBe(true);
    const cleared = runFor(withObstacle(newRunner(400, 1), "low"), 2, stepRunner, (s) =>
      s.obstacles.some((o) => o.x < RUNNER.x + 70 && o.x > RUNNER.x) ? jump(s) : s
    );
    expect(cleared.over).toBe(false);
  });

  test("standing into a high obstacle ends the run; sliding goes under it", () => {
    expect(runFor(withObstacle(newRunner(400, 1), "high"), 2, stepRunner).over).toBe(true);
    const slid = runFor(withObstacle(newRunner(400, 1), "high"), 2, stepRunner, (s) =>
      nearby(s) && !sliding(s) ? duck(s) : s
    );
    expect(slid.over).toBe(false);
  });

  test("can't jump again in the air; a swipe down there dives and slides on landing", () => {
    let state = jump(newRunner(400, 1));
    state = stepRunner({ ...state, nextIn: 1e9 }, 0.1);
    expect(onGround(state)).toBe(false);
    expect(jump(state)).toBe(state);
    state = duck(state);
    expect(state.vy).toBeLessThanOrEqual(-RUNNER.diveSpeed);
    state = runFor(state, 0.2, stepRunner);
    expect(onGround(state)).toBe(true);
    expect(sliding(state)).toBe(true);
    expect(runnerHeight(state)).toBe(RUNNER.slideHeight);
  });

  test("a player who reacts to each obstacle can keep going: the gaps are fair", () => {
    const autopilot = (s: RunnerState) => {
      const next = s.obstacles.find((o) => o.x + o.width > RUNNER.x - RUNNER.width / 2);
      if (!next) return s;
      const lead = next.x - RUNNER.x;
      if (next.kind === "low" && lead < s.speed * 0.2 + 20) return jump(s);
      if (next.kind === "high" && lead < s.speed * 0.15 + 20 && !sliding(s)) return duck(s);
      return s;
    };
    for (const seed of [1, 2, 3]) {
      const state = runFor(newRunner(400, seed), 90, stepRunner, autopilot);
      expect(state.over).toBe(false);
      expect(state.obstacles.length + state.nextId).toBeGreaterThan(20);
    }
  });
});

describe("flappy", () => {
  test("falls without flapping and the ground ends the run", () => {
    const state = runFor(newFlappy(360, 640, 1), 5, stepFlappy);
    expect(state.over).toBe(true);
    expect(state.y).toBe(640 - FLAPPY.groundHeight - FLAPPY.radius);
    expect(flap(state)).toBe(state);
  });

  test("a flap sends the bird up", () => {
    const state = stepFlappy(flap(newFlappy(360, 640, 1)), FRAME);
    expect(state.vy).toBeLessThan(0);
    expect(state.y).toBeLessThan(640 * 0.42);
  });

  test("each gap passed scores ten, and the gaps narrow and speed up over time", () => {
    expect(gapHeight(0)).toBeGreaterThan(gapHeight(30));
    expect(gapHeight(1000)).toBe(130);
    expect(pipeSpeed(1000)).toBeGreaterThan(pipeSpeed(0));
    const autopilot = (s: FlappyState) => {
      const next = s.pipes.find((p) => p.x + FLAPPY.pipeWidth > birdX(s) - FLAPPY.radius);
      const target = next ? next.gapTop + next.gapHeight * 0.62 : s.height * 0.45;
      return s.y > target && s.vy > 0 ? flap(s) : s;
    };
    const state = runFor(newFlappy(360, 640, 5), 30, stepFlappy, autopilot);
    expect(state.over).toBe(false);
    expect(state.gaps).toBeGreaterThan(10);
    expect(state.score).toBe(state.gaps * FLAPPY.pointsPerGap + Math.floor(state.time));
  });

  test("hitting a pipe ends the run", () => {
    let state = newFlappy(360, 640, 1);
    state = { ...state, nextIn: 1e9, pipes: [{ id: 9, x: birdX(state) + 20, gapTop: 0, gapHeight: 60, passed: false }] };
    expect(runFor(state, 1, stepFlappy, (s) => (s.vy > 0 ? flap(s) : s)).over).toBe(true);
  });
});
