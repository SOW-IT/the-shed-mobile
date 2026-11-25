import { advance, useGameLoop, useWebKeys } from "@/components/games/useGameLoop";
import { GAME_VIEWS } from "@/lib/games/playArea";
import { useBoardReach } from "./boardReach";
import type { Size } from "@/lib/games/fit";
import {
  colourAt,
  blend,
  farHillTiles,
  parallaxAnchor,
  parallaxShift,
  GLIDER,
  groundAt,
  hold,
  newGlider,
  previewGlider,
  stepGlider,
  viewSize,
  worldProgress,
  type GliderPreview,
  type GliderState,
  type HillPoint,
  type Popup,
} from "@/lib/games/glider";
import { newSeed } from "@/lib/games/random";
import { fixedColours, fonts } from "@/theme";
import type { Look } from "@shared/world";
import { memo, useEffect, useMemo, useState } from "react";
import { PanResponder, Platform, StyleSheet, Text, View } from "react-native";
import { CharacterPicker, useAvatarArt, useGameLook, type AvatarArt } from "./GameCharacter";
import { GameFrame, useGameSession, useLatest } from "./GameFrame";
import type { LeaveGuard } from "./GameFrame";
import { Sideways, useSideways } from "./Sideways";

const c = fixedColours.games.glider;
const BOARD_WIDTH = GAME_VIEWS.glider.size;
const PHONE_BOARD = { width: BOARD_WIDTH, height: 334 };
const HOLD_KEYS = new Set([" ", "ArrowDown", "s", "S"]);
const START_HINT =
  Platform.OS === "web" ? "Hold the screen, or space, to start. Hold to dive, let go to fly." : "Hold to start.";

/** The ground is drawn in strips this wide, in chunks of this many, each drawn once. */
const STRIP = 12;
const CHUNK_STRIPS = 32;
const CHUNK = STRIP * CHUNK_STRIPS;
/** How far below the bottom of the world the ground is filled. */
const DEEP = 1400;
const GRASS = 6;
/** The bird's own drawing, before it's scaled to the board. */
const BIRD = 40;

const STARS = [
  { x: 0.08, y: 0.1 },
  { x: 0.22, y: 0.2 },
  { x: 0.35, y: 0.07 },
  { x: 0.5, y: 0.16 },
  { x: 0.64, y: 0.06 },
  { x: 0.76, y: 0.22 },
  { x: 0.88, y: 0.12 },
  { x: 0.95, y: 0.28 },
];

/** Each strip's two ends: x, and the ground's height there. */
const chunkPoints = (hills: readonly HillPoint[], index: number): HillPoint[] => {
  const from = index * CHUNK;
  const to = from + CHUNK;
  const first = Math.max(0, hills.findIndex((point) => point.x > from) - 1);
  const after = hills.findIndex((point) => point.x >= to);
  return hills.slice(first, after < 0 ? hills.length : after + 1);
};

const samePoints = (a: readonly HillPoint[], b: readonly HillPoint[]) =>
  a === b || (a.length === b.length && a.every((point, i) => point.x === b[i].x && point.y === b[i].y));

type ChunkProps = { hills: HillPoint[]; index: number };

const sameChunk = (a: ChunkProps, b: ChunkProps) => a.index === b.index && samePoints(a.hills, b.hills);

const strips = (hills: HillPoint[], index: number) =>
  Array.from({ length: CHUNK_STRIPS }, (_, i) => {
    const x0 = index * CHUNK + i * STRIP;
    return { i, x0, y0: groundAt(hills, x0).y, y1: groundAt(hills, x0 + STRIP).y };
  });

/**
 * One chunk of earth. Each strip is a column up to its lower end, under a
 * band turned along the slope, so the hill's outline is smooth rather than
 * stepped. The ground never changes, so a chunk draws once and the camera
 * moves over it.
 */
const EarthChunk = memo(function EarthChunk({ hills, index }: ChunkProps) {
  const parts = strips(hills, index);
  return (
    <>
      {parts.map(({ i, x0, y0, y1 }) => (
        <View
          key={`c${i}`}
          style={[styles.column, { left: x0, top: -Math.min(y0, y1), width: STRIP + 0.75, height: Math.min(y0, y1) + DEEP }]}
        />
      ))}
      {parts.map(({ i, x0, y0, y1 }) => (
        <View
          key={`b${i}`}
          style={[
            styles.band,
            {
              left: x0,
              top: -y0,
              width: Math.hypot(STRIP, y1 - y0) + 0.75,
              height: Math.abs(y1 - y0) + 3,
              transform: [{ rotate: `${Math.atan2(y0 - y1, STRIP)}rad` }],
            },
          ]}
        />
      ))}
    </>
  );
}, sameChunk);

