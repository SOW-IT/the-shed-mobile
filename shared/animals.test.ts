import { describe, expect, test } from "vitest";
import {
  animalCard,
  animalFor,
  animalLabel,
  animalNudge,
  animalNudgeText,
  ANIMALS,
  BUILDINGS,
  buildingFor,
  cleanName,
  FEEDS,
  feedList,
  GOODS,
  goodsList,
  goodsTotal,
  isAnimal,
  isFeed,
  isGood,
  keptFeedings,
  life,
  NAME_MAX,
  NAME_TAG_PRICE,
  paybackDays,
  profitPerDay,
  randomName,
  stageLabel,
} from "./animals";
import { DAY_MS, PEN_OBSTACLES, PENS, penStand, PLOT_OBSTACLES, plotStand, PLOTS } from "./farm";
import { arrivalSpot, clampTarget } from "./world";
import { findPath } from "./worldPath";

const AT = Date.UTC(2026, 10, 25, 2, 0);
const HOUR = 60 * 60_000;
const day = (n: number) => AT + n * DAY_MS;

const cow = (feedings: number[], collectedAt?: number) => ({ kind: "cow", name: "Daisy", boughtAt: AT, feedings: feedings.map((at) => ({ at })), ...(collectedAt === undefined ? {} : { collectedAt }) });
const hen = (feedings: number[], collectedAt?: number) => ({ ...cow(feedings, collectedAt), kind: "chicken", name: "Henrietta" });
const everyDay = (from: number, to: number, hour = 1) => Array.from({ length: to - from + 1 }, (_, i) => day(from + i) + hour * HOUR);

describe("the table", () => {
  test("prices, growing days, feed and products are the agreed numbers", () => {
    expect(BUILDINGS.coop).toMatchObject({ price: 50, capacity: 4, animal: "chicken" });
    expect(BUILDINGS.barn).toMatchObject({ price: 80, capacity: 2, animal: "cow" });
    expect(ANIMALS.chicken).toMatchObject({ price: 24, growDays: 4, feed: "grain", feedPrice: 2, product: "egg", sells: 6, stages: ["Chick", "Pullet", "Hen"] });
    expect(ANIMALS.cow).toMatchObject({ price: 55, growDays: 5, feed: "hay", feedPrice: 3, product: "milk", sells: 9, stages: ["Calf", "Young cow", "Cow"] });
    expect(FEEDS).toEqual({ grain: { label: "Grain", price: 2, animal: "chicken" }, hay: { label: "Hay", price: 3, animal: "cow" } });
    expect(GOODS).toEqual({ egg: { label: "Egg", sells: 6, animal: "chicken" }, milk: { label: "Milk", sells: 9, animal: "cow" } });
    expect(NAME_TAG_PRICE).toBe(20);
  });

  test("profit a day and payback", () => {
    expect(profitPerDay("chicken")).toBe(4);
    expect(profitPerDay("cow")).toBe(6);
    expect(paybackDays("chicken")).toBe(8);
    expect(paybackDays("cow")).toBe(12);
  });

  test("buildings and animals map to each other", () => {
    expect(animalFor("coop")).toBe("chicken");
    expect(animalFor("barn")).toBe("cow");
    expect(buildingFor("chicken")).toBe("coop");
    expect(buildingFor("cow")).toBe("barn");
    expect([isAnimal("cow"), isAnimal("pig"), isAnimal(3), isFeed("hay"), isFeed("corn"), isFeed(null), isGood("egg"), isGood("cheese"), isGood({})]).toEqual([true, false, false, true, false, false, true, false, false]);
  });
});

