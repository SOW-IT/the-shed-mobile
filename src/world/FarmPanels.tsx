import { fonts } from "@/theme";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import Ionicons from "@expo/vector-icons/Ionicons";
import { bagStacks, CROPS, seedList, stackLabel, type CropId } from "@shared/farm";
import { NPC } from "@shared/world";
import { useState, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { GoldCoin } from "@/components/games/GoldCoin";
import { CropThumb, SeedCluster } from "./Farm";
import { blurBehind, Bust, itemStyle, popStyle, scrimStyle, useOverlayClock } from "./Overlays";
import { glass, gold, hud } from "./palette";

type Bag = { seeds: Record<string, number>; crops: Record<string, number> };

const Panel = ({
  open,
  top,
  testID,
  closeLabel,
  onClose,
  head,
  children,
  items = 6,
}: {
  open: boolean;
  top: number;
  testID: string;
  closeLabel: string;
  onClose: () => void;
  head: (style: object | null) => ReactNode;
  children: (overlay: ReturnType<typeof useOverlayClock>) => ReactNode;
  items?: number;
}) => {
  const overlay = useOverlayClock(open, items);
  const { width, height } = useWindowDimensions();
  if (!overlay.mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} testID={`${testID}-close`}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle(overlay)]} />
      </Pressable>
      <Animated.View style={[styles.panel, blurBehind, { top, width: Math.min(420, width - 28), maxHeight: Math.max(300, height - top - 24) }, popStyle(overlay)]} testID={testID}>
        {head(itemStyle(overlay, 0))}
        {children(overlay)}
      </Animated.View>
    </View>
  );
};

const Close = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
    <Ionicons name="close" size={18} color={glass.text} />
  </Pressable>
);

const Count = ({ n }: { n: number }) => (
  <View style={styles.count}>
    <Text style={styles.countText}>×{n}</Text>
  </View>
);

export const BagPanel = ({ open, top, bag, onClose }: { open: boolean; top: number; bag: Bag | null | undefined; onClose: () => void }) => {
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(420, width - 28) - 24 - 16 - 6) / 3);
  const seeds = seedList(bag?.seeds ?? {});
  const crops = bagStacks(bag?.crops ?? {});
  return (
    <Panel
      open={open}
      top={top}
      testID="world-bag"
      closeLabel="Close the bag"
      onClose={onClose}
      head={(style) => (
        <Animated.View style={[styles.header, style]}>
          <View style={styles.icon}>
            <Ionicons name="bag-handle" size={18} color={hud.onAccent} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Bag
          </Text>
          <View style={styles.grow} />
          <Close onPress={onClose} />
        </Animated.View>
      )}
    >
      {(overlay) => (
        <SharpScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Animated.View style={itemStyle(overlay, 1)}>
            <Text style={styles.section} accessibilityRole="header">
              Seeds
            </Text>
          </Animated.View>
          <View style={styles.grid}>
            {seeds.length === 0 ? <Text style={styles.muted}>None</Text> : null}
            {seeds.map(({ crop, count }) => (
              <View key={crop} style={[styles.card, { width: tile }]} accessible accessibilityLabel={`${CROPS[crop].label} seeds, ${count}`} testID={`world-bag-seed-${crop}`}>
                <SeedCluster crop={crop} size={tile - 30} dish />
                <Text style={styles.name} numberOfLines={1}>
                  {CROPS[crop].label}
                </Text>
                <Count n={count} />
              </View>
            ))}
          </View>
          <Animated.View style={itemStyle(overlay, 2)}>
            <Text style={styles.section} accessibilityRole="header">
              Crops
            </Text>
          </Animated.View>
          <View style={styles.grid}>
            {crops.length === 0 ? <Text style={styles.muted}>None</Text> : null}
            {crops.map((stack) => (
              <View key={stack.key} style={[styles.card, { width: tile }]} accessible accessibilityLabel={`${stackLabel(stack.crop, stack.wilts)}, ${stack.count}`} testID={`world-bag-crop-${stack.key}`}>
                <View style={stack.wilts > 0 && styles.wilted}>
                  <CropThumb crop={stack.crop} size={tile - 24} />
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {CROPS[stack.crop].label}
                </Text>
                {stack.wilts > 0 ? <Wilts n={stack.wilts} /> : null}
                <Count n={stack.count} />
              </View>
            ))}
          </View>
        </SharpScrollView>
      )}
    </Panel>
  );
};

const Wilts = ({ n }: { n: number }) => (
  <View style={styles.wiltChip}>
    <Text style={styles.wiltText}>{n === 1 ? "wilted once" : "wilted twice"}</Text>
  </View>
);

