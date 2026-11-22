import {
  BUBBLE_MS,
  canHear,
  EMOTE_MS,
  EMOTES,
  isEmote,
  liveMutual,
  MUTUALS,
  openAsk,
  type Ask,
  type Reply,
  hash,
  HEAR_RADIUS,
  ASK_MS,
  OBSTACLES,
  posAt,
  tagName,
  type Look,
  type Pose,
  type Walk,
} from "@shared/world";
import { Fragment, memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { makeCamera } from "./camera";
import { buildGarden, type Prim, type Prop } from "./gardenScene";
import { garden, hud } from "./palette";
import { Avatar, figureFor, HEAD_TOP, hitBox, Tag, type Doing } from "./Person";
import { Ellipse, Shape } from "./Shapes";

type GardenPerson = {
  memberId: string;
  name: string;
  look: Look;
  me: boolean;
  walk: Walk | null;
  say?: { text: string; at: number };
  act?: { emote: string; at: number };
  ask?: Ask;
  reply?: Reply;
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
  onAccept,
  onDecline,
  declined,
  onHearing,
}: {
  people: GardenPerson[];
  serverNow: () => number;
  /** Where you're walking to, for the marker. */
  target: { x: number; z: number } | null;
  onTapGround: (x: number, z: number) => void;
  onTapPerson: (memberId: string) => void;
  onTapArcade: () => void;
  /** Accept the ask `from` made of you at `askAt`. */
  onAccept: (from: string, askAt: number) => void;
  /** Hide an ask made of you; it lapses on its own, so nothing is sent. */
  onDecline: (from: string, askAt: number) => void;
  /** Asks you've declined, as `${from}:${askAt}`. */
  declined: ReadonlySet<string>;
  /** How many others can hear you, whenever that changes. */
  onHearing: (count: number) => void;
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
  // What each person is doing: a mutual action with someone (worked out from
  // the asker's ask and the other's answer), or else an emote.
  const doing: Doing[] = people.map(() => null);
  const facingOverride: (number | null)[] = people.map(() => null);
  people.forEach((asker, i) => {
    if (!asker.ask) return;
    const j = people.findIndex((p) => p.memberId === asker.ask?.to);
    const a = poses[i];
    const b = j >= 0 ? poses[j] : null;
    if (j < 0 || !a || !b) return;
    const live = liveMutual({ id: asker.memberId, ask: asker.ask }, { id: people[j].memberId, reply: people[j].reply }, now);
    if (!live) return;
    // Turn to face each other; the hand goes up on the side the other is on screen.
    const toward = b.x >= a.x ? 1 : -1;
    doing[i] = { kind: "mutual", id: live.kind, p: live.progress, toward };
    doing[j] = { kind: "mutual", id: live.kind, p: live.progress, toward: toward > 0 ? -1 : 1 };
    facingOverride[i] = Math.atan2(b.x - a.x, b.z - a.z);
    facingOverride[j] = Math.atan2(a.x - b.x, a.z - b.z);
  });
  people.forEach((p, i) => {
    if (doing[i] || p.muted || !p.act || !isEmote(p.act.emote) || !recent(p.act.at, EMOTE_MS)) return;
    doing[i] = { kind: "emote", id: p.act.emote, p: (now - p.act.at) / EMOTE_MS };
  });
  const meId = me >= 0 ? people[me].memberId : null;
  // Worked out here, on the same frame as the faded bubbles, so the chip
  // and the bubbles always agree.
  const hearing = mePose ? poses.filter((pose, i) => i !== me && pose !== null && canHear(mePose, pose)).length : 0;
  useEffect(() => {
    onHearing(hearing);
  }, [hearing, onHearing]);
  // Asks made of you that are still open and not answered or declined.
  const asks = people.filter(
    (p) =>
      p.ask?.to === meId &&
      openAsk(p.ask, now) !== null &&
      !declined.has(`${p.memberId}:${p.ask.at}`) &&
      !(me >= 0 && people[me].reply?.to === p.memberId && people[me].reply?.askAt === p.ask.at)
  );
  const animating =
    poses.some((pose) => pose && (pose.walking || (now - pose.arrivesAt < 800 && pose.heading !== 0))) ||
    doing.some((d) => d !== null) ||
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
      .filter((h): h is { p: GardenPerson; pose: Pose } => h.pose !== null)
      .map((h) => ({ ...h, box: hitBox(figureFor(cam, h.pose, t, hash(h.p.memberId) % 7)), depth: cam.project([h.pose.x, 0, h.pose.z]).depth }))
      .filter((h) => x >= h.box.left && x <= h.box.right && y >= h.box.top && y <= h.box.bottom)
      .sort((a, b) => a.depth - b.depth);
    if (hits[0]) return onTapPerson(hits[0].p.memberId);
    // Then the arcade cabinet as drawn (its faces stand well above the ground).
    const arcade = scene.props.find((prop) => prop.tap === "arcade");
    if (arcade && x >= arcade.box.left && x <= arcade.box.right && y >= arcade.box.top && y <= arcade.box.bottom) {
      return onTapArcade();
    }
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
  const tags: TagSpot[] = [];
  people.forEach((p, i) => {
    const pose = poses[i];
    if (!pose) return;
    const seed = hash(p.memberId) % 7;
    const figure = figureFor(cam, pose, t, seed);
    // Standing still, people turn back to face the camera, so their faces
    // (and emotes) show; during a mutual action they face each other.
    const settled = pose.walking ? pose.heading : turnToward(pose.heading, 0, Math.min(1, (now - pose.arrivesAt) / 700));
    const turned = { ...pose, heading: facingOverride[i] ?? settled };
    const d = doing[i];
    actors.push({
      depth: figure.foot.depth,
      key: p.memberId,
      // Only someone moving needs the clock; for the rest t stays 0, so their
      // memoized avatar isn't redrawn while others walk.
      node: <Avatar figure={figure} pose={turned} look={p.look} t={pose.walking || d ? t : 0} seed={seed} doing={d} />,
    });
    const far = !p.me && mePose !== null && !canHear(mePose, pose);
    const line = !p.muted && recent(p.say?.at, BUBBLE_MS) ? p.say?.text : undefined;
    // The icon over the head: the emote's, or the mutual action's when hands meet.
    const emote =
      d?.kind === "emote"
        ? EMOTES[d.id].icon
        : d?.kind === "mutual" && d.p > 0.4
          ? MUTUALS[d.id].icon
          : undefined;
    const rise = d?.kind === "emote" ? d.p : d?.kind === "mutual" ? (d.p - 0.4) / 0.6 : 0;
    const waiting = p.me && p.ask && openAsk(p.ask, now) && !d ? `${MUTUALS[p.ask.kind as keyof typeof MUTUALS]?.ask ?? "…"}` : undefined;
    const head = cam.project([pose.x, HEAD_TOP + figure.bob, pose.z]);
    const name = p.me ? "You" : tagName(p.name);
    tags.push({
      key: p.memberId,
      depth: head.depth,
      ...tagBox(head.x, head.y, name, line ?? waiting, Boolean(emote)),
      props: { name, me: p.me, line: line ?? waiting, far, emote, emoteRise: rise },
    });
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
    <View style={[styles.fill, { backgroundColor: garden.sky }]} onLayout={onLayout}>
      {/* The ground takes taps; the asks sit beside it, not inside it, so
          on iOS a tap on an ask's button never reaches the ground. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessible={false}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Layer prims={scene.ground} />
        {ring}
        <Layer prims={scene.backdrop} />
        {actors.map((a) => (
          <Fragment key={a.key}>{a.node}</Fragment>
        ))}
        {stackTags(tags).map((tag) => (
          <Tag key={tag.key} x={tag.x} y={tag.bottom} {...tag.props} />
        ))}
      </View>
      </Pressable>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {asks.map((p) => {
          const pose = poses[people.indexOf(p)];
          if (!pose || !p.ask) return null;
          const head = cam.project([pose.x, HEAD_TOP + 0.9, pose.z]);
          const left = Math.max(1 - (now - p.ask.at) / ASK_MS, 0);
          const info = MUTUALS[p.ask.kind as keyof typeof MUTUALS];
          if (!info) return null;
          const askAt = p.ask.at;
          return (
            <View key={`ask-${p.memberId}`} style={[styles.ask, { left: head.x - 110, top: head.y - 64 }]} testID="world-ask">
              <Text style={styles.askText} numberOfLines={1}>
                {info.icon} {tagName(p.name)}: {info.ask}
              </Text>
              <View style={styles.askRow}>
                <Pressable
                  onPress={() => onAccept(p.memberId, askAt)}
                  accessibilityRole="button"
                  accessibilityLabel={`${info.label} with ${p.name}`}
                  testID="world-ask-accept"
                  style={({ pressed }) => [styles.askYes, pressed && { opacity: 0.75 }]}
                >
                  <Text style={styles.askYesText}>{info.label}!</Text>
                </Pressable>
                <Pressable
                  onPress={() => onDecline(p.memberId, askAt)}
                  accessibilityRole="button"
                  accessibilityLabel="Not now"
                  testID="world-ask-decline"
                  style={({ pressed }) => [styles.askNo, pressed && { opacity: 0.75 }]}
                >
                  <Text style={styles.askNoText}>Not now</Text>
                </Pressable>
              </View>
              {/* Time left to answer. */}
              <View style={styles.askTrack}>
                <View style={[styles.askLeft, { width: `${left * 100}%` }]} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

/** An angle part of the way to another, the short way round. */
const turnToward = (from: number, to: number, k: number) => {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * k;
};

type TagSpot = {
  key: string;
  depth: number;
  x: number;
  bottom: number;
  width: number;
  height: number;
  props: Omit<Parameters<typeof Tag>[0], "x" | "y">;
};

/** Roughly how much room a name tag and its bubble take, for stacking. */
const tagBox = (x: number, bottom: number, name: string, line: string | undefined, emote: boolean) => {
  const nameWidth = name.length * 7.5 + 22;
  const icon = emote ? 36 : 0;
  if (!line) return { x, bottom, width: Math.max(nameWidth, icon), height: 24 + icon };
  const chars = Array.from(line).length;
  const lines = Math.ceil(chars / 24);
  return { x, bottom, width: Math.max(nameWidth, Math.min(214, chars * 8 + 32)), height: 24 + 10 + lines * 18.5 + 21 + icon };
};

/**
 * Nearest people's tags stay over their heads; a farther tag that would
 * cover one moves up above it, but never off the top of the stage. Returned
 * far to near, so nearer tags draw on top.
 */
const stackTags = (tags: TagSpot[]): TagSpot[] => {
  const placed: TagSpot[] = [];
  for (const tag of [...tags].sort((a, b) => a.depth - b.depth)) {
    let bottom = tag.bottom;
    for (let moved = true; moved; ) {
      moved = false;
      for (const other of placed) {
        const across = Math.abs(other.x - tag.x) < (other.width + tag.width) / 2;
        const up = bottom > other.bottom - other.height && bottom - tag.height < other.bottom;
        if (across && up) {
          bottom = other.bottom - other.height - 4;
          moved = true;
        }
      }
    }
    // A crowd can stack tags past the top of the stage; the top one stops
    // there and overlaps the one below rather than vanishing.
    placed.push({ ...tag, bottom: Math.max(bottom, tag.height + 4) });
  }
  return placed.reverse();
};

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
  ask: {
    position: "absolute",
    width: 220,
    gap: 8,
    padding: 10,
    borderRadius: 18,
    backgroundColor: hud.card,
    borderWidth: 2.5,
    borderColor: hud.forest,
    shadowColor: hud.forest,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  askText: { color: hud.forest, fontSize: 14.5, fontWeight: "700", textAlign: "center" },
  askRow: { flexDirection: "row", gap: 8 },
  askYes: { flex: 1, backgroundColor: hud.accent, borderRadius: 999, paddingVertical: 8, alignItems: "center", borderWidth: 2, borderColor: hud.forest },
  askYesText: { color: hud.onAccent, fontWeight: "700", fontSize: 14 },
  askNo: { flex: 1, backgroundColor: hud.primarySoft, borderRadius: 999, paddingVertical: 8, alignItems: "center" },
  askNoText: { color: hud.forest, fontWeight: "600", fontSize: 14 },
  askTrack: { height: 4, borderRadius: 2, backgroundColor: hud.primarySoft, overflow: "hidden" },
  askLeft: { height: 4, backgroundColor: hud.accent },
  pin: {
    position: "absolute",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: garden.markerPin,
  },
});