describe("feeding windows", () => {
  test("buying counts as the first window's feed", () => {
    expect(life(cow([]), AT + 5 * HOUR)).toMatchObject({ window: 0, mood: "fed", fedAt: null, unfed: 0, day: 1, stage: 0, grown: false });
  });

  test("the next window is hungry until it's fed, at any time inside it", () => {
    expect(life(cow([]), day(1) + HOUR)).toMatchObject({ window: 1, mood: "hungry", unfed: 1 });
    expect(life(cow([day(1) + 23 * HOUR]), day(1) + 23.5 * HOUR)).toMatchObject({ mood: "fed", fedAt: day(1) + 23 * HOUR });
  });

  test("feeding early in a window counts for it and doesn't move the windows", () => {
    const fed = cow([day(1) + 1]);
    expect(life(fed, day(1) + 2)).toMatchObject({ mood: "fed", windowEndsAt: day(2) });
    expect(life(fed, day(2) + 1)).toMatchObject({ mood: "hungry", window: 2 });
  });

  test("a feeding in the bought window doesn't count for the next one", () => {
    expect(life(cow([AT + HOUR]), day(1) + HOUR).mood).toBe("hungry");
  });

  test("two unfed windows in a row is frail, three wanders off", () => {
    expect(life(cow([]), day(2) + HOUR)).toMatchObject({ mood: "frail", unfed: 2 });
    expect(life(cow([]), day(3))).toMatchObject({ mood: "gone", goneAt: day(3), unfed: 3 });
    expect(life(cow([day(1) + HOUR]), day(4))).toMatchObject({ mood: "gone", goneAt: day(4) });
  });

  test("feeding at any time resets the count", () => {
    expect(life(cow([day(2) + 20 * HOUR]), day(2) + 21 * HOUR)).toMatchObject({ mood: "fed", unfed: 0 });
    expect(life(cow([day(2) + 20 * HOUR]), day(3) + HOUR)).toMatchObject({ mood: "hungry", unfed: 1 });
    expect(life(cow([day(2) + 20 * HOUR]), day(4) + HOUR)).toMatchObject({ mood: "frail" });
  });

  test("missed days count in a row, not in total", () => {
    const fed = cow([day(2) + 1, day(4) + 1, day(6) + 1]);
    expect(life(fed, day(6) + HOUR).mood).toBe("fed");
    expect(life(fed, day(7) + HOUR).mood).toBe("hungry");
  });
});

describe("growing", () => {
  test("a calf fed every day is a cow after five days, showing its stage each day", () => {
    const fed = cow(everyDay(1, 4));
    expect([0, 1, 2, 3, 4].map((n) => life(fed, day(n) + HOUR).day)).toEqual([1, 2, 3, 4, 5]);
    expect([0, 1, 2, 3, 4].map((n) => life(fed, day(n) + HOUR).stage)).toEqual([0, 0, 1, 1, 1]);
    expect(life(fed, day(5))).toMatchObject({ grown: true, stage: 2, progress: 1, adultAt: day(5), day: 5 });
    expect(stageLabel("cow", 1)).toBe("Young cow");
    expect(stageLabel("chicken", 0)).toBe("Chick");
    expect(stageLabel("goat", 2)).toBe("Animal");
  });

  test("a chick fed every day is a hen after four", () => {
    const fed = hen(everyDay(1, 3));
    expect(life(fed, day(4) - 1)).toMatchObject({ grown: false, stage: 1, day: 4 });
    expect(life(fed, day(4))).toMatchObject({ grown: true, stage: 2, adultAt: day(4) });
  });

  test("growth pauses on every unfed day", () => {
    const fed = cow([day(2) + HOUR, day(3) + HOUR, day(4) + HOUR, day(5) + HOUR]);
    expect(life(cow([]), day(2) + HOUR)).toMatchObject({ day: 2, mood: "frail" });
    expect(life(fed, day(5) + 2 * HOUR)).toMatchObject({ grown: false, day: 5 });
    expect(life(fed, day(6))).toMatchObject({ grown: true, adultAt: day(6) });
  });

  test("progress only moves inside a fed window", () => {
    const unfed = life(cow([]), day(1) + 12 * HOUR);
    expect(unfed.progress).toBeCloseTo(1 / 5);
    const fed = life(cow([day(1) + HOUR]), day(1) + 12 * HOUR);
    expect(fed.progress).toBeCloseTo(1.5 / 5);
  });

  test("an unknown kind grows like a chicken", () => {
    expect(life({ kind: "goat", boughtAt: AT, feedings: everyDay(1, 3).map((at) => ({ at })) }, day(4)).grown).toBe(true);
  });
});

