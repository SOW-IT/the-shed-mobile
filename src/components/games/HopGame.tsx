import { advance, useGameLoop, useWebKeys } from "@/components/games/useGameLoop";
import {
  autoSteer,
  dropFloor,
  hopAt,
  hopPage,
  newHop,
  pagePoints,
  previewHop,
  stageWeights,
  stepHop,
  withSteer,
  type BoostKind,
  type HopEffect,
  type HopPage,
  type HopPlatform,
  type HopPreview,
  type HopState,
} from "@/lib/games/hop";
import { blend } from "@/lib/games/glider";
import { HOP, HOP_MARK_EVERY } from "@/lib/games/hopTuning";
import { fingers as heldFingers, lift, liftFingers, press, steerOf, type HeldStack } from "@/lib/games/hopSteer";
import { newSeed } from "@/lib/games/random";
import { fixedColours, fonts } from "@/theme";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PanResponder, StyleSheet, Text, View, type GestureResponderEvent, type ViewInstance } from "react-native";
import { GameFrame, startHintFor, useGameSession, useLatest } from "./GameFrame";
import type { LeaveGuard } from "./GameFrame";
import { GAME_VIEWS } from "@/lib/games/playArea";
import type { Size } from "@/lib/games/fit";
import { CharacterPicker, useAvatarArt, useGameLook, type AvatarArt } from "./GameCharacter";
import type { Look } from "@shared/world";

const c = fixedColours.games.hop;
const PHONE_BOARD = { width: GAME_VIEWS.hop.size, height: 700 };
const LEFT_KEYS = new Set(["ArrowLeft", "a", "A"]);
const RIGHT_KEYS = new Set(["ArrowRight", "d", "D"]);
const GRID = 26;
const MARGIN_X = 30;
const PW = HOP.platform.width;
const PH = HOP.platform.height;
const BOX = HOP.box;
/** The drawn character is a little bigger than the box everyone collides with. */
const FIGURE = { width: 50, height: 62 };
/** The Doodle Hopper's round body, and how far a hat sinks into its top. */
const HOPPER_BODY = 36;
const HOPPER_SINK = 5;
/** Degrees the propeller hat tips toward the way you're facing. */
const HAT_TILT = 8;
const MARK_UNITS = HOP_MARK_EVERY * HOP.unitsPerPoint;
/** Clouds and stars are laid out in tiles this tall, the same tile the same way every time. */
const TILE = 420;
const BADGE_SECONDS = 1.6;

/**
 * Test builds' own runs: steer like a careful player up to `target` points,
 * then the floor goes and you fall off.
 */
const autoStep = (target: number) => (state: HopState, dt: number) => {
  if (state.gen.y === Infinity) return stepHop(state, dt);
  if (state.score >= target) return stepHop(dropFloor(state), dt);
  return stepHop(withSteer(state, autoSteer(state)), dt);
};

const tones = (state: HopState) => {
  const points = pagePoints(state);
  return { page: hopPage(points, c.page), weights: stageWeights(points) };
};

/** Screen y on the board for an altitude. */
const screenY = (state: HopState, altitude: number) => state.height - (altitude - state.camera);

/** The x's to draw something at: twice when it hangs over the seam. */
const seamCopies = (x: number, half: number, width: number) =>
  x - half < 0 ? [x, x + width] : x + half > width ? [x, x - width] : [x];

// The page: graph paper, the margin rule and the altitude marks.

const VerticalGrid = memo(function VerticalGrid({ width, height, colour }: { width: number; height: number; colour: string }) {
  const count = Math.floor(width / GRID);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={`v${(i + 1) * GRID}`} style={[styles.gridV, { left: (i + 1) * GRID, height, backgroundColor: colour }]} />
      ))}
    </>
  );
});

const HorizontalGrid = memo(function HorizontalGrid({ width, height, colour }: { width: number; height: number; colour: string }) {
  const count = Math.ceil(height / GRID) + 1;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={`h${i * GRID}`} style={[styles.gridH, { top: i * GRID, width, backgroundColor: colour }]} />
      ))}
    </>
  );
});

