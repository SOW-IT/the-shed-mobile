/**
 * Where one seated foot sits on screen relative to the character's ground point.
 * Facing straight ahead (`side = 0`), bench feet hang forward below the seat;
 * turned sideways (e.g. a library armchair or side log), they shift out to the
 * side at seat height and stagger in depth instead of dangling down over the
 * armrest.
 */
export const seatedFoot = ({
  foot,
  s,
  up,
  sit,
  facing,
  side,
  e,
}: {
  foot: { x: number; y: number };
  s: number;
  up: number;
  sit: number;
  facing: number;
  side: number;
  e: -1 | 1;
}) => {
  if (sit <= 0) {
    return { x: foot.x + (0.18 * e + side * 0.34) * s, y: foot.y - 0.06 * up + facing * 0.2 * s };
  }
  const sideSq = side * side;
  return {
    x: foot.x + (0.13 * e * Math.abs(facing) + side * (0.3 + 0.24 * sideSq)) * s,
    y: foot.y - Math.max(0.08, sit - 0.12 + 0.18 * sideSq) * up + (facing * (1 - sideSq) * 0.17 - 0.055 * e * side) * s,
  };
};
