/**
 * Presentational pieces for the Attendance → Insights dashboard: summary metric
 * cards, lightweight native charts (no charting dependency — bars are Views),
 * and follow-up person rows. All theme-aware and responsive; the parent
 * (MetricsTab) decides column counts from the window width.
 */
import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useState } from "react";
import {
  LayoutChangeEvent,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type {
  FollowUpPerson,
  FollowUpReasonCode,
  SplitPoint,
  TrendPoint,
} from "../../../shared/attendanceMetrics";
import { Avatar, Card } from "@/components/ui";
import { radius, spacing, typography, useAppTheme, type AppTheme } from "@/theme";

const BAR_MIN = 3; // minimum visible bar height
const CHART_HEIGHT = 120;
const CHART_HEIGHT_FULL = 220; // taller in fullscreen (fits rotated landscape on typical phones)
const BAR_MAX_W = 40; // widest a single bar gets (a few points)
const BAR_MIN_W = 5; // thinnest bar (many points in a range)
const BAR_MIN_GAP = 6; // minimum space between bars
const BAR_LABEL_H = 15; // fixed x-axis label row height
const BAR_VALUE_H = 18; // fixed space reserved above bars for the value label
const Y_AXIS_W = 32; // width reserved for y-axis labels
// Total fixed container height = chart bars + x-label row + value label row
const chartContainerH = (ch: number) => ch + BAR_LABEL_H + BAR_VALUE_H;

/**
 * Size `count` bars to fit a measured width instead of scrolling.
 */
function useBarFit(count: number, chartHeight = CHART_HEIGHT) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const raw =
    w > 0
      ? (w - BAR_MIN_GAP * Math.max(0, count - 1)) / Math.max(1, count)
      : BAR_MAX_W;
  const barWidth = Math.max(BAR_MIN_W, Math.min(BAR_MAX_W, Math.floor(raw)));
  const showValues = barWidth >= 18;
  const LABEL_MIN_PX = 22;
  const labelStep =
    barWidth >= LABEL_MIN_PX ? 1 : Math.ceil(LABEL_MIN_PX / Math.max(1, barWidth));
  const spread = w > 0 && count * barWidth < w;
  const justify: "center" | "space-between" | "flex-start" =
    count <= 1 ? "center" : spread ? "space-between" : "flex-start";
  return { w, onLayout, barWidth, showValues, labelStep, justify, chartHeight };
}

/** Inner bar width — a small inset when the bar is wide, flush when it's thin. */
const barInner = (barWidth: number): number =>
  Math.max(3, barWidth - (barWidth > 16 ? 10 : 1));

/**
 * Fixed-height x-axis label under a bar.
 */
