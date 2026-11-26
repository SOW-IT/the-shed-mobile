import { bodyScale, FULL_OUTFITS, lookPart, nudge, type EmoteId, type Look, type MutualKind, type Pose } from "@shared/world";
import { memo, useState, type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { QUAD_SIZE, type Camera, type ScreenPoint } from "./camera";
import { garden, hud, isLight, people, shade } from "./palette";
import { popShadow } from "./popShadow";
import { Ellipse, flatQuad, quadTransform } from "./Shapes";
import {
  backDrapeCover,
  bandOverHead,
  BEANIE_BODY,
  BEANIE_CUFF,
  beretPose,
  bowPose,
  braidPoints,
  capShape,
  crownShape,
  curlPoints,
  curtainsPose,
  earCup,
  earFlowerPose,
  glassesTemples,
  HAT_PITCH,
  headPoint,
  hoodLayer,
  mohawkPoints,
  ponytailPose,
  projectOnHead,
  ringOnHead,
  sideSweptPose,
  spikePoints,
  wavyHemPoints,
  type Disc,
  type HeadView,
  type Point,
} from "./headwear";
import {
  backpackPose,
  bodyHalfWidth,
  bowTiePose,
  necklacePose,
  PLAID_ANGLES,
  POLKA_DOTS,
  scarfPose,
  surfaceDots,
  surfaceSegment,
  surfaceStrip,
  TIE_DYE_BLOBS,
  TIE_DYE_LIGHTS,
  type BodyView,
} from "./bodywear";
import { FACE_MIN } from "./talk";
import { AFRO_RISE, sitsOnAfro, tagRise } from "./hatHeight";
import { strideBob, strideSwing } from "./gait";
import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";

/**
 * The top of this person's head: taller people's tags sit higher, and so do
 * the tags of anyone in a party hat, a crown, a mohawk or a hat on an afro,
 * so the tag doesn't hide it.
 */
export const headTop = (look: Look) => {
  const hat = lookPart(look, "hat");
  // Higher for a party hat, crown or crest, and for an afro under a bow, party hat or crown.
  return 1.0 * bodyScale(look).height + 0.62 + tagRise(look.hair, hat, look.hair === 12 && !hidesCrest(hat));
};

/** Face shapes: width and height (of a round head), and corner rounding at top and bottom. */
/** Each style of glasses: lens width and height (times the head scale), corner rounding and rim. */
const LENSES = [
  { w: 0.2, h: 0.2, round: 1, rim: 0.028 },
  { w: 0.23, h: 0.18, round: 0.2, rim: 0.026 },
  { w: 0.23, h: 0.16, round: 0.35, rim: 0.02 },
  { w: 0.27, h: 0.27, round: 1, rim: 0.024 },
  { w: 0.24, h: 0.19, round: 0.45, rim: 0.03 },
] as const;

const FACE_SHAPES = [
  { w: 1, h: 1, top: 1, bottom: 1 },
  { w: 0.94, h: 1.08, top: 1, bottom: 1 },
  { w: 1.02, h: 0.98, top: 0.55, bottom: 0.55 },
  { w: 1.06, h: 1, top: 1, bottom: 0.6 },
  { w: 0.9, h: 1.14, top: 0.9, bottom: 0.9 },
] as const;

/**
 * How far the very top of a character (hair and hat included) stands above
 * its feet, as a multiple of its scale, when it's drawn `up` scales tall per
 * unit of height. For fitting a character into a fixed frame.
 */
export const figureTop = (look: Look, up: number) => {
  const head = bodyScale(look).height * up;
  const shape = FACE_SHAPES[lookPart(look, "face")] ?? FACE_SHAPES[0];
  const face = 0.42 * shape.h + 0.05;
  const hat = lookPart(look, "hat");
  const hair = look.hair;
  // A taller face lifts what sits on top of it.
  const lift = faceLift(shape.h);
  const onTop = Math.max(
    hair === 1 && !hidesBun(hat) ? 0.63 : 0,
    hair === 10 && !flattensAfro(hat) ? 0.65 : 0,
    hair === 5 && hat === 0 ? 0.62 : 0,
    hair === 13 && !coversFringe(hat) ? 0.52 : 0,
    hair === 12 && !hidesCrest(hat) ? 0.62 : 0,
    hat === 2 ? 0.55 : 0,
    hat === 4 ? 0.5 : 0,
    hat === 5 ? 0.62 : 0,
    hat === 8 ? 0.77 : 0,
    hat === 9 ? 0.6 : 0,
    hat === 6 ? 0.5 : 0
  );
  return head + Math.max(face, onTop + lift + (sitsOnAfro(hair, hat) ? AFRO_RISE : 0));
};

/** How far a face of this height (as a multiple of a round one) raises the top of the head, per scale. */
const faceLift = (h: number) => Math.max(0, 0.63 * (h - 1));
/** Hats a bun would poke through, so it's tucked under them: the cap, beanie, sun hat and beret. */
const hidesBun = (hat: number) => hat === 1 || hat === 2 || hat === 4 || hat === 5;
/** Hats an afro squashes under, puffing out at the sides instead of above: the cap, beanie, sun hat and beret. */
const flattensAfro = (hat: number) => hat === 1 || hat === 2 || hat === 4 || hat === 5;
/** Hats a mohawk's crest doesn't show through: all but the bow and the headband. */
const hidesCrest = (hat: number) => hat !== 0 && hat !== 6 && hat !== 7;
/** Hats that cover the top of the head, so a fringe doesn't show under them. */
const coversFringe = (hat: number) => hat === 1 || hat === 2 || hat === 4;

const CAP_HAIR_TOP = 0.2;

const OVERALL_BRACES = [
  [-0.56, 0.7, -0.5, 0.56],
  [0.56, 0.7, 0.5, 0.56],
  [-Math.PI + 0.68, 0.7, -Math.PI + 0.16, 0.36],
  [Math.PI - 0.68, 0.7, Math.PI - 0.16, 0.36],
] as const;

const BACKPACK_STRAPS = [
  [-0.62, 0.69, -0.56, 0.38],
  [0.62, 0.69, 0.56, 0.38],
  [-0.56, 0.38, -2.05, 0.36],
  [0.56, 0.38, 2.05, 0.36],
] as const;

type Stride = { stridePhase: number; strideAmp: number };

const SUN_HAT = { brimY: 0.6, brimRadius: 1.7, bandY: 0.86, topY: 1.22, baseRadius: 0.86, topRadius: 0.68 };
const HEADPHONES = { across: 1.04, top: 1.03, ears: -0.12, cup: 1.02 };
const OVER_AFRO = { across: 1.3, top: 1.55, ears: -0.12, cup: 1.26 };

const ON_BENCH_ABOVE_SEAT = 0.1;
const ON_GROUND_SINK = 0.08;
const SWIM_SINK = 0.4;
const LAP_HEIGHT = 0.24;
const SHOULDER_HEIGHT = 0.6;
const ARM_RAISED = 0.85;

export const sitRise = (seatHeight: number | undefined, look: Look) =>
  seatHeight === undefined
    ? 0
    : (seatHeight > 0 ? seatHeight - ON_BENCH_ABOVE_SEAT : -ON_GROUND_SINK) + LAP_HEIGHT * (1 - bodyScale(look).height);

export const swimSink = (look: Look) => SWIM_SINK * bodyScale(look).height;

export const palmHeight = (look: Look) => SHOULDER_HEIGHT * bodyScale(look).height + ARM_RAISED;

type Figure = {
  foot: ScreenPoint;
  /** Pixels per world unit, across and up. */
  s: number;
  up: number;
  bob: number;
};

/** Where someone stands on screen and how big they are. */
export const figureFor = (cam: Camera, pose: Pose & Stride): Figure => {
  const foot = cam.project([pose.x, 0, pose.z]);
  const top = cam.project([pose.x, 1, pose.z]);
  return { foot, s: foot.scale, up: foot.y - top.y, bob: strideBob(pose) };
};

/** The screen box a tap on someone lands in. */
export const hitBox = (f: Figure, look?: Look) => ({
  // Up to the top of a bun, pigtails or a hat, for their height.
  top: f.foot.y - ((look ? bodyScale(look).height : 1) + 0.45 + f.bob) * f.up - (look?.hat === 8 ? 0.45 : 0.35) * f.s,
  // Wider for a sun hat, whose brim reaches past the shoulders.
  left: f.foot.x - (look?.hat === 4 ? 0.72 : 0.5) * f.s,
  right: f.foot.x + (look?.hat === 4 ? 0.72 : 0.5) * f.s,
  bottom: f.foot.y + 0.1 * f.s,
});

const quad = (pts: { x: number; y: number }[], fill: string, key: string, radius = 0) => Platform.OS === "android" ? flatQuad(pts, fill, key, radius) : (
  <View
    key={key}
    pointerEvents="none"
    style={[styles.quad, { backgroundColor: fill, borderRadius: radius, transform: quadTransform(pts) }]}
  />
);

const stretch = (v: Point, by: number) => {
  const length = Math.hypot(v.x, v.y);
  const k = length > 0.01 ? Math.max(0.01, length + by) / length : 1;
  return { x: v.x * k, y: v.y * k };
};

const discCorners = ({ centre, a, b }: Disc, grow: number, times = 1) => {
  const ga = stretch(a, grow);
  const gb = stretch(b, grow);
  const A = { x: ga.x * times, y: ga.y * times };
  const B = { x: gb.x * times, y: gb.y * times };
  return [
    { x: centre.x - A.x - B.x, y: centre.y - A.y - B.y },
    { x: centre.x + A.x - B.x, y: centre.y + A.y - B.y },
    { x: centre.x + A.x + B.x, y: centre.y + A.y + B.y },
    { x: centre.x - A.x + B.x, y: centre.y - A.y + B.y },
  ];
};

const disc = (d: Disc, fill: string, key: string, grow: number) => quad(discCorners(d, grow), fill, key, QUAD_SIZE / 2);

const CRESCENT_REACH = [3, 40] as const;

const crescent = (centre: Point, across: Point, up: Point, cover: number, fill: string, key: string, grow: number) => {
  const a = stretch(across, -grow);
  const u = stretch(up, -grow);
  const reach = Math.max(CRESCENT_REACH[0], cover / Math.max(0.01, Math.hypot(u.x, u.y)));
  if (reach > CRESCENT_REACH[1]) return null;
  const k = { x: u.x * reach, y: u.y * reach };
  return (
    <View
      key={key}
      pointerEvents="none"
      style={[
        styles.quad,
        {
          borderRadius: QUAD_SIZE / 2,
          borderTopWidth: (QUAD_SIZE / 2) * (1 - 1 / reach),
          borderColor: fill,
          transform: quadTransform([
            { x: centre.x - a.x + k.x, y: centre.y - a.y + k.y },
            { x: centre.x + a.x + k.x, y: centre.y + a.y + k.y },
            { x: centre.x + a.x - k.x, y: centre.y + a.y - k.y },
            { x: centre.x - a.x - k.x, y: centre.y - a.y - k.y },
          ]),
        },
      ]}
    />
  );
};

const HALF_PLANE = 2000;

const halfPlane = (key: string, from: Point, to: Point, keep: Point, children: ReactNode, grow = 0) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const flip = dx * (keep.y - from.y) - dy * (keep.x - from.x) > 0;
  const turn = Math.atan2(dy, dx) + (flip ? Math.PI : 0);
  const at = { x: from.x - Math.sin(turn) * grow, y: from.y + Math.cos(turn) * grow };
  return (
    <View key={key} pointerEvents="none" style={[styles.abs, { left: at.x, top: at.y, width: 0, height: 0, transform: [{ rotate: `${turn}rad` }] }]}>
      <View style={[styles.abs, { left: -HALF_PLANE, top: -HALF_PLANE, width: HALF_PLANE * 2, height: HALF_PLANE, overflow: "hidden" }]}>
        <View style={[styles.abs, { left: HALF_PLANE, top: HALF_PLANE, width: 0, height: 0, transform: [{ rotate: `${-turn}rad` }] }]}>
          <View style={[styles.abs, { left: -at.x, top: -at.y, width: 0, height: 0 }]}>{children}</View>
        </View>
      </View>
    </View>
  );
};

const capsule = (a: { x: number; y: number }, b: { x: number; y: number }, width: number, fill: string, key: string) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) + width;
  return (
    <View
      key={key}
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left: (a.x + b.x) / 2 - length / 2,
          top: (a.y + b.y) / 2 - width / 2,
          width: length,
          height: width,
          borderRadius: width / 2,
          backgroundColor: fill,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        },
      ]}
    />
  );
};

/** What someone is doing right now: an emote or a mutual action, and how far through (0 to 1). */
export type Doing =
  | { kind: "emote"; id: EmoteId; p: number }
  | {
      kind: "mutual";
      id: MutualKind;
      p: number;
      toward: -1 | 1;
      /** Where the two raised palms meet, on screen. */
      reach?: { x: number; y: number };
    }
  | null;

type Eyes = "dot" | "happy" | "closed" | "big" | "up";
type Mouth = "none" | "smile" | "open" | "o" | "frown" | "flat" | "cat" | "tongue";
type Expression = { eyes: Eyes; mouth: Mouth; brows?: "angry" | "sad"; tears?: boolean; blush?: number };

