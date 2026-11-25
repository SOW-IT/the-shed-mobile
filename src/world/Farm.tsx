import { growthLook, isCrop, type CropId, type Stage } from "@shared/farm";
import { memo, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { GoldCoin } from "@/components/games/GoldCoin";
import { Ellipse } from "./Shapes";
import { farm, garden, mix } from "./palette";
import { popShadow } from "./popShadow";

type Tone = "fresh" | "wilted" | "dead";

const tone = (colour: string, look: Tone) => (look === "dead" ? mix(colour, farm.dead, 0.85) : look === "wilted" ? mix(colour, farm.wilt, 0.5) : colour);

const Leaf = ({ x, y, w, h, turn, fill, ink }: { x: number; y: number; w: number; h: number; turn: number; fill: string; ink: number }) => (
  <View
    pointerEvents="none"
    style={[
      styles.abs,
      {
        left: x - w / 2,
        top: y - h,
        width: w,
        height: h,
        borderRadius: w / 2,
        borderBottomLeftRadius: w * 0.12,
        borderBottomRightRadius: w * 0.12,
        backgroundColor: fill,
        borderWidth: ink,
        borderColor: garden.ink,
        transformOrigin: "bottom",
        transform: [{ rotate: `${turn}deg` }],
      },
    ]}
  />
);

const Segment = ({ a, b, w, fill }: { a: [number, number]; b: [number, number]; w: number; fill: string }) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) + w;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left: (a[0] + b[0]) / 2 - length / 2,
          top: (a[1] + b[1]) / 2 - w / 2,
          width: length,
          height: w,
          borderRadius: w / 2,
          backgroundColor: fill,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        },
      ]}
    />
  );
};

type Paint = { u: number; t: Tone; droop: number; ink: number; k: number };

const ball = (key: string, p: Paint, cx: number, cy: number, rx: number, ry: number, fill: string) => (
  <Ellipse key={key} cx={cx * p.u} cy={cy * p.u} rx={rx * p.u} ry={ry * p.u} fill={tone(fill, p.t)} ink={p.ink} inkColour={garden.ink} ramp />
);

const leaf = (key: string, p: Paint, x: number, y: number, w: number, h: number, turn: number, light = false) => (
  <Leaf key={key} x={x * p.u} y={y * p.u} w={w * p.u} h={h * p.u * (p.droop > 0 ? 0.65 : 1)} turn={turn + (turn < 0 ? -p.droop : p.droop)} fill={tone(light ? farm.leafLight : farm.leaf, p.t)} ink={p.ink} />
);

const fan = (key: string, p: Paint, n: number, spread: number, w: number, h: number, y = 0) =>
  Array.from({ length: n }, (_, i) => leaf(`${key}${i}`, p, 0, y, w, h, n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1), i % 2 === 1));

const stalk = (key: string, p: Paint, h: number, fill: string = farm.stem) => (
  <Segment key={key} a={[0, 0]} b={[0, -h * p.u]} w={Math.max(2, 0.035 * p.u)} fill={tone(fill, p.t)} />
);

const flower = (key: string, p: Paint, cx: number, cy: number, r: number, petal: string) => (
  <View key={key} pointerEvents="none" style={styles.abs}>
    {[0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2;
      return <Ellipse key={`p${i}`} cx={(cx + Math.cos(a) * r) * p.u} cy={(cy + Math.sin(a) * r) * p.u} rx={r * 0.75 * p.u} ry={r * 0.75 * p.u} fill={tone(petal, p.t)} ink={p.ink * 0.7} inkColour={garden.ink} />;
    })}
    <Ellipse cx={cx * p.u} cy={cy * p.u} rx={r * 0.6 * p.u} ry={r * 0.6 * p.u} fill={tone(farm.bloomDeep, p.t)} />
  </View>
);

