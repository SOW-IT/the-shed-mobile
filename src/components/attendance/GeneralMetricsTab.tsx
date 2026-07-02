/**
 * Insights → General. Org-wide staff trends, one point per staff year, from
 * convex/generalMetrics.ts:
 *  - all staff head-count over time,
 *  - staff vs student leaders (the attendance member-filter split),
 *  - student leaders by campus.
 *
 * Cross-cutting numbers that aren't tied to a single campus live here, alongside
 * the per-campus attendance dashboard in the sibling "Attendance" segment.
 */
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { subgroupColour } from "../../../shared/rollcall";
import type { SplitPoint, TrendPoint } from "../../../shared/attendanceMetrics";
import {
  BarChart,
  ChartCard,
  LegendDot,
  type MultiStackPoint,
  MultiStackedBarChart,
  StackedBarChart,
} from "@/components/attendance/MetricsCharts";
import { EmptyState, FadeInView, LoadingState, stagger } from "@/components/ui";
import { spacing, useAppTheme } from "@/theme";

export function GeneralMetricsTab() {
  const t = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const onLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);

  const trends = useQuery(api.generalMetrics.staffTrends, {});

  const charts = useMemo(() => {
    if (!trends) return null;
    const yearLabel = (y: number) => `'${String(y).slice(-2)}`;

    const allStaff: TrendPoint[] = trends.years.map((year, i) => ({
      at: year,
      label: yearLabel(year),
      value: trends.allStaff[i],
    }));
    // Staff (bottom, primary) + student leaders (top, accent) stacked per year.
    const staffVsLeaders: SplitPoint[] = trends.years.map((year, i) => ({
      at: year,
      label: yearLabel(year),
      returning: trends.staff[i],
      fresh: trends.studentLeaders[i],
    }));
    const leadersByCampus: MultiStackPoint[] = trends.years.map((year, i) => ({
      at: year,
      label: yearLabel(year),
      segments: trends.studentLeadersByCampus.map((c) => ({
        key: c.campus,
        value: c.counts[i],
        colour: subgroupColour(c.campus),
      })),
    }));
    return { allStaff, staffVsLeaders, leadersByCampus };
  }, [trends]);

  if (trends === undefined) return <LoadingState />;
  if (trends === null || trends.years.length === 0) {
    return (
      <EmptyState
        icon="sparkles-outline"
        title="No staff history yet"
        message="Staff-trend insights appear once there's at least one staff year on record."
      />
    );
  }

  const width = containerWidth;

  return (
    <View onLayout={onLayout} style={styles.grid}>
      <FadeInView delay={stagger(0)}>
        <ChartCard title="All staff" subtitle="Head-count per staff year" width={width}>
          <BarChart points={charts!.allStaff} colour={t.primary} />
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
        >
          <StackedBarChart points={charts!.staffVsLeaders} />
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
                <LegendDot key={campus} colour={subgroupColour(campus)} label={campus} />
              ))}
            </View>
          }
        >
          <MultiStackedBarChart points={charts!.leadersByCampus} />
        </ChartCard>
      </FadeInView>

      <View style={{ height: spacing.xxl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  campusLegend: {
    alignItems: "flex-end",
    gap: 4,
    maxWidth: 160,
  },
});
