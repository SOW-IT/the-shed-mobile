import { isDragon, isFlowerTile, isSuited, isWind, kindOf, suitOf, tileFace } from "@shared/mahjong/tiles";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { mahjong as m } from "../palette";
import { tileLabel } from "./tableWords";

export const TILE_RATIO = 1.36;

const inkOf = (kind: number) => {
  if (isSuited(kind)) return [m.dots, m.bamboo, m.characters][suitOf(kind)];
  if (isDragon(kind)) return [m.characters, m.bamboo, m.dots][kind - 31];
  if (isWind(kind)) return m.honour;
  return m.flower;
};

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
  const kind = hidden ? -1 : kindOf(tile);
  const face = hidden ? null : tileFace(kind);
  const ink = hidden ? m.honour : inkOf(kind);
  const radius = Math.max(2, width * 0.14);
  const body = (
    <View
      style={[
        styles.tile,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: hidden ? m.back : m.tile,
          borderColor: lit ? m.lit : hidden ? m.backEdge : m.tileEdge,
          borderWidth: lit ? Math.max(1.5, width * 0.08) : 1,
          borderBottomWidth: Math.max(2, width * 0.12),
          borderBottomColor: lit ? m.lit : hidden ? m.backEdge : m.tileSide,
          opacity: dim ? 0.5 : 1,
          transform: [{ translateY: lifted ? -width * 0.32 : 0 }],
        },
        style,
      ]}
    >
      {face ? (
        <>
          <Text style={[styles.top, { color: ink, fontSize: width * (face.bottom ? 0.52 : 0.62), lineHeight: width * (face.bottom ? 0.62 : 0.78) }]} allowFontScaling={false}>
            {face.top}
          </Text>
          {face.bottom ? (
            <Text style={[styles.bottom, { color: ink, fontSize: width * (isFlowerTile(tile) ? 0.3 : 0.36), lineHeight: width * 0.42 }]} allowFontScaling={false}>
              {face.bottom}
            </Text>
          ) : null}
        </>
      ) : null}
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
  top: { fontWeight: "800", textAlign: "center" },
  bottom: { fontWeight: "700", textAlign: "center" },
});
