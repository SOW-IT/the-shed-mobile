import { CAFE_GAME_ORDER, CAFE_GAMES, type CafeGameKind, type Side } from "@shared/cafeGames";
import { fonts } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCafeTheme } from "./cafeTheme";

const Dot = ({ colour, size }: { colour: string; size: number }) => <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour }} />;

const GLYPH_PIECES: readonly { id: string; side: Side }[] = [
  { id: "tl", side: "a" },
  { id: "tr", side: "b" },
  { id: "bl", side: "b" },
  { id: "br", side: "a" },
];

export const GameGlyph = ({ kind, size = 22 }: { kind: CafeGameKind; size?: number }) => {
  const c = useCafeTheme();
  const unit = size / 2;
  if (kind === "fourInARow" || kind === "fiveInARow") {
    const order = GLYPH_PIECES;
    return (
      <View style={[styles.glyph, { width: size, height: size }, kind === "fiveInARow" && { backgroundColor: c.fiveWoodTop, borderRadius: 4 }]}>
        {order.map(({ id, side }) => (
          <View key={id} style={[styles.centre, { width: unit, height: unit }]}>
            <Dot colour={c[side].fill} size={unit - 3} />
          </View>
        ))}
      </View>
    );
  }
  if (kind === "ticTacToe") {
    return (
      <View style={[styles.glyph, { width: size, height: size, backgroundColor: c.tttBoard, borderRadius: 4 }]}>
        <View style={[styles.centre, { width: unit, height: unit }]}>
          <Text style={[styles.glyphX, { color: c.a.fill }]}>✕</Text>
        </View>
        <View style={{ width: unit, height: unit }} />
        <View style={{ width: unit, height: unit }} />
        <View style={[styles.centre, { width: unit, height: unit }]}>
          <View style={{ width: unit - 3, height: unit - 3, borderRadius: unit, borderWidth: 2, borderColor: c.b.fill }} />
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.glyphBox, { width: size, height: size, borderColor: c.a.fill }]}>
      <View style={[styles.glyphFill, { backgroundColor: c.a.box }]} />
      {[0, 1, 2, 3].map((corner) => (
        <View key={corner} style={[styles.glyphPeg, { backgroundColor: c.peg, left: corner % 2 ? size - 6 : -2, top: corner > 1 ? size - 6 : -2 }]} />
      ))}
    </View>
  );
};

export const GameTiles = ({ onPick, testPrefix }: { onPick: (kind: string) => void; testPrefix: string }) => {
  const c = useCafeTheme();
  return (
    <View style={styles.tiles}>
      {CAFE_GAME_ORDER.map((kind) => (
        <Pressable
          key={kind}
          onPress={() => onPick(kind)}
          accessibilityRole="button"
          accessibilityLabel={CAFE_GAMES[kind].label}
          testID={`${testPrefix}-${kind}`}
          style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? c.tilePressed : c.tile, borderColor: c.tileEdge }]}
        >
          <GameGlyph kind={kind} />
          <Text style={[styles.tileText, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {CAFE_GAMES[kind].label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  centre: { alignItems: "center", justifyContent: "center" },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  tile: { flexGrow: 1, flexBasis: "40%", flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 11, paddingHorizontal: 9, borderRadius: 16, borderWidth: 1 },
  tileText: { flexShrink: 1, fontFamily: fonts.display, fontSize: 13.5, letterSpacing: -0.2 },
  glyph: { flexDirection: "row", flexWrap: "wrap", overflow: "hidden" },
  glyphX: { fontSize: 10, fontWeight: "900", lineHeight: 11 },
  glyphBox: { borderWidth: 2, borderRadius: 3 },
  glyphFill: { flex: 1, margin: 2, borderRadius: 2 },
  glyphPeg: { position: "absolute", width: 6, height: 6, borderRadius: 3 },
});
