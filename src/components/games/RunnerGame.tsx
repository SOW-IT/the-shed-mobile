import { advance, useGameLoop, useWebKeys } from "@/components/games/useGameLoop";
import { newSeed } from "@/lib/games/random";
import { duck, jump, newRunner, onGround, RUNNER, sliding, stepRunner, type RunnerState } from "@/lib/games/runner";
import { fixedColours } from "@/theme";
import { useMemo, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { MysticMan } from "./MysticMan";
import { fitBoard, GameFrame, startHintFor, useGameSession, useLatest, useStage } from "./GameFrame";

const c = fixedColours.games.runner;
const MAX_BOARD = { width: 760, height: 400 };
const GROUND = 48;
/** A swipe this long counts as a swipe, not a tap. */
const SWIPE = 22;
const JUMP_KEYS = new Set(["ArrowUp", " ", "w", "W"]);
const DUCK_KEYS = new Set(["ArrowDown", "s", "S"]);

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
      {state.obstacles.map((o) =>
        o.kind === "low" ? (
          <View
            key={o.id}
            style={[
              styles.rock,
              {
                width: o.width,
                height: o.height,
                backgroundColor: c.rock,
                borderColor: c.rockEdge,
                transform: [{ translateX: o.x }, { translateY: groundY - o.bottom - o.height }],
              },
            ]}
          />
        ) : (
          <View
            key={o.id}
            style={[
              styles.beam,
              {
                width: o.width,
                height: o.height,
                backgroundColor: c.beam,
                borderColor: c.beamEdge,
                transform: [{ translateX: o.x }, { translateY: groundY - o.bottom - o.height }],
              },
            ]}
          >
            <View style={[styles.beamEye, { backgroundColor: c.face }]} />
            <View style={[styles.beamEye, { backgroundColor: c.face }]} />
          </View>
        )
      )}
      <View
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

/** Mystic Man: he runs; swipe up to jump, down to slide. */
export const RunnerGame = ({ onExit, onLeaderboard }: { onExit: () => void; onLeaderboard?: () => void }) => {
  const session = useGameSession<RunnerState>("runner");
  const { run, setRun, phase } = session;
  const [stage, onStageLayout] = useStage();
  const board = stage && fitBoard(stage, MAX_BOARD);
  const width = board?.width ?? 0;
  const preview = useMemo(() => newRunner(width, 1), [width]);
  const latest = useLatest({ session, width });

  useGameLoop(phase === "playing", (dt) => setRun((state) => state && advance(state, dt, stepRunner)));

  const act = (move: "jump" | "duck") => {
    const { session: current, width: w } = latest.current;
    if (current.phase === "ready" && w > 0) {
      current.begin(newRunner(w, newSeed()));
      return;
    }
    current.setRun((state) => state && (move === "jump" ? jump(state) : duck(state)));
  };

  const [responder] = useState(() => {
    let acted = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.session.phase !== "over",
      onMoveShouldSetPanResponder: () => latest.current.session.phase !== "over",
      onPanResponderGrant: () => {
        acted = false;
      },
      onPanResponderMove: (_event, gesture) => {
        if (acted || Math.abs(gesture.dy) < SWIPE) return;
        acted = true;
        act(gesture.dy < 0 ? "jump" : "duck");
      },
      onPanResponderRelease: () => {
        if (!acted) act("jump");
      },
    });
  });

  useWebKeys((key, down, event) => {
    const isJump = JUMP_KEYS.has(key);
    if (!isJump && !DUCK_KEYS.has(key)) return;
    event.preventDefault();
    if (!down || event.repeat) return;
    const current = latest.current.session;
    if (current.phase === "over") {
      if (key === " " && current.canRestartByKey()) current.restart();
      return;
    }
    act(isJump ? "jump" : "duck");
  });

  return (
    <GameFrame
      game="runner"
      background={c.sky}
      session={session}
      score={run?.score ?? 0}
      board={board}
      onStageLayout={onStageLayout}
      stageHandlers={responder.panHandlers}
      startHint={startHintFor("Tap", "press the up arrow")}
      onExit={onExit}
      onLeaderboard={onLeaderboard}
    >
      {board ? <Scene state={run ?? preview} height={board.height} /> : null}
    </GameFrame>
  );
};

const styles = StyleSheet.create({
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
  man: { position: "absolute", left: 0, top: 0 },
});
