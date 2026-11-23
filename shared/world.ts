// Shed World, the Garden: the rules the app and the backend share. Only
// discrete actions cross the network. A tap sends one walk (from, to, start
// time) and every phone works out where that person is from it, so the
// backend never sees a position per frame.

export const WORLD_PLACE = "garden";
/** People per room. A full room opens the next instance of the place. */
export const ROOM_CAP = 20;
/** Walking speed, in world units a second. */
export const WALK_SPEED = 1.4;
/**
 * How far a voice carries. People further away still see a faded bubble.
 * Was 5 in the first build; Daniel asked for about half as far again.
 */
export const HEAR_RADIUS = 7.5;
/** How close two people must be for a high five or another mutual action. */
export const INTERACT_RADIUS = 2.5;
/** How long an ask ("High five?") waits for an answer before it lapses. */
export const ASK_MS = 10_000;
/** How long a mutual action plays once accepted. */
export const MUTUAL_MS = 2600;
export const MAX_SAY_LENGTH = 120;
/** How long a chat line is kept, unless someone reports it. */
export const CHAT_TTL_MS = 15 * 60_000;
/** Lines kept per room, whatever their age. */
export const CHAT_ROOM_CAP = 50;
/** Lines the chat sheet and list view show. */
export const CHAT_LOG_SIZE = 30;
/** Lines copied into a report, for context. */
export const REPORT_CONTEXT_LINES = 10;
/** The reported person's own recent lines kept in a report. */
export const REPORT_OWN_LINES = 5;
/** Blocks one person can keep. */
export const MAX_BLOCKS = 200;
/** How long someone's rate limits are kept after they leave. */
export const THROTTLE_KEEP_MS = 10 * 60_000;
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
/** How long an emote plays: the face, the body and the icon over the head. */
export const EMOTE_MS = 3500;

/**
 * Emotes, kept by id. Each has a face and a body animation on every phone
 * (src/world/Person.tsx) and an icon over the head.
 */
export const EMOTES = {
  wave: { label: "Wave", icon: "👋" },
  smile: { label: "Smile", icon: "😊" },
  laugh: { label: "Laugh", icon: "😂" },
  cheer: { label: "Cheer", icon: "🎉" },
  love: { label: "Love", icon: "💖" },
  surprised: { label: "Surprised", icon: "😮" },
  think: { label: "Think", icon: "🤔" },
  pout: { label: "Pout", icon: "😤" },
  cry: { label: "Cry", icon: "😢" },
  angry: { label: "Angry", icon: "💢" },
  sleepy: { label: "Sleepy", icon: "💤" },
  pray: { label: "Pray", icon: "🙏" },
} as const;
export type EmoteId = keyof typeof EMOTES;
export const EMOTE_IDS = Object.keys(EMOTES) as EmoteId[];
export const isEmote = (value: string): value is EmoteId => Object.hasOwn(EMOTES, value);

/**
 * Things two people do together. One asks, the other accepts within ASK_MS,
 * and both play it. Another (a hug, a fist bump, a dance) is one more entry
 * here plus its animation.
 */
export const MUTUALS = {
  highFive: { label: "High five", ask: "High five?", icon: "🙌" },
} as const;
export type MutualKind = keyof typeof MUTUALS;
export const isMutual = (value: string): value is MutualKind => Object.hasOwn(MUTUALS, value);

export type Ask = { kind: string; to: string; at: number };
export type Reply = { kind: string; to: string; askAt: number; at: number };

/** An ask still waiting for its answer at `now`, or null. */
export const openAsk = (ask: Ask | undefined, now: number): Ask | null =>
  ask && now - ask.at < ASK_MS ? ask : null;

/**
 * The mutual action playing between an asker and the person who accepted,
 * with how far through it is (0 to 1), or null. Every phone works this out
 * from the two rows, so both people play it at the same moment.
 */
export const liveMutual = (
  asker: { id: string; ask?: Ask },
  answerer: { id: string; reply?: Reply },
  now: number
): { kind: MutualKind; progress: number } | null => {
  const { ask } = asker;
  const { reply } = answerer;
  if (!ask || !reply || ask.to !== answerer.id || reply.to !== asker.id) return null;
  if (reply.askAt !== ask.at || reply.kind !== ask.kind || !isMutual(reply.kind)) return null;
  const progress = (now - reply.at) / MUTUAL_MS;
  return progress >= 0 && progress < 1 ? { kind: reply.kind, progress } : null;
};

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

/**
 * The courtyard between the hedges. Anything outside is scenery. It narrows
 * toward the front, where the camera sees less across, so nobody can stand
 * where a narrow phone wouldn't show them.
 */
export const WALK_BOUNDS = { minX: -3.9, maxX: 3.9, minZ: -10.8, maxZ: 7.6 } as const;
const NARROW_FROM_Z = 2;
const NARROW_PER_Z = 0.25;

/** How far either side of the middle someone can stand at depth z. */
export const halfWidthAt = (z: number) => WALK_BOUNDS.maxX - Math.max(0, z - NARROW_FROM_Z) * NARROW_PER_Z;