const Paper = ({ state, page }: { state: HopState; page: HopPage }) => {
  const shift = (((state.height + state.camera) % GRID) + GRID) % GRID;
  const first = Math.ceil((state.camera - 30) / MARK_UNITS);
  const last = Math.floor((state.camera + state.height + 30) / MARK_UNITS);
  const marks = [];
  for (let k = Math.max(1, first); k <= last; k++) marks.push(k);
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: page.paper }]} />
      <VerticalGrid width={state.width} height={state.height} colour={page.grid} />
      <View style={[styles.gridLayer, { transform: [{ translateY: shift - GRID }] }]}>
        <HorizontalGrid width={state.width} height={state.height + GRID} colour={page.grid} />
      </View>
      <View style={[styles.margin, { left: MARGIN_X, height: state.height, backgroundColor: page.margin }]} />
      <View style={[styles.marginFaint, { left: MARGIN_X + 4, height: state.height, backgroundColor: page.margin }]} />
      {marks.map((k) => {
        const y = screenY(state, k * MARK_UNITS);
        return (
          <View key={`mark-${k}`} style={[styles.mark, { top: y - 1 }]} testID="hop-mark">
            <View style={[styles.markTick, { backgroundColor: page.mark }]} />
            <Text style={[styles.markText, { color: page.mark }]}>{(k * HOP_MARK_EVERY).toLocaleString()}</Text>
          </View>
        );
      })}
    </>
  );
};

