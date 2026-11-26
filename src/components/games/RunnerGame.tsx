import { advance, useGameLoop, useWebKeys } from "@/components/games/useGameLoop";
import { newSeed } from "@/lib/games/random";
import {
  duck,
  hop,
  jump,
  newRunner,
  onGround,
  previewRange,
  previewWith,
  RUNNER,
  runnerAt,
  sliding,
  stepRunner,
  timeAtScore,
  type Obstacle,
  type PatternKind,
  type RunnerState,
} from "@/lib/games/runner";
import { fixedColours } from "@/theme";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, StyleSheet, View } from "react-native";
import { MysticMan } from "./MysticMan";
import { CharacterPicker, useAvatarArt, useGameLook } from "./GameCharacter";
import type { Look } from "@shared/world";
import { GameFrame, useGameSession, useLatest } from "./GameFrame";
import type { LeaveGuard } from "./GameFrame";
import { GAME_VIEWS } from "@/lib/games/playArea";
import { useBoardReach } from "./boardReach";
import type { Size } from "@/lib/games/fit";
import { Sideways, useSideways } from "./Sideways";

const c = fixedColours.games.runner;
const PHONE_BOARD = { width: GAME_VIEWS.runner.size, height: 340 };
const GROUND = 48;
/**
 * A touch moving this far up or down is a swipe. Short, so the big jump and
 * the slide start while the finger is still moving, not when it lifts.
 */
const SWIPE = 12;
/** Holding the jump key this long turns the hop into the big jump. */
const HOLD_MS = 110;
const BAR_STRIPE = 16;
const JUMP_KEYS = new Set(["ArrowUp", " ", "w", "W"]);
const DUCK_KEYS = new Set(["ArrowDown", "s", "S"]);

