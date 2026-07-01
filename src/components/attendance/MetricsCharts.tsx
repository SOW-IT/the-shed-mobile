/**
 * Presentational pieces for the Attendance → Insights dashboard: summary metric
 * cards, lightweight native charts (no charting dependency — bars are Views),
 * and follow-up person rows. All theme-aware and responsive; the parent
 * (MetricsTab) decides column counts from the window width.
 */
import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type {
  FollowUpPerson,
  FollowUpReasonCode,
  SplitPoint,
  TrendPoint,
} from "../../../shared/attendanceMetrics";
import { Avatar, Card } from "@/components/ui";
import { radius, spacing, typography, useAppTheme, type AppTheme } from "@/theme";

const BAR_MIN = 3;
const CHART_HEIGHT = 120;

/** One headline number with an optional delta and hint. */
export function MetricCard({
  label,
  value,
  delta,
  hint,
  tone = "default",
  width,
  onPress,
}: {
  label: string;
  value: string;
  delta?: { text: string; direction: "up" | "down" | "flat" } | null;
  hint?: string;
  tone?: "default" | "positive" | "attention";
  width: number;
  /** When set, the card is tappable and shows an info glyph (opens a detail). */
  onPress?: () => void;
}) {
  const t = useAppTheme();
  const accent =
    tone === "positive" ? t.success : tone === "attention" ? t.warning : t.text;
  const deltaColour = !delta
    ? t.muted
    : delta.direction === "up"
      ? t.success
      : delta.direction === "down"
        ? t.danger
        : t.muted;
  const body = (
    <>
      <View style={styles.metricLabelRow}>
        <Text style={[typography.label, { color: t.muted, flex: 1 }]} numberOfLines={1}>
          {label}
        </Text>
        {onPress ? (
          <Ionicons name="information-circle-outline" size={15} color={t.faint} />
        ) : null}
      </View>
      <Text style={[typography.amount, { color: accent }]} numberOfLines={1}>
        {value}
      </Text>
      <View style={styles.metricFooter}>
        {delta ? (
          <View style={styles.deltaRow}>
            <Ionicons
              name={
                delta.direction === "up"
                  ? "arrow-up"
                  : delta.direction === "down"
                    ? "arrow-down"
                    : "remove"
              }
              size={13}
              color={deltaColour}
            />
            <Text style={[typography.caption, { color: deltaColour, fontWeight: "700" }]}>
              {delta.text}
            </Text>
          </View>
        ) : null}
        {hint ? (
          <Text style={[typography.caption, { color: t.faint }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}. Tap for details`}
        onPress={onPress}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <Card style={[styles.metricCard, { width }]}>{body}</Card>
      </Pressable>
    );
  }
  return <Card style={[styles.metricCard, { width }]}>{body}</Card>;
}

/** Titled container for a chart, with an optional legend row. */
export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  width,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  children: ReactNode;
  width: number;
}) {
  const t = useAppTheme();
  return (
    <Card style={[styles.chartCard, { width }]}>
      <View style={styles.chartHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.headline, { color: t.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[typography.caption, { color: t.muted }]}>{subtitle}</Text>
          ) : null}
        </View>
        {legend}
      </View>
      {children}
    </Card>
  );
}

const barWidthFor = (count: number): number => (count > 12 ? 22 : count > 8 ? 30 : 40);

/** Vertical bars, horizontally scrollable when they overflow. */
export function BarChart({
  points,
  colour,
}: {
  points: TrendPoint[];
  colour?: string;
}) {
  const t = useAppTheme();
  const bar = colour ?? t.primary;
  if (points.length === 0) return <EmptyChart />;
  const max = Math.max(1, ...points.map((p) => p.value));
  const barWidth = barWidthFor(points.length);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.barRow}
    >
      {points.map((p, i) => (
        <View key={`${p.at}-${i}`} style={[styles.barSlot, { width: barWidth }]}>
          <Text style={[styles.barValue, { color: t.muted }]}>{p.value}</Text>
          <View
            style={{
              width: barWidth - 12,
              height: Math.max(BAR_MIN, (p.value / max) * CHART_HEIGHT),
              backgroundColor: bar,
              borderRadius: radius.sm,
            }}
          />
          <Text style={[styles.barLabel, { color: t.faint }]} numberOfLines={1}>
            {p.label}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** Stacked returning (bottom) + new (top) attendees per point. */
export function StackedBarChart({ points }: { points: SplitPoint[] }) {
  const t = useAppTheme();
  if (points.length === 0) return <EmptyChart />;
  const max = Math.max(1, ...points.map((p) => p.fresh + p.returning));
  const barWidth = barWidthFor(points.length);
  const scale = (n: number) => (n / max) * CHART_HEIGHT;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.barRow}
    >
      {points.map((p, i) => (
        <View key={`${p.at}-${i}`} style={[styles.barSlot, { width: barWidth }]}>
          <Text style={[styles.barValue, { color: t.muted }]}>
            {p.fresh + p.returning}
          </Text>
          <View style={{ width: barWidth - 12 }}>
            {p.fresh > 0 ? (
              <View
                style={{
                  height: Math.max(BAR_MIN, scale(p.fresh)),
                  backgroundColor: t.accent,
                  borderTopLeftRadius: radius.sm,
                  borderTopRightRadius: radius.sm,
                }}
              />
            ) : null}
            {p.returning > 0 ? (
              <View
                style={{
                  height: Math.max(BAR_MIN, scale(p.returning)),
                  backgroundColor: t.primary,
                  borderBottomLeftRadius: radius.sm,
                  borderBottomRightRadius: radius.sm,
                }}
              />
            ) : null}
          </View>
          <Text style={[styles.barLabel, { color: t.faint }]} numberOfLines={1}>
            {p.label}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** Small coloured dot + label, for chart legends. */
export function LegendDot({ colour, label }: { colour: string; label: string }) {
  const t = useAppTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: colour }]} />
      <Text style={[typography.caption, { color: t.muted }]}>{label}</Text>
    </View>
  );
}

/** Horizontal ranked bars for a metadata breakdown (Campus, Role, …). */
export function BreakdownBars({
  rows,
}: {
  rows: { label: string; value: number }[];
}) {
  const t = useAppTheme();
  if (rows.length === 0) return <EmptyChart />;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.slice(0, 8).map((r) => (
        <View key={r.label} style={styles.breakdownRow}>
          <Text
            style={[typography.caption, styles.breakdownLabel, { color: t.text }]}
            numberOfLines={1}
          >
            {r.label}
          </Text>
          <View style={[styles.breakdownTrack, { backgroundColor: t.separator }]}>
            <View
              style={{
                width: `${(r.value / max) * 100}%`,
                height: "100%",
                backgroundColor: t.primary,
                borderRadius: radius.full,
              }}
            />
          </View>
          <Text style={[typography.caption, { color: t.muted, width: 28, textAlign: "right" }]}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const REASON_TONE: Record<FollowUpReasonCode, keyof AppTheme> = {
  at_risk: "warning",
  lapsed: "danger",
  declining: "warning",
  newcomer_no_return: "primary",
  reengaged: "success",
};

/** One follow-up person, with gentle reason copy and a quick action. */
export function FollowUpRow({
  person,
  onOpen,
}: {
  person: FollowUpPerson;
  onOpen?: (person: FollowUpPerson) => void;
}) {
  const t = useAppTheme();
  const tone = t[REASON_TONE[person.reasonCode]] as string;
  const last = person.lastAttended
    ? new Date(person.lastAttended).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : "—";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${person.name}`}
      onPress={() => onOpen?.(person)}
      style={({ pressed }) => [
        styles.followRow,
        { borderTopColor: t.separator },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Avatar photo={person.photo ?? null} name={person.name} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.headline, { color: t.text }]} numberOfLines={1}>
          {person.name}
        </Text>
        {person.subtitle ? (
          <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
            {person.kind === "staff" ? person.subtitle : "Member"}
            {" · "}Last seen {last}
          </Text>
        ) : (
          <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
            {person.kind === "staff" ? "Staff" : "Member"} · Last seen {last}
          </Text>
        )}
        <View style={[styles.reasonPill, { backgroundColor: withAlpha(tone, 0.14) }]}>
          <Text style={[styles.reasonText, { color: tone }]} numberOfLines={2}>
            {person.reason}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.faint} />
    </Pressable>
  );
}

function EmptyChart() {
  const t = useAppTheme();
  return (
    <View style={[styles.emptyChart, { height: CHART_HEIGHT }]}>
      <Text style={[typography.caption, { color: t.faint }]}>No data in this range</Text>
    </View>
  );
}

/** Soft translucent fill from a hex or rgb colour, for reason pills. */
function withAlpha(colour: string, alpha: number): string {
  if (colour.startsWith("#") && colour.length === 7) {
    const n = parseInt(colour.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return colour;
}

const styles = StyleSheet.create({
  metricCard: {
    padding: spacing.md,
    gap: 4,
    justifyContent: "space-between",
  },
  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metricFooter: {
    gap: 2,
    marginTop: 2,
  },
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  chartCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  barRow: {
    alignItems: "flex-end",
    gap: 6,
    paddingTop: spacing.sm,
    minHeight: CHART_HEIGHT + 40,
  },
  barSlot: {
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  barValue: { fontSize: 11, fontWeight: "700" },
  barLabel: { fontSize: 10, letterSpacing: -0.2, maxWidth: 44 },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  breakdownLabel: { width: 96 },
  breakdownTrack: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  followRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reasonPill: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  reasonText: { fontSize: 12, fontWeight: "700", letterSpacing: -0.1 },
  emptyChart: {
    alignItems: "center",
    justifyContent: "center",
  },
});
