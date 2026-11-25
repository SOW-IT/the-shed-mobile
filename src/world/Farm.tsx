import { isCrop, type CropId, type Stage } from "@shared/farm";
import { memo, useEffect, type ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { GoldCoin } from "@/components/games/GoldCoin";
import { Ellipse } from "./Shapes";
import { farm, garden, mix } from "./palette";
import { popShadow } from "./popShadow";

type Look = "fresh" | "wilted" | "dead";

const tone = (colour: string, look: Look) => (look === "dead" ? mix(colour, farm.dead, 0.85) : look === "wilted" ? mix(colour, farm.wilt, 0.5) : colour);

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

const Stalk = ({ x, y, h, w, fill }: { x: number; y: number; h: number; w: number; fill: string }) => (
  <View pointerEvents="none" style={[styles.abs, { left: x - w / 2, top: y - h, width: w, height: h, borderRadius: w / 2, backgroundColor: fill }]} />
);

const leafPair = (u: number, size: number, look: Look, droop: number, key: string, ink: number, lift = 0): ReactNode[] => {
  const fill = tone(farm.leaf, look);
  const light = tone(farm.leafLight, look);
  return [
    <Leaf key={`${key}l`} x={-0.05 * u} y={-lift * u} w={0.16 * size * u} h={0.34 * size * u} turn={-48 - droop} fill={fill} ink={ink} />,
    <Leaf key={`${key}r`} x={0.05 * u} y={-lift * u} w={0.16 * size * u} h={0.34 * size * u} turn={48 + droop} fill={light} ink={ink} />,
  ];
};

const fruitOf = (crop: CropId, look: Look) => {
  const c = farm.crops[crop];
  return { fruit: tone(c.fruit, look), light: tone(c.light, look), dark: tone(c.dark, look) };
};

const ripeShape = (crop: CropId, u: number, look: Look, droop: number, ink: number): ReactNode[] => {
  const f = fruitOf(crop, look);
  const leaf = tone(farm.leaf, look);
  const leafLight = tone(farm.leafLight, look);
  const ball = (key: string, cx: number, cy: number, rx: number, ry: number, fill: string) => (
    <Ellipse key={key} cx={cx * u} cy={cy * u} rx={rx * u} ry={ry * u} fill={fill} ink={ink} inkColour={garden.ink} ramp />
  );
  if (crop === "lettuce") {
    return [ball("a", -0.14, -0.14, 0.2, 0.17, f.dark), ball("b", 0.15, -0.14, 0.2, 0.17, f.dark), ball("c", 0, -0.2, 0.25, 0.22, f.fruit), ball("d", 0, -0.28, 0.14, 0.12, f.light)];
  }
  if (crop === "carrot") {
    return [
      ...[-30, -10, 10, 30].map((turn, i) => <Leaf key={`f${turn}`} x={0} y={-0.08 * u} w={0.08 * u} h={0.46 * u} turn={turn + (turn < 0 ? -droop : droop)} fill={i % 2 ? leafLight : leaf} ink={ink} />),
      ball("top", 0, -0.06, 0.15, 0.09, f.fruit),
    ];
  }
  if (crop === "strawberry") {
    return [
      ...[-60, -20, 20, 60].map((turn, i) => <Leaf key={`f${turn}`} x={0} y={0} w={0.2 * u} h={0.3 * u} turn={turn + (turn < 0 ? -droop : droop)} fill={i % 2 ? leafLight : leaf} ink={ink} />),
      ball("b1", -0.2, -0.08, 0.09, 0.1, f.fruit),
      ball("b2", 0.18, -0.1, 0.09, 0.1, f.fruit),
      ball("b3", 0.02, -0.04, 0.1, 0.11, f.fruit),
    ];
  }
  if (crop === "tomato") {
    return [
      <Stalk key="stake" x={0} y={0} h={0.85 * u} w={Math.max(2, 0.04 * u)} fill={tone(garden.wood, look)} />,
      ...[[-40, 0.15], [40, 0.3], [-35, 0.45], [35, 0.58]].map(([turn, lift], i) => (
        <Leaf key={`f${lift}`} x={0} y={-lift * u} w={0.15 * u} h={0.3 * u} turn={turn + (turn < 0 ? -droop : droop)} fill={i % 2 ? leafLight : leaf} ink={ink} />
      )),
      ball("t1", -0.14, -0.3, 0.1, 0.1, f.fruit),
      ball("t2", 0.15, -0.46, 0.1, 0.1, f.fruit),
      ball("t3", -0.1, -0.62, 0.09, 0.09, f.fruit),
    ];
  }
  if (crop === "pumpkin") {
    return [
      <Leaf key="l1" x={-0.25 * u} y={0} w={0.24 * u} h={0.3 * u} turn={-60 - droop} fill={leaf} ink={ink} />,
      <Leaf key="l2" x={0.25 * u} y={0} w={0.24 * u} h={0.3 * u} turn={60 + droop} fill={leafLight} ink={ink} />,
      ball("p", 0, -0.2, 0.34, 0.24, f.fruit),
      ball("s1", -0.14, -0.2, 0.12, 0.22, f.dark),
      ball("s2", 0.14, -0.2, 0.12, 0.22, f.dark),
      ball("mid", 0, -0.21, 0.14, 0.23, f.fruit),
      <Stalk key="stem" x={0} y={-0.4 * u} h={0.12 * u} w={Math.max(2, 0.05 * u)} fill={tone(farm.stem, look)} />,
    ];
  }
  return [
    <Leaf key="l1" x={-0.3 * u} y={0} w={0.24 * u} h={0.28 * u} turn={-65 - droop} fill={leaf} ink={ink} />,
    <Leaf key="l2" x={0.32 * u} y={0} w={0.22 * u} h={0.26 * u} turn={65 + droop} fill={leafLight} ink={ink} />,
    ball("w", 0, -0.18, 0.4, 0.22, f.fruit),
    ...[-0.2, 0, 0.2].map((dx) => <Ellipse key={`st${dx}`} cx={dx * u} cy={-0.18 * u} rx={0.05 * u} ry={0.18 * u} fill={f.dark} />),
    <Ellipse key="shine" cx={-0.14 * u} cy={-0.28 * u} rx={0.1 * u} ry={0.04 * u} fill={f.light} opacity={0.8} />,
  ];
};

const halfShape = (crop: CropId, u: number, look: Look, droop: number, ink: number): ReactNode[] => {
  const f = fruitOf(crop, look);
  const small = (key: string, cx: number, cy: number, r: number) => (
    <Ellipse key={key} cx={cx * u} cy={cy * u} rx={r * u} ry={r * u} fill={tone(farm.leafLight, look)} ink={ink} inkColour={garden.ink} ramp />
  );
  const leaves = [...leafPair(u, 1.25, look, droop, "a", ink), ...leafPair(u, 0.95, look, droop + 18, "b", ink, 0.1)];
  if (crop === "tomato") return [<Stalk key="stake" x={0} y={0} h={0.6 * u} w={Math.max(2, 0.04 * u)} fill={tone(garden.wood, look)} />, ...leaves, small("g1", 0.1, -0.35, 0.06)];
  if (crop === "pumpkin" || crop === "watermelon") return [...leaves, small("g", 0.14, -0.08, 0.12)];
  if (crop === "carrot") return [...leaves, <Ellipse key="top" cx={0} cy={-0.03 * u} rx={0.07 * u} ry={0.04 * u} fill={f.fruit} />];
  if (crop === "strawberry") return [...leaves, <Ellipse key="flower" cx={0.12 * u} cy={-0.2 * u} rx={0.05 * u} ry={0.05 * u} fill={farm.card} ink={ink} inkColour={garden.ink} />];
  return [...leaves, small("head", 0, -0.12, 0.12)];
};

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

const Drop = ({ x, y, size }: { x: number; y: number; size: number }) => (
  <View pointerEvents="none" style={[styles.abs, { left: x - size / 2, top: y - size / 2, width: size, height: size }]}>
    <View
      style={[
        styles.drop,
        { width: size * 0.8, height: size * 0.8, left: size * 0.1, top: size * 0.15, borderRadius: size * 0.4, borderTopRightRadius: size * 0.04, borderWidth: Math.max(1.5, size * 0.08) },
      ]}
    />
    <View style={[styles.abs, { left: size * 0.3, top: size * 0.42, width: size * 0.16, height: size * 0.16, borderRadius: size, backgroundColor: farm.dropLight }]} />
  </View>
);

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

export const PlantView = memo(function PlantView({
  x,
  y,
  scale,
  crop,
  stage,
  wilted,
  thirsty,
  live,
}: {
  x: number;
  y: number;
  scale: number;
  crop: string;
  stage: Stage;
  wilted: boolean;
  thirsty: boolean;
  live: boolean;
}) {
  const clock = usePulse(live && stage === "ripe", BOB_MS);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.abs(Math.sin(clock.value * Math.PI * 2)) * scale * 0.035 }] }));
  const u = scale;
  const ink = Math.max(1, 0.022 * u);
  const look: Look = stage === "dead" ? "dead" : wilted ? "wilted" : "fresh";
  const droop = look === "fresh" ? 0 : look === "wilted" ? 38 : 70;
  const kind: CropId = isCrop(crop) ? crop : "lettuce";
  const mound = <Ellipse key="mound" cx={0} cy={-0.02 * u} rx={0.26 * u} ry={0.09 * u} fill={tone(farm.mound, look)} ink={ink} inkColour={garden.ink} />;
  const body =
    stage === "seed"
      ? [mound, <Ellipse key="seed" cx={0.02 * u} cy={-0.07 * u} rx={0.04 * u} ry={0.03 * u} fill={farm.seed} ink={ink} inkColour={garden.ink} />]
      : stage === "sprout"
        ? [mound, <Stalk key="stem" x={0} y={-0.04 * u} h={0.12 * u} w={Math.max(2, 0.03 * u)} fill={tone(farm.stem, look)} />, ...leafPair(u, 1, look, droop, "s", ink, 0.12)]
        : stage === "half"
          ? halfShape(kind, u, look, droop, ink)
          : ripeShape(kind, u, look, stage === "dead" ? droop : 0, ink);
  const squash = look === "dead" ? 0.7 : look === "wilted" ? 0.88 : 1;
  return (
    <View pointerEvents="none" style={[styles.abs, { left: x, top: y }]} testID={`world-plant-${kind}-${stage}${wilted ? "-wilted" : ""}`}>
      <Ellipse cx={0} cy={0} rx={0.32 * u} ry={0.08 * u} fill={garden.shadow} />
      <Animated.View style={[styles.abs, bob]}>
        <View style={[styles.abs, { transform: [{ scaleY: squash }], transformOrigin: "top" } as ViewStyle]}>{body}</View>
      </Animated.View>
      {stage === "ripe" && live ? (
        <>
          <Sparkle clock={clock} x={-0.3 * u} y={-0.5 * u} size={0.12 * u} phase={0} />
          <Sparkle clock={clock} x={0.3 * u} y={-0.35 * u} size={0.1 * u} phase={0.35} />
          <Sparkle clock={clock} x={0.05 * u} y={-0.75 * u} size={0.09 * u} phase={0.7} />
        </>
      ) : null}
      {thirsty && stage !== "dead" ? <Drop x={0.3 * u} y={-0.4 * u} size={Math.max(14, 0.16 * u)} /> : null}
    </View>
  );
});

