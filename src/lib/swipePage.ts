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
