// Shed World, the Garden: the rules the app and the backend share. Only
// discrete actions cross the network. A tap sends one walk (from, to, start
// time) and every phone works out where that person is from it, so the
// backend never sees a position per frame.

import { PEN_OBSTACLES, PLOT_OBSTACLES } from "./farm";

export const WORLD_PLACE = "garden";
/** People per room. A full room opens the next instance of the place. */
export const ROOM_CAP = 20;
/** Walking speed, in world units a second. */
export const WALK_SPEED = 2.2;
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
export const MUTUAL_MS = 1750;
export const MAX_SAY_LENGTH = 100;
export const JOINED_WORLD = "joined the World";
/** How long a chat line is kept, unless someone reports it. */
export const CHAT_TTL_MS = 60 * 60_000;
/** Lines kept per room, whatever their age. */
export const CHAT_ROOM_CAP = 150;
/** Lines the chat sheet and list view show. */
export const CHAT_LOG_SIZE = 150;
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
export const LEAVE_GRACE_MS = 60_000;
export const TYPING_MS = 6000;
export const TYPING_REFRESH_MS = 3000;
export const PING_PUBLISH_MS = 30_000;
export const PING_PROBE_MS = 15_000;
export const PING_MAX_SAMPLE_MS = 10_000;
export const PING_SAMPLES = 5;
const PING_FIRST_SAMPLES = 3;
const PING_FIRST_GAP_MS = 1000;
const PING_STEPS_MS = [100, 200, 400] as const;
export type PingBars = 1 | 2 | 3 | 4;

export const isPingBars = (value: unknown): value is PingBars => value === 1 || value === 2 || value === 3 || value === 4;

export const pingBars = (ms: number): PingBars => {
  const [great, good, slow] = PING_STEPS_MS;
  return ms <= great ? 4 : ms <= good ? 3 : ms <= slow ? 2 : 1;
};

export const addPingSample = (samples: readonly number[], sample: number): number[] =>
  [...samples, Math.min(PING_MAX_SAMPLE_MS, Math.max(0, sample))].slice(-PING_SAMPLES);

export const pingEstimate = (samples: readonly number[]): number | null => {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export type PingReading = { visit: string; ms: number };

export const shownPing = (reading: PingReading | null, visit: string | null): number | null =>
  reading !== null && visit !== null && reading.visit === visit ? reading.ms : null;

export const pingProbeWait = ({ taken, lastAt, now }: { taken: number; lastAt: number | null; now: number }): number =>
  lastAt === null ? 0 : Math.max(0, lastAt + (taken < PING_FIRST_SAMPLES ? PING_FIRST_GAP_MS : PING_PROBE_MS) - now);

export const pingProbeDue = (at: { taken: number; lastAt: number | null; now: number }): boolean => pingProbeWait(at) === 0;

export const shouldPublishPing = ({
  bars,
  published,
  publishedAt,
  now,
}: {
  bars: PingBars;
  published: PingBars | null;
  publishedAt: number | null;
  now: number;
}): boolean => bars !== published && (publishedAt === null || now - publishedAt >= PING_PUBLISH_MS);
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
  cry: { label: "Sad", icon: "😢" },
  angry: { label: "Angry", icon: "💢" },
  sleepy: { label: "Sleepy", icon: "💤" },
  pray: { label: "Pray", icon: "🙏" },
} as const;
export type EmoteId = keyof typeof EMOTES;
export const EMOTE_IDS = Object.keys(EMOTES) as EmoteId[];
export const EMOTE_TRAY: readonly EmoteId[] = ["wave", "laugh", "cheer", "cry", "angry", "pray"];
export const isEmote = (value: string): value is EmoteId => Object.hasOwn(EMOTES, value);

/**
 * Things two people do together. One asks, the other accepts within ASK_MS,
 * and both play it. Another (a hug, a fist bump, a dance) is one more entry
 * here plus its animation.
 */
export const MUTUALS = {
  highFive: { label: "High five", ask: "High five?", icon: "🙌", accept: "High five!" },
} as const;
export type MutualKind = keyof typeof MUTUALS;
export const isMutual = (value: string): value is MutualKind => Object.hasOwn(MUTUALS, value);

export const ASKS = {
  ...MUTUALS,
  // The accept button is half an ask card, too narrow for the name, so it
  // shows the game's icon and says the name to VoiceOver.
  rps: { label: "Scissors paper rock", ask: "Scissors paper rock?", icon: "✊", accept: "✊" },
} as const;
export type AskKind = keyof typeof ASKS;
export const isAskKind = (value: string): value is AskKind => Object.hasOwn(ASKS, value);
export const askInfo = (kind: string | undefined) => (kind !== undefined && isAskKind(kind) ? ASKS[kind] : null);

export const DUEL_PICKS = {
  scissors: { label: "Scissors", icon: "✌️" },
  paper: { label: "Paper", icon: "✋" },
  rock: { label: "Rock", icon: "✊" },
} as const;
export type DuelPick = keyof typeof DUEL_PICKS;
/** The order the picks are shown in, the same as the chant. */
export const DUEL_PICK_ORDER: readonly DuelPick[] = ["scissors", "paper", "rock"];
export const isDuelPick = (value: unknown): value is DuelPick => typeof value === "string" && Object.hasOwn(DUEL_PICKS, value);

export const DUEL_FIRST_MS = 5000;
export const DUEL_AGAIN_MS = 3000;
export const DUEL_REVEAL_MS = 1600;
export const DUEL_MAX_ROUNDS = 10;
export const DUEL_PICK_CHANGES = 12;
export const DUEL_WINNER_EMOTE: EmoteId = "cheer";
export const DUEL_LOSER_EMOTE: EmoteId = "cry";

const BEATS: Record<DuelPick, DuelPick> = { rock: "scissors", paper: "rock", scissors: "paper" };

