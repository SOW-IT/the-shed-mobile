import { Children, isValidElement, ReactNode, useState } from "react";
import { ScrollView, View } from "react-native";
import { spacing } from "@/theme";

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
                  if (i !== capIndex) return;
                  const { y, height } = e.nativeEvent.layout;
                  setCappedHeight(y + height);
                }
          }
        >
          {child}
        </View>
      ))}
    </View>
  );

  if (capIndex == null) return grid;
  return (
    <ScrollView
      style={{
        flexGrow: 0,
        flexShrink: 0,
        marginHorizontal: -SHADOW_BLEED_X,
        marginVertical: -SHADOW_BLEED_Y,
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
    >
      {grid}
    </ScrollView>
  );
};
