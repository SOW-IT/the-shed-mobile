import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Btn, Sheet } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

export type AttendanceRangeOption = { weeks: number; label: string };

function SelectorFab({
  label,
  icon = "options-outline",
  sheetTitle,
  children,
  onClosed,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  sheetTitle: string;
  children: (close: () => void) => ReactNode;
  onClosed?: () => void;
}) {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClosed?.();
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${sheetTitle}: ${label}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          styles.fabRight,
          t.shadowCard,
          { backgroundColor: t.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name={icon} size={16} color={t.onPrimary} />
        <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>
          {label}
        </Text>
      </Pressable>
      <Sheet visible={open} onClose={close} title={sheetTitle}>
        {children(close)}
      </Sheet>
    </>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        {
          backgroundColor: selected ? t.primarySoft : t.ghost,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[typography.body, { color: t.text, flex: 1 }]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={18} color={t.primary} /> : null}
    </Pressable>
  );
}

export function AttendanceRangeFab({
  options,
  weeks,
  onWeeksChange,
  includeCollaborative,
  onCollaborativeChange,
}: {
  options: AttendanceRangeOption[];
  weeks: number;
  onWeeksChange: (weeks: number) => void;
  includeCollaborative: boolean;
  onCollaborativeChange: (value: boolean) => void;
}) {
  const t = useAppTheme();
  const label = options.find((o) => o.weeks === weeks)?.label ?? "Range";
  return (
    <SelectorFab icon="calendar-outline" label={label} sheetTitle="Time range">
      {(close) => (
        <View style={{ gap: spacing.sm }}>
          {options.map((option) => (
            <OptionRow
              key={option.weeks}
              label={option.label}
              selected={option.weeks === weeks}
              onPress={() => onWeeksChange(option.weeks)}
            />
          ))}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: includeCollaborative }}
            onPress={() => onCollaborativeChange(!includeCollaborative)}
            style={styles.toggleRow}
          >
            <Ionicons
              name={includeCollaborative ? "checkbox" : "square-outline"}
              size={20}
              color={includeCollaborative ? t.primary : t.muted}
            />
            <Text style={[typography.body, { color: t.text }]}>Collaborative events</Text>
          </Pressable>
          <Btn title="Done" onPress={close} />
        </View>
      )}
    </SelectorFab>
  );
}

export function ChartModeFab({
  mode,
  onChange,
}: {
  mode: "bar" | "line";
  onChange: (mode: "bar" | "line") => void;
}) {
  const t = useAppTheme();
  const isLine = mode === "line";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chart style: ${isLine ? "lines" : "bars"}. Switch to ${isLine ? "bars" : "lines"}`}
      onPress={() => onChange(isLine ? "bar" : "line")}
      style={({ pressed }) => [
        styles.fab,
        styles.fabLeft,
        t.shadowCard,
        { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons
        name={isLine ? "analytics-outline" : "bar-chart-outline"}
        size={16}
        color={t.text}
      />
      <Text style={[typography.caption, { color: t.text, fontWeight: "800" }]}>
        {isLine ? "Lines" : "Bars"}
      </Text>
    </Pressable>
  );
}

export type GeneralScope = number | null | "all";

export function GeneralScopeFab({
  years,
  value,
  onChange,
  recentYears,
}: {
  years: number[];
  value: GeneralScope;
  onChange: (value: GeneralScope) => void;
  recentYears: number;
}) {
  const label =
    value === null
      ? `Last ${recentYears}y`
      : value === "all"
        ? "All history"
        : String(value);
  return (
    <SelectorFab icon="stats-chart-outline" label={label} sheetTitle="Compare">
      {(close) => (
        <View style={{ gap: spacing.sm }}>
          <OptionRow
            label={`Last ${recentYears} years`}
            selected={value === null}
            onPress={() => {
              onChange(null);
              close();
            }}
          />
          <OptionRow
            label="All history"
            selected={value === "all"}
            onPress={() => {
              onChange("all");
              close();
            }}
          />
          {[...years].reverse().map((year) => {
            const idx = years.indexOf(year);
            const prev = idx > 0 ? years[idx - 1] : null;
            return (
              <OptionRow
                key={year}
                label={prev !== null ? `${year} vs ${prev}` : String(year)}
                selected={value === year}
                onPress={() => {
                  onChange(year);
                  close();
                }}
              />
            );
          })}
        </View>
      )}
    </SelectorFab>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.full,
    zIndex: 20,
  },
  fabRight: {
    right: spacing.lg,
  },
  fabLeft: {
    left: spacing.lg,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 2,
    marginTop: spacing.xs,
  },
});
