import { advance, useGameLoop, useWebKeys } from "@/components/games/useGameLoop";
import { newSeed } from "@/lib/games/random";
import {
  duck,
  hop,
  jump,
  newRunner,
  onGround,
  previewWith,
  RUNNER,
  sliding,
  stepRunner,
  type Obstacle,
  type PatternKind,
  type RunnerState,
} from "@/lib/games/runner";
import { fixedColours } from "@/theme";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MysticMan } from "./MysticMan";
import { GameFrame, useGameSession, useLatest, useStage } from "./GameFrame";
import type { LeaveGuard } from "./GameFrame";
import { fitBoard } from "@/lib/games/fit";

const c = fixedColours.games.runner;
const MAX_BOARD = { width: 1200, height: 400 };
const GROUND = 48;
/**
 * A touch moving this far up or down is a swipe. Short, so the big jump and
 * the slide start while the finger is still moving, not when it lifts.
 */
const SWIPE = 12;
/** Holding the jump key this long turns the hop into the big jump. */
const HOLD_MS = 110;
const JUMP_KEYS = new Set(["ArrowUp", " ", "w", "W"]);
const DUCK_KEYS = new Set(["ArrowDown", "s", "S"]);

const START_HINT =
  Platform.OS === "web"
    ? "Tap or press ↑ to start. Tap ↑ or space to hop, hold it (or Shift) for a big jump, ↓ to duck."
    : "Tap to start. Tap to hop, swipe up for a big jump, swipe down to duck.";

const ObstacleView = ({ o, groundY }: { o: Obstacle; groundY: number }) => {
  if (o.kind === "hang") {
    // Vines down from the top of the board, ending in a leafy clump.
    const bottomY = groundY - o.bottom;
    return (
      <View
        testID={`obstacle-${o.pattern}`}
        style={[styles.hang, { width: o.width, height: bottomY, transform: [{ translateX: o.x }] }]}
      >
        {[0.2, 0.5, 0.8].map((at) => (
          <View key={at} style={[styles.vine, { left: o.width * at - 2, backgroundColor: c.vine }]} />
        ))}
        <View style={[styles.leaves, { backgroundColor: c.leaf, borderColor: c.vine }]} />
      </View>
    );
  }
  const position = { transform: [{ translateX: o.x }, { translateY: groundY - o.bottom - o.height }] };
  if (o.kind === "beam") {
    return (
      <View
        testID={`obstacle-${o.pattern}`}
        style={[styles.beam, { width: o.width, height: o.height, backgroundColor: c.beam, borderColor: c.beamEdge }, position]}
      >
        <View style={[styles.beamEye, { backgroundColor: c.face }]} />
        <View style={[styles.beamEye, { backgroundColor: c.face }]} />
      </View>
    );
  }
  if (o.kind === "wide") {
    return (
      <View
        testID={`obstacle-${o.pattern}`}
        style={[styles.log, { width: o.width, height: o.height, backgroundColor: c.log, borderColor: c.logEdge }, position]}
      >
        <View style={[styles.ring, { borderColor: c.logEdge }]} />
      </View>
    );
  }
  return (
    <View
      testID={`obstacle-${o.pattern}`}
      style={[
        styles.rock,
        {
          width: o.width,
          height: o.height,
          backgroundColor: o.kind === "tall" ? c.tall : c.rock,
          borderColor: c.rockEdge,
        },
        position,
      ]}
    />
  );
};

const Scene = ({ state, height }: { state: RunnerState; height: number }) => {
  const groundY = height - GROUND;
  const slide = sliding(state);
  const manWidth = slide ? 40 : RUNNER.width;
  const manHeight = slide ? RUNNER.slideHeight : RUNNER.standHeight;
  const hillShift = -((state.distance * 0.15) % (state.width + 220));
  const dashShift = -(state.distance % 40);
  return (
    <>
      <View style={[styles.moon, { backgroundColor: c.moon }]} />
      {[0, 1].map((copy) => (
        <View
          key={copy}
          style={[
            styles.hill,
            { backgroundColor: c.hill, top: groundY - 70, transform: [{ translateX: hillShift + copy * (state.width + 220) }] },
          ]}
        />
      ))}
      <View style={[styles.ground, { top: groundY, backgroundColor: c.ground, borderTopColor: c.groundLine }]}>
        <View style={[styles.dashes, { transform: [{ translateX: dashShift }] }]}>
          {Array.from({ length: Math.ceil(state.width / 40) + 2 }, (_, i) => (
            <View key={`dash-${i}`} style={[styles.dash, { backgroundColor: c.groundLine }]} />
          ))}
        </View>
      </View>
      {state.obstacles.map((o) => (
        <ObstacleView key={o.id} o={o} groundY={groundY} />
      ))}
      <View
        testID="runner-man"
        style={[
          styles.man,
          { transform: [{ translateX: RUNNER.x - manWidth / 2 }, { translateY: groundY - state.y - manHeight }] },
        ]}
      >
        <MysticMan sliding={slide} airborne={!onGround(state)} stride={(state.distance % 36) / 36} />
      </View>
    </>
  );
};

/**
 * Mystic Man, played in landscape. The app is portrait-only and has no
 * orientation library (adding one is a native change), so on a portrait
 * screen the game is drawn turned a quarter turn: hold the phone sideways.
 * Touches arrive in screen directions and are turned back to the game's.
 */
