import { AppIcon, Card, Muted, Screen, type AppIconName } from "@/components/ui";
import { useOffline } from "@/hooks/useOffline";
import { onlineNow, useWorldOnline } from "@/hooks/useWorldOnline";
import { useLocalBests, useScoreQueue } from "@/lib/games/gameStorage";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GAME_IDS, GAME_INFO, type GameId } from "../../../shared/games";
import { OnlineBanner } from "./OnlineBanner";
import { usePreloadAvatarArt } from "./GameCharacter";

// Ionicons only: the app has already loaded that font, and offline on web
// another icon font can't be fetched.
const GAME_ICONS: Record<GameId, AppIconName> = {
  shooter: "airplane",
  runner: "footsteps",
  flappy: "egg",
  glider: "partly-sunny",
};

// One plain line under each game's name. The how-to-play text
// (GAME_INFO.blurb) stays on the game's start card.
const GAME_LINES: Record<GameId, string> = {
  shooter: "Fly and shoot.",
  runner: "Run and jump.",
  flappy: "Tap through the gaps.",
  glider: "Swoop over the hills before dark.",
};

const LeaderboardButton = ({ onPress }: { onPress: () => void }) => {
  const t = useAppTheme();
  const color = t.dark ? t.text : t.primary;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Leaderboard"
      testID="games-open-leaderboard"
      style={({ pressed }) => [styles.board, { backgroundColor: t.primarySoft }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="trophy-outline" size={16} color={color} />
      <Text style={[typography.caption, styles.boardText, { color }]}>Leaderboard</Text>
    </Pressable>
  );
};

const MenuRow = ({
  icon,
  title,
  detail,
  meta,
  onPress,
  testID,
}: {
  icon: AppIconName;
  title: string;
  detail: string;
  meta?: string;
  onPress: () => void;
  testID: string;
}) => {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={meta ? `${title}, ${meta}` : title}
      testID={testID}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      <Card style={styles.row}>
        <View style={[styles.icon, { backgroundColor: t.primarySoft }]}>
          <AppIcon name={icon} size={24} color={t.dark ? t.text : t.primary} />
        </View>
        <View style={styles.text}>
          <Text style={[typography.headline, { color: t.text }]}>{title}</Text>
          <Text style={[typography.caption, { color: t.muted }]}>{detail}</Text>
        </View>
        {meta ? <Text style={[typography.label, { color: t.muted }]}>{meta}</Text> : null}
        <Ionicons name="chevron-forward" size={18} color={t.faint} />
      </Card>
    </Pressable>
  );
};

/** The games, each with this device's best, and the leaderboard at the top right. */
export const GamesMenu = ({
  onOpen,
  onBack,
  intro,
  onGarden,
}: {
  onOpen: (target: GameId | "leaderboard") => void;
  onBack?: () => void;
  intro?: ReactNode;
  /** Opens the World; left out where it can't open (offline). */
  onGarden?: () => void;
}) => {
  usePreloadAvatarArt();
  const bests = useLocalBests();
  const waiting = useScoreQueue().length;
  const offline = useOffline();
  const online = useWorldOnline(!!onGarden && !offline);
  return (
    <View style={styles.fill}>
    <Screen
      title="Games"
      onBack={onBack}
      maxWidth={640}
      headerRight={<LeaderboardButton onPress={() => onOpen("leaderboard")} />}
    >
      {intro}
      <View style={styles.list}>
        {onGarden && !offline ? (
          <MenuRow
            icon="leaf-outline"
            title="World"
            detail="Walk around and chat with whoever's online."
            meta={onlineNow(online)}
            onPress={onGarden}
            testID="games-open-garden"
          />
        ) : null}
        {GAME_IDS.map((game) => (
          <MenuRow
            key={game}
            icon={GAME_ICONS[game]}
            title={GAME_INFO[game].title}
            detail={GAME_LINES[game]}
            meta={bests[game] > 0 ? `Best ${bests[game].toLocaleString()}` : undefined}
            onPress={() => onOpen(game)}
            testID={`games-open-${game}`}
          />
        ))}
      </View>
      {waiting > 0 ? (
        <Muted>
          {waiting === 1 ? "A score is" : `${waiting} scores are`} saved on this device, waiting to go on the
          leaderboard when you&apos;re online and signed in.
        </Muted>
      ) : null}
    </Screen>
    <OnlineBanner />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  board: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
  },
  boardText: { fontWeight: "700" },
});
