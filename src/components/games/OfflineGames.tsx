import { AppIcon, Btn } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GameId } from "../../../shared/games";
import { GAME_SCREENS } from "./gameScreens";
import { GamesMenu } from "./GamesMenu";
import { Leaderboard } from "./Leaderboard";

/**
 * Shown instead of the endless loading screen when the app starts without a
 * connection: The SHED can't load, but the games can.
 */
export const OfflineScreen = ({ onPlay }: { onPlay: () => void }) => {
  const t = useAppTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]}>
      <View style={styles.center} testID="offline-screen">
        <View style={[styles.icon, { backgroundColor: t.primarySoft }]}>
          <AppIcon name="cloud-offline-outline" size={28} color={t.dark ? t.text : t.primary} />
        </View>
        <Text style={[typography.title, { color: t.text, textAlign: "center" }]}>You&apos;re offline</Text>
        <Text style={[typography.body, { color: t.muted, textAlign: "center" }]}>
          The SHED will load as soon as you&apos;re back online.
        </Text>
        <Btn title="Play a game while you wait" icon="game-controller-outline" variant="tonal" onPress={onPlay} />
      </View>
    </SafeAreaView>
  );
};

/**
 * The games without the app around them, for when the app can't load. Once
 * the connection is back, a button goes on into The SHED; it never takes you
 * out of a game on its own.
 */
export const OfflineGames = ({
  online,
  onLeave,
  canClose = false,
}: {
  online: boolean;
  onLeave: () => void;
  /** Whether the menu has a back button to the app behind it. */
  canClose?: boolean;
}) => {
  const t = useAppTheme();
  const [view, setView] = useState<GameId | "leaderboard" | "menu">("menu");
  const toMenu = () => setView("menu");
  if (view === "leaderboard") return <Leaderboard onBack={toMenu} onPlay={setView} />;
  if (view !== "menu") {
    const Game = GAME_SCREENS[view];
    return <Game onExit={toMenu} onLeaderboard={() => setView("leaderboard")} />;
  }
  return (
    <GamesMenu
      onOpen={setView}
      onBack={canClose ? onLeave : undefined}
      intro={
        <View style={[styles.banner, { backgroundColor: online ? t.successSoft : t.ghost }]}>
          <Text style={[typography.body, styles.bannerText, { color: online ? t.success : t.text }]}>
            {online ? "You're back online." : "You're offline. The games still work."}
          </Text>
          {online ? <Btn title="Open The SHED" icon="arrow-forward" onPress={onLeave} /> : null}
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
    maxWidth: 420,
    alignSelf: "center",
  },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  banner: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  bannerText: { fontWeight: "600" },
});
