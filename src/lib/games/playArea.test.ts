import { describe, expect, test } from "vitest";
import { GAME_IDS } from "../../../shared/games";
import { fitPlayArea, GAME_VIEWS } from "./playArea";

const CHROME = 53;
const SCREENS = {
  phone: { width: 390, height: 844 },
  smallPhone: { width: 320, height: 568 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};
const SIDEWAYS = new Set(["runner", "glider"]);

const roomFor = (game: string, screen: { width: number; height: number }) =>
  SIDEWAYS.has(game) && screen.height > screen.width ? { width: screen.height, height: screen.width } : screen;

describe("every game shows the same phone-shaped view on every screen, only bigger or smaller", () => {
  test.each(GAME_IDS)("%s fits inside each screen, fills it one way, and is centred with even borders", (game) => {
    const view = GAME_VIEWS[game];
    for (const [name, screen] of Object.entries(SCREENS)) {
      const room = roomFor(game, screen);
      const area = fitPlayArea(room, view, CHROME);
      expect(area.width, name).toBeLessThanOrEqual(room.width + 1e-6);
      expect(area.height, name).toBeLessThanOrEqual(room.height + 1e-6);
      const fillsAcross = Math.abs(area.width - room.width) < 1e-6;
      const fillsDown = Math.abs(area.height - room.height) < 1e-6;
      expect(fillsAcross || fillsDown, name).toBe(true);
      expect(area.left).toBeCloseTo((room.width - area.width) / 2);
      expect(area.top).toBeCloseTo((room.height - area.height) / 2);
      expect(area.left).toBeGreaterThanOrEqual(-1e-6);
      expect(area.top).toBeGreaterThanOrEqual(-1e-6);
      expect((area.height - CHROME) / area.width).toBeCloseTo(view.height / view.width);
    }
  });

  test("a bigger screen scales the same view up, and a small phone scales it down instead of cutting the view ahead", () => {
    for (const game of GAME_IDS) {
      const view = GAME_VIEWS[game];
      const scales = Object.fromEntries(
        Object.entries(SCREENS).map(([name, screen]) => [name, fitPlayArea(roomFor(game, screen), view, CHROME).scale])
      );
      expect(scales.smallPhone).toBeLessThan(1);
      expect(scales.tablet).toBeGreaterThan(scales.phone);
      expect(scales.desktop).toBeGreaterThan(scales.phone);
      expect(scales.phone).toBeGreaterThan(0.9);
      expect(scales.phone).toBeLessThan(1.15);
    }
  });

  test("before anything is measured there is no area to draw", () => {
    expect(fitPlayArea({ width: 0, height: 0 }, GAME_VIEWS.flappy, CHROME).scale).toBe(0);
  });
});
