import type { Look, Pose } from "@shared/world";
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
export const hitBox = (f: Figure) => ({
  left: f.foot.x - 0.5 * f.s,
  right: f.foot.x + 0.5 * f.s,
  top: f.foot.y - (1.45 + f.bob) * f.up,
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

/**
 * A chibi avatar in style C: big round head, hair cap, dot eyes and blush,
 * a little shirt and stubby arms, with ink outlines. Turned by the heading of
 * the latest walk; bobs while walking.
 */
export const Avatar = ({ figure, pose, look, t, seed }: { figure: Figure; pose: Pose; look: Look; t: number; seed: number }) => {
  const { foot, s, up, bob } = figure;
  const ink = Math.max(1.2, 0.035 * s);
  const at = (x: number, y: number) => ({ x: foot.x + x * s, y: foot.y - (y + bob) * up });
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
  const parts = [];

  parts.push(
    <Ellipse key="shadow" cx={foot.x - 0.08 * s} cy={foot.y - 0.04 * s} rx={0.4 * s} ry={0.2 * s} fill={garden.shadow} />
  );
  for (const e of [-1, 1]) {
    const p = { x: foot.x + 0.12 * e * s, y: foot.y - 0.08 * up };
    parts.push(<Ellipse key={`foot${e}`} cx={p.x} cy={p.y} rx={0.1 * s} ry={0.09 * s} fill={people.feet} ink={ink * 0.8} inkColour={garden.ink} />);
  }
  // Arms behind the body.
  const arm = (e: number) => [at(0.26 * e, 0.6), at(0.4 * e, 0.34 + swing * e)] as const;
  for (const e of [-1, 1]) {
    const [a, b] = arm(e);
    parts.push(capsule(a, b, 0.14 * s + ink * 2, garden.ink, `armInk${e}`));
    parts.push(capsule(a, b, 0.14 * s, skin, `arm${e}`));
  }
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

  // Hair that sits behind the head: a bun, or long hair down to the shoulders.
  if (look.hair === 1) {
    const bun = { x: head.x - side * 0.15 * s, y: head.y - 0.46 * s };
    parts.push(<Ellipse key="bun" cx={bun.x} cy={bun.y} rx={0.17 * s} ry={0.17 * s} fill={hair} ink={ink} inkColour={garden.ink} ramp />);
  }
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

  // The head: ink disc, skin, and the hair cap clipped to the head.
  const capDrop = 0.73 + 0.55 * facing;
  const face = [];
  for (const e of [-1, 1]) {
    const depth = -0.15 * e * side + 0.39 * facing;
    if (depth < 0.08) continue;
    const ex = (0.15 * e * facing + 0.39 * side) * s;
    face.push(
      <View
        key={`eye${e}`}
        style={[
          styles.abs,
          { left: inner + ex - 0.05 * s, top: inner + 0.04 * s, width: 0.1 * s, height: 0.14 * s, borderRadius: s, backgroundColor: people.eye },
        ]}
      >
        <View style={[styles.abs, { right: 0.012 * s, top: 0.018 * s, width: 0.035 * s, height: 0.035 * s, borderRadius: s, backgroundColor: people.eyeShine }]} />
      </View>
    );
    const cx = (0.26 * e * facing + 0.33 * side) * s;
    if (-0.26 * e * side + 0.33 * facing > 0.08) {
      face.push(
        <View
          key={`cheek${e}`}
          style={[
            styles.abs,
            { left: inner + cx - 0.08 * s, top: inner + 0.17 * s, width: 0.16 * s, height: 0.08 * s, borderRadius: s, backgroundColor: people.cheek, opacity: 0.85 },
          ]}
        />
      );
    }
  }
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
              backgroundColor: hair,
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
              backgroundColor: shade(hair, 0.18),
            },
          ]}
        />
      </View>
    </View>
  );
  return <>{parts}</>;
};

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
