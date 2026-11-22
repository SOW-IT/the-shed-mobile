import type { EmoteId, Look, MutualKind, Pose } from "@shared/world";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { QUAD_SIZE, type Camera, type ScreenPoint } from "./camera";
import { garden, hud, people, shade } from "./palette";
import { Ellipse, quadTransform } from "./Shapes";
import { fonts } from "@/theme";

/** Height of the top of a head, in world units, for name tags. */
export const HEAD_TOP = 1.62;

type Figure = {
  foot: ScreenPoint;
  /** Pixels per world unit, across and up. */
  s: number;
  up: number;
  bob: number;
};

/** Where someone stands on screen and how big they are. */
export const figureFor = (cam: Camera, pose: Pose, t: number, seed: number): Figure => {
  const foot = cam.project([pose.x, 0, pose.z]);
  const top = cam.project([pose.x, 1, pose.z]);
  const bob = pose.walking ? Math.abs(Math.sin(t * 9 + seed)) * 0.14 : 0;
  return { foot, s: foot.scale, up: foot.y - top.y, bob };
};

/** The screen box a tap on someone lands in. */
export const hitBox = (f: Figure, look?: Look) => ({
  // Wider for a sun hat, whose brim reaches past the shoulders.
  left: f.foot.x - (look?.hat === 4 ? 0.72 : 0.5) * f.s,
  right: f.foot.x + (look?.hat === 4 ? 0.72 : 0.5) * f.s,
  // Up to the top of a bun, pigtails or a hat.
  top: f.foot.y - (1.45 + f.bob) * f.up - 0.35 * f.s,
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
  const hands: { l?: [number, number]; r?: [number, number]; front?: boolean } = {};
  let lift = 0;
  let shake = 0;
  let sink = 0;
  let lean = 0;
  if (doing?.kind === "mutual") {
    // The garden steps them in and out; here the near hand rises (and, with
    // `reach`, meets the other's at the contact point), with a little hop at the slap.
    const k = touchK(doing.p);
    const hit = k >= 1;
    const hand: [number, number] = [doing.toward * (0.3 + 0.2 * k), 0.6 + 0.6 * k];
    if (doing.toward > 0) hands.r = hand;
    else hands.l = hand;
    lift = hit ? 0.05 : 0;
    return { hands, lift, shake, sink, lean };
  }
  if (doing?.kind !== "emote") return { hands, lift, shake, sink, lean };
  const k = swell(doing.p);
  const wob = Math.sin(t * 16);
  switch (doing.id) {
    case "wave":
      hands.r = [0.45 + wob * 0.06, 1.05];
      break;
    case "smile":
      lift = Math.abs(Math.sin(t * 6)) * 0.05 * k;
      break;
    case "laugh":
      hands.l = [-0.2, 0.42];
      hands.r = [0.2, 0.42];
      hands.front = true;
      shake = wob * 0.03 * k;
      lift = Math.abs(Math.sin(t * 12)) * 0.05 * k;
      break;
    case "cheer":
      hands.l = [-0.42, 1.15 + wob * 0.04];
      hands.r = [0.42, 1.15 - wob * 0.04];
      lift = Math.abs(Math.sin(t * 8)) * 0.18 * k;
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
      hands.l = [-0.16, 0.92];
      hands.r = [0.16, 0.92];
      hands.front = true;
      sink = 0.05 * k;
      shake = Math.sin(t * 20) * 0.01;
      break;
    case "angry":
      hands.l = [-0.46, 0.3];
      hands.r = [0.46, 0.3];
      shake = wob * 0.05 * k;
      break;
    case "sleepy":
      sink = 0.06 * k + Math.sin(t * 2) * 0.02;
      lean = 0.08 * k;
      break;
    case "pray":
      hands.l = [-0.03, 0.62];
      hands.r = [0.03, 0.62];
      hands.front = true;
      break;
  }
  return { hands, lift, shake, sink, lean };
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
  doing = null,
  shadow = true,
}: {
  figure: Figure;
  pose: Pose;
  look: Look;
  t: number;
  seed: number;
  doing?: Doing;
  shadow?: boolean;
}) => {
  const { foot, s, up } = figure;
  const move = motion(doing, t);
  const bob = figure.bob + move.lift - move.sink;
  const ink = Math.max(1.2, 0.035 * s);
  const dx = move.shake + move.lean;
  const at = (x: number, y: number) => ({ x: foot.x + (x + dx * Math.min(1, y)) * s, y: foot.y - (y + bob) * up });
  const skin = people.skins[look.skin] ?? people.skins[0];
  const hair = people.hairColours[look.hairColour] ?? people.hairColours[0];
  const shirt = people.shirts[look.shirt] ?? people.shirts[0];
  const facing = Math.cos(pose.heading);
  const side = Math.sin(pose.heading);
  const ph = t * 9 + seed;
  const swing = pose.walking ? Math.sin(ph) * 0.07 : 0;
  const head = at(0, 1.0);
  const r = 0.42 * s;
  const inner = r - ink;
  const expression: Expression =
    doing?.kind === "emote" ? EXPRESSIONS[doing.id] : doing?.kind === "mutual" ? { eyes: "happy", mouth: "open" } : { eyes: "dot", mouth: "none" };
  const parts = [];
  const ball = (key: string, x: number, y: number, rad: number, fill: string) =>
    parts.push(<Ellipse key={key} cx={x} cy={y} rx={rad} ry={rad} fill={fill} ink={ink * 0.8} inkColour={garden.ink} ramp />);

  if (shadow) {
    parts.push(
      <Ellipse key="shadow" cx={foot.x - 0.08 * s} cy={foot.y - 0.04 * s} rx={0.4 * s} ry={0.2 * s} fill={garden.shadow} />
    );
  }
  for (const e of [-1, 1]) {
    const p = { x: foot.x + 0.12 * e * s, y: foot.y - 0.08 * up };
    parts.push(<Ellipse key={`foot${e}`} cx={p.x} cy={p.y} rx={0.1 * s} ry={0.09 * s} fill={people.feet} ink={ink * 0.8} inkColour={garden.ink} />);
  }
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
  const arms = (front: boolean) => {
    for (const e of [-1, 1]) {
      const hand = e < 0 ? move.hands.l : move.hands.r;
      if (Boolean(hand && move.hands.front) !== front) continue;
      const [a, b] = arm(e);
      parts.push(capsule(a, b, 0.14 * s + ink * 2, garden.ink, `armInk${e}${front}`));
      parts.push(capsule(a, b, 0.14 * s, skin, `arm${e}${front}`));
    }
  };
  arms(false);
  // The body: a tapered shirt, ink first.
  const bodyPts = (grow: number) => [
    { x: at(-0.21, 0.7).x - grow, y: at(0, 0.7).y - grow },
    { x: at(0.21, 0.7).x + grow, y: at(0, 0.7).y - grow },
    { x: at(0.33, 0.16).x + grow, y: at(0, 0.16).y + grow },
    { x: at(-0.33, 0.16).x - grow, y: at(0, 0.16).y + grow },
  ];
  parts.push(quad(bodyPts(ink), garden.ink, "bodyInk", 30));
  parts.push(quad(bodyPts(0), shirt, "body", 30));
  parts.push(quad(bodyPts(0).map((p, i) => (i === 0 || i === 3 ? { x: p.x + 0.2 * s, y: p.y } : p)), shade(shirt, 0.12), "bodyLit", 30));
  if (accessory === 2 && facing >= 0) {
    for (const e of [-1, 1]) parts.push(capsule(at(0.13 * e, 0.69), at(0.15 * e, 0.38), 0.05 * s, people.backpackStrap, `strap${e}`));
  }
  if (accessory === 2 && facing < 0) backpack("packFront");
  if (accessory === 3) {
    parts.push(capsule(at(-0.24, 0.72), at(0.24, 0.72), 0.12 * s + ink * 2, garden.ink, "scarfInk"));
    parts.push(capsule(at(-0.24, 0.72), at(0.24, 0.72), 0.12 * s, people.scarf, "scarf"));
    parts.push(capsule(at(0.12, 0.7), at(0.16 + swing, 0.48), 0.1 * s, shade(people.scarf, -0.1), "scarfTail"));
  }
  arms(true);

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
    const ex = inner + (0.15 * e * facing + 0.39 * side) * s;
    const ey = inner + 0.11 * s;
    const eye = expression.eyes;
    if (eye === "dot" || eye === "up") {
      const look = eye === "up" ? -0.035 * s : 0;
      face.push(
        <View key={`eye${e}`} style={[styles.abs, { left: ex - 0.05 * s + (eye === "up" ? 0.02 * s : 0), top: ey - 0.07 * s + look, width: 0.1 * s, height: 0.14 * s, borderRadius: s, backgroundColor: people.eye }]}>
          <View style={[styles.abs, { right: 0.012 * s, top: 0.018 * s, width: 0.035 * s, height: 0.035 * s, borderRadius: s, backgroundColor: people.eyeShine }]} />
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
      const k = expression.blush ?? 1;
      face.push(
        <View
          key={`cheek${e}`}
          style={[
            styles.abs,
            { left: inner + cx - 0.08 * k * s, top: inner + 0.21 * s, width: 0.16 * k * s, height: 0.08 * k * s, borderRadius: s, backgroundColor: people.cheek, opacity: 0.85 },
          ]}
        />
      );
    }
  }
  if (faceOn && look.accessory === 1 && Math.abs(side) < 0.6) {
    face.push(<View key="bridge" style={[styles.abs, { left: inner + 0.39 * side * s - 0.05 * s, top: inner + 0.09 * s, width: 0.1 * s, height: 0.025 * s, backgroundColor: people.glasses }]} />);
  }
  if (faceOn && expression.mouth !== "none") {
    const mx = inner + 0.39 * side * s;
    const my = inner + 0.3 * s;
    const m = expression.mouth;
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
  const hatColour = [undefined, people.hats.cap, people.hats.beanie, undefined, people.hats.sunHat][hat];
  parts.push(
    <View
      key="head"
      pointerEvents="none"
      style={[
        styles.abs,
        { left: head.x - r, top: head.y - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: garden.ink },
      ]}
    >
      <View
        style={[
          styles.abs,
          { left: ink, top: ink, width: inner * 2, height: inner * 2, borderRadius: inner, backgroundColor: skin, overflow: "hidden" },
        ]}
      >
        {/* Shade on the side away from the sun. */}
        <View style={[styles.abs, { left: -inner * 0.25, top: inner * 0.2, width: inner * 2, height: inner * 2, borderRadius: inner, backgroundColor: shade(skin, -0.1) }]} />
        <View style={[styles.abs, { left: inner * 0.05, top: -inner * 0.1, width: inner * 2, height: inner * 2, borderRadius: inner, backgroundColor: skin }]} />
        {face}
        <View
          style={[
            styles.abs,
            {
              left: inner - inner * 1.12 - side * 0.3 * inner,
              top: inner - inner * 1.12 - capDrop * inner,
              width: inner * 2.24,
              height: inner * 2.24,
              borderRadius: inner * 1.12,
              backgroundColor: hatColour && hat !== 4 ? hatColour : hair,
            },
          ]}
        />
        <View
          style={[
            styles.abs,
            {
              left: inner * 0.9 - side * 0.3 * inner,
              top: inner - inner * 0.95 - capDrop * inner,
              width: inner * 0.7,
              height: inner * 0.5,
              borderRadius: inner,
              backgroundColor: shade(hatColour && hat !== 4 ? hatColour : hair, 0.18),
            },
          ]}
        />
        {hat === 2 ? (
          <View style={[styles.abs, { left: 0, width: inner * 2, top: inner - capDrop * inner + inner * 0.02, height: inner * 0.28, backgroundColor: shade(people.hats.beanie, -0.15) }]} />
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
  return <>{parts}</>;
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
    a.look.skin === b.look.skin &&
    a.look.hair === b.look.hair &&
    a.look.hairColour === b.look.hairColour &&
    a.look.shirt === b.look.shirt &&
    a.look.hat === b.look.hat &&
    a.look.accessory === b.look.accessory &&
    a.t === b.t &&
    a.seed === b.seed &&
    a.shadow === b.shadow &&
    sameDoing(a.doing ?? null, b.doing ?? null)
);

/** The name, line and emote over someone's head, above all the scenery. */
export const Tag = ({
  x,
  y,
  name,
  me,
  line,
  far,
  emote,
  emoteRise,
}: {
  x: number;
  y: number;
  name: string;
  me: boolean;
  line?: string;
  far: boolean;
  emote?: string;
  /** 0 when the emote starts, 1 when it's gone. */
  emoteRise: number;
}) => (
  <View pointerEvents="none" style={[styles.tag, { left: x - 120, top: y - 400 }]}>
    {emote ? (
      <Text style={[styles.emote, { opacity: 1 - emoteRise * emoteRise, transform: [{ translateY: -emoteRise * 26 }] }]}>{emote}</Text>
    ) : null}
    {line ? (
      <View style={[styles.bubble, far && styles.farBubble]}>
        <Text style={[styles.bubbleText, far && { color: hud.farText }]}>{line}</Text>
        <View style={[styles.tailInk, far && { borderTopColor: hud.farEdge }]} />
        <View style={[styles.tail, far && { borderTopColor: hud.farBubble }]} />
      </View>
    ) : null}
    <Text style={[styles.name, me && styles.meName, far && !me && { opacity: 0.8 }]} numberOfLines={1}>
      {name}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  abs: { position: "absolute" },
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
  farBubble: { backgroundColor: hud.farBubble, borderColor: hud.farEdge, borderStyle: "dashed", shadowOpacity: 0 },
  bubbleText: { color: hud.forest, fontSize: 14.5, lineHeight: 18.5, fontWeight: "600" },
  tailInk: {
    position: "absolute",
    bottom: -14,
    left: "50%",
    marginLeft: -9,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: hud.forest,
  },
  tail: {
    position: "absolute",
    bottom: -8,
    left: "50%",
    marginLeft: -6,
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