const EXPRESSIONS: Record<EmoteId, Expression> = {
  wave: { eyes: "happy", mouth: "smile" },
  smile: { eyes: "happy", mouth: "smile", blush: 1.3 },
  laugh: { eyes: "happy", mouth: "open" },
  cheer: { eyes: "happy", mouth: "open" },
  love: { eyes: "happy", mouth: "smile", blush: 1.9 },
  surprised: { eyes: "big", mouth: "o" },
  think: { eyes: "up", mouth: "flat" },
  pout: { eyes: "dot", mouth: "frown", blush: 1.5 },
  cry: { eyes: "closed", mouth: "frown", brows: "sad", tears: true },
  angry: { eyes: "dot", mouth: "frown", brows: "angry" },
  sleepy: { eyes: "closed", mouth: "o" },
  pray: { eyes: "closed", mouth: "smile" },
};

const IDLE_MOUTHS: Mouth[] = ["none", "smile", "open", "o", "flat", "cat", "tongue"];
const closedMouth = (idle: Mouth): Mouth => (idle === "open" || idle === "tongue" || idle === "o" ? "smile" : idle);

const settle = (k: number) => {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
};

/** An ease up and back down over an emote, so it starts and ends at rest. */
const swell = (p: number) => Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);

/**
 * How far into a mutual action's reach (0 at rest, 1 touching): it gets
 * there a third of the way in, holds while the palms are together, and
 * eases back. The garden uses the same curve to step people in and out.
 */
export const touchK = (p: number) => Math.min(1, swell(p) * 1.25);

/** Where the hands go and how the body moves for what someone is doing. */
const motion = (doing: Doing, t: number) => {
  const hands: { l?: [number, number]; r?: [number, number]; front?: boolean; over?: boolean } = {};
  let lift = 0;
  let shake = 0;
  let sink = 0;
  let lean = 0;
  let nod = 0;
  let palms = 0;
  if (doing?.kind === "mutual") {
    // The garden steps them in and out; here the near hand rises (and, with
    // `reach`, meets the other's at the contact point), with a little hop at the slap.
    const k = touchK(doing.p);
    const hit = k >= 1;
    const hand: [number, number] = [doing.toward * (0.3 + 0.2 * k), 0.6 + 0.6 * k];
    if (doing.toward > 0) hands.r = hand;
    else hands.l = hand;
    lift = hit ? 0.05 : 0;
    return { hands, lift, shake, sink, lean, nod, palms };
  }
  if (doing?.kind !== "emote") return { hands, lift, shake, sink, lean, nod, palms };
  const k = swell(doing.p);
  const wob = Math.sin(t * 16);
  const hold = settle(doing.p / 0.14) * settle((1 - doing.p) / 0.14);
  const reach = (side: -1 | 1, x: number, y: number): [number, number] => [
    side * 0.4 + (x - side * 0.4) * hold,
    0.34 + (y - 0.34) * hold,
  ];
  switch (doing.id) {
    case "wave":
      hands.r = reach(1, 0.48 + Math.sin(t * 11) * 0.14, 1.08);
      lean = Math.sin(t * 5.5) * 0.03 * hold;
      lift = doing.p < 0.12 ? Math.sin((doing.p / 0.12) * Math.PI) * 0.1 : 0;
      break;
    case "smile":
      lift = Math.abs(Math.sin(t * 6)) * 0.05 * k;
      break;
    case "laugh":
      hands.l = reach(-1, -0.18, 0.42);
      hands.r = reach(1, 0.18, 0.42);
      hands.front = true;
      shake = Math.sin(t * 13) * 0.035 * hold;
      lift = Math.abs(Math.sin(t * 13)) * 0.09 * hold;
      lean = Math.sin(t * 3) * 0.04 * hold;
      nod = -0.5 * hold;
      break;
    case "cheer":
      hands.l = reach(-1, -0.44, 1.18 + wob * 0.06);
      hands.r = reach(1, 0.44, 1.18 - wob * 0.06);
      lift = Math.abs(Math.sin(t * 7)) * 0.3 * hold;
      nod = -0.25 * hold;
      break;
    case "love":
      hands.l = [-0.1, 0.55];
      hands.r = [0.1, 0.55];
      hands.front = true;
      shake = Math.sin(t * 4) * 0.04 * k;
      break;
    case "surprised":
      hands.l = [-0.5, 0.95];
      hands.r = [0.5, 0.95];
      lift = doing.p < 0.2 ? Math.sin((doing.p / 0.2) * Math.PI) * 0.2 : 0;
      break;
    case "think":
      hands.r = [0.12, 0.78];
      hands.front = true;
      shake = Math.sin(t * 2) * 0.02;
      break;
    case "pout":
      hands.l = [0.08, 0.48];
      hands.r = [-0.08, 0.5];
      hands.front = true;
      break;
    case "cry":
      hands.l = reach(-1, -0.17, 0.8);
      hands.r = reach(1, 0.17, 0.8);
      hands.front = true;
      hands.over = hold > 0.5;
      sink = 0.09 * hold;
      nod = hold;
      shake = Math.sin(t * 18) * 0.018 * hold;
      break;
    case "angry":
      hands.l = reach(-1, -0.5, 0.26);
      hands.r = reach(1, 0.5, 0.26);
      lift = Math.max(0, Math.sin(t * 9)) * 0.07 * hold;
      shake = Math.sin(t * 24) * 0.05 * hold;
      nod = 0.35 * hold;
      break;
    case "sleepy":
      sink = 0.06 * k + Math.sin(t * 2) * 0.02;
      lean = 0.08 * k;
      break;
    case "pray": {
      const fold = settle(doing.p / 0.2) * settle((1 - doing.p) / 0.16);
      const breath = Math.sin(t * 1.8) * 0.01 * fold;
      hands.l = [-0.4 + 0.33 * fold, 0.34 + 0.12 * fold + breath];
      hands.r = [0.4 - 0.33 * fold, 0.34 + 0.12 * fold + breath];
      hands.front = true;
      palms = fold;
      nod = fold;
      sink = 0.03 * fold - breath;
      break;
    }
  }
  return { hands, lift, shake, sink, lean, nod, palms };
};

/**
 * A chibi avatar in style C: big round head, hair, dot eyes and blush, a
 * little shirt and stubby arms, with ink outlines, plus any hat and
 * accessory. Turned by its heading; bobs while walking; plays emotes with a
 * face and a body animation.
 */