/** Things in the courtyard nobody stands inside, as ellipses on the ground. */
export const OBSTACLES = [
  { id: "birdbath", x: 0, z: -2.4, rx: 0.8, rz: 0.8 },
  { id: "pond", x: -2.9, z: 2.2, rx: 2.1, rz: 1.65 },
  { id: "arcade", x: -3.1, z: 5.7, rx: 0.6, rz: 0.5 },
  { id: "sign", x: 3.7, z: -6.4, rx: 0.3, rz: 0.3 },
] as const;
type Obstacle = (typeof OBSTACLES)[number];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The nearest spot inside the courtyard's outline. */
const inBounds = (x: number, z: number) => {
  const cz = clamp(z, WALK_BOUNDS.minZ, WALK_BOUNDS.maxZ);
  const half = halfWidthAt(cz);
  return { x: clamp(x, -half, half), z: cz };
};

const inside = (o: Obstacle, p: { x: number; z: number }) => Math.hypot((p.x - o.x) / o.rx, (p.z - o.z) / o.rz) < 1;

/** A spot just outside an obstacle's rim, at angle `a` round it. */
const onRim = (o: Obstacle, a: number) => ({ x: o.x + Math.cos(a) * o.rx * 1.02, z: o.z + Math.sin(a) * o.rz * 1.02 });

/**
 * The nearest place someone can stand to (x, z): inside the courtyard and
 * outside every obstacle. A bad number lands at the spawn point.
 */
