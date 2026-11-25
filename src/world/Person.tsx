import { bodyScale, FULL_OUTFITS, lookPart, nudge, type EmoteId, type Look, type MutualKind, type Pose } from "@shared/world";
import { memo, type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { QUAD_SIZE, type Camera, type ScreenPoint } from "./camera";
import { garden, hud, isLight, people, shade } from "./palette";
import { Ellipse, flatQuad, quadTransform } from "./Shapes";
import { bandOverHead, capShape, earCup, HAT_PITCH, projectOnHead, type Disc, type HeadView, type Point } from "./headwear";
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
  const crownLayer = (fill: string, grow: number, key: string) => {
    const cap = capShape(headView(-ink, -ink));
    const cover = <View key={`${key}Cover`} style={[styles.abs, { left: -iw, top: -ih, width: iw * 3, height: ih * 3, backgroundColor: fill }]} />;
    const above = (child: ReactNode) => (cap.edge ? halfPlane(`${key}Top`, cap.edge[0], cap.edge[1], cap.top, child, grow) : child);
    if (cap.rimIsCrown) return [disc(cap.rim, fill, `${key}Rim`, grow), above(cover)];
    return [crescent(cap.rim.centre, cap.rimAcross, cap.rimUp, Math.max(iw, ih) * 1.2, fill, `${key}Rim`, grow) ?? above(cover)];
  };
  const crown = () => (
    <View
      key="capCrown"
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
      {crownLayer(garden.ink, ink * 0.9, "capInk")}
      {crownLayer(capColour, 0, "cap")}
    </View>
  );
  const peak = () => {
    const cap = capShape(onScreen);
    const { centre, a, b } = cap.peak;
    const fill = shade(capColour, -0.12);
    parts.push(
      halfPlane("peak", { x: centre.x - a.x, y: centre.y - a.y }, { x: centre.x + a.x, y: centre.y + a.y }, { x: centre.x + b.x, y: centre.y + b.y }, [
        disc(cap.peak, garden.ink, "peakInk", ink),
        disc(cap.peak, fill, "peakFill", 0),
      ])
    );
    ball("capButton", cap.top.x, cap.top.y + ink * 0.4, 0.045 * s, shade(capColour, -0.1));
  };
  const capPeakInFront = capped && capShape(onScreen).peakInFront;
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
  const accessory = look.accessory ?? 0;
  // A backpack shows behind the body from the front, over it from behind.
  const backpack = (key: string) =>
    parts.push(
      <View
        key={key}
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: at(-0.27 - side * 0.12, 0.72).x,
            top: at(0, 0.72).y,
            width: 0.54 * s,
            height: 0.52 * up,
            borderRadius: 0.14 * s,
            backgroundColor: people.backpack,
            borderWidth: ink,
            borderColor: garden.ink,
          },
        ]}
      />
    );
  if (accessory === 2 && facing >= 0) backpack("packBehind");
  if (look.hair === 4) {
    for (const e of [-1, 1]) ball(`tail${e}`, head.x + e * r * 1.05, head.y + r * 0.15, 0.15 * s, hair);
  }
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
  arms("back");
  const outfit = lookPart(look, "outfit");
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
  // The chin, in body units: the head covers the neck, so collars, bow ties
  // and necklaces hang just below it.
  const chin = Math.min(0.7, ((foot.y - (head.y + hh / 2 - (hh - r * 2) * 0.25)) / up - bob) / body.height);
  const dot = (key: string, x: number, y: number, rad: number, fill: string) =>
    parts.push(<View key={key} pointerEvents="none" style={[styles.abs, { left: at(x, y).x - rad, top: at(x, y).y - rad, width: rad * 2, height: rad * 2, borderRadius: rad, backgroundColor: fill }]} />);
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
    if (facing >= 0) {
      piece("bib", people.denim, 0.58, 0.34, 0.13, 0.15, 6);
      for (const e of [-1, 1]) parts.push(capsule(at(0.12 * e, 0.7), at(0.11 * e, 0.56), 0.05 * s, people.denim, `brace${e}`));
    } else {
      for (const e of [-1, 1]) parts.push(capsule(at(0.14 * e, 0.7), at(0.04 * e, 0.36), 0.05 * s, people.denim, `brace${e}`));
    }
  }
  if (outfit === 4) {
    for (const y of [0.58, 0.44, 0.3]) {
      parts.push(capsule(at(-halfWidth(y) + 0.04, y), at(halfWidth(y) - 0.04, y), 0.055 * s, shade(shirt, -0.3), `stripe${y}`));
    }
  }
  if (outfit === 5 && facing >= 0) {
    if (pants > 0) piece("pocket", shade(shirt, -0.14), 0.52, 0.36, 0.13, 0.16, 10);
    else piece("pocket", shade(shirt, -0.14), 0.38, 0.2, 0.15, 0.19, 10);
    for (const e of [-1, 1]) parts.push(capsule(at(0.06 * e, 0.68), at(0.07 * e, 0.52), 0.03 * s, people.drawstring, `string${e}`));
  }
  if (outfit === 6 && facing >= 0) {
    // Collared: a white collar and two buttons.
    for (const e of [-1, 1]) {
      parts.push(quad(sidePanel(e, chin + 0.03, chin - 0.1, [0, 0.15], [0.02, 0.11], ink * 0.8), garden.ink, `collarInk${e}`, 2));
      parts.push(quad(sidePanel(e, chin + 0.03, chin - 0.1, [0, 0.15], [0.02, 0.11], 0), people.collar, `collar${e}`, 2));
    }
    for (const y of [chin - 0.16, chin - 0.28]) if (y > hem + 0.04) dot(`button${y}`, 0, y, 0.022 * s, shade(shirt, -0.35));
  }
  if (outfit === 7 && facing >= 0) {
    // A jacket, open over a tee.
    piece("tee", isLight(shirt) ? people.shades : people.collar, 0.7, hem, 0.07, 0.09, 4);
    for (const e of [-1, 1]) parts.push(quad(sidePanel(e, 0.71, 0.56, [0.07, 0.17], [0.09, 0.12], 0), shade(shirt, -0.15), `lapel${e}`, 2));
  }
  if (outfit === 8) {
    // A jumper: ribbing at the neck and the hem.
    piece("ribbing", shade(shirt, -0.16), hem + 0.07, hem, halfWidth(hem + 0.07) + 0.005, halfWidth(hem) + 0.005, 6);
    if (facing >= 0) parts.push(capsule(at(-0.1, 0.69), at(0.1, 0.69), 0.05 * s, shade(shirt, -0.16), "neck"));
  }
  if (outfit === 9) {
    const spots = [[-0.12, 0.6], [0.08, 0.62], [-0.02, 0.5], [0.16, 0.44], [-0.18, 0.4], [0.05, 0.33], [-0.1, 0.25], [0.2, 0.22]] as const;
    for (const [x, y] of spots) if (y > hem + 0.04) dot(`spot${x}${y}`, x, y, 0.035 * s, isLight(shirt) ? shade(shirt, -0.3) : shade(shirt, 0.5));
  }
  if (outfit === 10) {
    const plaid = (key: string, a: { x: number; y: number }, b: { x: number; y: number }) => parts.push(capsule(a, b, 0.028 * s, people.plaid, key));
    for (const y of [0.6, 0.45, hem + 0.1]) plaid(`plaidAcross${y}`, at(-halfWidth(y) + 0.03, y), at(halfWidth(y) - 0.03, y));
    for (const k of [-0.6, 0.6]) plaid(`plaidDown${k}`, at(k * halfWidth(0.66), 0.66), at(k * halfWidth(hem + 0.04), hem + 0.04));
    if (facing >= 0) {
      piece("flannelTee", people.shades, 0.7, hem, 0.075, 0.095, 4);
      parts.push(capsule(at(-0.075, 0.69), at(0.075, 0.69), 0.04 * s, shade(people.shades, 0.25), "teeNeck"));
      for (const e of [-1, 1]) parts.push(quad(sidePanel(e, 0.71, 0.56, [0.075, 0.17], [0.095, 0.12], 0), shade(shirt, -0.12), `flannelLapel${e}`, 2));
    }
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
  if (accessory === 2 && facing >= 0) {
    for (const e of [-1, 1]) parts.push(capsule(at(0.13 * e, 0.69), at(0.15 * e, 0.38), 0.05 * s, people.backpackStrap, `strap${e}`));
  }
  if (accessory === 2 && facing < 0) backpack("packFront");
  if (accessory === 3) {
    // Wrapped under the chin (higher up, the head hides it), its end hanging in front.
    parts.push(capsule(at(-0.25, 0.58), at(0.25, 0.58), 0.13 * s + ink * 2, garden.ink, "scarfInk"));
    parts.push(capsule(at(-0.25, 0.58), at(0.25, 0.58), 0.13 * s, people.scarf, "scarf"));
    if (facing > -0.2) {
      parts.push(capsule(at(0.13, 0.56), at(0.16 + swing, 0.36), 0.1 * s + ink * 2, garden.ink, "scarfTailInk"));
      parts.push(capsule(at(0.13, 0.56), at(0.16 + swing, 0.36), 0.1 * s, shade(people.scarf, -0.1), "scarfTail"));
    }
  }
  if (accessory === 4 && facing >= 0) {
    // A bow tie, in their favourite colour.
    for (const e of [-1, 1]) {
      parts.push(quad(sidePanel(e, chin + 0.005, chin - 0.105, [0.01, 0.12], [0.01, 0.12], ink * 0.8), garden.ink, `tieInk${e}`, 3));
      parts.push(quad(sidePanel(e, chin - 0.005, chin - 0.095, [0.01, 0.115], [0.01, 0.115], 0), fav(people.scarf), `tie${e}`, 3));
    }
    ball("knot", at(0, chin - 0.05).x, at(0, chin - 0.05).y, 0.04 * s, shade(fav(people.scarf), -0.15));
  }
  if (accessory === 5 && facing >= 0) {
    // A string of pearls with a pendant in their favourite colour.
    for (let i = 0; i <= 6; i++) {
      const x = -0.15 + i * (0.3 / 6);
      dot(`pearl${i}`, x, chin + 0.01 - 0.08 * (1 - (x / 0.15) ** 2), 0.024 * s, people.pearl);
    }
    ball("pendant", at(0, chin - 0.11).x, at(0, chin - 0.11).y, 0.04 * s, fav(garden.blooms[0]));
  }
  if (feetInFront) feet();
  arms("front");

  if (outfit === 5) ball("hood", head.x - side * 0.1 * s, head.y + r * 0.42, r * 0.86, shade(shirt, -0.1));
  // Hair that sits behind the head: a bun, or long hair down to the shoulders.
  if (look.hair === 1 && !hidesBun(hat)) ball("bun", head.x - side * 0.15 * s, head.y - 0.46 * s - lift, 0.17 * s, hair);
  if (look.hair === 2) {
    parts.push(
      <View
        key="long"
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: head.x - r * 1.05 - side * 0.1 * s,
            top: head.y - r * (capped ? CAP_HAIR_TOP : 0.4),
            width: r * 2.1,
            height: r * (capped ? 0.95 + CAP_HAIR_TOP : 1.35),
            borderRadius: r * 0.5,
            backgroundColor: hair,
            borderWidth: ink,
            borderColor: garden.ink,
          },
        ]}
      />
    );
  }
  // A ponytail, swinging a little as they walk: behind the head, or down
  // the back of it when they face away.
  const ponytail = () => {
    const back = facing < -0.2;
    const tie = { x: head.x - side * 0.3 * s, y: back || capped ? head.y - r * 0.2 : head.y - r * 0.55 - lift };
    // From behind, it hangs from the tie down past the nape.
    const start = back ? tie : at(-side * 0.32, 1.12);
    const end = back ? { x: tie.x + swing * s, y: head.y + r * 1.2 } : at(-side * 0.42 + swing, 0.82);
    if (back) {
      parts.push(<Ellipse key="tail" cx={(start.x + end.x) / 2} cy={(start.y + end.y) / 2} rx={0.19 * s} ry={(end.y - start.y) / 2} fill={hair} ink={ink * 0.8} inkColour={garden.ink} ramp />);
    } else {
      parts.push(capsule(start, end, 0.16 * s + ink * 2, garden.ink, "tailInk"));
      parts.push(capsule(start, end, 0.16 * s, hair, "tail"));
    }
    ball("tie", tie.x, tie.y, 0.11 * s, hair);
  };
  if (look.hair === 7 && facing >= -0.2) ponytail();
  if (look.hair === 9) {
    // A bob: hair to the jaw on both sides.
    parts.push(
      <View
        key="bob"
        pointerEvents="none"
        style={[styles.abs, { left: head.x - r * 1.08 - side * 0.08 * s, top: head.y - r * (capped ? CAP_HAIR_TOP : 0.5), width: r * 2.16, height: r * (capped ? 0.65 + CAP_HAIR_TOP : 1.15), borderRadius: r * 0.45, backgroundColor: hair, borderWidth: ink, borderColor: garden.ink }]}
      />
    );
  }
  // An afro: round, or puffing out at the sides under a hat. From behind
  // it covers the back of the head (unless a cap or beanie is there).
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
  // Curls: over the hair, or just the side ones peeking out under a cap,
  // beanie or headband (which would otherwise hide under the curls).
  const curlsTucked = hat === 1 || hat === 2 || hat === 7;
  const curls = (keep: (i: number) => boolean) => {
    for (let i = 0; i < 7; i++) {
      if (!keep(i)) continue;
      const a = Math.PI * (0.05 + (i / 6) * 0.9);
      ball(`curl${i}`, head.x - Math.cos(a) * r * 0.92, head.y - Math.sin(a) * r * 0.85 + r * 0.05, 0.13 * s, hair);
    }
  };
  if (look.hair === 3 && capped) {
    for (const e of [-1, 1]) {
      ball(`curlHigh${e}`, head.x + e * r * 0.93 - side * 0.08 * s, head.y - r * 0.02, 0.13 * s, hair);
      ball(`curlLow${e}`, head.x + e * r * 0.84 - side * 0.08 * s, head.y + r * 0.32, 0.13 * s, hair);
    }
  } else if (look.hair === 3 && curlsTucked) curls((i) => i <= 1 || i >= 5);
  if (look.hair === 5 && hat === 0) {
    // Spikes standing up from behind the head, the outer ones leaning out.
    for (const k of [-2, -1, 0, 1, 2]) {
      const half = 0.27 * r;
      const tall = (0.9 - 0.1 * Math.abs(k)) * r;
      const cx = head.x + k * 0.36 * r - side * 0.1 * s;
      const base = head.y - 0.5 * r - lift + k * k * 0.06 * r;
      const spike = (grow: number, fill: string, key: string) =>
        parts.push(
          <View
            key={key}
            pointerEvents="none"
            style={[
              styles.abs,
              {
                left: cx - half - grow,
                top: base - tall - grow * 1.6,
                borderLeftWidth: half + grow,
                borderRightWidth: half + grow,
                borderBottomWidth: tall + grow * 1.6,
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
                borderBottomColor: fill,
                transform: [{ rotate: `${k * 0.4}rad` }],
              },
            ]}
          />
        );
      spike(ink, garden.ink, `spikeInk${k}`);
      spike(0, hair, `spike${k}`);
    }
  }
  if (look.hair === 14) {
    // A braid over one shoulder.
    for (let i = 0; i < 3; i++) ball(`braid${i}`, head.x + r * 0.8 * facing - side * 0.1 * s, head.y + r * (0.55 + 0.32 * i), (0.105 - 0.012 * i) * s, hair);
    ball("braidTie", head.x + r * 0.8 * facing - side * 0.1 * s, head.y + r * 1.42, 0.05 * s, fav(people.scarf));
  }
  if (look.hair === 16) {
    // A mullet: short on top, long at the back.
    parts.push(
      <View
        key="mullet"
        pointerEvents="none"
        style={[styles.abs, { left: head.x - r * 1.02 - side * 0.15 * s, top: head.y - r * 0.2, width: r * 2.04, height: r * (1.05 + 0.3 * Math.max(0, -facing)), borderRadius: r * 0.45, backgroundColor: hair, borderWidth: ink, borderColor: garden.ink }]}
      />
    );
  }
  if (look.hair === 17) {
    // Wavy: long hair with a rippled end.
    parts.push(
      <View
        key="wavy"
        pointerEvents="none"
        style={[styles.abs, { left: head.x - r * 1.08 - side * 0.1 * s, top: head.y - (capped ? r * CAP_HAIR_TOP : r * 0.4 + lift), width: r * 2.16, height: capped ? r * (0.9 + CAP_HAIR_TOP) : r * 1.3 + lift, borderRadius: r * 0.5, backgroundColor: hair, borderWidth: ink, borderColor: garden.ink }]}
      />
    );
    const ends = facing > 0.2 ? [-0.92, -0.62, 0.62, 0.92] : [-0.8, -0.27, 0.27, 0.8];
    ends.forEach((x, i) => ball(`wave${i}`, head.x - side * 0.1 * s + r * x, head.y + r * (facing > 0.2 ? 0.92 - 0.12 * Math.abs(x) : 0.9), 0.1 * s, hair));
  }
  // A flower tucked behind one ear, drawn behind the head while that ear is
  // turned away so it peeks out round the side.
  const earFlower = () => {
    const out = side < 0.3 ? 0.9 : 1.05;
    const fx = head.x + r * out * (Math.abs(facing) < 0.35 ? 0.35 * Math.sign(facing || 1) : facing);
    const fy = head.y - r * (side < 0.3 ? 0.35 : 0.62);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ball(`petal${i}`, fx + Math.cos(a) * 0.065 * s, fy + Math.sin(a) * 0.065 * s, 0.05 * s, fav(garden.blooms[0]));
    }
    ball("flowerMiddle", fx, fy, 0.04 * s, garden.blooms[1]);
  };
  if (accessory === 7 && side >= 0.3) earFlower();
  if (capped && !capPeakInFront) peak();
  if (hat === 4) {
    // The sun hat's brim behind the head.
    brimHalf("brimBack", people.hats.sunHat, "back");
  }
  if (accessory === 6 && !phonesOverAfro) headphones("back");

  // The head: ink disc, skin, the face, and the hair cap clipped to the head.
  const capDrop = 0.73 + 0.55 * facing;
  // A cap or beanie over the hair. The beanie comes lower; from behind both
  // stop partway down, so the hair shows under them.
  const hatDrop = hat === 1 ? Math.max(0.55, capDrop) : Math.max(0.3, capDrop - 0.25);
  const face = [];
  const faceOn = facing > 0.15;
  // The placement sliders: each step moves, grows or turns a part a little,
  // and the middle step is where it always was.
  const eyeStyle = lookPart(look, "eyes");
  const iris = people.eyeColours[lookPart(look, "eyeColour")] ?? people.eye;
  const eyeLift = nudge(look, "eyeY") * 0.022;
  const eyeGap = nudge(look, "eyeGap") * 0.016;
  const eyeScale = 1 + nudge(look, "eyeSize") * 0.09;
  const eyeTurn = nudge(look, "eyeTilt") * 0.12;
  const browLift = nudge(look, "browY") * 0.014;
  const browGap = nudge(look, "browGap") * 0.014;
  const browScale = 1 + nudge(look, "browSize") * 0.1;
  const browTurn = nudge(look, "browTilt") * 0.13;
  const mouthLift = nudge(look, "mouthY") * 0.018;
  const mouthScale = 1 + nudge(look, "mouthSize") * 0.1;
  const mouthTurn = nudge(look, "mouthTilt") * 0.12;
  // Their own brows: a darker shade of their hair, or of the colour they picked.
  const browPick = lookPart(look, "browColour");
  const browColour = shade(browPick > 0 ? (people.hairColours[browPick - 1] ?? hair) : hair, -0.3);
  const glasses = lookPart(look, "glasses");
  const eyeshadow = people.eyeshadow[lookPart(look, "eyeshadow") - 1];
  const lipstick = people.lipstick[lookPart(look, "lipstick") - 1];
  const spread = eyeStyle === 4 ? 0.19 : 0.15;
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
      // Glasses fit the eyes: they follow the sliders but don't tilt.
      const k = eyeScale;
      const lens = LENSES[glasses - 1] ?? LENSES[0];
      const w = lens.w * k * s;
      const h = lens.h * k * s;
      face.push(
        <View key={`lens${e}`} style={[styles.abs, { left: ex - w / 2, top: ey - h / 2, width: w, height: h, borderRadius: (Math.min(w, h) / 2) * lens.round, borderWidth: lens.rim * s, borderColor: people.glasses, backgroundColor: glasses === 3 ? people.shades : undefined }]}>
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
  if (faceOn && glasses > 0 && Math.abs(side) < 0.6) {
    // From one lens's inner rim to the other's, wherever the sliders put them.
    const lens = LENSES[glasses - 1] ?? LENSES[0];
    const gap = 2 * (spread + eyeGap) * Math.abs(facing) * s - lens.w * eyeScale * s;
    const w = Math.max(0, gap) + lens.rim * s * 2;
    face.push(<View key="bridge" style={[styles.abs, { left: icx + 0.39 * side * s - w / 2, top: icy + (0.09 - eyeLift) * s, width: w, height: 0.025 * s, backgroundColor: people.glasses }]} />);
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
  // A beanie's turned-up cuff: its lower edge, the same depth all the way round.
  const beanieTop = hatDrop + 0.26;
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
        {look.hair === 11 && hat === 0 && faceOn ? (
          // Side swept: a fringe falling over one side of the forehead.
          <View
            style={[
              styles.abs,
              {
                left: icx + (0.1 * facing + 0.36 * side) * s - r * 0.62,
                top: icy - r * 0.62,
                width: r * 1.24,
                height: r * 0.58,
                borderRadius: r,
                backgroundColor: hair,
                transform: [{ rotate: "0.35rad" }],
              },
            ]}
          />
        ) : null}
        {look.hair === 15 && !coversFringe(hat) && facing > 0.45
          ? // Curtains: parted in the middle, swept down to each temple.
            [
              ...[-1, 1].map((e) => (
                <View
                  key={`curtain${e}`}
                  style={[styles.abs, { left: icx + 0.39 * side * s + (e * 0.82 * facing - 0.35) * inner, top: icy - inner * 0.62, width: inner * 0.7, height: inner * 0.78, borderRadius: inner * 0.35, backgroundColor: hair }]}
                />
              )),
              <View
                key="parting"
                style={[styles.abs, { left: icx + 0.39 * side * s - 0.13 * inner, top: icy - inner * 0.33, width: inner * 0.26, height: inner * 0.26, transform: [{ rotate: "45deg" }], backgroundColor: skin }]}
              />,
            ]
          : null}
        {hat === 2 ? dome(hatDrop, shade(people.hats.beanie, -0.15), "cuff") : null}
        {hat === 2 ? dome(beanieTop, people.hats.beanie, "beanie") : null}
        {hat === 2 ? shine(beanieTop, people.hats.beanie, "hatShine") : null}
        {hat === 7 ? (
          // A headband across the top of the head.
          <View style={[styles.abs, { left: 0, width: iw, top: icy + (-0.62 + 0.2 * (1 - facing)) * inner, height: inner * 0.2, backgroundColor: fav(people.hats.headband) }]} />
        ) : null}
      </View>
    </View>
  );
  // Hair and hats on top of the head.
  if (look.hair === 10 && afroOver) afro();
  if (look.hair === 7 && facing < -0.2) ponytail();
  if (look.hair === 3 && !curlsTucked) curls(() => true);
  if (capped) parts.push(crown());
  if (capped && capPeakInFront) peak();
  if (look.hair === 12 && !hidesCrest(hat)) {
    // A mohawk's crest, front to back along the top.
    for (let i = 0; i < 5; i++) {
      const a = -0.95 + i * 0.475;
      ball(`crest${i}`, head.x + Math.sin(a) * r * 0.8 * side, head.y - r * (0.86 + 0.3 * Math.cos(a)) - lift, 0.11 * s, hair);
    }
  }
  if (look.hair === 13 && !coversFringe(hat)) {
    for (const e of [-1, 1]) ball(`spaceBun${e}`, head.x + e * r * 0.66 * facing - side * 0.1 * s, head.y - r * 0.8 - lift, 0.16 * s, hair);
  }
  if (hat === 2) ball("pompom", head.x - side * 0.1 * s, head.y - r * 1.02 - lift, 0.12 * s, people.hats.pompom);
  if (hat === 3) {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.08 + (i / 6) * 0.84);
      ball(`crown${i}`, head.x - Math.cos(a) * r * 0.98, head.y - r * 0.42 - lift - Math.sin(a) * r * 0.32, 0.1 * s, garden.blooms[i % garden.blooms.length]);
    }
  }
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
    // A beret in their favourite colour: a soft dome pulled down over the
    // top of the head and tipped to one side.
    const bx = head.x - side * 0.1 * s - r * 0.12;
    const colour = fav(people.hats.beret);
    parts.push(
      <View
        key="beret"
        pointerEvents="none"
        style={[styles.abs, { left: bx - r * 1.1, top: head.y - r * 1.3 - lift, width: r * 2.2, height: r * 0.95, borderTopLeftRadius: r * 1.1, borderTopRightRadius: r * 1.1, borderBottomLeftRadius: r * 0.5, borderBottomRightRadius: r * 0.5, backgroundColor: colour, borderWidth: ink, borderColor: garden.ink, transform: [{ rotate: "-9deg" }] }]}
      >
        <View style={{ position: "absolute", left: r * 0.35, top: r * 0.12, width: r * 0.6, height: r * 0.22, borderRadius: r, backgroundColor: shade(colour, 0.18) }} />
      </View>
    );
    ball("stalk", bx - r * 0.15, head.y - r * 1.33 - lift, 0.04 * s, shade(colour, -0.2));
  }
  if (hat === 6) {
    // A bow on top, to one side.
    const bx = head.x + r * 0.5 * facing - side * 0.1 * s;
    const by = head.y - r * 0.82 - lift - onAfro;
    for (const e of [-1, 1]) parts.push(<Ellipse key={`bowLoop${e}`} cx={bx + e * 0.1 * s} cy={by} rx={0.11 * s} ry={0.08 * s} fill={fav(people.hats.bow)} ink={ink} inkColour={garden.ink} />);
    ball("bowKnot", bx, by, 0.045 * s, shade(fav(people.hats.bow), -0.15));
  }
  if (hat === 8) {
    // A party hat: a cone with a pompom.
    const half = r * 0.42;
    const tall = r * 0.86;
    const base = head.y - r * 0.78 - lift - onAfro;
    parts.push(<View key="partyInk" pointerEvents="none" style={[styles.abs, { left: head.x - half - ink * 1.5, top: base - tall - ink * 2, borderLeftWidth: half + ink * 1.5, borderRightWidth: half + ink * 1.5, borderBottomWidth: tall + ink * 2, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: garden.ink }]} />);
    parts.push(<View key="party" pointerEvents="none" style={[styles.abs, { left: head.x - half, top: base - tall, borderLeftWidth: half, borderRightWidth: half, borderBottomWidth: tall, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: fav(people.hats.party) }]} />);
    ball("partyPompom", head.x, base - tall, 0.07 * s, people.hats.pompom);
  }
  if (hat === 9) {
    // A little gold crown with a jewel in their favourite colour.
    const half = r * 0.48;
    const top = head.y - r * 1.02 - lift - onAfro;
    for (const k of [-1, 0, 1]) {
      parts.push(<View key={`point${k}`} pointerEvents="none" style={[styles.abs, { left: head.x + k * r * 0.32 - r * 0.16, top: top - r * 0.3, borderLeftWidth: r * 0.16, borderRightWidth: r * 0.16, borderBottomWidth: r * 0.32, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: people.hats.crown }]} />);
    }
    parts.push(<View key="crownBand" pointerEvents="none" style={[styles.abs, { left: head.x - half, top, width: half * 2, height: r * 0.28, borderRadius: r * 0.06, backgroundColor: people.hats.crown, borderWidth: ink, borderColor: garden.ink }]} />);
    if (facing > 0.15) ball("jewel", head.x + side * r * 0.3, top + r * 0.14, 0.04 * s, fav(people.lipstick[1]));
  }
  if (accessory === 6) {
    // Headphones: a band over the top and a cup over each ear. Side-on, the
    // band is an arc along the top of the head.
    headphones("front");
  }
  if (accessory === 7 && side < 0.3) earFlower();
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