export const duelWinner = (a: DuelPick, b: DuelPick): "a" | "b" | "draw" => (a === b ? "draw" : BEATS[a] === b ? "a" : "b");

const CHANT = [
  { word: "Scissors…", from: -2400 },
  { word: "Paper…", from: -1200 },
  { word: "Rock!", from: 0 },
] as const;

export const chantAt = (endsAt: number, now: number): string | null => {
  const k = now - endsAt;
  if (k < CHANT[0].from || k >= DUEL_REVEAL_MS) return null;
  let word: string = CHANT[0].word;
  for (const step of CHANT) if (k >= step.from) word = step.word;
  return word;
};

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

type Water = { kind: "pool"; x: number; z: number; rx: number; rz: number } | { kind: "sea"; beyondZ: number };

const WATER: Record<Place, readonly Water[]> = {
  garden: [{ kind: "pool", x: -2.9, z: 2.2, rx: 1.95, rz: 1.5 }],
  chapel: [],
  campfire: [],
  cafe: [],
  beach: [{ kind: "sea", beyondZ: -7.4 }],
  library: [],
  home: [],
  backyard: [],
};

export const inWater = (place: Place, at: { x: number; z: number }) =>
  WATER[place].some((w) => (w.kind === "sea" ? at.z < w.beyondZ : Math.hypot((at.x - w.x) / w.rx, (at.z - w.z) / w.rz) < 1));

export type Waypoint = { x: number; z: number };

/** The latest walk of one person: everything a phone needs to place them. */
export interface Walk {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  startedAt: number;
  path?: readonly Waypoint[];
  /** Which way someone faces once the walk ends, when the server chose it (arriving through a pad, or at the lectern). */
  heading?: number;
}

export interface Pose {
  x: number;
  z: number;
  walking: boolean;
  /** Radians; 0 faces the camera (+z), positive turns to the right (+x). */
  heading: number;
  arrivesAt: number;
}

const walkPoints = (walk: Walk): Waypoint[] => [
  { x: walk.fromX, z: walk.fromZ },
  ...(walk.path ?? []),
  { x: walk.toX, z: walk.toZ },
];

export const walkLength = (walk: Walk): number => {
  if (!walk.path || walk.path.length === 0) return Math.hypot(walk.toX - walk.fromX, walk.toZ - walk.fromZ);
  const pts = walkPoints(walk);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return total;
};

export const pathAhead = (walk: Walk, now: number): Waypoint[] => {
  if (!walk.path || walk.path.length === 0) return [];
  const pts = walkPoints(walk);
  let left = (Math.max(0, now - walk.startedAt) / 1000) * WALK_SPEED;
  for (let i = 1; i < pts.length - 1; i++) {
    left -= Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (left < 0) return walk.path.slice(i - 1);
  }
  return [];
};

/** Where someone is at `now`: a straight line at WALK_SPEED from the walk's start. */
export const posAt = (walk: Walk, now: number): Pose => {
  if (!walk.path || walk.path.length === 0) {
    const dx = walk.toX - walk.fromX;
    const dz = walk.toZ - walk.fromZ;
    const dist = Math.hypot(dx, dz);
    const duration = (dist / WALK_SPEED) * 1000;
    const k = duration === 0 ? 1 : Math.min(1, Math.max(0, (now - walk.startedAt) / duration));
    return {
      x: walk.fromX + dx * k,
      z: walk.fromZ + dz * k,
      walking: k < 1,
      heading: dist === 0 || (k >= 1 && walk.heading !== undefined) ? (walk.heading ?? 0) : Math.atan2(dx, dz),
      arrivesAt: walk.startedAt + duration,
    };
  }
  const pts = walkPoints(walk);
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    segLengths.push(len);
    total += len;
  }
  const duration = (total / WALK_SPEED) * 1000;
  const arrivesAt = walk.startedAt + duration;
  if (total === 0) return { x: walk.toX, z: walk.toZ, walking: false, heading: walk.heading ?? 0, arrivesAt };
  const elapsed = Math.max(0, now - walk.startedAt);
  if (elapsed >= duration) {
    let lastHeading = 0;
    for (let i = segLengths.length - 1; i >= 0; i--) {
      if (segLengths[i] > 0) {
        lastHeading = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        break;
      }
    }
    return { x: walk.toX, z: walk.toZ, walking: false, heading: walk.heading ?? lastHeading, arrivesAt };
  }
  let remaining = (elapsed / 1000) * WALK_SPEED;
  let active = segLengths.length - 1;
  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    if (len === 0) continue;
    active = i;
    if (remaining <= len) break;
    remaining -= len;
  }
  const len = segLengths[active];
  const k = len === 0 ? 1 : Math.min(1, remaining / len);
  const a = pts[active];
  const b = pts[active + 1];
  return {
    x: a.x + (b.x - a.x) * k,
    z: a.z + (b.z - a.z) * k,
    walking: true,
    heading: Math.atan2(b.x - a.x, b.z - a.z),
    arrivesAt,
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
  { id: "arcade", x: -3.1, z: 5.7, rx: 0.6, rz: 0.5 },
  { id: "noticeboard", x: 3.0, z: -6.0, rx: 0.65, rz: 0.4 },
  // The notice board on the left: your notifications and the admins' notices.
  { id: "notices", x: -3.0, z: -6.0, rx: 0.65, rz: 0.4 },
  { id: "josh", x: 2.75, z: -2.75, rx: 0.4, rz: 0.3 },
] as const;
export type Obstacle = { id: string; x: number; z: number; rx: number; rz: number };

export const PLACES = ["garden", "chapel", "campfire", "cafe", "beach", "library"] as const;
export type PublicPlace = (typeof PLACES)[number];
export const HOME = "home";
export const BACKYARD = "backyard";
export type PrivatePlace = typeof HOME | typeof BACKYARD;
export type Place = PublicPlace | PrivatePlace;
export const isPlace = (value: unknown): value is Place => value === HOME || value === BACKYARD || (PLACES as readonly unknown[]).includes(value);
export const isPrivatePlace = (place: unknown): place is PrivatePlace => place === HOME || place === BACKYARD;