const vine = (key: string, p: Paint, length: number) => {
  const pts: [number, number][] = [[0, 0], [length * 0.35, -0.04], [length * 0.7, 0.02], [length, -0.02]];
  return pts.slice(1).map((pt, i) => <Segment key={`${key}${pt[0]}`} a={[pts[i][0] * p.u, pts[i][1] * p.u]} b={[pt[0] * p.u, pt[1] * p.u]} w={Math.max(2, 0.04 * p.u)} fill={tone(farm.stem, p.t)} />);
};

const melon = (key: string, p: Paint, cx: number, rx: number, ry: number, fill: string, dark: string) => [
  ball(`${key}m`, p, cx, -ry * 0.9, rx, ry, fill),
  ...[-0.5, 0, 0.5].map((f) => <Ellipse key={`${key}s${f}`} cx={(cx + f * rx) * p.u} cy={-ry * 0.9 * p.u} rx={rx * 0.12 * p.u} ry={ry * 0.85 * p.u} fill={tone(dark, p.t)} />),
];

const topStem = (key: string, p: Paint, y: number) => <Segment key={key} a={[0, y * p.u]} b={[0.03 * p.u, (y - 0.1) * p.u]} w={Math.max(2, 0.05 * p.u)} fill={tone(farm.stem, p.t)} />;

const mound = (p: Paint) => <Ellipse key="mound" cx={0} cy={-0.02 * p.u} rx={0.26 * p.u} ry={0.09 * p.u} fill={tone(farm.mound, p.t)} ink={p.ink} inkColour={garden.ink} />;

const ripeShape = (crop: CropId, p: Paint): ReactNode[] => {
  const f = farm.crops[crop];
  if (crop === "lettuce") return [ball("a", p, -0.14, -0.14, 0.2, 0.17, f.dark), ball("b", p, 0.15, -0.14, 0.2, 0.17, f.dark), ball("c", p, 0, -0.2, 0.25, 0.22, f.fruit), ball("d", p, 0, -0.28, 0.14, 0.12, f.light)];
  if (crop === "carrot") return [...fan("f", p, 4, 30, 0.08, 0.46, -0.08), ball("top", p, 0, -0.06, 0.15, 0.09, f.fruit)];
  if (crop === "strawberry") return [...fan("f", p, 4, 60, 0.2, 0.3), ball("b1", p, -0.2, -0.08, 0.09, 0.1, f.fruit), ball("b2", p, 0.18, -0.1, 0.09, 0.1, f.fruit), ball("b3", p, 0.02, -0.04, 0.1, 0.11, f.fruit)];
  if (crop === "tomato") return [stalk("stake", p, 0.85, garden.wood), ...fan("f", p, 4, 40, 0.15, 0.3, -0.2), ball("t1", p, -0.14, -0.3, 0.1, 0.1, f.fruit), ball("t2", p, 0.15, -0.46, 0.1, 0.1, f.fruit), ball("t3", p, -0.1, -0.62, 0.09, 0.09, f.fruit)];
  if (crop === "pumpkin") return [leaf("l1", p, -0.14, 0, 0.2, 0.22, -40), leaf("l2", p, 0.14, 0, 0.2, 0.22, 40, true), ball("p", p, 0, -0.2, 0.3, 0.22, f.fruit), ball("s1", p, -0.12, -0.2, 0.11, 0.2, f.dark), ball("s2", p, 0.12, -0.2, 0.11, 0.2, f.dark), ball("mid", p, 0, -0.21, 0.12, 0.21, f.fruit), topStem("stem", p, -0.4)];
  return [leaf("l1", p, -0.14, 0, 0.2, 0.2, -40), leaf("l2", p, 0.14, 0, 0.2, 0.2, 40, true), ...melon("w", p, 0, 0.33, 0.2, f.fruit, f.dark)];
};

