/**
 * Insights → General. Org-wide staff trends from convex/generalMetrics.ts:
 *  - all staff head-count over time,
 *  - staff vs student leaders (the attendance member-filter split),
 *  - student leaders by campus.
 *
 * The bottom-right selector (GeneralScopeFab, owned by the Insights screen) picks
 * the scope: "All years" shows the multi-year trend charts; a specific staff year
 * switches to summary cards for that year, each compared to the previous year.
 */
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { subgroupColour } from "../../../shared/rollcall";
import type { SplitPoint, TrendPoint } from "../../../shared/attendanceMetrics";
import {
  BarChart,
  ChartCard,
  LegendDot,
  MetricCard,
  type MultiStackPoint,
  MultiStackedBarChart,
  StackedBarChart,
} from "@/components/attendance/MetricsCharts";
import { EmptyState, FadeInView, LoadingState, stagger } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

type Delta = { text: string; direction: "up" | "down" | "flat" } | null;

const CAMPUS_ACRONYM: Record<string, string> = {
  "Australian Catholic University": "ACU",
  "E2E Test Campus": "E2E",
  "Macquarie University": "MACQ",
  "University of New South Wales": "UNSW",
  "University of Sydney": "USYD",
  "University of Technology, Sydney": "UTS",
};
const campusAcronym = (name: string) => CAMPUS_ACRONYM[name] ?? name;

/** Year-over-year change of `cur` vs `prev` for a metric card, or null. */
const yoyDelta = (cur: number, prev: number | undefined): Delta => {
  if (prev === undefined) return null; // no prior year on record
  if (prev === 0) return cur > 0 ? { text: "new", direction: "up" } : null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return {
    text: `${pct > 0 ? "+" : ""}${pct}%`,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
  };
};

export function GeneralMetricsTab({ year }: { year: number | null }) {
  const t = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const onLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);

  const trends = useQuery(api.generalMetrics.staffTrends, {});

  const charts = useMemo(() => {
    if (!trends) return null;
    const yearLabel = (y: number) => `'${String(y).slice(-2)}`;
    const allStaff: TrendPoint[] = trends.years.map((y, i) => ({
      at: y,
      label: yearLabel(y),
      value: trends.allStaff[i],
    }));
    // Staff (bottom, primary) + student leaders (top, accent) stacked per year.
    const staffVsLeaders: SplitPoint[] = trends.years.map((y, i) => ({
      at: y,
      label: yearLabel(y),
      returning: trends.staff[i],
      fresh: trends.studentLeaders[i],
    }));
    const leadersByCampus: MultiStackPoint[] = trends.years.map((y, i) => ({
      at: y,
      label: yearLabel(y),
      segments: trends.studentLeadersByCampus.map((c) => ({
        key: campusAcronym(c.campus),
        value: c.counts[i],
        colour: subgroupColour(c.campus),
      })),
    }));
    return { allStaff, staffVsLeaders, leadersByCampus };
  }, [trends]);

  if (trends === undefined) return <LoadingState />;
  // `null` means the query couldn't resolve a staff profile for the caller (not
  // signed in, or not provisioned) — distinct from a provisioned account that
  // simply has no staff years on record yet.
  if (trends === null) {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Staff insights unavailable"
        message="Sign in with a provisioned staff account to see org-wide staff trends."
      />
    );
  }
  if (trends.years.length === 0 || !charts) {
    return (
      <EmptyState
        icon="sparkles-outline"
        title="No staff history yet"
        message="Staff-trend insights appear once there's at least one staff year on record."
      />
    );
  }

  const width = containerWidth;

  // ── Year-by-year: summary cards for the selected year, vs the prior year. ──
  const yearIndex = year === null ? -1 : trends.years.indexOf(year);
  if (year !== null && yearIndex >= 0) {
    const i = yearIndex;
    const prevYear = i > 0 ? trends.years[i - 1] : undefined;
    const at = <T,>(arr: T[]): T | undefined => (i > 0 ? arr[i - 1] : undefined);

    const cardCols = width >= 640 ? 3 : 2;
    const cardWidth = (width - spacing.sm * (cardCols - 1)) / cardCols;
    const cards: { label: string; value: number; delta: Delta; tone?: "positive" }[] = [
      { label: "All staff", value: trends.allStaff[i], delta: yoyDelta(trends.allStaff[i], at(trends.allStaff)) },
      { label: "Staff", value: trends.staff[i], delta: yoyDelta(trends.staff[i], at(trends.staff)) },
      { label: "Student leaders", value: trends.studentLeaders[i], delta: yoyDelta(trends.studentLeaders[i], at(trends.studentLeaders)), tone: "positive" },
      ...trends.studentLeadersByCampus.map((c) => ({
        label: campusAcronym(c.campus),
        value: c.counts[i],
        delta: yoyDelta(c.counts[i], at(c.counts)),
      })),
    ];

    return (
      <View onLayout={onLayout} style={styles.grid}>
        <Text style={[typography.caption, { color: t.muted }]}>
          {prevYear !== undefined
            ? `Staff year ${year} — change vs ${prevYear}.`
            : `Staff year ${year} — no earlier year to compare against.`}
        </Text>
        <View style={styles.cardGrid}>
          {cards.map((card, idx) => (
            <FadeInView key={card.label} delay={stagger(idx)}>
              <MetricCard
                label={card.label}
                value={String(card.value)}
                delta={card.delta}
                hint={prevYear !== undefined ? `vs ${prevYear}` : "no baseline"}
                tone={card.tone ?? "default"}
                width={cardWidth}
              />
            </FadeInView>
          ))}
        </View>
        <View style={{ height: spacing.xxl }} />
      </View>
    );
  }

  // ── All years: the multi-year trend charts. ──
  return (
    <View onLayout={onLayout} style={styles.grid}>
      <FadeInView delay={stagger(0)}>
        <ChartCard
          title="All staff"
          subtitle="Head-count per staff year"
          width={width}
          fullscreenContent={<BarChart points={charts.allStaff} colour={t.primary} fullscreen />}
        >
          <BarChart points={charts.allStaff} colour={t.primary} />
        </ChartCard>
      </FadeInView>

      <FadeInView delay={stagger(1)}>
        <ChartCard
          title="Staff vs student leaders"
          subtitle="Per staff year"
          width={width}
          legend={
            <View style={{ gap: 4 }}>
              <LegendDot colour={t.primary} label="Staff" />
              <LegendDot colour={t.accent} label="Student leaders" />
            </View>
          }
          fullscreenContent={
            <StackedBarChart
              points={charts.staffVsLeaders}
              labels={{ fresh: "Leaders", returning: "Staff" }}
              fullscreen
            />
          }
        >
          <StackedBarChart
            points={charts.staffVsLeaders}
            labels={{ fresh: "Leaders", returning: "Staff" }}
          />
        </ChartCard>
      </FadeInView>

      <FadeInView delay={stagger(2)}>
        <ChartCard
          title="Student leaders by campus"
          subtitle="Per staff year"
          width={width}
          legend={
            <View style={styles.campusLegend}>
              {trends.campuses.map((campus) => (
                <LegendDot key={campus} colour={subgroupColour(campus)} label={campusAcronym(campus)} />
              ))}
            </View>
          }
          fullscreenContent={<MultiStackedBarChart points={charts.leadersByCampus} fullscreen />}
        >
          <MultiStackedBarChart points={charts.leadersByCampus} />
        </ChartCard>
      </FadeInView>

      <View style={{ height: spacing.xxl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  campusLegend: {
    alignItems: "flex-end",
    gap: 4,
    maxWidth: 160,
  },
});
