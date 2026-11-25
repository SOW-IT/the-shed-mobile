import type { Mood } from "@shared/animals";
import { memo, useEffect, useMemo } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { PACE, peckAt, penPoint, phaseAt, seedOf, swishAt, wanderAt, WANDER_LOOP_MS, zoneOf, type PenCorners, type Zone } from "./animalMotion";
import { Ellipse } from "./Shapes";
import { animals as tint, garden, mix } from "./palette";

type Kind = "chicken" | "cow";
type Stage = 0 | 1 | 2;
type Look = { stage: Stage; progress: number; mood: Mood };

const ARRIVE_MS = 1100;
const LEAVE_MS = 2600;
const FEED_MS = 1100;

const dim = (colour: string, look: Look) => (look.mood === "frail" || look.mood === "gone" ? mix(colour, tint.frail, 0.45) : colour);

const Box = ({ x, y, w, h, r, fill, ink, turn = 0 }: { x: number; y: number; w: number; h: number; r: number; fill: string; ink: number; turn?: number }) => (
  <View
    pointerEvents="none"
    style={[styles.abs, { left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: r, backgroundColor: fill, borderWidth: ink, borderColor: garden.ink, transform: [{ rotate: `${turn}deg` }] }]}
  />
);


const HenBody = ({ u, look }: { u: number; look: Look }) => {
  const ink = Math.max(1, 0.03 * u);
  const body = dim(look.stage === 0 ? tint.chick : look.stage === 1 ? tint.pullet : tint.hen, look);
  const wing = dim(look.stage === 0 ? tint.chickWing : look.stage === 1 ? tint.pulletWing : tint.henWing, look);
  const thin = look.mood === "frail" ? 0.82 : 1;
  const legs = dim(tint.legs, look);
  return (
    <>
      <Box x={-0.06 * u} y={-0.07 * u} w={0.03 * u} h={0.14 * u} r={u} fill={legs} ink={0} />
      <Box x={0.06 * u} y={-0.07 * u} w={0.03 * u} h={0.14 * u} r={u} fill={legs} ink={0} />
      {look.stage === 0 ? null : <Box x={-0.2 * u} y={-0.33 * u} w={0.14 * u} h={0.22 * u} r={0.07 * u} fill={wing} ink={ink} turn={-30} />}
      <Ellipse cx={0} cy={-0.26 * u} rx={(look.stage === 0 ? 0.17 : 0.24) * u * thin} ry={(look.stage === 0 ? 0.16 : 0.17) * u * thin} fill={body} ink={ink} inkColour={garden.ink} ramp />
      <Ellipse cx={-0.04 * u} cy={-0.25 * u} rx={0.11 * u * thin} ry={0.07 * u} fill={wing} />
    </>
  );
};

const HenHead = ({ u, look }: { u: number; look: Look }) => {
  const ink = Math.max(1, 0.03 * u);
  const head = dim(look.stage === 0 ? tint.chick : look.stage === 1 ? tint.pullet : tint.hen, look);
  return (
    <>
      {look.stage === 2 ? <Ellipse cx={0.18 * u} cy={-0.55 * u} rx={0.06 * u} ry={0.05 * u} fill={dim(tint.comb, look)} ink={ink * 0.8} inkColour={garden.ink} /> : null}
      {look.stage === 1 ? <Ellipse cx={0.18 * u} cy={-0.53 * u} rx={0.035 * u} ry={0.03 * u} fill={dim(tint.comb, look)} /> : null}
      <Ellipse cx={0.18 * u} cy={-0.44 * u} rx={0.1 * u} ry={0.1 * u} fill={head} ink={ink} inkColour={garden.ink} ramp />
      <Box x={0.3 * u} y={-0.43 * u} w={0.09 * u} h={0.05 * u} r={0.025 * u} fill={dim(tint.beak, look)} ink={0} />
      {look.stage === 2 ? <Ellipse cx={0.26 * u} cy={-0.37 * u} rx={0.025 * u} ry={0.035 * u} fill={dim(tint.comb, look)} /> : null}
      <Ellipse cx={0.21 * u} cy={-0.46 * u} rx={0.018 * u} ry={look.mood === "frail" ? 0.006 * u : 0.02 * u} fill={garden.ink} />
    </>
  );
};

const SPOTS: readonly [number, number, number, number][] = [
  [-0.26, -0.52, 0.16, 0.11],
  [0.16, -0.42, 0.12, 0.09],
  [-0.02, -0.66, 0.09, 0.06],
];
const BODY = { left: -0.52, top: -0.76, w: 1.02, h: 0.58 } as const;

