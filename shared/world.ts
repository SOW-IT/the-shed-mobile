// Shed World, the Garden: the rules the app and the backend share. Only
// discrete actions cross the network. A tap sends one walk (from, to, start
// time) and every phone works out where that person is from it, so the
// backend never sees a position per frame.

export const WORLD_PLACE = "garden";
/** People per room. A full room opens the next instance of the place. */
export const ROOM_CAP = 20;
/** Walking speed, in world units a second. */
export const WALK_SPEED = 1.4;
/** How far a voice carries. People further away still see a faded bubble. */
export const HEAR_RADIUS = 5;
export const MAX_SAY_LENGTH = 120;
/** How long a chat line is kept, unless someone reports it. */
export const CHAT_TTL_MS = 15 * 60_000;
/** Lines kept per room, whatever their age. */
export const CHAT_ROOM_CAP = 50;
/** Lines the chat sheet and list view show. */
export const CHAT_LOG_SIZE = 30;
/** Lines copied into a report, for context. */
export const REPORT_CONTEXT_LINES = 10;
/** Reports one person can file in REPORT_WINDOW_MS. */
export const REPORTS_PER_WINDOW = 5;
export const REPORT_WINDOW_MS = 10 * 60_000;
/** Someone silent this long has left (the app was killed, or lost signal). */
export const PRESENCE_TTL_MS = 90_000;
/** The app says it's still here after this long without doing anything. */
export const HEARTBEAT_IDLE_MS = 45_000;
/** An action marks you present only when the last mark is older than this. */
export const PRESENCE_TOUCH_MS = 20_000;
export const SWEEP_EVERY_MS = 30_000;
/** How long a chat bubble stays over someone's head. */
export const BUBBLE_MS = 8000;
/** How long an emote floats over someone's head. */
export const EMOTE_MS = 2600;

export const EMOTES = ["👋", "💚", "🙏", "😂", "🎉"] as const;
export type Emote = (typeof EMOTES)[number];
export const isEmote = (value: string): value is Emote => (EMOTES as readonly string[]).includes(value);

/** The latest walk of one person: everything a phone needs to place them. */
export interface Walk {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  startedAt: number;
}

export interface Pose {
  x: number;
  z: number;
  walking: boolean;
  /** Radians; 0 faces the camera (+z), positive turns to the right (+x). */
  heading: number;
  arrivesAt: number;
}

/** Where someone is at `now`: a straight line at WALK_SPEED from the walk's start. */
export const posAt = (walk: Walk, now: number): Pose => {
  const dx = walk.toX - walk.fromX;
  const dz = walk.toZ - walk.fromZ;
  const dist = Math.hypot(dx, dz);
  const duration = (dist / WALK_SPEED) * 1000;
  const k = duration === 0 ? 1 : Math.min(1, Math.max(0, (now - walk.startedAt) / duration));
  return {
    x: walk.fromX + dx * k,
    z: walk.fromZ + dz * k,
    walking: k < 1,
    heading: dist === 0 ? 0 : Math.atan2(dx, dz),
    arrivesAt: walk.startedAt + duration,
  };
};

export const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

export const canHear = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  distance(a, b) <= HEAR_RADIUS;

/** The courtyard between the hedges. Anything outside is scenery. */
export const WALK_BOUNDS = { minX: -3.9, maxX: 3.9, minZ: -10.8, maxZ: 7.6 } as const;