const stepShape = (crop: CropId, step: string, p: Paint): ReactNode[] => {
  const f = farm.crops[crop];
  const k = p.k;
  const sprout = [stalk("st", p, 0.1 + 0.1 * k), leaf("sl", p, 0, -0.1 - 0.1 * k, 0.1, 0.16 + 0.06 * k, -50), leaf("sr", p, 0, -0.1 - 0.1 * k, 0.1, 0.16 + 0.06 * k, 50, true)];
  if (crop === "lettuce") {
    if (step === "leaves") return fan("lv", p, 3 + Math.round(k * 2), 70, 0.16 + 0.06 * k, 0.2 + 0.1 * k);
    return [...fan("lv", p, 5, 75, 0.2, 0.28), ball("h", p, 0, -0.12 - 0.04 * k, 0.12 + 0.1 * k, 0.1 + 0.09 * k, mix(farm.leafLight, f.fruit, k))];
  }
  if (crop === "carrot") {
    if (step === "tops") return fan("t", p, 2 + Math.round(k * 2), 25, 0.07, 0.14 + 0.24 * k);
    return [...fan("t", p, 4, 30, 0.08, 0.38 + 0.08 * k, -0.04 * k), ball("sh", p, 0, -0.03, 0.05 + 0.09 * k, 0.03 + 0.05 * k, f.fruit)];
  }
  if (crop === "strawberry") {
    const bush = fan("b", p, step === "leaves" ? 2 + Math.round(k * 2) : 4, 60, 0.18 + (step === "leaves" ? 0.02 * k : 0.02), 0.22 + (step === "leaves" ? 0.06 * k : 0.08));
    if (step === "leaves") return bush;
    if (step === "flowers") return [...bush, flower("f1", p, -0.12, -0.2, 0.04 + 0.015 * k, farm.petal), flower("f2", p, 0.14, -0.16, 0.035 + 0.015 * k, farm.petal)];
    const berry = mix(farm.leafLight, f.light, k * 0.6);
    return [...bush, ball("r1", p, -0.18, -0.07, 0.05 + 0.03 * k, 0.06 + 0.03 * k, berry), ball("r2", p, 0.16, -0.09, 0.05 + 0.03 * k, 0.06 + 0.03 * k, berry), ball("r3", p, 0.02, -0.04, 0.06 + 0.03 * k, 0.07 + 0.03 * k, berry)];
  }
  if (crop === "tomato") {
    if (step === "sprout") return sprout;
    const height = step === "stem" ? 0.3 + 0.25 * k : 0.6;
    const plant = [stalk("stake", p, height + 0.15, garden.wood), stalk("stem", p, height), ...fan("l", p, step === "stem" ? 2 + Math.round(k * 2) : 4, 40, 0.13, 0.24, -height * 0.4)];
    if (step === "stem") return plant;
    if (step === "flower") return [...plant, flower("f1", p, -0.12, -0.36, 0.035 + 0.015 * k, farm.bloom), flower("f2", p, 0.13, -0.5, 0.035 + 0.015 * k, farm.bloom)];
    const green = mix(farm.leafLight, f.light, k * 0.35);
    return [...plant, ball("g1", p, -0.13, -0.3, 0.05 + 0.04 * k, 0.05 + 0.04 * k, green), ball("g2", p, 0.14, -0.44, 0.05 + 0.04 * k, 0.05 + 0.04 * k, green), ball("g3", p, -0.08, -0.56, 0.04 + 0.04 * k, 0.04 + 0.04 * k, green)];
  }
  if (step === "sprout") return sprout;
  const runner = step === "vine" ? 0.12 + 0.16 * k : 0.28;
  const growing = [...vine("v", p, runner), leaf("l1", p, 0, 0, 0.15, 0.18, -35), leaf("l2", p, runner * 0.6, 0, 0.14, 0.16, 35, true)];
  if (step === "vine") return growing;
  const leafy = [...growing, ...vine("v2", p, -runner * 0.8), leaf("l3", p, -runner * 0.5, 0, 0.16, 0.18, -45, true), leaf("l4", p, runner * 0.9, 0, 0.15, 0.16, 35)];
  if (step === "leaves") return leafy;
  if (step === "flower") return [...leafy, flower("fl", p, runner * 0.3, -0.12, 0.05 + 0.02 * k, farm.bloom)];
  if (crop === "pumpkin") {
    const r = step === "small" ? 0.1 + 0.06 * k : 0.17 + 0.1 * k;
    const colour = step === "small" ? farm.leafLight : mix(farm.leafLight, f.fruit, k);
    return [...leafy, ball("pk", p, runner * 0.2, -r * 0.8, r, r * 0.75, colour), topStem("ps", p, -r * 1.5)];
  }
  const rx = step === "small" ? 0.1 + 0.05 * k : step === "bigger" ? 0.16 + 0.06 * k : 0.23 + 0.1 * k;
  return [...leafy, ...melon("m", p, runner * 0.2, rx, rx * 0.58, f.fruit, f.dark)];
};

