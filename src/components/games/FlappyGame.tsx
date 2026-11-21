import { advance, useGameLoop, useWebKeys } from "@/components/games/useGameLoop";
import { birdX, FLAPPY, flap, newFlappy, stepFlappy, type FlappyState } from "@/lib/games/flappy";
import { newSeed } from "@/lib/games/random";
import { fixedColours } from "@/theme";
import { useMemo, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { fitBoard, GameFrame, startHintFor, useGameSession, useLatest, useStage } from "./GameFrame";

const c = fixedColours.games.flappy;
const MAX_BOARD = { width: 480, height: 820 };
const FLAP_KEYS = new Set([" ", "ArrowUp", "w", "W"]);
const CLOUDS = [
  { id: "a", x: 0.12, y: 0.12, w: 90 },
  { id: "b", x: 0.6, y: 0.22, w: 120 },
  { id: "c", x: 0.35, y: 0.4, w: 70 },
];

const Bird = ({ state }: { state: FlappyState }) => {
  const size = FLAPPY.radius * 2;
  const tilt = Math.max(-25, Math.min(70, state.vy / 9));
  return (
    <View
      style={[
        styles.bird,
        {
          width: size + 6,
          height: size,
          backgroundColor: c.bird,
          transform: [
            { translateX: birdX(state) - size / 2 - 3 },
            { translateY: state.y - size / 2 },
            { rotate: `${tilt}deg` },
          ],
        },
      ]}
    >
      <View style={[styles.wing, { backgroundColor: c.wing, top: state.vy < 0 ? 6 : 12 }]} />
      <View style={[styles.eyeWhite, { backgroundColor: c.eyeWhite }]}>
        <View style={[styles.pupil, { backgroundColor: c.eye }]} />
      </View>
      <View style={[styles.beak, { backgroundColor: c.beak }]} />
    </View>
  );
};

const Scene = ({ state }: { state: FlappyState }) => {
  const floor = state.height - FLAPPY.groundHeight;
  const grassShift = -((state.time * 160) % 24);
  return (
    <>
      {CLOUDS.map((cloud) => (
        <View
          key={cloud.id}
          style={[
            styles.cloud,
            { backgroundColor: c.cloud, width: cloud.w, left: cloud.x * state.width, top: cloud.y * floor },
          ]}
        />
      ))}
      {state.pipes.map((pipe) => (
        <View key={pipe.id} style={[styles.pipeColumn, { transform: [{ translateX: pipe.x }] }]}>
          <View
            style={[styles.pipe, { height: pipe.gapTop, backgroundColor: c.pipe, borderColor: c.pipeEdge }]}
          />
          <View
            style={[
              styles.pipe,
              {
                top: pipe.gapTop + pipe.gapHeight,
                height: Math.max(0, floor - pipe.gapTop - pipe.gapHeight),
                backgroundColor: c.pipe,
                borderColor: c.pipeEdge,
              },
            ]}
          />
        </View>
      ))}
      <View style={[styles.ground, { top: floor, backgroundColor: c.ground }]}>
        <View style={[styles.grass, { backgroundColor: c.grass }]}>
          <View style={[styles.tufts, { transform: [{ translateX: grassShift }] }]}>
            {Array.from({ length: Math.ceil(state.width / 24) + 2 }, (_, i) => (
              <View key={`tuft-${i}`} style={[styles.tuft, { backgroundColor: c.pipeEdge }]} />
            ))}
          </View>
        </View>
      </View>
      <Bird state={state} />
    </>
  );
};

/** Flap: tap to flap through the gaps. */
export const FlappyGame = ({ onExit, onLeaderboard }: { onExit: () => void; onLeaderboard?: () => void }) => {
  const session = useGameSession<FlappyState>("flappy");
  const { run, setRun, phase } = session;
  const [stage, onStageLayout] = useStage();
  const board = stage && fitBoard(stage, MAX_BOARD);
  const width = board?.width ?? 0;
  const height = board?.height ?? 0;
  const preview = useMemo(() => newFlappy(width, height, 1), [width, height]);
  const latest = useLatest({ session, width, height });

  useGameLoop(phase === "playing", (dt) => setRun((state) => state && advance(state, dt, stepFlappy)));

  const tap = () => {
    const { session: current, width: w, height: h } = latest.current;
    if (current.phase === "ready" && w > 0) current.begin(flap(newFlappy(w, h, newSeed())));
    else current.setRun((state) => state && flap(state));
  };

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.session.phase !== "over",
      onPanResponderGrant: () => tap(),
    })
  );

  useWebKeys((key, down, event) => {
    if (!FLAP_KEYS.has(key)) return;
    event.preventDefault();
    if (!down || event.repeat) return;
    const current = latest.current.session;
    if (current.phase !== "over") tap();
    else if (key === " " && current.canRestartByKey()) current.restart();
  });

  return (
    <GameFrame
      game="flappy"
      background={c.sky}
      ink={c.eye}
      session={session}
      score={run?.score ?? 0}
      board={board}
      onStageLayout={onStageLayout}
      stageHandlers={responder.panHandlers}
      startHint={startHintFor("Tap", "press space")}
      onExit={onExit}
      onLeaderboard={onLeaderboard}
    >
      {board ? <Scene state={run ?? preview} /> : null}
    </GameFrame>
  );
};

const styles = StyleSheet.create({
  cloud: { position: "absolute", height: 28, borderRadius: 14, opacity: 0.9 },
  pipeColumn: { position: "absolute", left: 0, top: 0, bottom: 0, width: FLAPPY.pipeWidth },
  pipe: {
    position: "absolute",
    left: 0,
    width: FLAPPY.pipeWidth,
    borderWidth: 3,
    borderRadius: 6,
  },
  ground: { position: "absolute", left: 0, right: 0, bottom: 0 },
  grass: { height: 14, overflow: "hidden" },
  tufts: { flexDirection: "row", gap: 14, marginTop: 9 },
  tuft: { width: 10, height: 5, borderRadius: 2 },
  bird: { position: "absolute", left: 0, top: 0, borderRadius: FLAPPY.radius },
  wing: { position: "absolute", left: 3, width: 14, height: 9, borderRadius: 5 },
  eyeWhite: {
    position: "absolute",
    right: 5,
    top: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 1,
  },
  pupil: { width: 4, height: 4, borderRadius: 2 },
  beak: { position: "absolute", right: -5, top: 13, width: 10, height: 7, borderRadius: 3 },
});
