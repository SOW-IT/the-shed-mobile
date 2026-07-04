/**
 * Presentational pieces for the Attendance → Insights dashboard: summary metric
 * cards, lightweight native charts (no charting dependency — bars are Views),
 * and follow-up person rows. All theme-aware and responsive; the parent
 * (MetricsTab) decides column counts from the window width.
 */
import { Avatar, Card } from "@/components/ui";
import {
  radius,
  spacing,
  typography,
  useAppTheme,
  type AppTheme,
} from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { createContext, ReactNode, useContext, useState } from "react";
import {
  LayoutChangeEvent,
  Modal,
  Platform,
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
 * Round a raw step up to a "nice" number (1, 2, 5 × a power of ten) so the axis
 * lands on human-friendly increments. Steps stay ≥ 1 since every chart here plots
 * integer head-counts — fractional gridlines (2.5, 7.5) would read oddly.
 */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.max(1, step * mag);
}

/**
 * A uniform, evenly-stepped y-axis: 0 at the bottom, a rounded-up "nice" max at
 * the top, and consistent gridlines in between. Rather than only labelling the
 * values the data actually hits, this gives a stable scale that reads
 * pleasantly regardless of the exact data. Tick count scales with the
 * chart's height so short cards aren't crowded and tall fullscreen charts get
 * more detail. Returns the axis `max` (which the series must scale against) and
 * the descending tick list.
 */
function niceAxis(
  dataMax: number,
  chartHeight: number
): { max: number; ticks: number[] } {
  // ~1 tick per 48px of height, clamped so we never show 1 line or a wall of them.
  const targetTicks = Math.max(2, Math.min(6, Math.round(chartHeight / 48)));
  const safeMax = Number.isFinite(dataMax) && dataMax > 0 ? dataMax : 1;
  const step = niceStep(safeMax / targetTicks);
  const max = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];
  for (let v = max; v >= 0; v -= step) ticks.push(v);
  return { max, ticks };
}

/** Map a data value to a y position in pixels within the chart drawing area. */
const yAt = (v: number, max: number, chartHeight: number) =>
  max > 0 ? chartHeight - (v / max) * chartHeight : chartHeight;

/**
 * Bar vs line rendering, shared across every chart on the Insights screen via
 * context so a single toggle (see ChartModeFab) flips them all at once. Charts
 * default to bars when no provider is present.
 */
export type ChartMode = "bar" | "line";
const ChartModeContext = createContext<ChartMode>("bar");
export const ChartModeProvider = ChartModeContext.Provider;
export const useChartMode = (): ChartMode => useContext(ChartModeContext);

const LINE_STROKE = 2.5;
const LINE_DOT = 6;

/** One series drawn as connected segments (rotated Views) plus a dot per point. */
function LinePath({
  points,
  colour,
}: {
  points: { x: number; y: number }[];
  colour: string;
}) {
  return (
    <>
      {points.slice(1).map((b, idx) => {
        const a = points[idx];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        return (
          <View
            key={`seg-${idx}`}
            style={{
              position: "absolute",
              left: (a.x + b.x) / 2 - len / 2,
              top: (a.y + b.y) / 2 - LINE_STROKE / 2,
              width: len,
              height: LINE_STROKE,
              borderRadius: LINE_STROKE / 2,
              backgroundColor: colour,
              transform: [{ rotateZ: `${angle}rad` }],
            }}
          />
        );
      })}
      {points.map((p, i) => (
        <View
          key={`dot-${i}`}
          style={{
            position: "absolute",
            left: p.x - LINE_DOT / 2,
            top: p.y - LINE_DOT / 2,
            width: LINE_DOT,
            height: LINE_DOT,
            borderRadius: LINE_DOT / 2,
            backgroundColor: colour,
          }}
        />
      ))}
    </>
  );
}

/**
 * Line view of any chart: one or more series drawn as separate lines on a shared
 * scale. Tooltips (tap on touch, hover on web) work in fullscreen, mirroring the
 * bar charts. Points are evenly spaced across the measured width.
 */