/** The grass along one chunk's top, drawn over all the earth so no strip covers its neighbour's. */
const GrassChunk = memo(function GrassChunk({ hills, index }: ChunkProps) {
  return (
    <>
      {strips(hills, index).map(({ i, x0, y0, y1 }) => (
        <View
          key={`g${i}`}
          style={[
            styles.grass,
            {
              left: x0,
              top: -y0,
              width: Math.hypot(STRIP, y1 - y0) + 1,
              transform: [{ rotate: `${Math.atan2(y0 - y1, STRIP)}rad` }],
            },
          ]}
        />
      ))}
    </>
  );
}, sameChunk);

const FinishFlag = ({ x, y, world }: { x: number; y: number; world: number }) => (
  <View style={[styles.flag, { left: x - 3, top: -y - 96 }]} pointerEvents="none">
    <View style={[styles.pole, { backgroundColor: c.pole }]} />
    <View style={[styles.pennant, { backgroundColor: c.flag }]}>
      <Text style={styles.pennantText}>{world + 1}</Text>
    </View>
  </View>
);

/** Swoop's own bird: round, teal, with a scarf. Heavy, it tucks its wing and squashes down. */
const SwoopBird = ({ heavy }: { heavy: boolean }) => (
  <View style={[styles.birdBox, heavy && styles.squash]}>
    <View style={[styles.scarfTail, { backgroundColor: c.scarf, transform: [{ rotate: heavy ? "8deg" : "-18deg" }] }]} />
    <View style={[styles.body, { backgroundColor: c.bird }]}>
      <View style={[styles.belly, { backgroundColor: c.belly }]} />
      <View style={[styles.cheek, { backgroundColor: c.cheek }]} />
      <View style={[styles.eyeWhite, { backgroundColor: c.eyeWhite }]}>
        <View style={[styles.pupil, { backgroundColor: c.eye }]} />
      </View>
    </View>
    <View style={[styles.scarf, { backgroundColor: c.scarf }]} />
    <View style={[styles.beak, { backgroundColor: c.beak }]} />
    <View
      style={[
        styles.wing,
        { backgroundColor: c.wing },
        heavy ? styles.wingTucked : { transform: [{ rotate: "-32deg" }] },
      ]}
    />
  </View>
);

const SwoopHead = ({ look, heavy, art }: { look: Look; heavy: boolean; art: AvatarArt }) => (
  <View style={[styles.birdBox, heavy && styles.squash]}>
    <View
      style={[
        styles.headWing,
        { backgroundColor: c.wing },
        { transform: [{ rotate: heavy ? "15deg" : "-40deg" }] },
      ]}
    />
    <art.CharacterHead look={look} size={BIRD - 2} />
  </View>
);

const Flyer = ({ state, look: wanted }: { state: GliderState; look: Look | null }) => {
  const art = useAvatarArt(wanted !== null);
  const look = art ? wanted : null;
  return look && art ? <SwoopHead look={look} heavy={state.heavy} art={art} /> : <SwoopBird heavy={state.heavy} />;
};

const PopupText = ({ popup, time, x, y }: { popup: Popup; time: number; x: number; y: number }) => {
  const age = (time - popup.born) / GLIDER.popupSeconds;
  const colour = popup.kind === "rough" ? c.rough : popup.kind === "perfect" ? c.perfect : c.label;
  if (popup.kind === "world") {
    return (
      <View style={[StyleSheet.absoluteFill, styles.banner]} pointerEvents="none">
        <Text style={[styles.bannerText, { opacity: Math.min(1, 3 * (1 - age)) }]} testID="glider-world-done">
          {popup.text}
        </Text>
      </View>
    );
  }
  return (
    <Text
      pointerEvents="none"
      style={[
        styles.popup,
        { color: colour, opacity: Math.min(1, 2.5 * (1 - age)), transform: [{ translateX: x - 80 }, { translateY: y - 70 - age * 40 }] },
      ]}
    >
      {popup.text}
    </Text>
  );
};

