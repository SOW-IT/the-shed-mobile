import { advance, useGameLoop, useWebKeys } from "@/components/games/useGameLoop";
import { GAME_VIEWS } from "@/lib/games/playArea";
import { useBoardReach } from "./boardReach";
import type { Size } from "@/lib/games/fit";
import {
  colourAt,
  blend,
  cloudAltitude,
  farHillTiles,
  islandPalette,
  parallaxAnchor,
  parallaxShift,
  terrainLod,
  worldAtX,
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
  birdPixels,
  earthFloor,
  unitPixels,
} from "@/lib/games/glider";
import { newSeed } from "@/lib/games/random";
import { fixedColours, fonts } from "@/theme";
import type { Look } from "@shared/world";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
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

/** How far below the bottom of the world the ground is filled. */
const GRASS = 6;
/** The bird's own drawing, before it's scaled to the board. */
const LAST_PRACTICE_WORLD = 200;

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

type ChunkProps = {
  hills: readonly HillPoint[];
  index: number;
  strip: number;
  chunkStrips: number;
  floor: number;
  /** World colour before `splitX` (or the whole chunk when `splitX` is null). */
  colour: string;
  /** If a world flag sits inside this chunk, ground past `splitX` already uses `nextColour`. */
  splitX: number | null;
  nextColour: string;
};

// `state.hills` keeps the same array reference all world, so reference equality is O(1) with zero per-frame allocations.
const sameChunk = (a: ChunkProps, b: ChunkProps) =>
  a.hills === b.hills &&
  a.index === b.index &&
  a.strip === b.strip &&
  a.chunkStrips === b.chunkStrips &&
  a.floor === b.floor &&
  a.colour === b.colour &&
  a.splitX === b.splitX &&
  a.nextColour === b.nextColour;

type Strip = { key: string; x0: number; w: number; y0: number; y1: number; fill: string };

/**
 * The chunk's strips, left to right. The one strip a world flag crosses is cut
 * in two at the flag, both halves meeting at the ground's height there, so the
 * island colour changes exactly at the flag at every zoom level.
 */
const strips = (
  { hills, index, strip, chunkStrips, colour, splitX, nextColour }: ChunkProps,
): Strip[] => {
  const chunk = strip * chunkStrips;
  const out: Strip[] = [];
  for (let i = 0; i < chunkStrips; i++) {
    const x0 = index * chunk + i * strip;
    const x1 = x0 + strip;
    const y0 = groundAt(hills, x0).y;
    const y1 = groundAt(hills, x1).y;
    if (splitX !== null && splitX > x0 && splitX < x1) {
      const ys = groundAt(hills, splitX).y;
      out.push({ key: `${i}a`, x0, w: splitX - x0, y0, y1: ys, fill: colour });
      out.push({ key: `${i}b`, x0: splitX, w: x1 - splitX, y0: ys, y1, fill: nextColour });
    } else {
      out.push({ key: `${i}`, x0, w: strip, y0, y1, fill: splitX !== null && x0 >= splitX ? nextColour : colour });
    }
  }
  return out;
};

/**
 * One chunk of earth. Each strip is a column up to its lower end, under a
 * band turned along the slope, so the hill's outline is smooth rather than
 * stepped. Strip width scales up with camera zoom (LOD) so flying high never
 * floods the view tree with thousands of views. When a finish flag sits inside
 * the chunk, ground past the flag already wears the next island's colour.
 */
const EarthChunk = memo(function EarthChunk(props: ChunkProps) {
  const parts = strips(props);
  const { floor } = props;
  return (
    <>
      {parts.map(({ key, x0, w, y0, y1, fill }) => (
        <View
          key={`c${key}`}
          style={[styles.column, { backgroundColor: fill, left: x0, top: -Math.min(y0, y1), width: w + 1, height: Math.min(y0, y1) - floor }]}
        />
      ))}
      {parts.map(({ key, x0, w, y0, y1, fill }) => (
        <View
          key={`b${key}`}
          style={[
            styles.band,
            {
              backgroundColor: fill,
              left: x0,
              top: -y0,
              width: Math.hypot(w, y1 - y0) + 1,
              height: Math.abs(y1 - y0) + 3,
              transform: [{ rotate: `${Math.atan2(y0 - y1, w)}rad` }],
            },
          ]}
        />
      ))}
    </>
  );
}, sameChunk);