const SEED_COUNT: Record<CropId, number> = { lettuce: 5, carrot: 4, strawberry: 5, tomato: 4, pumpkin: 3, watermelon: 4 };
const SEED_SPOTS: readonly [number, number, number][] = [
  [0, 0, -20],
  [-0.22, 0.1, 25],
  [0.21, 0.08, -40],
  [-0.1, -0.19, 60],
  [0.13, -0.18, 10],
];

const Seed = ({ crop, x, y, s, turn }: { crop: CropId; x: number; y: number; s: number; turn: number }) => {
  const fill = farm.seeds[crop];
  const ink = Math.max(1, s * 0.06);
  if (crop === "strawberry") return <Ellipse cx={x} cy={y} rx={s * 0.08} ry={s * 0.08} fill={fill} ink={ink * 0.6} inkColour={garden.ink} />;
  if (crop === "tomato") return <Ellipse cx={x} cy={y} rx={s * 0.16} ry={s * 0.12} fill={fill} ink={ink} inkColour={garden.ink} />;
  const w = crop === "pumpkin" ? s * 0.3 : crop === "carrot" ? s * 0.14 : crop === "watermelon" ? s * 0.17 : s * 0.11;
  const h = crop === "pumpkin" ? s * 0.42 : crop === "carrot" ? s * 0.24 : crop === "watermelon" ? s * 0.26 : s * 0.28;
  const drop = crop === "lettuce" || crop === "watermelon";
  return (
    <View
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left: x - w / 2,
          top: y - h / 2,
          width: w,
          height: h,
          borderRadius: w / 2,
          borderTopLeftRadius: drop ? w * 0.08 : w / 2,
          borderTopRightRadius: drop ? w : w / 2,
          backgroundColor: fill,
          borderWidth: crop === "pumpkin" ? Math.max(1.5, s * 0.05) : ink,
          borderColor: crop === "pumpkin" ? farm.seedRim : garden.ink,
          transform: [{ rotate: `${turn + (drop ? 45 : 0)}deg` }],
          overflow: "hidden",
        },
      ]}
    >
      {crop === "carrot" ? [0.33, 0.66].map((f) => <View key={f} style={[styles.abs, { left: w * f - 0.5, top: h * 0.12, width: 1, height: h * 0.76, backgroundColor: garden.ink, opacity: 0.45 }]} />) : null}
      {crop === "watermelon" ? <View style={[styles.abs, { left: w * 0.25, top: h * 0.2, width: w * 0.22, height: h * 0.3, borderRadius: w, backgroundColor: farm.seedShine, opacity: 0.8 }]} /> : null}
    </View>
  );
};

export const SeedCluster = memo(function SeedCluster({ crop, size, dish = false }: { crop: CropId; size: number; dish?: boolean }) {
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, dish && { borderRadius: size / 2, backgroundColor: farm.dish, borderWidth: 2, borderColor: garden.ink }]}>
      {SEED_SPOTS.slice(0, SEED_COUNT[crop]).map(([x, y, turn]) => (
        <Seed key={`${x}:${y}`} crop={crop} x={size / 2 + x * size} y={size / 2 + y * size} s={size * 0.62} turn={turn} />
      ))}
    </View>
  );
});

