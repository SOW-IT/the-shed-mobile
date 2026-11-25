import { sydneyDateTime } from "./devotionalGroups";

export const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;

export const CROPS = {
  lettuce: { label: "Lettuce", days: 1, seed: 3, sell: 4 },
  carrot: { label: "Carrot", days: 2, seed: 8, sell: 11 },
  strawberry: { label: "Strawberry", days: 3, seed: 14, sell: 19 },
  tomato: { label: "Tomato", days: 4, seed: 25, sell: 32 },
  pumpkin: { label: "Pumpkin", days: 5, seed: 40, sell: 52 },
  watermelon: { label: "Watermelon", days: 7, seed: 60, sell: 80 },
} as const;
export type CropId = keyof typeof CROPS;
export const CROP_IDS = Object.keys(CROPS) as CropId[];
export const isCrop = (value: unknown): value is CropId => typeof value === "string" && Object.hasOwn(CROPS, value);

export const PLOT_COUNT = 12;
export const FREE_PLOTS = 4;
export const PLOT_PRICES = [10, 20, 40, 80, 160, 320, 640, 1280] as const;

export const plotPrice = (index: number): number | null => {
  if (!Number.isInteger(index) || index < 0 || index >= PLOT_COUNT) return null;
  return index < FREE_PLOTS ? 0 : PLOT_PRICES[index - FREE_PLOTS];
};

const MAX_WILTS = 3;
export const STARTER_SEEDS: { crop: CropId; count: number } = { crop: "lettuce", count: 4 };
export const MAX_SEEDS_EACH = 99;
export const MAX_SEED_BUY = 10;
const FARM_PUSH_HOUR = 18;

const PLOT_COLUMNS = [-2.55, -0.85, 0.85, 2.55] as const;
const PLOT_ROWS = [2.2, -0.2, -2.6] as const;
export const PLOT_SIZE = { w: 1.5, d: 1.4 } as const;
const PLOT_REACH = 0.45;
const PLOT_SIDE = 0.6;

export const PLOTS = PLOT_ROWS.flatMap((z, row) => PLOT_COLUMNS.map((x, col) => ({ index: row * PLOT_COLUMNS.length + col, x, z })));

export const PLOT_OBSTACLES = PLOTS.map((plot) => ({ id: `plot-${plot.index}`, x: plot.x, z: plot.z, rx: 0.75, rz: 0.7 }));

export const plotStand = (index: number) => {
  const plot = PLOTS[index];
  return { x: plot.x + PLOT_SIDE, z: plot.z + PLOT_SIZE.d / 2 + PLOT_REACH };
};

export const plotAt = (at: { x: number; z: number }): number | null =>
  PLOTS.find((plot) => Math.abs(at.x - plot.x) <= PLOT_SIZE.w / 2 && Math.abs(at.z - plot.z) <= PLOT_SIZE.d / 2)?.index ?? null;

export type BuildingId = "coop" | "barn";
export const BUILDING_IDS: readonly BuildingId[] = ["coop", "barn"];
export const isBuilding = (value: unknown): value is BuildingId => value === "coop" || value === "barn";

const PEN_FRONT = -4.8;
const PEN_DEPTH = 3.8;
const PEN_WIDTH = 3.2;
const PEN_GATE_REACH = 0.7;

export const PENS: Record<BuildingId, { x: number; front: number; back: number; w: number; house: { x: number; z: number; w: number; d: number } }> = {
  coop: { x: -2.3, front: PEN_FRONT, back: PEN_FRONT - PEN_DEPTH, w: PEN_WIDTH, house: { x: -2.6, z: -9.9, w: 1.9, d: 1.3 } },
  barn: { x: 2.3, front: PEN_FRONT, back: PEN_FRONT - PEN_DEPTH, w: PEN_WIDTH, house: { x: 2.4, z: -10.1, w: 2.6, d: 1.7 } },
};