describe("producing", () => {
  const grownHen = everyDay(1, 3);

  test("a grown hen lays one egg once it's fed in a window", () => {
    expect(life(hen(grownHen), day(4) + HOUR)).toMatchObject({ grown: true, ready: false, mood: "hungry" });
    expect(life(hen([...grownHen, day(4) + 2 * HOUR]), day(4) + 3 * HOUR)).toMatchObject({ ready: true, readyAt: day(4) + 2 * HOUR });
  });

  test("at most one waits, however many windows were fed, and it never spoils", () => {
    const fed = hen([...grownHen, ...everyDay(4, 9)]);
    expect(life(fed, day(10)).ready).toBe(true);
    expect(life(fed, day(10) + 20 * DAY_MS).ready).toBe(false);
    expect(life(hen([...grownHen, ...everyDay(4, 9)]), day(11)).readyAt).toBe(day(9) + HOUR);
  });

  test("collecting clears it until the next fed window", () => {
    const fed = hen([...grownHen, day(4) + HOUR], day(4) + 2 * HOUR);
    expect(life(fed, day(4) + 3 * HOUR).ready).toBe(false);
    expect(life({ ...fed, feedings: [...fed.feedings, { at: day(5) + HOUR }] }, day(5) + 2 * HOUR).ready).toBe(true);
  });

  test("nothing while young or unfed", () => {
    expect(life(hen(everyDay(1, 2)), day(3) + 2 * HOUR).ready).toBe(false);
    expect(life(hen(grownHen), day(5) + HOUR)).toMatchObject({ ready: false, mood: "frail" });
  });

  test("a wandered-off animal has nothing waiting", () => {
    expect(life(hen([...grownHen, day(4) + HOUR]), day(7)).ready).toBe(false);
  });
});

describe("kept feedings", () => {
  test("a young animal keeps all its feedings", () => {
    expect(keptFeedings(cow(everyDay(1, 3)), day(3) + 2 * HOUR)).toHaveLength(3);
  });

  test("a grown one keeps its growing days and the last two, and its life doesn't change", () => {
    const all = cow([...everyDay(1, 4), ...everyDay(5, 30)]);
    const kept = keptFeedings(all, day(30) + 2 * HOUR);
    expect(kept).toHaveLength(6);
    const trimmed = { ...all, feedings: kept };
    for (const at of [day(30) + 2 * HOUR, day(31) + HOUR, day(32) + HOUR, day(33)]) expect(life(trimmed, at)).toEqual(life(all, at));
  });
});

describe("cards and labels", () => {
  test("a young hungry cow", () => {
    expect(animalCard(cow([]), day(1) + HOUR)).toBe("Daisy · hungry · day 2 of 5");
    expect(animalLabel(cow([]), day(1) + HOUR)).toBe("Daisy, cow, hungry, day 2 of 5");
  });

  test("a grown cow with milk ready, one that's fed, and one that wandered off", () => {
    const grown = cow([...everyDay(1, 4), day(5) + HOUR]);
    expect(animalCard({ ...grown, name: "Bessie" }, day(5) + 2 * HOUR)).toBe("Bessie · milk ready");
    expect(animalLabel({ ...grown, name: "Bessie" }, day(5) + 2 * HOUR)).toBe("Bessie, cow, milk ready");
    expect(animalCard({ ...grown, name: "Bessie", collectedAt: day(5) + 3 * HOUR }, day(5) + 4 * HOUR)).toBe("Bessie · fed");
    expect(animalCard(cow([]), day(3))).toBe("Daisy · wandered off");
  });

  test("a hen with an egg, and an unknown kind", () => {
    const grown = hen([...everyDay(1, 3), day(4) + HOUR]);
    expect(animalCard(grown, day(4) + 2 * HOUR)).toBe("Henrietta · egg ready");
    expect(animalLabel({ kind: "goat", name: "G", boughtAt: AT, feedings: [] }, AT)).toBe("G, animal, day 1 of 4");
  });
});

