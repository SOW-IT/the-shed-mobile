import Ionicons from "@expo/vector-icons/Ionicons";
import { FURNITURE_IDS, ownedLeft, WALLPAPER_IDS, WALLPAPERS, type FurnitureId, type Placed, type WallpaperId } from "@shared/home";
import { useEffect, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { blurBehind } from "./Overlays";
import { glass, gold, hud } from "./palette";
import { FurnitureThumb, WallpaperSwatch } from "./Thumb";

const NATIVE = Platform.OS !== "web";
const TILE = 64;

export const DecorateTray = ({
  owned,
  wallpapers,
  placed,
  wallpaper,
  onPlace,
  onWallpaper,
  onDone,
}: {
  owned: Record<string, number>;
  wallpapers: readonly string[];
  placed: readonly Placed[];
  wallpaper: string;
  onPlace: (item: FurnitureId) => void;
  onWallpaper: (id: WallpaperId) => void;
  onDone: () => void;
}) => {
  const [tab, setTab] = useState<"furniture" | "wallpaper">("furniture");
  const [rise] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [rise]);
  const items = FURNITURE_IDS.filter((id) => (owned[id] ?? 0) > 0);
  const papers = WALLPAPER_IDS.filter((id) => WALLPAPERS[id].price === 0 || wallpapers.includes(id));
  return (
    <Animated.View
      style={[styles.tray, blurBehind, { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}
      testID="world-decorate"
    >
      <View style={styles.head}>
        {(["furniture", "wallpaper"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            accessibilityLabel={t === "furniture" ? "Furniture" : "Wallpaper"}
            testID={`world-decorate-tab-${t}`}
            style={[styles.tab, tab === t && styles.tabOn]}
          >
            <Text style={styles.tabIcon}>{t === "furniture" ? "🛋️" : "🖼️"}</Text>
          </Pressable>
        ))}
        <View style={styles.grow} />
        <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Done decorating" testID="world-decorate-done" style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
          <Ionicons name="checkmark" size={18} color={hud.onAccent} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {tab === "furniture" && items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>☕</Text>
            <Text style={styles.emptyText}>Sijin sells furniture in the Café.</Text>
          </View>
        ) : null}
        {tab === "furniture"
          ? items.map((id) => {
              const left = ownedLeft(owned, placed, id);
              return (
                <Pressable
                  key={id}
                  onPress={() => onPlace(id)}
                  disabled={left < 1}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: left < 1 }}
                  accessibilityLabel={`Place a ${id}, ${left} left`}
                  testID={`world-place-${id}`}
                  style={({ pressed }) => [styles.tile, left < 1 && styles.used, pressed && styles.pressed]}
                >
                  <FurnitureThumb item={id} size={TILE - 8} />
                  <View style={styles.count}>
                    <Text style={styles.countText}>{left}</Text>
                  </View>
                </Pressable>
              );
            })
          : papers.map((id) => (
              <Pressable
                key={id}
                onPress={() => onWallpaper(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: wallpaper === id }}
                accessibilityLabel={`Wallpaper: ${WALLPAPERS[id].label}`}
                testID={`world-wallpaper-${id}`}
                style={({ pressed }) => [styles.tile, wallpaper === id && styles.tileOn, pressed && styles.pressed]}
              >
                <WallpaperSwatch id={id} size={TILE - 12} />
              </Pressable>
            ))}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  tray: { borderRadius: 22, backgroundColor: glass.panel, borderWidth: 1.5, borderColor: glass.edge, padding: 8, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  tab: { width: 44, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  tabOn: { backgroundColor: glass.here },
  tabIcon: { fontSize: 16 },
  grow: { flex: 1 },
  done: { width: 36, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
  pressed: { opacity: 0.7 },
  row: { gap: 8, paddingRight: 4 },
  tile: { width: TILE, height: TILE, borderRadius: 16, backgroundColor: glass.row, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  tileOn: { borderColor: gold.light },
  used: { opacity: 0.35 },
  count: { position: "absolute", top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: hud.accent, alignItems: "center", justifyContent: "center" },
  countText: { color: hud.onAccent, fontSize: 11, fontWeight: "800" },
  empty: { height: TILE, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6 },
  emptyIcon: { fontSize: 22 },
  emptyText: { color: glass.muted, fontSize: 13 },
});