const Sparkle = ({ clock, x, y, size, phase }: { clock: SharedValue<number>; x: number; y: number; size: number; phase: number }) => {
  const style = useAnimatedStyle(() => {
    const k = (clock.value + phase) % 1;
    const glow = Math.max(0, Math.sin(k * Math.PI * 2));
    return { opacity: glow, transform: [{ scale: 0.6 + glow * 0.5 }, { rotate: "45deg" }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - size / 2, top: y - size / 2, width: size, height: size }, style]}>
      <View style={[styles.abs, { left: size * 0.4, top: 0, width: size * 0.2, height: size, borderRadius: size * 0.1, backgroundColor: farm.sparkle }]} />
      <View style={[styles.abs, { top: size * 0.4, left: 0, height: size * 0.2, width: size, borderRadius: size * 0.1, backgroundColor: farm.sparkle }]} />
    </Animated.View>
  );
};

const Drop = ({ x, y, size, popping, live }: { x: number; y: number; size: number; popping: boolean; live: boolean }) => {
  const pop = useSharedValue(0);
  useEffect(() => {
    if (popping && live) pop.value = withSequence(withTiming(-0.25, { duration: 90 }), withTiming(1, { duration: 220, easing: Easing.in(Easing.quad) }));
    else pop.value = popping ? 1 : 0;
  }, [popping, live, pop]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, pop.value), transform: [{ scale: 1 - pop.value * 0.9 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - size / 2, top: y - size / 2, width: size, height: size }, style]}>
      <View
        style={[
          styles.drop,
          { width: size * 0.8, height: size * 0.8, left: size * 0.1, top: size * 0.15, borderRadius: size * 0.4, borderTopRightRadius: size * 0.04, borderWidth: Math.max(1.5, size * 0.08) },
        ]}
      />
      <View style={[styles.abs, { left: size * 0.3, top: size * 0.42, width: size * 0.16, height: size * 0.16, borderRadius: size, backgroundColor: farm.dropLight }]} />
    </Animated.View>
  );
};

const usePulse = (live: boolean, ms: number) => {
  const clock = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      cancelAnimation(clock);
      clock.value = 0;
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [live, clock, ms]);
  return clock;
};

const BOB_MS = 1800;
const DROP_POP_MS = 320;

export const PlantView = memo(function PlantView({
  x,
  y,
  scale,
  crop,
  stage,
  progress,
  wilted,
  thirsty,
  live,
}: {
  x: number;
  y: number;
  scale: number;
  crop: string;
  stage: Stage;
  progress: number;
  wilted: boolean;
  thirsty: boolean;
  live: boolean;
}) {
  const clock = usePulse(live && stage === "ripe", BOB_MS);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.abs(Math.sin(clock.value * Math.PI * 2)) * scale * 0.035 }] }));
  const t: Tone = stage === "dead" ? "dead" : wilted ? "wilted" : "fresh";
  const squash = t === "dead" ? 0.7 : t === "wilted" ? 0.88 : 1;
  const stand = useSharedValue(squash);
  useEffect(() => {
    stand.value = live ? withSpring(squash, { damping: 7, stiffness: 160, mass: 0.6 }) : squash;
  }, [squash, live, stand]);
  const upright = useAnimatedStyle(() => ({ transform: [{ scaleY: stand.value }] }));
  const showDrop = thirsty && stage !== "dead";
  const [dropShown, setDropShown] = useState(showDrop);
  const [dropGoing, setDropGoing] = useState(false);
  if (showDrop && (!dropShown || dropGoing)) {
    setDropShown(true);
    setDropGoing(false);
  }
  if (!showDrop && dropShown && !dropGoing) setDropGoing(true);
  useEffect(() => {
    if (!dropGoing) return;
    const id = setTimeout(
      () => {
        setDropShown(false);
        setDropGoing(false);
      },
      live ? DROP_POP_MS : 0
    );
    return () => clearTimeout(id);
  }, [dropGoing, live]);
  const kind: CropId = isCrop(crop) ? crop : "lettuce";
  const look = growthLook(kind, progress, stage === "ripe");
  const u = scale * look.size;
  const p: Paint = { u, t, droop: t === "fresh" ? 0 : t === "wilted" ? 38 : 70, ink: Math.max(1, 0.022 * scale), k: look.k };
  const body =
    look.step === "seed"
      ? [
          mound(p),
          <View key="seeds" style={[styles.abs, { left: -0.12 * scale, top: -0.15 * scale }]}>
            <SeedCluster crop={kind} size={0.24 * scale} />
          </View>,
        ]
      : look.step === "ripe"
        ? ripeShape(kind, p)
        : stepShape(kind, look.step, p);
  return (
    <View pointerEvents="none" style={[styles.abs, { left: x, top: y }]} testID={`world-plant-${kind}-${look.step}${wilted ? "-wilted" : ""}${stage === "dead" ? "-dead" : ""}`}>
      <Ellipse cx={0} cy={0} rx={0.32 * scale} ry={0.08 * scale} fill={garden.shadow} />
      <Animated.View style={[styles.abs, bob]}>
        <Animated.View style={[styles.abs, { transformOrigin: "top" } as ViewStyle, upright]}>{body}</Animated.View>
      </Animated.View>
      {stage === "ripe" && live ? (
        <>
          <Sparkle clock={clock} x={-0.3 * scale} y={-0.5 * scale} size={0.12 * scale} phase={0} />
          <Sparkle clock={clock} x={0.3 * scale} y={-0.35 * scale} size={0.1 * scale} phase={0.35} />
          <Sparkle clock={clock} x={0.05 * scale} y={-0.75 * scale} size={0.09 * scale} phase={0.7} />
        </>
      ) : null}
      {dropShown ? <Drop x={0.3 * scale} y={-0.4 * scale} size={Math.max(14, 0.16 * scale)} popping={dropGoing} live={live} /> : null}
    </View>
  );
});