const CowBody = ({ u, look }: { u: number; look: Look }) => {
  const ink = Math.max(1, 0.03 * u);
  const hide = dim(look.stage === 0 ? tint.calf : tint.cow, look);
  const spot = dim(look.stage === 1 ? tint.youngSpot : tint.spot, look);
  const thin = look.mood === "frail" ? 0.84 : 1;
  const leg = dim(tint.cowLeg, look);
  const h = BODY.h * thin;
  const top = BODY.top + BODY.h - h;
  return (
    <>
      {[-0.34, -0.17, 0.17, 0.32].map((x) => (
        <Box key={x} x={x * u} y={-0.12 * u} w={0.12 * u} h={0.24 * u} r={0.05 * u} fill={leg} ink={ink} />
      ))}
      {look.stage === 2 ? <Ellipse cx={-0.02 * u} cy={-0.2 * u} rx={0.1 * u} ry={0.06 * u} fill={dim(tint.udder, look)} ink={ink * 0.8} inkColour={garden.ink} /> : null}
      <View pointerEvents="none" style={[styles.abs, { left: BODY.left * u, top: top * u, width: BODY.w * u, height: h * u, borderRadius: 0.27 * u, backgroundColor: hide, borderWidth: ink, borderColor: garden.ink, overflow: "hidden" }]}>
        {look.stage === 0 ? null : SPOTS.map(([x, y, rx, ry]) => <Ellipse key={`${x}`} cx={(x - BODY.left) * u} cy={(y - top) * u} rx={rx * u} ry={ry * u} fill={spot} />)}
      </View>
    </>
  );
};

const CowHead = ({ u, look }: { u: number; look: Look }) => {
  const ink = Math.max(1, 0.03 * u);
  const hide = dim(look.stage === 0 ? tint.calf : tint.cow, look);
  return (
    <>
      <Box x={0.45 * u} y={-0.76 * u} w={0.15 * u} h={0.08 * u} r={0.04 * u} fill={hide} ink={ink} turn={-25} />
      {look.stage === 2 ? <Box x={0.56 * u} y={-0.85 * u} w={0.055 * u} h={0.1 * u} r={0.027 * u} fill={dim(tint.horn, look)} ink={ink * 0.8} turn={20} /> : null}
      <Ellipse cx={0.6 * u} cy={-0.64 * u} rx={0.17 * u} ry={0.18 * u} fill={hide} ink={ink} inkColour={garden.ink} ramp />
      <Ellipse cx={0.66 * u} cy={-0.53 * u} rx={0.12 * u} ry={0.085 * u} fill={dim(tint.muzzle, look)} ink={ink * 0.8} inkColour={garden.ink} />
      <Ellipse cx={0.69 * u} cy={-0.53 * u} rx={0.016 * u} ry={0.022 * u} fill={garden.ink} />
      <Ellipse cx={0.64 * u} cy={-0.69 * u} rx={0.022 * u} ry={look.mood === "frail" ? 0.008 * u : 0.027 * u} fill={garden.ink} />
    </>
  );
};

const CowTail = ({ u, look }: { u: number; look: Look }) => (
  <>
    <Box x={0} y={0.12 * u} w={0.04 * u} h={0.24 * u} r={u} fill={dim(tint.cowLeg, look)} ink={0} />
    <Ellipse cx={0} cy={0.26 * u} rx={0.045 * u} ry={0.065 * u} fill={dim(tint.spot, look)} />
  </>
);

const Bowl = ({ u }: { u: number }) => (
  <View pointerEvents="none" style={[styles.badge, { width: 0.34 * u + 14, height: 0.2 * u + 12 }]} testID="world-animal-hungry">
    <View style={[styles.bowl, { width: 0.26 * u + 8, height: 0.11 * u + 5, borderBottomLeftRadius: 0.13 * u + 4, borderBottomRightRadius: 0.13 * u + 4 }]} />
  </View>
);

const NestEgg = ({ u }: { u: number }) => (
  <View pointerEvents="none" style={[styles.badge, { width: 0.34 * u + 14, height: 0.26 * u + 14 }]} testID="world-animal-egg">
    <View style={[styles.egg, { width: 0.12 * u + 6, height: 0.16 * u + 8, borderRadius: 0.1 * u + 6 }]} />
    <View style={[styles.nest, { width: 0.26 * u + 10, height: 0.08 * u + 4 }]} />
  </View>
);

