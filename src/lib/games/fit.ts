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

/**
 * Where a scene's ground starts on the screen, measured from the top of the
 * game's screen: the stage's top, then the board centred in the stage, then
 * the ground's place in the scaled scene.
 */
export const groundLine = (
  stage: { y: number; height: number },
  shownHeight: number,
  groundTop: number,
  scale: number
): number => stage.y + (stage.height - shownHeight) / 2 + groundTop * scale;

/**
 * How much to shrink a start card so it fits a short stage with `margin`
 * left above and below: 1 when it already fits. Shrinking (not scrolling)
 * keeps a tap beside the card starting the game.
 */
export const cardFitScale = (cardHeight: number | null, stageHeight: number | null, margin: number): number =>
  cardHeight && stageHeight ? Math.min(1, Math.max(0, stageHeight - 2 * margin) / cardHeight) : 1;