const AvatarView = ({
  figure,
  pose,
  look,
  t,
  seed,
  stride,
  sit,
  doing = null,
  shadow = true,
  swim = false,
  talk,
}: {
  figure: Figure;
  pose: Pose;
  look: Look;
  t: number;
  seed: number;
  stride?: Stride;
  sit?: number;
  doing?: Doing;
  shadow?: boolean;
  swim?: boolean;
  talk?: boolean;
}) => {
  const { foot, s, up } = figure;
  const move = motion(doing, t);
  if (swim && !move.hands.l && !move.hands.r) {
    const reach = pose.walking ? 1 : 0.3;
    for (const e of [-1, 1] as const) {
      const phase = t * 7 + seed + (e > 0 ? Math.PI : 0);
      const hand: [number, number] = [e * (0.36 + 0.06 * Math.cos(phase)), 0.62 + 0.24 * reach * Math.sin(phase)];
      if (e < 0) move.hands.l = hand;
      else move.hands.r = hand;
    }
    move.hands.front = true;
  }
  const bob = figure.bob + move.lift - move.sink + sitRise(sit, look) - (swim ? swimSink(look) : 0);
  const ink = Math.max(1.2, 0.035 * s);
  const dx = move.shake + move.lean;
  // Height and build stretch the body; the head stays the same size.
  const body = bodyScale(look);
  const at = (x: number, y: number) => ({
    x: foot.x + (x * body.width + dx * Math.min(1, y)) * s,
    y: foot.y - (y * body.height + bob) * up,
  });
  const skin = people.skins[look.skin] ?? people.skins[0];
  const hair = people.hairColours[look.hairColour] ?? people.hairColours[0];
  const shirt = people.shirts[look.shirt] ?? people.shirts[0];
  // The favourite colour: their shoes, and some hats and extras.
  const favourite = lookPart(look, "favourite");
  const fav = (otherwise: string) => (favourite > 0 ? people.favourites[favourite] : otherwise);
  const facing = Math.cos(pose.heading);
  const side = Math.sin(pose.heading);
  const ph = t * 9 + seed;
  const swing = stride ? strideSwing(stride) : pose.walking ? Math.sin(ph) * 0.07 : 0;
  const head = at(0, 1.0 - move.nod * 0.07);
  const r = 0.42 * s;
  const inner = r - ink;
  // The face shape: the head's width, height and corner rounding.
  const shape = FACE_SHAPES[lookPart(look, "face")] ?? FACE_SHAPES[0];
  const hw = r * 2 * shape.w;
  const hh = r * 2 * shape.h;
  const iw = hw - ink * 2;
  const ih = hh - ink * 2;
  const icx = iw / 2;
  const icy = ih / 2;
  // What sits on top of the head rises with a taller face.
  const lift = faceLift(shape.h) * s;
  const hat = lookPart(look, "hat");
  // A bow, party hat or crown sits on top of an afro, above the head.
  const onAfro = sitsOnAfro(look.hair, hat) ? AFRO_RISE * s : 0;
  const capped = hat === 1;
  const innerLeft = head.x - hw / 2 + ink;
  const innerTop = head.y - hh / 2 - (hh - r * 2) * 0.25 + ink;
  const headView = (x: number, y: number): HeadView => ({ cx: x + hw / 2, cy: y + hh / 2, rx: hw / 2, ry: hh / 2, facing, side });
  const headLeft = head.x - hw / 2;
  const headTopY = head.y - hh / 2 - (hh - r * 2) * 0.25;
  const onScreen = headView(headLeft, headTopY);
  const capColour = people.hats.cap;
  const innerHeadView = headView(-ink, -ink);
  const crownLayer = (cap: ReturnType<typeof capShape>, fill: string, grow: number, key: string) => {
    const cover = <View key={`${key}Cover`} style={[styles.abs, { left: -iw, top: -ih, width: iw * 3, height: ih * 3, backgroundColor: fill }]} />;
    const above = (child: ReactNode) => (cap.edge ? halfPlane(`${key}Top`, cap.edge[0], cap.edge[1], cap.top, child, grow) : child);
    if (cap.rimIsCrown) return [disc(cap.rim, fill, `${key}Rim`, grow), above(cover)];
    return [crescent(cap.rim.centre, cap.rimAcross, cap.rimUp, Math.max(iw, ih) * 1.2, fill, `${key}Rim`, grow) ?? above(cover)];
  };
  const crownShell = (key: string, children: ReactNode) => (
    <View
      key={key}
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left: innerLeft,
          top: innerTop,
          width: iw,
          height: ih,
          borderTopLeftRadius: corner(shape.top, iw),
          borderTopRightRadius: corner(shape.top, iw),
          borderBottomLeftRadius: corner(shape.bottom, iw),
          borderBottomRightRadius: corner(shape.bottom, iw),
          overflow: "hidden",
        },
      ]}
    >
      {children}
    </View>
  );
  const crown = () => {
    const cap = capShape(innerHeadView);
    return crownShell(
      "capCrown",
      <>
        {crownLayer(cap, garden.ink, ink * 0.9, "capInk")}
        {crownLayer(cap, capColour, 0, "cap")}
      </>
    );
  };
  const beanieCrown = () => {
    const cuff = capShape(innerHeadView, BEANIE_CUFF);
    const bodyCap = capShape(innerHeadView, BEANIE_BODY);
    return crownShell(
      "beanieCrown",
      <>
        {crownLayer(cuff, garden.ink, ink * 0.9, "beanieInk")}
        {crownLayer(cuff, shade(people.hats.beanie, -0.15), 0, "beanieCuff")}
        {crownLayer(bodyCap, shade(people.hats.beanie, -0.28), ink * 0.5, "beanieSeam")}
        {crownLayer(bodyCap, people.hats.beanie, 0, "beanieBody")}
        <View style={[styles.abs, { left: icx + inner * 0.05, top: icy - inner * 0.85, width: inner * 0.55, height: inner * 0.28, borderRadius: inner, backgroundColor: shade(people.hats.beanie, 0.18) }]} />
      </>
    );
  };
  const headbandCrown = () => {
    const ring = ringOnHead(innerHeadView, { y: 0.48, tilt: 0.22, radius: 1.0 }, 24);
    const width = 0.08 * s;
    const colour = fav(people.hats.headband);
    const segs: ReactNode[] = [];
    for (const [pass, fill, grow] of [["Ink", garden.ink, ink * 1.4], ["", colour, 0]] as const) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (!a.front && !b.front) continue;
        segs.push(capsule(a.at, b.at, width + grow, fill, `headband${pass}${i}`));
      }
    }
    return crownShell("headbandCrown", segs);
  };
  const capOnScreen = capped ? capShape(onScreen) : null;
  const peak = () => {
    if (!capOnScreen) return;
    const { centre, a, b } = capOnScreen.peak;
    const fill = shade(capColour, -0.12);
    parts.push(
      halfPlane("peak", { x: centre.x - a.x, y: centre.y - a.y }, { x: centre.x + a.x, y: centre.y + a.y }, { x: centre.x + b.x, y: centre.y + b.y }, [
        disc(capOnScreen.peak, garden.ink, "peakInk", ink),
        disc(capOnScreen.peak, fill, "peakFill", 0),
      ])
    );
  };
  const capPeakInFront = capOnScreen !== null && capOnScreen.peakInFront;
  const bodyView: BodyView = {
    footX: foot.x,
    footY: foot.y,
    s,
    up,
    bob,
    dx,
    width: body.width,
    height: body.height,
    facing,
    side,
  };
  const flowerRing = hat === 3 ? ringOnHead(onScreen, { y: 0.56, tilt: 0.28, radius: look.hair === 10 ? 1.2 : 1.04 }, 10) : null;
  const flowerCrown = (layer: "back" | "front") => {
    if (!flowerRing) return;
    const list = flowerRing.filter((f) => (f.front ? "front" : "back") === layer).sort((a, b) => a.depth - b.depth);
    for (const f of list) ball(`crown${f.index}`, f.at.x, f.at.y, 0.095 * s, garden.blooms[f.index % garden.blooms.length]);
  };
  const bow = hat === 6 ? bowPose(onScreen, onAfro / onScreen.ry) : null;
  const drawBow = () => {
    if (!bow) return;
    const colour = fav(people.hats.bow);
    for (const loop of bow.loops) {
      parts.push(
        <Ellipse
          key={`bowLoop${loop.side}`}
          cx={loop.at.x}
          cy={loop.at.y}
          rx={0.105 * s * loop.scale}
          ry={0.08 * s}
          fill={colour}
          ink={ink}
          inkColour={garden.ink}
        />
      );
    }
    ball("bowKnot", bow.knot.at.x, bow.knot.at.y, 0.045 * s, shade(colour, -0.15));
  };
  const level = (y: number, radius: number) => {
    const c = projectOnHead(onScreen, [0, y, 0]);
    return { cx: c.x, cy: c.y, rx: onScreen.rx * radius, ry: onScreen.ry * radius * Math.sin(HAT_PITCH) };
  };
  const brimHalf = (key: string, fill: string, half: "back" | "front") => {
    const brim = level(SUN_HAT.brimY, SUN_HAT.brimRadius);
    const reach = brim.rx + ink * 2;
    const box = { left: brim.cx - reach, top: half === "back" ? brim.cy - reach : brim.cy, width: reach * 2, height: reach };
    parts.push(
      <View key={key} pointerEvents="none" style={[styles.abs, box, { overflow: "hidden" }]}>
        <Ellipse cx={brim.cx - box.left} cy={brim.cy - box.top} rx={brim.rx} ry={brim.ry} fill={fill} ink={ink} inkColour={garden.ink} />
      </View>
    );
  };
  const headphones = (layer: "back" | "front") => {
    const fit = phonesOverAfro ? OVER_AFRO : HEADPHONES;
    const band = bandOverHead(onScreen, fit);
    const width = 0.055 * s;
    for (const [pass, colour, grow] of [["Ink", garden.ink, ink * 2], ["", people.headphones, 0]] as const) {
      band.forEach((point, i) => {
        const next = band[i + 1];
        if (!next || (point.front && next.front ? "front" : "back") !== layer) return;
        parts.push(capsule(point.at, next.at, width + grow, colour, `band${pass}${layer}${i}`));
      });
    }
    for (const e of [-1, 1] as const) {
      const cup = earCup(onScreen, e, fit.cup, fit.ears);
      if ((cup.near ? "front" : "back") !== layer) continue;
      const rx = (0.07 + 0.07 * cup.facing) * s;
      parts.push(<Ellipse key={`cup${e}`} cx={cup.at.x} cy={cup.at.y} rx={rx} ry={0.15 * s} fill={fav(people.headphones)} ink={ink} inkColour={garden.ink} />);
      if (cup.near && cup.facing > 0.5) parts.push(<Ellipse key={`cupPad${e}`} cx={cup.at.x} cy={cup.at.y} rx={rx * 0.55} ry={0.09 * s} fill={shade(fav(people.headphones), -0.18)} />);
    }
  };
  const corner = (k: number, size: number) => (Math.min(size === hw ? hw : iw, size === hw ? hh : ih) / 2) * k;
  const idleMouth = IDLE_MOUTHS[lookPart(look, "mouth")] ?? "none";
  const expression: Expression =
    doing?.kind === "emote"
      ? EXPRESSIONS[doing.id]
      : doing?.kind === "mutual"
        ? { eyes: "happy", mouth: "open" }
        : { eyes: "dot", mouth: talk === undefined ? "none" : talk ? "open" : closedMouth(idleMouth) };
  const parts = [];
  const ball = (key: string, x: number, y: number, rad: number, fill: string) =>
    parts.push(<Ellipse key={key} cx={x} cy={y} rx={rad} ry={rad} fill={fill} ink={ink * 0.8} inkColour={garden.ink} ramp />);

  if (shadow && !swim && !(sit !== undefined && sit > 0)) {
    parts.push(
      <Ellipse key="shadow" cx={foot.x - 0.08 * s} cy={foot.y - 0.04 * s} rx={0.4 * s} ry={0.2 * s} fill={garden.shadow} />
    );
  }
  const seated = sit !== undefined;
  const feet = () => {
    for (const e of [-1, 1]) {
      const p = !seated
        ? { x: foot.x + 0.12 * e * s, y: foot.y - (0.08 + move.lift) * up }
        : sit > 0
          ? { x: foot.x + (0.13 * e + side * 0.3) * s, y: foot.y - Math.max(0.08, sit - 0.12) * up + facing * 0.17 * s }
          : { x: foot.x + (0.18 * e + side * 0.34) * s, y: foot.y - 0.06 * up + facing * 0.2 * s };
      parts.push(<Ellipse key={`foot${e}`} cx={p.x} cy={p.y} rx={0.1 * s} ry={0.09 * s} fill={people.favourites[favourite]} ink={ink * 0.8} inkColour={garden.ink} />);
    }
  };
  const feetInFront = seated && facing >= 0;
  if (!feetInFront && !swim) feet();
  const chin = Math.min(0.7, ((foot.y - (head.y + hh / 2 - (hh - r * 2) * 0.25)) / up - bob) / body.height);
  const accessory = look.accessory ?? 0;
  const pack = accessory === 2 ? backpackPose(bodyView) : null;
  const drawBackpack = (key: string) => {
    if (!pack) return;
    parts.push(
      <View
        key={key}
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: pack.left,
            top: pack.top,
            width: pack.width,
            height: pack.height,
            borderRadius: Math.min(0.14 * s, pack.width * 0.45),
            backgroundColor: people.backpack,
            borderWidth: ink,
            borderColor: garden.ink,
          },
        ]}
      />
    );
    if (pack.pocket) {
      parts.push(
        <View
          key={`${key}Pocket`}
          pointerEvents="none"
          style={[
            styles.abs,
            {
              left: pack.pocket.left,
              top: pack.pocket.top,
              width: pack.pocket.width,
              height: pack.pocket.height,
              borderRadius: Math.min(0.08 * s, pack.pocket.width * 0.4),
              backgroundColor: shade(people.backpack, -0.12),
              borderWidth: ink * 0.7,
              borderColor: garden.ink,
            },
          ]}
        />
      );
    }
  };
  const scarf = accessory === 3 ? scarfPose(bodyView, chin, swing) : null;
  const drawScarfTail = (key: string) => {
    if (!scarf) return;
    parts.push(capsule(scarf.tailStart, scarf.tailEnd, 0.1 * s + ink * 2, garden.ink, `${key}Ink`));
    parts.push(capsule(scarf.tailStart, scarf.tailEnd, 0.1 * s, shade(people.scarf, -0.1), key));
  };
  const braid = look.hair === 14 ? braidPoints(onScreen) : null;
  const drawBraid = () => {
    if (!braid) return;
    for (const node of braid.nodes) {
      ball(node.tie ? "braidTie" : `braid${node.index}`, node.at.x, node.at.y, node.scale * s, node.tie ? fav(people.scarf) : hair);
    }
  };
  if (pack && !pack.over) drawBackpack("packBehind");
  if (scarf && !scarf.tailInFront) drawScarfTail("scarfTailBehind");
  if (braid && !braid.front) drawBraid();
  const arm = (e: number) => {
    const hand = e < 0 ? move.hands.l : move.hands.r;
    const shoulder = at(0.26 * e, 0.6);
    // A high five's raised hand goes all the way to the shared contact point.
    if (doing?.kind === "mutual" && doing.reach && e === doing.toward && hand) {
      const k = touchK(doing.p);
      const rest = at(hand[0], hand[1]);
      return [shoulder, { x: rest.x + (doing.reach.x - rest.x) * k, y: rest.y + (doing.reach.y - rest.y) * k }] as const;
    }
    return [shoulder, hand ? at(hand[0], hand[1]) : at(0.4 * e, 0.34 + swing * e)] as const;
  };
  const arms = (layer: "back" | "front" | "over") => {
    for (const e of [-1, 1]) {
      const hand = e < 0 ? move.hands.l : move.hands.r;
      const drawnIn = !hand ? "back" : move.hands.over && facing >= 0 ? "over" : move.hands.front ? "front" : "back";
      if (drawnIn !== layer) continue;
      const [a, b] = arm(e);
      parts.push(capsule(a, b, 0.14 * s + ink * 2, garden.ink, `armInk${e}${layer}`));
      parts.push(capsule(a, b, 0.14 * s, skin, `arm${e}${layer}`));
    }
  };
  const outfit = lookPart(look, "outfit");
  const hood = outfit === 5 ? hoodLayer(facing) : null;
  const hoodFill = shade(shirt, -0.18);
  if (hood === "behind") ball("hood", head.x - side * 0.1 * s, head.y + r * 0.72, r * 0.98, hoodFill);
  if (hood && Math.abs(side) > 0.35) {
    const nape = at(-Math.sign(side) * 0.27, chin + 0.02);
    parts.push(<Ellipse key="hoodCurve" cx={nape.x} cy={nape.y} rx={0.15 * s} ry={0.2 * body.height * up} fill={hoodFill} ink={ink * 0.8} inkColour={garden.ink} ramp />);
  }
  arms("back");
  // Bottoms, unless the outfit has its own (a dress, a skirt, overalls). With
  // them the top stops at the waist.
  const pants = FULL_OUTFITS.includes(outfit) ? 0 : lookPart(look, "pants");
  const hem = pants > 0 ? 0.3 : 0.16;
  const halfWidth = (y: number) => 0.21 + (0.12 * (0.7 - y)) / 0.54;
  const panel = (top: number, bottom: number, topHalf: number, bottomHalf: number, grow: number) => [
    { x: at(-topHalf, top).x - grow, y: at(0, top).y - grow },
    { x: at(topHalf, top).x + grow, y: at(0, top).y - grow },
    { x: at(bottomHalf, bottom).x + grow, y: at(0, bottom).y + grow },
    { x: at(-bottomHalf, bottom).x - grow, y: at(0, bottom).y + grow },
  ];
  // The body: a tapered shirt, ink first.
  const bodyPts = (grow: number) => panel(0.7, hem, 0.21, halfWidth(hem), grow);
  /** One side's shape (e = -1 or 1) from `inner` to `outer` across, at its top and bottom. */
  const sidePanel = (e: number, top: number, bottom: number, [inTop, outTop]: [number, number], [inBottom, outBottom]: [number, number], grow: number) => {
    const [l1, r1] = e > 0 ? [inTop, outTop] : [-outTop, -inTop];
    const [l2, r2] = e > 0 ? [inBottom, outBottom] : [-outBottom, -inBottom];
    return [
      { x: at(l1, top).x - grow, y: at(0, top).y - grow },
      { x: at(r1, top).x + grow, y: at(0, top).y - grow },
      { x: at(r2, bottom).x + grow, y: at(0, bottom).y + grow },
      { x: at(l2, bottom).x - grow, y: at(0, bottom).y + grow },
    ];
  };
  const piece = (key: string, fill: string, top: number, bottom: number, topHalf: number, bottomHalf: number, radius = 12) => {
    parts.push(quad(panel(top, bottom, topHalf, bottomHalf, ink), garden.ink, `${key}Ink`, radius));
    parts.push(quad(panel(top, bottom, topHalf, bottomHalf, 0), fill, key, radius));
  };
  if (outfit === 1) {
    const dress = (grow: number) => panel(0.7, 0.1, 0.21, 0.46, grow);
    parts.push(quad(dress(ink), garden.ink, "bodyInk", 30));
    parts.push(quad(dress(0), shirt, "body", 30));
    parts.push(quad(dress(0).map((p, i) => (i === 0 || i === 3 ? { x: p.x + 0.24 * s, y: p.y } : p)), shade(shirt, 0.12), "bodyLit", 30));
    parts.push(capsule(at(-halfWidth(0.47), 0.47), at(halfWidth(0.47), 0.47), 0.05 * s, shade(shirt, -0.22), "sash"));
  } else {
    parts.push(quad(bodyPts(ink), garden.ink, "bodyInk", 30));
    parts.push(quad(bodyPts(0), shirt, "body", 30));
    parts.push(quad(bodyPts(0).map((p, i) => (i === 0 || i === 3 ? { x: p.x + 0.2 * s, y: p.y } : p)), shade(shirt, 0.12), "bodyLit", 30));
  }
  if (outfit === 2) piece("skirt", shade(shirt, -0.28), 0.4, 0.1, halfWidth(0.4) + 0.01, 0.45, 14);
  if (outfit === 3) {
    piece("dungarees", people.denim, 0.36, 0.14, halfWidth(0.36) + 0.01, 0.34, 10);
    const bibInk = surfaceStrip(bodyView, 0.58, 0.34, [-0.58, 0.58], [-0.56, 0.56], ink);
    const bibFill = surfaceStrip(bodyView, 0.58, 0.34, [-0.58, 0.58], [-0.56, 0.56], 0);
    if (bibInk && bibFill) {
      parts.push(quad(bibInk, garden.ink, "bibInk", 6));
      parts.push(quad(bibFill, people.denim, "bib", 6));
    }
    OVERALL_BRACES.forEach(([t0, y0, t1, y1], i) => {
      const seg = surfaceSegment(bodyView, t0, y0, t1, y1, -0.02);
      if (seg) parts.push(capsule(seg.a, seg.b, 0.05 * s, people.denim, `brace${i}`));
    });
  }
  if (outfit === 4) {
    for (const y of [0.58, 0.44, 0.3]) {
      parts.push(capsule(at(-halfWidth(y) + 0.04, y), at(halfWidth(y) - 0.04, y), 0.055 * s, shade(shirt, -0.3), `stripe${y}`));
    }
  }
  if (outfit === 6) {
    const collarY = chin + 0.01;
    const collarR = bodyHalfWidth(collarY);
    parts.push(capsule(at(-collarR + 0.02, collarY), at(collarR - 0.02, collarY), 0.055 * s + ink * 1.4, garden.ink, "collarBandInk"));
    parts.push(capsule(at(-collarR + 0.02, collarY), at(collarR - 0.02, collarY), 0.055 * s, people.collar, "collarBand"));
    for (const e of [-1, 1] as const) {
      const topSpan: readonly [number, number] = e > 0 ? [0.02, 0.66] : [-0.66, -0.02];
      const botSpan: readonly [number, number] = e > 0 ? [0.08, 0.44] : [-0.44, -0.08];
      const cInk = surfaceStrip(bodyView, chin + 0.03, chin - 0.1, topSpan, botSpan, ink * 0.8);
      const cFill = surfaceStrip(bodyView, chin + 0.03, chin - 0.1, topSpan, botSpan, 0);
      if (cInk && cFill) {
        parts.push(quad(cInk, garden.ink, `collarInk${e}`, 2));
        parts.push(quad(cFill, people.collar, `collar${e}`, 2));
      }
    }
    const buttons = surfaceDots(
      bodyView,
      [
        { theta: 0, y: chin - 0.16, rad: 0.022 },
        { theta: 0, y: chin - 0.28, rad: 0.022 },
      ],
      hem,
      0.1
    );
    for (const b of buttons) {
      parts.push(<Ellipse key={`button${b.index}`} cx={b.at.x} cy={b.at.y} rx={b.rx} ry={b.ry} fill={shade(shirt, -0.35)} />);
    }
  }
  if (outfit === 7) {
    const teeInk = surfaceStrip(bodyView, 0.7, hem, [-0.34, 0.34], [-0.28, 0.28], ink);
    const teeFill = surfaceStrip(bodyView, 0.7, hem, [-0.34, 0.34], [-0.28, 0.28], 0);
    if (teeInk && teeFill) {
      parts.push(quad(teeInk, garden.ink, "teeInk", 4));
      parts.push(quad(teeFill, isLight(shirt) ? people.shades : people.collar, "tee", 4));
    }
    const lapelBot = Math.max(hem + 0.05, Math.min(0.56, chin - 0.06));
    for (const e of [-1, 1] as const) {
      const topSpan: readonly [number, number] = e > 0 ? [0.34, 0.94] : [-0.94, -0.34];
      const botSpan: readonly [number, number] = e > 0 ? [0.31, 0.54] : [-0.54, -0.31];
      const lapel = surfaceStrip(bodyView, 0.71, lapelBot, topSpan, botSpan, 0);
      if (lapel) parts.push(quad(lapel, shade(shirt, -0.15), `lapel${e}`, 2));
    }
  }
  if (outfit === 8) {
    piece("ribbing", shade(shirt, -0.16), hem + 0.07, hem, halfWidth(hem + 0.07) + 0.005, halfWidth(hem) + 0.005, 6);
    const neckY = Math.min(0.69, chin + 0.01);
    const neckR = bodyHalfWidth(neckY) - 0.03;
    parts.push(capsule(at(-neckR, neckY), at(neckR, neckY), 0.05 * s, shade(shirt, -0.16), "neck"));
  }
  if (outfit === 9) {
    const spotFill = isLight(shirt) ? shade(shirt, -0.3) : shade(shirt, 0.5);
    for (const spot of surfaceDots(bodyView, POLKA_DOTS, hem)) {
      parts.push(<Ellipse key={`spot${spot.index}`} cx={spot.at.x} cy={spot.at.y} rx={spot.rx} ry={spot.ry} fill={spotFill} />);
    }
  }
  if (outfit === 10) {
    const plaid = (key: string, a: { x: number; y: number }, b: { x: number; y: number }) => parts.push(capsule(a, b, 0.028 * s, people.plaid, key));
    for (const y of [0.6, 0.45, hem + 0.1]) plaid(`plaidAcross${y}`, at(-halfWidth(y) + 0.03, y), at(halfWidth(y) - 0.03, y));
    PLAID_ANGLES.forEach((angle, i) => {
      const seg = surfaceSegment(bodyView, angle, 0.66, angle, hem + 0.04, 0.18, 0.92);
      if (seg) plaid(`plaidDown${i}`, seg.a, seg.b);
    });
    const fInk = surfaceStrip(bodyView, 0.7, hem, [-0.36, 0.36], [-0.3, 0.3], ink);
    const fFill = surfaceStrip(bodyView, 0.7, hem, [-0.36, 0.36], [-0.3, 0.3], 0);
    if (fInk && fFill) {
      parts.push(quad(fInk, garden.ink, "flannelTeeInk", 4));
      parts.push(quad(fFill, people.shades, "flannelTee", 4));
    }
    const teeNeckY = Math.min(0.69, chin + 0.01);
    const teeNeck = surfaceSegment(bodyView, -0.34, teeNeckY, 0.34, teeNeckY, 0.05, 0.94);
    if (teeNeck) parts.push(capsule(teeNeck.a, teeNeck.b, 0.04 * s, shade(people.shades, 0.25), "teeNeck"));
    const fLapelBot = Math.max(hem + 0.05, Math.min(0.56, chin - 0.06));
    for (const e of [-1, 1] as const) {
      const topSpan: readonly [number, number] = e > 0 ? [0.36, 0.94] : [-0.94, -0.36];
      const botSpan: readonly [number, number] = e > 0 ? [0.33, 0.56] : [-0.56, -0.33];
      const lapel = surfaceStrip(bodyView, 0.71, fLapelBot, topSpan, botSpan, 0);
      if (lapel) parts.push(quad(lapel, shade(shirt, -0.12), `flannelLapel${e}`, 2));
    }
  }
  if (outfit === 11) {
    for (const blob of surfaceDots(bodyView, TIE_DYE_BLOBS, hem)) {
      parts.push(<Ellipse key={`dye${blob.index}`} cx={blob.at.x} cy={blob.at.y} rx={blob.rx} ry={blob.ry} fill={people.tieDye} />);
    }
    const lightFill = shade(shirt, 0.35);
    for (const blob of surfaceDots(bodyView, TIE_DYE_LIGHTS, hem)) {
      parts.push(<Ellipse key={`dyeLight${blob.index}`} cx={blob.at.x} cy={blob.at.y} rx={blob.rx} ry={blob.ry} fill={lightFill} />);
    }
    for (const e of [-1, 1]) parts.push(capsule(at(0.215 * e, 0.66), at(0.2 * e, 0.54), 0.09 * s, skin, `shoulder${e}`));
    const scoopY = Math.min(0.69, chin + 0.02);
    const scoop = surfaceSegment(bodyView, -0.3, scoopY, 0.3, scoopY, 0.1, 0.94);
    if (scoop) parts.push(capsule(scoop.a, scoop.b, 0.07 * s, skin, "scoop"));
  }
  if (pants === 1 || pants === 2) {
    // Trousers or shorts: hips, then a leg each side, outlined as one shape.
    const colour = people.pants[lookPart(look, "pantsColour")] ?? people.pants[0];
    // Sitting, the feet come forward and the legs are out of sight: just the lap.
    const legBottom = seated ? 0.24 : pants === 1 ? 0.11 : 0.19;
    if (pants === 2 && !seated) {
      for (const e of [-1, 1]) {
        parts.push(quad(sidePanel(e, 0.21, 0.11, [0.05, 0.21], [0.06, 0.18], ink), garden.ink, `shinInk${e}`, 6));
        parts.push(quad(sidePanel(e, 0.21, 0.11, [0.05, 0.21], [0.06, 0.18], 0), skin, `shin${e}`, 6));
      }
    }
    parts.push(quad(panel(0.35, 0.24, halfWidth(0.35) + 0.01, halfWidth(0.24) + 0.01, ink), garden.ink, "hipsInk", 8));
    for (const e of [-1, 1]) parts.push(quad(sidePanel(e, 0.26, legBottom, [0.02, 0.3], [0.04, 0.22], ink), garden.ink, `legInk${e}`, 6));
    parts.push(quad(panel(0.35, 0.24, halfWidth(0.35) + 0.01, halfWidth(0.24) + 0.01, 0), colour, "hips", 8));
    for (const e of [-1, 1]) parts.push(quad(sidePanel(e, 0.26, legBottom, [0.02, 0.3], [0.04, 0.22], 0), colour, `leg${e}`, 6));
    parts.push(capsule(at(-halfWidth(0.34), 0.34), at(halfWidth(0.34), 0.34), 0.03 * s, shade(colour, -0.22), "waist"));
  }
  if (pants === 3) {
    const colour = people.pants[lookPart(look, "pantsColour")] ?? people.pants[0];
    piece("skirtBottom", colour, 0.36, 0.12, halfWidth(0.36) + 0.01, 0.44, 14);
    parts.push(capsule(at(-halfWidth(0.35), 0.35), at(halfWidth(0.35), 0.35), 0.03 * s, shade(colour, -0.22), "waist"));
  }
  if (hood) {
    const hemTop = Math.max(chin, 0.36);
    if (pants > 0) piece("hoodieHem", shirt, hemTop, 0.27, halfWidth(hemTop), halfWidth(0.27) + 0.02, 10);
    if (hood === "behind") {
      const pocketBottom = pants > 0 ? 0.29 : hem + 0.03;
      piece("pocket", shade(shirt, -0.14), pocketBottom + 0.09, pocketBottom, halfWidth(pocketBottom + 0.09) - 0.05, halfWidth(pocketBottom) - 0.04, 8);
      parts.push(capsule(at(-0.14, chin), at(0.14, chin), 0.05 * s + ink * 2, garden.ink, "hoodRimInk"));
      parts.push(capsule(at(-0.14, chin), at(0.14, chin), 0.05 * s, hoodFill, "hoodRim"));
      for (const e of [-1, 1]) parts.push(capsule(at(0.05 * e, chin - 0.01), at(0.06 * e, chin - 0.13), 0.03 * s, people.drawstring, `string${e}`));
    }
  }
  if (pack) {
    BACKPACK_STRAPS.forEach(([t0, y0, t1, y1], i) => {
      const seg = surfaceSegment(bodyView, t0, y0, t1, y1, -0.02);
      if (seg) parts.push(capsule(seg.a, seg.b, 0.05 * s, people.backpackStrap, `strap${i}`));
    });
    if (pack.over) drawBackpack("packFront");
  }
  if (scarf) {
    parts.push(capsule(scarf.wrapLeft, scarf.wrapRight, 0.13 * s + ink * 2, garden.ink, "scarfInk"));
    parts.push(capsule(scarf.wrapLeft, scarf.wrapRight, 0.13 * s, people.scarf, "scarf"));
    if (scarf.tailInFront) drawScarfTail("scarfTail");
  }
  if (accessory === 4) {
    const tie = bowTiePose(bodyView, chin);
    if (tie.visible) {
      const colour = fav(people.scarf);
      for (const wing of tie.wings) {
        if (!wing.visible) continue;
        const wInk = surfaceStrip(bodyView, tie.yTop + 0.01, tie.yBot - 0.01, wing.span, wing.span, ink * 0.8, 0.99);
        const wFill = surfaceStrip(bodyView, tie.yTop, tie.yBot, wing.span, wing.span, 0, 0.99);
        if (wInk && wFill) {
          parts.push(quad(wInk, garden.ink, `tieInk${wing.side}`, 3));
          parts.push(quad(wFill, colour, `tie${wing.side}`, 3));
        }
      }
      ball("knot", tie.knot.x, tie.knot.y, 0.04 * s, shade(colour, -0.15));
    }
  }
  if (accessory === 5) {
    const neck = necklacePose(bodyView, chin);
    for (const p of neck.pearls) {
      parts.push(<Ellipse key={`pearl${p.index}`} cx={p.at.x} cy={p.at.y} rx={0.024 * s} ry={0.024 * s} fill={people.pearl} ink={ink * 0.4} inkColour={garden.ink} />);
    }
    if (neck.pendant) ball("pendant", neck.pendant.x, neck.pendant.y, 0.04 * s, fav(garden.blooms[0]));
  }
  if (feetInFront) feet();
  arms("front");

  const bun = look.hair === 1 && !hidesBun(hat) ? headPoint(onScreen, [0, 1.02, -0.36]) : null;
  if (bun && !bun.front) ball("bun", bun.at.x, bun.at.y, 0.17 * s, hair);
  const pigtails = look.hair === 4 ? ([-1, 1] as const).map((e) => ({ e, ...headPoint(onScreen, [e * 1.08, -0.18, -0.12]) })) : null;
  if (pigtails) {
    for (const p of pigtails) if (!p.front) ball(`tail${p.e}`, p.at.x, p.at.y, 0.15 * s, hair);
  }
  const curtain =
    look.hair === 2
      ? {
          key: "long",
          left: head.x - r * 1.05 - side * 0.1 * s,
          top: head.y - r * (capped ? CAP_HAIR_TOP : 0.4),
          width: r * 2.1,
          height: r * (capped ? 0.95 + CAP_HAIR_TOP : 1.35),
          radius: r * 0.5,
        }
      : look.hair === 9
        ? {
            key: "bob",
            left: head.x - r * 1.08 - side * 0.08 * s,
            top: head.y - r * (capped ? CAP_HAIR_TOP : 0.5),
            width: r * 2.16,
            height: r * (capped ? 0.65 + CAP_HAIR_TOP : 1.15),
            radius: r * 0.45,
          }
        : look.hair === 16
          ? {
              key: "mullet",
              left: head.x - side * r * 0.42 - (r * (2.04 - 0.46 * Math.abs(side))) / 2,
              top: head.y - r * 0.2,
              width: r * (2.04 - 0.46 * Math.abs(side)),
              height: r * (1.05 + 0.24 * Math.max(0, -facing)),
              radius: r * 0.45,
            }
          : look.hair === 17
            ? {
                key: "wavy",
                left: head.x - r * 1.08 - side * 0.1 * s,
                top: head.y - (capped ? r * CAP_HAIR_TOP : r * 0.4 + lift),
                width: r * 2.16,
                height: capped ? r * (0.9 + CAP_HAIR_TOP) : r * 1.3 + lift,
                radius: r * 0.5,
              }
            : null;
  if (curtain) {
    parts.push(
      <View
        key={curtain.key}
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: curtain.left,
            top: curtain.top,
            width: curtain.width,
            height: curtain.height,
            borderRadius: curtain.radius,
            backgroundColor: hair,
            borderWidth: ink,
            borderColor: garden.ink,
          },
        ]}
      />
    );
  }
  const wavyEnds = look.hair === 17 ? wavyHemPoints(onScreen, capped) : null;
  if (wavyEnds) {
    for (const w of wavyEnds) if (!w.front) ball(`waveBack${w.index}`, w.at.x, w.at.y, 0.1 * s, hair);
  }
  const pony = look.hair === 7 ? ponytailPose(onScreen, capped, swing) : null;
  const drawPonytail = (layer: string) => {
    if (!pony) return;
    parts.push(capsule(pony.tie, pony.mid, 0.18 * s + ink * 2, garden.ink, `tailInkA${layer}`));
    parts.push(capsule(pony.mid, pony.tip, 0.15 * s + ink * 2, garden.ink, `tailInkB${layer}`));
    parts.push(capsule(pony.tie, pony.mid, 0.18 * s, hair, `tailA${layer}`));
    parts.push(capsule(pony.mid, pony.tip, 0.15 * s, hair, `tailB${layer}`));
    ball(`tie${layer}`, pony.tie.x, pony.tie.y, 0.11 * s, hair);
  };
  if (pony && !pony.front) drawPonytail("Back");
  const afroOver = facing < -0.35 && hat !== 1 && hat !== 2;
  const afro = () =>
    capped
      ? parts.push(<Ellipse key="afro" cx={head.x - side * 0.08 * s} cy={head.y + r * 0.12} rx={r * 1.3} ry={r * 0.78} fill={hair} ink={ink * 0.8} inkColour={garden.ink} ramp />)
      : flattensAfro(hat)
      ? parts.push(<Ellipse key="afro" cx={head.x - side * 0.08 * s} cy={head.y - r * 0.1} rx={r * 1.32} ry={r * 0.9} fill={hair} ink={ink * 0.8} inkColour={garden.ink} ramp />)
      : ball("afro", head.x - side * 0.08 * s, head.y - r * 0.25, r * 1.28, hair);
  const phonesOverAfro = accessory === 6 && look.hair === 10 && !flattensAfro(hat);
  if (phonesOverAfro) headphones("back");
  if (look.hair === 10 && !afroOver) afro();
  const curlsTucked = hat === 1 || hat === 2 || hat === 7;
  const curlsList = look.hair === 3 ? curlPoints(onScreen, curlsTucked) : null;
  if (curlsList) {
    for (const c of curlsList) if (!c.front) parts.push(<Ellipse key={`curlBack${c.index}`} cx={c.at.x} cy={c.at.y} rx={0.13 * s} ry={0.13 * s} fill={hair} ink={ink * 0.7} inkColour={garden.ink} />);
  }
  if (look.hair === 5 && hat === 0) {
    for (const sp of spikePoints(onScreen)) {
      const half = 0.27 * r;
      const tall = Math.max(0.2 * r, sp.length);
      const cx = (sp.base.x + sp.tip.x) / 2;
      const cy = (sp.base.y + sp.tip.y) / 2;
      const spike = (grow: number, fill: string, key: string) =>
        parts.push(
          <View
            key={key}
            pointerEvents="none"
            style={[
              styles.abs,
              {
                left: cx - half - grow,
                top: cy - tall / 2 - grow * 1.4,
                borderLeftWidth: half + grow,
                borderRightWidth: half + grow,
                borderBottomWidth: tall + grow * 1.6,
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
                borderBottomColor: fill,
                transform: [{ rotate: `${sp.angle}rad` }],
              },
            ]}
          />
        );
      spike(ink, garden.ink, `spikeInk${sp.index}`);
      spike(0, hair, `spike${sp.index}`);
    }
  }
  const mohawk = look.hair === 12 && !hidesCrest(hat) ? mohawkPoints(onScreen) : null;
  if (mohawk) {
    for (const m of mohawk) if (!m.front) ball(`crestBack${m.index}`, m.at.x, m.at.y, 0.11 * s, hair);
  }
  const spaceBuns = look.hair === 13 && !coversFringe(hat) ? ([-1, 1] as const).map((e) => ({ e, ...headPoint(onScreen, [e * 0.72, 0.84, -0.14]) })) : null;
  if (spaceBuns) {
    for (const sb of spaceBuns) if (!sb.front) ball(`spaceBunBack${sb.e}`, sb.at.x, sb.at.y, 0.16 * s, hair);
  }
  const earFlower = accessory === 7 ? earFlowerPose(onScreen) : null;
  const drawEarFlower = () => {
    if (!earFlower) return;
    const petalScale = 0.75 + 0.25 * earFlower.facing;
    for (const p of earFlower.petals) ball(`petal${p.index}`, p.at.x, p.at.y, 0.05 * s * petalScale, fav(garden.blooms[0]));
    ball("flowerMiddle", earFlower.centre.x, earFlower.centre.y, 0.04 * s * petalScale, garden.blooms[1]);
  };
  if (earFlower && !earFlower.front) drawEarFlower();
  if (bow && !bow.front) drawBow();
  if (hat === 3) flowerCrown("back");
  if (capped && !capPeakInFront) peak();
  if (hat === 4) {
    brimHalf("brimBack", people.hats.sunHat, "back");
  }
  if (accessory === 6 && !phonesOverAfro) headphones("back");

  const eyeStyle = lookPart(look, "eyes");
  const eyeLift = nudge(look, "eyeY") * 0.022;
  const eyeGap = nudge(look, "eyeGap") * 0.016;
  const eyeScale = 1 + nudge(look, "eyeSize") * 0.09;
  const glasses = lookPart(look, "glasses");
  const spread = eyeStyle === 4 ? 0.19 : 0.15;
  const glassesLens = glasses > 0 ? (LENSES[glasses - 1] ?? LENSES[0]) : null;
  const temples =
    glassesLens !== null
      ? glassesTemples(
          onScreen,
          (0.86 * Math.sin(HAT_PITCH) - ((0.11 - eyeLift) * s) / onScreen.ry) / Math.cos(HAT_PITCH),
          Math.min(0.95, ((spread + eyeGap + glassesLens.w * eyeScale * 0.5) * s) / onScreen.rx)
        )
      : null;
  const drawTemples = (layer: "back" | "front") => {
    if (!temples || !glassesLens) return;
    const colour = glasses === 5 ? people.clearRim : people.glasses;
    const w = glassesLens.rim * s;
    for (const tm of temples) {
      if ((tm.armFront ? "front" : "back") === layer) parts.push(capsule(tm.lens, tm.ear, w, colour, `templeArm${tm.side}${layer}`));
      if ((tm.hookFront ? "front" : "back") === layer) parts.push(capsule(tm.ear, tm.hook, w, colour, `templeHook${tm.side}${layer}`));
    }
  };
  if (temples) drawTemples("back");

  const capDrop = 0.73 + 0.55 * facing;
  const face = [];
  const faceOn = facing > FACE_MIN;
  const iris = people.eyeColours[lookPart(look, "eyeColour")] ?? people.eye;
  const eyeTurn = nudge(look, "eyeTilt") * 0.12;
  const browLift = nudge(look, "browY") * 0.014;
  const browGap = nudge(look, "browGap") * 0.014;
  const browScale = 1 + nudge(look, "browSize") * 0.1;
  const browTurn = nudge(look, "browTilt") * 0.13;
  const mouthLift = nudge(look, "mouthY") * 0.018;
  const mouthScale = 1 + nudge(look, "mouthSize") * 0.1;
  const mouthTurn = nudge(look, "mouthTilt") * 0.12;
  const browPick = lookPart(look, "browColour");
  const browColour = shade(browPick > 0 ? (people.hairColours[browPick - 1] ?? hair) : hair, -0.3);
  const eyeshadow = people.eyeshadow[lookPart(look, "eyeshadow") - 1];
  const lipstick = people.lipstick[lookPart(look, "lipstick") - 1];
  const eyeAt = (e: number) => ({ x: icx + ((spread + eyeGap) * e * facing + 0.39 * side) * s, y: icy + (0.11 - eyeLift) * s });
  // Eyes, brows and the mouth are each drawn in a box round their middle, so
  // a slider turns or grows the part where it is.
  const box = 0.4 * s;
  const c = box / 2;
  const boxed = (key: string, x: number, y: number, turn: number, scale: number, children: ReactNode) =>
    face.push(
      <View key={key} style={[styles.abs, { left: x - c, top: y - c, width: box, height: box, transform: [{ rotate: `${turn}rad` }, { scale }] }]}>
        {children}
      </View>
    );
  for (const e of [-1, 1]) {
    const depth = -0.15 * e * side + 0.39 * facing;
    if (depth < 0.08) continue;
    const { x: ex, y: ey } = eyeAt(e);
    const eye = expression.eyes;
    let shape: ReactNode;
    if (eye === "dot" && eyeStyle === 1) {
      // Round: a white eye with a coloured pupil.
      shape = (
        <View style={[styles.abs, { left: c - 0.07 * s, top: c - 0.08 * s, width: 0.14 * s, height: 0.16 * s, borderRadius: s, backgroundColor: people.eyeShine, borderWidth: 0.02 * s, borderColor: people.eye, alignItems: "center", justifyContent: "center" }]}>
          <View style={{ width: 0.075 * s, height: 0.09 * s, borderRadius: s, backgroundColor: iris }} />
        </View>
      );
    } else if (eye === "dot" && eyeStyle === 2) {
      // Sleepy: a dot under a heavy lid.
      shape = <View style={[styles.abs, { left: c - 0.05 * s, top: c - 0.04 * s, width: 0.1 * s, height: 0.09 * s, borderBottomLeftRadius: s, borderBottomRightRadius: s, backgroundColor: iris, borderTopWidth: 0.025 * s, borderTopColor: people.eye }]} />;
    } else if (eye === "dot" && eyeStyle === 5) {
      // Narrow: a flat oval.
      shape = <View style={[styles.abs, { left: c - 0.065 * s, top: c - 0.025 * s, width: 0.13 * s, height: 0.05 * s, borderRadius: s, backgroundColor: iris }]} />;
    } else if (eye === "dot" && eyeStyle === 7) {
      // Almond: pointed at the outer corner.
      const out = e > 0 ? { borderTopLeftRadius: s, borderBottomLeftRadius: s, borderTopRightRadius: 0.02 * s, borderBottomRightRadius: s } : { borderTopRightRadius: s, borderBottomRightRadius: s, borderTopLeftRadius: 0.02 * s, borderBottomLeftRadius: s };
      shape = (
        <View style={[styles.abs, { left: c - 0.075 * s, top: c - 0.05 * s, width: 0.15 * s, height: 0.1 * s, backgroundColor: iris }, out]}>
          <View style={[styles.abs, { left: 0.07 * s, top: 0.015 * s, width: 0.03 * s, height: 0.03 * s, borderRadius: s, backgroundColor: people.eyeShine }]} />
        </View>
      );
    } else if (eye === "dot" || eye === "up") {
      const lookUp = eye === "up" ? -0.035 * s : 0;
      shape = (
        <>
          <View style={[styles.abs, { left: c - 0.05 * s + (eye === "up" ? 0.02 * s : 0), top: c - 0.07 * s + lookUp, width: 0.1 * s, height: 0.14 * s, borderRadius: s, backgroundColor: iris }]}>
            <View style={[styles.abs, { right: 0.012 * s, top: 0.018 * s, width: 0.035 * s, height: 0.035 * s, borderRadius: s, backgroundColor: people.eyeShine }]} />
            {eyeStyle === 3 ? (
              // Sparkly: a second, smaller shine.
              <View style={[styles.abs, { left: 0.015 * s, bottom: 0.02 * s, width: 0.022 * s, height: 0.022 * s, borderRadius: s, backgroundColor: people.eyeShine }]} />
            ) : null}
          </View>
          {eyeStyle === 6 && eye === "dot"
            ? // Lashes: two flicks at the outer corner.
              ([[0.05, -0.06, -0.7], [0.066, -0.028, -0.3]] as const).map(([dx, dy, turn]) => (
                <View key={`lash${dx}`} style={[styles.abs, { left: c + e * dx * s - 0.025 * s, top: c + dy * s - 0.009 * s, width: 0.05 * s, height: 0.018 * s, borderRadius: s, backgroundColor: people.eye, transform: [{ rotate: `${turn * e}rad` }] }]} />
              ))
            : null}
        </>
      );
    } else if (eye === "happy") {
      shape = (
        <View
          style={[styles.abs, { left: c - 0.06 * s, top: c - 0.05 * s, width: 0.12 * s, height: 0.12 * s, borderRadius: s, borderTopWidth: 0.03 * s, borderLeftWidth: 0.03 * s, borderRightWidth: 0.03 * s, borderBottomWidth: 0, borderColor: people.eye, borderBottomColor: "transparent", borderLeftColor: "transparent", borderRightColor: "transparent" }]}
        />
      );
    } else if (eye === "closed") {
      shape = <View style={[styles.abs, { left: c - 0.055 * s, top: c, width: 0.11 * s, height: 0.028 * s, borderRadius: s, backgroundColor: people.eye }]} />;
    } else {
      shape = (
        <View style={[styles.abs, { left: c - 0.075 * s, top: c - 0.09 * s, width: 0.15 * s, height: 0.17 * s, borderRadius: s, backgroundColor: people.eyeShine, borderWidth: 0.022 * s, borderColor: people.eye, alignItems: "center", justifyContent: "center" }]}>
          <View style={{ width: 0.06 * s, height: 0.07 * s, borderRadius: s, backgroundColor: people.eye }} />
        </View>
      );
    }
    boxed(
      `eye${e}`,
      ex,
      ey,
      eyeTurn * -e,
      eyeScale,
      <>
        {eyeshadow ? (
          <View style={[styles.abs, { left: c - 0.09 * s, top: c - 0.12 * s, width: 0.18 * s, height: 0.1 * s, borderTopLeftRadius: s, borderTopRightRadius: s, borderBottomLeftRadius: 0.03 * s, borderBottomRightRadius: 0.03 * s, backgroundColor: eyeshadow, opacity: 0.75 }]} />
        ) : null}
        {shape}
      </>
    );
    // Brows sit over the eyes and move with them, so the two never collide.
    const bx = ex + browGap * e * facing * s;
    const by = ey - (0.16 + browLift) * s;
    if (expression.brows) {
      const tilt = (expression.brows === "angry" ? 0.45 : -0.4) * -e;
      boxed(`brow${e}`, bx, by, browTurn * -e, browScale, <View style={[styles.abs, { left: c - 0.07 * s, top: c, width: 0.14 * s, height: 0.03 * s, borderRadius: s, backgroundColor: people.eye, transform: [{ rotate: `${tilt}rad` }] }]} />);
    } else {
      const browStyle = lookPart(look, "brows");
      if (browStyle === 1) {
        boxed(`brow${e}`, bx, by, browTurn * -e, browScale, <View style={[styles.abs, { left: c - 0.065 * s, top: c - 0.02 * s, width: 0.13 * s, height: 0.06 * s, borderRadius: s, borderTopWidth: 0.022 * s, borderColor: "transparent", borderTopColor: browColour }]} />);
      } else if (browStyle >= 2) {
        const thick = browStyle === 4 ? 0.045 : 0.026;
        const tilt = browStyle === 3 ? 0.28 * -e : 0;
        boxed(`brow${e}`, bx, by, browTurn * -e, browScale, <View style={[styles.abs, { left: c - 0.07 * s, top: c - 0.01 * s, width: 0.14 * s, height: thick * s, borderRadius: s, backgroundColor: browColour, transform: [{ rotate: `${tilt}rad` }] }]} />);
      }
    }
    if (expression.tears) {
      const drop = ((t * 1.6 + (e > 0 ? 0.5 : 0)) % 1) * 0.18 * s;
      face.push(<View key={`tear${e}`} style={[styles.abs, { left: ex - 0.025 * s, top: ey + 0.05 * s + drop, width: 0.05 * s, height: 0.07 * s, borderRadius: s, backgroundColor: people.tear }]} />);
    }
    if (glasses > 0) {
      const k = eyeScale;
      const lens = LENSES[glasses - 1] ?? LENSES[0];
      const w = lens.w * k * s * (0.32 + 0.68 * Math.max(0, facing));
      const h = lens.h * k * s;
      face.push(
        <View key={`lens${e}`} style={[styles.abs, { left: ex - w / 2, top: ey - h / 2, width: w, height: h, borderRadius: (Math.min(w, h) / 2) * lens.round, borderWidth: lens.rim * s, borderColor: glasses === 5 ? people.clearRim : people.glasses, backgroundColor: glasses === 3 ? people.shades : glasses === 5 ? people.clearLens : undefined }]}>
          {glasses === 3 ? <View style={[styles.abs, { left: w * 0.18, top: h * 0.14, width: w * 0.22, height: h * 0.2, borderRadius: s, backgroundColor: people.eyeShine, opacity: 0.4 }]} /> : null}
        </View>
      );
    }
    const cx = (0.26 * e * facing + 0.33 * side) * s;
    if (-0.26 * e * side + 0.33 * facing > 0.08) {
      // Their blush, made stronger by some emotes.
      const blush = lookPart(look, "blush");
      const k = (expression.blush ?? 1) * (blush === 2 ? 1.3 : 1);
      if (blush === 4) {
        // Lines: three little strokes.
        for (const lx of [-0.045, 0, 0.045]) {
          face.push(<View key={`line${e}${lx}`} style={[styles.abs, { left: icx + cx + lx * s - 0.025 * s, top: icy + 0.24 * s, width: 0.05 * s, height: 0.016 * s, borderRadius: s, backgroundColor: shade(people.cheek, -0.2), transform: [{ rotate: "-1rad" }] }]} />);
        }
      }
      if ((blush > 0 && blush !== 4) || expression.blush) {
        const round = blush === 3;
        const w = (round ? 0.13 : 0.16) * k * s;
        const h = (round ? 0.13 : 0.08) * k * s;
        face.push(
          <View
            key={`cheek${e}`}
            style={[
              styles.abs,
              { left: icx + cx - w / 2, top: icy + (round ? 0.19 : 0.21) * s, width: w, height: h, borderRadius: s, backgroundColor: people.cheek, opacity: blush === 2 ? 1 : round ? 0.7 : 0.85 },
            ]}
          />
        );
      }
      const freckles = lookPart(look, "freckles");
      if (freckles === 1 || freckles === 2) {
        const spots = freckles === 2 ? [[-0.04, 0.17], [0.03, 0.19], [-0.005, 0.225], [0.065, 0.225], [-0.07, 0.21], [0.025, 0.255]] : [[-0.04, 0.17], [0.03, 0.19], [-0.005, 0.225]];
        for (const [fx, fy] of spots) {
          face.push(<View key={`freckle${e}${fx}`} style={[styles.abs, { left: icx + cx + fx * s, top: icy + fy * s, width: 0.022 * s, height: 0.022 * s, borderRadius: s, backgroundColor: people.freckle }]} />);
        }
      }
    }
  }
  if (glasses > 0 && 0.39 * facing - 0.15 * Math.abs(side) >= 0.08) {
    const lens = LENSES[glasses - 1] ?? LENSES[0];
    const lensW = lens.w * eyeScale * s * (0.32 + 0.68 * Math.max(0, facing));
    const leftInner = eyeAt(-1).x + lensW / 2;
    const rightInner = eyeAt(1).x - lensW / 2;
    const w = Math.max(0, rightInner - leftInner) + lens.rim * s * 2;
    face.push(<View key="bridge" style={[styles.abs, { left: (leftInner + rightInner) / 2 - w / 2, top: icy + (0.09 - eyeLift) * s, width: w, height: 0.025 * s, backgroundColor: glasses === 5 ? people.clearRim : people.glasses }]} />);
  }
  if (faceOn && lookPart(look, "freckles") === 3) {
    // Across the nose, from cheek to cheek.
    for (const [fx, fy] of [[-0.14, 0.2], [-0.09, 0.18], [-0.04, 0.2], [0.04, 0.2], [0.09, 0.18], [0.14, 0.2]]) {
      face.push(<View key={`bridgeFreckle${fx}`} style={[styles.abs, { left: icx + (fx * facing + 0.39 * side) * s, top: icy + fy * s, width: 0.022 * s, height: 0.022 * s, borderRadius: s, backgroundColor: people.freckle }]} />);
    }
  }
  // Nose: none, a dot, a button or a little point.
  const noseStyle = lookPart(look, "nose");
  if (faceOn && noseStyle > 0) {
    const nx = icx + 0.41 * side * s;
    const ny = icy + 0.19 * s;
    if (noseStyle === 3) {
      face.push(<View key="nose" style={[styles.abs, { left: nx - 0.035 * s, top: ny - 0.03 * s, borderLeftWidth: 0.035 * s, borderRightWidth: 0.035 * s, borderBottomWidth: 0.06 * s, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: shade(skin, -0.22) }]} />);
    } else {
      const size = (noseStyle === 2 ? 0.07 : 0.035) * s;
      face.push(<View key="nose" style={[styles.abs, { left: nx - size / 2, top: ny - size / 2, width: size, height: size, borderRadius: s, backgroundColor: shade(skin, noseStyle === 2 ? -0.12 : -0.3) }]} />);
    }
  }
  const mx = icx + 0.39 * side * s;
  const my = icy + (0.3 - mouthLift) * s;
  // Facial hair follows the mouth.
  const beard = lookPart(look, "beard");
  if (faceOn && beard === 1) {
    face.push(<View key="stubble" style={[styles.abs, { left: icx - iw * 0.42 + 0.3 * side * s, top: my - 0.1 * s, width: iw * 0.84, height: ih * 0.45, borderRadius: s, backgroundColor: shade(hair, 0.1), opacity: 0.28 }]} />);
  }
  if (faceOn && beard === 2) {
    face.push(<View key="beard" style={[styles.abs, { left: icx - iw * 0.48 + 0.3 * side * s, top: my - 0.1 * s, width: iw * 0.96, height: ih * 0.5, borderRadius: s, backgroundColor: hair }]} />);
  }
  if (faceOn && beard === 6) {
    // A chin strap along the jaw.
    // Its lower edge sits just inside the jaw, so the part under the chin shows.
    const top = my - 0.24 * s;
    face.push(<View key="strap" style={[styles.abs, { left: icx - iw * 0.47 + 0.3 * side * s, top, width: iw * 0.94, height: Math.max(0.2 * s, ih - 0.012 * s - top), borderRadius: s, borderLeftWidth: 0.05 * s, borderRightWidth: 0.05 * s, borderBottomWidth: 0.06 * s, borderColor: hair, borderTopColor: "transparent" }]} />);
  }
  if (faceOn && beard === 7) {
    face.push(<View key="shortBeard" style={[styles.abs, { left: icx - iw * 0.43 + 0.3 * side * s, top: my - 0.04 * s, width: iw * 0.86, height: ih, borderRadius: iw * 0.43, backgroundColor: hair, opacity: 0.5 }]} />);
    face.push(<View key="moustache" style={[styles.abs, { left: mx - 0.12 * s, top: my - 0.08 * s, width: 0.24 * s, height: 0.05 * s, borderRadius: s, backgroundColor: hair, opacity: 0.75 }]} />);
  }
  if (faceOn && beard === 4) {
    face.push(<View key="goatee" style={[styles.abs, { left: mx - 0.06 * s, top: my + 0.035 * s, width: 0.12 * s, height: 0.1 * s, borderTopLeftRadius: 0.02 * s, borderTopRightRadius: 0.02 * s, borderBottomLeftRadius: s, borderBottomRightRadius: s, backgroundColor: hair }]} />);
  }
  if (faceOn && (beard === 3 || beard === 2 || beard === 4)) {
    const w = (beard === 4 ? 0.15 : 0.18) * s;
    face.push(<View key="moustache" style={[styles.abs, { left: mx - w / 2, top: my - 0.065 * s, width: w, height: (beard === 4 ? 0.04 : 0.05) * s, borderRadius: s, backgroundColor: shade(hair, -0.1) }]} />);
  }
  if (faceOn && beard === 5) {
    // A wide moustache with curled-up ends.
    face.push(<View key="moustache" style={[styles.abs, { left: mx - 0.14 * s, top: my - 0.07 * s, width: 0.28 * s, height: 0.06 * s, borderRadius: s, backgroundColor: shade(hair, -0.1) }]} />);
    for (const e of [-1, 1]) face.push(<View key={`curl${e}`} style={[styles.abs, { left: mx + e * 0.14 * s - 0.03 * s, top: my - 0.1 * s, width: 0.06 * s, height: 0.06 * s, borderRadius: s, borderWidth: 0.02 * s, borderColor: shade(hair, -0.1), borderTopColor: "transparent", borderRightColor: e > 0 ? shade(hair, -0.1) : "transparent", borderLeftColor: e < 0 ? shade(hair, -0.1) : "transparent" }]} />);
  }
  // Their own mouth unless an emote has one; lipstick colours it.
  const mouthShape = expression.mouth !== "none" ? expression.mouth : idleMouth;
  if (faceOn && (mouthShape !== "none" || lipstick)) {
    const m = mouthShape;
    const line = lipstick ?? people.eye;
    const stroke = (lipstick ? 0.034 : 0.026) * s;
    const lip = lipstick ? { borderWidth: 0.022 * s, borderColor: lipstick } : {};
    const w = (m === "o" ? 0.08 : m === "open" || m === "tongue" ? 0.17 : m === "none" ? 0.11 : 0.13) * s;
    const mouth =
      m === "smile"
        ? { height: 0.07 * s, borderBottomWidth: stroke, borderColor: "transparent", borderBottomColor: line, borderLeftWidth: stroke, borderRightWidth: stroke, borderRadius: s, top: c - 0.06 * s }
        : m === "frown"
          ? { height: 0.07 * s, borderTopWidth: stroke, borderColor: "transparent", borderTopColor: line, borderLeftWidth: stroke, borderRightWidth: stroke, borderRadius: s, top: c }
          : m === "open" || m === "tongue"
            ? { height: 0.1 * s, backgroundColor: people.mouth, borderBottomLeftRadius: s, borderBottomRightRadius: s, top: c - 0.03 * s, ...lip }
            : m === "o"
              ? { height: 0.09 * s, backgroundColor: people.mouth, borderRadius: s, top: c - 0.03 * s, ...lip }
              : m === "none"
                ? // Lipstick with no mouth: closed lips.
                  { height: 0.05 * s, backgroundColor: line, borderRadius: s, top: c - 0.02 * s }
                : { height: stroke, backgroundColor: line, borderRadius: s, top: c };
    boxed(
      "mouth",
      mx,
      m === "tongue" ? Math.min(my, icy + ih / 2 - (0.1 * mouthScale + 0.015) * s) : my,
      -mouthTurn,
      mouthScale,
      m === "cat" ? (
        // A cat mouth: two little curves side by side.
        [-1, 1].map((e) => (
          <View key={`cat${e}`} style={[styles.abs, { left: c + (e < 0 ? -0.075 : 0) * s, top: c - 0.045 * s, width: 0.075 * s, height: 0.06 * s, borderRadius: s, borderBottomWidth: stroke, borderLeftWidth: stroke, borderRightWidth: stroke, borderColor: "transparent", borderBottomColor: line }]} />
        ))
      ) : (
        <View style={[styles.abs, { left: c - w / 2, width: w }, mouth]}>
          {m === "tongue" ? <View style={[styles.abs, { left: w * 0.22, bottom: -0.03 * s, width: w * 0.5, height: 0.07 * s, borderRadius: s, backgroundColor: people.tongue }]} /> : null}
        </View>
      )
    );
  }
  // A mole, in one of a few places.
  const mole = lookPart(look, "mole");
  if (faceOn && mole > 0) {
    const cheek = (e: number) => ({ x: icx + (0.2 * e * facing + 0.33 * side) * s, y: icy + 0.27 * s, shown: -0.26 * e * side + 0.33 * facing > 0.08 });
    const spot =
      mole === 1
        ? cheek(1)
        : mole === 2
          ? cheek(-1)
          : mole === 3
            ? { x: mx + 0.1 * mouthScale * facing * s, y: my - 0.025 * s, shown: true }
            : mole === 4
              ? { x: eyeAt(1).x + 0.06 * facing * s, y: eyeAt(1).y + 0.1 * eyeScale * s, shown: -0.15 * side + 0.39 * facing > 0.08 }
              : { x: mx + 0.03 * s, y: my + 0.085 * s, shown: true };
    const size = 0.035 * s;
    if (spot.shown) face.push(<View key="mole" style={[styles.abs, { left: spot.x - size / 2, top: spot.y - size / 2, width: size, height: size, borderRadius: s, backgroundColor: people.mole }]} />);
  }
  // The cap and beanie sit over the hair cap, in the hat's colour. The sun
  // hat has its own brim and crown, so under it hair is just hair (or none).
  const capHat = [undefined, people.hats.cap, people.hats.beanie][hat];
  // A buzz cut, and a mohawk's shaved sides: short, fine hair.
  const buzz = look.hair === 6 || look.hair === 12;
  // A disc clipped to the head: the hair cap, or a cap or beanie over it.
  const dome = (drop: number, fill: string, key: string) => (
    <View
      key={key}
      style={[
        styles.abs,
        {
          left: icx - inner * 1.12 - side * 0.3 * inner,
          top: icy - inner * 1.12 - drop * inner,
          width: inner * 2.24,
          height: inner * 2.24,
          borderRadius: inner * 1.12,
          backgroundColor: fill,
        },
      ]}
    />
  );
  const shine = (drop: number, fill: string, key: string) => (
    <View
      key={key}
      style={[
        styles.abs,
        { left: icx - inner * 0.1 - side * 0.3 * inner, top: icy - inner * 0.95 - drop * inner, width: inner * 0.7, height: inner * 0.5, borderRadius: inner, backgroundColor: shade(fill, 0.18) },
      ]}
    />
  );
  const sideSwept = look.hair === 11 && !coversFringe(hat) ? sideSweptPose(innerHeadView) : null;
  const curtains = look.hair === 15 && !coversFringe(hat) ? curtainsPose(innerHeadView) : null;
  parts.push(
    <View
      key="head"
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left: head.x - hw / 2,
          top: head.y - hh / 2 - (hh - r * 2) * 0.25,
          width: hw,
          height: hh,
          borderTopLeftRadius: corner(shape.top, hw),
          borderTopRightRadius: corner(shape.top, hw),
          borderBottomLeftRadius: corner(shape.bottom, hw),
          borderBottomRightRadius: corner(shape.bottom, hw),
          backgroundColor: garden.ink,
        },
      ]}
    >
      <View
        style={[
          styles.abs,
          {
            left: ink,
            top: ink,
            width: iw,
            height: ih,
            borderTopLeftRadius: corner(shape.top, iw),
            borderTopRightRadius: corner(shape.top, iw),
            borderBottomLeftRadius: corner(shape.bottom, iw),
            borderBottomRightRadius: corner(shape.bottom, iw),
            backgroundColor: skin,
            overflow: "hidden",
          },
        ]}
      >
        {/* Shade on the side away from the sun. */}
        <View style={[styles.abs, { left: -iw * 0.12, top: ih * 0.1, width: iw, height: ih, borderRadius: Math.max(iw, ih), backgroundColor: shade(skin, -0.1) }]} />
        <View style={[styles.abs, { left: iw * 0.03, top: -ih * 0.05, width: iw, height: ih, borderRadius: Math.max(iw, ih), backgroundColor: skin }]} />
        {face}
        {/* The hair cap (none when bald; short and fine for a buzz cut). */}
        {look.hair === 8 ? null : dome(capDrop + (buzz ? 0.22 : 0), buzz ? shade(hair, 0.25) : hair, "hairCap")}
        {look.hair === 8 || capHat ? null : shine(capDrop, hair, "hairShine")}
        {sideSwept && sideSwept.visible ? (
          <View
            style={[
              styles.abs,
              {
                left: sideSwept.at.x - (r * 1.24 * sideSwept.scaleX) / 2,
                top: sideSwept.at.y - r * 0.29,
                width: r * 1.24 * sideSwept.scaleX,
                height: r * 0.58,
                borderRadius: r,
                backgroundColor: hair,
                transform: [{ rotate: `${sideSwept.tilt}rad` }],
              },
            ]}
          />
        ) : null}
        {curtains
          ? [
              ...curtains.locks.map((lock) =>
                lock.visible ? (
                  <View
                    key={`curtain${lock.side}`}
                    style={[
                      styles.abs,
                      {
                        left: lock.at.x - (inner * 0.7 * lock.scaleX) / 2,
                        top: lock.at.y - inner * 0.34,
                        width: inner * 0.7 * lock.scaleX,
                        height: inner * 0.78,
                        borderRadius: inner * 0.35,
                        backgroundColor: hair,
                      },
                    ]}
                  />
                ) : null
              ),
              curtains.parting.visible ? (
                <View
                  key="parting"
                  style={[
                    styles.abs,
                    {
                      left: curtains.parting.at.x - 0.13 * inner * curtains.parting.scaleX,
                      top: curtains.parting.at.y - inner * 0.08,
                      width: 0.26 * inner * curtains.parting.scaleX,
                      height: 0.26 * inner,
                      transform: [{ rotate: "45deg" }],
                      backgroundColor: skin,
                    },
                  ]}
                />
              ) : null,
            ]
          : null}
      </View>
    </View>
  );
  if (hood === "over") {
    const drape = at(-side * 0.03, chin + 0.04);
    parts.push(<Ellipse key="hood" cx={drape.x} cy={drape.y} rx={0.27 * body.width * s} ry={0.17 * body.height * up} fill={hoodFill} ink={ink * 1.2} inkColour={garden.ink} ramp />);
    parts.push(<Ellipse key="hoodInside" cx={drape.x} cy={drape.y - 0.08 * body.height * up} rx={0.17 * body.width * s} ry={0.055 * body.height * up} fill={shade(shirt, -0.4)} ink={ink * 0.6} inkColour={garden.ink} />);
    parts.push(capsule(at(-side * 0.03, chin - 0.01), at(-side * 0.03, chin - 0.1), 0.025 * s, shade(shirt, -0.35), "hoodSeam"));
  }
  const drapeCover = curtain ? backDrapeCover(facing) : 0;
  if (curtain && drapeCover > 0) {
    const inLeft = curtain.left + ink;
    const inWidth = Math.max(0, curtain.width - ink * 2);
    const inTop = onScreen.cy;
    const inHeight = Math.max(0, curtain.top + curtain.height - ink - inTop);
    const w = inWidth * drapeCover;
    const x = side >= 0 ? inLeft : inLeft + inWidth - w;
    const br = Math.max(0, curtain.radius - ink);
    parts.push(
      <View
        key={`${curtain.key}BackDrape`}
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: x,
            top: inTop,
            width: w,
            height: inHeight,
            borderBottomLeftRadius: side >= 0 || drapeCover > 0.9 ? br : 0,
            borderBottomRightRadius: side < 0 || drapeCover > 0.9 ? br : 0,
            backgroundColor: hair,
          },
        ]}
      />
    );
  }
  if (wavyEnds) {
    for (const w of wavyEnds) if (w.front) ball(`waveFront${w.index}`, w.at.x, w.at.y, 0.1 * s, hair);
  }
  if (look.hair === 10 && afroOver) afro();
  if (bun && bun.front) ball("bunFront", bun.at.x, bun.at.y, 0.17 * s, hair);
  if (pigtails) {
    for (const p of pigtails) if (p.front) ball(`tailFront${p.e}`, p.at.x, p.at.y, 0.15 * s, hair);
  }
  if (pony && pony.front) drawPonytail("Front");
  if (curlsList) {
    for (const c of curlsList) if (c.front) parts.push(<Ellipse key={`curlFront${c.index}`} cx={c.at.x} cy={c.at.y} rx={0.13 * s} ry={0.13 * s} fill={hair} ink={ink * 0.7} inkColour={garden.ink} />);
  }
  if (braid && braid.front) drawBraid();
  if (capped) {
    parts.push(crown());
    if (capOnScreen) ball("capButton", capOnScreen.top.x, capOnScreen.top.y + ink * 0.4, 0.045 * s, shade(capColour, -0.1));
  }
  if (capped && capPeakInFront) peak();
  if (hat === 2) {
    parts.push(beanieCrown());
    const pom = projectOnHead(onScreen, [0, 1.06, -0.16]);
    ball("pompom", pom.x, pom.y, 0.12 * s, people.hats.pompom);
  }
  if (mohawk) {
    for (const m of mohawk) if (m.front) ball(`crestFront${m.index}`, m.at.x, m.at.y, 0.11 * s, hair);
  }
  if (spaceBuns) {
    const frontBuns = spaceBuns.filter((sb) => sb.front).sort((a, b) => a.depth - b.depth);
    for (const sb of frontBuns) ball(`spaceBunFront${sb.e}`, sb.at.x, sb.at.y, 0.16 * s, hair);
  }
  if (hat === 3) flowerCrown("front");
  if (hat === 4) {
    const base = level(SUN_HAT.brimY, SUN_HAT.baseRadius);
    const band = level(SUN_HAT.bandY, (SUN_HAT.baseRadius + SUN_HAT.topRadius) / 2 + 0.04);
    const top = level(SUN_HAT.topY, SUN_HAT.topRadius);
    const side = (from: typeof base, to: typeof base, grow: number) => [
      { x: to.cx - to.rx - grow, y: to.cy - grow },
      { x: to.cx + to.rx + grow, y: to.cy - grow },
      { x: from.cx + from.rx + grow, y: from.cy + grow },
      { x: from.cx - from.rx - grow, y: from.cy + grow },
    ];
    parts.push(quad(side(base, top, ink), garden.ink, "sunCrownInk"));
    parts.push(<Ellipse key="sunTopInk" cx={top.cx} cy={top.cy} rx={top.rx + ink} ry={top.ry + ink} fill={garden.ink} />);
    parts.push(quad(side(base, band, 0), people.hats.band, "sunBand"));
    parts.push(<Ellipse key="sunBandTop" cx={band.cx} cy={band.cy} rx={band.rx} ry={band.ry} fill={people.hats.sunHat} />);
    parts.push(quad(side(band, top, 0), people.hats.sunHat, "sunCrown"));
    parts.push(<Ellipse key="sunTop" cx={top.cx} cy={top.cy} rx={top.rx} ry={top.ry} fill={shade(people.hats.sunHat, 0.08)} />);
    brimHalf("brimFront", shade(people.hats.sunHat, 0.08), "front");
  }
  if (hat === 5) {
    const beret = beretPose(onScreen);
    const colour = fav(people.hats.beret);
    parts.push(
      <View
        key="beret"
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: beret.centre.x - r * 1.1,
            top: beret.centre.y - r * 0.475,
            width: r * 2.2,
            height: r * 0.95,
            borderTopLeftRadius: r * 1.1,
            borderTopRightRadius: r * 1.1,
            borderBottomLeftRadius: r * 0.5,
            borderBottomRightRadius: r * 0.5,
            backgroundColor: colour,
            borderWidth: ink,
            borderColor: garden.ink,
            transform: [{ rotate: `${beret.tilt}rad` }],
          },
        ]}
      >
        <View style={{ position: "absolute", left: r * 0.85, top: r * 0.12, width: r * 0.6, height: r * 0.22, borderRadius: r, backgroundColor: shade(colour, 0.18) }} />
      </View>
    );
    if (beret.stalkInFront) ball("stalk", beret.stalk.x, beret.stalk.y, 0.04 * s, shade(colour, -0.2));
  }
  if (bow && bow.front) drawBow();
  if (hat === 7) parts.push(headbandCrown());
  if (hat === 8) {
    const half = r * 0.42;
    const tall = r * 0.86;
    const base = head.y - r * 0.78 - lift - onAfro;
    parts.push(<View key="partyInk" pointerEvents="none" style={[styles.abs, { left: head.x - half - ink * 1.5, top: base - tall - ink * 2, borderLeftWidth: half + ink * 1.5, borderRightWidth: half + ink * 1.5, borderBottomWidth: tall + ink * 2, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: garden.ink }]} />);
    parts.push(<View key="party" pointerEvents="none" style={[styles.abs, { left: head.x - half, top: base - tall, borderLeftWidth: half, borderRightWidth: half, borderBottomWidth: tall, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: fav(people.hats.party) }]} />);
    ball("partyPompom", head.x, base - tall, 0.07 * s, people.hats.pompom);
  }
  if (hat === 9) {
    const cr = crownShape(onScreen, onAfro / onScreen.ry);
    const tipHalf = Math.max(0.8, 0.02 * r);
    const pointQuad = (pt: (typeof cr.points)[number], grow: number) => {
      const span = Math.abs(pt.right.x - pt.left.x);
      if (span < 2) return null;
      const [l, ri] = pt.left.x <= pt.right.x ? [pt.left, pt.right] : [pt.right, pt.left];
      return [
        { x: pt.tip.x - tipHalf - grow * 0.6, y: pt.tip.y - grow },
        { x: pt.tip.x + tipHalf + grow * 0.6, y: pt.tip.y - grow },
        { x: ri.x + grow * 0.8, y: ri.y + grow * 0.5 },
        { x: l.x - grow * 0.8, y: l.y + grow * 0.5 },
      ];
    };
    for (const pt of cr.points) {
      if (pt.front) continue;
      const qInk = pointQuad(pt, ink);
      const qFill = pointQuad(pt, 0);
      if (qInk && qFill) {
        parts.push(quad(qInk, garden.ink, `pointInk${pt.index}`));
        parts.push(quad(qFill, shade(people.hats.crown, -0.18), `point${pt.index}`));
      }
    }
    parts.push(<Ellipse key="crownBandBack" cx={cr.band.x} cy={cr.band.y} rx={cr.rx} ry={cr.ry} fill={shade(people.hats.crown, -0.22)} ink={ink * 0.8} inkColour={garden.ink} />);
    parts.push(<Ellipse key="crownBaseInk" cx={cr.base.x} cy={cr.base.y} rx={cr.rx + ink} ry={cr.ry + ink} fill={garden.ink} />);
    parts.push(
      quad(
        [
          { x: cr.band.x - cr.rx - ink, y: cr.band.y - ink * 0.4 },
          { x: cr.band.x + cr.rx + ink, y: cr.band.y - ink * 0.4 },
          { x: cr.base.x + cr.rx + ink, y: cr.base.y + ink * 0.4 },
          { x: cr.base.x - cr.rx - ink, y: cr.base.y + ink * 0.4 },
        ],
        garden.ink,
        "crownBandInk",
        4
      )
    );
    for (const pt of cr.points) {
      if (!pt.front) continue;
      const qInk = pointQuad(pt, ink);
      if (qInk) parts.push(quad(qInk, garden.ink, `pointInk${pt.index}`));
    }
    parts.push(
      quad(
        [
          { x: cr.band.x - cr.rx, y: cr.band.y },
          { x: cr.band.x + cr.rx, y: cr.band.y },
          { x: cr.base.x + cr.rx, y: cr.base.y },
          { x: cr.base.x - cr.rx, y: cr.base.y },
        ],
        people.hats.crown,
        "crownBand",
        4
      )
    );
    parts.push(<Ellipse key="crownBaseRim" cx={cr.base.x} cy={cr.base.y} rx={cr.rx} ry={cr.ry} fill={people.hats.crown} />);
    for (const pt of cr.points) {
      if (!pt.front) continue;
      const qFill = pointQuad(pt, 0);
      if (qFill) parts.push(quad(qFill, people.hats.crown, `point${pt.index}`));
    }
    if (cr.jewel.front) ball("jewel", cr.jewel.at.x, cr.jewel.at.y, 0.04 * s, fav(people.lipstick[1]));
  }
  if (temples) drawTemples("front");
  if (accessory === 6) {
    headphones("front");
  }
  if (earFlower && earFlower.front) drawEarFlower();
  arms("over");
  if (move.palms > 0.6 && facing >= 0) {
    const y = move.hands.l?.[1] ?? 0.46;
    for (const e of [-1, 1]) {
      const hand = at(0.045 * e, y + 0.02);
      parts.push(<Ellipse key={`palm${e}`} cx={hand.x} cy={hand.y} rx={0.065 * s} ry={0.095 * s} fill={skin} ink={ink * 0.8} inkColour={garden.ink} />);
    }
  }
  if (!swim) return <>{parts}</>;
  const lap = 1 + 0.08 * Math.sin(t * 5 + seed);
  return (
    <>
      <Ellipse cx={foot.x} cy={foot.y} rx={0.6 * s * lap} ry={0.16 * s * lap} fill={garden.ripple} ink={ink * 0.7} inkColour={garden.water} />
      <View pointerEvents="none" style={[styles.abs, styles.waterline, { height: foot.y }]}>
        {parts}
      </View>
    </>
  );
};

