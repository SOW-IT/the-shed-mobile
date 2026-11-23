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
  tagName,
  type Look,
  type Pose,
  type Walk,
} from "@shared/world";
import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { makeCamera } from "./camera";
import { buildGarden, type Prim, type Prop } from "./gardenScene";
import { garden, hud } from "./palette";
import { Avatar, figureFor, headTop, hitBox, Tag, touchK, type Doing } from "./Person";
import { accepted } from "./announce";
import { Ellipse, Shape } from "./Shapes";
import { useGlide } from "./useGlide";

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
  /** Asks this person accepted that are still open. */
  answered?: Reply[];
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
  onHoldStart,
  onHoldMove,
  onHoldEnd,
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
  /** A finger down on the ground, moving while held, and lifted. */
  onHoldStart: (x: number, z: number) => void;
  onHoldMove: (x: number, z: number) => void;
  onHoldEnd: (x: number, z: number) => void;
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
  // Your own walk as it is; others glide toward each new walk from the server.
  // A copy: a high five below steps people in and out of where they're drawn.
  const poses = [...useGlide(people, now)];
  // When each accepted mutual action was first seen to start (see below).
  const [firstStarts, setFirstStarts] = useState<Record<string, number>>({});
  const replyKeys = people.map((p) => (p.reply ? `${p.reply.to}:${p.reply.askAt}:${p.reply.at}` : "")).join(",");
  useEffect(() => {
    // Kept only while that reply stays on screen without a break: the
    // optimistic one hands straight over to the server's, but a refused accept
    // vanishes, so a retry starts afresh.
    const current: Record<string, number> = {};
    for (const p of people) {
      if (!p.reply) continue;
      const key = `${p.reply.to}:${p.reply.askAt}`;
      current[key] = firstStarts[key] ?? p.reply.at;
    }
    const same = Object.keys(current).length === Object.keys(firstStarts).length && Object.keys(current).every((k) => current[k] === firstStarts[k]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remember a start the first time it's seen
    if (!same) setFirstStarts(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the replies, not the arrays
  }, [replyKeys]);
  const me = people.findIndex((p) => p.me);
  // Where you're walking (before any high-five step), for the target marker.
  const placed = me >= 0 ? poses[me] : null;
  const recent = (at: number | undefined, ms: number) => at !== undefined && now - at < ms;
  // What each person is doing: a mutual action with someone (worked out from
  // the asker's ask and the other's answer), or else an emote.
  const doing: Doing[] = people.map(() => null);
  const startedAt = firstStarts;
  // Where each high five's palms meet (world), and how far into the reach.
  const touches: { x: number; z: number; k: number; i: number; j: number }[] = [];
  const facingOverride: (number | null)[] = people.map(() => null);
  people.forEach((asker, i) => {
    if (!asker.ask) return;
    const j = people.findIndex((p) => p.memberId === asker.ask?.to);
    const a = poses[i];
    const b = j >= 0 ? poses[j] : null;
    if (j < 0 || !a || !b) return;
    // The first start time seen for this accept: the optimistic one on the
    // accepter's own phone, so the server's slightly later copy doesn't
    // restart the animation.
    const answer = people[j].reply;
    const key = answer ? `${answer.to}:${answer.askAt}` : "";
    const reply = answer && startedAt[key] !== undefined ? { ...answer, at: Math.min(startedAt[key], answer.at) } : answer;
    const live = liveMutual({ id: asker.memberId, ask: asker.ask }, { id: people[j].memberId, reply }, now);
    // One at a time each: if A-B and B-C both play at once, B keeps the first,
    // so B's hands, steps and spark all belong to the same pair.
    if (!live || doing[i] || doing[j]) return;
    // Turn to face each other; the hand goes up on the side the other is on screen.
    const toward = b.x >= a.x ? 1 : -1;
    doing[i] = { kind: "mutual", id: live.kind, p: live.progress, toward };
    doing[j] = { kind: "mutual", id: live.kind, p: live.progress, toward: toward > 0 ? -1 : 1 };
    facingOverride[i] = Math.atan2(b.x - a.x, b.z - a.z);
    facingOverride[j] = Math.atan2(a.x - b.x, a.z - b.z);
    // Step toward each other until the raised palms can meet at the midpoint,
    // hold, then step back to where they were. Drawn only: nothing is sent.
    const gap = Math.hypot(b.x - a.x, b.z - a.z);
    const k = touchK(live.progress);
    const step = (Math.max(0, gap / 2 - TOUCH_HALF_GAP) * k) / (gap || 1);
    const dx = (b.x - a.x) * step;
    const dz = (b.z - a.z) * step;
    poses[i] = { ...a, x: a.x + dx, z: a.z + dz };
    poses[j] = { ...b, x: b.x - dx, z: b.z - dz };
    const contact = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, k, i, j };
    touches.push(contact);
  });
  // Where you're drawn, stepped in for a high five or not: the hearing ring,
  // the chip and the faded bubbles all go by that.
  const mePose = me >= 0 ? poses[me] : null;
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
      !accepted(me >= 0 ? people[me] : undefined, p.memberId, p.ask.at)
  );
  const animating =
    poses.some((pose) => pose && (pose.walking || (now - pose.arrivesAt < 800 && pose.heading !== 0))) ||
    doing.some((d) => d !== null) ||
    (target !== null && placed !== null && Math.hypot(placed.x - target.x, placed.z - target.z) > 0.05);
  const t = useClock(animating) / 1000;
  const press = useRef<{
    x: number;
    y: number;
    hit: { kind: "person"; id: string } | { kind: "arcade" } | { kind: "ground" };
    walking: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    /** The last point of this press that was on the ground. */
    spot: { x: number; z: number } | null;
  }>({ x: 0, y: 0, hit: { kind: "ground" }, walking: false, timer: null, spot: null });

  /** Where a touch is on the stage. Children don't take touches, so it's the stage's own. */
  const where = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    return typeof x === "number" && typeof y === "number" ? { x, y } : null;
  };

  /** What a point on the stage would be a tap on: a person, the arcade, or the ground. */
  const hitAt = (x: number, y: number): { kind: "person"; id: string } | { kind: "arcade" } | { kind: "ground" } => {
    if (!cam || !scene) return { kind: "ground" };
    // People first, nearest the camera first.
    const hits = people
      .map((p, i) => ({ p, pose: poses[i] }))
      .filter((h): h is { p: GardenPerson; pose: Pose } => h.pose !== null)
      .map((h) => ({ ...h, box: hitBox(figureFor(cam, h.pose, t, hash(h.p.memberId) % 7), h.p.look), depth: cam.project([h.pose.x, 0, h.pose.z]).depth }))
      .filter((h) => x >= h.box.left && x <= h.box.right && y >= h.box.top && y <= h.box.bottom)
      .sort((a, b) => a.depth - b.depth);
    // The arcade cabinet as drawn (its faces stand well above the ground).
    // Where it and a person overlap, whichever is drawn in front wins.
    const arcade = scene.props.find((prop) => prop.tap === "arcade");
    const onArcade = arcade && x >= arcade.box.left && x <= arcade.box.right && y >= arcade.box.top && y <= arcade.box.bottom;
    if (hits[0] && !(onArcade && arcade.depth < hits[0].depth)) return { kind: "person", id: hits[0].p.memberId };
    if (onArcade) return { kind: "arcade" };
    const spot = cam.ground(x, y);
    if (spot && Math.hypot(spot.x - ARCADE.x, spot.z - ARCADE.z) < 0.75) return { kind: "arcade" };
    return { kind: "ground" };
  };

  /** Starts walking toward a screen point, if it's on the ground. */
  const walkFrom = (x: number, y: number, phase: "start" | "move" | "end") => {
    // A finger lifted off the ground (above the horizon) still ends the hold,
    // at the last spot it was on the ground.
    const spot = cam?.ground(x, y) ?? (phase === "end" ? press.current.spot : null);
    if (!spot) return;
    press.current.spot = spot;
    if (phase === "start") onHoldStart(spot.x, spot.z);
    else if (phase === "move") onHoldMove(spot.x, spot.z);
    else onHoldEnd(spot.x, spot.z);
  };

  // Touch handling. On the ground the walk starts on touch DOWN and follows
  // the finger while it's held or dragged. On a person or the arcade a quick
  // tap opens them; holding there (or dragging away) walks instead, so a
  // hold never opens a sheet.
  const onGrant = (e: GestureResponderEvent) => {
    const at = where(e);
    if (!at) return;
    const hit = hitAt(at.x, at.y);
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current = { ...at, hit, walking: hit.kind === "ground", timer: null, spot: null };
    if (hit.kind === "ground") walkFrom(at.x, at.y, "start");
    else {
      press.current.timer = setTimeout(() => {
        const p = press.current;
        if (p.walking || p.hit.kind === "ground") return;
        p.walking = true;
        walkFrom(p.x, p.y, "start");
      }, HOLD_TO_WALK_MS);
    }
  };
  const onMove = (e: GestureResponderEvent) => {
    const at = where(e);
    const p = press.current;
    if (!at) return;
    if (!p.walking) {
      if (Math.hypot(at.x - p.x, at.y - p.y) < TAP_SLOP) return;
      if (p.timer) clearTimeout(p.timer);
      p.walking = true;
      walkFrom(at.x, at.y, "start");
      return;
    }
    walkFrom(at.x, at.y, "move");
  };
  const onRelease = (e: GestureResponderEvent) => {
    const p = press.current;
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    const at = where(e) ?? p;
    if (p.walking) return walkFrom(at.x, at.y, "end");
    if (p.hit.kind === "person") onTapPerson(p.hit.id);
    else if (p.hit.kind === "arcade") onTapArcade();
  };
  // The system took the touch away (a call, a system gesture): it was no tap,
  // so open nothing; a walk in progress ends where the finger last was.
  const onCancel = () => {
    const p = press.current;
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    if (p.walking) walkFrom(p.x, p.y, "end");
    p.walking = false;
    p.hit = { kind: "ground" };
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
    const touch = touches.find((c) => c.i === i || c.j === i);
    const planned = doing[i];
    const d: Doing =
      planned?.kind === "mutual" && touch
        ? { ...planned, reach: (({ x, y }) => ({ x, y }))(cam.project([touch.x, PALM_HEIGHT + figure.bob, touch.z])) }
        : planned;
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
    // Your own open ask shows "High five?" over you until the other person
    // answers it (not only while the slap plays).
    const answeredMine =
      p.ask !== undefined && people.some((o) => o.memberId === p.ask?.to && accepted(o, p.memberId, p.ask.at));
    const waiting =
      p.me && p.ask && openAsk(p.ask, now) && !d && !answeredMine ? `${MUTUALS[p.ask.kind as keyof typeof MUTUALS]?.ask ?? "…"}` : undefined;
    const head = cam.project([pose.x, headTop(p.look) + figure.bob, pose.z]);
    const name = p.me ? "You" : tagName(p.name);
    tags.push({
      key: p.memberId,
      depth: head.depth,
      ...tagBox(head.x, head.y, name, line ?? waiting, Boolean(emote)),
      props: { name, me: p.me, line: line ?? waiting, far, emote, emoteRise: rise },
    });
  });
  // The contact pop where palms meet: a quick burst while they touch.
  for (const c of touches) {
    if (c.k < 1) continue;
    const at = cam.project([c.x, PALM_HEIGHT, c.z]);
    const a = poses[c.i];
    const b = poses[c.j];
    const front = Math.min(a ? cam.project([a.x, 0, a.z]).depth : at.depth, b ? cam.project([b.x, 0, b.z]).depth : at.depth);
    actors.push({ depth: front - 0.01, key: `touch-${c.i}-${c.j}`, node: <Spark x={at.x} y={at.y} size={at.scale * 0.55} t={t} /> });
  }
  // The tap marker: a spinning flower with a bobbing pin, until you arrive.
  if (target && placed && Math.hypot(placed.x - target.x, placed.z - target.z) > 0.05) {
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
      <View
        style={[StyleSheet.absoluteFill, noBrowserGestures]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        // A walk in progress keeps the touch: nothing else (a scroll, a sheet) takes it.
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={onCancel}
        testID="world-stage"
      >
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
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {asks.map((p, i) => {
          const pose = poses[people.indexOf(p)];
          if (!pose || !p.ask) return null;
          const head = cam.project([pose.x, headTop(p.look) + 0.9, pose.z]);
          // Asks from people standing together stack upward instead of
          // covering each other, and never leave the stage.
          const top = Math.max(8, head.y - 64 - promptOffset(asks, i, poses, people, cam));
          const left = Math.max(1 - (now - p.ask.at) / ASK_MS, 0);
          const info = MUTUALS[p.ask.kind as keyof typeof MUTUALS];
          if (!info) return null;
          const askAt = p.ask.at;
          return (
            <View key={`ask-${p.memberId}`} style={[styles.ask, { left: Math.min(Math.max(4, head.x - ASK_CARD_WIDTH / 2), cam.width - ASK_CARD_WIDTH - 4), top }]} testID="world-ask">
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

/** An ask card's width (styles.ask), for keeping it on the stage. */
const ASK_CARD_WIDTH = 220;
/** Half the distance apart two people stand when their palms meet (world units). */
const TOUCH_HALF_GAP = 0.55;
/** How high the palms meet (world units). */
const PALM_HEIGHT = 1.45;

/** A little star burst where two palms meet. */
const Spark = ({ x, y, size, t }: { x: number; y: number; size: number; t: number }) => {
  const pulse = 0.85 + 0.15 * Math.sin(t * 30);
  const rays = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => {
    const a = (n / 8) * Math.PI * 2;
    const r0 = size * 0.35 * pulse;
    const r1 = size * (n % 2 ? 0.7 : 0.95) * pulse;
    return { n, a: { x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 }, b: { x: x + Math.cos(a) * r1, y: y + Math.sin(a) * r1 } };
  });
  return (
    <>
      {rays.map((r) => (
        <Shape key={`ray${r.n}`} prim={{ kind: "line", key: `ray${r.n}`, a: r.a, b: r.b, width: Math.max(2, size * 0.09), colour: garden.markerMiddle }} />
      ))}
      <Ellipse cx={x} cy={y} rx={size * 0.22 * pulse} ry={size * 0.22 * pulse} fill={garden.ring} ink={1.5} inkColour={garden.markerMiddle} />
    </>
  );
};

/** Holding this long on a person or the arcade walks instead of opening them. */
const HOLD_TO_WALK_MS = 300;
/** A finger that moves this far (pixels) is dragging, not tapping. */
const TAP_SLOP = 10;
/**
 * On the web, a finger on the stage mustn't scroll or zoom the page, or
 * select text. react-native-web passes these through; React Native's types
 * don't list them.
 */
const noBrowserGestures = (Platform.OS === "web" ? { touchAction: "none", userSelect: "none" } : {}) as unknown as ViewStyle;

/** Height of an ask card, for stacking them. */
const PROMPT_HEIGHT = 128;

/** How far up the i-th ask card moves so it clears the ones before it. */
const promptOffset = (
  asks: GardenPerson[],
  i: number,
  poses: (Pose | null)[],
  people: GardenPerson[],
  cam: ReturnType<typeof makeCamera>
) => {
  const at = (p: GardenPerson) => {
    const pose = poses[people.indexOf(p)];
    return pose ? cam.project([pose.x, headTop(p.look) + 0.9, pose.z]) : null;
  };
  const me = at(asks[i]);
  if (!me) return 0;
  let lift = 0;
  for (let j = 0; j < i; j++) {
    const other = at(asks[j]);
    if (other && Math.abs(other.x - me.x) < 220 && Math.abs(other.y - me.y) < PROMPT_HEIGHT + lift) lift += PROMPT_HEIGHT;
  }
  return lift;
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
    width: ASK_CARD_WIDTH,
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