export const PEN_OBSTACLES = BUILDING_IDS.flatMap((id) => {
  const pen = PENS[id];
  const { house } = pen;
  return [
    { id: `pen-${id}`, x: pen.x, z: (pen.front + pen.back) / 2, rx: pen.w / 2 + 0.5, rz: (pen.front - pen.back) / 2 + 0.5 },
    { id: `house-${id}`, x: house.x, z: house.z, rx: house.w / 2 + 0.4, rz: house.d / 2 + 0.4 },
  ];
});

const PEN_STAND_ASIDE = 1.15;

export const penStand = (id: BuildingId) => ({ x: PENS[id].x + (id === "coop" ? PEN_STAND_ASIDE : -PEN_STAND_ASIDE), z: PENS[id].front + PEN_GATE_REACH });

type Watering = { at: number };
type PlantTimes = { crop: string; plantedAt: number; waterings: readonly Watering[] };
export type Stage = "seed" | "sprout" | "half" | "ripe" | "dead";

type Growth = {
  stage: Stage;
  wilts: number;
  window: number;
  windowEndsAt: number;
  wateredAt: number | null;
  thirsty: boolean;
  wilted: boolean;
  ripeAt: number | null;
  diedAt: number | null;
  readyAt: number | null;
  progress: number;
};

const daysOf = (crop: string) => (isCrop(crop) ? CROPS[crop].days : 1);

const stageAt = (progress: number): Stage => (progress < 0.25 ? "seed" : progress < 0.6 ? "sprout" : "half");

export const growth = (plant: PlantTimes, at: number): Growth => {
  const now = Math.max(at, plant.plantedAt);
  const days = daysOf(plant.crop);
  const wateredIn = (start: number, end: number) => plant.waterings.find((w) => w.at >= start && w.at < end)?.at ?? null;
  let grown = 0;
  let wilts = 0;
  let lastDry = false;
  for (let k = 0; ; k++) {
    const start = plant.plantedAt + k * DAY_MS;
    const end = start + DAY_MS;
    const wateredAt = k === 0 ? null : wateredIn(start, end);
    const good = k === 0 || wateredAt !== null;
    if (now < end) {
      const into = Math.max(0, now - start) / DAY_MS;
      const progress = (grown + (good ? into : 0)) / days;
      return {
        stage: stageAt(progress),
        wilts,
        window: k,
        windowEndsAt: end,
        wateredAt,
        thirsty: !good,
        wilted: !good && lastDry,
        ripeAt: null,
        diedAt: null,
        readyAt: end + (days - grown - 1) * DAY_MS,
        progress,
      };
    }
    if (good) grown++;
    else wilts++;
    lastDry = !good;
    const settled = { wilts, window: k, windowEndsAt: end, wateredAt: null, thirsty: false, wilted: false, readyAt: null };
    if (grown === days) return { ...settled, stage: "ripe", ripeAt: end, diedAt: null, progress: 1 };
    if (wilts === MAX_WILTS) return { ...settled, stage: "dead", ripeAt: null, diedAt: end, progress: grown / days };
  }
};

type Step =
  | "seed"
  | "sprout"
  | "leaves"
  | "head"
  | "tops"
  | "tall"
  | "shoulder"
  | "flowers"
  | "berries"
  | "stem"
  | "flower"
  | "green"
  | "vine"
  | "bloom"
  | "small"
  | "bigger"
  | "big";

const SEED_SHARE = 0.25;

const CROP_STEPS: Record<CropId, readonly Step[]> = {
  lettuce: ["leaves", "head"],
  carrot: ["tops", "shoulder"],
  strawberry: ["leaves", "flowers", "berries"],
  tomato: ["sprout", "stem", "flower", "green"],
  pumpkin: ["sprout", "vine", "flower", "small", "big"],
  watermelon: ["sprout", "vine", "leaves", "flower", "small", "bigger", "big"],
};

type Look = { step: Step | "ripe"; k: number; size: number };

export const growthLook = (crop: string, progress: number, ripe = false): Look => {
  if (ripe) return { step: "ripe", k: 1, size: 1 };
  const kind: CropId = isCrop(crop) ? crop : "lettuce";
  const steps = CROP_STEPS[kind];
  const p = Math.min(Math.max(progress, 0), 0.9999);
  const size = 0.4 + 0.5 * p;
  const firstEnd = 1 / steps.length;
  if (p < firstEnd * SEED_SHARE) return { step: "seed", k: p / (firstEnd * SEED_SHARE), size };
  const at = p * steps.length;
  const day = Math.floor(at);
  const from = day === 0 ? SEED_SHARE : 0;
  return { step: steps[day], k: (at - day - from) / (1 - from), size };
};