const START_HINT =
  Platform.OS === "web"
    ? "Tap or press ↑ to start. Keys: ↑ or space to hop, hold for a big jump, ↓ to duck."
    : "Tap to start.";

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
  if (o.kind === "bar") {
    return (
      <View
        testID={`obstacle-${o.pattern}`}
        style={[styles.bar, { width: o.width, height: o.height, backgroundColor: c.bar, borderColor: c.barEdge }, position]}
      >
        {Array.from({ length: Math.ceil(o.width / BAR_STRIPE) + 1 }, (_, i) => (
          <View
            key={i}
            style={[styles.barStripe, { left: i * BAR_STRIPE - 4, height: o.height * 2, top: -o.height / 2, backgroundColor: c.barStripe }]}
          />
        ))}
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

const Runner = ({ look, slide, state }: { look: Look | null; slide: boolean; state: RunnerState }) => {
  const stride = (state.distance % 36) / 36;
  const airborne = !onGround(state);
  const art = useAvatarArt(look !== null);
  if (!look || !art) return <MysticMan sliding={slide} airborne={airborne} stride={stride} />;
  return (
    <View style={slide ? styles.slideBox : styles.standBox}>
      <View style={slide ? styles.lying : null}>
        <art.RunnerCharacter
          look={look}
          width={RUNNER.width}
          height={RUNNER.standHeight}
          sliding={slide}
          stride={stride}
          airborne={airborne}
        />
      </View>
    </View>
  );
};

const Scene = ({ state, height, look }: { state: RunnerState; height: number; look: Look | null }) => {
  const reach = useBoardReach();
  const groundY = height - GROUND;
  const slide = sliding(state);
  const manWidth = slide ? 40 : RUNNER.width;
  const manHeight = slide ? RUNNER.slideHeight : RUNNER.standHeight;
  const hillShift = -((state.distance * 0.15) % (state.width + 220));
  const dashShift = -(state.distance % 40);
  return (
    <>
      <View style={[styles.moon, { backgroundColor: c.moon }]} />
      {[-1, 0, 1, 2].map((copy) => (
        <View
          key={copy}
          style={[
            styles.hill,
            { backgroundColor: c.hill, top: groundY - 70, transform: [{ translateX: hillShift + copy * (state.width + 220) }] },
          ]}
        />
      ))}
      <View
        style={[
          styles.ground,
          { top: groundY, left: -reach.left, right: -reach.right, bottom: -reach.bottom, backgroundColor: c.ground, borderTopColor: c.groundLine },
        ]}
      >
        <View style={[styles.dashes, { transform: [{ translateX: dashShift }] }]}>
          {Array.from({ length: Math.ceil((state.width + reach.left + reach.right) / 40) + 2 }, (_, i) => (
            <View key={`dash-${i}`} style={[styles.dash, { backgroundColor: c.groundLine }]} />
          ))}
        </View>
      </View>
      <View style={[styles.clip, { width: state.width, height }]} pointerEvents="none">
        {state.obstacles.map((o) => (
          <ObstacleView key={o.id} o={o} groundY={groundY} />
        ))}
      </View>
      <View
        testID="runner-man"
        style={[
          styles.man,
          { transform: [{ translateX: RUNNER.x - manWidth / 2 }, { translateY: groundY - state.y - manHeight }] },
        ]}
      >
        <Runner look={look} slide={slide} state={state} />
      </View>
    </>
  );
};

/**
 * Mystic Man, played in landscape: turned a quarter turn on a phone held
 * upright (see Sideways). Touches arrive in screen directions and are
 * turned back to the game's.
 */
export const RunnerGame = ({
  onExit,
  onLeaderboard,
  active = true,
  guard,
  preview: previewKinds,
  startScore,
}: {
  onExit: () => void;
  onLeaderboard?: () => void;
  active?: boolean;
  guard?: LeaveGuard;
  /** Test builds: show these patterns on the board before the run starts. */
  preview?: readonly PatternKind[];
  startScore?: number;
}) => {
  const session = useGameSession<RunnerState>("runner");
  const look = useGameLook("runner");
  const { run, setRun, phase } = session;
  const { turned, insets } = useSideways();
  const [board, setBoard] = useState<Size | null>(null);
  const { width, height } = board ?? PHONE_BOARD;
  const [runHeight, setRunHeight] = useState(PHONE_BOARD.height);
  const previewKey = previewKinds?.join(",") ?? "";
  const preview = useMemo(
    () =>
      previewKey
        ? startScore
          ? previewRange(width, previewKey.split(",") as PatternKind[], timeAtScore(startScore))
          : previewWith(width, previewKey.split(",") as PatternKind[])
        : newRunner(width, 1),
    [width, previewKey, startScore]
  );
  const inputOn = active && !session.paused;
  const latest = useLatest({ session, width, height, turned, inputOn, startScore });

  useGameLoop(phase === "playing" && active && !session.paused, (dt) => setRun((state) => state && advance(state, dt, stepRunner)));

  /** Starts the run if it hasn't started; otherwise does the move. */
  const act = (move: "hop" | "jump" | "duck") => {
    const { session: current, width: w } = latest.current;
    if (current.phase === "ready") {
      if (w > 0) {
        setRunHeight(latest.current.height);
        const from = latest.current.startScore;
        current.begin(from ? runnerAt(w, newSeed(), from) : newRunner(w, newSeed()), !!from);
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
  // A pending hold must not fire into a paused run or a screen that's behind.
  useEffect(() => {
    if (!inputOn) stopHold();
  }, [inputOn]);

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
      if (!isJump) {
        // A duck cancels a big jump still waiting on the held key.
        stopHold();
        return act("duck");
      }
      if (current.phase === "ready" || event.shiftKey) return act(current.phase === "ready" ? "hop" : "jump");
      act("hop");
      stopHold();
      hold.current = setTimeout(() => {
        hold.current = null;
        if (latest.current.inputOn) act("jump");
      }, HOLD_MS);
    },
    stopHold,
    inputOn
  );

  const frame = (
    <GameFrame
      game="runner"
      background={c.sky}
      statusBar="light"
      session={session}
      score={run?.score ?? 0}
      world={run ? { width: run.width, height: runHeight } : board}
      onBoard={setBoard}
      stageHandlers={responder.panHandlers}
      startHint={START_HINT}
      startExtra={
        <CharacterPicker
          game="runner"
          picture={(pick, art) => <art.RunnerCharacter look={pick} width={RUNNER.width} height={44} sliding={false} stride={0.25} airborne={false} />}
          original={<MysticMan sliding={false} airborne={false} stride={0.5} />}
        />
      }
      hideStartCard={!!previewKinds?.length}
      onExit={onExit}
      guard={guard}
      onLeaderboard={onLeaderboard}
      insets={insets}
    >
      <Scene state={run ?? preview} height={run ? runHeight : height} look={look} />
    </GameFrame>
  );
  return (
    <Sideways turned={turned}>
      {frame}
    </Sideways>
  );
};

const styles = StyleSheet.create({
  moon: { position: "absolute", right: 36, top: 24, width: 34, height: 34, borderRadius: 17, opacity: 0.9 },
  hill: { position: "absolute", left: 0, width: 320, height: 140, borderRadius: 160 },
  ground: { position: "absolute", borderTopWidth: 2, overflow: "hidden" },
  clip: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
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
  bar: { position: "absolute", left: 0, top: 0, borderWidth: 2, borderRadius: 2, overflow: "hidden" },
  barStripe: { position: "absolute", width: 6, transform: [{ rotate: "35deg" }], opacity: 0.75 },
  hang: { position: "absolute", left: 0, top: 0 },
  vine: { position: "absolute", top: 0, bottom: 10, width: 4, borderRadius: 2 },
  leaves: { position: "absolute", left: -4, right: -4, bottom: 0, height: 22, borderRadius: 11, borderWidth: 2 },
  man: { position: "absolute", left: 0, top: 0 },
  standBox: { width: RUNNER.width, height: RUNNER.standHeight },
  slideBox: { width: 40, height: RUNNER.slideHeight },
  lying: { position: "absolute", left: 0, top: RUNNER.slideHeight - RUNNER.standHeight },
});
