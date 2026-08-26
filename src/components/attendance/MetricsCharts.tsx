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

const BAR_MIN = 3;
const CHART_HEIGHT = 120;
const CHART_HEIGHT_FULL = 220;
const BAR_MAX_W = 36;
const BAR_MIN_W = 5;
const BAR_GAP = 4;
const BAR_LABEL_H = 15;
const BAR_VALUE_H = 18;
const Y_AXIS_W = 32;
const chartContainerH = (ch: number) => ch + BAR_LABEL_H + BAR_VALUE_H;

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.max(1, step * mag);
}

function niceAxis(
  dataMax: number,
  chartHeight: number
): { max: number; ticks: number[] } {
  const targetTicks = Math.max(3, Math.min(7, Math.round(chartHeight / 32)));
  const safeMax = Number.isFinite(dataMax) && dataMax > 0 ? dataMax : 1;
  const step = niceStep(safeMax / targetTicks);
  const max = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];
  for (let v = max; v >= 0; v -= step) ticks.push(v);
  return { max, ticks };
}

const yAt = (v: number, max: number, chartHeight: number) =>
  max > 0 ? chartHeight - (v / max) * chartHeight : chartHeight;

export type ChartMode = "bar" | "line";
const ChartModeContext = createContext<ChartMode>("bar");
export const ChartModeProvider = ChartModeContext.Provider;
export const useChartMode = (): ChartMode => useContext(ChartModeContext);

export type LegendItem = { key: string; colour: string; label: string };

type ChartSelection = { selectedKey: string | null; toggle: (key: string) => void };
const ChartSelectionContext = createContext<ChartSelection>({
  selectedKey: null,
  toggle: () => {},
});
const useChartSelection = (): ChartSelection => useContext(ChartSelectionContext);

const LINE_STROKE = 2.5;
const LINE_DOT = 6;

function LinePath({
  points,
  colour,
  opacity = 1,
}: {
  points: { x: number; y: number }[];
  colour: string;
  opacity?: number;
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
              opacity,
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
            opacity,
          }}
        />
      ))}
    </>
  );
}

function LineSeriesChart({
  labels,
  series,
  max,
  fullscreen,
  tooltipLabelFor,
  selectedKey,
}: {
  labels: string[];
  series: { key: string; id?: string; colour: string; values: number[] }[];
  max: number;
  fullscreen: boolean;
  tooltipLabelFor: (i: number) => string;
  selectedKey?: string | null;
}) {
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const [w, setW] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (labels.length === 0) return <EmptyChart />;
  const count = labels.length;
  const colW = w > 0 ? w / count : 0;
  const xAt = (i: number) => colW * (i + 0.5);
  const { max: axisMax, ticks } = niceAxis(max, chartHeight);
  const LABEL_MIN_PX = 22;
  const labelStep =
    count <= 8 || colW >= LABEL_MIN_PX
      ? 1
      : Math.ceil(LABEL_MIN_PX / Math.max(1, colW || 1));
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
        <ChartGrid max={axisMax} ticks={ticks} chartHeight={chartHeight} />
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
                  opacity={
                    selectedKey != null && (s.id ?? s.key) !== selectedKey
                      ? 0.2
                      : 1
                  }
                  points={s.values.map((v, i) => ({
                    x: xAt(i),
                    y: yAt(v, axisMax, chartHeight),
                  }))}
                />
              ))
            : null}
        </View>
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
                const anchorY = Math.min(
                  ...series.map((s) => yAt(s.values[i], axisMax, chartHeight))
                );
                return (
                  <Pressable
                    key={`${label}-${i}`}
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

function useBarFit(
  count: number,
  chartHeight = CHART_HEIGHT,
  maxBarWidth = BAR_MAX_W
) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  let barWidth = maxBarWidth;
  let gap = BAR_GAP;
  if (w > 0 && count > 0) {
    const gaps = Math.max(0, count - 1);
    const neededAtMax = count * maxBarWidth + gaps * BAR_GAP;
    if (neededAtMax > w) {
      barWidth = Math.max(
        BAR_MIN_W,
        Math.floor((w - gaps * BAR_GAP) / count)
      );
      if (count * barWidth + gaps * BAR_GAP > w && gaps > 0) {
        gap = Math.max(
          0,
          Math.min(BAR_GAP, Math.floor((w - count * BAR_MIN_W) / gaps))
        );
        barWidth = Math.max(1, Math.floor((w - gaps * gap) / count));
      }
    }
  }
  const showValues = barWidth >= 18;
  const LABEL_MIN_PX = 22;
  const slotPitch = barWidth + gap;
  const labelStep =
    count <= 8 || barWidth >= LABEL_MIN_PX
      ? 1
      : Math.ceil(LABEL_MIN_PX / Math.max(1, slotPitch));
  return {
    w,
    onLayout,
    barWidth,
    gap,
    showValues,
    labelStep,
    justify: "center" as const,
    chartHeight,
  };
}