export const PLACE_TITLES: Record<Place, string> = {
  garden: "The Garden",
  chapel: "The Chapel",
  campfire: "The Campfire",
  cafe: "The Café",
  beach: "The Beach",
  library: "The Library",
  home: "Home",
  backyard: "Backyard",
};

/** A place's name on its own, as the World's title shows it: "Garden", "Café". */
export const placeName = (place: Place) => PLACE_TITLES[place].replace(/^The /, "");

export const listedPlace = (place: Place): Place => (isPrivatePlace(place) ? HOME : place);

export const elsewhereTitle = (place: Place) => (isPrivatePlace(place) ? "At home" : PLACE_TITLES[place]);

export const whereIs = (place: Place) => (isPrivatePlace(place) ? "at home" : `in ${PLACE_TITLES[place]}`);

export const PLACE_OBSTACLES: Record<Place, readonly Obstacle[]> = {
  garden: OBSTACLES,
  chapel: [
    ...[-5.4, -3.2, -1, 1.2].flatMap((z) => [
      { id: `pew-left-${z}`, x: -2.3, z, rx: 1.35, rz: 0.5 },
      { id: `pew-right-${z}`, x: 2.3, z, rx: 1.35, rz: 0.5 },
    ]),
    { id: "lectern", x: 1.3, z: -8.4, rx: 0.5, rz: 0.45 },
    { id: "piano", x: -2.5, z: -9.2, rx: 1.0, rz: 0.6 },
  ],
  campfire: [
    { id: "fire", x: 0, z: -1.6, rx: 1.0, rz: 0.9 },
    { id: "log-back", x: 0, z: -4.3, rx: 1.1, rz: 0.4 },
    { id: "log-left", x: -2.6, z: -1.6, rx: 0.4, rz: 1.1 },
    { id: "log-right", x: 2.6, z: -1.6, rx: 0.4, rz: 1.1 },
    { id: "tent-left", x: -2.4, z: -8.6, rx: 1.3, rz: 1.0 },
    { id: "tent-right", x: 2.5, z: -8.0, rx: 1.3, rz: 1.0 },
  ],
  cafe: [
    { id: "counter", x: 0, z: -9.6, rx: 2.9, rz: 0.8 },
    { id: "table-a", x: -2.1, z: -5.2, rx: 0.8, rz: 0.75 },
    { id: "table-b", x: 2.0, z: -4.4, rx: 0.8, rz: 0.75 },
    { id: "table-c", x: -1.9, z: -0.6, rx: 0.8, rz: 0.75 },
    { id: "couch", x: -2.4, z: 4.6, rx: 1.2, rz: 0.6 },
    { id: "plant", x: 3.3, z: -7.4, rx: 0.4, rz: 0.4 },
    { id: "sijin", x: -3.35, z: -9.7, rx: 0.4, rz: 0.3 },
    { id: "mahjong-a", x: 2.5, z: 0.6, rx: 0.95, rz: 0.95 },
    { id: "mahjong-b", x: 2.5, z: 4.1, rx: 0.95, rz: 0.95 },
  ],
  beach: [
    { id: "umbrella", x: -2.4, z: -0.8, rx: 0.3, rz: 0.3 },
    { id: "castle", x: 2.3, z: -2.6, rx: 0.7, rz: 0.6 },
    { id: "net-left", x: -1.7, z: 3.0, rx: 0.2, rz: 0.2 },
    { id: "net-right", x: 1.7, z: 3.0, rx: 0.2, rz: 0.2 },
    { id: "palm", x: -3.0, z: 5.4, rx: 0.35, rz: 0.35 },
  ],
  library: [
    { id: "shelf-back-left", x: -2.5, z: -11, rx: 1.6, rz: 0.42 },
    { id: "shelf-back-right", x: 2.5, z: -11, rx: 1.6, rz: 0.42 },
    { id: "globe", x: 0, z: -10.3, rx: 0.35, rz: 0.35 },
    { id: "shelf-left", x: -3.55, z: -6.2, rx: 0.45, rz: 1.6 },
    { id: "shelf-right", x: 3.55, z: -6.2, rx: 0.45, rz: 1.6 },
    { id: "table", x: 0, z: -5.4, rx: 1.5, rz: 0.6 },
    { id: "chair-left", x: -0.75, z: -6.3, rx: 0.32, rz: 0.28 },
    { id: "chair-right", x: 0.75, z: -6.3, rx: 0.32, rz: 0.28 },
    { id: "armchair-a", x: -2.7, z: -1.7, rx: 0.55, rz: 0.5 },
    { id: "armchair-b", x: -2.7, z: 1.1, rx: 0.55, rz: 0.5 },
    { id: "armchair-c", x: 2.7, z: -1.7, rx: 0.55, rz: 0.5 },
    { id: "armchair-d", x: 2.7, z: 1.1, rx: 0.55, rz: 0.5 },
    { id: "lamp-left", x: -3.4, z: -0.3, rx: 0.25, rz: 0.25 },
    { id: "lamp-right", x: 3.4, z: -0.3, rx: 0.25, rz: 0.25 },
  ],
  home: [],
  backyard: [...PLOT_OBSTACLES, ...PEN_OBSTACLES],
};

type Portal = { to: Place; x: number; z: number };

export const PORTAL_RADIUS = 0.75;
export const ELSEWHERE_NAMES = 12;

const FACING_CAMERA = 0;
const FACING_AWAY = Math.PI;
const FACING_RIGHT = Math.PI / 2;
const FACING_LEFT = -Math.PI / 2;