/** Things in the courtyard nobody stands inside, as ellipses on the ground. */
export const OBSTACLES = [
  { id: "birdbath", x: 0, z: -2.4, rx: 0.8, rz: 0.8 },
  { id: "pond", x: -2.9, z: 2.2, rx: 2.1, rz: 1.65 },
  { id: "arcade", x: -3.1, z: 5.7, rx: 0.6, rz: 0.5 },
  { id: "sign", x: 3.7, z: -6.4, rx: 0.3, rz: 0.3 },
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The nearest place someone can stand to (x, z): inside the courtyard and
 * outside every obstacle. A bad number lands at the spawn point.
 */
export const clampTarget = (x: number, z: number): { x: number; z: number } => {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { ...SPAWN };
  let px = clamp(x, WALK_BOUNDS.minX, WALK_BOUNDS.maxX);
  let pz = clamp(z, WALK_BOUNDS.minZ, WALK_BOUNDS.maxZ);
  for (const o of OBSTACLES) {
    const ux = (px - o.x) / o.rx;
    const uz = (pz - o.z) / o.rz;
    const r = Math.hypot(ux, uz);
    if (r >= 1) continue;
    // Out along the line from the obstacle's middle; straight down from its
    // middle when the tap was dead centre.
    const [nx, nz] = r === 0 ? [0, 1] : [ux / r, uz / r];
    px = o.x + nx * o.rx * 1.02;
    pz = o.z + nz * o.rz * 1.02;
  }
  return {
    x: clamp(px, WALK_BOUNDS.minX, WALK_BOUNDS.maxX),
    z: clamp(pz, WALK_BOUNDS.minZ, WALK_BOUNDS.maxZ),
  };
};

/** Where people arrive: on the path at the front of the garden. */
export const SPAWN = { x: 0.2, z: 6.2 } as const;

/** A small, stable spread around the spawn point, so arrivals don't stack. */
export const spawnFor = (seed: string): { x: number; z: number } => {
  const h = hash(seed);
  return clampTarget(SPAWN.x + ((h % 21) - 10) / 10, SPAWN.z - ((h >>> 5) % 9) / 10);
};

/** FNV-1a: a stable number from a string, the same on every device. */
export const hash = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const LOOK_SIZES = { skin: 6, hair: 3, hairColour: 6, shirt: 8 } as const;
export type Look = { skin: number; hair: number; hairColour: number; shirt: number };

/** Someone's avatar, picked from their email so it's the same everywhere. */
export const lookFor = (seed: string): Look => {
  const h = hash(seed);
  return {
    skin: h % LOOK_SIZES.skin,
    hair: (h >>> 4) % LOOK_SIZES.hair,
    hairColour: (h >>> 8) % LOOK_SIZES.hairColour,
    shirt: (h >>> 12) % LOOK_SIZES.shirt,
  };
};

/** The name over someone's head: the first word of their name. */
export const tagName = (name: string): string => {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.length > 14 ? `${first.slice(0, 13)}…` : first || "Someone";
};

/** A chat line as it's kept: trimmed, one line, at most MAX_SAY_LENGTH. */
export const cleanLine = (raw: string): string | null => {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const chars = Array.from(text);
  return chars.length > MAX_SAY_LENGTH ? chars.slice(0, MAX_SAY_LENGTH).join("") : text;
};

/**
 * Rate limits, as token buckets kept on each person's own state row. Checking
 * one costs nothing, and an action turned away writes nothing.
 */
export const BUCKETS = {
  move: { burst: 5, refillMs: 3000 },
  act: { burst: 3, refillMs: 6000 },
  say: { burst: 3, refillMs: 10_000 },
} as const;
export type BucketKind = keyof typeof BUCKETS;
export type Bucket = { tokens: number; at: number };

export const fullBucket = (kind: BucketKind, now: number): Bucket => ({ tokens: BUCKETS[kind].burst, at: now });

export type TakeResult = { ok: true; bucket: Bucket } | { ok: false; retryInMs: number };

export const takeToken = (kind: BucketKind, bucket: Bucket, now: number): TakeResult => {
  const { burst, refillMs } = BUCKETS[kind];
  const tokens = Math.min(burst, bucket.tokens + Math.max(0, now - bucket.at) / refillMs);
  if (tokens >= 1) return { ok: true, bucket: { tokens: tokens - 1, at: now } };
  // Rounded up, less a hair, so float noise doesn't add a millisecond.
  return { ok: false, retryInMs: Math.ceil((1 - tokens) * refillMs - 1e-6) };
};
