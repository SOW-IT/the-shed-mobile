export const SWIPE_CLOSE_DISTANCE = 96;
const SWIPE_CLOSE_VELOCITY = 0.8;
const SWIPE_FLICK_DISTANCE = 24;
export const PULL_CLOSE_DISTANCE = 64;

export const isSheetDrag = (dx: number, dy: number): boolean => dy > 8 && dy > Math.abs(dx) * 1.5;

export const sheetDragOffset = (dy: number): number => (dy >= 0 ? dy : dy / 4);

export const swipeCloses = (dy: number, vy: number): boolean =>
  dy > SWIPE_CLOSE_DISTANCE || (dy > SWIPE_FLICK_DISTANCE && vy > SWIPE_CLOSE_VELOCITY);

export const pullCloses = (contentOffsetY: number): boolean => contentOffsetY < -PULL_CLOSE_DISTANCE;
