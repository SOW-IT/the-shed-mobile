import { describe, expect, test } from "vitest";
import { SCORE_LIMITS } from "../../../shared/games";
import {
  bigShare,
  bulletSpeed,
  enemySpeedUp,
  fireInterval,
  moveShooter,
  newShooter,
  PATTERN_FROM,
  patternsAt,
  SHOOTER,
  shooterAt,
  shooterWave,
  spawnInterval,
  stepShooter,
  tightening,
  volleyOf,
  type ShooterState,
} from "./shooter";

const FRAME = 1 / 60;
const BOARD = { width: 390, height: 700 };
const DRAG_SPEED = 600;
const HORIZON = 48;
const STRIDE = 2;

const fingerprint = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16);
};

const DIRECTIONS = [
  { x: 0, y: 0 },
  ...Array.from({ length: 16 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 8), y: Math.sin((i * Math.PI) / 8) })),
];

const radiusOf = (kind: string) => (kind === "big" ? SHOOTER.bigRadius : SHOOTER.smallRadius);

const dodger = (state: ShooterState): ShooterState => {
  const half = SHOOTER.planeSize / 2;
  const home = { x: state.width / 2, y: state.height * 0.8 };
  let best = state;
  let bestScore = -Infinity;
  for (const hold of [1, 0.35]) {
    for (const pace of [1, 0.4]) {
      for (const way of DIRECTIONS) {
        if ((pace < 1 || hold < 1) && way.x === 0 && way.y === 0) continue;
        let px = state.player.x;
        let py = state.player.y;
        let clear = Infinity;
        for (let frame = STRIDE; frame <= HORIZON; frame += STRIDE) {
          const t = frame * FRAME;
          const moved = Math.min(t, hold * HORIZON * FRAME) * DRAG_SPEED * pace;
          px = Math.min(state.width - half, Math.max(half, state.player.x + way.x * moved));
          py = Math.min(state.height - half, Math.max(state.height * 0.3, state.player.y + way.y * moved));
          const weight = 1 + frame / HORIZON;
          for (const b of state.bullets) {
            const gap = Math.hypot(b.x + b.vx * t - px, b.y + b.vy * t - py) - SHOOTER.bulletRadius - SHOOTER.hitRadius;
            clear = Math.min(clear, gap * weight);
          }
          for (const e of state.enemies) {
            const gap = Math.hypot(e.x + e.vx * t - px, e.y + e.vy * t - py) - radiusOf(e.kind) * 0.7 - SHOOTER.hitRadius;
            clear = Math.min(clear, gap * weight);
          }
        }
        const score = Math.min(clear, 60) - (Math.hypot(px - home.x, py - home.y) / state.height) * 20;
        if (score > bestScore) {
          bestScore = score;
          best = moveShooter(state, way.x * DRAG_SPEED * pace * FRAME, way.y * DRAG_SPEED * pace * FRAME);
        }
      }
    }
  }
  return best;
};

const survives = (from: number, seed: number, seconds: number) => {
  let state = shooterAt(BOARD.width, BOARD.height, seed, from * SHOOTER.pointsPerSecond);
  const end = state.time + seconds;
  while (!state.over && state.time < end) {
    const before = state;
    state = stepShooter(dodger(state), FRAME);
    const moved = Math.hypot(state.player.x - before.player.x, state.player.y - before.player.y);
    expect(moved).toBeLessThanOrEqual(DRAG_SPEED * FRAME + 1e-9);
  }
  return !state.over;
};

