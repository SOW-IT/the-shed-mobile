import { Children, isValidElement, ReactNode, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  View,
  type ViewStyle,
} from "react-native";
import { spacing, useAppTheme } from "@/theme";

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
  const [cappedHeight, setCappedHeight] = useState<number | null>(null);
  const [edges, setEdges] = useState({ atTop: true, atBottom: false });
  const [contentRight, setContentRight] = useState<number | null>(null);
  const itemRights = useRef(new Map<number, number>());
  const capIndex =
    maxVisible != null && items.length > maxVisible ? maxVisible - 1 : null;

  const perChild =
    fixedWidth != null
      ?
        { width: fixedWidth, maxWidth: "100%" as const }
      :
        { flexGrow: 1, flexShrink: 1, flexBasis: minColumnWidth };
  const grid = (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap,
        justifyContent:
          fixedWidth != null && align === "center" ? "center" : "flex-start",
      }}
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

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atTop = contentOffset.y <= 1;
    const atBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - 1;
    if (atTop !== edges.atTop || atBottom !== edges.atBottom) {
      setEdges({ atTop, atBottom });
    }
  };

  const shadeWidth =
    contentRight != null ? contentRight + SHADOW_BLEED_X * 2 : null;

  return (
    <View
      style={{
        marginHorizontal: -SHADOW_BLEED_X,
        marginVertical: -SHADOW_BLEED_Y,
      }}
    >
      <ScrollView
        style={{
          flexGrow: 0,
          flexShrink: 0,
          maxHeight:
            cappedHeight != null ? cappedHeight + SHADOW_BLEED_Y * 2 : undefined,
        }}
        contentContainerStyle={{
          paddingHorizontal: SHADOW_BLEED_X,
          paddingVertical: SHADOW_BLEED_Y,
        }}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {grid}
      </ScrollView>
      <EdgeShade edge="top" visible={!edges.atTop} width={shadeWidth} />
      <EdgeShade edge="bottom" visible={!edges.atBottom} width={shadeWidth} />
    </View>
  );
};
