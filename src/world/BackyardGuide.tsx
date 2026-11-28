import { fonts } from "@/theme";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { AnimalThumb, FeedThumb, GoodThumb } from "./Animals";
import { GUIDE, type GuidePart } from "./backyardTips";
import { CropThumb, PlantView, SeedCluster } from "./Farm";
import { blurBehind, itemStyle, popStyle, useOverlayClock } from "./Overlays";
import { glass, hud } from "./palette";

const ART = 52;

/**
 * The backyard draws a young plant small (40% of a ripe one's size, growing
 * to 90%). Here every stage is drawn about the same height, so a seed or a
 * sprout is big enough to see.
 */
const plantScale = (stage: string, progress: number) => Math.min(ART * 1.4, (ART * 0.9) / (stage === "ripe" ? 1 : 0.4 + 0.5 * Math.min(progress, 1)));

/** A plant drawn the way the backyard draws it, standing in a little square. */
const Plant = ({
  stage,
  progress,
  wilted = false,
  thirsty = false,
  sparkle = false,
  calm = true,
  label,
}: {
  stage: "seed" | "sprout" | "half" | "ripe";
  progress: number;
  wilted?: boolean;
  thirsty?: boolean;
  /** Twinkles like a ripe plant in the backyard (still, in battery saver). */
  sparkle?: boolean;
  calm?: boolean;
  label?: string;
}) => (
  <View style={styles.frame}>
    <View style={styles.plant}>
      <PlantView x={ART / 2} y={ART - 6} scale={plantScale(stage, progress)} crop="tomato" stage={stage} progress={progress} wilted={wilted} thirsty={thirsty} live={sparkle && !calm} sparkle={sparkle} />
    </View>
    {label ? <Text style={styles.caption}>{label}</Text> : null}
  </View>
);

const Arrow = () => <Ionicons name="chevron-forward" size={14} color={glass.muted} />;

const pictureOf = (part: GuidePart, calm: boolean): ReactNode => ({
  plant: (
    <View style={styles.row}>
      <View style={[styles.frame, styles.soil]}>
        <SeedCluster crop="carrot" size={38} />
      </View>
      <Arrow />
      <Plant stage="seed" progress={0.03} label="Planted" />
    </View>
  ),
  water: (
    <View style={styles.row}>
      <Plant stage="sprout" progress={0.4} thirsty label="Thirsty" />
      <View style={styles.can}>
        <Ionicons name="water" size={22} color={hud.onAccent} />
      </View>
      <Plant stage="sprout" progress={0.4} label="Watered" />
      <Plant stage="sprout" progress={0.4} wilted label="Wilted" />
    </View>
  ),
  grow: (
    <View style={styles.row}>
      <Plant stage="seed" progress={0.03} label="Seed" />
      <Arrow />
      <Plant stage="sprout" progress={0.2} label="Sprout" />
      <Arrow />
      <Plant stage="half" progress={0.6} label="Flower" />
      <Arrow />
      <Plant stage="ripe" progress={1} label="Ripe" />
    </View>
  ),
  harvest: (
    <View style={styles.row}>
      <Plant stage="ripe" progress={1} sparkle calm={calm} label="Sparkles" />
      <Arrow />
      <View style={styles.frame}>
        <CropThumb crop="tomato" size={40} />
        <Text style={styles.caption}>Picked</Text>
      </View>
      <Arrow />
      <View style={styles.frame}>
        <Ionicons name="cash-outline" size={26} color={glass.text} />
        <Text style={styles.caption}>Sold</Text>
      </View>
    </View>
  ),
  animals: (
    <View style={styles.row}>
      <View style={styles.frame}>
        <AnimalThumb kind="chicken" stage={2} mood="hungry" size={40} />
        <Text style={styles.caption}>Hungry</Text>
      </View>
      <FeedThumb feed="grain" size={30} />
      <Arrow />
      <GoodThumb good="egg" size={30} />
      <View style={styles.frame}>
        <AnimalThumb kind="cow" stage={2} mood="hungry" size={40} />
        <Text style={styles.caption}>Hungry</Text>
      </View>
      <FeedThumb feed="hay" size={30} />
      <Arrow />
      <GoodThumb good="milk" size={30} />
    </View>
  ),
})[part];

/**
 * How farming works, opened from the (i) at the backyard's bottom right. It
 * stands just above that button and leaves the rest of the screen alone, so
 * the menu, bag and chat still work while it's open.
 */
export const BackyardGuide = ({
  open,
  room,
  onClose,
}: {
  open: boolean;
  /** The height free between the chat lines under the coins and the (i) button. */
  room: number;
  onClose: () => void;
}) => {
  const overlay = useOverlayClock(open, GUIDE.length + 1);
  const { width, height } = useWindowDimensions();
  if (!overlay.mounted) return null;
  return (
    <Animated.View
      style={[styles.card, blurBehind, { width: Math.min(380, width - 28), maxHeight: Math.max(0, Math.min(540, height * 0.5, room)) }, popStyle(overlay)]}
      pointerEvents={open ? "auto" : "none"}
      accessibilityRole="summary"
      testID="world-backyard-guide"
    >
      <Animated.View style={[styles.header, itemStyle(overlay, 0)]}>
        <View style={styles.icon}>
          <Ionicons name="leaf" size={18} color={hud.onAccent} />
        </View>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          How to farm
        </Text>
        <View style={styles.grow} />
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close how to farm" testID="world-backyard-guide-close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Ionicons name="close" size={18} color={glass.text} />
        </Pressable>
      </Animated.View>
      <SharpScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        {GUIDE.map((tip, i) => (
          <Animated.View key={tip.part} style={[styles.tip, itemStyle(overlay, 1 + i)]} testID={`world-backyard-guide-${tip.part}`}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {pictureOf(tip.part, overlay.calm)}
            </View>
            <Text style={styles.tipTitle} accessibilityRole="header">
              {tip.title}
            </Text>
            <Text style={styles.tipText}>{tip.text}</Text>
          </Animated.View>
        ))}
      </SharpScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: { alignSelf: "flex-end", borderRadius: 24, backgroundColor: glass.panel, borderWidth: 1.5, borderColor: glass.edge, paddingTop: 12, overflow: "hidden", transformOrigin: "bottom right" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
  title: { fontFamily: fonts.display, fontSize: 19, color: glass.text, flexShrink: 1 },
  grow: { flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  pressed: { opacity: 0.7 },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: 12, paddingBottom: 14, gap: 8 },
  tip: { gap: 4, padding: 10, borderRadius: 16, backgroundColor: glass.row },
  tipTitle: { fontFamily: fonts.display, fontSize: 15.5, color: glass.text },
  tipText: { color: glass.text, fontSize: 13.5, lineHeight: 19, opacity: 0.9 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, paddingBottom: 2 },
  frame: { width: ART, alignItems: "center", gap: 2 },
  plant: { width: ART, height: ART },
  soil: { height: ART, justifyContent: "center", borderRadius: 12, backgroundColor: glass.rowPressed },
  caption: { color: glass.muted, fontSize: 10.5, fontWeight: "700" },
  can: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
});
