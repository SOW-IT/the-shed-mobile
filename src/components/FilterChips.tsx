import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { visibleColour } from "@/lib/visibleColour";
import { useWideLayout } from "./nav/layout";
import { Btn, hapticSelect } from "./ui";

const PEOPLE = ["person", "people"] as const;
export const EVENTS = ["event", "events"] as const;

const counted = (count: number, [one, many]: readonly [string, string]) =>
  `${count} ${count === 1 ? one : many}`;

export function FilterChip({
  on,
  label,
  count,
  counting = PEOPLE,
  colour,
  lockedNote,
  onPress,
}: {
  on: boolean;
  label: string;
  count: number;
  counting?: readonly [string, string];
  colour?: string;
  lockedNote?: string;
  onPress: () => void;
}) {
  const t = useAppTheme();
  const dot = colour ? visibleColour(colour, t) : undefined;
  return (
    <Pressable
      role="checkbox"
      aria-checked={on}
      accessibilityLabel={[label, counted(count, counting), lockedNote].filter(Boolean).join(", ")}
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
        <Ionicons name="checkmark-circle" size={18} color={dot ?? (t.dark ? t.text : t.primary)} />
      ) : dot ? (
        <View style={[styles.dot, { backgroundColor: dot }]} />
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

export function FilterSummary({
  children,
  onShowEveryone,
}: {
  children: ReactNode;
  onShowEveryone?: () => void;
}) {
  const t = useAppTheme();
  return (
    <View style={[styles.summary, { borderTopColor: t.separator }]}>
      {children}
      {onShowEveryone ? (
        <Pressable
          accessibilityRole="button"
          onPress={onShowEveryone}
          hitSlop={8}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>Show everyone</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function NoMatches({ message, onShowEveryone }: { message: string; onShowEveryone?: () => void }) {
  const t = useAppTheme();
  return (
    <View style={styles.nothing}>
      <Text style={[typography.caption, { color: t.muted, textAlign: "center" }]}>{message}</Text>
      {onShowEveryone ? <Btn title="Show everyone" variant="ghost" onPress={onShowEveryone} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nothing: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
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
