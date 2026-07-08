import { Children, ReactNode, useState } from "react";
import { LayoutChangeEvent, View } from "react-native";
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
  gap = spacing.md,
}: {
  children: ReactNode;
  minColumnWidth?: number;
  gap?: number;
}) => {
  const [width, setWidth] = useState(0);
  const items = Children.toArray(children);
  const columns = Math.max(
    1,
    Math.min(items.length, Math.floor((width + gap) / (minColumnWidth + gap)))
  );
  // Only pin a pixel width once we have both a measurement and >1 column; a
  // single column just fills the row so it matches the non-grid layout exactly.
  const columnWidth =
    width > 0 && columns > 1 ? (width - gap * (columns - 1)) / columns : undefined;
  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);
  return (
    <View
      onLayout={onLayout}
      style={{ flexDirection: "row", flexWrap: "wrap", gap }}
    >
      {items.map((child, i) => (
        <View
          key={i}
          style={columnWidth != null ? { width: columnWidth } : { width: "100%" }}
        >
          {child}
        </View>
      ))}
    </View>
  );
};