const Bottle = ({ u }: { u: number }) => (
  <View pointerEvents="none" style={[styles.badge, { width: 0.26 * u + 14, height: 0.36 * u + 14 }]} testID="world-animal-milk">
    <View style={[styles.cap, { width: 0.07 * u + 4, height: 0.05 * u + 3 }]} />
    <View style={[styles.bottle, { width: 0.13 * u + 7, height: 0.22 * u + 10, borderRadius: 0.04 * u + 3 }]} />
  </View>
);

export const GoodThumb = memo(function GoodThumb({ good, size }: { good: "egg" | "milk"; size: number }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {good === "egg" ? (
        <View style={[styles.egg, { width: size * 0.5, height: size * 0.66, borderRadius: size * 0.4 }]} />
      ) : (
        <View style={{ alignItems: "center" }}>
          <View style={[styles.cap, { width: size * 0.26, height: size * 0.14 }]} />
          <View style={[styles.bottle, { width: size * 0.46, height: size * 0.66, borderRadius: size * 0.12 }]} />
        </View>
      )}
    </View>
  );
});

export const FeedThumb = memo(function FeedThumb({ feed, size }: { feed: "grain" | "hay"; size: number }) {
  if (feed === "hay") {
    return (
      <View pointerEvents="none" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <View style={[styles.hay, { width: size * 0.78, height: size * 0.5, borderRadius: size * 0.12 }]}>
          <View style={[styles.band, { left: size * 0.18 }]} />
          <View style={[styles.band, { right: size * 0.18 }]} />
        </View>
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      {GRAINS.map(([x, y]) => (
        <View key={`${x}:${y}`} style={[styles.grain, { left: size * x, top: size * y, width: size * 0.16, height: size * 0.22, borderRadius: size * 0.1 }]} />
      ))}
    </View>
  );
});

export const TagThumb = memo(function TagThumb({ size }: { size: number }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={[styles.tag, { width: size * 0.7, height: size * 0.44, borderRadius: size * 0.08 }]}>
        <View style={[styles.tagHole, { width: size * 0.1, height: size * 0.1, borderRadius: size * 0.05 }]} />
      </View>
    </View>
  );
});

const GRAINS: readonly [number, number][] = [
  [0.22, 0.4],
  [0.42, 0.3],
  [0.62, 0.42],
  [0.32, 0.58],
  [0.52, 0.56],
  [0.42, 0.72],
];

export type PenAnimal = { id: string; kind: Kind; name: string; stage: Stage; progress: number; mood: Mood; ready: boolean; note?: string; fresh: boolean };

const paceOf = (mood: Mood) => (mood === "frail" || mood === "gone" ? null : mood === "hungry" ? PACE.hungry : PACE.fed);
const NAME_H = 15;
const DRAWN_AT: Record<Kind, number> = { chicken: 1.9, cow: 1.4 };
const TOP_OF: Record<Kind, number> = { chicken: -0.62, cow: -0.88 };

const sizeOf = (look: Look) => (look.stage === 2 ? 1 : 0.5 + 0.42 * Math.min(1, look.progress));

type Tag = { bottom: number; top: number; nameTop: number; w: number; name: number };
const tagOf = (a: PenAnimal, base: number): Tag => {
  const bottom = TOP_OF[a.kind] * base * DRAWN_AT[a.kind] * sizeOf(a);
  const badge = a.mood === "hungry" || a.mood === "frail" || a.ready ? 0.36 * base + 16 : 0;
  const lines = a.note ? 2 : 1;
  const name = Math.max(Array.from(a.name).length * 5.8, a.note ? Array.from(a.note).length * 4.9 : 0) + 14;
  const nameTop = bottom - NAME_H * lines;
  return { bottom, top: nameTop - badge, nameTop, w: Math.max(name, badge > 0 ? 0.34 * base + 14 : 0), name };
};

type Point = { x: number; y: number; scale: number };

const usePhase = (live: boolean) => {
  const clock = useSharedValue(0);
  useEffect(() => {
    const start = phaseAt(Date.now());
    if (!live) {
      cancelAnimation(clock);
      clock.value = start;
      return;
    }
    clock.value = start;
    clock.value = withSequence(
      withTiming(1, { duration: (1 - start) * WANDER_LOOP_MS, easing: Easing.linear }),
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: WANDER_LOOP_MS, easing: Easing.linear })), -1, false)
    );
    return () => cancelAnimation(clock);
  }, [live, clock]);
  return clock;
};