export const PORTALS: Record<Place, readonly Portal[]> = {
  garden: [
    { to: "beach", x: 0, z: -10 },
    { to: "cafe", x: 3.2, z: -0.4 },
    { to: "chapel", x: 2, z: 7 },
    { to: "library", x: -3.2, z: -0.4 },
  ],
  beach: [{ to: "garden", x: 0, z: 7 }],
  campfire: [
    { to: "chapel", x: -3.2, z: 3 },
    { to: "cafe", x: 1.8, z: 7 },
  ],
  chapel: [
    { to: "garden", x: 0, z: 7 },
    { to: "campfire", x: 3.2, z: 3.4 },
  ],
  cafe: [
    { to: "garden", x: 0.4, z: 7 },
    { to: "campfire", x: 3.2, z: -2 },
  ],
  library: [{ to: "garden", x: 0, z: 7 }],
  home: [
    { to: "garden", x: 0, z: 7 },
    { to: "backyard", x: 0, z: -10 },
  ],
  backyard: [{ to: "home", x: 0, z: 7 }],
};

const leadsTo = (from: Place, to: Place) => PORTALS[from].some((pad) => pad.to === to);

export const canTravel = (from: Place, to: Place, homeExit: Place): boolean =>
  from === to || to === WORLD_PLACE || to === HOME || leadsTo(from, to) || (from === HOME && to === homeExit);

export type Seat = { id: string; x: number; z: number; heading: number; height: number };

export const SEAT_TURN = Math.PI / 6;

export const towardCamera = (heading: number, x: number, turn = SEAT_TURN) => {
  const h = Math.atan2(Math.sin(heading), Math.cos(heading));
  if (Math.abs(h) <= turn) return h;
  const sign = Math.abs(Math.abs(h) - Math.PI) < 1e-9 ? (x > 0 ? -1 : 1) : Math.sign(h);
  return sign * (Math.abs(h) - turn);
};

const faceTheCamera = (seats: Seat[]): readonly Seat[] => seats.map((seat) => ({ ...seat, heading: towardCamera(seat.heading, seat.x) }));

const PEW_HEIGHT = 0.3;
const LOG_HEIGHT = 0.3;
const STOOL_HEIGHT = 0.32;
export const COUCH_HEIGHT = 0.34;
export const CHAIR_HEIGHT = 0.34;
export const ARMCHAIR_HEIGHT = 0.3;
const ON_THE_GROUND = 0;

export const along = (id: string, spots: [number, number][], heading: number, height: number): Seat[] =>
  spots.map(([x, z], i) => ({ id: `${id}-${i}`, x, z, heading, height }));

const stools = (table: string): Seat[] => {
  const at = PLACE_OBSTACLES.cafe.find((o) => o.id === table)!;
  return [
    { id: `${table}-left`, x: at.x - 0.6, z: at.z + 0.1, heading: FACING_RIGHT, height: STOOL_HEIGHT },
    { id: `${table}-right`, x: at.x + 0.6, z: at.z + 0.1, heading: FACING_LEFT, height: STOOL_HEIGHT },
  ];
};

/**
 * A mahjong table's four stools, in turn order: East on the near side (its
 * back to the camera), South on the right, West on the far side, North on
 * the left, each facing the table.
 */
const MAHJONG_REACH = 0.78;
const mahjongStools = (table: string): Seat[] => {
  const at = PLACE_OBSTACLES.cafe.find((o) => o.id === table)!;
  return [
    { id: `${table}-0`, x: at.x, z: at.z + MAHJONG_REACH, heading: FACING_AWAY, height: STOOL_HEIGHT },
    { id: `${table}-1`, x: at.x + MAHJONG_REACH, z: at.z, heading: FACING_LEFT, height: STOOL_HEIGHT },
    { id: `${table}-2`, x: at.x, z: at.z - MAHJONG_REACH, heading: FACING_CAMERA, height: STOOL_HEIGHT },
    { id: `${table}-3`, x: at.x - MAHJONG_REACH, z: at.z, heading: FACING_RIGHT, height: STOOL_HEIGHT },
  ];
};

const armchair = (id: string, heading: number): Seat => {
  const at = PLACE_OBSTACLES.library.find((o) => o.id === id)!;
  return { id, x: at.x, z: at.z, heading, height: ARMCHAIR_HEIGHT };
};

export const SEATS: Record<Place, readonly Seat[]> = {
  garden: faceTheCamera([
    { id: "blanket-0", x: 2.5, z: 2.4, heading: 0.4, height: ON_THE_GROUND },
    { id: "blanket-1", x: 3.25, z: 2.9, heading: -0.5, height: ON_THE_GROUND },
    { id: "blanket-2", x: 2.55, z: 3.45, heading: 0.2, height: ON_THE_GROUND },
  ]),
  chapel: PLACE_OBSTACLES.chapel
    .filter((o) => o.id.startsWith("pew"))
    .flatMap((pew) => along(pew.id, [[pew.x - 0.8, pew.z - 0.05], [pew.x, pew.z - 0.05], [pew.x + 0.8, pew.z - 0.05]], FACING_AWAY, PEW_HEIGHT)),
  campfire: faceTheCamera([
    ...along("log-back", [[-0.5, -4.3], [0.5, -4.3]], FACING_CAMERA, LOG_HEIGHT),
    ...along("log-left", [[-2.6, -2.1], [-2.6, -1.1]], FACING_RIGHT, LOG_HEIGHT),
    ...along("log-right", [[2.6, -2.1], [2.6, -1.1]], FACING_LEFT, LOG_HEIGHT),
  ]),
  cafe: faceTheCamera([
    ...stools("table-a"),
    ...stools("table-b"),
    ...stools("table-c"),
    ...along("couch", [[-2.9, 4.7], [-1.9, 4.7]], FACING_CAMERA, COUCH_HEIGHT),
    ...mahjongStools("mahjong-a"),
    ...mahjongStools("mahjong-b"),
  ]),
  beach: faceTheCamera(along("towel", [[-1.34, -0.55], [-1.34, 0.2]], FACING_CAMERA, ON_THE_GROUND)),
  library: faceTheCamera([
    ...["chair-left", "chair-right"].map((id) => {
      const chair = PLACE_OBSTACLES.library.find((o) => o.id === id)!;
      return { id, x: chair.x, z: chair.z, heading: FACING_CAMERA, height: CHAIR_HEIGHT };
    }),
    ...["armchair-a", "armchair-b"].map((id) => armchair(id, FACING_RIGHT)),
    ...["armchair-c", "armchair-d"].map((id) => armchair(id, FACING_LEFT)),
  ]),
  home: [],
  backyard: [],
};

