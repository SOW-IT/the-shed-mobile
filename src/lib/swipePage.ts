export const SWIPE_DISTANCE = 56;
export const SWIPE_SPEED = 600;

export const swipePage = (translationX: number, velocityX: number): -1 | 0 | 1 => {
  "worklet";
  if (translationX === 0) return 0;
  const sameWay = Math.sign(velocityX) === Math.sign(translationX);
  const flicked = Math.abs(velocityX) >= SWIPE_SPEED;
  if (flicked && !sameWay) return 0;
  if (Math.abs(translationX) < SWIPE_DISTANCE && !flicked) return 0;
  return translationX < 0 ? 1 : -1;
};

// How tall the pager is at `pos` (fractional while it slides), from the
// heights of the pages either side; a page not measured yet takes the other's.
export const heightBetween = (heights: Record<number, number>, pos: number): number | undefined => {
  "worklet";
  const from = Math.floor(pos);
  const t = pos - from;
  const a = heights[from];
  const b = heights[from + 1];
  if (a === undefined) return b;
  if (b === undefined || t === 0) return a;
  return a + (b - a) * t;
};
