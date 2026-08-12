/**
 * Insights → General. Org-wide trends from convex/generalMetrics.ts (all from
 * `staffProfiles` only — org-chart staff + student leaders, not attendance):
 *  - all staff head-count over time, broken into staff + student leaders,
 *  - student leaders by campus,
 *  - year-over-year retention (turnover is the complement, shown as a hint),
 *  - share serving ≥2 years in-role + average years served so far.
 *
 * Trend charts default to the last {@link GENERAL_RECENT_YEARS} years (operational
 * view); the scope picker can expand to all history or a single year of cards.
 * Non-staff signed-out visitors get a public preview (trends only).
 */
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { subgroupColour } from "../../../shared/rollcall";
import {
  GENERAL_RECENT_YEARS,
  type SplitPoint,
} from "../../../shared/attendanceMetrics";
import type { GeneralScope } from "@/components/attendance/InsightsSelectors";
import {
  ChartCard,
  type LegendItem,
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
  "Western Sydney University": "WSU",
};
const campusAcronym = (name: string) => CAMPUS_ACRONYM[name] ?? name;

/** Averages carry one decimal; drop a trailing ".0" so whole numbers read clean. */
const fmtAvg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Percentages for metric cards (e.g. 33.3 → "33.3%"). */
const fmtPct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${fmtAvg(n)}%`;

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

/**
 * Absolute percentage-point change for rate metrics (retention / tenure %),
 * where a relative % of a % would read oddly. Null when either side is missing.
 */
const ppDelta = (
  cur: number | null | undefined,
  prev: number | null | undefined
): Delta => {
  if (cur === null || cur === undefined) return null;
  if (prev === null || prev === undefined) return null;
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff === 0) return { text: "0pp", direction: "flat" };
  return {
    text: `${diff > 0 ? "+" : ""}${fmtAvg(diff)}pp`,
    direction: diff > 0 ? "up" : "down",
  };
};

/** Absolute change in years for avg-tenure cards (not percentage points). */
const yearsDelta = (
  cur: number | null | undefined,
  prev: number | null | undefined
): Delta => {
  if (cur === null || cur === undefined) return null;
  if (prev === null || prev === undefined) return null;
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff === 0) return { text: "0y", direction: "flat" };
  return {
    text: `${diff > 0 ? "+" : ""}${fmtAvg(diff)}y`,
    direction: diff > 0 ? "up" : "down",
  };
};

/** Push a chart segment only when the value is a real reading (not null). */
const rateSegment = (
  key: string,
  value: number | null | undefined,
  colour: string
): { key: string; value: number; colour: string } | null =>
  value === null || value === undefined
    ? null
    : { key, value, colour };

export function GeneralMetricsTab({
  scope,
  publicPreview,
}: {
  /**
   * null = recent years trend (default operational view);
   * "all" = full history; a year number = that year's summary cards.
   */
  scope: GeneralScope;
  publicPreview?: boolean;
}) {
  const t = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const onLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);

  const trends = useQuery(api.generalMetrics.staffTrends, {});
  const campusAttendance = useQuery(api.generalMetrics.campusWeeklyAttendance, {});

  // Trend charts: default to the last N years (operational); "all" shows history.
  const trendYearCount =
    scope === "all" ? Number.POSITIVE_INFINITY : GENERAL_RECENT_YEARS;

  const charts = useMemo(() => {
    if (!trends) return null;
    const yearLabel = (y: number) => `'${String(y).slice(-2)}`;
    const start =
      trends.years.length > trendYearCount
        ? trends.years.length - trendYearCount
        : 0;
    const years = trends.years.slice(start);
    const idx = (i: number) => start + i;

    // Single stacked chart: total head-count broken into staff + student leaders
    // (replaces the redundant "All staff" + "Staff vs student leaders" pair).
    const staffBreakdown: SplitPoint[] = years.map((y, i) => ({
      at: y,
      label: yearLabel(y),
      returning: trends.staff[idx(i)],
      fresh: trends.studentLeaders[idx(i)],
    }));
    const leadersByCampus: MultiStackPoint[] = years.map((y, i) => ({
      at: y,
      label: yearLabel(y),
      segments: trends.studentLeadersByCampus.map((c) => ({
        key: campusAcronym(c.campus),
        value: c.counts[idx(i)],
        colour: subgroupColour(c.campus),
      })),
    }));

    // Rates are compared, not summed — grouped bars. Only emit segments with a
    // real reading (null = no prior roster / empty lens); never coerce null→0.
    // Tolerate a missing series (older snapshots / partial payloads) rather than
    // crashing the whole General tab.
    const rateSeriesByYear = (
      series:
        | {
            overall: (number | null)[];
            staff: (number | null)[];
            studentLeaders: (number | null)[];
          }
        | null
        | undefined
    ): MultiStackPoint[] => {
      if (!series?.overall || !series.staff || !series.studentLeaders) return [];
      return years
        .map((y, i) => {
          const j = idx(i);
          const segments = [
            rateSegment("Overall", series.overall[j], t.text),
            rateSegment("Staff", series.staff[j], t.primary),
            rateSegment("SLs", series.studentLeaders[j], t.accent),
          ].filter((s): s is { key: string; value: number; colour: string } => !!s);
          return { at: y, label: yearLabel(y), segments };
        })
        .filter((p) => p.segments.length > 0);
    };

    // Retention only — turnover is the same number inverted (shown as a card hint).
    const retentionByYear = rateSeriesByYear(trends.retention);

    const tenure2PlusByYear = rateSeriesByYear(trends.tenure2Plus);

    const avgTenureByYear = rateSeriesByYear(trends.avgTenureYears);

    return {
      staffBreakdown,
      leadersByCampus,
      retentionByYear,
      tenure2PlusByYear,
      avgTenureByYear,
      trendStartYear: years[0],
      trendEndYear: years[years.length - 1],
    };
  }, [trends, trendYearCount, t.text, t.primary, t.accent]);

  // Average weekly-meeting attendance per campus, one point per staff year from
  // 2025 (when attendance recording began). The current year's point is a YTD
  // average — only meetings held so far are counted.
  const campusWeekly = useMemo<MultiStackPoint[] | null>(() => {
    if (!campusAttendance || campusAttendance.years.length === 0) return null;
    if (campusAttendance.campuses.length === 0) return null;
    const yearLabel = (y: number) => `'${String(y).slice(-2)}`;
    const start =
      campusAttendance.years.length > trendYearCount
        ? campusAttendance.years.length - trendYearCount
        : 0;
    return campusAttendance.years.slice(start).map((y, i) => {
      const j = start + i;
      return {
        at: y,
        label: yearLabel(y),
        segments: campusAttendance.campuses.map((c) => ({
          key: campusAcronym(c.campus),
          value: c.averages[j],
          colour: subgroupColour(c.campus),
        })),
      };
    });
  }, [campusAttendance, trendYearCount]);

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
  // Charts flow in a grid too — as many as fit at ~440pt each — so on a wide
  // screen they sit side by side (like the summary cards) instead of one huge
  // chart per row. Below ~880pt it's a single full-width chart.
  const chartCols = Math.max(1, Math.floor(width / 440));
  const chartWidth =
    chartCols > 1 ? (width - spacing.sm * (chartCols - 1)) / chartCols : width;

  // ── Year-by-year: summary cards for the selected year, vs the prior year. ──
  // The detailed per-year cards stay staff-only; the public preview only ever
  // shows the trend charts below.
  const selectedYear = typeof scope === "number" ? scope : null;
  const yearIndex = selectedYear === null ? -1 : trends.years.indexOf(selectedYear);
  if (!publicPreview && selectedYear !== null && yearIndex >= 0) {
    const i = yearIndex;
    const year = selectedYear;
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

    type RateCard = {
      label: string;
      value: number | null;
      delta: Delta;
      hint: string;
      tone?: "positive" | "default";
    };

    // Retention for year Y vs prior year's roster. Turnover is the complement
    // (same prior denominator) — surface it as a hint, not a second card grid.
    const retentionHint = (
      left: number | null | undefined,
      priorN: number | undefined
    ) => {
      if (prevYear === undefined) return "needs a prior year";
      const parts: string[] = [`vs ${prevYear}`];
      if (priorN !== undefined) parts.push(`n=${priorN}`);
      if (left !== null && left !== undefined) parts.push(`${fmtAvg(left)}% left`);
      return parts.join(" · ");
    };
    const retentionAll: RateCard[] = [
      {
        label: "Overall retention",
        value: trends.retention.overall[i],
        delta: ppDelta(trends.retention.overall[i], at(trends.retention.overall)),
        hint: retentionHint(trends.turnover.overall[i], at(trends.allStaff)),
        tone: "positive",
      },
      {
        label: "Staff retention",
        value: trends.retention.staff[i],
        delta: ppDelta(trends.retention.staff[i], at(trends.retention.staff)),
        hint: retentionHint(trends.turnover.staff[i], at(trends.staff)),
        tone: "positive",
      },
      {
        label: "Student leader retention",
        value: trends.retention.studentLeaders[i],
        delta: ppDelta(
          trends.retention.studentLeaders[i],
          at(trends.retention.studentLeaders)
        ),
        hint: retentionHint(
          trends.turnover.studentLeaders[i],
          at(trends.studentLeaders)
        ),
        tone: "positive",
      },
    ];
    const retentionCards = retentionAll.filter((c) => c.value !== null);

    // Of people present this year: ≥2 years share + mean years so far.
    // Staff/SL lenses count years *in that role* (SL→staff is a common path).
    const tenureAll: RateCard[] = [
      {
        label: "Overall ≥2 years",
        value: trends.tenure2Plus.overall[i],
        delta: ppDelta(trends.tenure2Plus.overall[i], at(trends.tenure2Plus.overall)),
        hint: `of people this year · n=${trends.allStaff[i]}`,
        tone: "positive",
      },
      {
        label: "Staff ≥2 years",
        value: trends.tenure2Plus.staff[i],
        delta: ppDelta(trends.tenure2Plus.staff[i], at(trends.tenure2Plus.staff)),
        hint: `years in this role · n=${trends.staff[i]}`,
        tone: "positive",
      },
      {
        label: "Student leaders ≥2 years",
        value: trends.tenure2Plus.studentLeaders[i],
        delta: ppDelta(
          trends.tenure2Plus.studentLeaders[i],
          at(trends.tenure2Plus.studentLeaders)
        ),
        hint: `years in this role · n=${trends.studentLeaders[i]}`,
        tone: "positive",
      },
    ];
    const tenureCards = tenureAll.filter((c) => c.value !== null);

    type YearsCard = {
      label: string;
      value: number;
      delta: Delta;
      hint: string;
    };
    const avgYearsCards: YearsCard[] = (
      [
        {
          label: "Overall avg years",
          value: trends.avgTenureYears.overall[i],
          delta: yearsDelta(
            trends.avgTenureYears.overall[i],
            at(trends.avgTenureYears.overall)
          ),
          hint: `years served so far · n=${trends.allStaff[i]}`,
        },
        {
          label: "Staff avg years",
          value: trends.avgTenureYears.staff[i],
          delta: yearsDelta(
            trends.avgTenureYears.staff[i],
            at(trends.avgTenureYears.staff)
          ),
          hint: `years in this role so far · n=${trends.staff[i]}`,
        },
        {
          label: "Student leader avg years",
          value: trends.avgTenureYears.studentLeaders[i],
          delta: yearsDelta(
            trends.avgTenureYears.studentLeaders[i],
            at(trends.avgTenureYears.studentLeaders)
          ),
          hint: `years in this role so far · n=${trends.studentLeaders[i]}`,
        },
      ] as {
        label: string;
        value: number | null;
        delta: Delta;
        hint: string;
      }[]
    ).filter((c): c is YearsCard => c.value !== null);

    return (
      <View onLayout={onLayout} style={styles.grid}>
        <Text style={[typography.caption, { color: t.muted }]}>
          {prevYear !== undefined
            ? `Staff year ${year} — change vs ${prevYear}. Staff profiles only.`
            : `Staff year ${year} — no earlier year to compare against. Staff profiles only.`}
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

        {retentionCards.length > 0 ? (
          <>
            <Text style={[typography.headline, { color: t.text }]}>Retention</Text>
            <Text style={[typography.caption, { color: t.muted }]}>
              {"Share of last year's roster still serving this year. The % who left is the complement."}
            </Text>
            <View style={styles.cardGrid}>
              {retentionCards.map((card, idx) => (
                <FadeInView key={card.label} delay={stagger(idx)}>
                  <MetricCard
                    label={card.label}
                    value={fmtPct(card.value)}
                    delta={card.delta}
                    hint={card.hint}
                    tone={card.tone ?? "default"}
                    width={cardWidth}
                  />
                </FadeInView>
              ))}
            </View>
          </>
        ) : null}

        {tenureCards.length > 0 ? (
          <>
            <Text style={[typography.headline, { color: t.text }]}>
              Serve at least 2 years
            </Text>
            <Text style={[typography.caption, { color: t.muted }]}>
              Of people present this year, the share with two or more years so
              far. Staff and student-leader cards count years in that role.
            </Text>
            <View style={styles.cardGrid}>
              {tenureCards.map((card, idx) => (
                <FadeInView key={card.label} delay={stagger(idx)}>
                  <MetricCard
                    label={card.label}
                    value={fmtPct(card.value)}
                    delta={card.delta}
                    hint={card.hint}
                    tone={card.tone ?? "default"}
                    width={cardWidth}
                  />
                </FadeInView>
              ))}
            </View>
          </>
        ) : null}

        <Text style={[typography.headline, { color: t.text }]}>
          Average years served so far
        </Text>
        <Text style={[typography.caption, { color: t.muted }]}>
          Mean distinct years so far among people present this year. Staff and
          student-leader cards count years in that role only.
        </Text>
        <View style={styles.cardGrid}>
          {avgYearsCards.map((card, idx) => (
            <FadeInView key={card.label} delay={stagger(idx)}>
              <MetricCard
                label={card.label}
                value={fmtAvg(card.value)}
                delta={card.delta}
                hint={card.hint}
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

  // ── All years: lifetime tenure cards + multi-year trend charts. ──
  const cardCols = width >= 640 ? 3 : 2;
  const cardWidth = (width - spacing.sm * (cardCols - 1)) / cardCols;
  // Hide lenses that never had anyone (don't show a misleading 0.0% / 0).
  const everOverall = trends.allStaff.some((n) => n > 0);
  const everStaff = trends.staff.some((n) => n > 0);
  const everLeaders = trends.studentLeaders.some((n) => n > 0);
  const life2 = trends.lifetimeTenure2Plus;
  const lifeAvg = trends.lifetimeAvgTenureYears;
  const lifetimeCards = [
    everOverall && life2
      ? {
          label: "Overall ≥2 years",
          value: fmtPct(life2.overall),
          hint: "ever served · so far",
        }
      : null,
    everStaff && life2
      ? {
          label: "Staff ≥2 years",
          value: fmtPct(life2.staff),
          hint: "years in this role",
        }
      : null,
    everLeaders && life2
      ? {
          label: "Student leaders ≥2 years",
          value: fmtPct(life2.studentLeaders),
          hint: "years in this role",
        }
      : null,
    everOverall && lifeAvg
      ? {
          label: "Overall avg years",
          value: fmtAvg(lifeAvg.overall),
          hint: "years served so far",
        }
      : null,
    everStaff && lifeAvg
      ? {
          label: "Staff avg years",
          value: fmtAvg(lifeAvg.staff),
          hint: "years in this role so far",
        }
      : null,
    everLeaders && lifeAvg
      ? {
          label: "Student leader avg years",
          value: fmtAvg(lifeAvg.studentLeaders),
          hint: "years in this role so far",
        }
      : null,
  ].filter((c): c is { label: string; value: string; hint: string } => c !== null);

  const rateLegend: LegendItem[] = [
    { key: "Overall", colour: t.text, label: "Overall" },
    { key: "Staff", colour: t.primary, label: "Staff" },
    { key: "SLs", colour: t.accent, label: "Student leaders" },
  ];

  return (
    <View onLayout={onLayout} style={styles.grid}>
      {/* Lifetime tenure cards are staff/signed-in only — public preview is
          trends-only (see Insights screen publicPreview contract). */}
      {!publicPreview && lifetimeCards.length > 0 ? (
        <>
          <Text style={[typography.headline, { color: t.text }]}>
            Tenure (staff profiles)
          </Text>
          <Text style={[typography.caption, { color: t.muted }]}>
            Of everyone who has ever held a staff profile in each group: share with
            two or more years, and mean years served so far. Staff and student-leader
            cards count years in that role (not total time at The Shed).
          </Text>
          <View style={styles.cardGrid}>
            {lifetimeCards.map((card, idx) => (
              <FadeInView key={card.label} delay={stagger(idx)}>
                <MetricCard
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  tone="positive"
                  width={cardWidth}
                />
              </FadeInView>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.cardGrid}>
      <FadeInView delay={stagger(0)}>
        <ChartCard
          title="All staff"
          subtitle={
            charts.trendStartYear && charts.trendEndYear
              ? `Staff + student leaders · ${charts.trendStartYear}–${charts.trendEndYear}`
              : "Staff + student leaders per year"
          }
          width={chartWidth}
          legendItems={[
            { key: "returning", colour: t.primary, label: "Staff" },
            { key: "fresh", colour: t.accent, label: "Student leaders" },
          ]}
          fullscreenContent={
            <StackedBarChart
              points={charts.staffBreakdown}
              labels={{ fresh: "SLs", returning: "Staff" }}
              tooltipLabel={(p) => String(p.at)}
              fullscreen
            />
          }
        >
          <StackedBarChart
            points={charts.staffBreakdown}
            labels={{ fresh: "Leaders", returning: "Staff" }}
            tooltipLabel={(p) => String(p.at)}
          />
        </ChartCard>
      </FadeInView>

      <FadeInView delay={stagger(1)}>
        <ChartCard
          title="Student leaders by campus"
          subtitle="Per staff year"
          width={chartWidth}
          legendItems={trends.campuses.map(
            (campus): LegendItem => ({
              key: campusAcronym(campus),
              colour: subgroupColour(campus),
              label: campusAcronym(campus),
            }),
          )}
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

      {charts.retentionByYear.length > 0 ? (
        <FadeInView delay={stagger(3)}>
          <ChartCard
            title="Retention rate"
            subtitle="% of prior year's roster who stayed (axis 0–100)"
            width={chartWidth}
            legendItems={rateLegend}
            fullscreenContent={
              <MultiStackedBarChart
                points={charts.retentionByYear}
                tooltipLabel={(p) => String(p.at)}
                stacked={false}
                axisMax={100}
                keepZeros
                fullscreen
              />
            }
          >
            <MultiStackedBarChart
              points={charts.retentionByYear}
              tooltipLabel={(p) => String(p.at)}
              stacked={false}
              axisMax={100}
              keepZeros
            />
          </ChartCard>
        </FadeInView>
      ) : null}

      {charts.tenure2PlusByYear.length > 0 ? (
        <FadeInView delay={stagger(4)}>
          <ChartCard
            title="Serve at least 2 years"
            subtitle="% of people present with ≥2 years so far (axis 0–100)"
            width={chartWidth}
            legendItems={rateLegend}
            fullscreenContent={
              <MultiStackedBarChart
                points={charts.tenure2PlusByYear}
                tooltipLabel={(p) => String(p.at)}
                stacked={false}
                axisMax={100}
                keepZeros
                fullscreen
              />
            }
          >
            <MultiStackedBarChart
              points={charts.tenure2PlusByYear}
              tooltipLabel={(p) => String(p.at)}
              stacked={false}
              axisMax={100}
              keepZeros
            />
          </ChartCard>
        </FadeInView>
      ) : null}

      {charts.avgTenureByYear.length > 0 ? (
        <FadeInView delay={stagger(5)}>
          <ChartCard
            title="Average years served so far"
            subtitle="Mean years so far among people present (staff/SL = in role)"
            width={chartWidth}
            legendItems={rateLegend}
            fullscreenContent={
              <MultiStackedBarChart
                points={charts.avgTenureByYear}
                tooltipLabel={(p) => String(p.at)}
                stacked={false}
                keepZeros
                fullscreen
              />
            }
          >
            <MultiStackedBarChart
              points={charts.avgTenureByYear}
              tooltipLabel={(p) => String(p.at)}
              stacked={false}
              keepZeros
            />
          </ChartCard>
        </FadeInView>
      ) : null}

      {campusWeekly ? (
        <FadeInView delay={stagger(6)}>
          <ChartCard
            title="Weekly meeting attendance"
            subtitle="Average per staff year (from 2025)"
            width={chartWidth}
            legendItems={campusAttendance!.campuses.map(
              (c): LegendItem => ({
                key: campusAcronym(c.campus),
                colour: subgroupColour(c.campus),
                label: campusAcronym(c.campus),
              }),
            )}
            fullscreenContent={
              // Averages are compared, not summed, so bar mode draws one bar
              // per campus side by side instead of stacking them into a
              // meaningless total.
              <MultiStackedBarChart
                points={campusWeekly}
                tooltipLabel={(p) => String(p.at)}
                stacked={false}
                fullscreen
              />
            }
          >
            <MultiStackedBarChart
              points={campusWeekly}
              tooltipLabel={(p) => String(p.at)}
              stacked={false}
            />
          </ChartCard>
        </FadeInView>
      ) : null}
      </View>

      <View style={{ height: spacing.xxl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