export const seatIn = (place: Place, id: string | undefined): Seat | null =>
  SEATS[place].find((seat) => seat.id === id) ?? null;

export const asksDevotional = (place: Place, seatId: string) => place === "chapel" && seatId.startsWith("pew-");

type Stand = { id: string; x: number; z: number; heading: number; /** Says where you are, for VoiceOver. */ label: string };

const lectern = PLACE_OBSTACLES.chapel.find((o) => o.id === "lectern")!;

/**
 * Spots you walk to and then face a set way. Behind the Chapel's lectern you
 * face the pews (and the camera), as whoever leads would.
 */
export const STANDS: Record<Place, readonly Stand[]> = {
  garden: [],
  chapel: [{ id: "lectern", x: lectern.x, z: lectern.z - lectern.rz - 0.35, heading: FACING_CAMERA, label: "behind the lectern, facing the room" }],
  campfire: [],
  cafe: [],
  beach: [],
  library: [],
  home: [],
  backyard: [],
};

export const standIn = (place: Place, id: string | undefined): Stand | null =>
  STANDS[place].find((stand) => stand.id === id) ?? null;

export const portalAt = (place: Place, at: { x: number; z: number }): Portal | null =>
  PORTALS[place].find((portal) => Math.hypot(portal.x - at.x, portal.z - at.z) <= PORTAL_RADIUS) ?? null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The nearest spot inside the courtyard's outline. */
const inBounds = (x: number, z: number) => {
  const cz = clamp(z, WALK_BOUNDS.minZ, WALK_BOUNDS.maxZ);
  const half = halfWidthAt(cz);
  return { x: clamp(x, -half, half), z: cz };
};

const inside = (o: Obstacle, p: { x: number; z: number }) => Math.hypot((p.x - o.x) / o.rx, (p.z - o.z) / o.rz) < 1;

/** Pads sit on an edge of their place; this is the way into the room from one. */
const EDGE = 1;
const intoRoom = (pad: Portal): number => {
  if (pad.z >= WALK_BOUNDS.maxZ - EDGE) return FACING_AWAY;
  if (pad.z <= WALK_BOUNDS.minZ + EDGE) return FACING_CAMERA;
  return pad.x > 0 ? FACING_LEFT : FACING_RIGHT;
};

/**
 * Where someone arriving from `from` stands in `to`: on the pad that leads
 * back, facing into the room. With no pad back (a home, or a place menu jump
 * between places with no pad), at the spawn, facing the camera.
 */
export const arrivalSpot = (from: Place, to: Place): { x: number; z: number; heading?: number } => {
  if (to === HOME && from !== BACKYARD) return { ...HOME_ARRIVAL };
  const pad = PORTALS[to].find((portal) => portal.to === from);
  if (!pad) return clearSpot(to, clampTarget(SPAWN.x, SPAWN.z, to), { labels: true });
  return { ...clampTarget(pad.x, pad.z, to), heading: intoRoom(pad) };
};

const STANDING_STILL = 0.05;

/**
 * The pad a walk ended on. Only a walk counts: standing still where you
 * arrived, on the pad you came through, takes you nowhere.
 */
export const portalReached = (place: Place, walk: Walk): Portal | null =>
  walkLength(walk) < STANDING_STILL ? null : portalAt(place, { x: walk.toX, z: walk.toZ });

const PAD_LABEL_GAP = PORTAL_RADIUS + 0.45;
const LABEL_HALF_WIDTH = 1.7;
const LABEL_HALF_DEPTH = 0.3;
const FIGURE_HALF_WIDTH = 0.55;
const FIGURE_REACH_BACK = 2.5;

export const coversPadLabel = (place: Place, at: { x: number; z: number }) =>
  PORTALS[place].some((pad) =>
    [pad.z + PAD_LABEL_GAP, pad.z - PAD_LABEL_GAP].some(
      (labelZ) =>
        Math.abs(at.x - pad.x) < LABEL_HALF_WIDTH + FIGURE_HALF_WIDTH &&
        labelZ + LABEL_HALF_DEPTH > at.z - FIGURE_REACH_BACK &&
        labelZ - LABEL_HALF_DEPTH < at.z + 0.2
    )
  );

export const ARRIVE_APART = FIGURE_HALF_WIDTH * 2;

const RING_TURNS = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4];

/**
 * The nearest spot to `start` that is at least a body width from everyone
 * in `taken` and, when asked, clear of the pad labels.
 */
export const clearSpot = (
  place: Place,
  start: { x: number; z: number },
  { taken = [], extra = [], labels = false }: { taken?: readonly { x: number; z: number }[]; extra?: readonly Obstacle[]; labels?: boolean } = {}
): { x: number; z: number } => {
  const fine = (at: { x: number; z: number }) =>
    !(labels && coversPadLabel(place, at)) && taken.every((other) => Math.hypot(other.x - at.x, other.z - at.z) >= ARRIVE_APART);
  const from = clampTarget(start.x, start.z, place, extra);
  if (fine(from)) return from;
  for (let r = 0.4; r <= 6; r += 0.4) {
    for (const turn of RING_TURNS) {
      const at = clampTarget(from.x + Math.cos(turn) * r, from.z + Math.sin(turn) * r, place, extra);
      if (fine(at)) return at;
    }
  }
  return from;
};

