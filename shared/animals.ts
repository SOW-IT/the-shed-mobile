import { DAY_MS, isBuilding, type BuildingId } from "./farm";
import { cleanLine } from "./world";

export const BUILDINGS = {
  coop: { label: "Chicken coop", short: "Coop", price: 50, capacity: 4, animal: "chicken" },
  barn: { label: "Cow barn", short: "Barn", price: 80, capacity: 2, animal: "cow" },
} as const satisfies Record<BuildingId, { label: string; short: string; price: number; capacity: number; animal: string }>;

export const ANIMALS = {
  chicken: {
    label: "Chicken",
    stages: ["Chick", "Pullet", "Hen"],
    building: "coop",
    price: 24,
    growDays: 4,
    feed: "grain",
    feedPrice: 2,
    product: "egg",
    sells: 6,
    names: ["Henrietta", "Clucky", "Penny", "Goldie", "Nugget", "Pip", "Ginger", "Hazel", "Peggy", "Dot"],
  },
  cow: {
    label: "Cow",
    stages: ["Calf", "Young cow", "Cow"],
    building: "barn",
    price: 55,
    growDays: 5,
    feed: "hay",
    feedPrice: 3,
    product: "milk",
    sells: 9,
    names: ["Daisy", "Bessie", "Buttercup", "Clover", "Rosie", "Maple", "Honey", "Mabel", "Moo", "Bluebell"],
  },
} as const;

export type AnimalId = keyof typeof ANIMALS;
export const isAnimal = (value: unknown): value is AnimalId => typeof value === "string" && Object.hasOwn(ANIMALS, value);

export type FeedId = (typeof ANIMALS)[AnimalId]["feed"];
export type GoodId = (typeof ANIMALS)[AnimalId]["product"];

export const FEEDS: Record<FeedId, { label: string; price: number; animal: AnimalId }> = {
  grain: { label: "Grain", price: ANIMALS.chicken.feedPrice, animal: "chicken" },
  hay: { label: "Hay", price: ANIMALS.cow.feedPrice, animal: "cow" },
};
export const FEED_IDS = Object.keys(FEEDS) as FeedId[];
export const isFeed = (value: unknown): value is FeedId => typeof value === "string" && Object.hasOwn(FEEDS, value);

export const GOODS: Record<GoodId, { label: string; sells: number; animal: AnimalId }> = {
  egg: { label: "Egg", sells: ANIMALS.chicken.sells, animal: "chicken" },
  milk: { label: "Milk", sells: ANIMALS.cow.sells, animal: "cow" },
};
const GOOD_IDS = Object.keys(GOODS) as GoodId[];
export const isGood = (value: unknown): value is GoodId => typeof value === "string" && Object.hasOwn(GOODS, value);

export const NAME_TAG_PRICE = 20;
export const NAME_MAX = 16;
export const FEED_BUYS = [1, 5] as const;
export const MAX_FEED_EACH = 99;
export const MAX_NAME_TAGS = 9;
const WANDER_DAYS = 3;

export const animalFor = (building: BuildingId): AnimalId => BUILDINGS[building].animal;
export const buildingFor = (animal: AnimalId): BuildingId => ANIMALS[animal].building;
export { isBuilding };

export const profitPerDay = (animal: AnimalId) => ANIMALS[animal].sells - ANIMALS[animal].feedPrice;

export const paybackDays = (animal: AnimalId) => {
  const a = ANIMALS[animal];
  return Math.ceil((a.price + (a.growDays - 1) * a.feedPrice) / profitPerDay(animal));
};

export const cleanName = (raw: string): string | null => {
  const line = cleanLine(raw);
  if (line === null || Array.from(line).length > NAME_MAX) return null;
  return line;
};

export const randomName = (animal: AnimalId, roll: number) => {
  const names = ANIMALS[animal].names;
  return names[Math.min(names.length - 1, Math.max(0, Math.floor(roll * names.length)))];
};

type Feeding = { at: number };
type AnimalTimes = { kind: string; boughtAt: number; feedings: readonly Feeding[]; collectedAt?: number };
export type Mood = "fed" | "hungry" | "frail" | "gone";

type Life = {
  window: number;
  windowEndsAt: number;
  fedAt: number | null;
  mood: Mood;
  unfed: number;
  goneAt: number | null;
  grown: boolean;
  progress: number;
  stage: 0 | 1 | 2;
  day: number;
  ready: boolean;
  readyAt: number | null;
  adultAt: number | null;
};

const growDaysOf = (kind: string) => (isAnimal(kind) ? ANIMALS[kind].growDays : ANIMALS.chicken.growDays);