/** The name, line and emote over someone's head, above all the scenery. */
const TagView = ({
  x,
  y,
  name,
  me,
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
}) => (
  <View pointerEvents="none" style={[styles.tag, { left: x - 120, top: y - 400 }]}>
    {emote ? (
      <Text style={[styles.emote, { opacity: 1 - emoteRise * emoteRise, transform: [{ translateY: -emoteRise * 26 }] }]}>{emote}</Text>
    ) : null}
    {line ? (
      <View
        style={[
          styles.bubble,
          calm ? { opacity: lineFade } : { opacity: lineFade, transform: [{ translateY: (1 - lineFade) * 6 }, { scale: 0.92 + 0.08 * lineFade }] },
        ]}
      >
        <Text style={[styles.bubbleText, shout && styles.shoutText]}>{line}</Text>
        <View style={styles.tailRow}>
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
    <Text style={[styles.name, me && styles.meName]} numberOfLines={1}>
      {name}
    </Text>
  </View>
);

export const Tag = memo(TagView);

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  waterline: { left: 0, top: 0, width: "100%", overflow: "hidden" },
  quad: { position: "absolute", left: 0, top: 0, width: QUAD_SIZE, height: QUAD_SIZE },
  tag: { position: "absolute", width: 240, height: 400, alignItems: "center", justifyContent: "flex-end", gap: 10 },
  emote: { fontSize: 30, marginBottom: -4 },
  bubble: {
    maxWidth: 214,
    backgroundColor: hud.card,
    borderColor: hud.forest,
    borderWidth: 2.5,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
    shadowColor: hud.forest,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    marginBottom: 2,
  },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 11 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: hud.forest },
  bubbleText: { color: hud.forest, fontSize: 14.5, lineHeight: 18.5, fontWeight: "600" },
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
});
