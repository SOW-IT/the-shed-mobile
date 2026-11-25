import { describe, expect, test } from "vitest";
import {
  bagStacks,
  CROP_IDS,
  CROPS,
  cropLabel,
  DAY_MS,
  farmNudge,
  farmPushDay,
  growth,
  isCrop,
  nudgeText,
  parseStack,
  plantCard,
  plotAt,
  plotPrice,
  plotStand,
  PLOTS,
  seedList,
  sellAllTotal,
  sellPrice,
  stackKey,
  stackLabel,
  timeLeft,
} from "./farm";

const AT = Date.UTC(2026, 10, 25, 2, 0);
const HOUR = 60 * 60_000;
const day = (n: number) => AT + n * DAY_MS;

const tomato = (waterings: number[]) => ({ crop: "tomato", plantedAt: AT, waterings: waterings.map((at) => ({ at })) });

describe("watering windows", () => {
  test("planting covers the first window", () => {
    const g = growth(tomato([]), AT + 3 * HOUR);
    expect(g).toMatchObject({ window: 0, thirsty: false, wilted: false, stage: "seed", wilts: 0, readyAt: day(4) });
  });

  test("the second window is thirsty until it's watered, at any time inside it", () => {
    expect(growth(tomato([]), day(1) + HOUR)).toMatchObject({ window: 1, thirsty: true, wilted: false });
    const watered = growth(tomato([day(1) + 23 * HOUR]), day(1) + 23.5 * HOUR);
    expect(watered).toMatchObject({ window: 1, thirsty: false, wateredAt: day(1) + 23 * HOUR });
  });

  test("watering early counts for the window it falls in and doesn't move the windows", () => {
    const plant = tomato([day(1) + 1, day(2) + 2, day(3) + 3]);
    expect(growth(plant, day(4) - 1)).toMatchObject({ window: 3, stage: "half", wilts: 0 });
    expect(growth(plant, day(4))).toMatchObject({ stage: "ripe", ripeAt: day(4), wilts: 0 });
  });

  test("a watering in the first window doesn't count for the second", () => {
    expect(growth(tomato([AT + HOUR]), day(1) + HOUR)).toMatchObject({ thirsty: true });
  });

  test("a dry window becomes a wilt when it ends, and the plant droops", () => {
    const g = growth(tomato([]), day(2) + HOUR);
    expect(g).toMatchObject({ wilts: 1, wilted: true, thirsty: true, window: 2 });
  });

  test("watering revives a wilted plant, and the wilt stays counted", () => {
    const g = growth(tomato([day(2) + 2 * HOUR]), day(2) + 3 * HOUR);
    expect(g).toMatchObject({ wilts: 1, wilted: false, thirsty: false });
  });

  test("wilts count in total, not in a row", () => {
    const plant = tomato([day(2) + 1, day(4) + 1]);
    expect(growth(plant, day(4) + HOUR)).toMatchObject({ wilts: 2, wilted: false });
    expect(growth(plant, day(5) + HOUR)).toMatchObject({ wilts: 2, thirsty: true, wilted: false });
  });

  test("a wilted window pauses growth, so ripening moves back a day", () => {
    const plant = tomato([day(2) + 1, day(3) + 1, day(4) + 1]);
    expect(growth(plant, day(3) + HOUR).readyAt).toBe(day(5));
    expect(growth(plant, day(5) - 1).stage).not.toBe("ripe");
    expect(growth(plant, day(5))).toMatchObject({ stage: "ripe", ripeAt: day(5), wilts: 1 });
  });

  test("progress stands still while the window is dry", () => {
    const dry = growth(tomato([]), day(1) + 20 * HOUR);
    expect(dry.progress).toBe(0.25);
    const wet = growth(tomato([day(1) + HOUR]), day(1) + 12 * HOUR);
    expect(wet.progress).toBeCloseTo(1.5 / 4);
  });

  test("the third wilt kills the plant", () => {
    const g = growth(tomato([]), day(4));
    expect(g).toMatchObject({ stage: "dead", wilts: 3, diedAt: day(4), readyAt: null, thirsty: false });
    expect(growth(tomato([day(2) + 1]), day(4) + 1)).toMatchObject({ stage: "sprout", wilts: 2 });
  });

  test("a ripe crop waits forever and needs no water", () => {
    const lettuce = { crop: "lettuce", plantedAt: AT, waterings: [] };
    expect(growth(lettuce, day(1))).toMatchObject({ stage: "ripe", thirsty: false, wilted: false });
    expect(growth(lettuce, day(30))).toMatchObject({ stage: "ripe", wilts: 0, ripeAt: day(1) });
  });

  test("stages go seed, sprout, half grown", () => {
    const plant = tomato([day(1) + 1, day(2) + 1, day(3) + 1]);
    expect(growth(plant, AT).stage).toBe("seed");
    expect(growth(plant, day(1) + HOUR).stage).toBe("sprout");
    expect(growth(plant, day(3)).stage).toBe("half");
  });

  test("a clock behind the planting reads as the first window", () => {
    expect(growth(tomato([]), AT - HOUR)).toMatchObject({ window: 0, progress: 0 });
  });

  test("an unknown crop grows like lettuce", () => {
    expect(growth({ crop: "kale", plantedAt: AT, waterings: [] }, day(1)).stage).toBe("ripe");
  });
});