describe("names", () => {
  test("names go through the chat filter and are 16 characters at most", () => {
    expect(cleanName("  Daisy​  May ")).toBe("Daisy May");
    expect(cleanName("​ ")).toBeNull();
    expect(cleanName("A".repeat(NAME_MAX))).toBe("A".repeat(16));
    expect(cleanName("A".repeat(NAME_MAX + 1))).toBeNull();
    expect(cleanName("🐄".repeat(16))).toBe("🐄".repeat(16));
  });

  test("random names come from each animal's list", () => {
    expect(randomName("cow", 0)).toBe("Daisy");
    expect(randomName("cow", 0.15)).toBe("Bessie");
    expect(randomName("chicken", 0.999)).toBe("Dot");
    expect(randomName("chicken", 1)).toBe("Dot");
    expect(randomName("chicken", -1)).toBe("Henrietta");
  });
});

describe("reminders", () => {
  test("hungry and frail count as hungry; eggs and milk are counted; gone ones don't count", () => {
    const at = day(5) + 2 * HOUR;
    const frail = { ...cow([]), boughtAt: day(3) };
    const gone = { ...cow([]), boughtAt: day(1) };
    const animals = [hen([...everyDay(1, 3), day(4) + HOUR]), cow([...everyDay(1, 4), day(5) + HOUR]), frail, gone];
    expect(animalNudge(animals, 0, at)).toEqual({ hungry: 2, eggs: 1, milk: 1, due: true });
    expect(animalNudge([cow([])], 0, day(1) + HOUR)).toEqual({ hungry: 1, eggs: 0, milk: 0, due: true });
    expect(animalNudge([cow([])], 0, day(3) + HOUR)).toEqual({ hungry: 0, eggs: 0, milk: 0, due: false });
  });

  test("a waiting product is due only when it's new since the last push", () => {
    const ready = cow([...everyDay(1, 4), day(5) + HOUR]);
    expect(animalNudge([ready], day(5) + 2 * HOUR, day(5) + 3 * HOUR)).toEqual({ hungry: 0, eggs: 0, milk: 1, due: false });
  });

  test("the text", () => {
    expect(animalNudgeText({ hungry: 3, eggs: 4, milk: 2 })).toEqual(["3 animals are hungry", "4 eggs to collect", "2 cows to milk"]);
    expect(animalNudgeText({ hungry: 1, eggs: 1, milk: 1 })).toEqual(["1 animal is hungry", "1 egg to collect", "1 cow to milk"]);
    expect(animalNudgeText({ hungry: 0, eggs: 0, milk: 0 })).toEqual([]);
  });
});

describe("the bag", () => {
  test("goods and feed lists, and the value of the goods", () => {
    expect(goodsList({ milk: 2, egg: 3, cheese: 1, egg2: 0 })).toEqual([{ id: "egg", count: 3, price: 6 }, { id: "milk", count: 2, price: 9 }]);
    expect(goodsList({ egg: 0 })).toEqual([]);
    expect(goodsTotal({ egg: 3, milk: 2 })).toBe(36);
    expect(feedList({ hay: 5, grain: 0 })).toEqual([{ id: "hay", count: 5 }]);
  });
});

describe("the backyard layout", () => {
  test("the plots and the pens don't overlap, and each pen's gate is somewhere you can stand", () => {
    for (const id of ["coop", "barn"] as const) {
      const pen = PENS[id];
      for (const plot of PLOTS) expect(plot.z - 0.7 > pen.front || Math.abs(plot.x - pen.x) > pen.w).toBe(true);
      const gate = penStand(id);
      expect(clampTarget(gate.x, gate.z, "backyard")).toEqual(gate);
    }
    expect(PEN_OBSTACLES).toHaveLength(4);
  });

  test("you can walk from the back door and from the Garden to every plot and both pen gates", () => {
    const spots = [...PLOTS.map((plot) => plotStand(plot.index)), penStand("coop"), penStand("barn")];
    for (const from of [arrivalSpot("home", "backyard"), arrivalSpot("garden", "backyard")]) {
      for (const spot of spots) expect(findPath("backyard", from, clampTarget(spot.x, spot.z, "backyard"), [])).not.toBeNull();
    }
    expect(PLOT_OBSTACLES).toHaveLength(12);
  });
});
