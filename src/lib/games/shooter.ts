// Sky Shooter: a plane at the bottom fires upward on its own while enemies
// fly in from the top and sides and shoot back. Points for every tenth of a
// second survived and for every enemy shot down. Pure: each step takes a
// state and returns the next.
import { between, random } from "./random";

export const SHOOTER = {
  /** The plane's hit circle. Small on purpose: you dodge with the core. */
  hitRadius: 5,
  planeSize: 34,
  shotSpeed: 720,
  shotEvery: 0.11,
  shotRadius: 4,
  bulletRadius: 5,
  smallRadius: 15,
  bigRadius: 24,
  smallPoints: 50,
  bigPoints: 150,
  pointsPerSecond: 10,
  /** How far outside the board enemies appear and are forgotten. */
  margin: 40,
} as const;

export type Bullet = { id: number; x: number; y: number; vx: number; vy: number };
export type Enemy = {
  id: number;
  kind: "small" | "big";
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  fireIn: number;
};

export type ShooterState = {
  width: number;
  height: number;
  over: boolean;
  time: number;
  kills: number;
  killPoints: number;
  score: number;
  player: { x: number; y: number };
  shots: Bullet[];
  enemies: Enemy[];
  bullets: Bullet[];
  fireIn: number;
  spawnIn: number;
  nextId: number;
  seed: number;
};

export const newShooter = (width: number, height: number, seed: number): ShooterState => ({
  width,
  height,
  over: false,
  time: 0,
  kills: 0,
  killPoints: 0,
  score: 0,
  player: { x: width / 2, y: height - 70 },
  shots: [],
  enemies: [],
  bullets: [],
  fireIn: 0,
  spawnIn: 0.8,
  nextId: 1,
  seed,
});

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Moves the plane by a drag, keeping it on the lower part of the board. */
export const moveShooter = (state: ShooterState, dx: number, dy: number): ShooterState => {
  if (state.over) return state;
  const half = SHOOTER.planeSize / 2;
  return {
    ...state,
    player: {
      x: clamp(state.player.x + dx, half, state.width - half),
      y: clamp(state.player.y + dy, state.height * 0.3, state.height - half),
    },
  };
};

export const shooterScore = (time: number, killPoints: number) =>
  Math.floor(time * SHOOTER.pointsPerSecond) + killPoints;

/** Seconds between enemies: about one a second at first, three a second later. */
export const spawnInterval = (time: number) => Math.max(0.3, 1.1 - time * 0.012);

const fireInterval = (time: number) => Math.max(0.75, 2.2 - time * 0.02);
const bulletSpeed = (time: number) => Math.min(320, 170 + time * 2);

const spawnEnemy = (state: ShooterState): Enemy => {
  const big = state.time > 25 && random(state) < 0.2;
  const speed = between(state, 70, 120) + Math.min(80, state.time * 1.2);
  const edge = random(state);
  const m = SHOOTER.margin;
  const id = state.nextId++;
  const base = { id, kind: big ? "big" : "small", hp: big ? 6 : 1, fireIn: between(state, 0.6, 1.6) } as const;
  if (edge < 0.6) {
    const x = between(state, 30, state.width - 30);
    const drift = between(state, -0.35, 0.35);
    return { ...base, x, y: -m / 2, vx: speed * drift, vy: speed * (big ? 0.6 : 1) };
  }
  const fromLeft = edge < 0.8;
  const y = between(state, 20, state.height * 0.45);
  const across = speed * between(state, 0.8, 1.1);
  return {
    ...base,
    x: fromLeft ? -m / 2 : state.width + m / 2,
    y,
    vx: fromLeft ? across : -across,
    vy: speed * between(state, 0.15, 0.45),
  };
};

const fireAt = (state: ShooterState, enemy: Enemy): Bullet[] => {
  const dx = state.player.x - enemy.x;
  const dy = state.player.y - enemy.y;
  const angle = Math.atan2(dy, dx);
  const speed = bulletSpeed(state.time);
  const spread = enemy.kind === "big" ? [-0.4, -0.2, 0, 0.2, 0.4] : [0];
  return spread.map((offset) => ({
    id: state.nextId++,
    x: enemy.x,
    y: enemy.y,
    vx: Math.cos(angle + offset) * speed,
    vy: Math.sin(angle + offset) * speed,
  }));
};

const inside = (state: ShooterState, x: number, y: number, margin: number) =>
  x > -margin && x < state.width + margin && y > -margin * 2 && y < state.height + margin;

const radiusOf = (enemy: Enemy) => (enemy.kind === "big" ? SHOOTER.bigRadius : SHOOTER.smallRadius);

const near = (ax: number, ay: number, bx: number, by: number, distance: number) =>
  (ax - bx) ** 2 + (ay - by) ** 2 < distance ** 2;

export const stepShooter = (previous: ShooterState, dt: number): ShooterState => {
  if (previous.over) return previous;
  const state: ShooterState = { ...previous, player: { ...previous.player } };
  state.time += dt;

  const move = <B extends { x: number; y: number; vx: number; vy: number }>(item: B): B => ({
    ...item,
    x: item.x + item.vx * dt,
    y: item.y + item.vy * dt,
  });

  let shots = previous.shots.map(move).filter((shot) => shot.y > -20);
  state.fireIn -= dt;
  if (state.fireIn <= 0) {
    state.fireIn += SHOOTER.shotEvery;
    const lanes = state.time >= 30 ? [-8, 8] : [0];
    for (const lane of lanes) {
      shots.push({
        id: state.nextId++,
        x: state.player.x + lane,
        y: state.player.y - SHOOTER.planeSize / 2,
        vx: 0,
        vy: -SHOOTER.shotSpeed,
      });
    }
  }

  let enemies = previous.enemies.map(move);
  state.spawnIn -= dt;
  if (state.spawnIn <= 0) {
    state.spawnIn += spawnInterval(state.time);
    enemies.push(spawnEnemy(state));
  }

  const bullets = previous.bullets.map(move).filter((b) => inside(state, b.x, b.y, 20));
  enemies = enemies.map((enemy) => {
    const fireIn = enemy.fireIn - dt;
    if (fireIn > 0) return { ...enemy, fireIn };
    bullets.push(...fireAt(state, enemy));
    return { ...enemy, fireIn: fireIn + fireInterval(state.time) };
  });

  const spent = new Set<number>();
  enemies = enemies.filter((enemy) => {
    const r = radiusOf(enemy) + SHOOTER.shotRadius;
    for (const shot of shots) {
      if (spent.has(shot.id) || !near(shot.x, shot.y, enemy.x, enemy.y, r)) continue;
      spent.add(shot.id);
      enemy.hp -= 1;
      if (enemy.hp <= 0) {
        state.kills += 1;
        state.killPoints += enemy.kind === "big" ? SHOOTER.bigPoints : SHOOTER.smallPoints;
        return false;
      }
    }
    return inside(state, enemy.x, enemy.y, SHOOTER.margin * 2);
  });
  shots = shots.filter((shot) => !spent.has(shot.id));

  const { x, y } = state.player;
  const hitByBullet = bullets.some((b) => near(b.x, b.y, x, y, SHOOTER.bulletRadius + SHOOTER.hitRadius));
  const rammed = enemies.some((enemy) => near(enemy.x, enemy.y, x, y, radiusOf(enemy) * 0.7 + SHOOTER.hitRadius));

  state.shots = shots;
  state.enemies = enemies;
  state.bullets = bullets;
  state.over = hitByBullet || rammed;
  state.score = shooterScore(state.time, state.killPoints);
  return state;
};
