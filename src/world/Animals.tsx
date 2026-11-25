import type { Mood } from "@shared/animals";
import { memo, useEffect, useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { PACE, peckAt, penPoint, phaseAt, seedOf, swishAt, wanderAt, WANDER_LOOP_MS, type PenCorners } from "./animalMotion";
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

const sizeOf = (look: Look) => (look.stage === 2 ? 1 : 0.5 + 0.42 * Math.min(1, look.progress));
const DRAWN_AT: Record<Kind, number> = { chicken: 1.9, cow: 1.4 };

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
  [-0.22, -0.66, 0.13, 0.09],
  [0.12, -0.56, 0.1, 0.08],
  [-0.02, -0.72, 0.07, 0.05],
];

const CowBody = ({ u, look }: { u: number; look: Look }) => {
  const ink = Math.max(1, 0.03 * u);
  const hide = dim(look.stage === 0 ? tint.calf : tint.cow, look);
  const spot = dim(look.stage === 1 ? tint.youngSpot : tint.spot, look);
  const thin = look.mood === "frail" ? 0.8 : 1;
  const leg = dim(tint.cowLeg, look);
  return (
    <>
      {[-0.32, -0.18, 0.18, 0.3].map((x) => (
        <Box key={x} x={x * u} y={-0.23 * u} w={0.09 * u} h={0.46 * u} r={0.03 * u} fill={leg} ink={ink} />
      ))}
      {look.stage === 2 ? <Ellipse cx={-0.02 * u} cy={-0.38 * u} rx={0.09 * u} ry={0.05 * u} fill={dim(tint.udder, look)} ink={ink * 0.8} inkColour={garden.ink} /> : null}
      <View pointerEvents="none" style={[styles.abs, { left: -0.46 * u, top: (-0.62 - 0.22 * thin) * u, width: 0.9 * u, height: 0.44 * thin * u, borderRadius: 0.2 * u, backgroundColor: hide, borderWidth: ink, borderColor: garden.ink, overflow: "hidden" }]}>
        {look.stage === 0
          ? null
          : SPOTS.map(([x, y, rx, ry]) => <Ellipse key={`${x}`} cx={(x + 0.46) * u} cy={(y + 0.62 + 0.22 * thin) * u} rx={rx * u} ry={ry * u} fill={spot} />)}
      </View>
    </>
  );
};

const CowHead = ({ u, look }: { u: number; look: Look }) => {
  const ink = Math.max(1, 0.03 * u);
  const hide = dim(look.stage === 0 ? tint.calf : tint.cow, look);
  return (
    <>
      <Box x={0.42 * u} y={-0.84 * u} w={0.14 * u} h={0.07 * u} r={0.035 * u} fill={hide} ink={ink} turn={-25} />
      {look.stage === 2 ? <Box x={0.53 * u} y={-0.92 * u} w={0.05 * u} h={0.1 * u} r={0.025 * u} fill={dim(tint.horn, look)} ink={ink * 0.8} turn={20} /> : null}
      <Ellipse cx={0.56 * u} cy={-0.72 * u} rx={0.15 * u} ry={0.17 * u} fill={hide} ink={ink} inkColour={garden.ink} ramp />
      <Ellipse cx={0.62 * u} cy={-0.62 * u} rx={0.11 * u} ry={0.08 * u} fill={dim(tint.muzzle, look)} ink={ink * 0.8} inkColour={garden.ink} />
      <Ellipse cx={0.64 * u} cy={-0.62 * u} rx={0.015 * u} ry={0.02 * u} fill={garden.ink} />
      <Ellipse cx={0.6 * u} cy={-0.77 * u} rx={0.02 * u} ry={look.mood === "frail" ? 0.007 * u : 0.025 * u} fill={garden.ink} />
    </>
  );
};