const WorldBadge = ({ world }: { world: number }) => (
  <View style={styles.worldPill}>
    <Text style={styles.worldText} numberOfLines={1} testID="glider-world">
      World {world}
    </Text>
  </View>
);

const WorldBar = ({ state, dark }: { state: GliderState; dark: boolean }) => {
  const done = worldProgress(state);
  return (
    <View
      style={[styles.track, { backgroundColor: dark ? c.trackNight : c.track }]}
      pointerEvents="none"
      aria-label={`World ${state.world}, ${Math.round(done * 100)}% through`}
      testID="glider-world-progress"
    >
      <View style={[styles.trackFill, { width: `${done * 100}%`, backgroundColor: c.trackFill }]} />
      <View style={[styles.trackFlag, { backgroundColor: c.flag }]} />
    </View>
  );
};

/** Round hills far off, sliding past slower than the ground. */
const FarHills = ({ shift, width, colour, size, top }: { shift: number; width: number; colour: string; size: number; top: number }) => {
  return (
    <>
      {farHillTiles(shift, width, size * 1.3).map(({ tile, left, stagger }) => (
        <View
          key={tile}
          style={[
            styles.farHill,
            {
              backgroundColor: colour,
              width: size * 2,
              height: size * 2,
              borderRadius: size,
              left: left - size * 0.5,
              top: top + stagger * size * 0.14,
            },
          ]}
        />
      ))}
    </>
  );
};

const Scene = ({ state, width, height, look }: { state: GliderState; width: number; height: number; look: Look | null }) => {
  const reach = useBoardReach();
  const progress = state.daySeen;
  const sky = colourAt(c.sky, progress);
  const { camera } = state;
  const view = viewSize(width / height, camera.zoom);
  const px = height / view.height;
  const steadyPx = height / viewSize(width / height, 1).height;
  const anchor = parallaxAnchor(state);
  const top = camera.y + view.height;
  const first = Math.floor((camera.x - reach.left / px) / CHUNK) - 1;
  const last = Math.floor((camera.x + view.width + reach.right / px) / CHUNK);
  const chunks = [];
  for (let i = Math.max(-1, first); i <= last; i++) chunks.push(i);
  const screenX = (x: number) => (x - camera.x) * px;
  const screenY = (y: number) => (top - y) * px;
  const birdScale = (px * Math.sqrt(camera.zoom) * GLIDER.radius * 2.4) / BIRD;
  const angle = state.grounded ? Math.atan(groundAt(state.hills, state.x).slope) : Math.atan2(state.vy, state.vx);
  const tilt = Math.max(-1.1, Math.min(1.1, angle));
  const birdX = screenX(state.x);
  const birdY = screenY(state.y);
  const sunSize = Math.max(34, height * 0.11);
  const sunX = width * 0.05 + progress * (width * 0.9 - sunSize);
  // Over the top of the sky through the day, then down behind the hills at nightfall.
  const sunY = height * (0.07 + 0.22 * (1 - Math.sin(Math.PI * progress)) + 0.3 * Math.max(0, (progress - 0.8) / 0.2) ** 2);
  const dusk = Math.max(0, (progress - 0.72) / 0.28);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: sky }]} testID="glider-scene">
      {STARS.map((star) => (
        <View
          key={`${star.x}`}
          style={[styles.star, { backgroundColor: c.star, left: star.x * width, top: star.y * height, opacity: Math.max(0, (progress - 0.82) / 0.18) }]}
        />
      ))}
      <View
        style={[
          styles.sun,
          {
            width: sunSize,
            height: sunSize,
            borderRadius: sunSize / 2,
            backgroundColor: blend(c.sun, c.sunset, Math.max(0, (progress - 0.55) / 0.45)),
            transform: [{ translateX: sunX }, { translateY: sunY }],
          },
        ]}
        testID="glider-sun"
      />
      <View style={[styles.reach, { left: -reach.left, width: width + reach.left + reach.right, height }]} pointerEvents="none">
        <FarHills
          shift={parallaxShift(anchor, "far") * steadyPx - reach.left}
          width={width + reach.left + reach.right}
          colour={blend(c.farHill, c.night, dusk * 0.6)}
          size={height * 0.42}
          top={height * 0.42}
        />
        <FarHills
          shift={parallaxShift(anchor, "near") * steadyPx - reach.left}
          width={width + reach.left + reach.right}
          colour={blend(c.nearHill, c.night, dusk * 0.6)}
          size={height * 0.32}
          top={height * 0.6}
        />
      </View>
      <View
        style={[
          styles.world,
          { transform: [{ translateX: -camera.x * px }, { translateY: top * px }, { scale: px }] },
        ]}
        pointerEvents="none"
      >
        {chunks.map((index) => (
          <EarthChunk key={index} hills={chunkPoints(state.hills, index)} index={index} />
        ))}
        {chunks.map((index) => (
          <GrassChunk key={`g${index}`} hills={chunkPoints(state.hills, index)} index={index} />
        ))}
      </View>
      <View style={[styles.flagClip, { width, height }]} pointerEvents="none">
        <View style={[styles.world, { transform: [{ translateX: -camera.x * px }, { translateY: top * px }, { scale: px }] }]}>
          <FinishFlag x={state.worldEnd} y={groundAt(state.hills, state.worldEnd).y} world={state.world} />
        </View>
      </View>
      <View
        style={[
          styles.reach,
          { left: -reach.left, top: -reach.top, right: -reach.right, bottom: -reach.bottom, backgroundColor: c.night, opacity: dusk * 0.45 },
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.bird,
          {
            transform: [
              { translateX: birdX - BIRD / 2 },
              { translateY: birdY - BIRD },
              { scale: birdScale },
              { rotate: `${-tilt}rad` },
            ],
          },
        ]}
        testID="glider-bird"
      >
        <Flyer state={state} look={look} />
      </View>
      {state.popups.map((p) => (
        <PopupText key={p.id} popup={p} time={state.time} x={birdX} y={birdY} />
      ))}
    </View>
  );
};