const Critter = ({
  a,
  pen,
  gate,
  exit,
  base,
  clock,
  live,
  feeding,
  onFed,
  onLeft,
  others,
  part,
  zone,
  tag,
}: {
  a: PenAnimal;
  pen: PenCorners;
  gate: Point;
  exit: Point;
  base: number;
  clock: SharedValue<number>;
  live: boolean;
  feeding: number | null;
  onFed: () => void;
  onLeft: (id: string) => void;
  others: readonly { seed: number; pace: number | null; zone: Zone; tag: Tag }[];
  part: "body" | "badge" | "name";
  zone: Zone;
  tag: Tag;
}) => {
  const seed = useMemo(() => seedOf(a.id), [a.id]);
  const pace = paceOf(a.mood);
  const arrive = useSharedValue(a.fresh && live ? 0 : 1);
  useEffect(() => {
    if (arrive.value >= 1) return;
    arrive.value = withTiming(1, { duration: ARRIVE_MS, easing: Easing.out(Easing.quad) });
  }, [arrive]);
  const leaving = a.mood === "gone";
  const leave = useSharedValue(0);
  const id = a.id;
  useEffect(() => {
    if (!leaving) return;
    if (!live) {
      if (part === "body") onLeft(id);
      return;
    }
    leave.value = withTiming(1, { duration: LEAVE_MS, easing: Easing.linear }, (finished) => {
      if (finished && part === "body") runOnJS(onLeft)(id);
    });
    return () => cancelAnimation(leave);
  }, [leaving, live, leave, onLeft, id, part]);
  const feed = useSharedValue(1);
  useEffect(() => {
    if (feeding === null || part !== "body") {
      feed.value = 1;
      return;
    }
    if (!live) {
      onFed();
      return;
    }
    feed.value = 0;
    feed.value = withTiming(1, { duration: FEED_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onFed)();
    });
    return () => {
      cancelAnimation(feed);
      feed.value = 1;
    };
  }, [feeding, live, feed, onFed, part]);
  const place = useAnimatedStyle(() => {
    const w = wanderAt(seed, clock.value, pace, zone);
    let p = penPoint(pen, w.u, w.v);
    const k = arrive.value;
    let hop = 0;
    if (k < 1) {
      p = { x: gate.x + (p.x - gate.x) * k, y: gate.y + (p.y - gate.y) * k, scale: gate.scale + (p.scale - gate.scale) * k };
      hop = Math.abs(Math.sin(k * Math.PI * 4)) * (1 - k) * 0.35 * p.scale;
    }
    const l = leave.value;
    let opacity = 1;
    if (l > 0) {
      const toGate = Math.min(1, l / 0.45);
      const out = Math.max(0, (l - 0.45) / 0.55);
      const atGate = { x: p.x + (gate.x - p.x) * toGate, y: p.y + (gate.y - p.y) * toGate, scale: p.scale + (gate.scale - p.scale) * toGate };
      p = { x: atGate.x + (exit.x - atGate.x) * out, y: atGate.y + (exit.y - atGate.y) * out, scale: atGate.scale + (exit.scale - atGate.scale) * out };
      opacity = 1 - Math.max(0, (l - 0.7) / 0.3);
      hop = Math.abs(Math.sin(l * Math.PI * 10)) * 0.05 * p.scale;
    } else if (w.walking && k >= 1) {
      hop = Math.abs(Math.sin(clock.value * WANDER_LOOP_MS * 0.012)) * 0.04 * p.scale;
    }
    return { opacity, transform: [{ translateX: p.x }, { translateY: p.y - hop }, { scale: p.scale / base }] };
  });
  const facing = useAnimatedStyle(() => {
    const l = leave.value;
    const left = l > 0 ? exit.x < gate.x : wanderAt(seed, clock.value, pace, zone).left;
    return { transform: [{ scaleX: left ? -1 : 1 }] };
  });
  const full = base * DRAWN_AT[a.kind];
  const u = full * sizeOf(a);
  const neck = a.kind === "cow" ? { x: 0.44 * u, y: -0.6 * u } : { x: 0.12 * u, y: -0.34 * u };
  const head = useAnimatedStyle(() => {
    const w = wanderAt(seed, clock.value, pace, zone);
    const eating = feed.value < 1 ? Math.abs(Math.sin(feed.value * Math.PI * 6)) * Math.min(1, feed.value * 4) : 0;
    const frail = a.mood === "frail" ? 0.6 : 0;
    const peck = a.kind === "cow" ? Math.min(1, w.idle * 3) * (1 - Math.max(0, (w.idle - 0.8) * 5)) * 0.8 : peckAt(clock.value, seed) * (w.walking ? 0 : 1);
    const down = Math.max(eating, frail, pace === null ? 0 : peck);
    return { transform: [{ translateX: neck.x }, { translateY: neck.y }, { rotate: `${down * (a.kind === "cow" ? 38 : 55)}deg` }, { translateX: -neck.x }, { translateY: -neck.y }] };
  });
  const tail = useAnimatedStyle(() => ({ transform: [{ rotate: `${pace === null ? 4 : swishAt(clock.value, seed) * 22}deg` }] }));
  const food = useAnimatedStyle(() => {
    const k = feed.value;
    if (k >= 1) return { opacity: 0 };
    const drop = Math.min(1, k / 0.3);
    return { opacity: k > 0.85 ? (1 - k) / 0.15 : 1, transform: [{ translateY: -(1 - drop * drop) * 1.4 * u }, { scale: 0.7 + 0.3 * drop }] };
  });
  const nameShown = useAnimatedStyle(() => {
    const mine = wanderAt(seed, clock.value, pace, zone);
    const p = penPoint(pen, mine.u, mine.v);
    for (const o of others) {
      const w = wanderAt(o.seed, clock.value, o.pace, o.zone);
      const q = penPoint(pen, w.u, w.v);
      if (Math.abs(p.x - q.x) < (o.tag.w + tag.w) / 2 && p.y + tag.top < q.y + o.tag.bottom && q.y + o.tag.top < p.y + tag.bottom) return { opacity: 0 };
    }
    return { opacity: 1 };
  });
  const look: Look = { stage: a.stage, progress: a.progress, mood: a.mood };
  const badgeY = TOP_OF[a.kind] * u;
  const feedPile = a.kind === "cow" ? "hay" : "grain";
  return (
    part === "body" ? (
      <Animated.View pointerEvents="none" style={[styles.abs, place]} testID={`world-animal-${a.kind}-${a.stage}-${a.mood}${a.ready ? "-ready" : ""}`}>
        <Animated.View style={[styles.abs, facing]}>
          {a.kind === "cow" ? (
            <>
              <Animated.View style={[styles.abs, { left: -0.5 * u, top: -0.66 * u, transformOrigin: "top" } as ViewStyle, tail]}>
                <CowTail u={u} look={look} />
              </Animated.View>
              <CowBody u={u} look={look} />
            </>
          ) : (
            <HenBody u={u} look={look} />
          )}
          <Animated.View style={[styles.abs, head]}>{a.kind === "cow" ? <CowHead u={u} look={look} /> : <HenHead u={u} look={look} />}</Animated.View>
          <Animated.View style={[styles.abs, { left: (a.kind === "cow" ? 0.62 : 0.32) * u - 0.3 * full, top: -0.5 * full }, food]}>
            <FeedThumb feed={feedPile} size={0.6 * full} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    ) : part === "badge" ? (
      <Animated.View pointerEvents="none" style={[styles.abs, place]} testID={`world-animal-badge-${a.id}`}>
        <View style={[styles.stack, { bottom: -badgeY + tag.bottom - tag.nameTop + 2 }]}>
          {a.ready ? a.kind === "cow" ? <Bottle u={base} /> : <NestEgg u={base} /> : a.mood === "hungry" || a.mood === "frail" ? <Bowl u={base} /> : null}
        </View>
      </Animated.View>
    ) : (
      <Animated.View pointerEvents="none" style={[styles.abs, place]} testID={`world-animal-name-${a.id}`}>
        <View style={[styles.stack, { bottom: -badgeY }]}>
          <Animated.View style={[styles.name, nameShown]}>
            <Text style={styles.nameText} numberOfLines={1}>
              {a.name}
            </Text>
            {a.note ? (
              <Text style={styles.noteLine} numberOfLines={1}>
                {a.note}
              </Text>
            ) : null}
          </Animated.View>
        </View>
      </Animated.View>
    )
  );
};