/** A number in [0, 1) that's always the same for the same tile and slot. */
const hash = (tile: number, slot: number) => {
  const n = Math.sin(tile * 127.1 + slot * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Pencil clouds by day, chalk stars and constellations at night, scrolling with the page. */
const Doodles = ({ state, page, weights }: { state: HopState; page: HopPage; weights: Record<string, number> }) => {
  const cloudy = Math.min(1, weights.clouds + weights.dusk * 0.6);
  const night = weights.night;
  if (cloudy < 0.02 && night < 0.02) return null;
  const tiles = [];
  for (let t = Math.floor(state.camera / TILE); t <= Math.floor((state.camera + state.height) / TILE); t++) tiles.push(t);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {tiles.map((tile) => {
        const top = screenY(state, (tile + 1) * TILE);
        return (
          <View key={`tile-${tile}`} style={[styles.tile, { top, width: state.width, height: TILE }]}>
            {cloudy >= 0.02
              ? [0, 1].map((slot) => {
                  const w = 70 + hash(tile, slot) * 50;
                  return (
                    <View
                      key={`cloud-${slot}`}
                      style={[
                        styles.cloud,
                        {
                          left: MARGIN_X + 14 + hash(tile, slot + 10) * (state.width - MARGIN_X - w - 20),
                          top: (slot + hash(tile, slot + 20) * 0.6) * (TILE / 2),
                          width: w,
                          opacity: 0.55 * cloudy,
                        },
                      ]}
                    >
                      <View style={[styles.puff, styles.puffLeft, { borderColor: page.sketch }]} />
                      <View style={[styles.puff, styles.puffMiddle, { borderColor: page.sketch }]} />
                      <View style={[styles.puff, styles.puffRight, { borderColor: page.sketch }]} />
                    </View>
                  );
                })
              : null}
            {night >= 0.02 ? <Constellation tile={tile} width={state.width} colour={page.sketch} opacity={night} /> : null}
          </View>
        );
      })}
    </View>
  );
};

const STAR_SLOTS = [0, 1, 2, 3, 4, 5];

const Constellation = ({ tile, width, colour, opacity }: { tile: number; width: number; colour: string; opacity: number }) => {
  const stars = STAR_SLOTS.map((slot) => ({
    slot,
    x: MARGIN_X + 12 + hash(tile, slot + 40) * (width - MARGIN_X - 24),
    y: hash(tile, slot + 60) * TILE,
  }));
  // Three of them joined up, chalk lines from star to star.
  const joined = stars.slice(0, 3);
  return (
    <>
      {joined.slice(1).map((star, i) => {
        const from = joined[i];
        const dx = star.x - from.x;
        const dy = star.y - from.y;
        const length = Math.hypot(dx, dy);
        return (
          <View
            key={`line-${star.slot}`}
            style={[
              styles.chalkLine,
              {
                left: (from.x + star.x) / 2 - length / 2,
                top: (from.y + star.y) / 2,
                width: length,
                backgroundColor: colour,
                opacity: 0.28 * opacity,
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              },
            ]}
          />
        );
      })}
      {stars.map((star) => (
        <View key={`star-${star.slot}`} style={[styles.star, { left: star.x - 5, top: star.y - 5, opacity: 0.8 * opacity }]}>
          <View style={[styles.starBar, { backgroundColor: colour }]} />
          <View style={[styles.starBar, styles.starBarTurned, { backgroundColor: colour }]} />
        </View>
      ))}
    </>
  );
};

/** Your best when the run started: a dashed pencil line, ticked once you pass it. */
const BestLine = ({ state }: { state: HopState }) => {
  if (state.best <= 0) return null;
  const y = screenY(state, state.best * HOP.unitsPerPoint);
  if (y < -20 || y > state.height + 20) return null;
  const crossed = state.bestAt !== null;
  const dashes = Math.ceil(state.width / 14);
  return (
    <View style={[styles.best, { top: y - 1, width: state.width, opacity: crossed ? 0.45 : 0.9 }]} testID="hop-best-line" pointerEvents="none">
      {Array.from({ length: dashes }, (_, i) => (
        <View key={`dash-${i * 14}`} style={[styles.bestDash, { left: i * 14, backgroundColor: c.best }]} />
      ))}
      <Text style={[styles.bestLabel, { color: c.best }]}>BEST</Text>
    </View>
  );
};

/** A moment's note, once, when you pass your best: over the platforms, then gone. */
const BestBadge = ({ state }: { state: HopState }) => {
  if (state.bestAt === null || state.time - state.bestAt >= BADGE_SECONDS) return null;
  const y = screenY(state, state.best * HOP.unitsPerPoint);
  const fade = Math.min(1, (BADGE_SECONDS - (state.time - state.bestAt)) / 0.3);
  return (
    <View
      style={[styles.bestBadge, { top: Math.max(4, Math.min(state.height - 30, y - 26)), opacity: fade, backgroundColor: c.bestBadge, borderColor: c.best }]}
      testID="hop-best-badge"
      pointerEvents="none"
    >
      <Text style={[styles.bestBadgeText, { color: c.best }]}>Past your best!</Text>
    </View>
  );
};

// Platforms and what sits on them.

const fillOf = (kind: HopPlatform["kind"]) =>
  kind === "moving" ? c.moving : kind === "breakable" ? c.breakable : kind === "oneBounce" ? c.oneBounce : c.normal;

const PlatformShape = ({ kind, width, outline }: { kind: HopPlatform["kind"]; width: number; outline: string }) => (
  <View
    style={[
      styles.platform,
      { width, backgroundColor: fillOf(kind), borderColor: outline },
      kind === "oneBounce" && styles.platformDashed,
    ]}
  >
    <View style={[styles.platformStroke, { backgroundColor: c.oneBounce }]} />
    {kind === "breakable" ? (
      <>
        <View style={[styles.crack, styles.crackA, { left: width / 2 - 4, backgroundColor: c.crack }]} />
        <View style={[styles.crack, styles.crackB, { left: width / 2 + 2, backgroundColor: c.crack }]} />
      </>
    ) : null}
  </View>
);

const Spring = ({ time, firedAt, outline }: { time: number; firedAt: number | null; outline: string }) => {
  const age = firedAt === null ? Infinity : time - firedAt;
  // Squashes as you land, springs up long, then settles.
  const stretch = age < 0.04 ? 0.55 : age < 0.3 ? 1 + 0.9 * Math.sin(((age - 0.04) / 0.26) * Math.PI) : 1;
  const coil = HOP.spring.height * stretch;
  return (
    <View style={[styles.spring, { height: coil + 4 }]}>
      <View style={[styles.springTop, { backgroundColor: c.spring, borderColor: outline }]} />
      {[0, 1, 2].map((i) => (
        <View
          key={`coil-${i}`}
          style={[
            styles.coil,
            { top: 4 + ((i + 0.5) * coil) / 3 - 1, borderColor: outline, transform: [{ rotate: i % 2 ? "-12deg" : "12deg" }] },
          ]}
        />
      ))}
      <View style={[styles.springBase, { backgroundColor: c.springBase }]} />
    </View>
  );
};

const PropellerHat = ({ spin }: { spin: number }) => (
  <View style={styles.hat}>
    <View style={[styles.blade, { backgroundColor: c.propeller, borderColor: c.outline, transform: [{ scaleX: Math.cos(spin) }] }]} />
    <View style={[styles.hatStem, { backgroundColor: c.outline }]} />
    <View style={[styles.cap, { backgroundColor: c.propellerCap, borderColor: c.outline }]} />
  </View>
);

const Jetpack = ({ flame }: { flame: number | null }) => (
  <View style={styles.jetpack}>
    {[0, 1].map((i) => (
      <View key={`tank-${i}`} style={styles.tankColumn}>
        <View style={[styles.tank, { backgroundColor: c.jetpack, borderColor: c.outline }]} />
        {flame !== null ? (
          <View style={[styles.flame, { height: 14 + 12 * Math.abs(Math.sin(flame * 31 + i * 1.7)), backgroundColor: c.flame }]}>
            <View style={[styles.flameCore, { backgroundColor: c.flameCore }]} />
          </View>
        ) : null}
      </View>
    ))}
    <View style={[styles.strap, { backgroundColor: c.jetpackStrap }]} />
  </View>
);

const Item = ({ kind }: { kind: BoostKind }) =>
  kind === "propeller" ? (
    <View style={styles.itemBox} testID="hop-item-propeller">
      <PropellerHat spin={0.4} />
    </View>
  ) : (
    <View style={styles.itemBox} testID="hop-item-jetpack">
      <Jetpack flame={null} />
    </View>
  );

/**
 * A moving platform's pencil track, drawn dash by dash: a dashed border on
 * one side only comes out solid on iOS.
 */
const Track = ({ left, top, width }: { left: number; top: number; width: number }) => (
  <View style={[styles.track, { left, top, width }]}>
    {Array.from({ length: Math.ceil(width / 10) }, (_, i) => (
      <View key={`dash-${i * 10}`} style={[styles.trackDash, { left: i * 10, backgroundColor: c.track }]} />
    ))}
  </View>
);

const Platforms = ({ state, outline }: { state: HopState; outline: string }) => (
  <>
    {state.platforms.map((platform) => {
      const y = screenY(state, platform.y);
      if (y < -60 || y > state.height + 30) return null;
      const landed = platform.landedAt !== null && state.time - platform.landedAt < HOP.landSeconds;
      const squash = landed ? 1 - 0.25 * Math.sin(((state.time - (platform.landedAt ?? 0)) / HOP.landSeconds) * Math.PI) : 1;
      const track = platform.track;
      const w = platform.width;
      return (
        <View key={platform.id} pointerEvents="none">
          {track ? <Track left={track.centre - track.range - w / 2} top={y + PH / 2 - 1} width={track.range * 2 + w} /> : null}
          {seamCopies(platform.x, w / 2, state.width).map((x) => (
            <View
              key={`p-${x > platform.x ? "r" : x < platform.x ? "l" : "m"}`}
              testID={`hop-platform-${platform.kind}`}
              style={[styles.platformAt, { width: w, transform: [{ translateX: x - w / 2 }, { translateY: y }, { scaleY: squash }] }]}
            >
              <PlatformShape kind={platform.kind} width={w} outline={outline} />
              {platform.spring ? (
                <View style={[styles.onTop, { left: w / 2 + platform.spring.offset - HOP.spring.width / 2 }]}>
                  <Spring time={state.time} firedAt={platform.spring.firedAt} outline={outline} />
                </View>
              ) : null}
              {platform.item ? (
                <View style={[styles.onTop, { left: w / 2 + platform.item.offset - HOP.item.size / 2 }]}>
                  <Item kind={platform.item.kind} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      );
    })}
  </>
);

// Breaks, chalk, pickups and dropped gear.

const FRAGMENTS = [-1, -0.4, 0.3, 0.9];

const Effect = ({ effect, state, outline }: { effect: HopEffect; state: HopState; outline: string }) => {
  const age = state.time - effect.at;
  const share = Math.min(1, age / HOP.effectSeconds);
  const x = effect.x;
  const y = screenY(state, effect.y);
  const drop = 0.5 * HOP.gravity * 0.7 * age * age;
  if (effect.kind === "break") {
    return (
      <View pointerEvents="none" style={[styles.effect, { opacity: 1 - share }]} testID="hop-effect-break">
        {[-1, 1].map((side) => (
          <View
            key={`half-${side}`}
            style={[
              styles.half,
              {
                width: effect.width / 2,
                backgroundColor: c.breakable,
                borderColor: outline,
                transform: [
                  { translateX: x + (side < 0 ? -effect.width / 2 : 0) + side * age * 40 },
                  { translateY: y + drop },
                  { rotate: `${side * age * 260}deg` },
                ],
              },
            ]}
          />
        ))}
        {FRAGMENTS.map((f) => (
          <View
            key={`bit-${f}`}
            style={[styles.bit, { backgroundColor: c.crack, transform: [{ translateX: x + f * (effect.width / 2 - 2) + f * age * 60 }, { translateY: y + 4 + drop * 1.2 }] }]}
          />
        ))}
      </View>
    );
  }
  if (effect.kind === "chalk") {
    return (
      <View pointerEvents="none" style={[styles.effect, { opacity: 1 - share }]} testID="hop-effect-chalk">
        {FRAGMENTS.map((f) => (
          <View
            key={`chalk-${f}`}
            style={[
              styles.chalkBit,
              { backgroundColor: c.oneBounce, borderColor: outline, transform: [{ translateX: x + f * 26 }, { translateY: y + drop * 0.5 + Math.abs(f) * 6 }, { rotate: `${f * age * 300}deg` }] },
            ]}
          />
        ))}
      </View>
    );
  }
  if (effect.kind === "pickup") {
    const size = 20 + share * 50;
    return (
      <View
        pointerEvents="none"
        testID="hop-effect-pickup"
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: c.sparkle, opacity: 1 - share, left: x - size / 2, top: y - size / 2 - 14 }]}
      />
    );
  }
  const spin = age * 420 * effect.facing;
  return (
    <View
      pointerEvents="none"
      testID={`hop-effect-drop-${effect.boost}`}
      style={[styles.effect, { opacity: 1 - share * share, transform: [{ translateX: x - 14 + effect.vx * age }, { translateY: screenY(state, effect.y) - 40 + drop }, { rotate: `${spin}deg` }] }]}
    >
      {effect.boost === "propeller" ? <PropellerHat spin={age * 30} /> : <Jetpack flame={null} />}
    </View>
  );
};

// Original: the Doodle Hopper.

const DoodleHopper = ({ facing, stretch, headwear }: { facing: -1 | 1; stretch: number; headwear?: ReactNode }) => {
  const legs = 12 * stretch;
  return (
    <View style={styles.hopper}>
      {headwear === undefined ? null : (
        <View style={[styles.hopperHeadwear, { bottom: legs + HOPPER_BODY - HOPPER_SINK }]}>{headwear}</View>
      )}
      <View style={[styles.hopperBody, { backgroundColor: c.hopper, borderColor: c.hopperInk }]}>
        <View style={[styles.hopperBelly, { backgroundColor: c.hopperBelly }]} />
        <View style={[styles.hopperEyes, { transform: [{ translateX: facing * 4 }] }]}>
          {[0, 1].map((i) => (
            <View key={`eye-${i}`} style={[styles.hopperEye, { backgroundColor: c.eyeWhite, borderColor: c.hopperInk }]}>
              <View style={[styles.hopperPupil, { backgroundColor: c.pupil, transform: [{ translateX: facing * 2 }] }]} />
            </View>
          ))}
        </View>
        <View style={[styles.hopperTuft, { backgroundColor: c.hopperInk }]} />
      </View>
      <View style={[styles.hopperLegs, { height: legs }]}>
        {[-1, 1].map((side) => (
          <View key={`leg-${side}`} style={styles.leg}>
            <View style={[styles.legLine, { backgroundColor: c.hopperInk, transform: [{ rotate: `${side * 8}deg` }] }]} />
            <View style={[styles.foot, { backgroundColor: c.hopperInk, transform: [{ translateX: facing * 3 }] }]} />
          </View>
        ))}
      </View>
    </View>
  );
};

const Character = ({ state, look, art }: { state: HopState; look: Look | null; art: AvatarArt | null }) => {
  const landedFor = state.landedAt === null ? Infinity : state.time - state.landedAt;
  const landing = landedFor < HOP.landSeconds ? Math.sin((landedFor / HOP.landSeconds) * Math.PI) : 0;
  const rising = state.vy > 0 && !state.flight ? Math.min(1, state.vy / HOP.springSpeed) : 0;
  const scaleY = 1 - 0.2 * landing + 0.08 * rising;
  const scaleX = 1 + 0.14 * landing - 0.04 * rising;
  const spin = state.dying ? (state.time - state.dying.at) * 600 * state.facing : 0;
  const flightAge = state.flight ? state.time - state.flight.at : null;
  const y = screenY(state, state.y);
  const boosting = state.flight !== null;
  // The propeller hat, on the head, tipped the way you're going.
  const headwear =
    state.flight?.kind === "propeller" && flightAge !== null ? (
      <View style={{ transform: [{ rotate: `${state.facing * HAT_TILT}deg` }] }}>
        <PropellerHat spin={flightAge * 40} />
      </View>
    ) : undefined;
  const figure = look && art ? (
    <art.HopperCharacter look={look} width={FIGURE.width} height={FIGURE.height} facing={state.facing} boosting={boosting} headwear={headwear} />
  ) : (
    <DoodleHopper facing={state.facing} stretch={1 + 0.5 * rising - 0.5 * landing} headwear={headwear} />
  );
  return (
    <>
      {seamCopies(state.x, FIGURE.width / 2, state.width).map((x) => (
        <View
          key={`me-${x > state.x ? "r" : x < state.x ? "l" : "m"}`}
          testID="hop-player"
          pointerEvents="none"
          style={[
            styles.player,
            { transform: [{ translateX: x - FIGURE.width / 2 }, { translateY: y - FIGURE.height }, { rotate: `${spin}deg` }, { scaleX }, { scaleY }] },
          ]}
        >
          {state.flight?.kind === "jetpack" ? (
            <View style={[styles.onBack, { left: state.facing > 0 ? -8 : FIGURE.width - 20 }]}>
              <Jetpack flame={state.time} />
            </View>
          ) : null}
          {figure}
        </View>
      ))}
    </>
  );
};

const Scene = ({ state, look }: { state: HopState; look: Look | null }) => {
  const art = useAvatarArt(look !== null);
  const { page, weights } = tones(state);
  return (
    <View style={[styles.clip, { width: state.width, height: state.height }]} pointerEvents="none" testID="hop-scene">
      <Paper state={state} page={page} />
      <Doodles state={state} page={page} weights={weights} />
      <BestLine state={state} />
      <Platforms state={state} outline={c.outline} />
      {state.effects.map((effect) => (
        <Effect key={effect.id} effect={effect} state={state} outline={c.outline} />
      ))}
      <Character state={state} look={art ? look : null} art={art} />
      <BestBadge state={state} />
    </View>
  );
};

type Touch = { identifier?: string | number; pageX: number };

/** Hop: bounce up the page, steering left and right. */
export const HopGame = ({
  onExit,
  onLeaderboard,
  active = true,
  guard,
  startScore,
  hopScene,
  autoplay,
}: {
  onExit: () => void;
  onLeaderboard?: () => void;
  active?: boolean;
  guard?: LeaveGuard;
  startScore?: number;
  /** Test builds only: a still moment of a run. */
  hopScene?: HopPreview;
  /** Test builds only: a practice run that plays itself to this score, then falls off. */
  autoplay?: number;
}) => {
  const session = useGameSession<HopState>("hop");
  const look = useGameLook("hop");
  const { run, setRun, phase } = session;
  const [board, setBoard] = useState<Size | null>(null);
  const { width, height } = board ?? PHONE_BOARD;
  const preview = useMemo(
    () => (hopScene ? previewHop(hopScene, width, height) : newHop(width, height, 1)),
    [hopScene, width, height]
  );
  const latest = useLatest({ session, width, height, startScore, still: !!hopScene, autoplay });
  const scene = run ?? preview;
  const { page } = tones(scene);
  const running = phase === "playing" && active && !session.paused;

  const step = useMemo(() => (autoplay ? autoStep(autoplay) : stepHop), [autoplay]);
  useGameLoop(running, (dt) => setRun((state) => state && advance(state, dt, step)));

  // What's held: keys, and fingers either side of the board's middle, in
  // the order pressed. The newest still down steers; lifting it hands back
  // to the one before (hold left, tap right: right for the tap, then left).
  const held = useRef<HeldStack>([]);
  const middle = useRef<number | null>(null);
  const boardRef = useRef<ViewInstance | null>(null);
  const measure = useCallback((then?: () => void) => {
    boardRef.current?.measureInWindow((x, _y, w) => {
      if (w > 0) middle.current = x + w / 2;
      then?.();
    });
  }, []);
  const remeasure = useCallback(() => measure(), [measure]);

  const apply = () => {
    const steer = steerOf(held.current, middle.current);
    setRun((state) => (state && !state.over && !state.dying ? withSteer(state, steer) : state));
  };

  const clearHeld = () => {
    held.current = [];
    apply();
  };

  // Nothing stays held across a pause, a screen in front, the leave dialog or a restart.
  useEffect(() => {
    if (running) return;
    held.current = [];
    setRun((state) => (state && !state.over && !state.dying ? withSteer(state, 0) : state));
  }, [running, setRun]);

  const start = () => {
    const { session: current, width: w, height: h, startScore: from, still, autoplay: auto } = latest.current;
    if (current.phase !== "ready" || w <= 0 || still) return;
    const seed = newSeed();
    // A practice start or a run that plays itself is never saved.
    current.begin(from ? hopAt(w, h, seed, from, current.best) : newHop(w, h, seed, current.best), !!from || !!auto);
  };

  const touch = (event: GestureResponderEvent, ended: boolean) => {
    const native = event.nativeEvent;
    const gone = new Set(ended ? native.changedTouches.map((t) => t.identifier) : []);
    const down: Touch[] = native.touches.filter((t) => !gone.has(t.identifier));
    // A mouse press on the web comes with no touch list.
    const now = down.length === 0 && !ended && native.touches.length === 0 ? [native] : down;
    held.current = heldFingers(held.current, now.map((t) => ({ id: `touch-${t.identifier ?? "mouse"}`, x: t.pageX })));
    apply();
  };

  const letGo = () => {
    held.current = liftFingers(held.current);
    apply();
  };

  // Made once, so the handlers it calls are read fresh each time.
  const hands = useLatest({ measure, start, touch, letGo, apply });
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.session.phase !== "over",
      onMoveShouldSetPanResponder: () => latest.current.session.phase !== "over",
      onPanResponderGrant: (event) => {
        hands.current.start();
        hands.current.touch(event, false);
        // On a phone the measurement comes back a moment later: steer the
        // first finger again by it, in case the board had moved.
        hands.current.measure(() => hands.current.apply());
      },
      onPanResponderStart: (event) => hands.current.touch(event, false),
      onPanResponderMove: (event) => hands.current.touch(event, false),
      onPanResponderEnd: (event) => hands.current.touch(event, true),
      onPanResponderRelease: () => hands.current.letGo(),
      onPanResponderTerminate: () => hands.current.letGo(),
    })
  );

  useWebKeys(
    (key, down, event) => {
      const current = latest.current.session;
      const left = LEFT_KEYS.has(key);
      const right = RIGHT_KEYS.has(key);
      if (key === " ") {
        if (current.phase === "over") {
          event.preventDefault();
          if (down && !event.repeat && current.canRestartByKey()) {
            clearHeld();
            current.restart();
          }
        } else if (current.phase === "ready" && down && !event.repeat) {
          event.preventDefault();
          start();
        } else event.preventDefault();
        return;
      }
      if (!left && !right) return;
      if (current.phase === "over") return;
      event.preventDefault();
      if (down && !event.repeat && current.phase === "ready") start();
      // A shifted letter comes back up unshifted: hold them as one.
      const name = key.length === 1 ? key.toLowerCase() : key;
      // The last pressed steers; a key's own repeats don't take it back from a newer one.
      if (down && event.repeat) return;
      held.current = down ? press(held.current, { id: `key-${name}`, side: left ? -1 : 1 }) : lift(held.current, `key-${name}`);
      apply();
    },
    clearHeld,
    active && !session.paused
  );

  const dark = page.dark;
  return (
    <GameFrame
      game="hop"
      background={blend(page.paper, c.outside, c.outsideShare)}
      ink={dark ? c.page.night.ink : c.page.morning.ink}
      statusBar={dark ? "light" : "dark"}
      session={session}
      score={run?.score ?? (hopScene ? scene.score : 0)}
      world={run ? { width: run.width, height: run.height } : board}
      onBoard={setBoard}
      onScale={remeasure}
      stageHandlers={responder.panHandlers}
      startHint={startHintFor("Hold a side", "press ← or →")}
      hideStartCard={!!hopScene}
      startExtra={
        <CharacterPicker
          game="hop"
          picture={(pick, art) => <art.HopperCharacter look={pick} width={36} height={46} facing={1} boosting={false} />}
          original={<DoodleHopper facing={1} stretch={1} />}
        />
      }
      onExit={onExit}
      guard={guard}
      onLeaderboard={onLeaderboard}
    >
      <View ref={boardRef} onLayout={remeasure} style={[styles.measure, { width, height }]} pointerEvents="none" />
      <Scene state={scene} look={look} />
    </GameFrame>
  );
};

