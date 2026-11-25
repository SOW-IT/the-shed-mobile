import { Btn, hapticSelect } from "@/components/ui";
import { useOffline } from "@/hooks/useOffline";
import { useRestartHold } from "@/hooks/useRestartHold";
import { useLocalBests, recordRun } from "@/lib/games/gameStorage";
import { OnlineBanner } from "./OnlineBanner";
import { CoinGain } from "./CoinGain";
import { LeaveGameDialog } from "./LeaveGameDialog";
import { PICKER_WIDTH } from "./GameCharacter";
import { needsLeaveConfirm } from "@/lib/games/leave";
import { useNoSwipeBack } from "@/hooks/useNoSwipeBack";
import { cardFitScale, type Size } from "@/lib/games/fit";
import { decoration, fitPlayArea, GAME_VIEWS, idealBoard } from "@/lib/games/playArea";
import { BoardReach } from "./boardReach";
import { savedNote } from "@/lib/games/savedNote";
import { fixedColours, fonts, radius, spacing, typography } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  GestureResponderHandlers,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GAME_INFO, type GameId } from "../../../shared/games";

const g = fixedColours.games;
const SHORT_STAGE = 440;
const NO_REACH = { left: 0, top: 0, right: 0, bottom: 0 };
const ACTIONS_WIDTH = 200;
const MIN_TEXT_COLUMN = 180;
const CARD_EDGE = 1;
const WIDE_MIN_WIDTH =
  Math.max(PICKER_WIDTH, ACTIONS_WIDTH) + MIN_TEXT_COLUMN + spacing.xl * 3 + CARD_EDGE * 2 + spacing.md * 2;

type Phase = "ready" | "playing" | "over";

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
  const [runId, setRunId] = useState<string | null>(null);
  const generation = useRef(0);
  const overAt = useRef(0);
  const practice = useRef(false);
  const phase: Phase = run === null ? "ready" : run.over ? "over" : "playing";
  // An update waiting to install restarts the app when it comes back from
  // the background; never in the middle of a run.
  useRestartHold(phase === "playing");

  useEffect(() => {
    if (!run?.over || recorded.current === run) return;
    recorded.current = run;
    overAt.current = Date.now();
    hapticSelect();
    if (practice.current) return;
    const started = generation.current;
    void recordRun(game, run.score, run.time * 1000).then((id) => {
      if (generation.current === started) setRunId(id);
    });
  }, [run, game]);

  const begin = useCallback(
    (state: S, practiceRun = false) => {
      generation.current++;
      practice.current = practiceRun;
      setBestAtStart(best);
      setRunId(null);
      setRun(state);
    },
    [best]
  );
  const restart = useCallback(() => setRun(null), []);
  const canRestartByKey = useCallback(() => Date.now() - overAt.current > RESTART_LOCK_MS, []);
  // Asking whether to leave a run in progress. The game is paused meanwhile.
  const [askingToLeave, setAskingToLeave] = useState(false);
  const askToLeave = useCallback(() => setAskingToLeave(true), []);
  const keepPlaying = useCallback(() => setAskingToLeave(false), []);
  const paused = askingToLeave && phase === "playing";
  const result = run?.over ? { score: run.score, previousBest: bestAtStart, runId } : null;
  return { run, setRun, phase, paused, result, best, begin, restart, canRestartByKey, askToLeave, keepPlaying };
};

type GameSession = Pick<
  ReturnType<typeof useGameSession>,
  "phase" | "paused" | "result" | "best" | "restart" | "askToLeave" | "keepPlaying"
>;

/**
 * A screen that can be left by other means than the game's own back button
 * (the browser's back) watches whether a run is in progress,
 * asks the game to confirm when one of those is tried, and hears whether
 * the player stayed.
 */
export type LeaveGuard = {
  onPlayingChange: (playing: boolean) => void;
  /** Goes up by one each time leaving was tried and blocked. */
  leaveAsks: number;
  onStay: () => void;
};