const sameLook = (a: Look, b: Look) => {
  if (a === b) return true;
  for (const k in a) {
    if (a[k as keyof Look] !== b[k as keyof Look]) return false;
  }
  for (const k in b) {
    if (!(k in a) && b[k as keyof Look] !== undefined) return false;
  }
  return true;
};

const sameDoing = (a: Doing, b: Doing) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.kind === b.kind &&
    a.id === b.id &&
    a.p === b.p &&
    (a.kind !== "mutual" ||
      (b.kind === "mutual" && a.toward === b.toward && a.reach?.x === b.reach?.x && a.reach?.y === b.reach?.y)));

/**
 * The avatar, redrawn only when something about it changed. Someone standing
 * still gets the same numbers every frame (the garden passes them t = 0), so
 * they're skipped while someone else walks.
 */
export const Avatar = memo(
  AvatarView,
  (a, b) =>
    a.figure.foot.x === b.figure.foot.x &&
    a.figure.foot.y === b.figure.foot.y &&
    a.figure.s === b.figure.s &&
    a.figure.up === b.figure.up &&
    a.figure.bob === b.figure.bob &&
    a.pose.heading === b.pose.heading &&
    a.pose.walking === b.pose.walking &&
    sameLook(a.look, b.look) &&
    a.t === b.t &&
    a.seed === b.seed &&
    a.stride?.stridePhase === b.stride?.stridePhase &&
    a.stride?.strideAmp === b.stride?.strideAmp &&
    a.sit === b.sit &&
    a.shadow === b.shadow &&
    a.swim === b.swim &&
    a.talk === b.talk &&
    sameDoing(a.doing ?? null, b.doing ?? null)
);