/** A spot just outside an obstacle's rim, at angle `a` round it. */
const onRim = (o: Obstacle, a: number) => ({ x: o.x + Math.cos(a) * o.rx * 1.02, z: o.z + Math.sin(a) * o.rz * 1.02 });

/**
 * The nearest place someone can stand to (x, z): inside the courtyard and
 * outside every obstacle. A bad number lands at the spawn point.
 */
export const clampTarget = (x: number, z: number, place: Place = "garden", extra: readonly Obstacle[] = []): { x: number; z: number } => {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { ...SPAWN };
  const obstacles = extra.length > 0 ? [...PLACE_OBSTACLES[place], ...extra] : PLACE_OBSTACLES[place];
  let p = inBounds(x, z);
  for (const o of obstacles) {
    if (!inside(o, p)) continue;
    // Out along the line from the obstacle's middle; straight down from its
    // middle when the tap was dead centre.
    const ux = (p.x - o.x) / o.rx;
    const uz = (p.z - o.z) / o.rz;
    const rim = ux === 0 && uz === 0 ? onRim(o, Math.PI / 2) : onRim(o, Math.atan2(uz, ux));
    p = inBounds(rim.x, rim.z);
  }
  const stuck = obstacles.find((o) => inside(o, p));
  if (!stuck) return p;
  // The courtyard's edge pushed it back in (the pond reaches past the west
  // edge): the nearest free spot on that rim inside the courtyard.
  let best: { x: number; z: number } | null = null;
  for (let i = 0; i < 64; i++) {
    const q = onRim(stuck, (i / 64) * Math.PI * 2);
    const b = inBounds(q.x, q.z);
    if (b.x !== q.x || b.z !== q.z || obstacles.some((o) => inside(o, q))) continue;
    if (!best || Math.hypot(q.x - x, q.z - z) < Math.hypot(best.x - x, best.z - z)) best = q;
  }
  return best ?? { ...SPAWN };
};

export const HOME_ARRIVAL = { x: 0, z: 5.2 } as const;

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

/**
 * How many choices each part of a look has. Palettes grow by appending, so a
 * saved index keeps its meaning. The first four are in every look; the rest
 * came later and are optional, so a look saved before them (or by an older
 * app) is still valid and draws with their defaults.
 */
export const LOOK_SIZES = {
  skin: 12,
  hair: 18,
  hairColour: 12,
  shirt: 24,
  hat: 10,
  accessory: 8,
  face: 5,
  eyes: 16,
  eyeColour: 6,
  brows: 5,
  nose: 4,
  mouth: 7,
  height: 5,
  build: 5,
  freckles: 4,
  blush: 5,
  beard: 8,
  outfit: 18,
  // Version 3.
  browColour: 13,
  eyeY: 7,
  eyeGap: 7,
  eyeSize: 7,
  eyeTilt: 7,
  browY: 7,
  browGap: 7,
  browSize: 7,
  browTilt: 7,
  mouthY: 7,
  mouthSize: 7,
  mouthTilt: 7,
  glasses: 6,
  eyeshadow: 6,
  lipstick: 6,
  mole: 6,
  pants: 4,
  pantsColour: 16,
  favourite: 18,
  backdrop: 10,
  // Sleeves came after version 3, optional like the rest.
  sleeves: 3,
} as const;
/**
 * The look's shape: version 2 added the face, body and extras; version 3 the
 * placement sliders, glasses, makeup, moles, bottoms and a favourite colour.
 */
export const LOOK_VERSION = 3;
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
  outfit?: number;
  /** 0 matches the hair; otherwise one of the hair colours, less one. */
  browColour?: number;
  eyeY?: number;
  eyeGap?: number;
  eyeSize?: number;
  eyeTilt?: number;
  browY?: number;
  browGap?: number;
  browSize?: number;
  browTilt?: number;
  mouthY?: number;
  mouthSize?: number;
  mouthTilt?: number;
  glasses?: number;
  eyeshadow?: number;
  lipstick?: number;
  mole?: number;
  pants?: number;
  pantsColour?: number;
  favourite?: number;
  backdrop?: number;
  /** The top's sleeves: none, short or long (see SLEEVES). */
  sleeves?: number;
};
export type LookPart = keyof typeof LOOK_SIZES;
const LOOK_PARTS = Object.keys(LOOK_SIZES) as LookPart[];
const REQUIRED: readonly LookPart[] = ["skin", "hair", "hairColour", "shirt"];

/**
 * The placement sliders: seven steps each, and the middle one is where the
 * part was drawn before the sliders existed.
 */
export const NUDGES = ["eyeY", "eyeGap", "eyeSize", "eyeTilt", "browY", "browGap", "browSize", "browTilt", "mouthY", "mouthSize", "mouthTilt"] as const;
export type NudgePart = (typeof NUDGES)[number];
const NUDGE_MIDDLE = 3;

/** What a missing optional part means: the look from before it existed. */
const LOOK_DEFAULTS: Partial<Record<LookPart, number>> = {
  height: 2,
  build: 2,
  blush: 1,
  ...Object.fromEntries(NUDGES.map((part) => [part, NUDGE_MIDDLE])),
};
const inRange = (part: LookPart, value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value) && value >= 0 && value < LOOK_SIZES[part];

/**
 * The top, bottoms and favourite colours can be any colour, not just one of
 * the palette's. A custom one is kept in the same number as this plus its
 * 0xRRGGBB, far past any palette's end, so an app from before draws its
 * default, and picking a palette colour there replaces it.
 */