const measure = (from: number, seconds: number) => {
  let enemies = 0;
  let bullets = 0;
  let speed = 0;
  for (const seed of [1, 2, 3, 4]) {
    let state: ShooterState = shooterAt(BOARD.width, BOARD.height, seed, from * SHOOTER.pointsPerSecond);
    for (let i = 0; i < 300; i++) state = { ...stepShooter(state, FRAME), over: false };
    const seen = new Set<number>([...state.enemies, ...state.bullets].map((item) => item.id));
    const end = state.time + seconds;
    while (state.time < end) {
      state = { ...stepShooter(state, FRAME), over: false };
      for (const enemy of state.enemies) {
        if (seen.has(enemy.id)) continue;
        seen.add(enemy.id);
        enemies++;
      }
      for (const bullet of state.bullets) {
        if (seen.has(bullet.id)) continue;
        seen.add(bullet.id);
        bullets++;
        speed = Math.max(speed, Math.hypot(bullet.vx, bullet.vy));
      }
    }
  }
  return { enemies: enemies / (4 * seconds), bullets: bullets / (4 * seconds), speed };
};

describe("Sky Shooter v2: past 75 s a new wave every 30 s, without end", () => {
  const TIMES = [75, 105, 135, 165, 195, 300, 600, 1200, 3600, 21_600];

  test("below 75 s seeded runs bring exactly the enemies and bullets 2.13.6 brought", () => {
    const runs = [1, 2, 3].map((seed) => {
      let state = newShooter(BOARD.width, BOARD.height, seed);
      const seen = new Set<number>();
      const rows: string[] = [];
      while (state.time < 74) {
        state = { ...stepShooter(state, FRAME), over: false };
        for (const item of [...state.enemies, ...state.bullets]) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          rows.push([item.id, item.x.toFixed(3), item.y.toFixed(3), item.vx.toFixed(3), item.vy.toFixed(3)].join(","));
        }
      }
      return `${rows.length}:${fingerprint(rows.join(";"))}`;
    });
    expect(runs).toEqual(["552:f1e5568", "521:f28d78ec", "653:f2564ce6"]);
    for (let time = 0; time < 75; time += 0.5) {
      expect(shooterWave(time)).toBe(0);
      expect(spawnInterval(time)).toBe(Math.max(0.3, 1.1 - time * 0.012));
      expect(fireInterval(time)).toBe(Math.max(0.75, 2.2 - time * 0.02));
      expect(bulletSpeed(time)).toBe(Math.min(320, 170 + time * 2));
      expect(enemySpeedUp(time)).toBe(Math.min(80, time * 1.2));
      expect(bigShare(time)).toBe(0.2);
    }
  });

  test("every wave brings enemies more often, firing sooner and faster, faster themselves and more of them big, and it never stops", () => {
    expect(TIMES.map(shooterWave)).toEqual([1, 2, 3, 4, 5, 8, 18, 38, 118, 718]);
    const times = [74, ...TIMES];
    const rising = (values: number[]) => values.slice(1).every((value, i) => value > values[i]);
    expect(rising(times.map((t) => -spawnInterval(t)))).toBe(true);
    expect(rising(times.map((t) => -fireInterval(t)))).toBe(true);
    expect(rising(times.map(bulletSpeed))).toBe(true);
    expect(rising(times.map(enemySpeedUp))).toBe(true);
    expect(rising(times.map(bigShare))).toBe(true);
    expect(rising(times.map(tightening))).toBe(true);
    for (const t of times) {
      expect(spawnInterval(t)).toBeGreaterThan(SHOOTER.spawnFloor);
      expect(fireInterval(t)).toBeGreaterThan(SHOOTER.fireFloor);
      expect(bigShare(t)).toBeLessThan(SHOOTER.mostBigShare);
    }
  });

  test("new bullet patterns come in at 120, 150, 240 and 360 s", () => {
    expect(patternsAt(119)).toEqual([]);
    expect(patternsAt(120)).toEqual(["double"]);
    expect(patternsAt(150)).toEqual(["double", "ring"]);
    expect(patternsAt(240)).toEqual(["double", "ring", "wideFan"]);
    expect(patternsAt(360)).toEqual(["double", "ring", "wideFan", "burst"]);
    const small = { kind: "small" as const };
    const big = (volleys: number) => ({ kind: "big" as const, volleys });
    expect(volleyOf(small, 100)).toEqual({ spread: [0], ring: false });
    expect(volleyOf(small, PATTERN_FROM.double).spread).toHaveLength(2);
    expect(volleyOf(small, PATTERN_FROM.burst).spread).toHaveLength(3);
    expect(volleyOf(big(1), 100).spread).toHaveLength(5);
    expect(volleyOf(big(0), PATTERN_FROM.ring).ring).toBe(false);
    expect(volleyOf(big(1), PATTERN_FROM.ring).ring).toBe(true);
    expect(volleyOf(big(2), PATTERN_FROM.wideFan).spread).toHaveLength(7);
  });

  test("a big enemy's ring goes all the way round, slower than its fan", () => {
    const start = { ...newShooter(BOARD.width, BOARD.height, 1), time: 200, spawnIn: 1e9 };
    const enemy = { id: 900, kind: "big" as const, x: 200, y: 100, vx: 0, vy: 0, hp: 99, fireIn: 0.001, volleys: 1 };
    const fired = stepShooter({ ...start, enemies: [enemy] }, FRAME).bullets;
    expect(fired).toHaveLength(SHOOTER.ringBullets);
    expect(fired.some((b) => b.vy < 0)).toBe(true);
    expect(fired.some((b) => b.vy > 0)).toBe(true);
    for (const b of fired) expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(bulletSpeed(200) * SHOOTER.ringSpeedShare, 6);
    const again = stepShooter({ ...start, enemies: [{ ...enemy, volleys: 2 }] }, FRAME).bullets;
    expect(again).toHaveLength(5);
  });

  test("measured, more enemies, more bullets and faster aimed bullets come each minute, from 60 s to 10 minutes", () => {
    const marks = [60, 120, 180, 300, 600].map((from) => measure(from, 20));
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i].enemies).toBeGreaterThan(marks[i - 1].enemies);
      expect(marks[i].bullets).toBeGreaterThan(marks[i - 1].bullets);
      expect(marks[i].speed).toBeGreaterThan(marks[i - 1].speed);
    }
    expect(marks[4].bullets).toBeGreaterThan(2 * marks[0].bullets);
  }, 60_000);

  test.each([120, 300, 600])(
    "from %i s a dodging player, dragging at most 600 points a second, lives 15 s on most seeds",
    (from) => {
      const seeds = Array.from({ length: 10 }, (_, i) => i + 1);
      const lived = seeds.filter((seed) => survives(from, seed, 15));
      expect(lived.length, `${lived.length} of ${seeds.length}`).toBeGreaterThanOrEqual(from >= 600 ? 6 : 8);
    },
    120_000
  );

  test("however long a run lasts, its points a second stay under the server's limit for v2", () => {
    const most = SHOOTER.pointsPerSecond + SHOOTER.bigPoints / SHOOTER.spawnFloor;
    expect(most).toBeLessThan(SCORE_LIMITS[2].shooter.perSecond);
    let state: ShooterState = shooterAt(BOARD.width, BOARD.height, 3, 6000);
    const start = state.time;
    for (let i = 0; i < 60 * 30; i++) state = { ...stepShooter(state, FRAME), over: false };
    expect(state.killPoints / (state.time - start)).toBeLessThan(SCORE_LIMITS[2].shooter.perSecond - SHOOTER.pointsPerSecond);
  });

  test("a run started at a score has that score and time, and plays on at that wave", () => {
    for (const score of [1, 750, 3000, 1_000_000]) {
      const state = shooterAt(BOARD.width, BOARD.height, 2, score);
      expect(state.score).toBe(score);
      expect(state.time).toBeCloseTo(score / SHOOTER.pointsPerSecond, 9);
    }
    const later = stepShooter(shooterAt(BOARD.width, BOARD.height, 2, 3000), FRAME);
    expect(later.score).toBeGreaterThanOrEqual(3000);
    expect(shooterWave(later.time)).toBe(shooterWave(300));
  });
});
