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

type Tab = "furniture" | "wallpaper";
type Wallet = { balance: number; items: Record<string, number>; wallpapers: string[] };

const Price = ({ amount }: { amount: number }) => (
  <View style={styles.price}>
    <GoldCoin size={14} />
    <Text style={styles.priceText}>{amount}</Text>
  </View>
);

export const ShopPanel = ({ open, top, wallet, onClose, onBought }: { open: boolean; top: number; wallet: Wallet | null | undefined; onClose: () => void; onBought: (text: string) => void }) => {
  const { mounted, clock } = useOverlayClock(open);
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("furniture");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buy = useMutation(api.worldHome.buy);
  if (!mounted) return null;
  const panelWidth = Math.min(440, width - 28);
  const tile = Math.floor((panelWidth - 24 - 16 - 6) / 3);
  const balance = wallet?.balance ?? 0;
  const ids: readonly string[] = tab === "furniture" ? FURNITURE_IDS : WALLPAPER_IDS.filter((id) => WALLPAPERS[id].price > 0);
  const priceOf = (id: string) => (tab === "furniture" ? FURNITURE[id as FurnitureId].price : WALLPAPERS[id as WallpaperId].price);
  const labelOf = (id: string) => (tab === "furniture" ? FURNITURE[id as FurnitureId].label : WALLPAPERS[id as WallpaperId].label);
  const owned = (id: string) => (tab === "furniture" ? (wallet?.items[id] ?? 0) : wallet?.wallpapers.includes(id) ? 1 : 0);
  const soldOut = (id: string) => (tab === "furniture" ? owned(id) >= MAX_OWNED_EACH : owned(id) > 0);
  const choice = picked && ids.includes(picked) ? picked : null;
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
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle(clock)]} />
      </Pressable>
      <Animated.View style={[styles.panel, blurBehind, { top, width: panelWidth, maxHeight: Math.max(300, height - top - 24) }, popStyle(clock)]} testID="world-shop">
        <Animated.View style={[styles.header, itemStyle(clock, 0)]}>
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
        <Animated.View style={[styles.tabs, itemStyle(clock, 1)]}>
          {(["furniture", "wallpaper"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                setTab(t);
                setPicked(null);
                setError(null);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              accessibilityLabel={t === "furniture" ? "Furniture" : "Wallpaper"}
              testID={`world-shop-tab-${t}`}
              style={[styles.tab, tab === t && styles.tabOn]}
            >
              <Text style={styles.tabIcon}>{t === "furniture" ? "🛋️" : "🖼️"}</Text>
              <Text style={styles.tabText}>{t === "furniture" ? "Furniture" : "Wallpaper"}</Text>
            </Pressable>
          ))}
        </Animated.View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
          {ids.map((id, i) => {
            const have = owned(id);
            const out = soldOut(id);
            return (
              <Animated.View key={id} style={itemStyle(clock, 2 + i)}>
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
        {choice ? (
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
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 36, borderRadius: 18, backgroundColor: glass.row },
  tabOn: { backgroundColor: glass.here },
  tabIcon: { fontSize: 16 },
  tabText: { color: glass.text, fontWeight: "700", fontSize: 13 },
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
