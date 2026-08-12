/**
 * Bottom-right floating selectors for the Insights screens, rendered through
 * PagerScreen's `floating` slot so they stay pinned above the bottom tab bar:
 *  - {@link AttendanceRangeFab}: the time range + collaborative-events toggle for
 *    the per-campus Attendance dashboard (lifted out of its top filter bar).
 *  - {@link GeneralScopeFab}: recent years / all history / a specific staff year
 *    for the General staff-trend dashboard.
 */
import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  RANGE_WEEKS,
  rangeLabel,
  type RangeWeeks,
} from "../../../shared/attendanceMetrics";
import { NativeDateInput } from "@/components/NativeDateTimeField";
import { WebDateInput } from "@/components/WebDateTimeInput";
import { Btn, Sheet } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

/** Attendance Insights range: a preset trailing window or a custom [start, end]. */
export type AttendanceRangeSelection =
  | { kind: "preset"; weeks: RangeWeeks }
  | { kind: "custom"; startMs: number; endMs: number };

const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Local midnight for a YYYY-MM-DD string. */
const fromDateInputStart = (value: string): number | null => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};
/** Local end-of-day for a YYYY-MM-DD string. */
const fromDateInputEnd = (value: string): number | null => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

const formatShort = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });

export const attendanceRangeFabLabel = (range: AttendanceRangeSelection): string => {
  if (range.kind === "preset") return rangeLabel(range.weeks);
  return `${formatShort(range.startMs)} – ${formatShort(range.endMs)}`;
};

/** The floating pill button + its selector sheet. `children` gets a `close`. */
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
  /** Called whenever the sheet closes (Done, backdrop, or Apply). */
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
  range,
  onRangeChange,
  includeCollaborative,
  onCollaborativeChange,
}: {
  range: AttendanceRangeSelection;
  onRangeChange: (range: AttendanceRangeSelection) => void;
  includeCollaborative: boolean;
  onCollaborativeChange: (value: boolean) => void;
}) {
  const t = useAppTheme();
  // Capture "today" once on mount so render stays pure (no Date.now() in render).
  const [today] = useState(() => toDateInput(Date.now()));
  // Draft custom dates while the sheet is open (commit only on Apply).
  const [customStart, setCustomStart] = useState(() =>
    range.kind === "custom"
      ? toDateInput(range.startMs)
      : toDateInput(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );
  const [customEnd, setCustomEnd] = useState(() =>
    range.kind === "custom" ? toDateInput(range.endMs) : toDateInput(Date.now())
  );
  // Local highlight for the Custom row while editing dates — does not commit
  // a range (and so does not kick off liveSnapshot) until Apply.
  const [pickingCustom, setPickingCustom] = useState(false);
  const customSelected = range.kind === "custom" || pickingCustom;
  const draftStartMs = fromDateInputStart(customStart);
  const draftEndMs = fromDateInputEnd(customEnd);
  const customValid =
    draftStartMs !== null &&
    draftEndMs !== null &&
    draftStartMs < draftEndMs;

  const DateField = Platform.OS === "web" ? WebDateInput : NativeDateInput;

  return (
    <SelectorFab
      icon="calendar-outline"
      label={attendanceRangeFabLabel(range)}
      sheetTitle="Time range"
      // Drop draft highlight on dismiss so reopen matches the committed range
      // (customSelected then comes only from range.kind === "custom").
      onClosed={() => setPickingCustom(false)}
    >
      {(close) => (
        <View style={{ gap: spacing.sm }}>
          {RANGE_WEEKS.map((weeks) => (
            <OptionRow
              key={weeks}
              label={rangeLabel(weeks)}
              selected={
                !pickingCustom &&
                range.kind === "preset" &&
                range.weeks === weeks
              }
              onPress={() => {
                setPickingCustom(false);
                onRangeChange({ kind: "preset", weeks });
              }}
            />
          ))}
          <OptionRow
            label="Custom"
            selected={customSelected}
            onPress={() => {
              // Reveal / highlight the date fields only — Apply commits.
              setPickingCustom(true);
            }}
          />
          <View style={styles.customBlock}>
            <Text style={[typography.caption, { color: t.muted }]}>
              Custom range
            </Text>
            <View style={styles.customDates}>
              <DateField
                label="From"
                value={customStart}
                max={customEnd || today}
                onChange={setCustomStart}
              />
              <DateField
                label="To"
                value={customEnd}
                min={customStart}
                max={today}
                onChange={setCustomEnd}
              />
            </View>
            <Btn
              title="Apply custom range"
              variant="tonal"
              disabled={!customValid}
              onPress={() => {
                if (!draftStartMs || !draftEndMs) return;
                onRangeChange({
                  kind: "custom",
                  startMs: draftStartMs,
                  endMs: draftEndMs,
                });
                close(); // onClosed clears pickingCustom; parent range keeps Custom selected
              }}
            />
          </View>
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

/**
 * Bottom-left toggle flipping every chart on the screen between bars and lines
 * (see ChartModeProvider). Sits opposite the scope/range selector so the two
 * don't overlap.
 */
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

/** null = recent years (default operational view); "all" = full history; year = card view. */
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
  /** How many years the "Recent" trend view shows. */
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
    // The horizontal edge is set by fabRight/fabLeft — NOT here — because on
    // web react-native-web compiles styles to additive atomic classes and drops
    // `undefined`, so a later `right: undefined` can't unset a base `right`
    // (the pill then pins to BOTH edges and stretches full width). Keeping the
    // base edge-agnostic avoids that.
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
  // Bottom-right corner (scope/range selectors).
  fabRight: {
    right: spacing.lg,
  },
  // Opposite corner from the scope/range selector (chart-mode toggle).
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
  customBlock: {
    gap: spacing.sm,
    paddingHorizontal: 2,
    paddingTop: spacing.xs,
  },
  customDates: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