export const CUSTOM_COLOUR = 0x1000000;
export const COLOUR_PARTS = ["shirt", "pantsColour", "favourite"] as const;
type ColourPart = (typeof COLOUR_PARTS)[number];
const isColourPart = (part: LookPart): part is ColourPart => (COLOUR_PARTS as readonly LookPart[]).includes(part);
/** The number a look keeps for a custom colour (0xRRGGBB). */
export const customColour = (rgb: number): number => CUSTOM_COLOUR + (Math.round(rgb) & 0xffffff);
/** The 0xRRGGBB of a custom colour, or null when it's a palette colour (or nothing). */
export const customRgb = (value: number | undefined): number | null =>
  value !== undefined && Number.isInteger(value) && value >= CUSTOM_COLOUR && value < CUSTOM_COLOUR * 2 ? value - CUSTOM_COLOUR : null;

/**
 * A part of a look, or its default when the look predates it. A choice this
 * app doesn't have (saved by a newer one) draws as the default too.
 */
export const lookPart = (look: Look, part: LookPart): number => {
  const value = look[part];
  if (inRange(part, value)) return value;
  // Glasses were one of the extras before they had their own part.
  if (part === "glasses") return look.accessory === 1 ? 1 : 0;
  return LOOK_DEFAULTS[part] ?? 0;
};

/** A slider's steps either side of the middle: -3 to 3. */
export const nudge = (look: Look, part: NudgePart): number => lookPart(look, part) - NUDGE_MIDDLE;

/** Every slider back in the middle. */
export const NUDGES_RESET: Readonly<Record<NudgePart, number>> = Object.fromEntries(NUDGES.map((part) => [part, NUDGE_MIDDLE])) as Record<NudgePart, number>;

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
  "Mohawk",
  "Space buns",
  "Braid",
  "Curtains",
  "Mullet",
  "Wavy",
] as const;
export const HATS = ["None", "Cap", "Beanie", "Flower crown", "Sun hat", "Beret", "Bow", "Headband", "Party hat", "Crown"] as const;
export const OUTFITS = [
  "T-shirt",
  "Dress",
  "Skirt",
  "Overalls",
  "Striped tee",
  "Hoodie",
  "Collared",
  "Jacket",
  "Jumper",
  "Polka dots",
  "Flannel",
  "Tie-dye tank",
  "Tank top",
  "Sailor top",
  "Sweater vest",
  "Sundress",
  "Jumpsuit",
  "Hawaiian shirt",
] as const;
export const OUTFIT = Object.fromEntries(OUTFITS.map((name, i) => [name, i])) as Record<(typeof OUTFITS)[number], number>;
/** Outfits that come with their own bottoms, so the bottoms choice doesn't show. */
export const FULL_OUTFITS: readonly number[] = [OUTFIT.Dress, OUTFIT.Skirt, OUTFIT.Overalls, OUTFIT.Sundress, OUTFIT.Jumpsuit];
export const SLEEVES = ["None", "Short", "Long"] as const;
/**
 * Tops that don't take the sleeves choice: the tanks and the sundress have
 * straps, and the hoodie is drawn on its own.
 */
export const SLEEVELESS: readonly number[] = [OUTFIT.Hoodie, OUTFIT["Tie-dye tank"], OUTFIT["Tank top"], OUTFIT.Sundress];
/** The sleeves someone's top is drawn with: none on a top that has none. */
export const sleevesOf = (look: Look): number => (SLEEVELESS.includes(lookPart(look, "outfit")) ? 0 : lookPart(look, "sleeves"));
/** Index 1 was glasses, which are their own part now; the editor doesn't offer it. */
export const ACCESSORIES = ["None", "Glasses", "Backpack", "Scarf", "Bow tie", "Necklace", "Headphones", "Ear flower"] as const;
export const OLD_GLASSES = 1;
export const GLASSES = ["None", "Round", "Square", "Sunglasses", "Big round", "Clear"] as const;
export const FACES = ["Round", "Oval", "Square", "Heart", "Long"] as const;
export const EYES = ["Dots", "Round", "Sleepy", "Sparkly", "Wide", "Narrow", "Lashes", "Almond", "Cat", "Puppy", "Starry", "Hearts", "Tiny", "Anime", "Wink", "Sharp"] as const;
export const BROWS = ["None", "Soft", "Straight", "Arched", "Thick"] as const;
export const NOSES = ["None", "Dot", "Button", "Pointy"] as const;
export const MOUTHS = ["None", "Smile", "Grin", "Small", "Flat", "Cat", "Tongue out"] as const;
export const BLUSH = ["None", "Light", "Rosy", "Round", "Lines"] as const;
export const BEARDS = ["None", "Stubble", "Beard", "Moustache", "Goatee", "Wide moustache", "Chin strap", "Short beard"] as const;
export const FRECKLES = ["None", "Cheeks", "Lots", "Across the nose"] as const;
export const MOLES = ["None", "Cheek", "Other cheek", "By the lip", "Under an eye", "Chin"] as const;
export const EYESHADOW = ["None", "Lilac", "Peach", "Teal", "Gold", "Rose"] as const;
export const LIPSTICK = ["None", "Rose", "Red", "Coral", "Plum", "Pink"] as const;
export const PANTS = ["Match top", "Trousers", "Shorts", "Skirt"] as const;

export const HEIGHT_SCALES = [0.8, 0.9, 1, 1.1, 1.2] as const;

/**
 * How tall and how broad someone is drawn, from their height and build
 * steps. Clamped to a narrow range so everyone stays readable; it changes
 * only the drawing, never where they stand, how close they can get or who
 * can hear them.
 */
export const bodyScale = (look: Look) => ({
  height: HEIGHT_SCALES[lookPart(look, "height")] ?? 1,
  width: 0.85 + lookPart(look, "build") * 0.075,
});

const UNCHOSEN_HEIGHTS = [0, 1, 1, 2, 2, 3, 3, 4] as const;

const heightFor = (seed: string): number => UNCHOSEN_HEIGHTS[(hash(seed) >>> 16) % UNCHOSEN_HEIGHTS.length];

export const withHeight = (look: Look, seed: string): Look => (look.height === undefined ? { ...look, height: heightFor(seed) } : look);

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
    height: heightFor(seed),
  };
};