export const CropThumb = memo(function CropThumb({ crop, size }: { crop: CropId; size: number }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <PlantView x={size / 2} y={size * 0.82} scale={size * 1.05} crop={crop} stage="ripe" progress={1} wilted={false} thirsty={false} live={false} />
    </View>
  );
});

const WATER_MS = 1000;
const PLANT_MS = 800;
const HARVEST_MS = 900;
const CHIP_MS = 1100;

export const WateringCan = ({ x, y, scale, live, onDone }: { x: number; y: number; scale: number; live: boolean; onDone: () => void }) => {
  const clock = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      onDone();
      return;
    }
    clock.value = withTiming(1, { duration: WATER_MS, easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    return () => cancelAnimation(clock);
  }, [live, clock, onDone]);
  const u = scale;
  const tilt = useAnimatedStyle(() => {
    const k = clock.value;
    const pour = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1;
    return { opacity: Math.min(1, k * 10, (1 - k) * 10), transform: [{ translateY: (1 - Math.min(1, k * 5)) * -0.15 * u }, { rotate: `${-40 * pour}deg` }] };
  });
  if (!live) return null;
  return (
    <View pointerEvents="none" style={[styles.abs, { left: x + 0.42 * u, top: y - 0.95 * u }]} testID="world-watering-can">
      {[0, 1, 2, 3, 4].map((i) => (
        <CanDrop key={`d${i}`} clock={clock} i={i} u={u} />
      ))}
      {[0, 1, 2].map((i) => (
        <Splash key={`s${i}`} clock={clock} i={i} u={u} />
      ))}
      <Animated.View style={[styles.abs, { left: -0.22 * u, top: -0.18 * u, width: 0.44 * u, height: 0.36 * u, transformOrigin: "left" } as ViewStyle, tilt]}>
        <View style={[styles.canSpout, { left: -0.3 * u, top: 0.06 * u, width: 0.36 * u, height: Math.max(3, 0.06 * u), borderWidth: Math.max(1, 0.02 * u) }]} />
        <View style={[styles.canBody, { width: 0.44 * u, height: 0.36 * u, borderRadius: 0.08 * u, borderWidth: Math.max(1.5, 0.025 * u) }]} />
        <View style={[styles.canHandle, { left: 0.1 * u, top: -0.12 * u, width: 0.24 * u, height: 0.18 * u, borderRadius: 0.09 * u, borderWidth: Math.max(2, 0.04 * u) }]} />
      </Animated.View>
    </View>
  );
};

