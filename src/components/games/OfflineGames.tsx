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
 * The games without the app around them, for when the app can't load. When
 * the connection comes back, a small "Online" note shows and the menu's back
 * button leads into The SHED; nothing takes you out of a game on its own.
 */
export const OfflineGames = ({
  online,
  onLeave,
  canClose = false,
}: {
  online: boolean;
  onLeave: () => void;
  /** Whether the menu always has a back button to the app behind it. */
  canClose?: boolean;
}) => {
  const t = useAppTheme();
  const [view, setView] = useState<GameId | "leaderboard" | "menu">("menu");
  // The game a leaderboard was opened from, so it opens on that game's tab.
  const [boardGame, setBoardGame] = useState<GameId | undefined>(undefined);
  const toMenu = () => setView("menu");
  const open = (target: GameId | "leaderboard") => {
    if (target === "leaderboard") setBoardGame(undefined);
    setView(target);
  };
  if (view === "leaderboard") return <Leaderboard onBack={toMenu} onPlay={setView} initialGame={boardGame} />;
  if (view !== "menu") {
    const game = view;
    const Game = GAME_SCREENS[game];
    return (
      <Game
        onExit={toMenu}
        onLeaderboard={() => {
          setBoardGame(game);
          setView("leaderboard");
        }}
      />
    );
  }
  return (
    <GamesMenu
      onOpen={open}
      onBack={canClose || online ? onLeave : undefined}
      intro={
        online ? null : (
          <View style={[styles.banner, { backgroundColor: t.ghost }]} testID="offline-notice">
            <Text style={[typography.body, styles.bannerText, { color: t.text }]}>You&apos;re offline.</Text>
          </View>
        )
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
  banner: { borderRadius: radius.lg, padding: spacing.lg },
  bannerText: { fontWeight: "600" },
});