function LineSeriesChart({
  labels,
  series,
  max,
  fullscreen,
  tooltipLabelFor,
}: {
  labels: string[];
  series: { key: string; colour: string; values: number[] }[];
  max: number;
  fullscreen: boolean;
  tooltipLabelFor: (i: number) => string;
}) {
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const [w, setW] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (labels.length === 0) return <EmptyChart />;
  const count = labels.length;
  const colW = w > 0 ? w / count : 0;
  const xAt = (i: number) => colW * (i + 0.5);
  // Uniform 0-based axis with evenly-spaced "nice" gridlines. The series scale
  // against `axisMax` (the rounded-up top) so points sit on the same gridlines
  // the labels mark — not just the exact values the lines happen to hit.
  const { max: axisMax, ticks } = niceAxis(max, chartHeight);
  const LABEL_MIN_PX = 22;
  const labelStep =
    colW >= LABEL_MIN_PX ? 1 : Math.ceil(LABEL_MIN_PX / Math.max(1, colW || 1));
  const multi = series.length > 1;
  return (
    <View
      style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}
    >
      <YAxis max={axisMax} chartHeight={chartHeight} ticks={ticks} />
      <View
        style={{ flex: 1, height: chartContainerH(chartHeight) }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
      >
        {/* Line overlay, aligned to the same drawing region the bars use. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: BAR_VALUE_H,
            height: chartHeight,
          }}
        >
          {w > 0
            ? series.map((s) => (
                <LinePath
                  key={s.key}
                  colour={s.colour}
                  points={s.values.map((v, i) => ({
                    x: xAt(i),
                    y: yAt(v, axisMax, chartHeight),
                  }))}
                />
              ))
            : null}
        </View>
        {/* Transparent hit columns carry hover/press + the x-axis labels. */}
        <View
          style={[
            styles.barRow,
            {
              height: chartContainerH(chartHeight),
              justifyContent: "flex-start",
            },
          ]}
        >
          {w === 0
            ? null
            : labels.map((label, i) => {
                const active =
                  fullscreen && (selectedIdx === i || hoveredIdx === i);
                // Anchor the tooltip above the highest (smallest y) point.
                const anchorY = Math.min(
                  ...series.map((s) => yAt(s.values[i], axisMax, chartHeight))
                );
                return (
                  <Pressable
                    key={`${label}-${i}`}
                    // On the small card, let taps fall through to the card so it
                    // opens fullscreen; only the fullscreen view is interactive.
                    pointerEvents={fullscreen ? "auto" : "none"}
                    onPress={
                      fullscreen
                        ? () => setSelectedIdx(selectedIdx === i ? null : i)
                        : undefined
                    }
                    onHoverIn={fullscreen ? () => setHoveredIdx(i) : undefined}
                    onHoverOut={fullscreen ? () => setHoveredIdx(null) : undefined}
                    style={{
                      width: colW,
                      height: chartContainerH(chartHeight),
                      paddingTop: BAR_VALUE_H,
                      alignItems: "center",
                      justifyContent: "flex-end",
                      zIndex: active ? 10 : 0,
                    }}
                  >
                    {active ? (
                      <View
                        style={{
                          position: "absolute",
                          top: BAR_VALUE_H + anchorY,
                          left: 0,
                          width: colW,
                          height: 0,
                        }}
                      >
                        <BarTooltip
                          year={tooltipLabelFor(i)}
                          rows={series.map((s) => ({
                            label: s.key,
                            value: s.values[i],
                            colour: multi ? s.colour : undefined,
                          }))}
                        />
                      </View>
                    ) : null}
                    <BarLabel text={i % labelStep === 0 ? label : ""} />
                  </Pressable>
                );
              })}
        </View>
      </View>
    </View>
  );
}

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
    barWidth >= LABEL_MIN_PX
      ? 1
      : Math.ceil(LABEL_MIN_PX / Math.max(1, barWidth));
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

// Approx line-box height of the 9px tick text, used to centre each label on its
// value's gridline.
const Y_TICK_LINE_H = 11;

