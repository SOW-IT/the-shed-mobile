// Sky Shooter: a plane at the bottom fires upward on its own while enemies
// fly in from the top and sides and shoot back. Points for every tenth of a
// second survived and for every enemy shot down. Pure: each step takes a
// state and returns the next.
import { between, random } from "./random";
import { SHOOTER_V2 } from "./shooterTuning";

export const SHOOTER = {
  /** The plane's hit circle. Small on purpose: you dodge with the core. */
  hitRadius: 5,
  planeSize: 34,
  shotSpeed: 720,
  shotEvery: 0.11,
  shotRadius: 4,
  bulletRadius: 5,
  smallRadius: 15,
  fastRadius: 13,
  bigRadius: 24,
  giantRadius: 34,
  smallPoints: 50,
  fastPoints: 100,
  bigPoints: 150,
  giantPoints: 250,
  pointsPerSecond: 10,
  /** How far outside the board enemies appear and are forgotten. */
  margin: 40,
  hardFromSeconds: SHOOTER_V2.fromSeconds,
  waveSeconds: SHOOTER_V2.waveSeconds,
  tighteningWaves: SHOOTER_V2.wavesToHalfway,
  spawnFloor: SHOOTER_V2.spawnFloor,
  fireFloor: SHOOTER_V2.fireFloor,
  bulletGrowth: SHOOTER_V2.bulletSpeedGrowth,
  enemyGrowth: SHOOTER_V2.enemySpeedGrowth,
  firstBigShare: 0.2,
  mostBigShare: SHOOTER_V2.mostBigShare,
  ringBullets: SHOOTER_V2.ringBullets,
  giantRingBullets: SHOOTER_V2.giantRingBullets,
  ringSpeedShare: SHOOTER_V2.ringSpeedShare,
  enemyFireDelay: SHOOTER_V2.enemyFireDelay,
  doubleFromScore: SHOOTER_V2.doubleFromScore,
  coneFromScore: SHOOTER_V2.coneFromScore,
  tripleConeFromScore: SHOOTER_V2.tripleConeFromScore,
  ringFromScore: SHOOTER_V2.ringFromScore,
  fastFromScore: SHOOTER_V2.fastFromScore,
  fastFireShare: SHOOTER_V2.fastFireShare,
  giantFromScore: SHOOTER_V2.giantFromScore,
} as const;