/** The latest value, for handlers made once. Written after each render. */
export const useLatest = <T,>(value: T) => {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
};

/** The stage's size, once it has been laid out. */
const useStage = () => {
  const [stage, setStage] = useState<Size | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage((current) =>
      current && current.width === width && current.height === height ? current : { width, height }
    );
  }, []);
  return [stage, onLayout] as const;
};


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
  world,
  onBoard,
  onScale,
  stageHandlers,
  startHint,
  onExit,
  onLeaderboard,
  guard,
  insets,
  hideStartCard = false,
  startExtra = null,
  overDetail = null,
  statusBar = "auto",
  titleExtra = null,
  underBar = null,
  children,
}: {
  game: GameId;
  background: string;
  /** The score bar's text colour, for a light scene. */
  ink?: string;
  session: GameSession;
  score: number;
  world: Size | null;
  onBoard: (board: Size) => void;
  onScale?: (scale: number) => void;
  stageHandlers?: GestureResponderHandlers;
  startHint: string;
  onExit: () => void;
  onLeaderboard?: () => void;
  guard?: LeaveGuard;
  /**
   * Set when the game is drawn turned sideways: the device's safe area, in
   * the game's own directions. The frame pads by these instead of measuring,
   * and asks to leave in place rather than in a modal.
   */
  insets?: { top: number; right: number; bottom: number; left: number };
  /** A still preview board, for screenshots: nothing over it. */
  hideStartCard?: boolean;
  startExtra?: ReactNode;
  /** A line on the game-over card about how the run ended. */
  overDetail?: string | null;
  /** The status bar's content, for a scene whose sky turns dark. */
  statusBar?: "auto" | "light" | "dark";
  titleExtra?: ReactNode;
  underBar?: ReactNode;
  children: ReactNode;
}) => {
  const { isAuthenticated } = useConvexAuth();
  const offline = useOffline();
  useNoSwipeBack();
  const { phase, result, best, askToLeave, keepPlaying } = session;
  const playing = phase === "playing";
  const onPlayingChange = guard?.onPlayingChange;
  useEffect(() => {
    onPlayingChange?.(playing);
  }, [onPlayingChange, playing]);
  // A swipe or browser back was blocked: ask, the same as the back button.
  const leaveAsks = guard?.leaveAsks ?? 0;
  const seenAsks = useRef(leaveAsks);
  useEffect(() => {
    if (leaveAsks === seenAsks.current) return;
    seenAsks.current = leaveAsks;
    if (playing) askToLeave();
  }, [leaveAsks, playing, askToLeave]);
  const back = () => (needsLeaveConfirm(phase) ? askToLeave() : onExit());
  const stay = () => {
    keepPlaying();
    guard?.onStay();
  };
  const [stage, onOwnStageLayout] = useStage();
  const [room, onRoomLayout] = useStage();
  const [chrome, onChromeLayout] = useStage();
  const [readyCardHeight, setReadyCardHeight] = useState<number | null>(null);
  const onReadyCardLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setReadyCardHeight((current) => (current === height ? current : height));
  };
  const onLayout = (event: LayoutChangeEvent) => onOwnStageLayout(event);
  const ideal = room && chrome ? idealBoard(room, chrome.height, GAME_VIEWS[game]) : null;
  const idealWidth = ideal?.width ?? 0;
  const idealHeight = ideal?.height ?? 0;
  useEffect(() => {
    if (idealWidth > 0) onBoard({ width: idealWidth, height: idealHeight });
  }, [idealWidth, idealHeight, onBoard]);
  const shown = world ?? ideal;
  const area = room && chrome && shown ? fitPlayArea(room, shown, chrome.height) : null;
  const scale = area?.scale ?? 1;
  const measured = area !== null;
  useEffect(() => {
    if (measured) onScale?.(scale);
  }, [measured, scale, onScale]);
  const short = stage !== null && stage.height < SHORT_STAGE;
  const wide = short && stage.width >= WIDE_MIN_WIDTH;
  const safe = useSafeAreaInsets();
  const frameInsets = insets ?? { top: safe.top, right: 0, bottom: safe.bottom, left: 0 };
  const deco = room && area && chrome ? decoration(room, frameInsets, area, chrome.height, GAME_VIEWS[game].scenery ?? GAME_VIEWS[game].aspects) : null;
  const content =
    area && shown && chrome
      ? {
          position: "absolute" as const,
          width: shown.width,
          height: shown.height + chrome.height,
          left: (area.width - shown.width) / 2,
          top: (area.height - shown.height - chrome.height) / 2,
          transform: [{ scale }],
        }
      : StyleSheet.absoluteFill;
  const info = GAME_INFO[game];
  const newBest = result !== null && result.score > result.previousBest && result.score > 0;
  const overCard = result ? (
    <View style={[styles.card, wide && styles.cardWide]}>
      <View style={[styles.cardMain, wide && styles.cardMainWide]}>
        <Text style={styles.cardTitle}>{newBest ? "New best!" : "Game over"}</Text>
        {overDetail ? (
          <Text style={styles.cardBody} testID="game-over-detail">
            {overDetail}
          </Text>
        ) : null}
        <Text style={[styles.bigScore, wide && styles.bigScoreWide]} testID="game-final-score">
          {result.score.toLocaleString()}
        </Text>
        <Text style={styles.cardBody}>
          Best {Math.max(result.previousBest, result.score).toLocaleString()}
        </Text>
        {isAuthenticated ? <CoinGain runId={result.runId} game={game} /> : null}
        <Text style={styles.note} testID="game-saved-note">
          {savedNote({ signedIn: isAuthenticated, offline })}
        </Text>
      </View>
      <View style={[styles.actions, wide && styles.actionsWide]}>
        <Btn title="Play again" icon="refresh" tint={g.button} onPress={session.restart} />
        {onLeaderboard ? (
          <Btn title="Leaderboard" icon="trophy-outline" tint={g.buttonGhost} onPress={onLeaderboard} />
        ) : null}
      </View>
    </View>
  ) : null;
  return (
    <Frame insets={insets} style={[styles.screen, { backgroundColor: g.letterbox }]}>
      <View style={styles.room} onLayout={onRoomLayout}>
      {deco ? (
        <View
          pointerEvents="none"
          testID="game-scenery"
          style={[styles.scenery, { left: deco.left, top: deco.top, width: deco.width, height: deco.height, backgroundColor: background }]}
        />
      ) : null}
      <View
        testID="game-play-area"
        style={[styles.area, area ? { left: area.left, top: area.top, width: area.width, height: area.height } : styles.areaMeasuring]}
      >
      <View style={content}>
      {/* Full screen while playing; the safe area still keeps clear of the notch. */}
      <StatusBar hidden={phase === "playing"} style={statusBar} animated />
      <View onLayout={onChromeLayout}>
      <View style={styles.bar}>
        <Pressable
          onPress={back}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to the games"
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={g.text} />
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: ink }]} numberOfLines={1}>
            {info.title}
          </Text>
          {titleExtra}
        </View>
        <Stat label="Score" value={score} ink={ink} />
        <Stat label="Best" value={Math.max(best, result?.score ?? 0)} ink={ink} />
      </View>
      {underBar}
      </View>
      <View style={styles.stage} onLayout={onLayout} {...stageHandlers}>
        {area && shown ? (
          <View
            testID="game-board"
            style={{ width: shown.width, height: shown.height }}
            pointerEvents="box-none"
          >
            <BoardReach.Provider value={deco?.reach ?? NO_REACH}>{children}</BoardReach.Provider>
          </View>
        ) : null}
        {phase === "ready" && !hideStartCard ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, wide && styles.overlayWide]} pointerEvents="box-none">
            <View
              style={[styles.card, wide && styles.cardWide, { transform: [{ scale: cardFitScale(readyCardHeight, stage?.height ?? null, wide ? spacing.md : spacing.xl) }] }]}
              pointerEvents="box-none"
              onLayout={onReadyCardLayout}
            >
              <View style={[styles.cardMain, wide && styles.cardMainWide]} pointerEvents="none">
                <Text style={styles.cardTitle}>{info.title}</Text>
                <Text style={styles.cardBody}>{info.blurb}</Text>
                <Text style={styles.hint}>{startHint}</Text>
              </View>
              {startExtra}
            </View>
          </View>
        ) : null}
        {phase === "over" && result ? (
          short && !wide ? (
            <ScrollView
              style={[StyleSheet.absoluteFill, { backgroundColor: g.scrim }]}
              contentContainerStyle={styles.overlayScroll}
              testID="game-over"
            >
              {overCard}
            </ScrollView>
          ) : (
            <View
              style={[StyleSheet.absoluteFill, styles.overlay, wide && styles.overlayWide, { backgroundColor: g.scrim }]}
              testID="game-over"
            >
              {overCard}
            </View>
          )
        ) : null}
      </View>
      </View>
      </View>
      </View>
      <OnlineBanner />
      <LeaveGameDialog visible={session.paused} onLeave={onExit} onContinue={stay} inline={!!insets} />
    </Frame>
  );
};