export const clampTarget = (x: number, z: number): { x: number; z: number } => {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { ...SPAWN };
  let p = inBounds(x, z);
  for (const o of OBSTACLES) {
    if (!inside(o, p)) continue;
    // Out along the line from the obstacle's middle; straight down from its
    // middle when the tap was dead centre.
    const ux = (p.x - o.x) / o.rx;
    const uz = (p.z - o.z) / o.rz;
    const rim = ux === 0 && uz === 0 ? onRim(o, Math.PI / 2) : onRim(o, Math.atan2(uz, ux));
    p = inBounds(rim.x, rim.z);
  }
  const stuck = OBSTACLES.find((o) => inside(o, p));
  if (!stuck) return p;
  // The courtyard's edge pushed it back in (the pond reaches past the west
  // edge): the nearest free spot on that rim inside the courtyard.
  let best: { x: number; z: number } | null = null;
  for (let i = 0; i < 64; i++) {
    const q = onRim(stuck, (i / 64) * Math.PI * 2);
    const b = inBounds(q.x, q.z);
    if (b.x !== q.x || b.z !== q.z || OBSTACLES.some((o) => inside(o, q))) continue;
    if (!best || Math.hypot(q.x - x, q.z - z) < Math.hypot(best.x - x, best.z - z)) best = q;
  }
  return best ?? { ...SPAWN };
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

/** How many choices each part of a look has. Palettes grow by appending. */
/**
 * How many choices each part of a look has. Palettes grow by appending, so a
 * saved index keeps its meaning. The first four are in every look; the rest
 * came later and are optional, so a look saved before them (or by an older
 * app) is still valid and draws with their defaults.
 */
export const LOOK_SIZES = {
  skin: 8,
  hair: 12,
  hairColour: 9,
  shirt: 10,
  hat: 5,
  accessory: 4,
  face: 5,
  eyes: 6,
  eyeColour: 6,
  brows: 5,
  nose: 4,
  mouth: 5,
  height: 5,
  build: 5,
  freckles: 2,
  blush: 3,
  beard: 4,
} as const;
/** The look's shape: version 2 added the face, body and extras. */
export const LOOK_VERSION = 2;
export type Look = {
  skin: number;
  hair: number;
  hairColour: number;
  shirt: number;
  hat?: number;
  accessory?: number;
  /** The version of the editor that saved it (missing before version 2). */
  v?: number;
  face?: number;
  eyes?: number;
  eyeColour?: number;
  brows?: number;
  nose?: number;
  mouth?: number;
  height?: number;
  build?: number;
  freckles?: number;
  blush?: number;
  beard?: number;
};
export type LookPart = keyof typeof LOOK_SIZES;
const LOOK_PARTS = Object.keys(LOOK_SIZES) as LookPart[];
const REQUIRED: readonly LookPart[] = ["skin", "hair", "hairColour", "shirt"];

/** What a missing optional part means: the look from before it existed. */
const LOOK_DEFAULTS = {
  hat: 0,
  accessory: 0,
  face: 0,
  eyes: 0,
  eyeColour: 0,
  brows: 0,
  nose: 0,
  mouth: 0,
  height: 2,
  build: 2,
  freckles: 0,
  blush: 1,
  beard: 0,
} as const;
/** A part of a look, or its default when the look predates it. */
export const lookPart = (look: Look, part: LookPart): number => {
  const value = look[part];
  return value ?? (LOOK_DEFAULTS as Record<string, number>)[part] ?? 0;
};

export const HAIR_STYLES = [
  "Short",
  "Bun",
  "Long",
  "Curly",
  "Pigtails",
  "Spiky",
  "Buzz",
  "Ponytail",
  "Bald",
  "Bob",
  "Afro",
  "Side swept",
] as const;
export const HATS = ["None", "Cap", "Beanie", "Flower crown", "Sun hat"] as const;
export const ACCESSORIES = ["None", "Glasses", "Backpack", "Scarf"] as const;
export const FACES = ["Round", "Oval", "Square", "Heart", "Long"] as const;
export const EYES = ["Dots", "Round", "Sleepy", "Sparkly", "Wide", "Narrow"] as const;
export const BROWS = ["None", "Soft", "Straight", "Arched", "Thick"] as const;
export const NOSES = ["None", "Dot", "Button", "Pointy"] as const;
export const MOUTHS = ["None", "Smile", "Grin", "Small", "Flat"] as const;
export const BLUSH = ["None", "Light", "Rosy"] as const;
export const BEARDS = ["None", "Stubble", "Beard", "Moustache"] as const;
export const ON_OFF = ["Off", "On"] as const;

/**
 * How tall and how broad someone is drawn, from their height and build
 * steps. Clamped to a narrow range so everyone stays readable; it changes
 * only the drawing, never where they stand, how close they can get or who
 * can hear them.
 */
export const bodyScale = (look: Look) => ({
  height: 0.88 + lookPart(look, "height") * 0.06,
  width: 0.85 + lookPart(look, "build") * 0.075,
});

/**
 * Someone's look until they save their own, picked from their email so it's
 * the same everywhere. It uses the first build's ranges, so nobody's
 * default changed when the choices grew.
 */
export const lookFor = (seed: string): Look => {
  const h = hash(seed);
  return {
    skin: h % 6,
    hair: (h >>> 4) % 3,
    hairColour: (h >>> 8) % 6,
    shirt: (h >>> 12) % 8,
  };
};

/** Whether every part of a look is one of the choices (bounds checked on the server). */
export const isValidLook = (look: Look): boolean =>
  (look.v === undefined || (Number.isInteger(look.v) && look.v >= 1 && look.v <= LOOK_VERSION)) &&
  LOOK_PARTS.every((part) => {
    const value = look[part];
    if (value === undefined) return !REQUIRED.includes(part);
    return Number.isInteger(value) && value >= 0 && value < LOOK_SIZES[part];
  });

/** A look picked at random, for the editor's Randomise button. */
export const randomLook = (random: () => number = Math.random): Look => {
  const pick = (part: LookPart) => Math.floor(random() * LOOK_SIZES[part]);
  // Mostly none, so not everyone gets a hat, a beard and freckles at once.
  const rarely = (part: LookPart, chance: number) => (random() < chance ? pick(part) : 0);
  return {
    v: LOOK_VERSION,
    skin: pick("skin"),
    hair: pick("hair"),
    hairColour: pick("hairColour"),
    shirt: pick("shirt"),
    hat: rarely("hat", 0.5),
    accessory: rarely("accessory", 0.4),
    face: pick("face"),
    eyes: pick("eyes"),
    eyeColour: pick("eyeColour"),
    brows: pick("brows"),
    nose: pick("nose"),
    mouth: pick("mouth"),
    height: pick("height"),
    build: pick("build"),
    freckles: rarely("freckles", 0.5),
    blush: pick("blush"),
    beard: rarely("beard", 0.3),
  };
};

/** A saved look can't change more often than this. */
export const LOOK_SAVE_GAP_MS = 3000;

/** The name over someone's head: the first word of their name. */
export const tagName = (name: string): string => {
  // By code point, so an emoji is never cut in half.
  const first = Array.from(name.trim().split(/\s+/)[0] ?? "");
  return first.length > 14 ? `${first.slice(0, 13).join("")}…` : first.join("") || "Someone";
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
  // Matches the app's throttle while a finger is held: at most a move every
  // 500 ms, so others see a drag about twice a second.
  move: { burst: 4, refillMs: 500 },
  act: { burst: 3, refillMs: 6000 },
  say: { burst: 3, refillMs: 10_000 },
  /** Joining again after leaving, so coming and going can't refill the others. */
  join: { burst: 4, refillMs: 30_000 },
} as const;
export type BucketKind = keyof typeof BUCKETS;
type Bucket = { tokens: number; at: number };

export const fullBucket = (kind: BucketKind, now: number): Bucket => ({ tokens: BUCKETS[kind].burst, at: now });

type TakeResult = { ok: true; bucket: Bucket } | { ok: false; retryInMs: number };

export const takeToken = (kind: BucketKind, bucket: Bucket, now: number): TakeResult => {
  const { burst, refillMs } = BUCKETS[kind];
  const tokens = Math.min(burst, bucket.tokens + Math.max(0, now - bucket.at) / refillMs);
  if (tokens >= 1) return { ok: true, bucket: { tokens: tokens - 1, at: now } };
  // Rounded up, less a hair, so float noise doesn't add a millisecond.
  return { ok: false, retryInMs: Math.ceil((1 - tokens) * refillMs - 1e-6) };
};