/**
 * Swoop: hold to dive into the valleys, let go to fly off the hills, and
 * reach each world's flag before night. Played sideways, like Mystic Man.
 */
export const GliderGame = ({
  onExit,
  onLeaderboard,
  active = true,
  guard,
  scene,
  startScore: startWorld,
}: {
  onExit: () => void;
  onLeaderboard?: () => void;
  active?: boolean;
  guard?: LeaveGuard;
  /** Test builds: a still moment of a run, for screenshots. */
  scene?: GliderPreview;
  startScore?: number;
}) => {
  const session = useGameSession<GliderState>("glider");
  const look = useGameLook("glider");
  const { run, setRun, phase } = session;
  const { turned, insets } = useSideways();
  const [board, setBoard] = useState<Size | null>(null);
  const { width, height } = board ?? PHONE_BOARD;
  const aspect = width / height;
  const preview = useMemo(() => (scene ? previewGlider(scene, aspect) : newGlider(1, aspect, startWorld ?? 1)), [scene, aspect, startWorld]);
  const inputOn = active && !session.paused;
  const latest = useLatest({ session, aspect, startWorld });

  useGameLoop(phase === "playing" && inputOn, (dt) => setRun((state) => state && advance(state, dt, stepGlider)));
  // Input switched off (the leave dialog, another screen in front): a
  // release in the meantime goes unheard, so the bird lets go now.
  useEffect(() => {
    if (!inputOn) setRun((state) => state && hold(state, false));
  }, [inputOn, setRun]);

  const press = (down: boolean) => {
    const { session: current, aspect: ratio, startWorld: from } = latest.current;
    if (current.phase === "ready") {
      if (down) current.begin(hold(newGlider(newSeed(), ratio, from ?? 1), true), !!from);
      return;
    }
    current.setRun((state) => state && hold(state, down));
  };

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.session.phase !== "over",
      onPanResponderGrant: () => press(true),
      onPanResponderRelease: () => press(false),
      onPanResponderTerminate: () => press(false),
    })
  );

  useWebKeys(
    (key, down, event) => {
      if (!HOLD_KEYS.has(key)) return;
      event.preventDefault();
      if (event.repeat) return;
      const current = latest.current.session;
      if (current.phase === "over") {
        if (down && key === " " && current.canRestartByKey()) current.restart();
        return;
      }
      press(down);
    },
    () => press(false),
    inputOn
  );

  const shown = run ?? preview;
  const progress = shown.daySeen;
  const sky = colourAt(c.sky, progress);
  // Past dusk the sky is dark: white score bar and status bar.
  const dark = progress > 0.86;
  const frame = (
    <GameFrame
      game="glider"
      background={sky}
      ink={dark ? c.label : c.ink}
      statusBar={dark ? "light" : "dark"}
      session={session}
      score={run?.score ?? 0}
      world={run ? { width: BOARD_WIDTH, height: BOARD_WIDTH / run.aspect } : board}
      onBoard={setBoard}
      stageHandlers={responder.panHandlers}
      startHint={START_HINT}
      startExtra={
        <CharacterPicker
          game="glider"
          picture={(pick, art) => <art.CharacterHead look={pick} size={40} />}
          original={<SwoopBird heavy={false} />}
        />
      }
      titleExtra={<WorldBadge world={shown.world} />}
      underBar={<WorldBar state={shown} dark={dark} />}
      hideStartCard={!!scene}
      overDetail={run?.ended === "night" ? `Night fell in World ${run.world}.` : null}
      onExit={onExit}
      guard={guard}
      onLeaderboard={onLeaderboard}
      insets={insets}
    >
      <Scene state={shown} width={BOARD_WIDTH} height={BOARD_WIDTH / shown.aspect} look={look} />
    </GameFrame>
  );
  return (
    <Sideways turned={turned}>
      {frame}
    </Sideways>
  );
};

