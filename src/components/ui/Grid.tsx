import { Children, isValidElement, ReactNode } from "react";
import { View } from "react-native";
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

export const Grid = ({
  children,
  minColumnWidth = 300,
  fixedWidth,
  align = "center",
  gap = spacing.md,
}: {
  children: ReactNode;
  minColumnWidth?: number;
  fixedWidth?: number;
  align?: "center" | "start";
  gap?: number;
}) => {
  const items = Children.toArray(children);

  const perChild =
    fixedWidth != null
      ?
        { width: fixedWidth, maxWidth: "100%" as const }
      :
        { flexGrow: 1, flexShrink: 1, flexBasis: minColumnWidth };
  return (
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
        <View key={isValidElement(child) ? child.key ?? i : i} style={perChild}>
          {child}
        </View>
      ))}
    </View>
  );
};
