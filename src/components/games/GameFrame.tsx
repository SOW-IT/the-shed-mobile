import { Btn, hapticSelect } from "@/components/ui";
import { useLocalBests, recordRun } from "@/lib/games/gameStorage";
import { fixedColours, fonts, radius, spacing, typography } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth } from "convex/react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  GestureResponderHandlers,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GAME_INFO, type GameId } from "../../../shared/games";

const g = fixedColours.games;

type Phase = "ready" | "playing" | "over";
export type Size = { width: number; height: number };

/** A key press this soon after a crash doesn't restart: you were still mashing. */
const RESTART_LOCK_MS = 700;

type Run = { over: boolean; score: number; time: number };

/**
 * One game's run: null before the first touch, then the game's state until
 * it's over. Saves the score on the device when a run ends.
 */
export const useGameSession = <S extends Run>(game: GameId) => {
  const [run, setRun] = useState<S | null>(null);
  const [bestAtStart, setBestAtStart] = useState(0);
  const best = useLocalBests()[game];
  const recorded = useRef<S | null>(null);
  const overAt = useRef(0);
  const phase: Phase = run === null ? "ready" : run.over ? "over" : "playing";

  useEffect(() => {
    if (!run?.over || recorded.current === run) return;
    recorded.current = run;
    overAt.current = Date.now();
    hapticSelect();
    void recordRun(game, run.score, run.time * 1000);
  }, [run, game]);

  const begin = useCallback(
    (state: S) => {
      setBestAtStart(best);
      setRun(state);
    },
    [best]
  );
  const restart = useCallback(() => setRun(null), []);
  const canRestartByKey = useCallback(() => Date.now() - overAt.current > RESTART_LOCK_MS, []);
  const result = run?.over ? { score: run.score, previousBest: bestAtStart } : null;
  return { run, setRun, phase, result, best, begin, restart, canRestartByKey };
};

type GameSession = Pick<ReturnType<typeof useGameSession>, "phase" | "result" | "best" | "restart">;

/** The latest value, for handlers made once. Written after each render. */
export const useLatest = <T,>(value: T) => {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
};

/** The stage's size, once it has been laid out. */
export const useStage = () => {
  const [stage, setStage] = useState<Size | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage((current) =>
      current && current.width === width && current.height === height ? current : { width, height }
    );
  }, []);
  return [stage, onLayout] as const;
};

export const fitBoard = (stage: Size, max: Size): Size => ({
  width: Math.floor(Math.min(stage.width, max.width)),
  height: Math.floor(Math.min(stage.height, max.height)),
});

const Stat = ({ label, value, ink }: { label: string; value: number; ink: string }) => (
  <View style={styles.stat}>
    <Text style={[styles.statLabel, { color: ink }]}>{label}</Text>
    <Text style={[styles.statValue, { color: ink }]} testID={`game-${label.toLowerCase()}`}>
      {value.toLocaleString()}
    </Text>
  </View>
);

/**
 * A game's screen: the score bar, the stage that takes touches, the board,
 * and the start and game-over cards over it.
 */
export const GameFrame = ({
  game,
  background,
  ink = g.text,
  session,
  score,
  board,
  onStageLayout,
  stageHandlers,
  startHint,
  onExit,
  onLeaderboard,
  children,
}: {
  game: GameId;
  background: string;
  /** The score bar's text colour, for a light scene. */
  ink?: string;
  session: GameSession;
  score: number;
  board: Size | null;
  onStageLayout: (event: LayoutChangeEvent) => void;
  stageHandlers?: GestureResponderHandlers;
  startHint: string;
  onExit: () => void;
  onLeaderboard?: () => void;
  children: ReactNode;
}) => {
  const { isAuthenticated } = useConvexAuth();
  const { phase, result, best } = session;
  const info = GAME_INFO[game];
  const newBest = result !== null && result.score > result.previousBest && result.score > 0;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: background }]} edges={["top", "bottom"]}>
      <View style={styles.bar}>
        <Pressable
          onPress={onExit}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to the games"
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={g.text} />
        </Pressable>
        <Text style={[styles.title, { color: ink }]} numberOfLines={1}>
          {info.title}
        </Text>
        <Stat label="Score" value={score} ink={ink} />
        <Stat label="Best" value={Math.max(best, result?.score ?? 0)} ink={ink} />
      </View>
      <View style={styles.stage} onLayout={onStageLayout} {...stageHandlers}>
        {board ? (
          <View
            style={[styles.board, { width: board.width, height: board.height, backgroundColor: background }]}
            pointerEvents="box-none"
          >
            {children}
            {phase === "ready" ? (
              <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none">
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{info.title}</Text>
                  <Text style={styles.cardBody}>{info.blurb}</Text>
                  <Text style={styles.hint}>{startHint}</Text>
                </View>
              </View>
            ) : null}
            {phase === "over" && result ? (
              <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: g.scrim }]}>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{newBest ? "New best!" : "Game over"}</Text>
                  <Text style={styles.bigScore} testID="game-final-score">
                    {result.score.toLocaleString()}
                  </Text>
                  <Text style={styles.cardBody}>
                    Best {Math.max(result.previousBest, result.score).toLocaleString()}
                  </Text>
                  <Text style={styles.note}>
                    {isAuthenticated
                      ? "Saved. It goes on the leaderboard when you're online."
                      : "Saved on this device. Sign in and it goes on the leaderboard."}
                  </Text>
                  <View style={styles.actions}>
                    <Btn title="Play again" icon="refresh" onPress={session.restart} />
                    {onLeaderboard ? (
                      <Btn title="Leaderboard" icon="trophy-outline" variant="ghost" onPress={onLeaderboard} />
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

export const startHintFor = (touch: string, keys: string) =>
  Platform.OS === "web" ? `${touch}, or ${keys}, to start` : `${touch} to start`;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: g.panel,
  },
  title: { ...typography.headline, flex: 1 },
  stat: { alignItems: "flex-end", minWidth: 56 },
  statLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, opacity: 0.75, textTransform: "uppercase" },
  statValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24 },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...(Platform.OS === "web" ? { userSelect: "none", touchAction: "none", cursor: "pointer" } : null),
  },
  board: { overflow: "hidden", borderRadius: radius.lg },
  overlay: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: {
    maxWidth: 320,
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: g.panel,
  },
  cardTitle: { ...typography.title, color: g.text, textAlign: "center" },
  cardBody: { ...typography.body, color: g.dim, textAlign: "center" },
  bigScore: { ...typography.largeTitle, fontSize: 44, lineHeight: 50, color: g.text },
  hint: { ...typography.label, color: g.text, marginTop: spacing.xs },
  note: { ...typography.caption, color: g.dim, textAlign: "center" },
  actions: { gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.sm },
});
