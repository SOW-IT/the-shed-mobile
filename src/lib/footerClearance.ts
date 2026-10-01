// How much room scrolling content leaves for a FooterAction pinned over it.
// Kept free of react-native imports so it can be unit tested.

/** Content padding when a footer is present but not yet measured. */
export const FOOTER_MIN_CLEARANCE = 96;

/** Gap kept between a footer and the screen bottom, and between content and the footer (spacing.md). */
export const FOOTER_GAP = 12;

/** How far a footer reaches up from the bottom of its host: its own height, its lift, and the gap below it. */
export const footerReach = (layoutHeight: number, bottomOffset = 0): number =>
  layoutHeight + FOOTER_GAP + bottomOffset;

/** Bottom padding that keeps the last content clear of a footer reaching `reach` up the screen. */
export const footerClearance = (
  reach: number,
  floor: number = FOOTER_MIN_CLEARANCE
): number => Math.max(floor, reach + FOOTER_GAP);