/** The grass along one chunk's top, drawn over all the earth so no strip covers its neighbour's. */
const GrassChunk = memo(function GrassChunk(props: ChunkProps) {
  return (
    <>
      {strips(props).map(({ key, x0, w, y0, y1, fill }) => (
        <View
          key={`g${key}`}
          style={[
            styles.grass,
            {
              backgroundColor: fill,
              left: x0,
              top: -y0,
              width: Math.hypot(w, y1 - y0) + 1.25,
              transform: [{ rotate: `${Math.atan2(y0 - y1, w)}rad` }],
            },
          ]}
        />
      ))}
    </>
  );
}, sameChunk);

/** Soft clouds drifting along the Cloudtouch ceiling band so players see the height goal. */
const CloudBand = ({ shift, width, top, opacity }: { shift: number; width: number; top: number; opacity: number }) => (
  <>
    {farHillTiles(shift, width, 240).map(({ tile, left, stagger }) => {
      const w = 110 + stagger * 22;
      const h = 28 + stagger * 4;
      return (
        <View
          key={`cl${tile}`}
          style={[
            styles.cloud,
            {
              left,
              top: top + (stagger - 1) * 14,
              width: w,
              height: h,
              borderRadius: h / 2,
              backgroundColor: c.cloud,
              opacity,
            },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.cloudPuff,
              { left: w * 0.18, top: -h * 0.45, width: w * 0.42, height: h * 0.9, borderRadius: h * 0.45, backgroundColor: c.cloud },
            ]}
          />
          <View
            style={[
              styles.cloudPuff,
              { left: w * 0.48, top: -h * 0.3, width: w * 0.34, height: h * 0.75, borderRadius: h * 0.38, backgroundColor: c.cloud },
            ]}
          />
        </View>
      );
    })}
  </>
);

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
  const colour =
    popup.kind === "rough"
      ? c.rough
      : popup.kind === "doubleFever"
        ? c.doubleFever
        : popup.kind === "fever"
          ? c.fever
          : popup.kind === "cloud"
            ? c.cloudText
            : popup.kind === "perfect"
              ? c.perfect
              : c.label;
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

const FEVER_PIPS = [1, 2, 3] as const;

