// Hop's numbers. Board units are the board's own pixels (its width is
// always GAME_VIEWS.hop.size), with altitude going up.
const GRAVITY = 1800;
const JUMP_SPEED = 880;
/** A spring sends you this many times as high as a normal bounce. */
const SPRING_HEIGHT = 2.2;

export const HOP = {
  /** Board units of climb per point of score. */
  unitsPerPoint: 2,
  gravity: GRAVITY,
  jumpSpeed: JUMP_SPEED,
  springHeight: SPRING_HEIGHT,
  /**
   * A height multiplier, not a speed one: with the same gravity, the launch
   * speed that rises SPRING_HEIGHT times as high is sqrt(SPRING_HEIGHT) times
   * the normal one.
   */
  springSpeed: JUMP_SPEED * Math.sqrt(SPRING_HEIGHT),
  /**
   * Steering: full speed the frame you press, the same the frame you turn
   * round, and almost a dead stop when let go (two frames at 60 fps, about
   * 5 units).
   */
  maxSpeed: 360,
  glide: 12_000,
  /**
   * The route is still laid as if steering took a moment to get going and to
   * turn round, as it did before 2.14.7. Steering is instant now, so every
   * jump has that much reach to spare.
   */
  routeSteer: { accel: 2800, reverse: 5200 },
  /** Everyone's collision box, whichever character is drawn. */
  box: { width: 40, height: 50 },
  platform: { width: 64, height: 14 },
  spring: { width: 22, height: 12 },
  item: { size: 28 },
  propeller: { seconds: 2.5, speed: 640 },
  jetpack: { seconds: 3.5, speed: 1150 },
  /** The last part of a flight, when the lift fades to a normal jump's speed. */
  boostFade: { seconds: 0.4, endSpeed: JUMP_SPEED * 0.6 },
  /** A route's next platform sits at least this far below the top of the jump that reaches it. */
  landingMargin: 26,
  /** And at least this far inside the sideways distance the jump can steer. */
  reachMargin: 14,
  /** The camera keeps you at most this share of the board above its bottom. */
  cameraShare: 0.45,
  /** Generated this far above the top of the board; dropped this far below its bottom. */
  ahead: 320,
  behind: 220,
  /** Falling off: how long the tumble lasts, and how far the camera follows you down. */
  dyingSeconds: 0.45,
  dyingPan: 70,
  /** How long landing squash, breaks and pickups take to play out. */
  landSeconds: 0.18,
  effectSeconds: 0.9,
  maxEffects: 12,
} as const;

/** Where the climb gets harder, in points. */
export const HOP_LEVELS = {
  moving: 300,
  breakable: 500,
  oneBounce: 900,
  propeller: 150,
  jetpack: 1500,
  /** Peak difficulty: past here nothing gets harder. */
  peak: 4500,
} as const;

export const HOP_DIFFICULTY = {
  gapMin: [50, 112],
  gapMax: [92, 189],
  /** Gaps inside a boost's landing corridor, where every jump can reach anywhere. */
  corridorGap: [60, 135],
  movingChance: [0.12, 0.34],
  movingSpeed: [45, 115],
  movingRange: [36, 70],
  breakableChance: [0.22, 0.5],
  oneBounceChance: [0.08, 0.2],
  oneBounceDecoyChance: [0.08, 0.16],
  springChance: [0.1, 0.045],
  propellerChance: 0.03,
  jetpackChance: 0.012,
} as const;

/**
 * The page's wash as you climb, in points. Between two stops the colours
 * blend; past the last the night stays.
 */
export const HOP_STAGES = [
  { at: 0, stage: "morning" },
  { at: 650, stage: "morning" },
  { at: 1000, stage: "clouds" },
  { at: 1650, stage: "clouds" },
  { at: 2050, stage: "dusk" },
  { at: 2550, stage: "dusk" },
  { at: 3000, stage: "night" },
] as const;

/** Altitude marks are inked every this many points. */
export const HOP_MARK_EVERY = 500;
