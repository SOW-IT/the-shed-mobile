import { advance, useGameLoop, useWebKeys } from "@/components/games/useGameLoop";
import { newSeed, random } from "@/lib/games/random";
import { moveShooter, newShooter, SHOOTER, stepShooter, type ShooterState } from "@/lib/games/shooter";
import { fixedColours } from "@/theme";
import { memo, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import {
  fitBoard,
  GameFrame,
  startHintFor,
  useGameSession,
  useLatest,
  useStage,
  type Size,
} from "./GameFrame";

const c = fixedColours.games.shooter;
const MAX_BOARD = { width: 480, height: 860 };
/** Arrow keys move the plane this many points a second. */
const KEY_SPEED = 340;

const at = (x: number, y: number, size: number) => ({
  transform: [{ translateX: x - size / 2 }, { translateY: y - size / 2 }],
});

const Stars = memo(function Stars({ width, height }: Size) {
  const stars = useMemo(() => {
    const rng = { seed: 11 };
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: random(rng) * width,
      y: random(rng) * height,
      size: i % 5 === 0 ? 3 : 2,
    }));
  }, [width, height]);
  return (
    <>
      {stars.map((star) => (
        <View
          key={star.id}
          style={[styles.dot, { width: star.size, height: star.size, backgroundColor: c.star }, at(star.x, star.y, star.size)]}
        />
      ))}
    </>
  );
});

const Plane = ({ x, y }: { x: number; y: number }) => {
  const s = SHOOTER.planeSize;
  return (
    <View style={[styles.entity, { width: s, height: s }, at(x, y, s)]} pointerEvents="none">
      <View style={[styles.wings, { backgroundColor: c.wing }]} />
      <View style={[styles.fuselage, { backgroundColor: c.plane }]} />
      <View style={[styles.tail, { backgroundColor: c.wing }]} />
      <View style={[styles.core, { backgroundColor: c.core }]} />
    </View>
  );
};

const Scene = ({ state }: { state: ShooterState }) => (
  <>
    {state.shots.map((shot) => (
      <View key={shot.id} style={[styles.shot, { backgroundColor: c.shot }, at(shot.x, shot.y, 6)]} />
    ))}
    {state.enemies.map((enemy) => {
      const size = (enemy.kind === "big" ? SHOOTER.bigRadius : SHOOTER.smallRadius) * 2;
      return (
        <View
          key={enemy.id}
          style={[
            styles.enemy,
            {
              width: size,
              height: size,
              borderRadius: size / 3,
              backgroundColor: enemy.kind === "big" ? c.enemyBig : c.enemy,
            },
            at(enemy.x, enemy.y, size),
          ]}
        >
          <View style={[styles.eye, { backgroundColor: c.enemyEye }]} />
          {enemy.kind === "big" ? <View style={[styles.eye, { backgroundColor: c.enemyEye }]} /> : null}
        </View>
      );
    })}
    <Plane x={state.player.x} y={state.player.y} />
    {state.bullets.map((bullet) => (
      <View
        key={bullet.id}
        style={[styles.bullet, { backgroundColor: c.bullet, borderColor: c.bulletCore }, at(bullet.x, bullet.y, 10)]}
      />
    ))}
  </>
);

/** Sky Shooter: drag to fly; the plane fires on its own. */
export const ShooterGame = ({ onExit, onLeaderboard }: { onExit: () => void; onLeaderboard?: () => void }) => {
  const session = useGameSession<ShooterState>("shooter");
  const { run, setRun, phase } = session;
  const [stage, onStageLayout] = useStage();
  const board = stage && fitBoard(stage, MAX_BOARD);
  const width = board?.width ?? 0;
  const height = board?.height ?? 0;
  const preview = useMemo(() => newShooter(width, height, 1), [width, height]);
  const latest = useLatest({ session, width, height });
  const keys = useRef(new Set<string>());

  useGameLoop(phase === "playing", (dt) => {
    const held = keys.current;
    const dx = (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0);
    const dy = (held.has("ArrowDown") ? 1 : 0) - (held.has("ArrowUp") ? 1 : 0);
    setRun((state) => {
      if (!state) return state;
      const moved = dx || dy ? moveShooter(state, dx * KEY_SPEED * dt, dy * KEY_SPEED * dt) : state;
      return advance(moved, dt, stepShooter);
    });
  });

  const startIfReady = () => {
    const { session: current, width: w, height: h } = latest.current;
    if (current.phase === "ready" && w > 0) current.begin(newShooter(w, h, newSeed()));
  };

  const [responder] = useState(() => {
    let last = { dx: 0, dy: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.session.phase !== "over",
      onMoveShouldSetPanResponder: () => latest.current.session.phase !== "over",
      onPanResponderGrant: () => {
        startIfReady();
        last = { dx: 0, dy: 0 };
      },
      onPanResponderMove: (_event, gesture) => {
        const dx = gesture.dx - last.dx;
        const dy = gesture.dy - last.dy;
        last = { dx: gesture.dx, dy: gesture.dy };
        latest.current.session.setRun((state) => state && moveShooter(state, dx, dy));
      },
    });
  });

  useWebKeys((key, down, event) => {
    if (!key.startsWith("Arrow") && key !== " ") return;
    event.preventDefault();
    if (down) keys.current.add(key);
    else keys.current.delete(key);
    if (!down) return;
    const current = latest.current.session;
    if (current.phase === "ready") startIfReady();
    else if (current.phase === "over" && key === " " && current.canRestartByKey()) current.restart();
  });

  return (
    <GameFrame
      game="shooter"
      background={c.sky}
      session={session}
      score={run?.score ?? 0}
      board={board}
      onStageLayout={onStageLayout}
      stageHandlers={responder.panHandlers}
      startHint={startHintFor("Touch and drag", "press an arrow key")}
      onExit={onExit}
      onLeaderboard={onLeaderboard}
    >
      {board ? <Stars width={width} height={height} /> : null}
      {board ? <Scene state={run ?? preview} /> : null}
    </GameFrame>
  );
};

const styles = StyleSheet.create({
  dot: { position: "absolute", left: 0, top: 0, borderRadius: 2, opacity: 0.7 },
  entity: { position: "absolute", left: 0, top: 0, alignItems: "center" },
  fuselage: { position: "absolute", width: 10, height: 30, top: 2, borderRadius: 5 },
  wings: { position: "absolute", width: 34, height: 9, top: 14, borderRadius: 4 },
  tail: { position: "absolute", width: 16, height: 6, top: 26, borderRadius: 3 },
  core: { position: "absolute", width: 8, height: 8, top: 13, borderRadius: 4 },
  shot: { position: "absolute", left: 0, top: 0, width: 6, height: 14, borderRadius: 3 },
  enemy: {
    position: "absolute",
    left: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  eye: { width: 7, height: 7, borderRadius: 4 },
  bullet: { position: "absolute", left: 0, top: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