export const timeLeft = (ms: number): string => {
  if (ms >= DAY_MS) {
    const days = Math.ceil(ms / DAY_MS);
    return `${days} day${days === 1 ? "" : "s"} left`;
  }
  return `${Math.max(1, Math.ceil(ms / HOUR_MS))}h left`;
};

export const cropLabel = (crop: string) => (isCrop(crop) ? CROPS[crop].label : "Plant");

export const plantCard = (plant: PlantTimes, at: number): string => {
  const now = Math.max(at, plant.plantedAt);
  const g = growth(plant, now);
  const status = g.stage === "ripe" ? "ready" : g.stage === "dead" ? "died" : timeLeft((g.readyAt ?? now) - now);
  return [cropLabel(plant.crop), status, ...(g.wilts > 0 ? [`wilted ${g.wilts}×`] : [])].join(" · ");
};

export const sellPrice = (crop: CropId, wilts: number) => Math.floor((CROPS[crop].sell * (MAX_WILTS + 1 - wilts)) / (MAX_WILTS + 1));

export const stackKey = (crop: CropId, wilts: number) => `${crop}:${wilts}`;

export const parseStack = (key: string): { crop: CropId; wilts: number } | null => {
  const [crop, rest, ...extra] = key.split(":");
  const wilts = Number(rest);
  if (extra.length > 0 || !isCrop(crop) || rest === "" || !Number.isInteger(wilts) || wilts < 0 || wilts >= MAX_WILTS) return null;
  return { crop, wilts };
};

const WILT_WORDS = ["", "once", "twice"] as const;

export const stackLabel = (crop: CropId, wilts: number) => (wilts === 0 ? CROPS[crop].label : `${CROPS[crop].label} · wilted ${WILT_WORDS[wilts]}`);

type Stack = { key: string; crop: CropId; wilts: number; count: number; price: number };

export const bagStacks = (crops: Record<string, number>): Stack[] =>
  Object.entries(crops)
    .flatMap(([key, count]) => {
      const stack = parseStack(key);
      return stack && count > 0 ? [{ key, ...stack, count, price: sellPrice(stack.crop, stack.wilts) }] : [];
    })
    .sort((a, b) => CROP_IDS.indexOf(a.crop) - CROP_IDS.indexOf(b.crop) || a.wilts - b.wilts);

export const sellAllTotal = (crops: Record<string, number>) => bagStacks(crops).reduce((sum, stack) => sum + stack.count * stack.price, 0);

export const seedList = (seeds: Record<string, number>) =>
  CROP_IDS.filter((crop) => (seeds[crop] ?? 0) > 0).map((crop) => ({ crop, count: seeds[crop] }));

type Nudge = { thirsty: number; ready: number; due: boolean };

export const farmNudge = (plants: readonly PlantTimes[], since: number, now: number): Nudge => {
  let thirsty = 0;
  let ready = 0;
  let fresh = 0;
  for (const plant of plants) {
    const g = growth(plant, now);
    if (g.thirsty) thirsty++;
    if (g.ripeAt !== null) {
      ready++;
      if (g.ripeAt > since) fresh++;
    }
  }
  return { thirsty, ready, due: thirsty > 0 || fresh > 0 };
};

export const nudgeText = ({ thirsty, ready }: Pick<Nudge, "thirsty" | "ready">) =>
  [
    ...(thirsty > 0 ? [`${thirsty} plant${thirsty === 1 ? " needs" : "s need"} water`] : []),
    ...(ready > 0 ? [`${ready} ready to harvest`] : []),
  ].join(" · ");

export const farmPushDay = (ms: number): string | null => {
  const { date, hour } = sydneyDateTime(ms);
  return hour === FARM_PUSH_HOUR ? date : null;
};
