import { describe, expect, test } from "vitest";
import { GAME_SCREEN, GAMES_MENU, LEADERBOARD, routesToPlay, WORLD } from "./gameStack";

type Route = { name: string; params?: object };

/** The root stack, as the games move through it. */
const stack = (start: Route[]) => {
  let routes: Route[] = start;
  return {
    push: (route: Route) => (routes = [...routes, route]),
    play: (game: string) => (routes = routesToPlay(routes, game)),
    back: () => (routes = routes.slice(0, -1)),
    get routes() {
      return routes;
    },
    get names() {
      return routes.map((route) => route.name);
    },
  };
};

describe("the games in the stack", () => {
  test("game → leaderboard → game → leaderboard → game keeps one game on the menu, and back goes to the menu", () => {
    const s = stack([{ name: "(tabs)" }, { name: GAMES_MENU }]);
    s.push({ name: GAME_SCREEN, params: { game: "shooter" } });
    s.push({ name: LEADERBOARD, params: { game: "shooter" } });
    s.play("runner");
    expect(s.names).toEqual(["(tabs)", GAMES_MENU, GAME_SCREEN]);
    s.push({ name: LEADERBOARD, params: { game: "runner" } });
    s.play("flappy");
    expect(s.routes).toHaveLength(3);
    expect(s.routes.at(-1)).toEqual({ name: GAME_SCREEN, params: { game: "flappy" } });
    s.back();
    expect(s.names.at(-1)).toBe(GAMES_MENU);
  });

  test("however many times round, the stack never grows past a game with a leaderboard on it", () => {
    const s = stack([{ name: "(tabs)" }, { name: GAMES_MENU }]);
    s.push({ name: GAME_SCREEN, params: { game: "shooter" } });
    for (const game of ["runner", "flappy", "shooter", "shooter", "runner", "flappy", "runner"]) {
      s.push({ name: LEADERBOARD });
      expect(s.routes).toHaveLength(4);
      s.play(game);
      expect(s.names).toEqual(["(tabs)", GAMES_MENU, GAME_SCREEN]);
      expect(s.routes.filter((route) => route.name === GAME_SCREEN)).toHaveLength(1);
    }
  });

  test("the leaderboard opened from the menu gives way to the game", () => {
    const s = stack([{ name: "(tabs)" }, { name: GAMES_MENU }, { name: LEADERBOARD }]);
    s.play("runner");
    expect(s.names).toEqual(["(tabs)", GAMES_MENU, GAME_SCREEN]);
  });

  test("a leaderboard opened by a link, with no menu under it, still leaves the game on the menu", () => {
    expect(routesToPlay([{ name: LEADERBOARD }], "flappy").map((route) => route.name)).toEqual([GAMES_MENU, GAME_SCREEN]);
    expect(routesToPlay([{ name: "(tabs)" }, { name: LEADERBOARD }], "flappy").map((route) => route.name)).toEqual([
      "(tabs)",
      GAMES_MENU,
      GAME_SCREEN,
    ]);
  });

  test("from the World's arcade, the game sits on the World and back goes to the World", () => {
    const s = stack([{ name: "(tabs)" }, { name: WORLD }]);
    s.push({ name: GAME_SCREEN, params: { game: "runner" } });
    s.push({ name: LEADERBOARD, params: { game: "runner" } });
    s.play("glider");
    expect(s.names).toEqual(["(tabs)", WORLD, GAME_SCREEN]);
    s.back();
    expect(s.names.at(-1)).toBe(WORLD);
  });

  test("the leaderboard opened from the World's arcade gives way to the game on the World", () => {
    expect(routesToPlay([{ name: "(tabs)" }, { name: WORLD }, { name: LEADERBOARD }], "flappy").map((route) => route.name)).toEqual([
      "(tabs)",
      WORLD,
      GAME_SCREEN,
    ]);
  });

  test("the screens under the games keep their own keys", () => {
    const tabs = { name: "(tabs)", key: "tabs-1" };
    const menu = { name: GAMES_MENU, key: "menu-1" };
    const next = routesToPlay([tabs, menu, { name: GAME_SCREEN, key: "g" }, { name: LEADERBOARD, key: "l" }], "shooter");
    expect(next.slice(0, 2)).toEqual([tabs, menu]);
  });
});