const CanDrop = ({ clock, i, u }: { clock: SharedValue<number>; i: number; u: number }) => {
  const style = useAnimatedStyle(() => {
    const k = clock.value;
    const t = ((k - 0.2) * 3.5 + i / 5) % 1;
    const on = k > 0.2 && k < 0.82;
    return { opacity: on ? 1 : 0, transform: [{ translateX: -t * 0.18 * u }, { translateY: t * t * 0.7 * u }] };
  });
  return <Animated.View style={[styles.abs, { left: -0.5 * u, top: 0.02 * u, width: 0.05 * u, height: 0.07 * u, borderRadius: u, backgroundColor: farm.drop }, style]} />;
};

const Splash = ({ clock, i, u }: { clock: SharedValue<number>; i: number; u: number }) => {
  const style = useAnimatedStyle(() => {
    const k = clock.value;
    const t = ((k - 0.3) * 3 + i / 3) % 1;
    const on = k > 0.3 && k < 0.9;
    return { opacity: on ? 1 - t : 0, transform: [{ translateX: (i - 1) * t * 0.12 * u }, { translateY: -Math.sin(t * Math.PI) * 0.08 * u }, { scale: 0.6 + t * 0.6 }] };
  });
  return <Animated.View style={[styles.abs, { left: -0.7 * u, top: 0.72 * u, width: 0.06 * u, height: 0.04 * u, borderRadius: u, backgroundColor: farm.dropLight }, style]} />;
};

export const PlantingPuff = ({ x, y, scale, crop, live, onDone }: { x: number; y: number; scale: number; crop: CropId; live: boolean; onDone: () => void }) => {
  const k = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      onDone();
      return;
    }
    k.value = withTiming(1, { duration: PLANT_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    return () => cancelAnimation(k);
  }, [live, k, onDone]);
  const seed = useAnimatedStyle(() => {
    const t = Math.min(1, k.value / 0.45);
    return { opacity: k.value < 0.5 ? 1 : 0, transform: [{ translateX: (1 - t) * 0.35 * scale }, { translateY: -Math.sin((1 - t) * Math.PI * 0.5) * 0.6 * scale }] };
  });
  const pat = useAnimatedStyle(() => {
    const t = k.value < 0.45 ? 0 : (k.value - 0.45) / 0.55;
    const squish = Math.sin(t * Math.PI) * (1 - t);
    return { transform: [{ scaleX: 1 + squish * 0.35 }, { scaleY: 1 - squish * 0.45 }] };
  });
  const dust = useAnimatedStyle(() => {
    const t = k.value < 0.45 ? 0 : (k.value - 0.45) / 0.55;
    return { opacity: t === 0 ? 0 : 0.85 * (1 - t), transform: [{ translateY: -t * 0.25 * scale }, { scale: 0.5 + t }] };
  });
  if (!live) return null;
  return (
    <View pointerEvents="none" style={[styles.abs, { left: x, top: y }]} testID="world-planting">
      <Animated.View style={[styles.abs, pat]}>
        <Ellipse cx={0} cy={-0.02 * scale} rx={0.28 * scale} ry={0.1 * scale} fill={farm.mound} ink={Math.max(1, 0.022 * scale)} inkColour={garden.ink} />
      </Animated.View>
      <Animated.View style={[styles.abs, { left: -0.08 * scale, top: -0.12 * scale }, seed]}>
        <SeedCluster crop={crop} size={0.16 * scale} />
      </Animated.View>
      {[-1, 0, 1].map((side) => (
        <Animated.View key={side} style={[styles.abs, { left: side * 0.16 * scale - 0.06 * scale, top: -0.1 * scale, width: 0.12 * scale, height: 0.12 * scale, borderRadius: scale, backgroundColor: farm.dust }, dust]} />
      ))}
    </View>
  );
};