/** The screen's outer box: the measured safe area, or the insets given. */
const Frame = ({
  insets,
  style,
  children,
}: {
  insets?: { top: number; right: number; bottom: number; left: number };
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) =>
  insets ? (
    <View
      style={[
        style,
        { paddingTop: insets.top, paddingRight: insets.right, paddingBottom: insets.bottom, paddingLeft: insets.left },
      ]}
    >
      {children}
    </View>
  ) : (
    <SafeAreaView style={style} edges={["top", "bottom"]}>
      {children}
    </SafeAreaView>
  );

export const startHintFor = (touch: string, keys: string) =>
  Platform.OS === "web" ? `${touch}, or ${keys}, to start` : `${touch} to start`;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  room: { flex: 1 },
  area: { position: "absolute" },
  scenery: { position: "absolute" },
  areaMeasuring: { left: 0, top: 0, right: 0, bottom: 0, opacity: 0 },
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
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.headline, flexShrink: 1 },
  stat: { alignItems: "flex-end", minWidth: 56 },
  statLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, opacity: 0.75, textTransform: "uppercase" },
  statValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24 },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { userSelect: "none", touchAction: "none", cursor: "pointer" } : null),
  },
  overlay: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
  overlayWide: { padding: spacing.md },
  overlayScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: {
    maxWidth: 320,
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: CARD_EDGE,
    borderColor: g.cardEdge,
    backgroundColor: g.card,
  },
  cardWide: { maxWidth: 560, flexDirection: "row", gap: spacing.xl, paddingVertical: spacing.lg },
  cardMain: { alignItems: "center", gap: spacing.sm, alignSelf: "stretch" },
  cardMainWide: { flex: 1, gap: spacing.xs, justifyContent: "center" },
  cardTitle: { ...typography.title, color: g.text, textAlign: "center" },
  cardBody: { ...typography.body, color: g.text, textAlign: "center" },
  bigScore: { ...typography.largeTitle, fontSize: 44, lineHeight: 50, color: g.text },
  bigScoreWide: { fontSize: 40, lineHeight: 44 },
  hint: { ...typography.label, color: g.text, marginTop: spacing.xs },
  note: { ...typography.caption, color: g.text, textAlign: "center" },
  actions: { gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.sm },
  actionsWide: { alignSelf: "center", width: ACTIONS_WIDTH, marginTop: 0 },
});
