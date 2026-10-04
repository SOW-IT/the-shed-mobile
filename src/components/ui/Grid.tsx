import {
  Children,
  isValidElement,
  ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  View,
  type ViewStyle,
} from "react-native";
import { spacing, useAppTheme } from "@/theme";
import { Btn } from "./buttons";
import { hapticSelect } from "./format";
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

const SHADOW_BLEED_X = spacing.md;
const SHADOW_BLEED_Y = spacing.sm;
const EDGE_SHADE_HEIGHT = spacing.lg;

const gradientStyle = (gradient: string): ViewStyle =>
  (Platform.OS === "web"
    ? { backgroundImage: gradient }
    : { experimental_backgroundImage: gradient }) as ViewStyle;

const EdgeShade = ({
  edge,
  visible,
  width,
}: {
  edge: "top" | "bottom";
  visible: boolean;
  width: number | null;
}) => {
  const t = useAppTheme();
  const shade = t.dark ? "rgba(0, 0, 0, 0.5)" : "rgba(15, 37, 35, 0.14)";
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          ...(width != null ? { width } : { right: 0 }),
          height: EDGE_SHADE_HEIGHT,
          opacity: visible ? 1 : 0,
          [edge]: 0,
        },
        gradientStyle(
          `linear-gradient(${edge === "top" ? "to bottom" : "to top"}, ${shade}, transparent)`
        ),
      ]}
    />
  );
};

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
  const [cappedHeight, setCappedHeight] = useState<number | null>(null);
  const [gridHeight, setGridHeight] = useState<number | null>(null);
  const [edges, setEdges] = useState({ atTop: true, atBottom: false });
  const [contentRight, setContentRight] = useState<number | null>(null);
  const itemRights = useRef(new Map<number, number>());
  const scrollRef = useRef<ScrollView>(null);
  const scrollBy = useScrollBy();
  const toggleRef = useRef<View>(null);
  // Window y of the toggle just before collapsing, so the page can be
  // scrolled to keep it under the finger once the box shrinks back.
  const collapseAnchorY = useRef<number | null>(null);
  const capIndex =
    maxVisible != null && items.length > maxVisible ? maxVisible - 1 : null;

  useLayoutEffect(() => {
    if (expanded) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const before = collapseAnchorY.current;
    if (before == null) return;
    collapseAnchorY.current = null;
    toggleRef.current?.measureInWindow((_x, after) => {
      if (after !== before) scrollBy(after - before);
    });
  }, [expanded, scrollBy]);

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
        capIndex == null
          ? undefined
          : (e) => setGridHeight(e.nativeEvent.layout.height)
      }
    >
      {items.map((child, i) => (
        <View
          key={isValidElement(child) ? child.key ?? i : i}
          style={perChild}
          onLayout={
            capIndex == null
              ? undefined
              : (e) => {
                  const { x, y, width, height } = e.nativeEvent.layout;
                  itemRights.current.set(i, x + width);
                  for (const k of itemRights.current.keys()) {
                    if (k >= items.length) itemRights.current.delete(k);
                  }
                  setContentRight(Math.max(...itemRights.current.values()));
                  if (i === capIndex) setCappedHeight(y + height);
                }
          }
        >
          {child}
        </View>
      ))}
    </View>
  );

  if (capIndex == null) return grid;

  // A cap that lands mid-row can leave nothing hidden.
  const overflows =
    cappedHeight == null || gridHeight == null || gridHeight > cappedHeight + 1;
  const boxed = overflows && !expanded;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atTop = contentOffset.y <= 1;
    const atBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - 1;
    if (atTop !== edges.atTop || atBottom !== edges.atBottom) {
      setEdges({ atTop, atBottom });
    }
  };

  const toggle = () => {
    hapticSelect();
    if (!expanded) {
      setExpanded(true);
      return;
    }
    setEdges({ atTop: true, atBottom: false });
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

  const shadeWidth =
    contentRight != null ? contentRight + SHADOW_BLEED_X * 2 : null;

  return (
    <View style={{ gap }}>
      <View
        style={{
          marginHorizontal: -SHADOW_BLEED_X,
          marginVertical: -SHADOW_BLEED_Y,
        }}
      >
        <ScrollView
          ref={scrollRef}
          style={{
            flexGrow: 0,
            flexShrink: 0,
            maxHeight:
              boxed && cappedHeight != null
                ? cappedHeight + SHADOW_BLEED_Y * 2
                : undefined,
          }}
          contentContainerStyle={{
            paddingHorizontal: SHADOW_BLEED_X,
            paddingVertical: SHADOW_BLEED_Y,
          }}
          scrollEnabled={boxed}
          nestedScrollEnabled
          showsVerticalScrollIndicator={boxed}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={onScroll}
        >
          {grid}
        </ScrollView>
        <EdgeShade edge="top" visible={boxed && !edges.atTop} width={shadeWidth} />
        <EdgeShade
          edge="bottom"
          visible={boxed && !edges.atBottom}
          width={shadeWidth}
        />
      </View>
      {overflows ? (
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
      ) : null}
    </View>
  );
};