export const life = (animal: AnimalTimes, at: number): Life => {
  const born = animal.boughtAt;
  const now = Math.max(at, born);
  const days = growDaysOf(animal.kind);
  const windowOf = (t: number) => Math.floor((t - born) / DAY_MS);
  const fedIn = new Map<number, number>();
  for (const f of animal.feedings) {
    const k = windowOf(f.at);
    if (k >= 1 && f.at <= now && !fedIn.has(k)) fedIn.set(k, f.at);
  }
  const current = windowOf(now);
  const fedWindows = [0, ...[...fedIn.keys()].filter((k) => k <= current).sort((x, y) => x - y)];
  const lastFed = fedWindows[fedWindows.length - 1];
  const goneWindow = current - lastFed >= WANDER_DAYS ? lastFed + WANDER_DAYS : null;
  let grown = 0;
  let adultWindow: number | null = null;
  for (const k of fedWindows) {
    if (k >= current || adultWindow !== null) break;
    grown++;
    if (grown === days) adultWindow = k + 1;
  }
  const start = born + current * DAY_MS;
  const fedNow = current === 0 || fedIn.has(current);
  const fedAt = current === 0 ? null : (fedIn.get(current) ?? null);
  const unfed = goneWindow !== null ? WANDER_DAYS : fedNow ? 0 : current - lastFed;
  const mood: Mood = goneWindow !== null ? "gone" : unfed === 0 ? "fed" : unfed === 1 ? "hungry" : "frail";
  const isGrown = adultWindow !== null;
  const into = (now - start) / DAY_MS;
  const progress = isGrown ? 1 : Math.min(1, (grown + (fedNow ? into : 0)) / days);
  const day = isGrown ? days : grown + 1;
  const stage: 0 | 1 | 2 = isGrown ? 2 : day <= days / 2 ? 0 : 1;
  const adultAt = adultWindow === null ? null : born + adultWindow * DAY_MS;
  const latest = animal.feedings.reduce<number | null>((best, f) => (f.at <= now && (best === null || f.at > best) ? f.at : best), null);
  const readyAt = adultAt !== null && latest !== null && latest >= adultAt && latest > (animal.collectedAt ?? -Infinity) && goneWindow === null ? latest : null;
  return {
    window: current,
    windowEndsAt: start + DAY_MS,
    fedAt,
    mood,
    unfed,
    goneAt: goneWindow === null ? null : born + goneWindow * DAY_MS,
    grown: isGrown,
    progress,
    stage,
    day,
    ready: readyAt !== null,
    readyAt,
    adultAt,
  };
};

export const keptFeedings = <F extends Feeding>(animal: { kind: string; boughtAt: number; feedings: readonly F[] }, at: number): F[] => {
  const { adultAt } = life(animal, at);
  if (adultAt === null) return [...animal.feedings];
  const before = animal.feedings.filter((f) => f.at < adultAt);
  const after = animal.feedings.filter((f) => f.at >= adultAt);
  return [...before, ...after.slice(-2)];
};

export const stageLabel = (kind: string, stage: 0 | 1 | 2) => (isAnimal(kind) ? ANIMALS[kind].stages[stage] : "Animal");

const readyWords = (kind: string) => (kind === "cow" ? "milk ready" : "egg ready");

export const animalCard = (animal: AnimalTimes & { name: string }, at: number): string => {
  const l = life(animal, at);
  const days = growDaysOf(animal.kind);
  if (l.mood === "gone") return `${animal.name} · wandered off`;
  return [animal.name, ...(l.mood === "fed" ? [] : [l.mood]), ...(l.ready ? [readyWords(animal.kind)] : []), ...(l.grown ? [] : [`day ${l.day} of ${days}`]), ...(l.mood === "fed" && !l.ready && l.grown ? ["fed"] : [])].join(" · ");
};

export const animalLabel = (animal: AnimalTimes & { name: string }, at: number): string => {
  const l = life(animal, at);
  const kind = isAnimal(animal.kind) ? ANIMALS[animal.kind].label.toLowerCase() : "animal";
  const days = growDaysOf(animal.kind);
  return [animal.name, kind, ...(l.mood === "fed" ? [] : [l.mood]), ...(l.ready ? [readyWords(animal.kind)] : []), ...(l.grown ? [] : [`day ${l.day} of ${days}`])].join(", ");
};

type AnimalNudge = { hungry: number; eggs: number; milk: number; due: boolean };

export const animalNudge = (animals: readonly AnimalTimes[], since: number, now: number): AnimalNudge => {
  let hungry = 0;
  let eggs = 0;
  let milk = 0;
  let fresh = false;
  for (const animal of animals) {
    const l = life(animal, now);
    if (l.mood === "gone") continue;
    if (l.mood !== "fed") hungry++;
    if (l.readyAt === null) continue;
    if (animal.kind === "cow") milk++;
    else eggs++;
    if (l.readyAt > since) fresh = true;
  }
  return { hungry, eggs, milk, due: hungry > 0 || fresh };
};

export const animalNudgeText = ({ hungry, eggs, milk }: Pick<AnimalNudge, "hungry" | "eggs" | "milk">) => [
  ...(hungry > 0 ? [`${hungry} animal${hungry === 1 ? " is" : "s are"} hungry`] : []),
  ...(eggs > 0 ? [`${eggs} egg${eggs === 1 ? "" : "s"} to collect`] : []),
  ...(milk > 0 ? [`${milk} cow${milk === 1 ? "" : "s"} to milk`] : []),
];

export const goodsList = (goods: Record<string, number>) => GOOD_IDS.filter((id) => (goods[id] ?? 0) > 0).map((id) => ({ id, count: goods[id], price: GOODS[id].sells }));

export const feedList = (feed: Record<string, number>) => FEED_IDS.filter((id) => (feed[id] ?? 0) > 0).map((id) => ({ id, count: feed[id] }));

export const goodsTotal = (goods: Record<string, number>) => goodsList(goods).reduce((sum, g) => sum + g.count * g.price, 0);