const styles = StyleSheet.create({
  world: { position: "absolute", left: 0, top: 0, width: 0, height: 0, transformOrigin: "top left" },
  column: { position: "absolute", backgroundColor: c.ground },
  band: { position: "absolute", backgroundColor: c.ground, transformOrigin: "top left" },
  grass: { position: "absolute", height: GRASS, backgroundColor: c.grass, transformOrigin: "top left" },
  flag: { position: "absolute", width: 60, height: 96 },
  pole: { position: "absolute", left: 0, top: 0, width: 6, height: 96, borderRadius: 3 },
  pennant: {
    position: "absolute",
    left: 6,
    top: 4,
    width: 46,
    height: 30,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  pennantText: { fontFamily: fonts.display, fontSize: 18, color: c.label },
  star: { position: "absolute", width: 3, height: 3, borderRadius: 1.5 },
  sun: { position: "absolute", left: 0, top: 0 },
  farHill: { position: "absolute" },
  reach: { position: "absolute", top: 0 },
  flagClip: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  bird: { position: "absolute", left: 0, top: 0, width: BIRD, height: BIRD, transformOrigin: "bottom center" },
  birdBox: { width: BIRD, height: BIRD, alignItems: "center", justifyContent: "flex-end" },
  squash: { transform: [{ scaleX: 1.12 }, { scaleY: 0.86 }], transformOrigin: "bottom center" },
  body: { width: 34, height: 32, borderRadius: 17, overflow: "hidden" },
  belly: { position: "absolute", left: 9, bottom: -6, width: 26, height: 20, borderRadius: 13 },
  cheek: { position: "absolute", right: 5, top: 16, width: 6, height: 4, borderRadius: 2, opacity: 0.85 },
  eyeWhite: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 1,
  },
  pupil: { width: 5, height: 5, borderRadius: 2.5 },
  beak: { position: "absolute", right: -1, top: 17, width: 9, height: 7, borderTopRightRadius: 6, borderBottomRightRadius: 2, borderTopLeftRadius: 2 },
  scarf: { position: "absolute", left: 8, bottom: 9, width: 22, height: 5, borderRadius: 3 },
  scarfTail: { position: "absolute", left: -2, bottom: 6, width: 14, height: 5, borderRadius: 3, transformOrigin: "right center" },
  wing: { position: "absolute", left: 6, top: 14, width: 18, height: 11, borderRadius: 6, transformOrigin: "right center" },
  wingTucked: { left: 9, top: 20, width: 15, height: 9 },
  headWing: { position: "absolute", left: -4, top: BIRD * 0.45, width: 18, height: 10, borderRadius: 5, transformOrigin: "right center" },
  popup: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 160,
    textAlign: "center",
    fontFamily: fonts.display,
    fontSize: 18,
    textShadowColor: c.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  banner: { alignItems: "center", justifyContent: "center" },
  bannerText: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: c.label,
    textAlign: "center",
    textShadowColor: c.shadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  worldPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: fixedColours.games.panel },
  worldText: { fontFamily: fonts.display, fontSize: 14, color: c.label },
  track: { alignSelf: "stretch", height: 6, overflow: "hidden" },
  trackFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  trackFlag: { position: "absolute", right: 0, top: 0, bottom: 0, width: 6 },
});
