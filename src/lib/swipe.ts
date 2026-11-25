const MIN_SWIPE = 60;

export const swipeStep = (dx: number, dy: number): -1 | 0 | 1 => {
  if (Math.abs(dx) < MIN_SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
};