const TYPING_DOTS = [0, 1, 2];
const TAG_WIDTH = 200;
const TAG_EDGE_PAD = 10;
const BUBBLE_MAX_WIDTH = 172;
const TAIL_INSET = 22;
const WEB_WRAP = Platform.OS === "web" ? ({ overflowWrap: "anywhere", wordBreak: "break-word" } as object) : null;

/** The name, line and emote over someone's head, above all the scenery. */
const TagView = ({
  x,
  y,
  name,
  me,
  npc = false,
  stageWidth,
  line,
  typing,
  emote,
  emoteRise,
  lineFade = 1,
  status,
  reading = false,
  shout = false,
  calm = false,
}: {
  x: number;
  y: number;
  name: string;
  me: boolean;
  npc?: boolean;
  stageWidth?: number;
  line?: string;
  typing?: number;
  emote?: string;
  /** 0 when the emote starts, 1 when it's gone. */
  emoteRise: number;
  lineFade?: number;
  status?: string;
  reading?: boolean;
  shout?: boolean;
  calm?: boolean;
}) => {
  const [bubbleWidth, setBubbleWidth] = useState(BUBBLE_MAX_WIDTH);
  const half = bubbleWidth / 2;
  const bubbleShift =
    stageWidth !== undefined && line
      ? Math.min(Math.max(TAG_EDGE_PAD + half, x), Math.max(TAG_EDGE_PAD + half, stageWidth - TAG_EDGE_PAD - half)) - x
      : 0;
  const tailReach = Math.max(0, half - TAIL_INSET);
  const tailShift = Math.min(Math.max(-bubbleShift, -tailReach), tailReach);
  return (
    <View pointerEvents="none" style={[styles.tag, { left: x - TAG_WIDTH / 2, top: y - 400 }]}>
      {emote ? (
        <Text style={[styles.emote, { opacity: 1 - emoteRise * emoteRise, transform: [{ translateY: -emoteRise * 26 }] }]}>{emote}</Text>
      ) : null}
      {line ? (
        <View
          onLayout={(e) => setBubbleWidth(e.nativeEvent.layout.width)}
          style={[
            styles.bubble,
            calm
              ? { opacity: lineFade, transform: [{ translateX: bubbleShift }] }
              : { opacity: lineFade, transform: [{ translateX: bubbleShift }, { translateY: (1 - lineFade) * 6 }, { scale: 0.92 + 0.08 * lineFade }] },
          ]}
        >
          <Text style={[styles.bubbleText, shout && styles.shoutText, WEB_WRAP]}>{line}</Text>
          <View style={[styles.tailRow, { transform: [{ translateX: tailShift }] }]}>
            <View style={styles.tailInk} />
            <View style={styles.tail} />
          </View>
        </View>
      ) : typing !== undefined ? (
        <View style={[styles.bubble, styles.typingBubble]} accessibilityLabel={`${name} is typing`} testID="world-typing">
          {TYPING_DOTS.map((i) => (
            <View key={i} style={[styles.typingDot, { transform: [{ translateY: -3 * Math.max(0, Math.sin(typing * 7 - i * 0.9)) }] }]} />
          ))}
          <View style={styles.tailRow}>
            <View style={styles.tailInk} />
            <View style={styles.tail} />
          </View>
        </View>
      ) : null}
      {reading ? (
        <View style={styles.readingBadge} accessibilityLabel="Doing devotional" testID="world-reading-icon">
          <Ionicons name="book-outline" size={14} color={hud.cream} />
        </View>
      ) : null}
      {status ? (
        <Text style={styles.status} numberOfLines={1}>
          {status}
        </Text>
      ) : null}
      <Text style={[styles.name, me && styles.meName, npc && styles.npcName]} numberOfLines={1} testID={npc ? "world-npc-tag" : undefined}>
        {name}
      </Text>
    </View>
  );
};

