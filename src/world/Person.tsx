import { bodyScale, lookPart, type EmoteId, type Look, type MutualKind, type Pose } from "@shared/world";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { QUAD_SIZE, type Camera, type ScreenPoint } from "./camera";
import { garden, hud, people, shade } from "./palette";
import { Ellipse, quadTransform } from "./Shapes";
import { strideBob, strideSwing } from "./gait";
import { fonts } from "@/theme";

/** The top of this person's head: taller people's tags sit higher. */
export const headTop = (look: Look) => 1.0 * bodyScale(look).height + 0.62;

/** Face shapes: width and height (of a round head), and corner rounding at top and bottom. */
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
  const face = 0.42 * (FACE_SHAPES[lookPart(look, "face")] ?? FACE_SHAPES[0]).h + 0.05;
  const hat = lookPart(look, "hat");
  const above = Math.max(face, look.hair === 1 ? 0.63 : 0, look.hair === 10 ? 0.65 : 0, hat === 4 ? 0.5 : 0);
  const spikes = look.hair === 5 && hat === 0 ? 1.52 * head + 0.06 : 0;
  return Math.max(head + above, spikes);
};

type Stride = { stridePhase: number; strideAmp: number };

const ON_BENCH_ABOVE_SEAT = 0.1;
const ON_GROUND_SINK = 0.08;
export const SWIM_SINK = 0.4;

export const sitRise = (seatHeight: number | undefined) =>
  seatHeight === undefined ? 0 : seatHeight > 0 ? seatHeight - ON_BENCH_ABOVE_SEAT : -ON_GROUND_SINK;

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
  top: f.foot.y - ((look ? bodyScale(look).height : 1) + 0.45 + f.bob) * f.up - 0.35 * f.s,
  // Wider for a sun hat, whose brim reaches past the shoulders.
  left: f.foot.x - (look?.hat === 4 ? 0.72 : 0.5) * f.s,
  right: f.foot.x + (look?.hat === 4 ? 0.72 : 0.5) * f.s,
  bottom: f.foot.y + 0.1 * f.s,
});

