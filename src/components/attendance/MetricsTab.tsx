/**
 * Attendance → Insights. A leader-facing dashboard of pre-computed attendance
 * metrics for the selected sub-group and time range: summary cards, lightweight
 * native trend charts, and a gentle "Needs follow-up" list. Reads a snapshot
 * (convex/attendanceMetrics.ts) so it never scans history on-device; snapshots
 * are kept fresh server-side (weekly cron + dirty-recompute on roll-call).
 *
 * Definitions/thresholds live in shared/attendanceMetrics.ts; see
 * docs/attendance-metrics.md.
 */
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  RANGE_WEEKS,
  type FollowUpPerson,
} from "../../../shared/attendanceMetrics";
import { isOrgWideSubgroup, subgroupColour } from "../../../shared/rollcall";
import { CampusMark } from "@/components/CampusMark";
import {
  BarChart,
  BreakdownBars,
  ChartCard,
  FollowUpRow,
  LegendDot,
  MetricCard,
  StackedBarChart,
} from "@/components/attendance/MetricsCharts";
import {
  EmptyState,
  FadeInView,
  LoadingState,
  Sheet,
  stagger,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const CAMPUS_MARK = 40;
const FOLLOW_UP_SHOWN = 25;

type RangeOption = { label: string; weeks: number };
const RANGE_OPTIONS: RangeOption[] = RANGE_WEEKS.map((w) => ({
  label: w === 1 ? "1 wk" : `${w} wks`,
  weeks: w,
}));

const timeAgo = (ms: number): string => {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

/** Plain-language explanation shown when a summary tile is tapped. */
type TileDetail = { title: string; body: string };

type SummaryCard = {
  label: string;
  value: string;
  delta?: { text: string; direction: "up" | "down" | "flat" } | null;
  hint?: string;
  tone?: "default" | "positive" | "attention";
  detail: TileDetail;
};

export function MetricsTab({
  subgroups,
  selectedSubgroup,
  onSelectedSubgroupChange,
  onOpenMember,
  rangeWeeks,
  includeCollaborative,
}: {
  subgroups: string[];
  selectedSubgroup: string | null;
  onSelectedSubgroupChange: (subgroup: string) => void;
  onOpenMember: (memberId: Id<"attendanceMembers">) => void;
  // Owned by the Insights screen and driven by the bottom-right range selector.
  rangeWeeks: number;
  includeCollaborative: boolean;
}) {
  const t = useAppTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const subgroup = selectedSubgroup ?? subgroups[0] ?? null;

  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const [detail, setDetail] = useState<TileDetail | null>(null);

  const snapshot = useQuery(
    api.attendanceMetrics.snapshot,
    subgroup ? { subgroup, rangeWeeks, includeCollaborative } : "skip"
  );

  // Org-wide (SOW) view: show average weekly attendance per campus (drawn from
  // each campus's own snapshot) and drop the follow-up list, which is a
  // per-campus pastoral tool rather than an org-wide one.
  const orgWide = subgroup ? isOrgWideSubgroup(subgroup) : false;
  const campusWeekly = useQuery(
    api.attendanceMetrics.campusWeeklyAverages,
    orgWide ? { rangeWeeks, includeCollaborative } : "skip"
  );

  const wide = containerWidth >= 640;
  const onLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);
  const rangeText =
    RANGE_OPTIONS.find((o) => o.weeks === rangeWeeks)?.label ?? `${rangeWeeks} wks`;

  // Responsive grids: more columns on a big screen, comfortable on mobile.
  const cardCols = wide ? 3 : 2;
  const cardWidth =
    (containerWidth - spacing.sm * (cardCols - 1)) / cardCols;
  const chartCols = wide ? 2 : 1;
  const chartWidth =
    (containerWidth - spacing.sm * (chartCols - 1)) / chartCols;

  const openPerson = (person: FollowUpPerson) => {
    if (person.key.startsWith("member:")) {
      const raw = person.key.slice("member:".length);
      onOpenMember(raw as Id<"attendanceMembers">);
    } else if (person.key.startsWith("staff:")) {
      router.push({
        pathname: "/person/[email]",
        params: { email: person.key.slice("staff:".length) },
      });
    }
  };

  const data = snapshot?.data;
  const summaryCards = useMemo<SummaryCard[]>(() => {
    if (!data) return [];
    const s = data.summary;
    const deltaFor = (pct: number | null) =>
      pct === null
        ? null
        : {
            text: `${pct > 0 ? "+" : ""}${pct}%`,
            direction:
              pct > 0 ? ("up" as const) : pct < 0 ? ("down" as const) : ("flat" as const),
          };

    const weeklyCard: SummaryCard = {
      label: "Avg / weekly mtg",
      value: s.avgWeeklyAttendance === null ? "—" : `${s.avgWeeklyAttendance}`,
      delta: deltaFor(s.weeklyChangePct),
      hint:
        s.avgWeeklyAttendancePrev !== null
          ? `vs ${s.avgWeeklyAttendancePrev} prev`
          : "no baseline yet",
      detail: {
        title: "Average weekly meeting attendance",
        body: "The average number of people at each weekly meeting in the selected range — counting only events tagged “Weekly Meeting”, so make-up or one-off events don't dilute it. The arrow compares this to the previous period of the same length. This is the headline for groups that gather weekly; “—” means no weekly meetings fell in the range.",
      },
    };
    const eventCard: SummaryCard = {
      label: "Avg / event",
      value: `${s.avgAttendance}`,
      delta: deltaFor(s.changePct),
      hint:
        s.avgAttendancePrev !== null ? `vs ${s.avgAttendancePrev} prev` : "no baseline yet",
      detail: {
        title: "Average attendance per event",
        body: "The average turnout across every event in the range (weekly meetings plus any other gatherings), compared to the previous period of the same length. Include or exclude multi-campus (collaborative) events with the toggle above.",
      },
    };

    return [
      ...(data.hasWeeklyMeetings ? [weeklyCard] : []),
      eventCard,
      {
        label: "Events held",
        value: `${s.eventsHeld}`,
        detail: {
          title: "Events held",
          body: "How many events this sub-group held within the selected range. Collaborative (multi-campus) events are included only when the toggle above is on.",
        },
      },
      {
        label: "Unique attendees",
        value: `${s.uniqueAttendees}`,
        detail: {
          title: "Unique attendees",
          body: "The number of distinct people who attended at least one event in the range. Someone who came to five events counts once.",
        },
      },
      {
        label: "Newcomers",
        value: `${s.newcomers}`,
        tone: "positive" as const,
        detail: {
          title: "Newcomers",
          body: "People attending for the first time ever — their first recorded attendance (across all loaded history) falls within roughly the last 30 days, or the selected range if it is shorter. Deliberately anchored to “recently new” rather than the whole range, so a long range doesn't count everyone who joined months ago.",
        },
      },
      {
        label: "Follow-up suggested",
        value: `${s.followUpCount}`,
        tone: "attention" as const,
        detail: {
          title: "Follow-up suggested",
          body: "People whose recent attendance suggests a gentle check-in: at-risk regulars, those who've lapsed, people attending less than before, newcomers who haven't returned, and the recently re-engaged. “Recent” follows the range you pick, so this number moves with the 4/8/12-week and staff-year selector. The full breakdown is in the “Needs follow-up” list below.",
        },
      },
      {
        label: "Weekly consistency",
        value:
          s.weeklyConsistency === null
            ? "—"
            : `${Math.round(s.weeklyConsistency * 100)}%`,
        detail: {
          title: "Weekly consistency",
          body: "How steady weekly-meeting turnout is over the range — average weekly attendance divided by the best week. 100% means every week matched the peak; a lower figure means turnout swings more. “—” when there were no weekly meetings in the range.",
        },
      },
    ];
  }, [data]);

  return (
    <View onLayout={onLayout} style={{ gap: spacing.md }}>
      {/* Sub-group picker — mirrors the Events tab's campus row. */}
      {subgroups.length > 0 ? (
        <View style={styles.campusRow}>
          {subgroups.map((sg, i) => {
            const active = sg === subgroup;
            const ringColour =
              isOrgWideSubgroup(sg) && t.dark ? t.text : subgroupColour(sg);
            return (
              <FadeInView key={sg} delay={stagger(i)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelectedSubgroupChange(sg)}
                  style={({ pressed }) => [styles.campusSlot, pressed && { opacity: 0.7 }]}
                >
                  <View
                    style={[styles.campusRing, active && { borderColor: ringColour }]}
                  >
                    <CampusMark campus={sg} variant="circle" circleDiameter={CAMPUS_MARK} />
                  </View>
                </Pressable>
              </FadeInView>
            );
          })}
        </View>
      ) : null}

      {/* The time range + collaborative toggle now live in the bottom-right
          selector (AttendanceRangeFab); this line just reflects the current
          selection and when the snapshot was last refreshed. */}
      <View style={styles.metaRow}>
        <Text style={[typography.caption, { color: t.muted }]}>
          {`Last ${rangeText}${includeCollaborative ? " · incl. collaborative" : ""}`}
        </Text>
        {snapshot ? (
          <View style={styles.refresh}>
            <Ionicons name="time-outline" size={14} color={t.faint} />
            <Text style={[typography.caption, { color: t.faint }]}>
              {`Updated ${timeAgo(snapshot.computedAt)}`}
            </Text>
          </View>
        ) : null}
      </View>

      {/* States. */}
      {subgroup && snapshot === undefined ? (
        <LoadingState />
      ) : snapshot === null ? (
        <EmptyState
          icon="sparkles-outline"
          title="Insights aren't ready yet"
          message="Attendance insights are prepared automatically and refresh within minutes of roll-call changes. Check back shortly."
        />
      ) : data && !data.hasEnoughHistory ? (
        <EmptyState
          icon="calendar-outline"
          title="No events in this range"
          message="Nothing recorded for this group in this range yet — try a longer range, or include collaborative events to widen the view."
        />
      ) : data ? (
        <>
          {/* Summary cards — tap any tile for a plain-language explanation. */}
          <View style={styles.cardGrid}>
            {summaryCards.map((card, i) => (
              <FadeInView key={card.label} delay={stagger(i)}>
                <MetricCard
                  label={card.label}
                  value={card.value}
                  delta={card.delta}
                  hint={card.hint}
                  tone={card.tone ?? "default"}
                  width={cardWidth}
                  onPress={() => setDetail(card.detail)}
                />
              </FadeInView>
            ))}
          </View>

          {/* Trend charts. For weekly-meeting groups the weekly lens leads:
              weekly trend, then new-vs-returning (measured at weekly meetings),
              then the all-event charts. Other groups keep the per-event order. */}
          <View style={styles.chartGrid}>
            {(() => {
              const weekly = data.hasWeeklyMeetings;
              const weeklyTrendChart =
                data.weeklyTrend.length > 0 ? (
                  <ChartCard
                    key="weeklyTrend"
                    title="Weekly meeting trend"
                    subtitle="Turnout at weekly meetings"
                    width={chartWidth}
                    fullscreenContent={<BarChart points={data.weeklyTrend} colour={t.success} fullscreen />}
                  >
                    <BarChart points={data.weeklyTrend} colour={t.success} />
                  </ChartCard>
                ) : null;
              const newVsReturningChart = (
                <ChartCard
                  key="newVsReturning"
                  title="New vs returning"
                  subtitle={weekly ? "At weekly meetings" : undefined}
                  width={chartWidth}
                  legend={
                    <View style={{ gap: 4 }}>
                      <LegendDot colour={t.accent} label="New" />
                      <LegendDot colour={t.primary} label="Returning" />
                    </View>
                  }
                  fullscreenContent={<StackedBarChart points={data.newVsReturning} fullscreen />}
                >
                  <StackedBarChart points={data.newVsReturning} />
                </ChartCard>
              );
              const attendanceChart = (
                <ChartCard
                  key="attendance"
                  title="Attendance over time"
                  subtitle="Per event"
                  width={chartWidth}
                  fullscreenContent={<BarChart points={data.attendanceByEvent} colour={t.primary} fullscreen />}
                >
                  <BarChart points={data.attendanceByEvent} colour={t.primary} />
                </ChartCard>
              );
              const rollingChart = (
                <ChartCard
                  key="rolling"
                  title="Rolling average"
                  subtitle="Smoothed across recent events"
                  width={chartWidth}
                  fullscreenContent={<BarChart points={data.rollingAverage} colour={t.accent} fullscreen />}
                >
                  <BarChart points={data.rollingAverage} colour={t.accent} />
                </ChartCard>
              );
              const monthChart = (
                <ChartCard
                  key="month"
                  title="Unique attendees by month"
                  width={chartWidth}
                  fullscreenContent={<BarChart points={data.uniqueByMonth} colour={t.primary} fullscreen />}
                >
                  <BarChart points={data.uniqueByMonth} colour={t.primary} />
                </ChartCard>
              );
              const breakdownCharts = data.breakdowns.map((b) => (
                <ChartCard key={`bd-${b.field}`} title={`By ${b.field}`} width={chartWidth}>
                  <BreakdownBars rows={b.rows} />
                </ChartCard>
              ));
              // Org-wide only: average weekly-meeting turnout for each campus,
              // leading the chart list so it's the first thing SOW leaders see.
              const campusWeeklyChart =
                orgWide && campusWeekly && campusWeekly.length > 0 ? (
                  <ChartCard
                    key="campusWeekly"
                    title="Avg weekly attendance by campus"
                    subtitle="Each campus's weekly meetings"
                    width={chartWidth}
                  >
                    <BreakdownBars
                      rows={campusWeekly.map((c) => ({
                        label: c.campus,
                        value: c.avgWeekly,
                      }))}
                    />
                  </ChartCard>
                ) : null;
              const ordered = weekly
                ? [
                    campusWeeklyChart,
                    weeklyTrendChart,
                    newVsReturningChart,
                    attendanceChart,
                    rollingChart,
                    monthChart,
                    ...breakdownCharts,
                  ]
                : [
                    campusWeeklyChart,
                    attendanceChart,
                    rollingChart,
                    weeklyTrendChart,
                    monthChart,
                    newVsReturningChart,
                    ...breakdownCharts,
                  ];
              return ordered.filter(Boolean);
            })()}
          </View>

          {/* Needs follow-up — a per-campus pastoral tool, hidden org-wide. */}
          {orgWide ? null : (
          <View style={[styles.followCard, { backgroundColor: t.card }, t.shadowCard]}>
            <View style={styles.followHeader}>
              <Ionicons name="heart-outline" size={18} color={t.primary} />
              <Text style={[typography.headline, { color: t.text, flex: 1 }]}>
                Needs follow-up
              </Text>
              <Text style={[typography.caption, { color: t.muted }]}>
                {data.followUps.length}
              </Text>
            </View>
            <Text style={[typography.caption, { color: t.muted }]}>
              A gentle prompt — people whose recent attendance suggests a caring
              check-in. No judgement implied.
            </Text>
            {data.followUps.length === 0 ? (
              <View style={styles.followEmpty}>
                <Ionicons name="checkmark-circle-outline" size={22} color={t.success} />
                <Text style={[typography.caption, { color: t.muted }]}>
                  Nobody needs following up right now — lovely.
                </Text>
              </View>
            ) : (
              data.followUps.slice(0, FOLLOW_UP_SHOWN).map((person) => (
                <FollowUpRow key={person.key} person={person} onOpen={openPerson} />
              ))
            )}
            {data.followUps.length > FOLLOW_UP_SHOWN ? (
              <Text style={[typography.caption, styles.followMore, { color: t.faint }]}>
                Showing the {FOLLOW_UP_SHOWN} most pressing of {data.followUps.length}.
              </Text>
            ) : null}
          </View>
          )}

          <View style={{ height: spacing.xxl }} />
        </>
      ) : null}

      {/* Tap-a-tile detail: what the metric means and how it's worked out. */}
      <Sheet visible={detail !== null} onClose={() => setDetail(null)} title={detail?.title}>
        <Text style={[typography.body, { color: t.text }]}>{detail?.body}</Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  campusRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
  },
  campusSlot: { flex: 1, alignItems: "center", minWidth: 0 },
  campusRing: {
    borderRadius: 999,
    padding: 0,
    borderWidth: 2.5,
    borderColor: "transparent",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  refresh: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chartGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  followCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  followHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  followEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  followMore: { textAlign: "center", marginTop: spacing.sm },
});