const CowTail = ({ u, look }: { u: number; look: Look }) => (
  <>
    <Box x={0} y={0.14 * u} w={0.035 * u} h={0.28 * u} r={u} fill={dim(tint.cowLeg, look)} ink={0} />
    <Ellipse cx={0} cy={0.3 * u} rx={0.04 * u} ry={0.06 * u} fill={dim(tint.spot, look)} />
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

export type PenAnimal = { id: string; kind: Kind; stage: Stage; progress: number; mood: Mood; ready: boolean; note?: string; fresh: boolean };

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
}) => {
  const seed = useMemo(() => seedOf(a.id), [a.id]);
  const pace = a.mood === "frail" || a.mood === "gone" ? null : a.mood === "hungry" ? PACE.hungry : PACE.fed;
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
      onLeft(id);
      return;
    }
    leave.value = withTiming(1, { duration: LEAVE_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onLeft)(id);
    });
    return () => cancelAnimation(leave);
  }, [leaving, live, leave, onLeft, id]);
  const feed = useSharedValue(1);
  useEffect(() => {
    if (feeding === null) return;
    if (!live) {
      onFed();
      return;
    }
    feed.value = 0;
    feed.value = withTiming(1, { duration: FEED_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onFed)();
    });
    return () => cancelAnimation(feed);
  }, [feeding, live, feed, onFed]);
  const place = useAnimatedStyle(() => {
    const w = wanderAt(seed, clock.value, pace);
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
    const left = l > 0 ? exit.x < gate.x : wanderAt(seed, clock.value, pace).left;
    return { transform: [{ scaleX: left ? -1 : 1 }] };
  });
  const full = base * DRAWN_AT[a.kind];
  const u = full * sizeOf(a);
  const neck = a.kind === "cow" ? { x: 0.42 * u, y: -0.7 * u } : { x: 0.12 * u, y: -0.34 * u };
  const head = useAnimatedStyle(() => {
    const w = wanderAt(seed, clock.value, pace);
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
    return { opacity: k > 0.85 ? (1 - k) / 0.15 : 1, transform: [{ translateY: -(1 - drop * drop) * 0.9 * u }, { scale: 0.6 + 0.4 * drop }] };
  });
  const look: Look = { stage: a.stage, progress: a.progress, mood: a.mood };
  const badgeY = (a.kind === "cow" ? -1.0 : -0.62) * u;
  const feedPile = a.kind === "cow" ? "hay" : "grain";
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, place]} testID={`world-animal-${a.kind}-${a.stage}-${a.mood}${a.ready ? "-ready" : ""}`}>
      <Animated.View style={[styles.abs, facing]}>
        {a.kind === "cow" ? (
          <>
            <Animated.View style={[styles.abs, { left: -0.46 * u, top: -0.78 * u, transformOrigin: "top" } as ViewStyle, tail]}>
              <CowTail u={u} look={look} />
            </Animated.View>
            <CowBody u={u} look={look} />
          </>
        ) : (
          <HenBody u={u} look={look} />
        )}
        <Animated.View style={[styles.abs, head]}>{a.kind === "cow" ? <CowHead u={u} look={look} /> : <HenHead u={u} look={look} />}</Animated.View>
        <Animated.View style={[styles.abs, { left: (a.kind === "cow" ? 0.6 : 0.3) * u - 0.2 * full, top: -0.36 * full }, food]}>
          <FeedThumb feed={feedPile} size={0.4 * full} />
        </Animated.View>
      </Animated.View>
      {a.mood === "hungry" || a.mood === "frail" ? <Badge y={badgeY}><Bowl u={base} /></Badge> : a.ready ? <Badge y={badgeY}>{a.kind === "cow" ? <Bottle u={base} /> : <NestEgg u={base} />}</Badge> : null}
      {a.note ? (
        <View style={[styles.note, { top: 4 }]}>
          <Text style={styles.noteText} numberOfLines={1}>
            {a.note}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
};

const Badge = ({ y, children }: { y: number; children: ReactNode }) => <View style={[styles.badgeAt, { bottom: -y }]}>{children}</View>;

export const PenAnimals = memo(function PenAnimals({
  pen,
  gate,
  exit,
  animals,
  live,
  feeding,
  onFed,
  onLeft,
}: {
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
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {animals.map((a) => (
        <Critter key={a.id} a={a} pen={pen} gate={gate} exit={exit} base={base} clock={clock} live={live} feeding={feeding?.id === a.id ? feeding.key : null} onFed={onFed} onLeft={onLeft} />
      ))}
    </View>
  );
});

export const animalAt = (pen: PenCorners, id: string, mood: Mood, phase: number) => {
  const pace = mood === "frail" || mood === "gone" ? null : mood === "hungry" ? PACE.hungry : PACE.fed;
  const w = wanderAt(seedOf(id), phase, pace);
  return penPoint(pen, w.u, w.v);
};

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  badgeAt: { position: "absolute", left: -40, width: 80, alignItems: "center" },
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
  note: { position: "absolute", left: -90, width: 180, alignItems: "center" },
  noteText: { color: tint.noteText, backgroundColor: tint.note, fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
});

export const AnimalThumb = memo(function AnimalThumb({ kind, stage, size, mood = "fed" }: { kind: Kind; stage: Stage; size: number; mood?: Mood }) {
  const look: Look = { stage, progress: stage === 2 ? 1 : 0.6, mood };
  const u = (kind === "cow" ? 0.62 : 1.25) * size;
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <View style={[styles.abs, { left: size / 2 - (kind === "cow" ? 0.06 : 0.04) * u, top: size * 0.9, transform: [{ scale: sizeOf(look) }], transformOrigin: "bottom" } as ViewStyle]}>
        {kind === "cow" ? (
          <>
            <View style={[styles.abs, { left: -0.46 * u, top: -0.78 * u }]}>
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