export const Tag = memo(TagView);

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  waterline: { left: 0, top: 0, width: "100%", overflow: "hidden" },
  quad: { position: "absolute", left: 0, top: 0, width: QUAD_SIZE, height: QUAD_SIZE },
  tag: { position: "absolute", width: TAG_WIDTH, height: 400, alignItems: "center", justifyContent: "flex-end", gap: 10 },
  emote: { fontSize: 30, marginBottom: -4 },
  bubble: {
    maxWidth: BUBBLE_MAX_WIDTH,
    backgroundColor: hud.card,
    borderColor: hud.forest,
    borderWidth: 2.5,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...popShadow(),
    marginBottom: 2,
  },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 11 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: hud.forest },
  bubbleText: { maxWidth: "100%", color: hud.forest, fontSize: 14, lineHeight: 18, fontWeight: "600", textAlign: "center" },
  shoutText: { fontSize: 30, lineHeight: 36 },
  status: {
    fontSize: 11,
    fontWeight: "700",
    color: hud.cream,
    backgroundColor: hud.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: -6,
  },
  readingBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: hud.chip,
    borderWidth: 1.5,
    borderColor: hud.forest,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -6,
  },
  tailRow: { position: "absolute", left: 0, right: 0, bottom: -14, height: 14, alignItems: "center" },
  tailInk: {
    marginTop: 2,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: hud.forest,
  },
  tail: {
    marginTop: -14,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: hud.card,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 12,
    color: hud.forest,
    backgroundColor: hud.nameBg,
    paddingHorizontal: 9,
    paddingTop: 3,
    paddingBottom: 2,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: hud.forest,
    overflow: "hidden",
  },
  meName: { backgroundColor: hud.accent, color: hud.onAccent },
  npcName: { backgroundColor: hud.npcBg, color: hud.forest },
});
