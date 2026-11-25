import { useOffline } from "@/hooks/useOffline";
import { useLocalBests, useScoreQueue } from "@/lib/games/gameStorage";
import { PagerCarousel } from "@/components/PagerCarousel";
import type { PagerTab } from "@/components/PagerScreen";
import { Btn, Card, EmptyState, LoadingState, LoadMoreFooter, Segmented, styles as shared, TabBar } from "@/components/ui";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { leaderboardDate, leaderboardName, withRanks } from "@/lib/games/leaderboardRanks";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { OnlineBanner } from "./OnlineBanner";
import { GAME_IDS, GAME_INFO, GAME_VERSION, isGameId, VERSION_LABELS, type GameId, type GameVersion } from "../../../shared/games";

/** Rows per page; "Load more" fetches the next page until every score is shown. */
const PAGE_SIZE = 25;

/**
 * The tabs share a phone's width four ways, where "Sky Shooter" doesn't
 * fit; its page's Play button still says the whole name.
 */
const TAB_LABELS: Partial<Record<GameId, string>> = { shooter: "Shooter" };

const versionSegments = (game: GameId) =>
  ([GAME_VERSION, 1] as const).map((version) => ({
    key: String(version),
    label: VERSION_LABELS[version],
    accessibilityLabel: `${GAME_INFO[game].title} ${VERSION_LABELS[version]} leaderboard`,
  }));

const Board = ({ game, version }: { game: GameId; version: GameVersion }) => {
  const t = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.gameScores.myLeaderboardPlace, { game, version });
  const { rows, hasMore, loadMore, loadingFirstPage, loadingMore } = usePagedQuery(api.gameScores.leaderboardPage, {
    scopeKey: `leaderboard:${game}:v${version}:${isAuthenticated ? "signed-in" : "signed-out"}`,
    args: (cursor) => ({ game, version, paginationOpts: { numItems: PAGE_SIZE, cursor } }),
    rowsOf: (result) => result.page,
    keyOf: (row) => row.id,
  });
  const ranked = useMemo(() => withRanks(rows), [rows]);
  if (loadingFirstPage) return <LoadingState />;
  return (
    <View style={styles.boardGap}>
      {me ? (
        <Card style={styles.mine}>
          <Text style={[typography.label, { color: t.muted }]}>Your best</Text>
          <Text style={[typography.amount, { color: t.text }]}>{me.score.toLocaleString()}</Text>
          <Text style={[typography.caption, { color: t.muted }]}>
            {me.rank === null ? "Outside the top 500" : `Number ${me.rank} on the leaderboard`}
          </Text>
        </Card>
      ) : null}
      {ranked.length === 0 ? (
        <EmptyState icon="trophy-outline" title="No scores yet" />
      ) : (
        <Card style={styles.list}>
          {ranked.map((row, index) => {
            const date = leaderboardDate(row.playedAt);
            return (
              <View
                key={row.id}
                style={[
                  styles.row,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator },
                ]}
                testID="leaderboard-row"
              >
                <View style={[styles.rank, { backgroundColor: row.rank <= 3 ? t.accentSoft : t.ghost }]}>
                  <Text style={[typography.label, { color: row.rank <= 3 ? t.accent : t.muted }]}>{row.rank}</Text>
                </View>
                <View style={styles.who}>
                  <Text style={[typography.body, { color: t.text }, row.isMe && styles.me]} numberOfLines={1}>
                    {leaderboardName(row)}
                  </Text>
                  {date ? (
                    <Text style={[typography.caption, { color: t.muted }]} testID="leaderboard-date">
                      {date}
                    </Text>
                  ) : null}
                </View>
                <Text style={[typography.headline, { color: t.text }]}>{row.score.toLocaleString()}</Text>
              </View>
            );
          })}
        </Card>
      )}
      <LoadMoreFooter
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
        label="Load more"
        end={
          ranked.length > PAGE_SIZE ? (
            <Text style={[typography.caption, styles.end, { color: t.faint }]}>That&apos;s everyone.</Text>
          ) : null
        }
      />
    </View>
  );
};

