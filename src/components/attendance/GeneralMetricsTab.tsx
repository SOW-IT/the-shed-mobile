/**
 * Insights → General. Org-wide trends from convex/generalMetrics.ts:
 *  - all staff head-count over time,
 *  - staff vs student leaders (the attendance member-filter split),
 *  - student leaders by campus.
 *
 * For everyone this tab is visible, but non-staff users get a sign-in prompt and
 * a limited public scope: only "All years" and 2026 are selectable. The detailed
 * per-year cards stay staff-only.
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
  ChartModeProvider,
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

/** Averages carry one decimal; drop a trailing ".0" so whole numbers read clean. */
const fmtAvg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

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

export function GeneralMetricsTab({ year, publicPreview }: { year: number | null; publicPreview?: boolean }) {
  const t = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const onLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);

  const trends = useQuery(api.generalMetrics.staffTrends, {});
  const campusAttendance = useQuery(api.generalMetrics.campusWeeklyAttendance, {});

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

  // Average weekly-meeting attendance per campus, one point per staff year from
  // 2025 (when attendance recording began). The current year's point is a YTD
  // average — only meetings held so far are counted.
  const campusWeekly = useMemo<MultiStackPoint[] | null>(() => {
    if (!campusAttendance || campusAttendance.years.length === 0) return null;
    if (campusAttendance.campuses.length === 0) return null;
    const yearLabel = (y: number) => `'${String(y).slice(-2)}`;
    return campusAttendance.years.map((y, i) => ({
      at: y,
      label: yearLabel(y),
      segments: campusAttendance.campuses.map((c) => ({
        key: campusAcronym(c.campus),
        value: c.averages[i],
        colour: subgroupColour(c.campus),
      })),
    }));
  }, [campusAttendance]);

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
  // The detailed per-year cards stay staff-only; the public preview only ever
  // shows the All-years trend charts below.
  const yearIndex = year === null ? -1 : trends.years.indexOf(year);
  if (!publicPreview && year !== null && yearIndex >= 0) {
    const i = yearIndex;
    const prevYear = i > 0 ? trends.years[i - 1] : undefined;
    const at = <T,>(arr: T[]): T | undefined => (i > 0 ? arr[i - 1] : undefined);

    const cardCols = width >= 640 ? 3 : 2;
    const cardWidth = (width - spacing.sm * (cardCols - 1)) / cardCols;
    const cards: { label: string; value: number; delta: Delta; tone?: "positive" }[] = [
      { label: "All staff", value: trends.allStaff[i], delta: yoyDelta(trends.allStaff[i], at(trends.allStaff)) },
      { label: "Staff", value: trends.staff[i], delta: yoyDelta(trends.staff[i], at(trends.staff)) },
      { label: "Student leaders", value: trends.studentLeaders[i], delta: yoyDelta(trends.studentLeaders[i], at(trends.studentLeaders)), tone: "positive" },
      // Skip campuses with nobody this year — an empty card reads as a gap.
      ...trends.studentLeadersByCampus
        .filter((c) => c.counts[i] > 0)
        .map((c) => ({
          label: campusAcronym(c.campus),
          value: c.counts[i],
          delta: yoyDelta(c.counts[i], at(c.counts)),
        })),
    ];

    // Average weekly-meeting attendance per campus this staff year, vs last —
    // only from 2025 (attendance start) and only campuses that met this year.
    const caIndex = campusAttendance ? campusAttendance.years.indexOf(year) : -1;
    const attendanceCards =
      campusAttendance && caIndex >= 0
        ? campusAttendance.campuses
            .filter((c) => c.averages[caIndex] > 0)
            .map((c) => ({
              label: campusAcronym(c.campus),
              value: c.averages[caIndex],
              delta: yoyDelta(
                c.averages[caIndex],
                caIndex > 0 ? c.averages[caIndex - 1] : undefined
              ),
            }))
        : [];

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

        {attendanceCards.length > 0 ? (
          <>
            <Text style={[typography.headline, { color: t.text }]}>
              Avg weekly meeting attendance
            </Text>
            <View style={styles.cardGrid}>
              {attendanceCards.map((card, idx) => (
                <FadeInView key={card.label} delay={stagger(idx)}>
                  <MetricCard
                    label={card.label}
                    value={fmtAvg(card.value)}
                    delta={card.delta}
                    hint={prevYear !== undefined ? `vs ${prevYear}` : "no baseline"}
                    width={cardWidth}
                  />
                </FadeInView>
              ))}
            </View>
          </>
        ) : null}

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
          fullscreenContent={
            <BarChart
              points={charts.allStaff}
              colour={t.primary}
              tooltipLabel={(p) => String(p.at)}
              fullscreen
            />
          }
        >
          <BarChart
            points={charts.allStaff}
            colour={t.primary}
            tooltipLabel={(p) => String(p.at)}
          />
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
              labels={{ fresh: "SLs", returning: "Staff" }}
              tooltipLabel={(p) => String(p.at)}
              fullscreen
            />
          }
        >
          <StackedBarChart
            points={charts.staffVsLeaders}
            labels={{ fresh: "Leaders", returning: "Staff" }}
            tooltipLabel={(p) => String(p.at)}
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
          fullscreenContent={
            <MultiStackedBarChart
              points={charts.leadersByCampus}
              tooltipLabel={(p) => String(p.at)}
              fullscreen
            />
          }
        >
          <MultiStackedBarChart
            points={charts.leadersByCampus}
            tooltipLabel={(p) => String(p.at)}
          />
        </ChartCard>
      </FadeInView>

      {campusWeekly ? (
        <FadeInView delay={stagger(3)}>
          <ChartCard
            title="Weekly meeting attendance by campus"
            subtitle="Average per staff year (from 2025)"
            width={width}
            legend={
              <View style={styles.campusLegend}>
                {campusAttendance!.campuses.map((c) => (
                  <LegendDot
                    key={c.campus}
                    colour={subgroupColour(c.campus)}
                    label={campusAcronym(c.campus)}
                  />
                ))}
              </View>
            }
            fullscreenContent={
              // Averages are compared, not summed, so this chart is always drawn
              // as one line per campus (a stacked bar would total the campus
              // averages into a meaningless sum) — regardless of the global
              // bars/lines toggle the other trend charts follow.
              <ChartModeProvider value="line">
                <MultiStackedBarChart
                  points={campusWeekly}
                  tooltipLabel={(p) => String(p.at)}
                  fullscreen
                />
              </ChartModeProvider>
            }
          >
            <ChartModeProvider value="line">
              <MultiStackedBarChart
                points={campusWeekly}
                tooltipLabel={(p) => String(p.at)}
              />
            </ChartModeProvider>
          </ChartCard>
        </FadeInView>
      ) : null}

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