export const RunnerGame = ({
  onExit,
  onLeaderboard,
  active = true,
  guard,
  preview: previewKinds,
}: {
  onExit: () => void;
  onLeaderboard?: () => void;
  active?: boolean;
  guard?: LeaveGuard;
  /** Test builds: show these patterns on the board before the run starts. */
  preview?: readonly PatternKind[];
}) => {
  const session = useGameSession<RunnerState>("runner");
  const { run, setRun, phase } = session;
  const screen = useWindowDimensions();
  const safe = useSafeAreaInsets();
  const turned = screen.height > screen.width;
  const [stage, onStageLayout] = useStage();
  const board = stage && fitBoard(stage, MAX_BOARD);
  const width = board?.width ?? 0;
  const height = board?.height ?? 0;
  const previewKey = previewKinds?.join(",") ?? "";
  const preview = useMemo(
    () => (previewKey ? previewWith(width, previewKey.split(",") as PatternKind[]) : newRunner(width, 1)),
    [width, previewKey]
  );
  // The board height the run started on; a shorter board later scales the scene.
  const [runHeight, setRunHeight] = useState(0);
  const latest = useLatest({ session, width, height, turned });

  useGameLoop(phase === "playing" && active && !session.paused, (dt) => setRun((state) => state && advance(state, dt, stepRunner)));

  /** Starts the run if it hasn't started; otherwise does the move. */
  const act = (move: "hop" | "jump" | "duck") => {
    const { session: current, width: w } = latest.current;
    if (current.phase === "ready") {
      if (w > 0) {
        setRunHeight(latest.current.height);
        current.begin(newRunner(w, newSeed()));
      }
      return;
    }
    current.setRun((state) => state && (move === "hop" ? hop(state) : move === "jump" ? jump(state) : duck(state)));
  };

  const [responder] = useState(() => {
    let swiped = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.session.phase !== "over",
      onMoveShouldSetPanResponder: () => latest.current.session.phase !== "over",
      // The hop starts on touch, so a tap never waits. A swipe up a moment
      // later turns it into the big jump; a swipe down drops into a slide.
      onPanResponderGrant: () => {
        swiped = latest.current.session.phase === "ready";
        act("hop");
      },
      onPanResponderMove: (_event, gesture) => {
        const dy = latest.current.turned ? -gesture.dx : gesture.dy;
        if (swiped || Math.abs(dy) < SWIPE) return;
        swiped = true;
        act(dy < 0 ? "jump" : "duck");
      },
    });
  });

  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(() => stopHold, []);

  useWebKeys(
    (key, down, event) => {
      const isJump = JUMP_KEYS.has(key);
      if (!isJump && !DUCK_KEYS.has(key)) return;
      event.preventDefault();
      if (!down) {
        if (isJump) stopHold();
        return;
      }
      if (event.repeat) return;
      const current = latest.current.session;
      if (current.phase === "over") {
        if (key === " " && current.canRestartByKey()) current.restart();
        return;
      }
      if (!isJump) return act("duck");
      if (current.phase === "ready" || event.shiftKey) return act(current.phase === "ready" ? "hop" : "jump");
      act("hop");
      stopHold();
      hold.current = setTimeout(() => act("jump"), HOLD_MS);
    },
    stopHold,
    active && !session.paused
  );

  const frame = (
    <GameFrame
      game="runner"
      background={c.sky}
      session={session}
      score={run?.score ?? 0}
      board={board}
      world={run && runHeight > 0 ? { width: run.width, height: runHeight } : null}
      onStageLayout={onStageLayout}
      stageHandlers={responder.panHandlers}
      startHint={START_HINT}
      hideStartCard={!!previewKinds?.length}
      onExit={onExit}
      guard={guard}
      onLeaderboard={onLeaderboard}
      // Turned a quarter turn clockwise: the notch is on the game's left.
      insets={turned ? { top: safe.right, right: safe.bottom, bottom: safe.left, left: safe.top } : undefined}
    >
      {board ? <Scene state={run ?? preview} height={run && runHeight > 0 ? runHeight : height} /> : null}
    </GameFrame>
  );
  if (!turned) return frame;
  return (
    <View style={[styles.fill, { backgroundColor: c.sky }]}>
      <View
        style={{
          position: "absolute",
          width: screen.height,
          height: screen.width,
          left: (screen.width - screen.height) / 2,
          top: (screen.height - screen.width) / 2,
          transform: [{ rotate: "90deg" }],
        }}
      >
        {frame}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
  moon: { position: "absolute", right: 36, top: 24, width: 34, height: 34, borderRadius: 17, opacity: 0.9 },
  hill: { position: "absolute", left: 0, width: 320, height: 140, borderRadius: 160 },
  ground: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: 2, overflow: "hidden" },
  dashes: { flexDirection: "row", gap: 22, marginTop: 14 },
  dash: { width: 18, height: 2, opacity: 0.5 },
  rock: {
    position: "absolute",
    left: 0,
    top: 0,
    borderWidth: 2,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  log: {
    position: "absolute",
    left: 0,
    top: 0,
    borderWidth: 2,
    borderRadius: 14,
    justifyContent: "center",
    paddingLeft: 6,
  },
  ring: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  beam: {
    position: "absolute",
    left: 0,
    top: 0,
    borderWidth: 2,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  beamEye: { width: 4, height: 4, borderRadius: 2 },
  hang: { position: "absolute", left: 0, top: 0 },
  vine: { position: "absolute", top: 0, bottom: 10, width: 4, borderRadius: 2 },
  leaves: { position: "absolute", left: -4, right: -4, bottom: 0, height: 22, borderRadius: 11, borderWidth: 2 },
  man: { position: "absolute", left: 0, top: 0 },
});
