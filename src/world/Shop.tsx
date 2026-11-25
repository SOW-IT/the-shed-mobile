import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FURNITURE, FURNITURE_IDS, MAX_OWNED_EACH, WALLPAPER_IDS, WALLPAPERS, type FurnitureId, type WallpaperId } from "@shared/home";
import { NPC } from "@shared/world";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { GoldCoin } from "@/components/games/GoldCoin";
import { blurBehind, Bust, itemStyle, popStyle, scrimStyle, useOverlayClock } from "./Overlays";
import { glass, gold, hud } from "./palette";
import { FurnitureThumb, WallpaperSwatch } from "./Thumb";
import { bagStacks, CROP_IDS, CROPS, MAX_SEED_BUY, sellAllTotal, stackLabel, type CropId } from "@shared/farm";
import { CropThumb, SeedCluster } from "./Farm";
import { Days } from "./FarmPanels";

type Tab = "furniture" | "wallpaper" | "seeds" | "sell";
type Wallet = { balance: number; items: Record<string, number>; wallpapers: string[] };
type FarmShop = {
  crops: Record<string, number>;
  seeds: Record<string, number>;
  buySeeds: (crop: string, count: number) => Promise<string | null>;
  sell: (stack?: string) => Promise<{ coins: number } | string>;
};

const TABS: readonly { id: Tab; icon: string; label: string }[] = [
  { id: "furniture", icon: "🛋️", label: "Furniture" },
  { id: "wallpaper", icon: "🖼️", label: "Wallpaper" },
  { id: "seeds", icon: "🌱", label: "Seeds" },
  { id: "sell", icon: "🧺", label: "Sell" },
];

const Price = ({ amount }: { amount: number }) => (
  <View style={styles.price}>
    <GoldCoin size={14} />
    <Text style={styles.priceText}>{amount}</Text>
  </View>
);