export const FlyingCrop = ({ from, to, live, onDone, children }: { from: { x: number; y: number }; to: { x: number; y: number }; live: boolean; onDone: () => void; children: ReactNode }) => {
  const k = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      onDone();
      return;
    }
    k.value = withTiming(1, { duration: HARVEST_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    return () => cancelAnimation(k);
  }, [live, k, onDone]);
  const style = useAnimatedStyle(() => {
    const v = k.value;
    const popUp = Math.min(1, v / 0.25);
    const t = v < 0.25 ? 0 : (v - 0.25) / 0.75;
    const eased = t * t;
    const stretch = v < 0.25 ? Math.sin(popUp * Math.PI) : 0;
    return {
      opacity: t > 0.9 ? (1 - t) / 0.1 : 1,
      transform: [
        { translateX: (to.x - from.x) * eased },
        { translateY: -popUp * 40 + (to.y - from.y + 40) * eased - Math.sin(t * Math.PI) * 50 },
        { scaleX: (1 - stretch * 0.2) * (1 - eased * 0.55) },
        { scaleY: (1 + stretch * 0.3) * (1 - eased * 0.55) },
      ],
    };
  });
  if (!live) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: from.x - 28, top: from.y - 48, width: 56, height: 56 }, style]} testID="world-crop-flying">
      {children}
    </Animated.View>
  );
};

export const GainChip = ({ text, x, y, live, onDone }: { text: string; x: number; y: number; live: boolean; onDone: () => void }) => {
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withTiming(1, { duration: CHIP_MS, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    return () => cancelAnimation(k);
  }, [k, onDone]);
  const style = useAnimatedStyle(() => ({ opacity: k.value < 0.7 ? 1 : (1 - k.value) / 0.3, transform: [{ translateY: live ? -k.value * 26 : 0 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.chip, { left: x, top: y }, style]} testID="world-gain-chip">
      <Text style={styles.chipText}>{text}</Text>
    </Animated.View>
  );
};

export const PriceTag = ({ x, y, price }: { x: number; y: number; price: number }) => (
  <View pointerEvents="none" style={[styles.tag, { left: x - 28, top: y - 10 }]}>
    <GoldCoin size={11} />
    <Text style={styles.tagText}>{price}</Text>
  </View>
);

export const PlotNote = ({ x, y, text }: { x: number; y: number; text: string }) => (
  <View pointerEvents="none" style={[styles.note, { left: x - 90, top: y }]}>
    <Text style={styles.noteText} numberOfLines={1}>
      {text}
    </Text>
  </View>
);

export const PlotCard = ({ x, y, text, stageWidth }: { x: number; y: number; text: string; stageWidth: number }) => (
  <View pointerEvents="none" style={[styles.card, { left: Math.min(Math.max(8, x - CARD_WIDTH / 2), stageWidth - CARD_WIDTH - 8), top: y - 44 }]} testID="world-plant-card">
    <Text style={styles.cardText} numberOfLines={2}>
      {text}
    </Text>
  </View>
);

const CARD_WIDTH = 270;

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  drop: { position: "absolute", backgroundColor: farm.drop, borderColor: garden.ink, transform: [{ rotate: "-45deg" }] },
  canBody: { position: "absolute", left: 0, top: 0, backgroundColor: farm.can, borderColor: garden.ink },
  canSpout: { position: "absolute", backgroundColor: farm.canDark, borderColor: garden.ink, transform: [{ rotate: "-25deg" }] },
  canHandle: { position: "absolute", borderColor: farm.canDark, borderBottomColor: "transparent" },
  chip: { position: "absolute", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: farm.card, borderWidth: 2, borderColor: garden.ink },
  chipText: { color: garden.ink, fontSize: 13, fontWeight: "800" },
  tag: { position: "absolute", width: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 2, borderRadius: 999, backgroundColor: farm.tag },
  tagText: { color: farm.tagText, fontSize: 11, fontWeight: "800" },
  note: { position: "absolute", width: 180, alignItems: "center" },
  noteText: { color: farm.tagText, backgroundColor: farm.tag, fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  card: { position: "absolute", width: CARD_WIDTH, alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: farm.card, borderWidth: 2.5, borderColor: garden.ink, ...popShadow() },
  cardText: { color: garden.ink, fontSize: 14, fontWeight: "700", textAlign: "center" },
});