const styles = StyleSheet.create({
  clip: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  measure: { position: "absolute", left: 0, top: 0 },
  gridLayer: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  gridV: { position: "absolute", top: 0, width: 1, opacity: 0.8 },
  gridH: { position: "absolute", left: 0, height: 1, opacity: 0.8 },
  margin: { position: "absolute", top: 0, width: 2, opacity: 0.75 },
  marginFaint: { position: "absolute", top: 0, width: 1, opacity: 0.35 },
  mark: { position: "absolute", left: 0, flexDirection: "row", alignItems: "center" },
  markTick: { width: MARGIN_X + 10, height: 2, borderRadius: 1, opacity: 0.8 },
  markText: { fontFamily: fonts.display, fontSize: 13, fontStyle: "italic", marginLeft: 6, marginTop: -16 },
  tile: { position: "absolute", left: 0 },
  cloud: { position: "absolute", height: 34 },
  puff: { position: "absolute", borderWidth: 1.5, borderRadius: 20, borderStyle: "solid" },
  puffLeft: { left: 0, top: 12, width: "44%", height: 22 },
  puffMiddle: { left: "24%", top: 0, width: "50%", height: 32 },
  puffRight: { right: 0, top: 10, width: "44%", height: 24 },
  chalkLine: { position: "absolute", height: 1.5 },
  star: { position: "absolute", width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  starBar: { position: "absolute", width: 10, height: 2, borderRadius: 1 },
  starBarTurned: { transform: [{ rotate: "90deg" }] },
  best: { position: "absolute", left: 0, height: 2 },
  bestDash: { position: "absolute", top: 0, width: 8, height: 2, borderRadius: 1 },
  bestLabel: { position: "absolute", right: 8, top: -17, fontFamily: fonts.display, fontSize: 13, letterSpacing: 1 },
  bestBadge: { position: "absolute", right: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1.5 },
  bestBadgeText: { fontSize: 12, fontWeight: "700" },
  track: { position: "absolute", height: 2, opacity: 0.45, overflow: "hidden" },
  trackDash: { position: "absolute", top: 0, width: 5, height: 2, borderRadius: 1 },
  platformAt: { position: "absolute", left: 0, top: 0, width: PW, height: PH, transformOrigin: "top center" },
  platform: { width: PW, height: PH, borderRadius: PH / 2, borderWidth: 2, overflow: "hidden" },
  platformDashed: { borderStyle: "dashed", opacity: 0.85 },
  platformStroke: { position: "absolute", left: 8, right: 14, top: 2, height: 2, borderRadius: 1, opacity: 0.45 },
  crack: { position: "absolute", top: 0, width: 2, height: PH },
  crackA: { transform: [{ rotate: "24deg" }] },
  crackB: { transform: [{ rotate: "-28deg" }] },
  onTop: { position: "absolute", bottom: PH - 1 },
  spring: { width: HOP.spring.width, justifyContent: "flex-end" },
  springTop: { position: "absolute", top: 0, left: 0, right: 0, height: 4, borderRadius: 2, borderWidth: 1 },
  coil: { position: "absolute", left: 3, right: 3, height: 2, borderTopWidth: 2 },
  springBase: { height: 3, borderRadius: 1 },
  itemBox: { width: HOP.item.size, height: HOP.item.size, alignItems: "center", justifyContent: "flex-end" },
  hat: { width: 34, height: 26, alignItems: "center", justifyContent: "flex-end" },
  blade: { position: "absolute", top: 0, width: 34, height: 6, borderRadius: 3, borderWidth: 1.5 },
  hatStem: { position: "absolute", top: 5, width: 2.5, height: 7 },
  cap: { width: 26, height: 14, borderTopLeftRadius: 13, borderTopRightRadius: 13, borderWidth: 2 },
  jetpack: { width: 28, height: 30, flexDirection: "row", gap: 2 },
  tankColumn: { width: 13, alignItems: "center" },
  tank: { width: 13, height: 25, borderRadius: 6, borderWidth: 2 },
  flame: { width: 9, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, alignItems: "center" },
  flameCore: { width: 4, height: 9, borderRadius: 2 },
  strap: { position: "absolute", left: 4, right: 4, top: 9, height: 3 },
  effect: { position: "absolute", left: 0, top: 0 },
  half: { position: "absolute", left: 0, top: 0, width: PW / 2, height: PH, borderRadius: 5, borderWidth: 2 },
  bit: { position: "absolute", left: 0, top: 0, width: 4, height: 4, borderRadius: 1 },
  chalkBit: { position: "absolute", left: 0, top: 0, width: 10, height: 6, borderRadius: 2, borderWidth: 1 },
  ring: { position: "absolute", borderWidth: 3 },
  player: { position: "absolute", left: 0, top: 0, width: FIGURE.width, height: FIGURE.height, alignItems: "center", justifyContent: "flex-end", transformOrigin: "bottom center" },
  onBack: { position: "absolute", top: 16 },
  hopperHeadwear: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 1 },
  hopper: { width: BOX.width, height: BOX.height, alignItems: "center", justifyContent: "flex-end" },
  hopperBody: { width: BOX.width, height: HOPPER_BODY, borderRadius: 18, borderWidth: 2.5, alignItems: "center", overflow: "hidden" },
  hopperBelly: { position: "absolute", bottom: -6, width: 26, height: 18, borderRadius: 13 },
  hopperEyes: { flexDirection: "row", gap: 3, marginTop: 7 },
  hopperEye: { width: 11, height: 12, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  hopperPupil: { width: 4, height: 5, borderRadius: 2 },
  hopperTuft: { position: "absolute", top: 1, width: 8, height: 2, borderRadius: 1 },
  hopperLegs: { flexDirection: "row", gap: 10 },
  leg: { width: 6, alignItems: "center" },
  legLine: { flex: 1, width: 2.5, borderRadius: 1 },
  foot: { width: 9, height: 3, borderRadius: 2 },
});