/** Whether every part of a look is one of the choices (bounds checked on the server). */
export const isValidLook = (look: Look): boolean =>
  (look.v === undefined || (Number.isInteger(look.v) && look.v >= 1 && look.v <= LOOK_VERSION)) &&
  LOOK_PARTS.every((part) => {
    const value = look[part];
    if (value === undefined) return !REQUIRED.includes(part);
    return inRange(part, value) || (isColourPart(part) && customRgb(value) !== null);
  });

/** A look picked at random, for the editor's Randomise button. */
export const randomLook = (random: () => number = Math.random): Look => {
  const pick = (part: LookPart) => Math.floor(random() * LOOK_SIZES[part]);
  // Mostly none, so not everyone gets a hat, a beard and freckles at once.
  const rarely = (part: LookPart, chance: number) => (random() < chance ? pick(part) : 0);
  // Sliders stay a step either side of the middle, so a random face still reads.
  const near = () => NUDGE_MIDDLE - 1 + Math.floor(random() * 3);
  const accessory = rarely("accessory", 0.4);
  return {
    v: LOOK_VERSION,
    skin: pick("skin"),
    hair: pick("hair"),
    hairColour: pick("hairColour"),
    shirt: pick("shirt"),
    hat: rarely("hat", 0.5),
    // Glasses have their own part now.
    accessory: accessory === OLD_GLASSES ? 0 : accessory,
    face: pick("face"),
    eyes: pick("eyes"),
    eyeColour: pick("eyeColour"),
    brows: pick("brows"),
    nose: pick("nose"),
    mouth: pick("mouth"),
    height: pick("height"),
    build: pick("build"),
    freckles: rarely("freckles", 0.4),
    blush: pick("blush"),
    beard: rarely("beard", 0.3),
    outfit: pick("outfit"),
    browColour: rarely("browColour", 0.2),
    ...(Object.fromEntries(NUDGES.map((part) => [part, near()])) as Record<NudgePart, number>),
    glasses: rarely("glasses", 0.3),
    eyeshadow: rarely("eyeshadow", 0.2),
    lipstick: rarely("lipstick", 0.2),
    mole: rarely("mole", 0.2),
    pants: pick("pants"),
    pantsColour: pick("pantsColour"),
    favourite: pick("favourite"),
    backdrop: pick("backdrop"),
    sleeves: pick("sleeves"),
  };
};

/** A saved look can't change more often than this. */
export const LOOK_SAVE_GAP_MS = 3000;

export const POKE_EVERY_MS = 60 * 60_000;
export const POKED_GAP_MS = 10 * 60_000;
export const MAX_POKE_LENGTH = 80;
export const OFFLINE_LIST_SIZE = 30;
/** People the World's "Not here right now" list shows at first, most recently online first. */
export const OFFLINE_FIRST = 10;
/** The most it shows after "Show all". */
export const OFFLINE_ALL_MAX = 200;
export const POKE_ARRIVAL_MS = 24 * 60 * 60_000;
export const INVITE_MS = 24 * 60 * 60_000;
export const INVITE_CARD_MS = 2 * 60_000;
export const KNOCK_MS = 2 * 60_000;
export const ARRIVE_NEAR = 1.4;

export const cleanPoke = (raw: string): string | null => {
  const line = cleanLine(raw);
  return line === null ? null : Array.from(line).slice(0, MAX_POKE_LENGTH).join("");
};


/** A chat line as it's kept: trimmed, one line, at most MAX_SAY_LENGTH. */
const UNSEEN = /[\p{Cc}\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu;
const SEEN = /[^\p{Cf}\p{M}\s]/u;

const tidyLine = (raw: string) => raw.replace(UNSEEN, " ").replace(/\s+/g, " ").trim();

export const sayTooLong = (raw: string) => Array.from(tidyLine(raw)).length > MAX_SAY_LENGTH;

export const cleanLine = (raw: string): string | null => {
  const text = tidyLine(raw);
  if (!SEEN.test(text)) return null;
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
  act: { burst: 3, refillMs: 4000 },
  say: { burst: 3, refillMs: 10_000 },
  decorate: { burst: 6, refillMs: 1000 },
  /** Joining again after leaving, so coming and going can't refill the others. */
  join: { burst: 4, refillMs: 30_000 },
} as const;
export type BucketKind = keyof typeof BUCKETS;
export type StateBucket = Exclude<BucketKind, "join" | "decorate">;
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

export const NPC = {
  id: "npc:sijin",
  name: "Sijin Yang",
  place: "cafe",
  x: -3.35,
  z: -9.7,
  heading: 0.35,
  // Sijin's own World look, read from production on 28 Nov 2026 (saved
  // there on 27 Nov). The Cafe and Sij in the games all draw this one.
  look: {
    v: LOOK_VERSION,
    skin: 0,
    hair: 8,
    hairColour: 5,
    shirt: 4,
    hat: 8,
    accessory: 0,
    face: 1,
    eyes: 5,
    eyeY: 6,
    eyeGap: 3,
    eyeSize: 6,
    eyeTilt: 3,
    brows: 4,
    nose: 0,
    mouth: 4,
    blush: 4,
    height: 0,
    build: 4,
    beard: 1,
    outfit: 0,
    pants: 0,
    pantsColour: 2,
    favourite: 6,
  } satisfies Look,
} as const;

export const FARMER = {
  id: "npc:josh",
  name: "Josh Kim",
  place: "garden",
  x: 2.75,
  z: -2.75,
  heading: -0.35,
  look: {
    v: LOOK_VERSION,
    skin: 5,
    hair: 0,
    hairColour: 5,
    shirt: 3,
    face: 1,
    eyes: 5,
    eyeColour: 0,
    brows: 2,
    nose: 1,
    mouth: 2,
    height: 3,
    build: 2,
    outfit: 11,
    glasses: 5,
    pants: 2,
    pantsColour: 0,
    favourite: 0,
  } satisfies Look,
} as const;