const barInner = (barWidth: number): number =>
  Math.max(1, barWidth - (barWidth > 16 ? 4 : 1));

function ChartGrid({
  max,
  ticks,
  chartHeight,
}: {
  max: number;
  ticks: number[];
  chartHeight: number;
}) {
  const t = useAppTheme();
  return (
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
      {ticks.map((v, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: yAt(v, max, chartHeight),
            height: StyleSheet.hairlineWidth * 2,
            backgroundColor: t.separator,
            opacity: v === 0 ? 0.85 : 0.45,
          }}
        />
      ))}
    </View>
  );
}

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

const Y_TICK_LINE_H = 11;

function YAxis({ max, chartHeight, ticks }: { max: number; chartHeight: number; ticks?: number[] }) {
  const t = useAppTheme();
  const values = ticks ?? [
    max,
    Math.round(max * 0.75),
    Math.round(max * 0.5),
    Math.round(max * 0.25),
    0,
  ];
  const fmtTick = (v: number) =>
    Number.isInteger(v) || Math.abs(v - Math.round(v)) < 1e-9
      ? String(Math.round(v))
      : (Math.round(v * 10) / 10).toFixed(1);
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
          {fmtTick(v)}
        </Text>
      ))}
    </View>
  );
}

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

function Legend({
  items,
  note,
  interactive = false,
  selectedKey,
  onToggle,
}: {
  items: LegendItem[];
  note?: string;
  interactive?: boolean;
  selectedKey?: string | null;
  onToggle?: (key: string) => void;
}) {
  const t = useAppTheme();
  const mode = useChartMode();
  const dimOthers = interactive && mode === "line" && selectedKey != null;
  return (
    <View style={styles.legendBlock}>
      <View style={styles.legendRow}>
        {items.map((item) => {
          const isSelected = interactive && selectedKey === item.key;
          const dimmed = dimOthers && !isSelected;
          const dot = (
            <View style={[styles.legendItem, dimmed && { opacity: 0.35 }]}>
              <View style={[styles.legendDot, { backgroundColor: item.colour }]} />
              <Text
                style={[
                  typography.caption,
                  { color: isSelected ? t.text : t.muted },
                  isSelected && { fontWeight: "600" },
                ]}
              >
                {item.label}
              </Text>
            </View>
          );
          return interactive ? (
            <Pressable
              key={item.key}
              onPress={() => onToggle?.(item.key)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`Highlight ${item.label}`}
            >
              {dot}
            </Pressable>
          ) : (
            <View key={item.key}>{dot}</View>
          );
        })}
      </View>
      {note ? (
        <Text style={[typography.caption, { color: t.faint }]}>{note}</Text>
      ) : null}
    </View>
  );
}

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
  const rotate = Platform.OS !== "web" && sh > sw;
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
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: t.background }]}
      />
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
            paddingHorizontal: spacing.xxxl,
            paddingVertical: spacing.sm,
          }}
        >
          <View style={styles.fullscreenHeader}>
            <View style={styles.chartTitleBlock}>
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
          <View style={styles.fullscreenBody}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

