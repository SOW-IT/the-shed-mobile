import { GameRows, GamesActions, GamesPanelHeader, type GamesTarget } from "@/components/games/GamesMenu";
import Ionicons from "@expo/vector-icons/Ionicons";
import { GAME_IDS } from "@shared/games";
import { Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { blurBehind, itemStyle, popStyle, useOverlayClock } from "./Overlays";
import { glass } from "./palette";

/**
 * The arcade's games as a panel over the World, like Settings. Nothing
 * covers the rest of the screen, so the World keeps going behind it: you can
 * still walk, chat and tap people. Picking a game goes into it.
 */
export const ArcadePanel = ({
  open,
  top,
  bottom,
  coins,
  onOpen,
  onClose,
}: {
  open: boolean;
  top: number;
  /** Whether to show your coins: not when the World's own chip is in sight above. */
  coins: boolean;
  /** Room kept free at the bottom, for the chat bar. */
  bottom: number;
  onOpen: (target: GamesTarget) => void;
  onClose: () => void;
}) => {
  const overlay = useOverlayClock(open, GAME_IDS.length + 2);
  const { width, height } = useWindowDimensions();
  if (!overlay.mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.panel, blurBehind, { top, width: Math.min(380, width - 28), maxHeight: Math.max(0, height - top - bottom) }, popStyle(overlay)]}
        pointerEvents={open ? "auto" : "none"}
        testID="world-arcade"
      >
        <GamesPanelHeader title="Arcade" style={itemStyle(overlay, 0)}>
          <GamesActions onLeaderboard={() => onOpen("leaderboard")} coins={coins} compact />
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close the arcade"
            testID="world-arcade-close"
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={18} color={glass.text} />
          </Pressable>
        </GamesPanelHeader>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          <GameRows onOpen={onOpen} rowStyle={(i) => itemStyle(overlay, i + 1)} />
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
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
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  pressed: { opacity: 0.7 },
  scroll: { flexGrow: 0 },
  rows: { paddingBottom: 10 },
});
