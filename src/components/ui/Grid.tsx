import { Children, ReactNode } from "react";
import { View } from "react-native";
import { spacing } from "@/theme";

/**
 * Lays its children out in a responsive grid: as many equal-width columns as fit
 * at `minColumnWidth`, wrapping to new rows, capped at the number of children.
 * On a narrow container it collapses to a single full-width column, so it's a
 * no-op on phones. Column width is computed from the measured container width
 * (not percentages) so the `gap`s line up exactly instead of overflowing.
 *
 * Children keep their natural heights — items in a wrapped row are top-aligned,
 * and the next row starts below the tallest of the previous one (standard
 * flex-wrap flow, not masonry).
 */
/**
 * Caps its children at a comfortable reading width, centered — for keeping
 * single-column content (forms, detail lists) from stretching across a
 * full-width screen. A no-op on narrow screens (already below the cap).
 */
export const ReadableColumn = ({
  children,
  maxWidth = 720,
}: {
  children: ReactNode;
  maxWidth?: number;
}) => (
  <View style={{ maxWidth, width: "100%", alignSelf: "center" }}>{children}</View>
);

export const Grid = ({
  children,
  minColumnWidth = 300,
  fixedWidth,
  gap = spacing.md,
}: {
  children: ReactNode;
  minColumnWidth?: number;
  /**
   * Fixed-width mode: each child is laid out at exactly this width (capped to the
   * container on narrow screens) and the row is centered, wrapping to new rows —
   * a "tree" of uniform cards rather than columns stretched to fill the width.
   * Takes precedence over `minColumnWidth` when set.
   */
  fixedWidth?: number;
  gap?: number;
}) => {
  const items = Children.toArray(children);

  // Both modes are pure flexbox — no onLayout measurement/setState, so dragging
  // the window doesn't re-render on every tick (which flickered the columns).
  // The browser/Yoga reflows the wrap smoothly as the width crosses a threshold.
  const perChild =
    fixedWidth != null
      ? // Fixed-width, centred: uniform cards, capped so they don't overflow a
        // narrow screen. Row is centred (see justifyContent below).
        { width: fixedWidth, maxWidth: "100%" as const }
      : // Fill: each card grows from a minColumnWidth basis to fill the row,
        // wrapping when another minColumnWidth card won't fit. flexShrink lets a
        // lone card shrink below the basis on a narrow screen instead of
        // overflowing.
        { flexGrow: 1, flexShrink: 1, flexBasis: minColumnWidth };
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap,
        justifyContent: fixedWidth != null ? "center" : "flex-start",
      }}
    >
      {items.map((child, i) => (
        <View key={i} style={perChild}>
          {child}
        </View>
      ))}
    </View>
  );
};
