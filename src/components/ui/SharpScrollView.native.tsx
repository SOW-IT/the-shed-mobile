import type { ComponentPropsWithRef } from "react";
import { Platform, ScrollView, StyleSheet } from "react-native";
import { ScrollViewMarker } from "react-native-screens/experimental";
import { NO_EDGE_EFFECTS, splitScrollStyle } from "./sharpScroll";

export const SharpScrollView = ({ style, ...props }: ComponentPropsWithRef<typeof ScrollView>) => {
  if (Platform.OS !== "ios") return <ScrollView style={style} {...props} />;
  const { outer, inner } = splitScrollStyle(StyleSheet.flatten(style));
  return (
    <ScrollViewMarker scrollEdgeEffects={NO_EDGE_EFFECTS} style={outer}>
      <ScrollView style={inner} {...props} />
    </ScrollViewMarker>
  );
};