export const PenAnimals = memo(function PenAnimals({
  slots,
  pen,
  gate,
  exit,
  animals,
  live,
  feeding,
  onFed,
  onLeft,
}: {
  slots: number;
  pen: PenCorners;
  gate: Point;
  exit: Point;
  animals: readonly PenAnimal[];
  live: boolean;
  feeding: { id: string; key: number } | null;
  onFed: () => void;
  onLeft: (id: string) => void;
}) {
  const clock = usePhase(live);
  const base = (pen.backLeft.scale + pen.frontRight.scale) / 2;
  const zones = useMemo(() => animals.map((_, i) => zoneOf(i, Math.max(slots, animals.length))), [animals, slots]);
  const tags = useMemo(() => animals.map((a) => tagOf(a, base)), [animals, base]);
  const before = useMemo(() => {
    const weight = (a: PenAnimal, i: number) => (a.note ? 0 : 20) + (a.mood === "hungry" || a.mood === "frail" || a.ready ? 0 : 10) + i;
    const ranks = animals.map((a, i) => weight(a, i));
    return animals.map((_, i) => animals.flatMap((o, j) => (j === i || o.mood === "gone" || ranks[j] > ranks[i] ? [] : [{ seed: seedOf(o.id), pace: paceOf(o.mood), zone: zones[j], tag: tags[j] }])));
  }, [animals, zones, tags]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {(["body", "badge", "name"] as const).flatMap((part) =>
        animals.map((a, i) => (
          <Critter key={`${part}-${a.id}`} a={a} part={part} pen={pen} gate={gate} exit={exit} base={base} clock={clock} live={live} feeding={feeding?.id === a.id ? feeding.key : null} onFed={onFed} onLeft={onLeft} others={before[i]} zone={zones[i]} tag={tags[i]} />
        ))
      )}
    </View>
  );
});

