import { kindOf } from "@shared/mahjong/tiles";
import { memo } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { mahjong as m } from "../palette";
import { tileLabel } from "./tableWords";
import { TileFace } from "./TileFace";

export const TILE_RATIO = 1.36;

/**
 * One tile, drawn: an ivory face with its rank over its suit (or its one
 * character), in its suit's ink, on a gold edge; or a green back. -1 is a
 * tile nobody may see.
 */
export const Tile = memo(function Tile({
  tile,
  width,
  back = false,
  lifted = false,
  lit = false,
  dim = false,
  onPress,
  testID,
  style,
}: {
  tile: number;
  width: number;
  back?: boolean;
  lifted?: boolean;
  lit?: boolean;
  dim?: boolean;
  onPress?: () => void;
  testID?: string;
  style?: ViewStyle;
}) {
  const height = Math.round(width * TILE_RATIO);
  const hidden = back || tile < 0;
  const radius = Math.max(2, width * 0.16);
  const side = Math.max(2, width * 0.13);
  const faceH = height - side - 2;
  const body = (
    <View
      style={[
        styles.tile,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: hidden ? m.backOrange : m.face,
          borderColor: lit ? m.lit : hidden ? m.backOrangeEdge : m.faceEdge,
          borderWidth: lit ? Math.max(1.5, width * 0.08) : 1,
          borderBottomWidth: side,
          borderBottomColor: lit ? m.lit : hidden ? m.backOrangeEdge : m.faceSide,
          opacity: dim ? 0.5 : 1,
          transform: [{ translateY: lifted ? -width * 0.32 : 0 }, { scale: lifted ? 1.08 : 1 }],
        },
        style,
      ]}
    >
      {hidden ? null : <TileFace kind={kindOf(tile)} w={width - 2} h={faceH} />}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={tileLabel(hidden ? -1 : tile)} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tileLabel(tile)} accessibilityState={{ selected: lifted }} testID={testID} hitSlop={2}>
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