const WorldBadge = ({
  world,
  streak,
  feverLevel,
}: {
  world: number;
  streak: number;
  feverLevel: GliderState["feverLevel"];
}) => {
  const doubleProgress = Math.max(0, streak - GLIDER.feverStreak);
  return (
    <View style={styles.badgeRow}>
      <View style={styles.worldPill}>
        <Text style={styles.worldText} numberOfLines={1} testID="glider-world">
          Day {world}
        </Text>
      </View>
      {feverLevel >= 2 ? (
        <View style={[styles.feverPill, { backgroundColor: c.doubleFeverPillBg }]} testID="glider-double-fever">
          <Text style={styles.feverText} numberOfLines={1}>
            FEVER ×2
          </Text>
        </View>
      ) : feverLevel === 1 ? (
        <>
          <View style={[styles.feverPill, { backgroundColor: c.feverPillBg }]} testID="glider-fever">
            <Text style={styles.feverText} numberOfLines={1}>
              FEVER
            </Text>
          </View>
          <View style={styles.pipPill} testID="glider-double-fever-streak">
            {FEVER_PIPS.map((step) => (
              <View
                key={`df-${step}`}
                style={[styles.pip, { backgroundColor: step <= doubleProgress ? c.doubleFever : c.feverPipEmpty }]}
              />
            ))}
          </View>
        </>
      ) : streak > 0 ? (
        <View style={styles.pipPill} testID="glider-streak">
          {FEVER_PIPS.map((step) => (
            <View
              key={`f-${step}`}
              style={[styles.pip, { backgroundColor: step <= streak ? c.fever : c.feverPipEmpty }]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
};

const WorldBar = ({ state, dark }: { state: GliderState; dark: boolean }) => {
  const done = worldProgress(state);
  return (
    <View
      style={[styles.track, { backgroundColor: dark ? c.trackNight : c.track }]}
      pointerEvents="none"
      aria-label={`Day ${state.world}, ${Math.round(done * 100)}% through`}
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

/**
 * The board, cut off where the scenery stops. The earth runs down to the
 * world's floor and the far hills hang below the board, so unclipped they
 * covered the bottom border of a screen outside Swoop's shapes (a tall
 * browser window), and only a black band was left above.
 */
const BoardClip = ({ children }: { children: ReactNode }) => {
  const reach = useBoardReach();
  return (
    <View style={[styles.boardClip, { left: -reach.left, top: -reach.top, right: -reach.right, bottom: -reach.bottom }]} pointerEvents="none">
      <View style={[styles.board, { left: reach.left, top: reach.top, right: reach.right, bottom: reach.bottom }]}>{children}</View>
    </View>
  );
};

const Scene = ({ state, width, height, look }: { state: GliderState; width: number; height: number; look: Look | null }) => {
  const reach = useBoardReach();
  const progress = state.daySeen;
  const sky = colourAt(c.sky, progress);
  const currPalette = islandPalette(state.world, c.palettes);
  const nextPalette = islandPalette(state.world + 1, c.palettes);
  const prevPalette = state.world > 1 ? islandPalette(state.world - 1, c.palettes) : currPalette;
  // Smoothly ease distant parallax hills into the upcoming island near the finish flag.
  const flagBlend = Math.max(0, Math.min(1, (worldProgress(state) - 0.88) / 0.12));
  const farHillColour = blend(currPalette.farHill, nextPalette.farHill, flagBlend);
  const nearHillColour = blend(currPalette.nearHill, nextPalette.nearHill, flagBlend);
  const { camera } = state;
  const view = viewSize(width / height, camera.zoom);
  const px = unitPixels({ width, height }, camera.zoom);
  const steadyPx = height / viewSize(width / height, 1).height;
  const anchor = parallaxAnchor(state);
  const top = camera.y + view.height;
  const lod = terrainLod(camera.zoom);
  const first = Math.floor((camera.x - reach.left / px) / lod.chunk) - 1;
  const last = Math.floor((camera.x + view.width + reach.right / px) / lod.chunk);
  const chunkInfo = (index: number) => {
    const startX = index * lod.chunk;
    const endX = startX + lod.chunk;
    const w0 = worldAtX(startX, state.world, state.worldStart, state.worldEnd);
    const w1 = worldAtX(endX - 1, state.world, state.worldStart, state.worldEnd);
    const paletteOf = (w: number) => (w < state.world ? prevPalette : w > state.world ? nextPalette : currPalette);
    const p0 = paletteOf(w0);
    const p1 = paletteOf(w1);
    const splitX =
      w0 === w1
        ? null
        : state.world > 1 && startX < state.worldStart && endX > state.worldStart
          ? state.worldStart
          : state.worldEnd;
    return { index, p0, p1, splitX };
  };
  const chunks = [];
  for (let i = Math.max(-1, first); i <= last; i++) chunks.push(chunkInfo(i));
  const screenX = (x: number) => (x - camera.x) * px;
  const screenY = (y: number) => (top - y) * px;
  const birdScale = birdPixels(px) / BIRD;
  const floor = earthFloor(state.hills);
  const tilt = state.tilt;
  const birdX = screenX(state.x);
  const birdY = screenY(state.y);
  const cloudY = screenY(cloudAltitude(state.peakRef));
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
          colour={blend(farHillColour, c.night, dusk * 0.6)}
          size={height * 0.42}
          top={height * 0.42}
        />
        <FarHills
          shift={parallaxShift(anchor, "near") * steadyPx - reach.left}
          width={width + reach.left + reach.right}
          colour={blend(nearHillColour, c.night, dusk * 0.6)}
          size={height * 0.32}
          top={height * 0.6}
        />
        {cloudY > -80 && cloudY < height + 40 ? (
          <CloudBand
            shift={parallaxShift(anchor, "near") * steadyPx * 1.4 - reach.left}
            width={width + reach.left + reach.right}
            top={cloudY - 14}
            opacity={Math.max(0.2, 0.58 - dusk * 0.35)}
          />
        ) : null}
      </View>
      <View
        style={[
          styles.world,
          { transform: [{ translateX: -camera.x * px }, { translateY: top * px }, { scale: px }] },
        ]}
        pointerEvents="none"
      >
        {chunks.map(({ index, p0, p1, splitX }) => (
          <EarthChunk
            key={`e${lod.level}-${index}`}
            hills={state.hills}
            index={index}
            strip={lod.strip}
            chunkStrips={lod.chunkStrips}
            floor={floor}
            colour={p0.ground}
            splitX={splitX}
            nextColour={p1.ground}
          />
        ))}
        {chunks.map(({ index, p0, p1, splitX }) => (
          <GrassChunk
            key={`g${lod.level}-${index}`}
            hills={state.hills}
            index={index}
            strip={lod.strip}
            chunkStrips={lod.chunkStrips}
            floor={floor}
            colour={p0.grass}
            splitX={splitX}
            nextColour={p1.grass}
          />
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
      {state.fever &&
        state.trail.map((pt, i) => {
          const share = (i + 1) / (state.trail.length + 1);
          const dotSize = Math.max(4, birdPixels(px) * (state.feverLevel >= 2 ? 0.54 : 0.45) * share);
          const trailColour = state.feverLevel >= 2 ? c.doubleFever : c.fever;
          return (
            <View
              key={pt.id}
              pointerEvents="none"
              style={[
                styles.trailDot,
                {
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  backgroundColor: trailColour,
                  opacity: share * (state.feverLevel >= 2 ? 0.78 : 0.65),
                  transform: [{ translateX: screenX(pt.x) - dotSize / 2 }, { translateY: screenY(pt.y) - dotSize * 0.9 }],
                },
              ]}
            />
          );
        })}
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
        {state.fever ? (
          <View
            style={[styles.feverAura, { backgroundColor: state.feverLevel >= 2 ? c.doubleFeverGlow : c.feverGlow }]}
            pointerEvents="none"
          />
        ) : null}
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
  startScore,
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
  const startWorld = startScore === undefined ? undefined : Math.min(startScore, LAST_PRACTICE_WORLD);
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
      titleExtra={<WorldBadge world={shown.world} streak={shown.streak} feverLevel={shown.feverLevel} />}
      underBar={<WorldBar state={shown} dark={dark} />}
      hideStartCard={!!scene}
      overDetail={run?.ended === "night" ? `Night fell on day ${run.world}.` : null}
      onExit={onExit}
      guard={guard}
      onLeaderboard={onLeaderboard}
      insets={insets}
    >
      <BoardClip>
        <Scene state={shown} width={BOARD_WIDTH} height={BOARD_WIDTH / shown.aspect} look={look} />
      </BoardClip>
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
  boardClip: { position: "absolute", overflow: "hidden" },
  board: { position: "absolute" },
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
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  feverPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12 },
  feverText: { fontFamily: fonts.display, fontSize: 12, color: c.label, letterSpacing: 0.6 },
  pipPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: fixedColours.games.panel },
  pip: { width: 7, height: 7, borderRadius: 3.5 },
  cloud: { position: "absolute" },
  cloudPuff: { position: "absolute" },
  trailDot: { position: "absolute", left: 0, top: 0 },
  feverAura: { position: "absolute", left: -6, top: -6, right: -6, bottom: -6, borderRadius: 26 },
  track: { alignSelf: "stretch", height: 6, overflow: "hidden" },
  trackFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  trackFlag: { position: "absolute", right: 0, top: 0, bottom: 0, width: 6 },
});
