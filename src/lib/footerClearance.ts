export const FOOTER_MIN_CLEARANCE = 96;

export const FOOTER_GAP = 12;

export const footerReach = (layoutHeight: number, bottomOffset = 0): number =>
  layoutHeight + FOOTER_GAP + bottomOffset;

export const footerClearance = (
  reach: number,
  floor: number = FOOTER_MIN_CLEARANCE
): number => Math.max(floor, reach + FOOTER_GAP);
