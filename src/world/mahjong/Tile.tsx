import { kindOf } from "@shared/mahjong/tiles";
import { createContext, memo, useContext } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { mahjong as m } from "../palette";
import { tileIndex, tileLabel } from "./tableWords";
import { TileFace } from "./TileFace";

export const TILE_RATIO = 1.36;

export const TileLabels = createContext(false);

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
  const labels = useContext(TileLabels);
  const radius = Math.max(2, width * 0.16);
  const side = Math.max(2, width * 0.13);
  const faceH = height - side - 2;
  // The tile you've picked to let go: lifted, bigger and lit, so it's plain which one goes.
  const edge = lit || lifted;
  const body = (
    <View
      style={[
        styles.tile,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: hidden ? m.backOrange : m.face,
          borderColor: edge ? m.lit : hidden ? m.backOrangeEdge : m.faceEdge,
          borderWidth: lifted ? Math.max(2, width * 0.1) : lit ? Math.max(1.5, width * 0.08) : 1,
          borderBottomWidth: side,
          borderBottomColor: edge ? m.lit : hidden ? m.backOrangeEdge : m.faceSide,
          opacity: dim ? 0.5 : 1,
          transform: [{ translateY: lifted ? -width * 0.36 : 0 }, { scale: lifted ? 1.2 : 1 }],
        },
        lifted && styles.picked,
        style,
      ]}
    >
      {hidden ? null : <TileFace kind={kindOf(tile)} w={width - 2} h={faceH} />}
      {!hidden && labels && width >= 12 ? (
        <Text style={[styles.index, { fontSize: Math.max(7, width * 0.27), lineHeight: Math.max(8, width * 0.3), left: width * 0.06, top: width * 0.02 }]} allowFontScaling={false}>
          {tileIndex(kindOf(tile))}
        </Text>
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
  picked: { zIndex: 2, boxShadow: `0 0 10px 3px ${m.lit}` },
  index: { position: "absolute", fontWeight: "900", color: m.honour },
});