export function ChartCard({
  title,
  subtitle,
  legendItems,
  legendNote,
  children,
  width,
  fullscreenContent,
}: {
  title: string;
  subtitle?: string;
  legendItems?: LegendItem[];
  legendNote?: string;
  children: ReactNode;
  width: number;
  fullscreenContent?: ReactNode;
}) {
  const t = useAppTheme();
  const [full, setFull] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const toggle = (key: string) =>
    setSelectedKey((k) => (k === key ? null : key));
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. Tap to expand.`}
        onPress={() => {
          setSelectedKey(null);
          setFull(true);
        }}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <Card style={[styles.chartCard, { width }]}>
          <Ionicons
            name="expand-outline"
            size={16}
            color={t.faint}
            style={styles.expandIcon}
          />
          <View style={styles.chartHeader}>
            <View style={styles.chartTitleBlock}>
              <Text style={[typography.headline, { color: t.text }]}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[typography.caption, { color: t.muted }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {legendItems ? (
              <View style={styles.chartHeaderRight}>
                <Legend items={legendItems} note={legendNote} />
              </View>
            ) : null}
          </View>
          {children}
        </Card>
      </Pressable>
      <FullscreenChartModal
        visible={full}
        onClose={() => setFull(false)}
        title={title}
        subtitle={subtitle}
        legend={
          legendItems ? (
            <Legend
              items={legendItems}
              note={legendNote}
              interactive
              selectedKey={selectedKey}
              onToggle={toggle}
            />
          ) : undefined
        }
      >
        <ChartSelectionContext.Provider value={{ selectedKey, toggle }}>
          {fullscreenContent ?? children}
        </ChartSelectionContext.Provider>
      </FullscreenChartModal>
    </>
  );
}

type TooltipRow = { label: string; value: number; colour?: string };

function BarTooltip({ year, rows }: { year: string; rows: TooltipRow[] }) {
  const t = useAppTheme();
  if (!rows || rows.length === 0) return null;
  const single = rows.length === 1;
  return (
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

export function BarChart({
  points,
  colour,
  fullscreen = false,
  tooltipLabel,
}: {
  points: TrendPoint[];
  colour?: string;
  fullscreen?: boolean;
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
  const dataMax = Math.max(1, ...points.map((p) => p.value));
  const { max: axisMax, ticks } = niceAxis(dataMax, chartHeight);
  const labelFor = (i: number) =>
    tooltipLabel ? tooltipLabel(points[i]) : points[i].label;
  if (mode === "line") {
    return (
      <LineSeriesChart
        labels={points.map((p) => p.label)}
        series={[{ key: "", colour: bar, values: points.map((p) => p.value) }]}
        max={dataMax}
        fullscreen={fullscreen}
        tooltipLabelFor={labelFor}
      />
    );
  }
  return (
    <View
      style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}
    >
      <YAxis max={axisMax} chartHeight={chartHeight} ticks={ticks} />
      <View style={{ flex: 1, height: chartContainerH(chartHeight) }}>
        <ChartGrid max={axisMax} ticks={ticks} chartHeight={chartHeight} />
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
                const isLast = i === points.length - 1;
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
                      {
                        width: fit.barWidth,
                        marginRight: isLast ? 0 : fit.gap,
                        zIndex: selected ? 10 : 0,
                      },
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
                          (p.value / axisMax) * chartHeight,
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

export function StackedBarChart({
  points,
  fullscreen = false,
  labels = { fresh: "New", returning: "Returning" },
  tooltipLabel,
}: {
  points: SplitPoint[];
  fullscreen?: boolean;
  labels?: { fresh: string; returning: string };
  tooltipLabel?: (p: SplitPoint) => string;
}) {
  const t = useAppTheme();
  const mode = useChartMode();
  const { selectedKey } = useChartSelection();
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const fit = useBarFit(points.length, chartHeight);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (points.length === 0) return <EmptyChart />;
  const stackedDataMax = Math.max(
    1,
    ...points.map((p) => p.fresh + p.returning)
  );
  const { max: stackedMax, ticks } = niceAxis(stackedDataMax, chartHeight);
  const scale = (n: number) => (n / stackedMax) * chartHeight;
  const labelStep = fit.labelStep;
  const labelFor = (i: number) =>
    tooltipLabel ? tooltipLabel(points[i]) : points[i].label;
  if (mode === "line") {
    const lineMax = Math.max(
      1,
      ...points.map((p) => Math.max(p.fresh, p.returning))
    );
    return (
      <LineSeriesChart
        labels={points.map((p) => p.label)}
        series={[
          {
            key: labels.fresh,
            id: "fresh",
            colour: t.accent,
            values: points.map((p) => p.fresh),
          },
          {
            key: labels.returning,
            id: "returning",
            colour: t.primary,
            values: points.map((p) => p.returning),
          },
        ]}
        max={lineMax}
        fullscreen={fullscreen}
        tooltipLabelFor={labelFor}
        selectedKey={selectedKey}
      />
    );
  }
  const baseSegments = [
    { id: "fresh" as const, colour: t.accent },
    { id: "returning" as const, colour: t.primary },
  ];
  const segmentOrder =
    selectedKey && baseSegments.some((s) => s.id === selectedKey)
      ? [
          ...baseSegments.filter((s) => s.id !== selectedKey),
          ...baseSegments.filter((s) => s.id === selectedKey),
        ]
      : baseSegments;
  return (
    <View
      style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}
    >
      <YAxis max={stackedMax} chartHeight={chartHeight} ticks={ticks} />
      <View style={{ flex: 1, height: chartContainerH(chartHeight) }}>
        <ChartGrid max={stackedMax} ticks={ticks} chartHeight={chartHeight} />
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
                const values: Record<"fresh" | "returning", number> = {
                  fresh: p.fresh,
                  returning: p.returning,
                };
                const visible = segmentOrder
                  .map((s) => ({ ...s, value: values[s.id] }))
                  .filter((s) => s.value > 0);
                const isLast = i === points.length - 1;
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
                      {
                        width: fit.barWidth,
                        marginRight: isLast ? 0 : fit.gap,
                        zIndex: selected ? 10 : 0,
                      },
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
                      {visible.map((seg, si) => (
                        <View
                          key={seg.id}
                          style={{
                            height: Math.max(BAR_MIN, scale(seg.value)),
                            backgroundColor: seg.colour,
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
                    <BarLabel text={i % labelStep === 0 ? p.label : ""} />
                  </Pressable>
                );
              })}
        </View>
      </View>
    </View>
  );
}

export type MultiStackPoint = {
  at: number;
  label: string;
  segments: { key: string; value: number; colour: string }[];
};

const SEG_GAP = 1.5;

export function MultiStackedBarChart({
  points,
  fullscreen = false,
  tooltipLabel,
  stacked = true,
  axisMax,
  keepZeros = false,
}: {
  points: MultiStackPoint[];
  fullscreen?: boolean;
  tooltipLabel?: (p: MultiStackPoint) => string;
  stacked?: boolean;
  axisMax?: number;
  keepZeros?: boolean;
}) {
  const t = useAppTheme();
  const mode = useChartMode();
  const { selectedKey } = useChartSelection();
  const chartHeight = fullscreen ? CHART_HEIGHT_FULL : CHART_HEIGHT;
  const maxSegs = Math.max(1, ...points.map((p) => p.segments.length));
  const groupedSlot = Math.max(
    BAR_MAX_W,
    maxSegs * 12 + Math.max(0, maxSegs - 1) * SEG_GAP
  );
  const fit = useBarFit(
    points.length,
    chartHeight,
    stacked ? BAR_MAX_W : groupedSlot
  );
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (points.length === 0) return <EmptyChart />;
  const totals = points.map((p) =>
    p.segments.reduce((s, seg) => s + seg.value, 0),
  );
  const stackedDataMax = Math.max(1, ...totals);
  const groupedDataMax = Math.max(
    1,
    ...points.flatMap((p) => p.segments.map((seg) => seg.value)),
  );
  const dataMax = stacked ? stackedDataMax : groupedDataMax;
  const axis =
    axisMax !== undefined
      ? {
          max: axisMax,
          ticks: [axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0],
        }
      : niceAxis(dataMax, chartHeight);
  const scale = (n: number) => (n / axis.max) * chartHeight;
  const labelFor = (i: number) =>
    tooltipLabel ? tooltipLabel(points[i]) : points[i].label;
  if (mode === "line") {
    const keys = points[0].segments;
    return (
      <LineSeriesChart
        labels={points.map((p) => p.label)}
        series={keys.map((seg, si) => ({
          key: seg.key,
          colour: seg.colour,
          values: points.map((p) => p.segments[si]?.value ?? 0),
        }))}
        max={axis.max}
        fullscreen={fullscreen}
        tooltipLabelFor={labelFor}
        selectedKey={selectedKey}
      />
    );
  }
  return (
    <View
      style={[styles.chartWithYAxis, { height: chartContainerH(chartHeight) }]}
    >
      <YAxis max={axis.max} chartHeight={chartHeight} ticks={axis.ticks} />
      <View style={{ flex: 1, height: chartContainerH(chartHeight) }}>
        <ChartGrid
          max={axis.max}
          ticks={axis.ticks}
          chartHeight={chartHeight}
        />
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
                const filtered = keepZeros
                  ? p.segments
                  : p.segments.filter((seg) => seg.value > 0);
                const visible =
                  stacked && selectedKey && filtered.some((s) => s.key === selectedKey)
                    ? [
                        ...filtered.filter((s) => s.key !== selectedKey),
                        ...filtered.filter((s) => s.key === selectedKey),
                      ]
                    : filtered;
                const barHeight =
                  total > 0 ? Math.max(BAR_MIN, scale(total)) : 0;
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
                const isLast = i === points.length - 1;
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
                      {
                        width: fit.barWidth,
                        marginRight: isLast ? 0 : fit.gap,
                        zIndex: selected ? 10 : 0,
                      },
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
                              height:
                                seg.value <= 0
                                  ? 0
                                  : Math.max(BAR_MIN, scale(seg.value)),
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
    position: "relative",
  },
  expandIcon: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
  },
  chartHeader: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.xs,
    paddingRight: spacing.xl,
  },
  chartTitleBlock: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
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
  legendBlock: { gap: 6 },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
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
  tooltip: {
    position: "absolute",
    bottom: "100%",
    left: "50%",
    transform: [{ translateX: -43 }],
    borderRadius: radius.md,
    paddingHorizontal: 9,
    paddingVertical: 6,
    alignItems: "flex-start",
    minWidth: 86,
    marginBottom: 6,
    gap: 3,
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