export const animalAt = (pen: PenCorners, id: string, mood: Mood, phase: number, zone: Zone) => {
  const w = wanderAt(seedOf(id), phase, paceOf(mood), zone);
  return penPoint(pen, w.u, w.v);
};

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  stack: { position: "absolute", left: -60, width: 120, alignItems: "center", gap: 2 },
  name: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: tint.namePill, maxWidth: 120 },
  nameText: { color: tint.nameText, fontSize: 9.5, fontWeight: "700", textAlign: "center" },
  noteLine: { color: tint.nameText, fontSize: 8.5, fontWeight: "600", textAlign: "center" },
  badge: { alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: tint.badge, borderWidth: 2, borderColor: garden.ink },
  bowl: { backgroundColor: tint.bowl, borderWidth: 2, borderColor: garden.ink, borderTopWidth: 3 },
  egg: { backgroundColor: tint.egg, borderWidth: 2, borderColor: garden.ink, marginBottom: -4 },
  nest: { backgroundColor: tint.nest, borderRadius: 999, borderWidth: 2, borderColor: garden.ink },
  cap: { backgroundColor: tint.cap, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderWidth: 1.5, borderColor: garden.ink, marginBottom: -1.5 },
  bottle: { backgroundColor: tint.milk, borderWidth: 2, borderColor: garden.ink },
  hay: { backgroundColor: tint.hay, borderWidth: 2, borderColor: garden.ink, overflow: "hidden" },
  band: { position: "absolute", top: 0, bottom: 0, width: 3, backgroundColor: tint.hayBand },
  grain: { position: "absolute", backgroundColor: tint.grain, borderWidth: 1, borderColor: garden.ink },
  tag: { backgroundColor: tint.tag, borderWidth: 2, borderColor: garden.ink, justifyContent: "center", paddingLeft: 4 },
  tagHole: { backgroundColor: garden.ink },
});

export const AnimalThumb = memo(function AnimalThumb({ kind, stage, size, mood = "fed" }: { kind: Kind; stage: Stage; size: number; mood?: Mood }) {
  const look: Look = { stage, progress: stage === 2 ? 1 : 0.6, mood };
  const u = (kind === "cow" ? 0.62 : 1.25) * size;
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <View style={[styles.abs, { left: size / 2 - (kind === "cow" ? 0.06 : 0.04) * u, top: size * 0.9, transform: [{ scale: sizeOf(look) }], transformOrigin: "bottom" } as ViewStyle]}>
        {kind === "cow" ? (
          <>
            <View style={[styles.abs, { left: -0.5 * u, top: -0.66 * u }]}>
              <CowTail u={u} look={look} />
            </View>
            <CowBody u={u} look={look} />
            <CowHead u={u} look={look} />
          </>
        ) : (
          <>
            <HenBody u={u} look={look} />
            <HenHead u={u} look={look} />
          </>
        )}
      </View>
    </View>
  );
});