const quad = (pts: { x: number; y: number }[], fill: string, key: string, radius = 0) => (
  <View
    key={key}
    pointerEvents="none"
    style={[styles.quad, { backgroundColor: fill, borderRadius: radius, transform: quadTransform(pts) }]}
  />
);

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
type Mouth = "none" | "smile" | "open" | "o" | "frown" | "flat";
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
  const bob = figure.bob + move.lift - move.sink + sitRise(sit) - (swim ? SWIM_SINK : 0);
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
  const corner = (k: number, size: number) => (Math.min(size === hw ? hw : iw, size === hw ? hh : ih) / 2) * k;
  const expression: Expression =
    doing?.kind === "emote" ? EXPRESSIONS[doing.id] : doing?.kind === "mutual" ? { eyes: "happy", mouth: "open" } : { eyes: "dot", mouth: "none" };
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
      parts.push(<Ellipse key={`foot${e}`} cx={p.x} cy={p.y} rx={0.1 * s} ry={0.09 * s} fill={people.feet} ink={ink * 0.8} inkColour={garden.ink} />);
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
  // The body: a tapered shirt, ink first.
  const bodyPts = (grow: number) => [
    { x: at(-0.21, 0.7).x - grow, y: at(0, 0.7).y - grow },
    { x: at(0.21, 0.7).x + grow, y: at(0, 0.7).y - grow },
    { x: at(0.33, 0.16).x + grow, y: at(0, 0.16).y + grow },
    { x: at(-0.33, 0.16).x - grow, y: at(0, 0.16).y + grow },
  ];
  const outfit = lookPart(look, "outfit");
  const halfWidth = (y: number) => 0.21 + (0.12 * (0.7 - y)) / 0.54;
  const panel = (top: number, bottom: number, topHalf: number, bottomHalf: number, grow: number) => [
    { x: at(-topHalf, top).x - grow, y: at(0, top).y - grow },
    { x: at(topHalf, top).x + grow, y: at(0, top).y - grow },
    { x: at(bottomHalf, bottom).x + grow, y: at(0, bottom).y + grow },
    { x: at(-bottomHalf, bottom).x - grow, y: at(0, bottom).y + grow },
  ];
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
    piece("pocket", shade(shirt, -0.14), 0.38, 0.2, 0.15, 0.19, 10);
    for (const e of [-1, 1]) parts.push(capsule(at(0.06 * e, 0.68), at(0.07 * e, 0.52), 0.03 * s, people.drawstring, `string${e}`));
  }
  if (accessory === 2 && facing >= 0) {
    for (const e of [-1, 1]) parts.push(capsule(at(0.13 * e, 0.69), at(0.15 * e, 0.38), 0.05 * s, people.backpackStrap, `strap${e}`));
  }
  if (accessory === 2 && facing < 0) backpack("packFront");
  if (accessory === 3) {
    parts.push(capsule(at(-0.24, 0.72), at(0.24, 0.72), 0.12 * s + ink * 2, garden.ink, "scarfInk"));
    parts.push(capsule(at(-0.24, 0.72), at(0.24, 0.72), 0.12 * s, people.scarf, "scarf"));
    parts.push(capsule(at(0.12, 0.7), at(0.16 + swing, 0.48), 0.1 * s, shade(people.scarf, -0.1), "scarfTail"));
  }
  if (feetInFront) feet();
  arms("front");

  if (outfit === 5) ball("hood", head.x - side * 0.1 * s, head.y + r * 0.42, r * 0.86, shade(shirt, -0.1));
  // Hair that sits behind the head: a bun, or long hair down to the shoulders.
  if (look.hair === 1) ball("bun", head.x - side * 0.15 * s, head.y - 0.46 * s, 0.17 * s, hair);
  if (look.hair === 2) {
    parts.push(
      <View
        key="long"
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: head.x - r * 1.05 - side * 0.1 * s,
            top: head.y - r * 0.4,
            width: r * 2.1,
            height: r * 1.35,
            borderRadius: r * 0.5,
            backgroundColor: hair,
            borderWidth: ink,
            borderColor: garden.ink,
          },
        ]}
      />
    );
  }
  if (look.hair === 7) {
    // A ponytail behind the head, swinging a little as they walk.
    ball("tie", head.x - side * 0.3 * s, head.y - r * 0.55, 0.11 * s, hair);
    parts.push(capsule(at(-side * 0.32, 1.12), at(-side * 0.42 + swing, 0.82), 0.16 * s, hair, "tail"));
  }
  if (look.hair === 9) {
    // A bob: hair to the jaw on both sides.
    parts.push(
      <View
        key="bob"
        pointerEvents="none"
        style={[styles.abs, { left: head.x - r * 1.08 - side * 0.08 * s, top: head.y - r * 0.5, width: r * 2.16, height: r * 1.15, borderRadius: r * 0.45, backgroundColor: hair, borderWidth: ink, borderColor: garden.ink }]}
      />
    );
  }
  if (look.hair === 10) ball("afro", head.x - side * 0.08 * s, head.y - r * 0.25, r * 1.28, hair);
  const hat = look.hat ?? 0;
  if (hat === 4) {
    // The sun hat's brim behind the head.
    parts.push(<Ellipse key="brimBack" cx={head.x} cy={head.y - r * 0.5} rx={r * 1.65} ry={r * 0.42} fill={people.hats.sunHat} ink={ink} inkColour={garden.ink} />);
  }

  // The head: ink disc, skin, the face, and the hair cap clipped to the head.
  const capDrop = 0.73 + 0.55 * facing - (hat === 2 ? 0.25 : 0);
  const face = [];
  const faceOn = facing > 0.15;
  for (const e of [-1, 1]) {
    const depth = -0.15 * e * side + 0.39 * facing;
    if (depth < 0.08) continue;
    // Their eye style spaces the eyes; "wide" sets them further apart.
    const eyeStyle = lookPart(look, "eyes");
    const spread = eyeStyle === 4 ? 0.19 : 0.15;
    const ex = icx + (spread * e * facing + 0.39 * side) * s;
    const ey = icy + 0.11 * s;
    const eye = expression.eyes;
    const iris = people.eyeColours[lookPart(look, "eyeColour")] ?? people.eye;
    if (eye === "dot" && eyeStyle === 1) {
      // Round: a white eye with a coloured pupil.
      face.push(
        <View key={`eye${e}`} style={[styles.abs, { left: ex - 0.07 * s, top: ey - 0.08 * s, width: 0.14 * s, height: 0.16 * s, borderRadius: s, backgroundColor: people.eyeShine, borderWidth: 0.02 * s, borderColor: people.eye, alignItems: "center", justifyContent: "center" }]}>
          <View style={{ width: 0.075 * s, height: 0.09 * s, borderRadius: s, backgroundColor: iris }} />
        </View>
      );
    } else if (eye === "dot" && eyeStyle === 2) {
      // Sleepy: a dot under a heavy lid.
      face.push(
        <View key={`eye${e}`} style={[styles.abs, { left: ex - 0.05 * s, top: ey - 0.04 * s, width: 0.1 * s, height: 0.09 * s, borderBottomLeftRadius: s, borderBottomRightRadius: s, backgroundColor: iris, borderTopWidth: 0.025 * s, borderTopColor: people.eye }]} />
      );
    } else if (eye === "dot" && eyeStyle === 5) {
      // Narrow: a flat oval.
      face.push(<View key={`eye${e}`} style={[styles.abs, { left: ex - 0.065 * s, top: ey - 0.025 * s, width: 0.13 * s, height: 0.05 * s, borderRadius: s, backgroundColor: iris }]} />);
    } else if (eye === "dot" || eye === "up") {
      const lookUp = eye === "up" ? -0.035 * s : 0;
      face.push(
        <View key={`eye${e}`} style={[styles.abs, { left: ex - 0.05 * s + (eye === "up" ? 0.02 * s : 0), top: ey - 0.07 * s + lookUp, width: 0.1 * s, height: 0.14 * s, borderRadius: s, backgroundColor: iris }]}>
          <View style={[styles.abs, { right: 0.012 * s, top: 0.018 * s, width: 0.035 * s, height: 0.035 * s, borderRadius: s, backgroundColor: people.eyeShine }]} />
          {eyeStyle === 3 ? (
            // Sparkly: a second, smaller shine.
            <View style={[styles.abs, { left: 0.015 * s, bottom: 0.02 * s, width: 0.022 * s, height: 0.022 * s, borderRadius: s, backgroundColor: people.eyeShine }]} />
          ) : null}
        </View>
      );
    } else if (eye === "happy") {
      face.push(
        <View
          key={`eye${e}`}
          style={[styles.abs, { left: ex - 0.06 * s, top: ey - 0.05 * s, width: 0.12 * s, height: 0.12 * s, borderRadius: s, borderTopWidth: 0.03 * s, borderLeftWidth: 0.03 * s, borderRightWidth: 0.03 * s, borderBottomWidth: 0, borderColor: people.eye, borderBottomColor: "transparent", borderLeftColor: "transparent", borderRightColor: "transparent" }]}
        />
      );
    } else if (eye === "closed") {
      face.push(<View key={`eye${e}`} style={[styles.abs, { left: ex - 0.055 * s, top: ey, width: 0.11 * s, height: 0.028 * s, borderRadius: s, backgroundColor: people.eye }]} />);
    } else {
      face.push(
        <View key={`eye${e}`} style={[styles.abs, { left: ex - 0.075 * s, top: ey - 0.09 * s, width: 0.15 * s, height: 0.17 * s, borderRadius: s, backgroundColor: people.eyeShine, borderWidth: 0.022 * s, borderColor: people.eye, alignItems: "center", justifyContent: "center" }]}>
          <View style={{ width: 0.06 * s, height: 0.07 * s, borderRadius: s, backgroundColor: people.eye }} />
        </View>
      );
    }
    if (expression.brows) {
      const tilt = (expression.brows === "angry" ? 0.45 : -0.4) * -e;
      face.push(<View key={`brow${e}`} style={[styles.abs, { left: ex - 0.07 * s, top: ey - 0.16 * s, width: 0.14 * s, height: 0.03 * s, borderRadius: s, backgroundColor: people.eye, transform: [{ rotate: `${tilt}rad` }] }]} />);
    } else {
      // Their own brows, in a darker shade of their hair.
      const browStyle = lookPart(look, "brows");
      const browColour = shade(hair, -0.3);
      if (browStyle === 1) {
        face.push(<View key={`brow${e}`} style={[styles.abs, { left: ex - 0.065 * s, top: ey - 0.18 * s, width: 0.13 * s, height: 0.06 * s, borderRadius: s, borderTopWidth: 0.022 * s, borderColor: "transparent", borderTopColor: browColour }]} />);
      } else if (browStyle >= 2) {
        const thick = browStyle === 4 ? 0.045 : 0.026;
        const tilt = browStyle === 3 ? 0.28 * -e : 0;
        face.push(<View key={`brow${e}`} style={[styles.abs, { left: ex - 0.07 * s, top: ey - 0.17 * s, width: 0.14 * s, height: thick * s, borderRadius: s, backgroundColor: browColour, transform: [{ rotate: `${tilt}rad` }] }]} />);
      }
    }
    if (expression.tears) {
      const drop = ((t * 1.6 + (e > 0 ? 0.5 : 0)) % 1) * 0.18 * s;
      face.push(<View key={`tear${e}`} style={[styles.abs, { left: ex - 0.025 * s, top: ey + 0.05 * s + drop, width: 0.05 * s, height: 0.07 * s, borderRadius: s, backgroundColor: people.tear }]} />);
    }
    if (look.accessory === 1) {
      face.push(<View key={`lens${e}`} style={[styles.abs, { left: ex - 0.1 * s, top: ey - 0.1 * s, width: 0.2 * s, height: 0.2 * s, borderRadius: s, borderWidth: 0.028 * s, borderColor: people.glasses }]} />);
    }
    const cx = (0.26 * e * facing + 0.33 * side) * s;
    if (-0.26 * e * side + 0.33 * facing > 0.08) {
      // Their blush (none, light or rosy), made stronger by some emotes.
      const blush = lookPart(look, "blush");
      const k = (expression.blush ?? 1) * (blush === 2 ? 1.3 : 1);
      if (blush > 0 || expression.blush) {
        face.push(
          <View
            key={`cheek${e}`}
            style={[
              styles.abs,
              { left: icx + cx - 0.08 * k * s, top: icy + 0.21 * s, width: 0.16 * k * s, height: 0.08 * k * s, borderRadius: s, backgroundColor: people.cheek, opacity: blush === 2 ? 1 : 0.85 },
            ]}
          />
        );
      }
      if (lookPart(look, "freckles") === 1) {
        for (const [fx, fy] of [[-0.04, 0.17], [0.03, 0.19], [-0.005, 0.225]]) {
          face.push(<View key={`freckle${e}${fx}`} style={[styles.abs, { left: icx + cx + fx * s, top: icy + fy * s, width: 0.022 * s, height: 0.022 * s, borderRadius: s, backgroundColor: people.freckle }]} />);
        }
      }
    }
  }
  if (faceOn && look.accessory === 1 && Math.abs(side) < 0.6) {
    face.push(<View key="bridge" style={[styles.abs, { left: icx + 0.39 * side * s - 0.05 * s, top: icy + 0.09 * s, width: 0.1 * s, height: 0.025 * s, backgroundColor: people.glasses }]} />);
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
  // Beard, stubble or a moustache.
  const beard = lookPart(look, "beard");
  if (faceOn && beard === 1) {
    face.push(<View key="stubble" style={[styles.abs, { left: icx - iw * 0.42 + 0.3 * side * s, top: icy + 0.2 * s, width: iw * 0.84, height: ih * 0.45, borderRadius: s, backgroundColor: shade(hair, 0.1), opacity: 0.28 }]} />);
  }
  if (faceOn && beard === 2) {
    face.push(<View key="beard" style={[styles.abs, { left: icx - iw * 0.48 + 0.3 * side * s, top: icy + 0.2 * s, width: iw * 0.96, height: ih * 0.5, borderRadius: s, backgroundColor: hair }]} />);
  }
  if (faceOn && (beard === 3 || beard === 2)) {
    face.push(<View key="moustache" style={[styles.abs, { left: icx + 0.39 * side * s - 0.09 * s, top: icy + 0.235 * s, width: 0.18 * s, height: 0.05 * s, borderRadius: s, backgroundColor: shade(hair, -0.1) }]} />);
  }
  // Their own mouth unless an emote has one.
  const idleMouth: Mouth[] = ["none", "smile", "open", "o", "flat"];
  const mouthShape = expression.mouth !== "none" ? expression.mouth : (idleMouth[lookPart(look, "mouth")] ?? "none");
  if (faceOn && mouthShape !== "none") {
    const mx = icx + 0.39 * side * s;
    const my = icy + 0.3 * s;
    const m = mouthShape;
    const w = (m === "o" ? 0.08 : m === "open" ? 0.17 : 0.13) * s;
    const mouth =
      m === "smile"
        ? { height: 0.07 * s, borderBottomWidth: 0.026 * s, borderColor: "transparent", borderBottomColor: people.eye, borderLeftWidth: 0.026 * s, borderRightWidth: 0.026 * s, borderRadius: s, top: my - 0.06 * s }
        : m === "frown"
          ? { height: 0.07 * s, borderTopWidth: 0.026 * s, borderColor: "transparent", borderTopColor: people.eye, borderLeftWidth: 0.026 * s, borderRightWidth: 0.026 * s, borderRadius: s, top: my }
          : m === "open"
            ? { height: 0.1 * s, backgroundColor: people.mouth, borderBottomLeftRadius: s, borderBottomRightRadius: s, top: my - 0.03 * s }
            : m === "o"
              ? { height: 0.09 * s, backgroundColor: people.mouth, borderRadius: s, top: my - 0.03 * s }
              : { height: 0.025 * s, backgroundColor: people.eye, borderRadius: s, top: my };
    face.push(<View key="mouth" style={[styles.abs, { left: mx - w / 2, width: w }, mouth]} />);
  }
  // The cap and beanie are drawn as the hair cap in the hat's colour. The sun
  // hat has its own brim and crown, so under it hair is just hair (or none).
  const capHat = [undefined, people.hats.cap, people.hats.beanie][hat];
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
        {look.hair === 8 && !capHat ? null : (
        <View
          style={[
            styles.abs,
            {
              left: icx - inner * 1.12 - side * 0.3 * inner,
              top: icy - inner * 1.12 - (capDrop + (look.hair === 6 && !capHat ? 0.22 : 0)) * inner,
              width: inner * 2.24,
              height: inner * 2.24,
              borderRadius: inner * 1.12,
              backgroundColor: capHat ?? (look.hair === 6 ? shade(hair, 0.25) : hair),
            },
          ]}
        />
        )}
        {look.hair === 8 && !capHat ? null : (
        <View
          style={[
            styles.abs,
            {
              left: icx - inner * 0.1 - side * 0.3 * inner,
              top: icy - inner * 0.95 - capDrop * inner,
              width: inner * 0.7,
              height: inner * 0.5,
              borderRadius: inner,
              backgroundColor: shade(capHat ?? hair, 0.18),
            },
          ]}
        />
        )}
        {hat === 2 ? (
          <View style={[styles.abs, { left: 0, width: iw, top: icy - capDrop * inner + inner * 0.02, height: inner * 0.28, backgroundColor: shade(people.hats.beanie, -0.15) }]} />
        ) : null}
      </View>
    </View>
  );
  // Hair and hats on top of the head.
  if (look.hair === 3) {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.05 + (i / 6) * 0.9);
      ball(`curl${i}`, head.x - Math.cos(a) * r * 0.92, head.y - Math.sin(a) * r * 0.85 + r * 0.05, 0.13 * s, hair);
    }
  }
  if (look.hair === 11 && hat === 0 && facing > -0.2) {
    // Side swept: a fringe falling to one side.
    parts.push(<Ellipse key="fringe" cx={head.x + (0.12 + side * 0.25) * s} cy={head.y - r * 0.42} rx={r * 0.62} ry={r * 0.3} fill={hair} ink={ink} inkColour={garden.ink} />);
  }
  if (look.hair === 5 && hat === 0) {
    for (const k of [-1, 0, 1]) {
      parts.push(capsule(at(k * 0.12, 1.36 - Math.abs(k) * 0.04), at(k * 0.2, 1.52 - Math.abs(k) * 0.06), 0.11 * s, hair, `spike${k}`));
    }
  }
  if (hat === 1 && facing > -0.3) {
    // The cap's peak points the way they face.
    parts.push(<Ellipse key="peak" cx={head.x + side * r * 0.6} cy={head.y - r * 0.38 + (1 - facing) * r * 0.1} rx={r * (0.55 + 0.25 * facing)} ry={r * 0.18} fill={shade(people.hats.cap, -0.12)} ink={ink} inkColour={garden.ink} />);
  }
  if (hat === 2) ball("pompom", head.x - side * 0.1 * s, head.y - r * 1.02, 0.12 * s, people.hats.pompom);
  if (hat === 3) {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.08 + (i / 6) * 0.84);
      ball(`crown${i}`, head.x - Math.cos(a) * r * 0.98, head.y - r * 0.42 - Math.sin(a) * r * 0.32, 0.1 * s, garden.blooms[i % garden.blooms.length]);
    }
  }
  if (hat === 4) {
    parts.push(<Ellipse key="brimFront" cx={head.x} cy={head.y - r * 0.42} rx={r * 1.6} ry={r * 0.22} fill={shade(people.hats.sunHat, 0.08)} ink={ink} inkColour={garden.ink} />);
    parts.push(
      <View key="crownTop" pointerEvents="none" style={[styles.abs, { left: head.x - r * 0.75, top: head.y - r * 1.15, width: r * 1.5, height: r * 0.72, borderTopLeftRadius: r, borderTopRightRadius: r, backgroundColor: people.hats.sunHat, borderWidth: ink, borderColor: garden.ink }]} />
    );
    parts.push(<View key="band" pointerEvents="none" style={[styles.abs, { left: head.x - r * 0.75, top: head.y - r * 0.62, width: r * 1.5, height: r * 0.16, backgroundColor: people.hats.band }]} />);
  }
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

const sameLook = (a: Look, b: Look) =>
  a === b || (Object.keys({ ...a, ...b }) as (keyof Look)[]).every((k) => a[k] === b[k]);

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
    sameDoing(a.doing ?? null, b.doing ?? null)
);

const TYPING_DOTS = [0, 1, 2];

/** The name, line and emote over someone's head, above all the scenery. */
export const Tag = ({
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
}) => (
  <View pointerEvents="none" style={[styles.tag, { left: x - 120, top: y - 400 }]}>
    {emote ? (
      <Text style={[styles.emote, { opacity: 1 - emoteRise * emoteRise, transform: [{ translateY: -emoteRise * 26 }] }]}>{emote}</Text>
    ) : null}
    {line ? (
      <View
        style={[
          styles.bubble,
          { opacity: lineFade, transform: [{ translateY: (1 - lineFade) * 6 }, { scale: 0.92 + 0.08 * lineFade }] },
        ]}
      >
        <Text style={styles.bubbleText}>{line}</Text>
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
