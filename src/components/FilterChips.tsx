import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { radius, spacing, useAppTheme } from "../theme";
import { useWideLayout } from "./nav/layout";
import { hapticSelect } from "./ui";

const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;

export function FilterChip({
  on,
  label,
  count,
  colour,
  lockedNote,
  onPress,
}: {
  on: boolean;
  label: string;
  count: number;
  colour?: string;
  lockedNote?: string;
  onPress: () => void;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      role="checkbox"
      aria-checked={on}
      accessibilityLabel={[label, people(count), lockedNote].filter(Boolean).join(", ")}
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        on
          ? { backgroundColor: t.primarySoft, borderColor: t.primarySoft, paddingLeft: 8 }
          : { backgroundColor: t.card, borderColor: t.border, paddingLeft: colour ? 11 : 14 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {on ? (
        <Ionicons name="checkmark-circle" size={18} color={colour ?? (t.dark ? t.text : t.primary)} />
      ) : colour ? (
        <View style={[styles.dot, { backgroundColor: colour }]} />
      ) : null}
      <Text style={[styles.chipText, { color: t.text }]}>{label}</Text>
      {lockedNote ? <Ionicons name="lock-closed" size={11} color={t.muted} /> : null}
      <Text style={[styles.chipCount, { color: t.muted }]}>{count}</Text>
    </Pressable>
  );
}

export function FilterRow({ title, children }: { title: string; children: ReactNode }) {
  const wide = useWideLayout();
  if (wide) {
    return (
      <View accessibilityRole="list" accessibilityLabel={title} style={styles.wrapped}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="list"
      accessibilityLabel={title}
      style={styles.chipScroll}
      contentContainerStyle={styles.chips}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chipScroll: { marginHorizontal: -spacing.lg },
  chips: { flexDirection: "row", gap: spacing.sm - 2, paddingHorizontal: spacing.lg },
  wrapped: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm - 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingRight: 12,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: { fontSize: 13.5, fontWeight: "600", letterSpacing: -0.1 },
  chipCount: { fontSize: 12.5, fontWeight: "600", fontVariant: ["tabular-nums"] },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
