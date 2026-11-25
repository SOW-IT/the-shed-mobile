import { fonts } from "@/theme";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import Ionicons from "@expo/vector-icons/Ionicons";
import { GAME_IDS, GAME_INFO, playingLine, type GameId } from "@shared/games";
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { blurBehind, itemStyle, popStyle, scrimStyle, useOverlayClock } from "./Overlays";
import { glass, hud } from "./palette";

const GAME_ICONS: Record<GameId, string> = { shooter: "✈️", runner: "🏃", flappy: "🐤", glider: "🕊️" };

export type ArcadeTarget = GameId | "leaderboard";

export const ArcadePanel = ({
  open,
  top,
  playing,
  onOpen,
  onClose,
}: {
  open: boolean;
  top: number;
  playing: Partial<Record<GameId, readonly string[]>>;
  onOpen: (target: ArcadeTarget) => void;
  onClose: () => void;
}) => {
  const overlay = useOverlayClock(open, GAME_IDS.length + 2);
  const { width, height } = useWindowDimensions();
  if (!overlay.mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the arcade" testID="world-arcade-scrim">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle(overlay)]} />
      </Pressable>
      <Animated.View
        style={[styles.panel, blurBehind, { top, width: Math.min(380, width - 28), maxHeight: Math.max(0, height - top - 24) }, popStyle(overlay)]}
        testID="world-arcade"
      >
        <Animated.View style={[styles.header, itemStyle(overlay, 0)]}>
          <View style={styles.badge}>
            <Ionicons name="game-controller" size={18} color={hud.onAccent} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Arcade
          </Text>
          <View style={styles.grow} />
          <Pressable
            onPress={() => onOpen("leaderboard")}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Leaderboard"
            testID="world-arcade-leaderboard"
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Ionicons name="trophy-outline" size={17} color={glass.text} />
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="world-arcade-close"
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={18} color={glass.text} />
          </Pressable>
        </Animated.View>
        <SharpScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          {GAME_IDS.map((id, i) => {
            const who = playingLine(playing[id] ?? [], id);
            return (
              <Animated.View key={id} style={itemStyle(overlay, i + 1)}>
                <Pressable
                  onPress={() => onOpen(id)}
                  accessibilityRole="button"
                  accessibilityLabel={who ? `${GAME_INFO[id].title}. ${who}` : GAME_INFO[id].title}
                  testID={`world-arcade-${id}`}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <Text style={styles.icon}>{GAME_ICONS[id]}</Text>
                  <View style={styles.grow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {GAME_INFO[id].title}
                    </Text>
                    {who ? (
                      <View style={styles.who}>
                        <View style={styles.dot} />
                        <Text style={styles.whoText} numberOfLines={1} testID={`world-arcade-playing-${id}`}>
                          {who}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="play" size={16} color={glass.muted} />
                </Pressable>
              </Animated.View>
            );
          })}
        </SharpScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: glass.scrim },
  panel: {
    position: "absolute",
    left: 14,
    borderRadius: 24,
    backgroundColor: glass.panel,
    borderWidth: 1.5,
    borderColor: glass.edge,
    paddingTop: 12,
    overflow: "hidden",
    transformOrigin: "top left",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  badge: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
  title: { fontFamily: fonts.display, fontSize: 19, color: glass.text, marginLeft: 2 },
  grow: { flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  pressed: { opacity: 0.7 },
  scroll: { flexGrow: 0 },
  rows: { gap: 6, paddingHorizontal: 8, paddingBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, backgroundColor: glass.row },
  rowPressed: { backgroundColor: glass.rowPressed },
  icon: { fontSize: 22, width: 30, textAlign: "center" },
  rowTitle: { fontFamily: fonts.display, fontSize: 15.5, color: glass.text },
  who: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: hud.accent },
  whoText: { flexShrink: 1, fontSize: 12, color: glass.muted, fontWeight: "600" },
});