function BarLabel({ text }: { text: string }) {
  const t = useAppTheme();
  return (
    <View style={styles.barLabelBox}>
      <Text style={[styles.barLabel, { color: t.faint }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Y-axis column with evenly spaced tick labels derived from the data max.
 * Renders 4 ticks: max, 75%, 50%, 25% (top → bottom).
 */
function YAxis({ max, chartHeight }: { max: number; chartHeight: number }) {
  const t = useAppTheme();
  const ticks = [max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25)];
  return (
    <View style={[styles.yAxis, { height: chartHeight }]}>
      {ticks.map((v, i) => (
        <Text key={i} style={[styles.yTick, { color: t.faint }]} numberOfLines={1}>
          {v}
        </Text>
      ))}
    </View>
  );
}

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

/**
 * Fullscreen landscape modal. Since app.json locks orientation to portrait,
 * we render a portrait-sized modal and rotate its content 90° so it reads as
 * landscape — no native orientation API needed.
 */
function FullscreenChartModal({
  visible,
  onClose,
  title,
  subtitle,
  legend,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  const t = useAppTheme();
  const { width: sw, height: sh } = useWindowDimensions();
  // After rotation: the rotated container is sh wide and sw tall (screen dims swap).
  const lw = sh; // landscape width  = screen height
  const lh = sw; // landscape height = screen width
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar hidden />
      {/* Full-screen backdrop */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.background }]} />
      {/* Rotated landscape container, centred on screen */}
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <View
          style={{
            width: lw,
            height: lh,
            transform: [{ rotate: "90deg" }],
            backgroundColor: t.background,
          }}
        >
          {/* Header */}
          <View style={[styles.fullscreenHeader, { paddingTop: spacing.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.headline, { color: t.text }]}>{title}</Text>
              {subtitle ? (
                <Text style={[typography.caption, { color: t.muted }]}>{subtitle}</Text>
              ) : null}
            </View>
            {legend ? (
              <View style={styles.fullscreenLegend}>{legend}</View>
            ) : null}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close fullscreen"
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close" size={22} color={t.text} />
            </Pressable>
          </View>
          {/* Chart body */}
          <View style={styles.fullscreenBody}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

/** Titled container for a chart; tap anywhere to open fullscreen. */
export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  width,
  fullscreenContent,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  children: ReactNode;
  width: number;
  /** Chart rendered inside the fullscreen modal (usually a taller variant). */
  fullscreenContent?: ReactNode;
}) {
  const t = useAppTheme();
  const [full, setFull] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} — tap to expand`}
        onPress={() => setFull(true)}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <Card style={[styles.chartCard, { width }]}>
          <View style={styles.chartHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.headline, { color: t.text }]}>{title}</Text>
              {subtitle ? (
                <Text style={[typography.caption, { color: t.muted }]}>{subtitle}</Text>
              ) : null}
            </View>
            <View style={styles.chartHeaderRight}>
              {legend}
              <Ionicons name="expand-outline" size={16} color={t.faint} />
            </View>
          </View>
          {children}
        </Card>
      </Pressable>
      <FullscreenChartModal
        visible={full}
        onClose={() => setFull(false)}
        title={title}
        subtitle={subtitle}
        legend={legend}
      >
        {fullscreenContent ?? children}
      </FullscreenChartModal>
    </>
  );
}

type TooltipRow = { label: string; value: number; colour?: string };

/**
 * Tooltip shown above a tapped bar in fullscreen mode. Supports a single
 * total value or a breakdown list (one row per segment/stack).
 */
function BarTooltip({ year, rows }: { year: string; rows: TooltipRow[] }) {
  const t = useAppTheme();
  const single = rows.length === 1;
  return (
    <View style={[styles.tooltip, { backgroundColor: t.text }]}>
      <Text style={[styles.tooltipLabel, { color: t.background, opacity: 0.6 }]}>{year}</Text>
      {single ? (
        <Text style={[styles.tooltipValue, { color: t.background }]}>{rows[0].value}</Text>
      ) : (
        rows.map((r) => (
          <View key={r.label} style={styles.tooltipRow}>
            {r.colour ? (
              <View style={[styles.tooltipDot, { backgroundColor: r.colour }]} />
            ) : null}
            <Text style={[styles.tooltipSegLabel, { color: t.background, opacity: 0.75 }]}>
              {r.label}
            </Text>
            <Text style={[styles.tooltipSegValue, { color: t.background }]}>{r.value}</Text>
          </View>
        ))
      )}
    </View>
  );
}

/** Vertical bars sized to fit the card (no horizontal scroll — see useBarFit). */
export function BarChart({
  points,
  colour,
  fullscreen = false,
}: {
  points: TrendPoint[];
  colour?: string;
  fullscreen?: boolean;
}) {
  const t = useAppTheme();
  const bar = colour ?? t.primary;
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const fit = useBarFit(points.length, chartHeight);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  if (points.length === 0) return <EmptyChart />;
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <View style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}>
      <YAxis max={max} chartHeight={chartHeight} />
      <View style={{ flex: 1, height: chartContainerH(chartHeight) }}>
        <View
          onLayout={fit.onLayout}
          style={[styles.barRow, { justifyContent: fit.justify, height: chartContainerH(chartHeight) }]}
        >
          {fit.w === 0
            ? null
            : points.map((p, i) => {
                const selected = fullscreen && selectedIdx === i;
                return (
                  <Pressable
                    key={`${p.at}-${i}`}
                    onPress={fullscreen ? () => setSelectedIdx(selected ? null : i) : undefined}
                    style={[styles.barSlot, { width: fit.barWidth }]}
                  >
                    {selected ? (
                      <BarTooltip year={p.label} rows={[{ label: "", value: p.value }]} />
                    ) : fit.showValues ? (
                      <Text style={[styles.barValue, { color: t.muted }]}>{p.value}</Text>
                    ) : null}
                    <View
                      style={{
                        width: barInner(fit.barWidth),
                        height: Math.max(BAR_MIN, (p.value / max) * chartHeight),
                        backgroundColor: selected ? t.accent : bar,
                        borderRadius: radius.sm,
                      }}
                    />
                    <BarLabel text={i % fit.labelStep === 0 ? p.label : ""} />
                  </Pressable>
                );
              })}
        </View>
      </View>
    </View>
  );
}

/** Stacked returning (bottom) + new (top) attendees per point; fits the card. */
export function StackedBarChart({
  points,
  fullscreen = false,
}: {
  points: SplitPoint[];
  fullscreen?: boolean;
}) {
  const t = useAppTheme();
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const fit = useBarFit(points.length, chartHeight);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  if (points.length === 0) return <EmptyChart />;
  const max = Math.max(1, ...points.map((p) => p.fresh + p.returning));
  const scale = (n: number) => (n / max) * chartHeight;
  return (
    <View style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}>
      <YAxis max={max} chartHeight={chartHeight} />
      <View style={{ flex: 1, height: chartContainerH(chartHeight) }}>
        <View
          onLayout={fit.onLayout}
          style={[styles.barRow, { justifyContent: fit.justify, height: chartContainerH(chartHeight) }]}
        >
          {fit.w === 0
            ? null
            : points.map((p, i) => {
                const total = p.fresh + p.returning;
                const selected = fullscreen && selectedIdx === i;
                return (
                  <Pressable
                    key={`${p.at}-${i}`}
                    onPress={fullscreen ? () => setSelectedIdx(selected ? null : i) : undefined}
                    style={[styles.barSlot, { width: fit.barWidth }]}
                  >
                    {selected ? (
                      <BarTooltip
                        year={p.label}
                        rows={[
                          { label: "Leaders", value: p.fresh, colour: t.accent },
                          { label: "Staff", value: p.returning, colour: t.primary },
                        ]}
                      />
                    ) : fit.showValues ? (
                      <Text style={[styles.barValue, { color: t.muted }]}>{total}</Text>
                    ) : null}
                    <View style={{ width: barInner(fit.barWidth), opacity: selected ? 0.7 : 1 }}>
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
                    <BarLabel text={i % fit.labelStep === 0 ? p.label : ""} />
                  </Pressable>
                );
              })}
        </View>
      </View>
    </View>
  );
}

/** One bar's stacked segments (e.g. student leaders split by campus). */
export type MultiStackPoint = {
  at: number;
  label: string;
  segments: { key: string; value: number; colour: string }[];
};

/** Hairline gap between stacked segments so adjacent campus colours read apart. */
const SEG_GAP = 1.5;

/**
 * N coloured segments stacked per point.
 */
export function MultiStackedBarChart({
  points,
  fullscreen = false,
}: {
  points: MultiStackPoint[];
  fullscreen?: boolean;
}) {
  const t = useAppTheme();
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const fit = useBarFit(points.length, chartHeight);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  if (points.length === 0) return <EmptyChart />;
  const totals = points.map((p) => p.segments.reduce((s, seg) => s + seg.value, 0));
  const max = Math.max(1, ...totals);
  const scale = (n: number) => (n / max) * chartHeight;
  return (
    <View style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}>
      <YAxis max={max} chartHeight={chartHeight} />
      <View style={{ flex: 1, height: chartContainerH(chartHeight) }}>
        <View
          onLayout={fit.onLayout}
          style={[styles.barRow, { justifyContent: fit.justify, height: chartContainerH(chartHeight) }]}
        >
          {fit.w === 0
            ? null
            : points.map((p, i) => {
                const total = totals[i];
                const visible = p.segments.filter((seg) => seg.value > 0);
                const barHeight = Math.max(BAR_MIN, scale(total));
                const gapCount = Math.max(0, visible.length - 1);
                const gaps = Math.min(gapCount * SEG_GAP, Math.max(0, barHeight - BAR_MIN));
                const perGap = gapCount > 0 ? gaps / gapCount : 0;
                const fill = barHeight - gaps;
                const selected = fullscreen && selectedIdx === i;
                return (
                  <Pressable
                    key={`${p.at}-${i}`}
                    onPress={fullscreen ? () => setSelectedIdx(selected ? null : i) : undefined}
                    style={[styles.barSlot, { width: fit.barWidth }]}
                  >
                    {selected ? (
                      <BarTooltip
                        year={p.label}
                        rows={visible.map((seg) => ({
                          label: seg.key,
                          value: seg.value,
                          colour: seg.colour,
                        }))}
                      />
                    ) : fit.showValues ? (
                      <Text style={[styles.barValue, { color: t.muted }]}>{total}</Text>
                    ) : null}
                    <View
                      style={{
                        width: barInner(fit.barWidth),
                        height: barHeight,
                        justifyContent: "flex-end",
                        opacity: selected ? 0.7 : 1,
                      }}
                    >
                      {visible.map((seg, si) => (
                        <View
                          key={seg.key}
                          style={{
                            height: total > 0 ? (seg.value / total) * fill : 0,
                            backgroundColor: seg.colour,
                            marginTop: si === 0 ? 0 : perGap,
                            borderTopLeftRadius: si === 0 ? radius.sm : 0,
                            borderTopRightRadius: si === 0 ? radius.sm : 0,
                            borderBottomLeftRadius: si === visible.length - 1 ? radius.sm : 0,
                            borderBottomRightRadius: si === visible.length - 1 ? radius.sm : 0,
                          }}
                        />
                      ))}
                    </View>
                    <BarLabel text={i % fit.labelStep === 0 ? p.label : ""} />
                  </Pressable>
                );
              })}
        </View>
      </View>
    </View>
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
  chartHeaderRight: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  chartWithYAxis: {
    flexDirection: "row",
    gap: 4,
  },
  yAxis: {
    width: Y_AXIS_W,
    justifyContent: "space-between",
    alignItems: "flex-end",
    // Align ticks to the bar area only: skip value-label space at top and x-label at bottom
    paddingTop: BAR_VALUE_H,
    paddingBottom: BAR_LABEL_H + 4,
  },
  yTick: {
    fontSize: 9,
    letterSpacing: -0.3,
    textAlign: "right",
  },
  barRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    overflow: "visible",
  },
  barSlot: {
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    // Reserve space for value label even when hidden, so bars stay at a fixed baseline
    paddingTop: BAR_VALUE_H,
  },
  barLabelBox: {
    height: BAR_LABEL_H,
    justifyContent: "center",
    alignSelf: "center",
    minWidth: 24,
  },
  barValue: { fontSize: 11, fontWeight: "700" },
  barLabel: { fontSize: 10, letterSpacing: -0.2 },
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
  // Fullscreen modal
  fullscreenSafe: {
    flex: 1,
  },
  fullscreenHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  fullscreenLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    flex: 1,
    justifyContent: "flex-end",
  },
  fullscreenBody: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
  },
  closeBtn: {
    padding: 6,
    marginTop: -4,
  },
  // Bar tooltip
  tooltip: {
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: "center",
    minWidth: 52,
    marginBottom: 2,
    gap: 2,
  },
  tooltipValue: { fontSize: 14, fontWeight: "800" },
  tooltipLabel: { fontSize: 9, letterSpacing: 0.2 },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tooltipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tooltipSegLabel: { fontSize: 9, flex: 1 },
  tooltipSegValue: { fontSize: 10, fontWeight: "700" },
});
