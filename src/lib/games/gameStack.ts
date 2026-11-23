// The games in the app's stack: one game at a time, with at most one
// leaderboard over it, so going back from a game always lands on the menu.

export const GAMES_MENU = "games/index";
export const GAME_SCREEN = "games/[game]";
export const LEADERBOARD = "games/leaderboard";

type StackRoute = { name: string; key?: string; params?: object };

/**
 * The stack after choosing Play on a leaderboard: everything below the
 * games is kept, the old game and leaderboard go, and the new game sits
 * straight on the menu (added if the leaderboard was opened without it).
 */
export const routesToPlay = <R extends StackRoute>(routes: readonly R[], game: string): (R | StackRoute)[] => {
  const first = routes.findIndex((route) => route.name === GAME_SCREEN || route.name === LEADERBOARD);
  const below = first === -1 ? [...routes] : routes.slice(0, first);
  const menu = below.at(-1)?.name === GAMES_MENU ? [] : [{ name: GAMES_MENU }];
  return [...below, ...menu, { name: GAME_SCREEN, params: { game } }];
};
