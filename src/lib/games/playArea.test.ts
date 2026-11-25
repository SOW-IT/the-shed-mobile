import { describe, expect, test } from "vitest";
import { GAME_IDS, type GameId } from "../../../shared/games";
import { decoration, fitPlayArea, GAME_VIEWS, idealBoard } from "./playArea";

const CHROME = 53;

type Device = { width: number; height: number; top: number; bottom: number; touch: boolean };

const DEVICES: Record<string, Device> = {
  "iPhone SE": { width: 375, height: 667, top: 20, bottom: 0, touch: true },
  "iPhone 15": { width: 393, height: 852, top: 59, bottom: 34, touch: true },
  "tall Android": { width: 412, height: 960, top: 24, bottom: 24, touch: true },
  "iPad portrait": { width: 768, height: 1024, top: 24, bottom: 20, touch: true },
  desktop: { width: 1440, height: 900, top: 0, bottom: 0, touch: false },
};

const SIDEWAYS: readonly GameId[] = ["runner", "glider"];

const roomOn = (game: GameId, device: Device) => {
  const tall = device.height - device.top - device.bottom;
  return SIDEWAYS.includes(game) && device.touch ? { width: tall, height: device.width } : { width: device.width, height: tall };
};

const layout = (game: GameId, device: Device) => {
  const room = roomOn(game, device);
  const board = idealBoard(room, CHROME, GAME_VIEWS[game]);
  const area = fitPlayArea(room, board, CHROME);
  const bordered = area.width < room.width - 1 || area.height < room.height - 1;
  return { room, board, area, bordered };
};

const BORDERED: Record<GameId, readonly string[]> = {
  flappy: ["desktop"],
  shooter: ["iPad portrait", "desktop"],
  runner: [],
  glider: ["tall Android"],
};

describe("each game shows the same distance ahead on every screen, only bigger or smaller", () => {
  test.each(GAME_IDS)("%s keeps its look-ahead axis the same on every device", (game) => {
    const rule = GAME_VIEWS[game];
    for (const [name, device] of Object.entries(DEVICES)) {
      const { board } = layout(game, device);
      expect(rule.locked === "width" ? board.width : board.height, name).toBe(rule.size);
    }
  });

  test.each(GAME_IDS)("%s fills phones and tablets in its range, and has black borders only outside it", (game) => {
    for (const [name, device] of Object.entries(DEVICES)) {
      const { room, area, bordered } = layout(game, device);
      expect(bordered, name).toBe(BORDERED[game].includes(name));
      expect(area.width).toBeLessThanOrEqual(room.width + 1e-6);
      expect(area.height).toBeLessThanOrEqual(room.height + 1e-6);
      expect(area.left).toBeCloseTo((room.width - area.width) / 2);
      expect(area.top).toBeCloseTo((room.height - area.height) / 2);
    }
  });

  test("an iPhone 15 shows what it showed before 2.13.4", () => {
    const phone = DEVICES["iPhone 15"];
    expect(Math.abs(layout("flappy", phone).board.height - 703)).toBeLessThan(6);
    expect(layout("shooter", phone).board.width).toBeCloseTo(393, -1);
    expect(layout("runner", phone).board.height).toBeCloseTo(340, -1);
    for (const game of GAME_IDS) expect(layout(game, phone).area.scale).toBeCloseTo(1, 1);
  });

  test("a bigger screen draws everything bigger, by the look-ahead axis, and a small phone smaller", () => {
    for (const game of GAME_IDS) {
      const scales = Object.fromEntries(Object.entries(DEVICES).map(([name, device]) => [name, layout(game, device).area.scale]));
      expect(scales["iPad portrait"]).toBeGreaterThan(scales["iPhone 15"]);
      expect(scales.desktop).toBeGreaterThan(scales["iPhone 15"]);
      expect(scales["iPhone SE"]).toBeLessThan(scales["iPhone 15"]);
    }
    expect(layout("runner", DEVICES.desktop).area.scale).toBeCloseTo(1440 / GAME_VIEWS.runner.size);
  });

  test("before anything is measured there is no area to draw", () => {
    expect(fitPlayArea({ width: 0, height: 0 }, { width: 390, height: 700 }, CHROME).scale).toBe(0);
  });
});

describe("the scene carries on to the screen's edges, decoration only", () => {
  const decorate = (game: GameId, device: Device) => {
    const turned = SIDEWAYS.includes(game) && device.touch;
    const insets = turned
      ? { top: 0, right: device.bottom, bottom: 0, left: device.top }
      : { top: device.top, right: 0, bottom: device.bottom, left: 0 };
    const { room, area } = layout(game, device);
    const rule = GAME_VIEWS[game];
    return { area, insets, deco: decoration(room, insets, area, CHROME, rule.scenery ?? rule.aspects) };
  };

  test("on a notched iPhone the scene fills the whole screen, safe areas included", () => {
    const phone = DEVICES["iPhone 15"];
    for (const game of GAME_IDS.filter((g) => g !== "shooter")) {
      const { deco, area, insets } = decorate(game, phone);
      const turned = SIDEWAYS.includes(game);
      expect(deco.width).toBeCloseTo(turned ? phone.height : phone.width);
      expect(deco.height).toBeCloseTo(turned ? phone.width : phone.height);
      expect(deco.reach.left).toBeCloseTo(insets.left / area.scale);
      expect(deco.reach.right).toBeCloseTo(insets.right / area.scale);
      expect(deco.reach.top).toBeCloseTo((insets.top + CHROME * area.scale) / area.scale);
    }
  });

  test("outside a game's shapes the black borders stay: nothing is drawn past the play area", () => {
    for (const [game, name] of [["flappy", "desktop"], ["shooter", "desktop"]] as const) {
      const { deco, area } = decorate(game, DEVICES[name]);
      expect(deco.width).toBeCloseTo(area.width);
      expect(deco.reach.left).toBeCloseTo(0);
      expect(deco.reach.right).toBeCloseTo(0);
    }
    const ipad = DEVICES["iPad portrait"];
    expect(decorate("shooter", ipad).deco.width).toBeCloseTo(ipad.height * GAME_VIEWS.shooter.aspects[1]);
    expect(decorate("shooter", ipad).deco.width).toBeLessThan(ipad.width);
  });
});

test("on a 21:9 phone Swoop's play area keeps the iPhone's shape, and its scenery still fills the screen", () => {
  const tall = DEVICES["tall Android"];
  const { bordered, room } = layout("glider", tall);
  expect(bordered).toBe(true);
  const insets = { top: 0, right: tall.bottom, bottom: 0, left: tall.top };
  const { area } = layout("glider", tall);
  const rule = GAME_VIEWS.glider;
  const deco = decoration(room, insets, area, CHROME, rule.scenery ?? rule.aspects);
  expect(deco.width).toBeCloseTo(tall.height);
  expect(deco.height).toBeCloseTo(tall.width);
});

