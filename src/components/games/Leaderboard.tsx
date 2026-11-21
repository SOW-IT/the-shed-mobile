import { useOffline } from "@/hooks/useOffline";
import { useLocalBests, useScoreQueue } from "@/lib/games/gameStorage";
import { Btn, Card, EmptyState, LoadingState, Screen, TabBar } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { GAME_IDS, GAME_INFO, isGameId, type GameId } from "../../../shared/games";

const Board = ({ game }: { game: GameId }) => {
  const t = useAppTheme();
  const board = useQuery(api.gameScores.leaderboard, { game });
  if (board === undefined) return <LoadingState />;
  if (board === null) return null;
  return (
    <View style={styles.boardGap}>
      {board.me ? (
        <Card style={styles.mine}>
          <Text style={[typography.label, { color: t.muted }]}>Your best</Text>
          <Text style={[typography.amount, { color: t.text }]}>{board.me.score.toLocaleString()}</Text>
          <Text style={[typography.caption, { color: t.muted }]}>
            {board.me.rank === null ? "Outside the top 500" : `Number ${board.me.rank} on the leaderboard`}
          </Text>
        </Card>
      ) : null}
      {board.top.length === 0 ? (
        <EmptyState icon="trophy-outline" title="No scores yet" message="Play a round and yours will be the first." />
      ) : (
        <Card style={styles.list}>
          {board.top.map((row, index) => (
            <View
              key={`${row.rank}-${row.name}-${row.score}`}
              style={[
                styles.row,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator },
              ]}
              testID="leaderboard-row"
            >
              <View style={[styles.rank, { backgroundColor: row.rank <= 3 ? t.accentSoft : t.ghost }]}>
                <Text style={[typography.label, { color: row.rank <= 3 ? t.accent : t.muted }]}>{row.rank}</Text>
              </View>
              <Text style={[typography.body, styles.name, { color: t.text }, row.isMe && styles.me]} numberOfLines={1}>
                {row.isMe ? `${row.name} (you)` : row.name}
              </Text>
              <Text style={[typography.headline, { color: t.text }]}>{row.score.toLocaleString()}</Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
};

/** Each game's top scores, one per person, and your own best. */
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
  const { isAuthenticated, isLoading } = useConvexAuth();
  const offline = useOffline();
  const localBest = useLocalBests()[game];
  const waiting = useScoreQueue().some((queued) => queued.game === game);
  const canLoad = isAuthenticated && !offline;
  return (
    <Screen title="Leaderboard" subtitle="Games" onBack={onBack} maxWidth={640}>
      <TabBar
        segments={GAME_IDS.map((id) => ({ key: id, label: GAME_INFO[id].title }))}
        active={game}
        onChange={(key) => {
          if (isGameId(key)) setGame(key);
        }}
      />
      <View style={[styles.device, { backgroundColor: t.primarySoft }]}>
        <Text style={[typography.caption, { color: t.dark ? t.text : t.primary }]}>
          On this device: best {localBest.toLocaleString()}
          {waiting ? ", waiting to be published" : ""}
        </Text>
      </View>
      {canLoad ? (
        <Board game={game} />
      ) : offline ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="You're offline"
          message="The leaderboard shows up when you're back online. Your scores are saved on this device until then."
        />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <EmptyState
          icon="lock-closed-outline"
          title="Sign in to see the leaderboard"
          message="Your scores are saved on this device and go on the leaderboard once you sign in."
        />
      )}
      <View style={styles.play}>
        <Btn title={`Play ${GAME_INFO[game].title}`} icon="play" variant="tonal" onPress={() => onPlay(game)} />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  boardGap: { gap: spacing.md },
  mine: { alignItems: "center", gap: 2 },
  list: { paddingVertical: spacing.xs, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rank: { width: 30, height: 30, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  name: { flex: 1 },
  me: { fontWeight: "700" },
  device: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  play: { alignItems: "flex-start" },
});
