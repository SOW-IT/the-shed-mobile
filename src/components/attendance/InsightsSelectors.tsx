/**
 * Bottom-right floating selectors for the Insights screens, rendered through
 * PagerScreen's `floating` slot so they stay pinned above the bottom tab bar:
 *  - {@link AttendanceRangeFab}: the time range + collaborative-events toggle for
 *    the per-campus Attendance dashboard (lifted out of its top filter bar).
 *  - {@link GeneralScopeFab}: "All years" vs a specific staff year for the
 *    General staff-trend dashboard (a year switches it to a vs-last-year view).
 */
import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RANGE_WEEKS } from "../../../shared/attendanceMetrics";
import { Btn, Sheet } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const rangeLabel = (weeks: number) => (weeks === 1 ? "1 wk" : `${weeks} wks`);

/** The floating pill button + its selector sheet. `children` gets a `close`. */
function SelectorFab({
  label,
  icon = "options-outline",
  sheetTitle,
  children,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  sheetTitle: string;
  children: (close: () => void) => ReactNode;
}) {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${sheetTitle}: ${label}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          t.shadowCard,
          { backgroundColor: t.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name={icon} size={16} color={t.onPrimary} />
        <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>
          {label}
        </Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={sheetTitle}>
        {children(() => setOpen(false))}
      </Sheet>
    </>
  );
}

/** A tappable option row with a trailing check when selected. */
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
  rangeWeeks,
  onRangeChange,
  includeCollaborative,
  onCollaborativeChange,
}: {
  rangeWeeks: number;
  onRangeChange: (weeks: number) => void;
  includeCollaborative: boolean;
  onCollaborativeChange: (value: boolean) => void;
}) {
  const t = useAppTheme();
  return (
    <SelectorFab icon="calendar-outline" label={rangeLabel(rangeWeeks)} sheetTitle="Time range">
      {(close) => (
        <View style={{ gap: spacing.sm }}>
          {RANGE_WEEKS.map((weeks) => (
            <OptionRow
              key={weeks}
              label={rangeLabel(weeks)}
              selected={weeks === rangeWeeks}
              onPress={() => onRangeChange(weeks)}
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

export function GeneralScopeFab({
  years,
  value,
  onChange,
}: {
  years: number[];
  /** null = All years (trend view); a year = that year vs the previous one. */
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const label = value === null ? "All years" : String(value);
  return (
    <SelectorFab icon="stats-chart-outline" label={label} sheetTitle="Compare">
      {(close) => (
        <View style={{ gap: spacing.sm }}>
          <OptionRow
            label="All years"
            selected={value === null}
            onPress={() => {
              onChange(null);
              close();
            }}
          />
          {[...years].reverse().map((year) => {
            // Compare against the previous year *on record*, which may not be
            // year − 1 if a staff year is missing.
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
    // Matches the org chart's FloatingYearPicker so the two screens' selectors
    // sit in the same spot (styles.floatingYearPicker: right lg, bottom md).
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.full,
    zIndex: 20,
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
