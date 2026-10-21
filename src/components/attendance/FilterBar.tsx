import Ionicons from "@expo/vector-icons/Ionicons";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, typography, useAppTheme } from "@/theme";

export function FilterBar({
  count,
  open,
  onToggle,
  onClear,
  children,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  children: ReactNode;
}) {
  const t = useAppTheme();
  return (
    <>
      <View style={styles.filterSummary}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `Filters, ${count} on` : "Filters"}
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.filterButton,
            { backgroundColor: t.ghost },
            pressed && { opacity: 0.72 },
          ]}
        >
          <Ionicons name="filter-outline" size={16} color={t.ghostText} />
          <Text style={[styles.filterButtonText, { color: t.ghostText }]}>
            Filters
          </Text>
          {count > 0 ? (
            <View style={[styles.filterBadge, { backgroundColor: t.primary }]}>
              <Text style={[styles.filterBadgeText, { color: t.background }]}>
                {count}
              </Text>
            </View>
          ) : null}
        </Pressable>
        {count > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={onClear}
            style={({ pressed }) => [styles.clearFilters, pressed && { opacity: 0.65 }]}
          >
            <Text style={[typography.caption, styles.clearFiltersText, { color: t.primary }]}>
              Clear all
            </Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View
          style={[
            styles.filterPanel,
            { backgroundColor: t.card, borderColor: t.separator },
          ]}
        >
          {children}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  filterSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 36,
  },
  filterButtonText: { fontSize: 13, fontWeight: "700" },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: { fontSize: 11, fontWeight: "800" },
  clearFilters: {
    marginLeft: "auto",
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  clearFiltersText: { fontWeight: "600" },
  filterPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
});
