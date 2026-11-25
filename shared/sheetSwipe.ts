/**
 * When a drag on a sheet closes it. The sheet's header can be dragged down,
 * and on iOS its list can be pulled down past the top, the way a system
 * sheet closes. Distances are points, velocity is points per millisecond.
 */
export const SWIPE_CLOSE_DISTANCE = 96;
const SWIPE_CLOSE_VELOCITY = 0.8;
const SWIPE_FLICK_DISTANCE = 24;
export const PULL_CLOSE_DISTANCE = 64;

/** A move that is mostly downward takes the gesture from a button in the header. */
export const isSheetDrag = (dx: number, dy: number): boolean => dy > 8 && dy > Math.abs(dx) * 1.5;

/** How far the sheet follows the finger: freely down, with resistance up. */
export const sheetDragOffset = (dy: number): number => (dy >= 0 ? dy : dy / 4);

/** Letting go far enough down, or after a quick flick down, closes the sheet. */
export const swipeCloses = (dy: number, vy: number): boolean =>
  dy > SWIPE_CLOSE_DISTANCE || (dy > SWIPE_FLICK_DISTANCE && vy > SWIPE_CLOSE_VELOCITY);

/** Letting go of a list pulled this far past its top closes the sheet. */
export const pullCloses = (contentOffsetY: number): boolean => contentOffsetY < -PULL_CLOSE_DISTANCE;