export const CropThumb = memo(function CropThumb({ crop, size }: { crop: CropId; size: number }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <PlantView x={size / 2} y={size * 0.82} scale={size * 1.05} crop={crop} stage="ripe" wilted={false} thirsty={false} live={false} />
    </View>
  );
});

export const SeedPacket = memo(function SeedPacket({ crop, size }: { crop: CropId; size: number }) {
  return (
    <View pointerEvents="none" style={[styles.packet, { width: size * 0.78, height: size, borderRadius: size * 0.08 }]}>
      <View style={[styles.packetFold, { height: size * 0.14 }]} />
      <CropThumb crop={crop} size={size * 0.7} />
    </View>
  );
});

const CAN_MS = 1300;

export const WateringCan = ({ x, y, scale, live, onDone }: { x: number; y: number; scale: number; live: boolean; onDone: () => void }) => {
  const clock = useSharedValue(live ? 0 : 0.5);
  useEffect(() => {
    if (!live) {
      const id = setTimeout(onDone, CAN_MS);
      return () => clearTimeout(id);
    }
    clock.value = withTiming(1, { duration: CAN_MS, easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    return () => cancelAnimation(clock);
  }, [live, clock, onDone]);
  const u = scale;
  const tilt = useAnimatedStyle(() => {
    const k = clock.value;
    const pour = k < 0.25 ? k / 0.25 : k > 0.8 ? (1 - k) / 0.2 : 1;
    return { opacity: Math.min(1, k * 8, (1 - k) * 8 + 0.2), transform: [{ rotate: `${-38 * pour}deg` }] };
  });
  const drops = [0, 1, 2].map((i) => (
    <CanDrop key={`d${i}`} clock={clock} i={i} u={u} />
  ));
  return (
    <View pointerEvents="none" style={[styles.abs, { left: x + 0.42 * u, top: y - 0.95 * u }]} testID="world-watering-can">
      {drops}
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
    const t = ((k - 0.25) * 4 + i / 3) % 1;
    const on = k > 0.25 && k < 0.85;
    return { opacity: on ? 1 - t : 0, transform: [{ translateY: t * 0.55 * u }] };
  });
  return <Animated.View style={[styles.abs, { left: -0.48 * u + i * 0.05 * u, top: 0.02 * u, width: 0.05 * u, height: 0.08 * u, borderRadius: u, backgroundColor: farm.drop }, style]} />;
};

const FLY_MS = 750;

export const FlyingCrop = ({ from, to, crop, live, onDone }: { from: { x: number; y: number }; to: { x: number; y: number }; crop: CropId; live: boolean; onDone: () => void }) => {
  const k = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      onDone();
      return;
    }
    k.value = withTiming(1, { duration: FLY_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    return () => cancelAnimation(k);
  }, [live, k, onDone]);
  const style = useAnimatedStyle(() => {
    const t = k.value;
    const arc = Math.sin(t * Math.PI) * 60;
    return {
      opacity: t > 0.92 ? (1 - t) / 0.08 : 1,
      transform: [{ translateX: (to.x - from.x) * t }, { translateY: (to.y - from.y) * t - arc }, { scale: 1 - t * 0.55 }],
    };
  });
  if (!live) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: from.x - 28, top: from.y - 48, width: 56, height: 56 }, style]} testID="world-crop-flying">
      <CropThumb crop={crop} size={56} />
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
  packet: { alignItems: "center", justifyContent: "flex-end", backgroundColor: farm.card, borderWidth: 2, borderColor: garden.ink, overflow: "hidden" },
  packetFold: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: farm.seed, borderBottomWidth: 2, borderColor: garden.ink },
  canBody: { position: "absolute", left: 0, top: 0, backgroundColor: farm.can, borderColor: garden.ink },
  canSpout: { position: "absolute", backgroundColor: farm.canDark, borderColor: garden.ink, transform: [{ rotate: "-25deg" }] },
  canHandle: { position: "absolute", borderColor: farm.canDark, borderBottomColor: "transparent" },
  tag: { position: "absolute", width: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 2, borderRadius: 999, backgroundColor: farm.tag },
  tagText: { color: farm.tagText, fontSize: 11, fontWeight: "800" },
  note: { position: "absolute", width: 180, alignItems: "center" },
  noteText: { color: farm.tagText, backgroundColor: farm.tag, fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  card: { position: "absolute", width: CARD_WIDTH, alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: farm.card, borderWidth: 2.5, borderColor: garden.ink, ...popShadow() },
  cardText: { color: garden.ink, fontSize: 14, fontWeight: "700", textAlign: "center" },
});
