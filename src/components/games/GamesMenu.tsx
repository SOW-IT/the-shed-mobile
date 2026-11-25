import { useOffline } from "@/hooks/useOffline";
import { onlineNow, useWorldOnline } from "@/hooks/useWorldOnline";
import { useLocalBests, useScoreQueue } from "@/lib/games/gameStorage";
import { fonts } from "@/theme";
import { worldColours } from "@/worldColours";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth, useQuery } from "convex/react";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { GAME_IDS, GAME_INFO, type GameId } from "../../../shared/games";
import { CoinCounter } from "./CoinCounter";
import { usePreloadAvatarArt } from "./GameCharacter";
import { OnlineBanner } from "./OnlineBanner";

const { hud, glass } = worldColours;

export type GamesTarget = GameId | "leaderboard";

// Ionicons only: the app has already loaded that font, and offline on web
// another icon font can't be fetched.
const GAME_ICONS: Record<GameId, keyof typeof Ionicons.glyphMap> = {
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

/** The World's panels let the garden show through, blurred, on the web. */
const blurBehind = (Platform.OS === "web" ? { backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" } : {}) as unknown as ViewStyle;

/**
 * Your coin balance for the Games list: undefined while it loads, and null
 * when there's none to show (signed out, or offline, where it can't update).
 */
const useCoinBalance = (): number | undefined | null => {
  const { isAuthenticated } = useConvexAuth();
  const offline = useOffline();
  const show = isAuthenticated && !offline;
  const wallet = useQuery(api.coins.mine, show ? {} : "skip");
  if (!show || wallet === null) return null;
  return wallet?.balance;
};

const LeaderboardButton = ({ onPress, compact }: { onPress: () => void; compact: boolean }) => (
  <Pressable
    onPress={onPress}
    hitSlop={8}
    accessibilityRole="button"
    accessibilityLabel="Leaderboard"
    testID="games-open-leaderboard"
    style={({ pressed }) => [styles.chip, compact ? styles.chipRound : styles.chipWide, pressed && styles.pressed]}
  >
    <Ionicons name="trophy" size={compact ? 16 : 17} color={hud.accent} />
    {compact ? null : <Text style={styles.chipText}>Leaderboard</Text>}
  </Pressable>
);

/** Your coins, then the leaderboard: the top right of the Games list. */
export const GamesActions = ({
  onLeaderboard,
  compact = false,
  coins: showCoins = true,
}: {
  onLeaderboard: () => void;
  compact?: boolean;
  /** False where your coins are already on screen beside it. */
  coins?: boolean;
}) => {
  const coins = useCoinBalance();
  return (
    <View style={styles.actions}>
      {coins === null || !showCoins ? null : <CoinCounter balance={coins} testID="games-coins" />}
      <LeaderboardButton onPress={onLeaderboard} compact={compact} />
    </View>
  );
};

/** The top of a games panel: its name, with whatever goes on the right. */
export const GamesPanelHeader = ({ title, children, style }: { title: string; children?: ReactNode; style?: object | null }) => (
  <Animated.View style={[styles.header, style]}>
    <View style={styles.badge}>
      <Ionicons name="game-controller" size={18} color={hud.onAccent} />
    </View>
    <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
      {title}
    </Text>
    <View style={styles.grow} />
    {children}
  </Animated.View>
);

const MenuRow = ({
  icon,
  title,
  detail,
  meta,
  status,
  onPress,
  testID,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  /** A short figure on the right, such as your best. */
  meta?: string;
  /** A line under the detail, such as who's online. */
  status?: string;
  onPress: () => void;
  testID: string;
  style?: object | null;
}) => (
  <Animated.View style={style}>
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, meta, status].filter(Boolean).join(", ")}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.icon}>
        <Ionicons name={icon} size={19} color={glass.text} />
      </View>
      <View style={styles.text}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowNote}>{detail}</Text>
        {status ? (
          <View style={styles.status}>
            <View style={styles.dot} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : null}
      </View>
      {meta ? (
        <View style={styles.meta}>
          <Text style={styles.metaText}>{meta}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={glass.muted} />
    </Pressable>
  </Animated.View>
);

/**
 * The games, each with this device's best, as rows of a World panel. The
 * World row leads when there's one (outside the World, online).
 */
export const GameRows = ({
  onOpen,
  onGarden,
  online,
  rowStyle,
}: {
  onOpen: (target: GamesTarget) => void;
  onGarden?: () => void;
  online?: number;
  /** Each row's entrance, for a panel that staggers them in. */
  rowStyle?: (index: number) => object | null;
}) => {
  usePreloadAvatarArt();
  const bests = useLocalBests();
  const waiting = useScoreQueue().length;
  const lead = onGarden ? 1 : 0;
  return (
    <View style={styles.rows}>
      {onGarden ? (
        <MenuRow
          icon="leaf"
          title="World"
          detail="Walk around and chat with whoever's online."
          status={onlineNow(online)}
          onPress={onGarden}
          testID="games-open-garden"
          style={rowStyle?.(0)}
        />
      ) : null}
      {GAME_IDS.map((game, i) => (
        <MenuRow
          key={game}
          icon={GAME_ICONS[game]}
          title={GAME_INFO[game].title}
          detail={GAME_LINES[game]}
          meta={bests[game] > 0 ? `Best ${bests[game].toLocaleString()}` : undefined}
          onPress={() => onOpen(game)}
          testID={`games-open-${game}`}
          style={rowStyle?.(lead + i)}
        />
      ))}
      {waiting > 0 ? (
        <Animated.View style={rowStyle?.(lead + GAME_IDS.length)}>
          <Text style={styles.waiting}>
            {waiting === 1 ? "A score is" : `${waiting} scores are`} saved on this device, waiting to go on the leaderboard
            when you&apos;re online and signed in.
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
};

/** A line above the games in the Games list, such as "You're offline." */
export const GamesNotice = ({ children, testID }: { children: ReactNode; testID?: string }) => (
  <View style={styles.notice} testID={testID}>
    <Text style={styles.noticeText}>{children}</Text>
  </View>
);

/**
 * The Games list on its own screen, dressed like the World: its chips along
 * the top (back, your coins, the leaderboard) and the games in a glass panel
 * over the garden's sky.
 */
export const GamesMenu = ({
  onOpen,
  onBack,
  intro,
  onGarden,
}: {
  onOpen: (target: GamesTarget) => void;
  onBack?: () => void;
  intro?: ReactNode;
  /** Opens the World; left out where it can't open (offline). */
  onGarden?: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const offline = useOffline();
  const garden = onGarden && !offline ? onGarden : undefined;
  const online = useWorldOnline(!!garden);
  return (
    <View style={styles.screen} testID="games-menu">
      {/* The page is daylight in both themes, like the World. */}
      <StatusBar style="dark" />
      <View style={styles.lawn} pointerEvents="none">
        <View style={styles.stripe} />
      </View>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bar}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="games-back"
              style={({ pressed }) => [styles.chip, styles.chipRound, styles.back, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={hud.forest} />
            </Pressable>
          ) : null}
          <View style={styles.grow} />
          <GamesActions onLeaderboard={() => onOpen("leaderboard")} />
        </View>
        {intro}
        <View style={[styles.panel, blurBehind]}>
          <GamesPanelHeader title="Games" />
          <GameRows onOpen={onOpen} onGarden={garden} online={online} />
        </View>
      </ScrollView>
      <OnlineBanner />
    </View>
  );
};

const ink = { borderWidth: 2.5, borderColor: hud.forest };
const pop = { shadowColor: hud.forest, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0 };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: worldColours.sky },
  fill: { flex: 1 },
  lawn: { position: "absolute", left: 0, right: 0, bottom: 0, height: "32%", backgroundColor: worldColours.lawn, borderTopWidth: 3, borderTopColor: worldColours.stripe },
  stripe: { marginTop: 22, height: 14, backgroundColor: worldColours.stripe },
  page: { width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: 14, gap: 14 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  grow: { flex: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: hud.card, ...ink, ...pop },
  chipRound: { width: 36, height: 36, borderRadius: 18 },
  chipWide: { height: 36, paddingHorizontal: 12, borderRadius: 18 },
  back: { width: 44, height: 44, borderRadius: 22 },
  chipText: { fontFamily: fonts.display, fontSize: 15, color: hud.forest },
  pressed: { opacity: 0.75 },
  panel: { borderRadius: 24, backgroundColor: glass.panel, borderWidth: 1.5, borderColor: glass.edge, paddingTop: 12, paddingBottom: 10, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 10 },
  badge: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
  title: { flexShrink: 1, fontFamily: fonts.display, fontSize: 19, color: glass.text },
  rows: { gap: 6, paddingHorizontal: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 60, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, backgroundColor: glass.row },
  rowPressed: { backgroundColor: glass.rowPressed },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: hud.primary },
  text: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.display, fontSize: 16, color: glass.text },
  rowNote: { fontSize: 12.5, color: glass.muted, fontWeight: "600" },
  meta: { paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: "center", backgroundColor: glass.rowPressed },
  status: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: worldColours.lawn },
  statusText: { fontSize: 12, color: glass.text, fontWeight: "800" },
  metaText: { color: glass.text, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  waiting: { fontSize: 12.5, lineHeight: 17, color: glass.muted, fontWeight: "600", paddingHorizontal: 6, paddingTop: 4 },
  notice: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: hud.card, ...ink },
  noticeText: { fontFamily: fonts.display, fontSize: 14, color: hud.forest },
});
