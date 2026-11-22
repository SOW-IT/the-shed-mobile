import {
  BUBBLE_MS,
  canHear,
  EMOTE_MS,
  hash,
  HEAR_RADIUS,
  OBSTACLES,
  posAt,
  tagName,
  type Look,
  type Pose,
  type Walk,
} from "@shared/world";
import { Fragment, memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { makeCamera } from "./camera";
import { buildGarden, type Prim, type Prop } from "./gardenScene";
import { garden } from "./palette";
import { Avatar, figureFor, HEAD_TOP, hitBox, Tag } from "./Person";
import { Ellipse, Shape } from "./Shapes";

type GardenPerson = {
  memberId: string;
  name: string;
  look: Look;
  me: boolean;
  walk: Walk | null;
  say?: { text: string; at: number };
  act?: { emote: string; at: number };
  muted: boolean;
};

/** What the camera looks at: style C's framing of the courtyard. */
const FOCUS = { x: 0, z: -2.6 };
const ARCADE = OBSTACLES.find((o) => o.id === "arcade")!;

const Layer = memo(function Layer({ prims }: { prims: Prim[] }) {
  return (
    <>
      {prims.map((prim) => (
        <Shape key={prim.key} prim={prim} />
      ))}
    </>
  );
});

const PropView = memo(function PropView({ prop }: { prop: Prop }) {
  return <Layer prims={prop.prims} />;
});

/** Redraws every animation frame while `on`, and once a second otherwise. */
const useClock = (on: boolean): number => {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    if (!on) {
      const id = setInterval(() => setT(Date.now()), 1000);
      return () => clearInterval(id);
    }
    let frame = 0;
    const tick = () => {
      setT(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return t;
};

/**
 * The garden drawn with plain views: no GL, so it runs on the Simulator and
 * ships over the air. Taps on the ground walk; taps on a person open them.
 */
export const Garden = ({
  people,
  serverNow,
  target,
  onTapGround,
  onTapPerson,
  onTapArcade,
}: {
  people: GardenPerson[];
  serverNow: () => number;
  /** Where you're walking to, for the marker. */
  target: { x: number; z: number } | null;
  onTapGround: (x: number, z: number) => void;
  onTapPerson: (memberId: string) => void;
  onTapArcade: () => void;
}) => {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };
  const cam = useMemo(() => size && makeCamera(size.width, size.height, FOCUS), [size]);
  const scene = useMemo(() => cam && buildGarden(cam), [cam]);

  const now = serverNow();
  const poses = people.map((p) => (p.walk ? posAt(p.walk, now) : null));
  const me = people.findIndex((p) => p.me);
  const mePose = me >= 0 ? poses[me] : null;
  const recent = (at: number | undefined, ms: number) => at !== undefined && now - at < ms;
  const animating =
    poses.some((pose) => pose?.walking) ||
    people.some((p) => recent(p.act?.at, EMOTE_MS)) ||
    (target !== null && mePose !== null && Math.hypot(mePose.x - target.x, mePose.z - target.z) > 0.05);
  const t = useClock(animating) / 1000;

  const onPress = (e: GestureResponderEvent) => {
    if (!cam || !scene) return;
    // On the web onPress comes from a DOM click, which has offsetX, not locationX.
    const web = e.nativeEvent as unknown as { offsetX?: number; offsetY?: number };
    const x = e.nativeEvent.locationX ?? web.offsetX;
    const y = e.nativeEvent.locationY ?? web.offsetY;
    if (typeof x !== "number" || typeof y !== "number") return;
    // People first, nearest the camera first.
    const hits = people
      .map((p, i) => ({ p, pose: poses[i] }))
      .filter((h): h is { p: GardenPerson; pose: Pose } => h.pose !== null && !h.p.me)
      .map((h) => ({ ...h, box: hitBox(figureFor(cam, h.pose, t, hash(h.p.memberId) % 7)), depth: cam.project([h.pose.x, 0, h.pose.z]).depth }))
      .filter((h) => x >= h.box.left && x <= h.box.right && y >= h.box.top && y <= h.box.bottom)
      .sort((a, b) => a.depth - b.depth);
    if (hits[0]) return onTapPerson(hits[0].p.memberId);
    const spot = cam.ground(x, y);
    if (!spot) return;
    if (Math.hypot(spot.x - ARCADE.x, spot.z - ARCADE.z) < 0.75) return onTapArcade();
    onTapGround(spot.x, spot.z);
  };

  if (!cam || !scene) return <View style={styles.fill} onLayout={onLayout} />;

  // Props and people, far to near.
  const actors: { depth: number; key: string; node: ReactNode }[] = scene.props.map((prop) => ({
    depth: prop.depth,
    key: prop.id,
    node: <PropView prop={prop} />,
  }));
  const tags: ReactNode[] = [];
  people.forEach((p, i) => {
    const pose = poses[i];
    if (!pose) return;
    const seed = hash(p.memberId) % 7;
    const figure = figureFor(cam, pose, t, seed);
    actors.push({
      depth: figure.foot.depth,
      key: p.memberId,
      node: <Avatar figure={figure} pose={pose} look={p.look} t={t} seed={seed} />,
    });
    const far = !p.me && mePose !== null && !canHear(mePose, pose);
    const line = !p.muted && recent(p.say?.at, BUBBLE_MS) ? p.say?.text : undefined;
    const emote = !p.muted && recent(p.act?.at, EMOTE_MS) ? p.act?.emote : undefined;
    const head = cam.project([pose.x, HEAD_TOP + figure.bob, pose.z]);
    tags.push(
      <Tag
        key={p.memberId}
        x={head.x}
        y={head.y}
        name={p.me ? "You" : tagName(p.name)}
        me={p.me}
        line={line}
        far={far}
        emote={emote}
        emoteRise={emote && p.act ? (now - p.act.at) / EMOTE_MS : 0}
      />
    );
  });
  // The tap marker: a spinning flower with a bobbing pin, until you arrive.
  if (target && mePose && Math.hypot(mePose.x - target.x, mePose.z - target.z) > 0.05) {
    const base = cam.project([target.x, 0, target.z]);
    const pin = cam.project([target.x, 0.85 + Math.sin(t * 4) * 0.1, target.z]);
    const k = (t * 0.9) % 1;
    actors.push({
      depth: base.depth,
      key: "marker",
      node: (
        <>
          <Ellipse cx={base.x} cy={base.y} rx={(0.6 + k * 0.9) * 0.6 * base.scale} ry={(0.6 + k * 0.9) * 0.36 * base.scale} fill="transparent" ink={2} inkColour={garden.ring} dashed={false} opacity={1 - k} />
          {[0, 1, 2, 3, 4, 5].map((n) => {
            const a = (n / 6) * Math.PI * 2 + t * 0.8;
            const p = cam.project([target.x + Math.cos(a) * 0.24, 0.06, target.z + Math.sin(a) * 0.24]);
            return <Ellipse key={`petal${n}`} cx={p.x} cy={p.y} rx={0.14 * p.scale} ry={0.08 * p.scale} fill={garden.markerPetal} ink={1.2} inkColour={garden.ink} />;
          })}
          <Ellipse cx={base.x} cy={base.y - 0.06 * base.scale} rx={0.12 * base.scale} ry={0.08 * base.scale} fill={garden.markerMiddle} ink={1.2} inkColour={garden.ink} />
          <View
            pointerEvents="none"
            style={[
              styles.pin,
              {
                left: pin.x - 0.17 * pin.scale,
                top: pin.y - 0.1 * pin.scale,
                borderLeftWidth: 0.17 * pin.scale,
                borderRightWidth: 0.17 * pin.scale,
                borderTopWidth: 0.36 * pin.scale,
              },
            ]}
          />
        </>
      ),
    });
  }
  actors.sort((a, b) => b.depth - a.depth);

  // The hearing ring round you, on the ground under the scenery.
  let ring: ReactNode = null;
  if (mePose) {
    const l = cam.project([mePose.x - HEAR_RADIUS, 0, mePose.z]);
    const r = cam.project([mePose.x + HEAR_RADIUS, 0, mePose.z]);
    const f = cam.project([mePose.x, 0, mePose.z + HEAR_RADIUS]);
    const b = cam.project([mePose.x, 0, mePose.z - HEAR_RADIUS]);
    ring = (
      <Ellipse
        cx={(l.x + r.x) / 2}
        cy={(f.y + b.y) / 2}
        rx={(r.x - l.x) / 2}
        ry={(f.y - b.y) / 2}
        fill="transparent"
        ink={2.4}
        inkColour={garden.ring}
        dashed
        opacity={0.85}
      />
    );
  }

  return (
    <Pressable style={[styles.fill, { backgroundColor: garden.sky }]} onLayout={onLayout} onPress={onPress} accessible={false}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Layer prims={scene.ground} />
        {ring}
        <Layer prims={scene.backdrop} />
        {actors.map((a) => (
          <Fragment key={a.key}>{a.node}</Fragment>
        ))}
        {tags}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
  pin: {
    position: "absolute",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: garden.markerPin,
  },
});