const GamePage = ({ game, onPlay }: { game: GameId; onPlay: (game: GameId) => void }) => {
  const t = useAppTheme();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const offline = useOffline();
  const localBest = useLocalBests()[game];
  const waiting = useScoreQueue().some((queued) => queued.game === game);
  const [version, setVersion] = useState<GameVersion>(GAME_VERSION);
  const current = version === GAME_VERSION;
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[shared.scroll, styles.page]}
      testID={`leaderboard-page-${game}`}
    >
      <Btn title={`Play ${GAME_INFO[game].title}`} icon="play" onPress={() => onPlay(game)} />
      <Segmented
        pill
        segments={versionSegments(game)}
        active={String(version)}
        onChange={(key) => setVersion(Number(key) === 1 ? 1 : GAME_VERSION)}
      />
      {current ? (
        <View style={[styles.device, { backgroundColor: t.primarySoft }]}>
          <Text style={[typography.caption, { color: t.dark ? t.text : t.primary }]}>
            On this device: best {localBest.toLocaleString()}
            {waiting ? ", waiting to be published" : ""}
          </Text>
          {!isAuthenticated && !isLoading ? (
            <Text style={[typography.caption, { color: t.dark ? t.text : t.primary }]}>
              Sign in and your scores go on the leaderboard.
            </Text>
          ) : null}
        </View>
      ) : null}
      {offline ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="You're offline"
          message="Your scores are saved on this device until you're back online."
        />
      ) : (
        <Board key={version} game={game} version={version} />
      )}
    </ScrollView>
  );
};

/** Each game's scores, one per person, a page at a time, and your own best. */
export const Leaderboard = ({
  onBack,
  onPlay,
  initialGame,
}: {
  onBack: () => void;
  onPlay: (game: GameId) => void;
  initialGame?: string;
}) => {
  const t = useAppTheme();
  const [game, setGame] = useState<GameId>(initialGame && isGameId(initialGame) ? initialGame : "shooter");
  const [position] = useState(() => new Animated.Value(GAME_IDS.indexOf(game)));
  const tabs: PagerTab[] = useMemo(
    () =>
      GAME_IDS.map((id) => ({
        key: id,
        label: TAB_LABELS[id] ?? GAME_INFO[id].title,
        render: () => <GamePage game={id} onPlay={onPlay} />,
      })),
    [onPlay]
  );
  const choose = (key: string) => {
    if (isGameId(key)) setGame(key);
  };
  return (
    <View style={styles.fill}>
      <SafeAreaView style={[shared.screen, { backgroundColor: t.background }]} edges={["top"]}>
        <View style={styles.top}>
          <View style={shared.header}>
            <Pressable
              onPress={onBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [shared.headerBack, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={26} color={t.text} />
            </Pressable>
            <View style={shared.headerText}>
              <Text style={[typography.caption, styles.subtitle, { color: t.muted }]}>Games</Text>
              <Text style={[typography.largeTitle, { color: t.text }]}>Leaderboard</Text>
            </View>
          </View>
          <TabBar
            segments={tabs.map((tab) => ({ key: tab.key, label: tab.label }))}
            active={game}
            onChange={choose}
            position={position}
          />
        </View>
        <PagerCarousel
          tabs={tabs}
          activeKey={game}
          onActiveKeyChange={choose}
          renderPage={(tab) => tab.render()}
          position={position}
        />
      </SafeAreaView>
      <OnlineBanner />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  subtitle: { marginBottom: 2 },
  pressed: { opacity: 0.6 },
  page: { maxWidth: 640, paddingTop: spacing.md },
  boardGap: { gap: spacing.md },
  mine: { alignItems: "center", gap: 2 },
  list: { paddingVertical: spacing.xs, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rank: { width: 30, height: 30, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  who: { flex: 1, gap: 1 },
  me: { fontWeight: "700" },
  end: { textAlign: "center", paddingVertical: spacing.sm },
  device: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
