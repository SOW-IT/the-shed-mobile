import { advance, useGameLoop, useWebKeys } from "@/components/games/useGameLoop";
import { birdX, FLAPPY, flap, flappyAt, newFlappy, shades, stepFlappy, type FlappyState } from "@/lib/games/flappy";
import { blend, colourAt } from "@/lib/games/glider";
import { newSeed, random } from "@/lib/games/random";
import { fixedColours } from "@/theme";
import { useMemo, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { GameFrame, startHintFor, useGameSession, useLatest } from "./GameFrame";
import type { LeaveGuard } from "./GameFrame";
import { GAME_VIEWS } from "@/lib/games/playArea";
import { useBoardReach } from "./boardReach";
import type { Size } from "@/lib/games/fit";
import { CharacterPicker, useAvatarArt, useGameLook, type AvatarArt } from "./GameCharacter";
import type { Look } from "@shared/world";

const c = fixedColours.games.flappy;
const PHONE_BOARD = { width: GAME_VIEWS.flappy.size, height: 700 };
const GRASS_HEIGHT = 14;
const FLAP_KEYS = new Set([" ", "ArrowUp", "w", "W"]);
const CLOUDS = [
  { id: "a", x: 0.12, y: 0.12, w: 90 },
  { id: "b", x: 0.6, y: 0.22, w: 120 },
  { id: "c", x: 0.35, y: 0.4, w: 70 },
];

const HEAD = FLAPPY.radius * 2 + 8;
const DARK_SKY = 0.55;

const STARS = (() => {
  const rng = { seed: 23 };
  return Array.from({ length: 28 }, (_, i) => ({ id: i, x: random(rng), y: random(rng) * 0.6, size: i % 4 === 0 ? 3 : 2 }));
})();

const tones = (state: FlappyState) => {
  const shade = shades(state);
  const sky = colourAt(c.skyStops, shade.sky);
  return {
    sky,
    cloud: blend(c.cloud, sky, shade.sky * 0.7),
    pipe: blend(c.pipe, c.pipeDark, shade.pipe),
    pipeEdge: blend(c.pipeEdge, c.pipeRim, shade.pipe),
    stars: shade.stars,
    dark: shade.sky >= DARK_SKY,
  };
};

const BirdSprite = ({ flapping }: { flapping: boolean }) => (
  <View style={[styles.sprite, { backgroundColor: c.bird }]}>
    <View style={[styles.wing, { backgroundColor: c.wing, top: flapping ? 6 : 12 }]} />
    <View style={[styles.eyeWhite, { backgroundColor: c.eyeWhite }]}>
      <View style={[styles.pupil, { backgroundColor: c.eye }]} />
    </View>
    <View style={[styles.beak, { backgroundColor: c.beak }]} />
  </View>
);

const FlyingHead = ({ look, flapping, art }: { look: Look; flapping: boolean; art: AvatarArt }) => (
  <View style={styles.flyingHead}>
    <View style={[styles.headWing, { backgroundColor: c.wing, transform: [{ rotate: flapping ? "-35deg" : "20deg" }] }]} />
    <art.CharacterHead look={look} size={HEAD} />
  </View>
);

const Bird = ({ state, look: wanted }: { state: FlappyState; look: Look | null }) => {
  const art = useAvatarArt(wanted !== null);
  const look = art ? wanted : null;
  const size = FLAPPY.radius * 2;
  const tilt = Math.max(-25, Math.min(70, state.vy / 9));
  const flapping = state.vy < 0;
  const box = look ? HEAD : size + 6;
  return (
    <View
      testID="flappy-bird"
      style={[
        styles.bird,
        {
          width: box,
          height: look ? HEAD : size,
          transform: [
            { translateX: birdX(state) - box / 2 },
            { translateY: state.y - (look ? HEAD : size) / 2 },
            { rotate: `${look ? tilt / 2 : tilt}deg` },
          ],
        },
      ]}
    >
      {look && art ? <FlyingHead look={look} flapping={flapping} art={art} /> : <BirdSprite flapping={flapping} />}
    </View>
  );
};

const Scene = ({ state, look }: { state: FlappyState; look: Look | null }) => {
  const reach = useBoardReach();
  const floor = state.height - FLAPPY.groundHeight;
  const grassShift = -((state.time * 160) % 24);
  const tone = tones(state);
  return (
    <>
      {tone.stars
        ? STARS.map((star) => (
            <View
              key={`star-${star.id}`}
              style={[
                styles.star,
                { backgroundColor: c.star, width: star.size, height: star.size, left: star.x * state.width, top: star.y * floor },
              ]}
            />
          ))
        : null}
      {CLOUDS.map((cloud) => (
        <View
          key={cloud.id}
          style={[
            styles.cloud,
            { backgroundColor: tone.cloud, width: cloud.w, left: cloud.x * state.width, top: cloud.y * floor },
          ]}
        />
      ))}
      <View style={[styles.clip, { width: state.width, height: state.height }]} pointerEvents="none">
      {state.pipes.map((pipe) => (
        <View key={pipe.id} style={[styles.pipeColumn, { transform: [{ translateX: pipe.x }] }]}>
          <View
            style={[styles.pipe, { height: pipe.gapTop, backgroundColor: tone.pipe, borderColor: tone.pipeEdge }]}
          />
          <View
            style={[
              styles.pipe,
              {
                top: pipe.gapTop + pipe.gapHeight,
                height: Math.max(0, floor - pipe.gapTop - pipe.gapHeight),
                backgroundColor: tone.pipe,
                borderColor: tone.pipeEdge,
              },
            ]}
          />
        </View>
      ))}
      </View>
      <View style={[styles.ground, { top: floor, left: -reach.left, right: -reach.right, bottom: -reach.bottom, backgroundColor: c.ground }]}>
        <View style={[styles.grass, { backgroundColor: c.grass }]}>
          <View style={[styles.tufts, { transform: [{ translateX: grassShift }] }]}>
            {Array.from({ length: Math.ceil((state.width + reach.left + reach.right) / 24) + 2 }, (_, i) => (
              <View key={`tuft-${i}`} style={[styles.tuft, { backgroundColor: c.pipeEdge }]} />
            ))}
          </View>
        </View>
      </View>
      <Bird state={state} look={look} />
    </>
  );
};

/** Flap: tap to flap through the gaps. */
export const FlappyGame = ({
  onExit,
  onLeaderboard,
  active = true,
  guard,
  startScore,
}: {
  onExit: () => void;
  onLeaderboard?: () => void;
  active?: boolean;
  guard?: LeaveGuard;
  startScore?: number;
}) => {
  const session = useGameSession<FlappyState>("flappy");
  const look = useGameLook("flappy");
  const { run, setRun, phase } = session;
  const [board, setBoard] = useState<Size | null>(null);
  const { width, height } = board ?? PHONE_BOARD;
  const preview = useMemo(() => newFlappy(width, height, 1), [width, height]);
  const latest = useLatest({ session, width, height, startScore });
  const scene = run ?? preview;
  const tone = tones(scene);

  useGameLoop(phase === "playing" && active && !session.paused, (dt) => setRun((state) => state && advance(state, dt, stepFlappy)));

  const tap = () => {
    const { session: current, width: w, height: h, startScore: from } = latest.current;
    if (current.phase === "ready" && w > 0) current.begin(flap(from ? flappyAt(w, h, newSeed(), from) : newFlappy(w, h, newSeed())), !!from);
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
  }, undefined, active && !session.paused);

  return (
    <GameFrame
      game="flappy"
      background={tone.sky}
      ink={tone.dark ? c.nightInk : c.eye}
      statusBar={tone.dark ? "light" : "auto"}
      session={session}
      score={run?.score ?? 0}
      world={run ? { width: run.width, height: run.height } : board}
      onBoard={setBoard}
      stageHandlers={responder.panHandlers}
      startHint={startHintFor("Tap", "press space")}
      startExtra={
        <CharacterPicker
          game="flappy"
          picture={(pick, art) => <art.CharacterHead look={pick} size={40} />}
          original={<BirdSprite flapping={false} />}
        />
      }
      onExit={onExit}
      guard={guard}
      onLeaderboard={onLeaderboard}
    >
      <Scene state={scene} look={look} />
    </GameFrame>
  );
};

const styles = StyleSheet.create({
  cloud: { position: "absolute", height: 28, borderRadius: 14, opacity: 0.9 },
  star: { position: "absolute", borderRadius: 2, opacity: 0.8 },
  pipeColumn: { position: "absolute", left: 0, top: 0, bottom: 0, width: FLAPPY.pipeWidth },
  pipe: {
    position: "absolute",
    left: 0,
    width: FLAPPY.pipeWidth,
    borderWidth: 3,
    borderRadius: 6,
  },
  ground: { position: "absolute" },
  clip: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  grass: { height: GRASS_HEIGHT, overflow: "hidden" },
  tufts: { flexDirection: "row", gap: 14, marginTop: 9 },
  tuft: { width: 10, height: 5, borderRadius: 2 },
  bird: { position: "absolute", left: 0, top: 0 },
  sprite: { width: FLAPPY.radius * 2 + 6, height: FLAPPY.radius * 2, borderRadius: FLAPPY.radius },
  flyingHead: { width: HEAD, height: HEAD, alignItems: "center", justifyContent: "center" },
  headWing: {
    position: "absolute",
    left: -6,
    top: HEAD * 0.45,
    width: 16,
    height: 9,
    borderRadius: 5,
    transformOrigin: "right center",
  },
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