/**
 * Y-axis column. Each tick is positioned with the SAME scale math the bars and
 * lines use (`yAt` within the drawing area that starts `BAR_VALUE_H` below the
 * top and spans `chartHeight`), so the labels line up exactly with the bar tops
 * / line points instead of being spread evenly by `space-between` — which
 * previously drifted from the real baseline by the padding difference.
 *
 * When `ticks` is omitted it falls back to even quarters (max, 75%, 50%, 25%, 0);
 * callers that pass data-derived ticks get labels that sit on their real points.
 */
function YAxis({ max, chartHeight, ticks }: { max: number; chartHeight: number; ticks?: number[] }) {
  const t = useAppTheme();
  const values = ticks ?? [
    max,
    Math.round(max * 0.75),
    Math.round(max * 0.5),
    Math.round(max * 0.25),
    0,
  ];
  return (
    <View style={[styles.yAxis, { height: chartContainerH(chartHeight) }]}>
      {values.map((v, i) => (
        <Text
          key={i}
          style={[
            styles.yTick,
            { color: t.faint, top: BAR_VALUE_H + yAt(v, max, chartHeight) - Y_TICK_LINE_H / 2 },
          ]}
          numberOfLines={1}
        >
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
        <Text
          style={[typography.label, { color: t.muted, flex: 1 }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {onPress ? (
          <Ionicons
            name="information-circle-outline"
            size={15}
            color={t.faint}
          />
        ) : null}
      </View>
      <Text style={[typography.amount, { color: accent }]} numberOfLines={1}>
        {value}
      </Text>
      {/* Delta + hint sit in fixed-height slots (rendered even when empty) so
          every card in a grid keeps the same height — the tallest it could be —
          regardless of which cards carry a change or a baseline hint. */}
      <View style={styles.metricFooter}>
        <View style={styles.deltaSlot}>
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
              <Text
                style={[
                  typography.caption,
                  { color: deltaColour, fontWeight: "700" },
                ]}
              >
                {delta.text}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.hintSlot}>
          {hint ? (
            <Text
              style={[typography.caption, { color: t.faint }]}
              numberOfLines={1}
            >
              {hint}
            </Text>
          ) : null}
        </View>
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
 * Fullscreen chart modal. On a portrait phone, app.json locks orientation to
 * portrait, so we render a portrait-sized modal and rotate its content 90° to
 * read as landscape — no native orientation API needed. When the device is
 * already landscape (width > height), or on web, there's nothing to gain from
 * rotating, so we fill the screen in its natural orientation.
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
  // Only rotate on a native portrait device. If the screen is already landscape
  // (width > height) or we're on web, show fullscreen in the natural orientation.
  const rotate = Platform.OS !== "web" && sh > sw;
  // After rotation the container's dims swap: it's sh wide and sw tall.
  const panelW = rotate ? sh : sw;
  const panelH = rotate ? sw : sh;
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
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: t.background }]}
      />
      {/* Rotated landscape container, centred on screen */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <View
          style={{
            width: panelW,
            height: panelH,
            transform: rotate ? [{ rotate: "90deg" }] : undefined,
            backgroundColor: t.background,
            // Uniform outer margin on all 4 sides around the entire panel
            paddingHorizontal: spacing.xxxl,
            paddingVertical: spacing.sm,
          }}
        >
          {/* Header */}
          <View style={styles.fullscreenHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.headline, { color: t.text }]}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[typography.caption, { color: t.muted }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {legend ? (
              <View style={styles.fullscreenLegend}>{legend}</View>
            ) : null}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close fullscreen"
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: 0.6 },
              ]}
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
              <Text style={[typography.headline, { color: t.text }]}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[typography.caption, { color: t.muted }]}>
                  {subtitle}
                </Text>
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
  if (!rows || rows.length === 0) return null;
  const single = rows.length === 1;
  return (
    // position:absolute so the tooltip floats above the bar without being
    // constrained to the (potentially narrow) barSlot width
    <View style={[styles.tooltip, { backgroundColor: t.text }]}>
      <Text style={[styles.tooltipYear, { color: t.background }]}>{year}</Text>
      {single ? (
        <Text style={[styles.tooltipValue, { color: t.background }]}>
          {rows[0].value}
        </Text>
      ) : (
        rows.map((r) => (
          <View key={r.label} style={styles.tooltipRow}>
            {r.colour ? (
              <View
                style={[styles.tooltipDot, { backgroundColor: r.colour }]}
              />
            ) : null}
            <Text style={[styles.tooltipSegLabel, { color: t.background }]}>
              {r.label}
            </Text>
            <Text style={[styles.tooltipSegValue, { color: t.background }]}>
              {r.value}
            </Text>
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
  tooltipLabel,
}: {
  points: TrendPoint[];
  colour?: string;
  fullscreen?: boolean;
  /** Top label for a point's tooltip (defaults to the x-axis label). */
  tooltipLabel?: (p: TrendPoint) => string;
}) {
  const t = useAppTheme();
  const bar = colour ?? t.primary;
  const mode = useChartMode();
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const fit = useBarFit(points.length, chartHeight);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (points.length === 0) return <EmptyChart />;
  const max = Math.max(1, ...points.map((p) => p.value));
  const labelFor = (i: number) =>
    tooltipLabel ? tooltipLabel(points[i]) : points[i].label;
  if (mode === "line") {
    return (
      <LineSeriesChart
        labels={points.map((p) => p.label)}
        series={[{ key: "", colour: bar, values: points.map((p) => p.value) }]}
        max={max}
        fullscreen={fullscreen}
        tooltipLabelFor={labelFor}
      />
    );
  }
  return (
    <View
      style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}
    >
      <YAxis max={max} chartHeight={chartHeight} />
      <View style={{ flex: 1, height: chartContainerH(chartHeight) }}>
        <View
          onLayout={fit.onLayout}
          style={[
            styles.barRow,
            {
              justifyContent: fit.justify,
              height: chartContainerH(chartHeight),
            },
          ]}
        >
          {fit.w === 0
            ? null
            : points.map((p, i) => {
                const selected =
                  fullscreen && (selectedIdx === i || hoveredIdx === i);
                return (
                  <Pressable
                    key={`${p.at}-${i}`}
                    onPress={
                      fullscreen
                        ? () => setSelectedIdx(selectedIdx === i ? null : i)
                        : undefined
                    }
                    onHoverIn={fullscreen ? () => setHoveredIdx(i) : undefined}
                    onHoverOut={
                      fullscreen ? () => setHoveredIdx(null) : undefined
                    }
                    style={[
                      styles.barSlot,
                      { width: fit.barWidth, zIndex: selected ? 10 : 0 },
                    ]}
                  >
                    {selected ? (
                      <BarTooltip
                        year={labelFor(i)}
                        rows={[{ label: "", value: p.value }]}
                      />
                    ) : fit.showValues ? (
                      <Text style={[styles.barValue, { color: t.muted }]}>
                        {p.value}
                      </Text>
                    ) : null}
                    <View
                      style={{
                        width: barInner(fit.barWidth),
                        height: Math.max(
                          BAR_MIN,
                          (p.value / max) * chartHeight,
                        ),
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
  // Tooltip names for the two segments (top = `fresh`, bottom = `returning`).
  labels = { fresh: "New", returning: "Returning" },
  tooltipLabel,
}: {
  points: SplitPoint[];
  fullscreen?: boolean;
  labels?: { fresh: string; returning: string };
  /** Top label for a point's tooltip (defaults to the x-axis label). */
  tooltipLabel?: (p: SplitPoint) => string;
}) {
  const t = useAppTheme();
  const mode = useChartMode();
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const fit = useBarFit(points.length, chartHeight);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (points.length === 0) return <EmptyChart />;
  // Bars are stacked, so they scale to the per-point total.
  const stackedMax = Math.max(1, ...points.map((p) => p.fresh + p.returning));
  const scale = (n: number) => (n / stackedMax) * chartHeight;
  // Label every 2nd bar (like the line chart), so a run of year labels reads
  // cleanly instead of crowding — while still honouring the width-based skip
  // when bars get thin.
  const labelStep = Math.max(2, fit.labelStep);
  const labelFor = (i: number) =>
    tooltipLabel ? tooltipLabel(points[i]) : points[i].label;
  if (mode === "line") {
    // Top segment (fresh) and bottom segment (returning) as two separate lines.
    // Lines aren't stacked, so scale to the tallest single value — using the
    // stacked total would squash both lines against the floor.
    const lineMax = Math.max(
      1,
      ...points.map((p) => Math.max(p.fresh, p.returning))
    );
    return (
      <LineSeriesChart
        labels={points.map((p) => p.label)}
        series={[
          { key: labels.fresh, colour: t.accent, values: points.map((p) => p.fresh) },
          {
            key: labels.returning,
            colour: t.primary,
            values: points.map((p) => p.returning),
          },
        ]}
        max={lineMax}
        fullscreen={fullscreen}
        tooltipLabelFor={labelFor}
      />
    );
  }
  return (
    <View
      style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}
    >
      <YAxis max={stackedMax} chartHeight={chartHeight} />
      <View style={{ flex: 1, height: chartContainerH(chartHeight) }}>
        <View
          onLayout={fit.onLayout}
          style={[
            styles.barRow,
            {
              justifyContent: fit.justify,
              height: chartContainerH(chartHeight),
            },
          ]}
        >
          {fit.w === 0
            ? null
            : points.map((p, i) => {
                const total = p.fresh + p.returning;
                const selected =
                  fullscreen && (selectedIdx === i || hoveredIdx === i);
                return (
                  <Pressable
                    key={`${p.at}-${i}`}
                    onPress={
                      fullscreen
                        ? () => setSelectedIdx(selectedIdx === i ? null : i)
                        : undefined
                    }
                    onHoverIn={fullscreen ? () => setHoveredIdx(i) : undefined}
                    onHoverOut={
                      fullscreen ? () => setHoveredIdx(null) : undefined
                    }
                    style={[
                      styles.barSlot,
                      { width: fit.barWidth, zIndex: selected ? 10 : 0 },
                    ]}
                  >
                    {selected ? (
                      <BarTooltip
                        year={labelFor(i)}
                        rows={[
                          {
                            label: labels.fresh,
                            value: p.fresh,
                            colour: t.accent,
                          },
                          {
                            label: labels.returning,
                            value: p.returning,
                            colour: t.primary,
                          },
                        ]}
                      />
                    ) : fit.showValues ? (
                      <Text style={[styles.barValue, { color: t.muted }]}>
                        {total}
                      </Text>
                    ) : null}
                    <View
                      style={{
                        width: barInner(fit.barWidth),
                        opacity: selected ? 0.7 : 1,
                      }}
                    >
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
                    <BarLabel text={i % labelStep === 0 ? p.label : ""} />
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
  tooltipLabel,
  stacked = true,
}: {
  points: MultiStackPoint[];
  fullscreen?: boolean;
  /** Top label for a point's tooltip (defaults to the x-axis label). */
  tooltipLabel?: (p: MultiStackPoint) => string;
  /**
   * Set false for values that are compared rather than summed (e.g. per-campus
   * averages) — bar mode then draws one bar per segment side by side, scaled
   * to the tallest single segment, instead of stacking them into a total that
   * wouldn't mean anything.
   */
  stacked?: boolean;
}) {
  const t = useAppTheme();
  const mode = useChartMode();
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const fit = useBarFit(points.length, chartHeight);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (points.length === 0) return <EmptyChart />;
  const totals = points.map((p) =>
    p.segments.reduce((s, seg) => s + seg.value, 0),
  );
  // Bars are stacked, so they scale to the per-point total.
  const stackedMax = Math.max(1, ...totals);
  const scale = (n: number) => (n / stackedMax) * chartHeight;
  // Grouped (unstacked) bars scale to the tallest single segment value —
  // scaling to the stacked total would squash every bar against the floor.
  const groupedMax = Math.max(
    1,
    ...points.flatMap((p) => p.segments.map((seg) => seg.value)),
  );
  const groupedScale = (n: number) => (n / groupedMax) * chartHeight;
  const labelFor = (i: number) =>
    tooltipLabel ? tooltipLabel(points[i]) : points[i].label;
  if (mode === "line") {
    // One line per segment (e.g. per campus), keyed off the first point's
    // segment order so colours and keys stay stable across points.
    const keys = points[0].segments;
    // Lines aren't stacked, so scale to the tallest single segment value —
    // scaling to the stacked total would squash every line against the floor.
    const lineMax = Math.max(
      1,
      ...points.flatMap((p) => p.segments.map((seg) => seg.value))
    );
    return (
      <LineSeriesChart
        labels={points.map((p) => p.label)}
        series={keys.map((seg, si) => ({
          key: seg.key,
          colour: seg.colour,
          values: points.map((p) => p.segments[si]?.value ?? 0),
        }))}
        max={lineMax}
        fullscreen={fullscreen}
        tooltipLabelFor={labelFor}
      />
    );
  }
  return (
    <View
      style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}
    >
      <YAxis max={stacked ? stackedMax : groupedMax} chartHeight={chartHeight} />
      <View style={{ flex: 1, height: chartContainerH(chartHeight) }}>
        <View
          onLayout={fit.onLayout}
          style={[
            styles.barRow,
            {
              justifyContent: fit.justify,
              height: chartContainerH(chartHeight),
            },
          ]}
        >
          {fit.w === 0
            ? null
            : points.map((p, i) => {
                const total = totals[i];
                const visible = p.segments.filter((seg) => seg.value > 0);
                const barHeight = Math.max(BAR_MIN, scale(total));
                const gapCount = Math.max(0, visible.length - 1);
                const gaps = Math.min(
                  gapCount * SEG_GAP,
                  Math.max(0, barHeight - BAR_MIN),
                );
                const perGap = gapCount > 0 ? gaps / gapCount : 0;
                const fill = barHeight - gaps;
                const selected =
                  fullscreen && (selectedIdx === i || hoveredIdx === i);
                const innerWidth = barInner(fit.barWidth);
                const groupGapCount = Math.max(0, visible.length - 1);
                const groupGaps = groupGapCount * SEG_GAP;
                const groupSegWidth =
                  visible.length > 0
                    ? Math.max(1, (innerWidth - groupGaps) / visible.length)
                    : innerWidth;
                return (
                  <Pressable
                    key={`${p.at}-${i}`}
                    onPress={
                      fullscreen
                        ? () => setSelectedIdx(selectedIdx === i ? null : i)
                        : undefined
                    }
                    onHoverIn={fullscreen ? () => setHoveredIdx(i) : undefined}
                    onHoverOut={
                      fullscreen ? () => setHoveredIdx(null) : undefined
                    }
                    style={[
                      styles.barSlot,
                      { width: fit.barWidth, zIndex: selected ? 10 : 0 },
                    ]}
                  >
                    {selected ? (
                      <BarTooltip
                        year={labelFor(i)}
                        rows={visible.map((seg) => ({
                          label: seg.key,
                          value: seg.value,
                          colour: seg.colour,
                        }))}
                      />
                    ) : fit.showValues && stacked ? (
                      <Text style={[styles.barValue, { color: t.muted }]}>
                        {total}
                      </Text>
                    ) : null}
                    {stacked ? (
                      <View
                        style={{
                          width: innerWidth,
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
                              borderBottomLeftRadius:
                                si === visible.length - 1 ? radius.sm : 0,
                              borderBottomRightRadius:
                                si === visible.length - 1 ? radius.sm : 0,
                            }}
                          />
                        ))}
                      </View>
                    ) : (
                      <View
                        style={{
                          width: innerWidth,
                          height: chartHeight,
                          flexDirection: "row",
                          alignItems: "flex-end",
                          opacity: selected ? 0.7 : 1,
                        }}
                      >
                        {visible.map((seg, si) => (
                          <View
                            key={seg.key}
                            style={{
                              width: groupSegWidth,
                              height: Math.max(BAR_MIN, groupedScale(seg.value)),
                              backgroundColor: seg.colour,
                              marginLeft: si === 0 ? 0 : SEG_GAP,
                              borderTopLeftRadius: radius.sm,
                              borderTopRightRadius: radius.sm,
                            }}
                          />
                        ))}
                      </View>
                    )}
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
export function LegendDot({
  colour,
  label,
}: {
  colour: string;
  label: string;
}) {
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
            style={[
              typography.caption,
              styles.breakdownLabel,
              { color: t.text },
            ]}
            numberOfLines={1}
          >
            {r.label}
          </Text>
          <View
            style={[styles.breakdownTrack, { backgroundColor: t.separator }]}
          >
            <View
              style={{
                width: `${(r.value / max) * 100}%`,
                height: "100%",
                backgroundColor: t.primary,
                borderRadius: radius.full,
              }}
            />
          </View>
          <Text
            style={[
              typography.caption,
              { color: t.muted, width: 28, textAlign: "right" },
            ]}
          >
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
        <Text
          style={[typography.headline, { color: t.text }]}
          numberOfLines={1}
        >
          {person.name}
        </Text>
        {person.subtitle ? (
          <Text
            style={[typography.caption, { color: t.muted }]}
            numberOfLines={1}
          >
            {person.kind === "staff" ? person.subtitle : "Member"}
            {" · "}Last seen {last}
          </Text>
        ) : (
          <Text
            style={[typography.caption, { color: t.muted }]}
            numberOfLines={1}
          >
            {person.kind === "staff" ? "Staff" : "Member"} · Last seen {last}
          </Text>
        )}
        <View
          style={[
            styles.reasonPill,
            { backgroundColor: withAlpha(tone, 0.14) },
          ]}
        >
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
      <Text style={[typography.caption, { color: t.faint }]}>
        No data in this range
      </Text>
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
  // Fixed-height slots keep cards uniform whether or not a delta/hint is present.
  deltaSlot: { height: 17, justifyContent: "center" },
  hintSlot: { height: 15, justifyContent: "center" },
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
    overflow: "visible",
    zIndex: 0,
  },
  yAxis: {
    width: Y_AXIS_W,
    // Ticks are absolutely positioned on their value's gridline (see YAxis).
    position: "relative",
  },
  yTick: {
    position: "absolute",
    right: 0,
    fontSize: 9,
    letterSpacing: -0.3,
    textAlign: "right",
  },
  barRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    overflow: "visible",
    zIndex: 0,
  },
  barSlot: {
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    // Reserve space for value label even when hidden, so bars stay at a fixed baseline
    paddingTop: BAR_VALUE_H,
    overflow: "visible",
    position: "relative",
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
    padding: spacing.sm,
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
    justifyContent: "center",
    overflow: "visible",
  },
  closeBtn: {
    padding: 6,
    marginTop: -4,
  },
  // Bar tooltip — absolutely positioned so it escapes the narrow barSlot
  tooltip: {
    position: "absolute",
    bottom: "100%",
    left: "50%",
    transform: [{ translateX: -43 }], // half of minWidth to centre it
    borderRadius: radius.md,
    paddingHorizontal: 9,
    paddingVertical: 6,
    alignItems: "flex-start",
    minWidth: 86,
    marginBottom: 6,
    gap: 3,
    // Elevate above sibling bars
    zIndex: 100,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  tooltipValue: { fontSize: 18, fontWeight: "800", alignSelf: "center" },
  tooltipYear: {
    fontSize: 10,
    letterSpacing: 0.3,
    opacity: 0.6,
    alignSelf: "center",
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  tooltipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tooltipSegLabel: { fontSize: 10, flex: 1 },
  tooltipSegValue: { fontSize: 11, fontWeight: "700" },
});
