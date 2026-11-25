import { Btn, Card, Muted } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { farmNudge, growth, nudgeText, PLOT_COUNT, plantCard, plotPrice } from "@shared/farm";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GoldCoin } from "@/components/games/GoldCoin";

type Plant = { plot: number; crop: string; plantedAt: number; waterings: readonly { at: number; by: string | null }[] };
type FarmView = { ownerName: string; mine: boolean; plots: number; plants: readonly Plant[] };

const Action = ({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) => {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
      hitSlop={6}
      style={({ pressed }) => [styles.action, { backgroundColor: t.primarySoft }, pressed && styles.pressed]}
    >
      <Text style={[typography.label, { color: t.dark ? t.text : t.primary }]}>{label}</Text>
    </Pressable>
  );
};

export const FarmList = ({
  view,
  inBackyard,
  now,
  nameOf,
  onWater,
  onHarvest,
  onClear,
  onPlant,
  onBuyPlot,
  onGo,
}: {
  view: FarmView | null | undefined;
  inBackyard: boolean;
  now: number;
  nameOf: (name: string) => string;
  onWater: (plot: number) => void;
  onHarvest: (plot: number) => void;
  onClear: (plot: number) => void;
  onPlant: (plot: number) => void;
  onBuyPlot: () => void;
  onGo: () => void;
}) => {
  const t = useAppTheme();
  if (!view) return null;
  const nudge = farmNudge(view.plants, 0, now);
  const nextPrice = view.mine && view.plots < PLOT_COUNT ? plotPrice(view.plots) : null;
  const buy = nextPrice === null ? null : (
    <Pressable
      onPress={onBuyPlot}
      accessibilityRole="button"
      accessibilityLabel={`Buy plot ${view.plots + 1} for ${nextPrice} coins`}
      testID="world-list-farm-buy"
      style={({ pressed }) => [styles.action, styles.buy, { backgroundColor: t.primarySoft }, pressed && styles.pressed]}
    >
      <Text style={[typography.label, { color: t.dark ? t.text : t.primary }]}>Plot {view.plots + 1}</Text>
      <GoldCoin size={14} />
      <Text style={[typography.label, { color: t.dark ? t.text : t.primary }]}>{nextPrice}</Text>
    </Pressable>
  );
  if (!inBackyard) {
    return (
      <Card style={styles.card}>
        <Text style={[typography.headline, { color: t.text }]} accessibilityRole="header">
          Farm
        </Text>
        <Muted>{nudgeText(nudge) || `${view.plants.length} of ${view.plots} plots planted`}</Muted>
        <View style={styles.row}>
          <Btn title="Your backyard" icon="leaf-outline" variant="tonal" onPress={onGo} />
          {buy}
        </View>
      </Card>
    );
  }
  return (
    <Card style={styles.card}>
      <Text style={[typography.headline, { color: t.text }]} accessibilityRole="header" testID="world-list-farm">
        Farm
      </Text>
      {Array.from({ length: view.plots }, (_, plot) => {
        const plant = view.plants.find((p) => p.plot === plot);
        const g = plant ? growth(plant, now) : null;
        const watered = g?.wateredAt !== null && g?.wateredAt !== undefined ? plant?.waterings.find((w) => w.at === g.wateredAt)?.by : null;
        const status = plant ? plantCard(plant, now) : "Empty";
        const extra = g?.thirsty ? "needs water" : watered ? `watered by ${nameOf(watered)}` : null;
        return (
          <View key={plot} style={[styles.plot, { borderColor: t.border }]} testID={`world-list-plot-${plot}`}>
            <View style={styles.plotText}>
              <Text style={[typography.body, { color: t.text }]}>
                {plot + 1}. {status}
              </Text>
              {extra ? <Text style={[typography.caption, { color: g?.thirsty ? t.warning : t.muted }]}>{extra}</Text> : null}
            </View>
            {g?.thirsty ? <Action label="Water" onPress={() => onWater(plot)} testID={`world-list-water-${plot}`} /> : null}
            {view.mine && g?.stage === "ripe" ? <Action label="Harvest" onPress={() => onHarvest(plot)} testID={`world-list-harvest-${plot}`} /> : null}
            {view.mine && g?.stage === "dead" ? <Action label="Clear" onPress={() => onClear(plot)} testID={`world-list-clear-${plot}`} /> : null}
            {view.mine && !plant ? <Action label="Plant" onPress={() => onPlant(plot)} testID={`world-list-plant-${plot}`} /> : null}
          </View>
        );
      })}
      {buy}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  plot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  plotText: { flex: 1, gap: 2 },
  action: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full },
  buy: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6 },
  pressed: { opacity: 0.7 },
});