export const ShopPanel = ({
  open,
  top,
  bottom,
  wallet,
  onClose,
  onBought,
  farm,
}: {
  open: boolean;
  top: number;
  bottom: number;
  wallet: Wallet | null | undefined;
  onClose: () => void;
  onBought: (text: string) => void;
  farm: FarmShop;
}) => {
  const overlay = useOverlayClock(open);
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("furniture");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [many, setMany] = useState(1);
  const buy = useMutation(api.worldHome.buy);
  if (!overlay.mounted) return null;
  const panelWidth = Math.min(440, width - 28);
  const tile = Math.floor((panelWidth - 24 - 16 - 6) / 3);
  const balance = wallet?.balance ?? 0;
  const ids: readonly string[] = tab === "furniture" ? FURNITURE_IDS : tab === "wallpaper" ? WALLPAPER_IDS.filter((id) => WALLPAPERS[id].price > 0) : tab === "seeds" ? CROP_IDS : bagStacks(farm.crops).map((stack) => stack.key);
  const priceOf = (id: string) => (tab === "furniture" ? FURNITURE[id as FurnitureId].price : WALLPAPERS[id as WallpaperId].price);
  const labelOf = (id: string) => (tab === "furniture" ? FURNITURE[id as FurnitureId].label : WALLPAPERS[id as WallpaperId].label);
  const owned = (id: string) => (tab === "furniture" ? (wallet?.items[id] ?? 0) : wallet?.wallpapers.includes(id) ? 1 : 0);
  const soldOut = (id: string) => (tab === "furniture" ? owned(id) >= MAX_OWNED_EACH : owned(id) > 0);
  const choice = picked && ids.includes(picked) ? picked : null;
  const stacks = bagStacks(farm.crops);
  const pickedStack = stacks.find((stack) => stack.key === picked);
  const pickedValue = pickedStack ? pickedStack.count * pickedStack.price : 0;
  const seedCost = (id: string) => CROPS[id as CropId].seed * many;
  const sendSeeds = async (id: string) => {
    setBusy(true);
    setError(null);
    const problem = await farm.buySeeds(id, many);
    setBusy(false);
    if (problem) setError(problem);
    else onBought(`${many} ${CROPS[id as CropId].label} seed${many === 1 ? "" : "s"} bought.`);
  };
  const sendSell = async (stack?: string) => {
    setBusy(true);
    setError(null);
    const reply = await farm.sell(stack);
    setBusy(false);
    if (typeof reply === "string") setError(reply);
    else {
      setPicked(null);
      onBought(`Sold for ${reply.coins} coins.`);
    }
  };
  const send = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await buy({ item: id });
      onBought(`${labelOf(id)} bought.`);
      setPicked(null);
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the shop" testID="world-shop-close">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle(overlay)]} />
      </Pressable>
      <Animated.View style={[styles.panel, blurBehind, { top, width: panelWidth, maxHeight: Math.max(300, height - top - bottom) }, popStyle(overlay)]} testID="world-shop">
        <Animated.View style={[styles.header, itemStyle(overlay, 0)]}>
          <Bust look={NPC.look} size={40} />
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {NPC.name}
          </Text>
          <View style={styles.grow} />
          <View style={styles.balance} accessibilityLabel={`${balance} coins`}>
            <GoldCoin size={18} />
            <Text style={styles.balanceText}>{balance}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={glass.text} />
          </Pressable>
        </Animated.View>
        <Animated.View style={[styles.tabs, itemStyle(overlay, 1)]}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                setTab(t.id);
                setPicked(null);
                setError(null);
                setMany(1);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.id }}
              accessibilityLabel={t.label}
              testID={`world-shop-tab-${t.id}`}
              style={[styles.tab, tab === t.id && styles.tabOn]}
            >
              <Text style={styles.tabIcon}>{t.icon}</Text>
              <Text style={styles.tabText} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
        {tab === "seeds" ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
            {CROP_IDS.map((id, i) => (
              <Animated.View key={id} style={itemStyle(overlay, 2 + i)}>
                <Pressable
                  onPress={() => {
                    setError(null);
                    setMany(1);
                    setPicked(choice === id ? null : id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choice === id }}
                  accessibilityLabel={`${CROPS[id].label} seeds, ${CROPS[id].seed} coins, ${CROPS[id].days} days to grow${(farm.seeds[id] ?? 0) > 0 ? `, you have ${farm.seeds[id]}` : ""}`}
                  testID={`world-shop-seed-${id}`}
                  style={({ pressed }) => [styles.card, { width: tile }, choice === id && styles.cardOn, pressed && styles.pressed]}
                >
                  <SeedCluster crop={id} size={tile - 34} dish />
                  <Text style={styles.cardName} numberOfLines={1}>
                    {CROPS[id].label}
                  </Text>
                  <View style={styles.cardRow}>
                    <Price amount={CROPS[id].seed} />
                    <Days n={CROPS[id].days} />
                  </View>
                  {(farm.seeds[id] ?? 0) > 0 ? (
                    <View style={styles.owned}>
                      <Text style={styles.ownedText}>×{farm.seeds[id]}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        ) : tab === "sell" ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {stacks.length === 0 ? (
              <Text style={styles.empty} testID="world-shop-sell-empty">
                Nothing to sell
              </Text>
            ) : null}
            {stacks.map((stack, i) => (
              <Animated.View key={stack.key} style={itemStyle(overlay, 2 + i)}>
                <Pressable
                  onPress={() => {
                    setError(null);
                    setPicked(choice === stack.key ? null : stack.key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choice === stack.key }}
                  accessibilityLabel={`${stackLabel(stack.crop, stack.wilts)}, ${stack.count}, ${stack.price} coins each`}
                  testID={`world-shop-stack-${stack.key}`}
                  style={({ pressed }) => [styles.stack, choice === stack.key && styles.cardOn, pressed && styles.pressed]}
                >
                  <CropThumb crop={stack.crop} size={40} />
                  <Text style={styles.stackName} numberOfLines={1}>
                    {stackLabel(stack.crop, stack.wilts)}
                  </Text>
                  <Text style={styles.stackCount}>×{stack.count}</Text>
                  <Price amount={stack.price} />
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
          {ids.map((id, i) => {
            const have = owned(id);
            const out = soldOut(id);
            return (
              <Animated.View key={id} style={itemStyle(overlay, 2 + i)}>
                <Pressable
                  onPress={() => {
                    setError(null);
                    setPicked(choice === id ? null : id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choice === id, disabled: out }}
                  accessibilityLabel={`${labelOf(id)}, ${priceOf(id)} coins${have > 0 ? `, you have ${tab === "furniture" ? have : "it"}` : ""}`}
                  testID={`world-shop-${id}`}
                  style={({ pressed }) => [styles.card, { width: tile }, choice === id && styles.cardOn, pressed && styles.pressed]}
                >
                  {tab === "furniture" ? <FurnitureThumb item={id as FurnitureId} size={tile - 12} /> : <WallpaperSwatch id={id as WallpaperId} size={tile - 12} />}
                  <Price amount={priceOf(id)} />
                  {have > 0 ? (
                    <View style={styles.owned}>
                      {tab === "furniture" ? <Text style={styles.ownedText}>×{have}</Text> : <Ionicons name="checkmark" size={12} color={hud.onAccent} />}
                    </View>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
        )}
        {tab === "seeds" && choice ? (
          <View style={styles.buyBar}>
            <View style={styles.stepper}>
              <Pressable onPress={() => setMany((n) => Math.max(1, n - 1))} disabled={many <= 1} accessibilityRole="button" accessibilityLabel="One fewer" testID="world-shop-fewer" style={[styles.step, many <= 1 && styles.buyOff]}>
                <Ionicons name="remove" size={16} color={glass.text} />
              </Pressable>
              <Text style={styles.stepCount} testID="world-shop-many">
                {many}
              </Text>
              <Pressable onPress={() => setMany((n) => Math.min(MAX_SEED_BUY, n + 1))} disabled={many >= MAX_SEED_BUY} accessibilityRole="button" accessibilityLabel="One more" testID="world-shop-more" style={[styles.step, many >= MAX_SEED_BUY && styles.buyOff]}>
                <Ionicons name="add" size={16} color={glass.text} />
              </Pressable>
            </View>
            {error ? (
              <Text style={styles.error} numberOfLines={2}>
                {error}
              </Text>
            ) : null}
            <Pressable
              onPress={() => void sendSeeds(choice)}
              disabled={busy || balance < seedCost(choice)}
              accessibilityRole="button"
              accessibilityLabel={`Buy ${many} ${CROPS[choice as CropId].label} seeds for ${seedCost(choice)} coins`}
              testID="world-shop-buy-seeds"
              style={({ pressed }) => [styles.buy, (busy || balance < seedCost(choice)) && styles.buyOff, pressed && styles.pressed]}
            >
              <GoldCoin size={18} />
              <Text style={styles.buyText}>{balance < seedCost(choice) ? `${seedCost(choice)}` : `Buy · ${seedCost(choice)}`}</Text>
            </Pressable>
          </View>
        ) : tab === "sell" ? (
          stacks.length > 0 ? (
            <View style={styles.buyBar}>
              {error ? (
                <Text style={styles.error} numberOfLines={2}>
                  {error}
                </Text>
              ) : null}
              {choice ? (
                <Pressable
                  onPress={() => void sendSell(choice)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Sell this stack"
                  testID="world-shop-sell-one"
                  style={({ pressed }) => [styles.sellOne, busy && styles.buyOff, pressed && styles.pressed]}
                >
                  <Text style={styles.sellOneText}>Sell · {pickedValue}</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => void sendSell()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Sell all for ${sellAllTotal(farm.crops)} coins`}
                testID="world-shop-sell-all"
                style={({ pressed }) => [styles.buy, busy && styles.buyOff, pressed && styles.pressed]}
              >
                <GoldCoin size={18} />
                <Text style={styles.buyText}>Sell all · {sellAllTotal(farm.crops)}</Text>
              </Pressable>
            </View>
          ) : null
        ) : choice ? (
          <View style={styles.buyBar}>
            <Text style={styles.buyName} numberOfLines={1}>
              {labelOf(choice)}
            </Text>
            {error ? (
              <Text style={styles.error} numberOfLines={2}>
                {error}
              </Text>
            ) : null}
            <Pressable
              onPress={() => void send(choice)}
              disabled={busy || soldOut(choice) || balance < priceOf(choice)}
              accessibilityRole="button"
              accessibilityLabel={`Buy ${labelOf(choice)} for ${priceOf(choice)} coins`}
              testID="world-shop-buy"
              style={({ pressed }) => [styles.buy, (busy || soldOut(choice) || balance < priceOf(choice)) && styles.buyOff, pressed && styles.pressed]}
            >
              <GoldCoin size={18} />
              <Text style={styles.buyText}>{soldOut(choice) ? "Owned" : balance < priceOf(choice) ? `${priceOf(choice)}` : `Buy · ${priceOf(choice)}`}</Text>
            </Pressable>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: glass.scrim },
  panel: { position: "absolute", alignSelf: "center", borderRadius: 24, backgroundColor: glass.panel, borderWidth: 1.5, borderColor: glass.edge, paddingTop: 12, overflow: "hidden", transformOrigin: "top" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  title: { fontFamily: fonts.display, fontSize: 19, color: glass.text, flexShrink: 1 },
  grow: { flex: 1 },
  balance: { flexDirection: "row", alignItems: "center", gap: 4, height: 28, paddingHorizontal: 8, borderRadius: 14, backgroundColor: glass.row },
  balanceText: { color: gold.light, fontFamily: fonts.display, fontSize: 14 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  pressed: { opacity: 0.7 },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 1, height: 46, borderRadius: 16, backgroundColor: glass.row },
  tabOn: { backgroundColor: glass.here },
  tabIcon: { fontSize: 16 },
  tabText: { color: glass.text, fontWeight: "700", fontSize: 12 },
  cardName: { color: glass.text, fontWeight: "700", fontSize: 12.5 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  list: { gap: 6, paddingHorizontal: 12, paddingBottom: 12 },
  empty: { color: glass.muted, fontSize: 14, fontWeight: "600", textAlign: "center", paddingVertical: 18 },
  stack: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: glass.row, borderWidth: 2, borderColor: "transparent" },
  stackName: { flex: 1, color: glass.text, fontWeight: "700", fontSize: 14 },
  stackCount: { color: glass.text, fontWeight: "800", fontSize: 14 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: glass.rowPressed },
  stepCount: { minWidth: 22, textAlign: "center", color: glass.text, fontFamily: fonts.display, fontSize: 17 },
  sellOne: { height: 40, paddingHorizontal: 14, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: glass.rowPressed },
  sellOneText: { color: glass.text, fontWeight: "800", fontSize: 14 },
  scroll: { flexGrow: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  card: { alignItems: "center", gap: 4, padding: 6, borderRadius: 16, backgroundColor: glass.row, borderWidth: 2, borderColor: "transparent" },
  cardOn: { borderColor: gold.light },
  price: { flexDirection: "row", alignItems: "center", gap: 3 },
  priceText: { color: gold.light, fontWeight: "800", fontSize: 13 },
  owned: { position: "absolute", top: 4, right: 4, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: hud.accent, alignItems: "center", justifyContent: "center" },
  ownedText: { color: hud.onAccent, fontSize: 11, fontWeight: "800" },
  buyBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: glass.edge },
  buyName: { color: glass.text, fontFamily: fonts.display, fontSize: 16, flexShrink: 1 },
  error: { color: glass.error, fontSize: 12, flex: 1 },
  buy: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: hud.accent },
  buyOff: { opacity: 0.45 },
  buyText: { color: hud.onAccent, fontWeight: "800", fontSize: 15 },
});
