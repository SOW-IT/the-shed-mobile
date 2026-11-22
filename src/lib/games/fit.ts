// Sizing a game's board to the screen.

export type Size = { width: number; height: number };

/** The board: the stage, up to each game's largest size. */
export const fitBoard = (stage: Size, max: Size): Size => ({
  width: Math.floor(Math.min(stage.width, max.width)),
  height: Math.floor(Math.min(stage.height, max.height)),
});

/**
 * How much to shrink or grow a run's world to fit the board. A run keeps the
 * size it started at, so a rotation or a resized window mid-run scales the
 * scene instead of cutting it off.
 */
export const fitScale = (world: Size | null, board: Size | null): number =>
  world && board && world.width > 0 && world.height > 0
    ? Math.min(board.width / world.width, board.height / world.height)
    : 1;