describe("the plant card", () => {
  test("says the crop, the time left and the wilts", () => {
    expect(plantCard(tomato([day(2) + 1]), day(2) + 2 * HOUR)).toBe("Tomato · 3 days left · wilted 1×");
    expect(plantCard(tomato([]), AT)).toBe("Tomato · 4 days left");
    expect(plantCard({ crop: "lettuce", plantedAt: AT, waterings: [] }, AT + 20 * HOUR)).toBe("Lettuce · 4h left");
    expect(plantCard({ crop: "lettuce", plantedAt: AT, waterings: [] }, day(1))).toBe("Lettuce · ready");
    expect(plantCard(tomato([]), day(5))).toBe("Tomato · died · wilted 3×");
  });

  test("time left in days, then hours", () => {
    expect(timeLeft(DAY_MS)).toBe("1 day left");
    expect(timeLeft(DAY_MS + 1)).toBe("2 days left");
    expect(timeLeft(10)).toBe("1h left");
    expect(cropLabel("kale")).toBe("Plant");
  });
});

const PRICE_TABLE = [
  { crop: "lettuce", days: 1, seed: 3, sell: [4, 3, 2] },
  { crop: "carrot", days: 2, seed: 8, sell: [11, 8, 5] },
  { crop: "strawberry", days: 3, seed: 14, sell: [19, 14, 9] },
  { crop: "tomato", days: 4, seed: 25, sell: [32, 24, 16] },
  { crop: "pumpkin", days: 5, seed: 40, sell: [52, 39, 26] },
  { crop: "watermelon", days: 7, seed: 60, sell: [80, 60, 40] },
] as const;

const priceOf = (crop: string, wilts: number) => PRICE_TABLE.find((row) => row.crop === crop)!.sell[wilts];