export type Bullet = { id: number; x: number; y: number; vx: number; vy: number };
export type Enemy = {
  id: number;
  kind: "small" | "fast" | "big" | "giant";
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  fireIn: number;
  /** Seconds the enemy has been visible on screen. */
  shown?: number;
  volleys?: number;
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

/** Moves the plane by a drag, keeping it anywhere inside the board. */
export const moveShooter = (state: ShooterState, dx: number, dy: number): ShooterState => {
  if (state.over) return state;
  const half = SHOOTER.planeSize / 2;
  return {
    ...state,
    player: {
      x: clamp(state.player.x + dx, half, state.width - half),
      y: clamp(state.player.y + dy, half, state.height - half),
    },
  };
};

const shooterScore = (time: number, killPoints: number) =>
  Math.floor(time * SHOOTER.pointsPerSecond) + killPoints;

/** Equivalent difficulty time driven by score as a run climbs toward 10,000 and beyond. */
export const scoreDifficultyTime = (score: number) => {
  const over = Math.max(0, score - SHOOTER_V2.rampFromScore);
  const span = SHOOTER_V2.tripleConeFromScore - SHOOTER_V2.rampFromScore;
  const progress = over / span;
  return progress <= 1
    ? SHOOTER_V2.timeAtTenK * progress ** 1.1
    : SHOOTER_V2.timeAtTenK + (progress - 1) * SHOOTER_V2.timePerLateSpan;
};

const difficultyTime = (time: number, score = 0) => Math.max(time, scoreDifficultyTime(score));

export const shooterWave = (time: number, score = 0) => {
  const t = difficultyTime(time, score);
  return t < SHOOTER.hardFromSeconds ? 0 : 1 + Math.floor((t - SHOOTER.hardFromSeconds) / SHOOTER.waveSeconds);
};

export const tightening = (time: number, score = 0) => shooterWave(time, score) / (shooterWave(time, score) + SHOOTER.tighteningWaves);

const growth = (time: number, score = 0) => Math.log1p(shooterWave(time, score) / 2);

/** Seconds between enemies: about one a second at first, faster with time and score. */
export const spawnInterval = (time: number, score = 0) => {
  const t = difficultyTime(time, score);
  return Math.max(0.45, 1.2 - t * 0.011) - (0.45 - SHOOTER.spawnFloor) * tightening(time, score);
};

export const fireInterval = (time: number, score = 0) => {
  const t = difficultyTime(time, score);
  return Math.max(1.0, 2.4 - t * 0.02) - (1.0 - SHOOTER.fireFloor) * tightening(time, score);
};
export const bulletSpeed = (time: number, score = 0) => {
  const t = difficultyTime(time, score);
  return Math.min(230, 130 + t * 1.4) + SHOOTER.bulletGrowth * growth(time, score);
};
export const enemySpeedUp = (time: number, score = 0) => {
  const t = difficultyTime(time, score);
  return Math.min(60, t * 0.9) + SHOOTER.enemyGrowth * growth(time, score);
};
export const bigShare = (time: number, score = 0) =>
  SHOOTER.firstBigShare + (SHOOTER.mostBigShare - SHOOTER.firstBigShare) * tightening(time, score);

export const fastShare = (score: number) => {
  if (score < SHOOTER.fastFromScore) return 0;
  const span = SHOOTER.tripleConeFromScore - SHOOTER.fastFromScore;
  const share = Math.min(1, (score - SHOOTER.fastFromScore) / span);
  return SHOOTER_V2.fastShare + (SHOOTER_V2.mostFastShare - SHOOTER_V2.fastShare) * share;
};

export const enemyHp = (kind: Enemy["kind"], score = 0) => {
  if (kind === "giant") return 14;
  if (kind === "big") return score >= 9000 ? 9 : score >= 6000 ? 7 : 6;
  if (kind === "fast") return score >= 9000 ? 2 : 1;
  return score >= 9000 ? 2 : 1;
};

export const PATTERN_FROM = SHOOTER_V2.patternFrom;

export const patternsAt = (time: number, score = 0) => {
  const t = difficultyTime(time, score);
  return (Object.keys(PATTERN_FROM) as (keyof typeof PATTERN_FROM)[]).filter((pattern) => t >= PATTERN_FROM[pattern]);
};

export const enemyFireInterval = (kind: Enemy["kind"], time: number, score = 0) => {
  const base = fireInterval(time, score);
  if (kind === "fast") return base * SHOOTER.fastFireShare;
  if (kind === "giant") return base * SHOOTER_V2.giantFireShare;
  return base;
};

const spawnEnemy = (state: ShooterState): Enemy => {
  const t = difficultyTime(state.time, state.score);
  const giant = state.score >= SHOOTER.giantFromScore && random(state) < SHOOTER_V2.giantShare;
  const big = !giant && t > 25 && random(state) < bigShare(state.time, state.score);
  const fast = !giant && !big && random(state) < fastShare(state.score);
  const kind: Enemy["kind"] = giant ? "giant" : big ? "big" : fast ? "fast" : "small";
  const baseSpeed = between(state, 55, 95) + enemySpeedUp(state.time, state.score);
  const speed = giant ? baseSpeed * SHOOTER_V2.giantSpeedShare : fast ? baseSpeed * SHOOTER_V2.fastSpeedShare : baseSpeed;
  const edge = random(state);
  const m = SHOOTER.margin;
  const id = state.nextId++;
  const base = {
    id,
    kind,
    hp: enemyHp(kind, state.score),
    fireIn: fast ? between(state, 0.5, 1.0) : between(state, 0.6, 1.6),
    shown: 0,
  } as const;
  if (edge < 0.6 || giant) {
    const x = between(state, 44, state.width - 44);
    const drift = between(state, giant ? -0.2 : -0.35, giant ? 0.2 : 0.35);
    return { ...base, x, y: -m / 2, vx: speed * drift, vy: speed * (giant ? 0.75 : big ? 0.6 : 1) };
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

const FAN = [-0.4, -0.2, 0, 0.2, 0.4];
const WIDE_FAN = SHOOTER_V2.wideFanSpread;
const DOUBLE = SHOOTER_V2.doubleSpread;
const BURST = SHOOTER_V2.burstSpread;

export const volleyOf = (enemy: Pick<Enemy, "kind" | "volleys">, time: number, score = 0): { spread: readonly number[]; ring: boolean } => {
  if (enemy.kind === "giant") return { spread: [], ring: true };
  const t = difficultyTime(time, score);
  if (enemy.kind !== "big") {
    if (t >= PATTERN_FROM.burst) return { spread: BURST, ring: false };
    return { spread: t >= PATTERN_FROM.double ? DOUBLE : [0], ring: false };
  }
  if (t >= PATTERN_FROM.ring && (enemy.volleys ?? 0) % 2 === 1) return { spread: [], ring: true };
  return { spread: t >= PATTERN_FROM.wideFan ? WIDE_FAN : FAN, ring: false };
};

const fireAt = (state: ShooterState, enemy: Enemy): Bullet[] => {
  const dx = state.player.x - enemy.x;
  const dy = state.player.y - enemy.y;
  const angle = Math.atan2(dy, dx);
  const speed = bulletSpeed(state.time, state.score) * (enemy.kind === "fast" ? SHOOTER_V2.fastBulletSpeedShare : 1);
  const volley = volleyOf(enemy, state.time, state.score);
  const ringSpeed = speed * SHOOTER.ringSpeedShare;
  const ringCount = enemy.kind === "giant" ? SHOOTER.giantRingBullets : SHOOTER.ringBullets;
  const ringPhase = enemy.kind === "giant" && (enemy.volleys ?? 0) % 2 === 1 ? 0 : 0.5;
  const shots = volley.ring
    ? Array.from({ length: ringCount }, (_, i) => ({ angle: angle + (2 * Math.PI * (i + ringPhase)) / ringCount, speed: ringSpeed }))
    : volley.spread.map((offset) => ({ angle: angle + offset, speed }));
  return shots.map((shot) => ({
    id: state.nextId++,
    x: enemy.x,
    y: enemy.y,
    vx: Math.cos(shot.angle) * shot.speed,
    vy: Math.sin(shot.angle) * shot.speed,
  }));
};

const inside = (state: ShooterState, x: number, y: number, margin: number) =>
  x > -margin && x < state.width + margin && y > -margin * 2 && y < state.height + margin;

const onScreen = (state: ShooterState, x: number, y: number) =>
  x >= 0 && x <= state.width && y >= 0 && y <= state.height;

const radiusOf = (enemy: Enemy) =>
  enemy.kind === "giant"
    ? SHOOTER.giantRadius
    : enemy.kind === "big"
      ? SHOOTER.bigRadius
      : enemy.kind === "fast"
        ? SHOOTER.fastRadius
        : SHOOTER.smallRadius;

const pointsOf = (enemy: Enemy) =>
  enemy.kind === "giant"
    ? SHOOTER.giantPoints
    : enemy.kind === "big"
      ? SHOOTER.bigPoints
      : enemy.kind === "fast"
        ? SHOOTER.fastPoints
        : SHOOTER.smallPoints;

/** Player weapon layout: single, double at 3k, double + diagonal at 6k, triple + diagonal at 10k, all-around at 15k. */
export const playerVolley = (score: number): readonly { lane: number; angle: number }[] => {
  if (score >= SHOOTER.ringFromScore) {
    return [
      { lane: -12, angle: SHOOTER_V2.coneAngles[0] },
      { lane: -12, angle: 0 },
      { lane: 0, angle: 0 },
      { lane: 12, angle: 0 },
      { lane: 12, angle: SHOOTER_V2.coneAngles[1] },
      ...SHOOTER_V2.allAroundAngles.map((angle) => ({ lane: 0, angle })),
    ];
  }
  if (score >= SHOOTER.tripleConeFromScore) {
    return [
      { lane: -12, angle: SHOOTER_V2.coneAngles[0] },
      { lane: -12, angle: 0 },
      { lane: 0, angle: 0 },
      { lane: 12, angle: 0 },
      { lane: 12, angle: SHOOTER_V2.coneAngles[1] },
    ];
  }
  if (score >= SHOOTER.coneFromScore) {
    return [
      { lane: -10, angle: SHOOTER_V2.coneAngles[0] },
      { lane: -8, angle: 0 },
      { lane: 8, angle: 0 },
      { lane: 10, angle: SHOOTER_V2.coneAngles[1] },
    ];
  }
  if (score >= SHOOTER.doubleFromScore) return [{ lane: -8, angle: 0 }, { lane: 8, angle: 0 }];
  return [{ lane: 0, angle: 0 }];
};

const near = (ax: number, ay: number, bx: number, by: number, distance: number) =>
  (ax - bx) ** 2 + (ay - by) ** 2 < distance ** 2;

export const shooterAt = (width: number, height: number, seed: number, score: number): ShooterState => {
  const time = score / SHOOTER.pointsPerSecond;
  return { ...newShooter(width, height, seed), time, score };
};

export const stepShooter = (previous: ShooterState, dt: number): ShooterState => {
  if (previous.over) return previous;
  const state: ShooterState = { ...previous, player: { ...previous.player } };
  state.time += dt;

  const move = <B extends { x: number; y: number; vx: number; vy: number }>(item: B): B => ({
    ...item,
    x: item.x + item.vx * dt,
    y: item.y + item.vy * dt,
  });

  let shots = previous.shots.map(move).filter((shot) => inside(state, shot.x, shot.y, 20));
  state.fireIn -= dt;
  if (state.fireIn <= 0) {
    state.fireIn += SHOOTER.shotEvery;
    const half = SHOOTER.planeSize / 2;
    for (const { lane, angle } of playerVolley(state.score)) {
      const radial = lane === 0 && angle !== 0;
      shots.push({
        id: state.nextId++,
        x: state.player.x + (radial ? Math.sin(angle) * half : lane),
        y: state.player.y + (radial ? -Math.cos(angle) * half : -half),
        vx: Math.sin(angle) * SHOOTER.shotSpeed,
        vy: -Math.cos(angle) * SHOOTER.shotSpeed,
      });
    }
  }

  let enemies = previous.enemies.map(move);
  state.spawnIn -= dt;
  if (state.spawnIn <= 0) {
    state.spawnIn += spawnInterval(state.time, state.score);
    enemies.push(spawnEnemy(state));
  }

  const bullets = previous.bullets.map(move).filter((b) => inside(state, b.x, b.y, 20));
  enemies = enemies.map((enemy) => {
    const visible = onScreen(state, enemy.x, enemy.y);
    const shown = visible ? (enemy.shown ?? 0) + dt : (enemy.shown ?? 0);
    const fireIn = enemy.fireIn - dt;
    if (!visible || shown < SHOOTER.enemyFireDelay) return { ...enemy, shown, fireIn: Math.max(0, fireIn) };
    if (fireIn > 0) return { ...enemy, shown, fireIn };
    bullets.push(...fireAt(state, enemy));
    return {
      ...enemy,
      shown,
      fireIn: fireIn + enemyFireInterval(enemy.kind, state.time, state.score),
      volleys: (enemy.volleys ?? 0) + 1,
    };
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
        state.killPoints += pointsOf(enemy);
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