export const PlantPicker = ({
  plot,
  top,
  bag,
  onPick,
  onClose,
}: {
  plot: number | null;
  top: number;
  bag: Bag | null | undefined;
  onPick: (plot: number, crop: CropId) => void;
  onClose: () => void;
}) => {
  const [shown, setShown] = useState(plot);
  if (plot !== null && plot !== shown) setShown(plot);
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(420, width - 28) - 24 - 16 - 6) / 3);
  const seeds = seedList(bag?.seeds ?? {});
  return (
    <Panel
      open={plot !== null}
      top={top}
      testID="world-plant-picker"
      closeLabel="Close"
      onClose={onClose}
      head={(style) => (
        <Animated.View style={[styles.header, style]}>
          <View style={styles.icon}>
            <Ionicons name="leaf" size={18} color={hud.onAccent} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Plant
          </Text>
          <View style={styles.grow} />
          <Close onPress={onClose} />
        </Animated.View>
      )}
    >
      {() => (
        <View style={styles.body}>
          {seeds.length === 0 ? (
            <View style={styles.empty} testID="world-plant-no-seeds">
              <Bust look={NPC.look} size={44} />
              <Text style={styles.emptyText}>Get seeds from {NPC.name.split(" ")[0]}</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {seeds.map(({ crop, count }) => (
                <Pressable
                  key={crop}
                  onPress={() => shown !== null && onPick(shown, crop)}
                  accessibilityRole="button"
                  accessibilityLabel={`Plant ${CROPS[crop].label}, ${CROPS[crop].days} days, ${count} left`}
                  testID={`world-plant-${crop}`}
                  style={({ pressed }) => [styles.card, { width: tile }, pressed && styles.pressed]}
                >
                  <SeedCluster crop={crop} size={tile - 30} dish />
                  <Text style={styles.name} numberOfLines={1}>
                    {CROPS[crop].label}
                  </Text>
                  <Days n={CROPS[crop].days} />
                  <Count n={count} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </Panel>
  );
};

export const Days = ({ n }: { n: number }) => (
  <View style={styles.days}>
    <Ionicons name="time-outline" size={11} color={glass.text} />
    <Text style={styles.daysText}>{n}d</Text>
  </View>
);

export const PlotOffer = ({
  open,
  top,
  plot,
  price,
  balance,
  onBuy,
  onClose,
}: {
  open: boolean;
  top: number;
  plot: number;
  price: number | null;
  balance: number;
  onBuy: () => Promise<string | null>;
  onClose: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setError(null);
  }
  const short = price !== null && balance < price;
  const buy = async () => {
    setBusy(true);
    setError(null);
    const problem = await onBuy();
    setBusy(false);
    if (problem) setError(problem);
  };
  return (
    <Panel
      open={open}
      top={top}
      testID="world-plot-offer"
      closeLabel="Close the offer"
      onClose={onClose}
      items={3}
      head={(style) => (
        <Animated.View style={[styles.header, style]}>
          <Bust look={NPC.look} size={40} />
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {NPC.name}
          </Text>
          <View style={styles.grow} />
          <View style={styles.balance} accessibilityLabel={`${balance} coins`}>
            <GoldCoin size={18} />
            <Text style={styles.balanceText}>{balance}</Text>
          </View>
          <Close onPress={onClose} />
        </Animated.View>
      )}
    >
      {(overlay) => (
        <Animated.View style={[styles.offer, itemStyle(overlay, 1)]}>
          {price === null ? (
            <Text style={styles.offerTitle}>Every plot is yours</Text>
          ) : (
            <>
              <View style={styles.plotPicture}>
                <View style={styles.plotSoil} />
                <Text style={styles.plotNumber}>{plot + 1}</Text>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                onPress={() => void buy()}
                disabled={busy || short}
                accessibilityRole="button"
                accessibilityLabel={`Buy plot ${plot + 1} for ${price} coins`}
                testID="world-plot-buy"
                style={({ pressed }) => [styles.buy, (busy || short) && styles.buyOff, pressed && styles.pressed]}
              >
                <GoldCoin size={18} />
                <Text style={styles.buyText}>{short ? `${price}` : `Buy · ${price}`}</Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      )}
    </Panel>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: glass.scrim },
  panel: { position: "absolute", alignSelf: "center", borderRadius: 24, backgroundColor: glass.panel, borderWidth: 1.5, borderColor: glass.edge, paddingTop: 12, overflow: "hidden", transformOrigin: "top" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
  title: { fontFamily: fonts.display, fontSize: 19, color: glass.text, flexShrink: 1 },
  grow: { flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  pressed: { opacity: 0.7 },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: 12, paddingBottom: 14, gap: 8 },
  section: { color: glass.muted, fontWeight: "800", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 16, backgroundColor: glass.row },
  name: { color: glass.text, fontWeight: "700", fontSize: 12.5 },
  muted: { color: glass.muted, fontSize: 13, fontWeight: "600" },
  count: { position: "absolute", top: 4, right: 4, minWidth: 24, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: hud.accent, alignItems: "center", justifyContent: "center" },
  countText: { color: hud.onAccent, fontSize: 11, fontWeight: "800" },
  wilted: { opacity: 0.75 },
  wiltChip: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: glass.here },
  wiltText: { color: glass.text, fontSize: 10.5, fontWeight: "700" },
  days: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, borderRadius: 999, backgroundColor: glass.rowPressed },
  daysText: { color: glass.text, fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 14 },
  emptyText: { color: glass.text, fontFamily: fonts.display, fontSize: 16 },
  balance: { flexDirection: "row", alignItems: "center", gap: 4, height: 28, paddingHorizontal: 8, borderRadius: 14, backgroundColor: glass.row },
  balanceText: { color: gold.light, fontFamily: fonts.display, fontSize: 14 },
  offer: { alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 16 },
  plotPicture: { width: 96, height: 64, borderRadius: 12, backgroundColor: hud.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: hud.forest },
  plotSoil: { position: "absolute", left: 10, right: 10, top: 10, bottom: 10, borderRadius: 6, borderWidth: 3, borderColor: hud.accent, borderStyle: "dashed" },
  plotNumber: { color: hud.forest, fontFamily: fonts.display, fontSize: 22 },
  offerTitle: { color: glass.text, fontFamily: fonts.display, fontSize: 18 },
  error: { color: glass.error, fontSize: 12.5, textAlign: "center" },
  buy: { flexDirection: "row", alignItems: "center", gap: 6, height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: hud.accent },
  buyOff: { opacity: 0.45 },
  buyText: { color: hud.onAccent, fontWeight: "800", fontSize: 15 },
});