describe("prices", () => {
  test("every crop's days, seed price and sell price with 0, 1 and 2 wilts", () => {
    expect(
      CROP_IDS.map((crop) => ({ crop, days: CROPS[crop].days, seed: CROPS[crop].seed, sell: [0, 1, 2].map((wilts) => sellPrice(crop, wilts)) }))
    ).toEqual(PRICE_TABLE);
  });

  test.each(CROP_IDS.map((crop) => [crop]))("each wilt takes 25%% of %s's base price off, rounded down", (crop) => {
    const base = CROPS[crop].sell;
    expect([0, 1, 2].map((wilts) => sellPrice(crop, wilts))).toEqual([base, Math.floor(base * 0.75), Math.floor(base * 0.5)]);
  });

  test("4 plots are free, then the ladder doubles from 10", () => {
    expect(Array.from({ length: 12 }, (_, i) => plotPrice(i))).toEqual([0, 0, 0, 0, 10, 20, 40, 80, 160, 320, 640, 1280]);
    expect(plotPrice(12)).toBeNull();
    expect(plotPrice(-1)).toBeNull();
    expect(plotPrice(1.5)).toBeNull();
  });

  test("sell all sells every stack at its own price", () => {
    const crops = { [stackKey("tomato", 0)]: 3, [stackKey("tomato", 1)]: 1, [stackKey("watermelon", 2)]: 2, "carrot:0": 0, junk: 4 };
    expect(sellAllTotal(crops)).toBe(3 * priceOf("tomato", 0) + priceOf("tomato", 1) + 2 * priceOf("watermelon", 2));
    expect(bagStacks(crops).map((s) => s.key)).toEqual(["tomato:0", "tomato:1", "watermelon:2"]);
    expect(sellAllTotal({})).toBe(0);
  });

  test("stacks are read back only when well formed", () => {
    expect(parseStack("tomato:1")).toEqual({ crop: "tomato", wilts: 1 });
    for (const bad of ["tomato", "tomato:", "tomato:3", "tomato:-1", "tomato:1.5", "kale:0", "tomato:1:2"]) expect(parseStack(bad)).toBeNull();
  });

  test("stacks are named by condition", () => {
    expect(stackLabel("tomato", 0)).toBe("Tomato");
    expect(stackLabel("tomato", 1)).toBe("Tomato · wilted once");
    expect(stackLabel("tomato", 2)).toBe("Tomato · wilted twice");
  });

  test("seeds list in crop order, without empty ones", () => {
    expect(seedList({ tomato: 2, lettuce: 4, carrot: 0 })).toEqual([
      { crop: "lettuce", count: 4 },
      { crop: "tomato", count: 2 },
    ]);
    expect(isCrop("pumpkin")).toBe(true);
    expect(isCrop(3)).toBe(false);
  });
});

describe("the plots", () => {
  test("12 plots, front row first", () => {
    expect(PLOTS).toHaveLength(12);
    expect(PLOTS.slice(0, 4).every((plot) => plot.z === PLOTS[0].z)).toBe(true);
    expect(PLOTS[4].z).toBeLessThan(PLOTS[0].z);
  });

  test("a spot is in a plot or not, and you stand in front of one", () => {
    expect(plotAt(PLOTS[5])).toBe(5);
    expect(plotAt({ x: 0, z: 6 })).toBeNull();
    expect(plotStand(0).z).toBeGreaterThan(PLOTS[0].z);
    expect(plotAt(plotStand(4))).toBeNull();
  });
});

describe("reminders", () => {
  const lettuce = (plantedAt: number) => ({ crop: "lettuce", plantedAt, waterings: [] });

  test("counts dry windows and ripe crops, and is due for either", () => {
    const plants = [tomato([]), lettuce(AT), lettuce(AT - 3 * DAY_MS)];
    expect(farmNudge(plants, 0, day(1) + HOUR)).toEqual({ thirsty: 1, ready: 2, due: true });
  });

  test("ripe crops already pushed about don't make it due on their own", () => {
    expect(farmNudge([lettuce(AT)], day(1) + 1, day(2))).toEqual({ thirsty: 0, ready: 1, due: false });
    expect(farmNudge([], 0, day(2))).toEqual({ thirsty: 0, ready: 0, due: false });
  });

  test("says it in one line", () => {
    expect(nudgeText({ thirsty: 2, ready: 3 })).toBe("2 plants need water · 3 ready to harvest");
    expect(nudgeText({ thirsty: 1, ready: 0 })).toBe("1 plant needs water");
    expect(nudgeText({ thirsty: 0, ready: 1 })).toBe("1 ready to harvest");
  });

  test("18:00 in Sydney in summer (AEDT) and winter (AEST)", () => {
    expect(farmPushDay(Date.UTC(2026, 11, 1, 7, 13))).toBe("2026-12-01");
    expect(farmPushDay(Date.UTC(2026, 11, 1, 8, 13))).toBeNull();
    expect(farmPushDay(Date.UTC(2026, 5, 1, 8, 13))).toBe("2026-06-01");
    expect(farmPushDay(Date.UTC(2026, 5, 1, 7, 13))).toBeNull();
  });
});
