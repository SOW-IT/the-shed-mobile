import {
  Children,
  isValidElement,
  ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { spacing } from "@/theme";
import { Btn } from "./buttons";
import { hapticSelect, stagger } from "./format";
import { FadeInView } from "./primitives";
import { useScrollBy } from "./scrollAnchor";

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
  align = "center",
  gap = spacing.md,
  maxVisible,
}: {
  children: ReactNode;
  minColumnWidth?: number;
  fixedWidth?: number;
  align?: "center" | "start";
  gap?: number;
  maxVisible?: number;
}) => {
  const items = Children.toArray(children);
  const [expanded, setExpanded] = useState(false);
  const [columns, setColumns] = useState(1);
  const scrollBy = useScrollBy();
  const toggleRef = useRef<View>(null);
  // Window y of the toggle just before collapsing, so the page can be
  // scrolled to keep it under the finger once the hidden cards are gone.
  const collapseAnchorY = useRef<number | null>(null);

  useLayoutEffect(() => {
    const before = collapseAnchorY.current;
    if (expanded || before == null) return;
    collapseAnchorY.current = null;
    toggleRef.current?.measureInWindow((_x, after) => {
      if (after !== before) scrollBy(after - before);
    });
  }, [expanded, scrollBy]);

  // Round the cap up to whole rows so wide layouts don't end on a ragged row.
  const visibleCount =
    maxVisible == null ? null : Math.ceil(maxVisible / columns) * columns;
  const capped = visibleCount != null && items.length > visibleCount;
  const shown = capped && !expanded ? items.slice(0, visibleCount) : items;

  const perChild =
    fixedWidth != null
      ?
        { width: fixedWidth, maxWidth: "100%" as const }
      :
        { flexGrow: 1, flexShrink: 1, flexBasis: minColumnWidth };
  const justifyContent =
    fixedWidth != null && align === "center" ? "center" : "flex-start";
  const grid = (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", gap, justifyContent }}
      onLayout={
        maxVisible == null || fixedWidth == null
          ? undefined
          : (e) => {
              const next = Math.max(
                1,
                Math.floor((e.nativeEvent.layout.width + gap) / (fixedWidth + gap))
              );
              if (next !== columns) setColumns(next);
            }
      }
    >
      {shown.map((child, i) => {
        const key = isValidElement(child) ? child.key ?? i : i;
        return visibleCount != null && i >= visibleCount ? (
          <FadeInView key={key} delay={stagger(i - visibleCount)} style={perChild}>
            {child}
          </FadeInView>
        ) : (
          <View key={key} style={perChild}>
            {child}
          </View>
        );
      })}
    </View>
  );

  if (!capped) return grid;

  const toggle = () => {
    hapticSelect();
    if (!expanded) {
      setExpanded(true);
      return;
    }
    const toggleView = toggleRef.current;
    if (!toggleView) {
      setExpanded(false);
      return;
    }
    toggleView.measureInWindow((_x, y) => {
      collapseAnchorY.current = y;
      setExpanded(false);
    });
  };

  return (
    <View style={{ gap }}>
      {grid}
      <View
        ref={toggleRef}
        style={{
          width: fixedWidth ?? "100%",
          maxWidth: "100%",
          alignSelf: justifyContent === "center" ? "center" : "flex-start",
        }}
      >
        <Btn
          title={expanded ? "Show fewer" : `Show all ${items.length}`}
          icon={expanded ? "chevron-up" : "chevron-down"}
          variant="ghost"
          onPress={toggle}
        />
      </View>
    </View>
  );
};
