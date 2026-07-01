/**
 * Attendance → Insights. A leader-facing dashboard of pre-computed attendance
 * metrics for the selected sub-group and time range: summary cards, lightweight
 * native trend charts, and a gentle "Needs follow-up" list. Reads a weekly
 * snapshot (convex/attendanceMetrics.ts) so it never scans history on-device;
 * a Refresh affordance lets campus leaders rebuild it on demand.
 *
 * Definitions/thresholds live in shared/attendanceMetrics.ts; see
 * docs/attendance-metrics.md.
 */
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
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
  STAFF_YEAR_RANGE,
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
  Toast,
  type ToastState,
  stagger,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const CAMPUS_MARK = 40;
const FOLLOW_UP_SHOWN = 25;

type RangeOption = { label: string; weeks: number };
const RANGE_OPTIONS: RangeOption[] = [
  ...RANGE_WEEKS.map((w) => ({ label: `${w} wks`, weeks: w })),
  { label: "Staff year", weeks: STAFF_YEAR_RANGE },
];

const timeAgo = (ms: number): string => {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export function MetricsTab({
  subgroups,
  selectedSubgroup,
  onSelectedSubgroupChange,
  onOpenMember,
}: {
  year: number;
  subgroups: string[];
  selectedSubgroup: string | null;
  onSelectedSubgroupChange: (subgroup: string) => void;
  onOpenMember: (memberId: Id<"attendanceMembers">) => void;
}) {
  const t = useAppTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const subgroup = selectedSubgroup ?? subgroups[0] ?? null;

  const [rangeWeeks, setRangeWeeks] = useState<number>(8);
  const [includeCollaborative, setIncludeCollaborative] = useState(true);
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const [toast, setToast] = useState<ToastState>(null);
  const [refreshing, setRefreshing] = useState(false);

  const recompute = useMutation(api.attendanceMetrics.recomputeNow);
  const snapshot = useQuery(
    api.attendanceMetrics.snapshot,
    subgroup ? { subgroup, rangeWeeks, includeCollaborative } : "skip"
  );

  const wide = containerWidth >= 640;
  const onLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);

  // Responsive grids: more columns on a big screen, comfortable on mobile.
  const cardCols = wide ? 3 : 2;
  const cardWidth =
    (containerWidth - spacing.sm * (cardCols - 1)) / cardCols;
  const chartCols = wide ? 2 : 1;
  const chartWidth =
    (containerWidth - spacing.sm * (chartCols - 1)) / chartCols;

  const onRefresh = async () => {
    if (!subgroup) return;
    setRefreshing(true);
    try {
      await recompute({ subgroup });
      setToast({ text: "Refreshing insights — check back shortly" });
    } catch (err) {
      // Surface the backend's own message (e.g. the attendance-manager gate,
      // which allows admins OR campus leaders) rather than a hard-coded — and
      // possibly wrong — line; fall back to a generic notice for other failures.
      const message =
        err instanceof ConvexError && typeof err.data === "string"
          ? err.data
          : "Couldn't refresh insights — please try again.";
      setToast({ text: message });
    } finally {
      setRefreshing(false);
    }
  };

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
  const summaryCards = useMemo(() => {
    if (!data) return [];
    const s = data.summary;
    const changeDelta =
      s.changePct === null
        ? null
        : {
            text: `${s.changePct > 0 ? "+" : ""}${s.changePct}%`,
            direction:
              s.changePct > 0 ? ("up" as const) : s.changePct < 0 ? ("down" as const) : ("flat" as const),
          };
    return [
      {
        label: "Avg / event",
        value: `${s.avgAttendance}`,
        delta: changeDelta,
        hint:
          s.avgAttendancePrev !== null ? `vs ${s.avgAttendancePrev} prev` : "no baseline yet",
      },
      { label: "Events held", value: `${s.eventsHeld}` },
      { label: "Unique attendees", value: `${s.uniqueAttendees}` },
      { label: "Newcomers", value: `${s.newcomers}`, tone: "positive" as const },
      {
        label: "Follow-up suggested",
        value: `${s.followUpCount}`,
        tone: "attention" as const,
      },
      {
        label: "Weekly consistency",
        value:
          s.weeklyConsistency === null
            ? "—"
            : `${Math.round(s.weeklyConsistency * 100)}%`,
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

      {/* Filters: time range + collaborative toggle + refresh. */}
      <View style={styles.filterBar}>
        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((opt) => {
            const active = opt.weeks === rangeWeeks;
            return (
              <Pressable
                key={opt.weeks}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setRangeWeeks(opt.weeks)}
                style={[
                  styles.rangePill,
                  {
                    backgroundColor: active ? t.primary : t.ghost,
                    borderColor: active ? t.primary : t.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rangePillText,
                    { color: active ? t.onPrimary : t.ghostText },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: includeCollaborative }}
            onPress={() => setIncludeCollaborative((v) => !v)}
            style={styles.toggle}
          >
            <Ionicons
              name={includeCollaborative ? "checkbox" : "square-outline"}
              size={18}
              color={includeCollaborative ? t.primary : t.muted}
            />
            <Text style={[typography.caption, { color: t.muted }]}>
              Collaborative events
            </Text>
          </Pressable>
          {snapshot ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh insights"
              onPress={onRefresh}
              disabled={refreshing}
              style={({ pressed }) => [styles.refresh, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="refresh" size={15} color={t.primary} />
              <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
                {refreshing ? "…" : `Updated ${timeAgo(snapshot.computedAt)}`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* States. */}
      {subgroup && snapshot === undefined ? (
        <LoadingState />
      ) : snapshot === null ? (
        <EmptyState
          icon="sparkles-outline"
          title="Insights aren't ready yet"
          message="Attendance insights are prepared automatically each week. Tap “Refresh” below to build them now."
        />
      ) : data && !data.hasEnoughHistory ? (
        <EmptyState
          icon="hourglass-outline"
          title="Not enough history yet"
          message="Run a few more events for this group and insights will appear here — trends need a handful of events to be meaningful."
        />
      ) : data && data.summary.eventsHeld === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="No events in this range"
          message="Try a longer time range, or include collaborative events to widen the view."
        />
      ) : data ? (
        <>
          {/* Summary cards. */}
          <View style={styles.cardGrid}>
            {summaryCards.map((card, i) => (
              <FadeInView key={card.label} delay={stagger(i)}>
                <MetricCard
                  label={card.label}
                  value={card.value}
                  delta={"delta" in card ? card.delta : undefined}
                  hint={"hint" in card ? card.hint : undefined}
                  tone={"tone" in card ? card.tone : "default"}
                  width={cardWidth}
                />
              </FadeInView>
            ))}
          </View>

          {/* Trend charts. */}
          <View style={styles.chartGrid}>
            <ChartCard title="Attendance over time" subtitle="Per event" width={chartWidth}>
              <BarChart points={data.attendanceByEvent} colour={t.primary} />
            </ChartCard>
            <ChartCard
              title="Rolling average"
              subtitle="Smoothed across recent events"
              width={chartWidth}
            >
              <BarChart points={data.rollingAverage} colour={t.accent} />
            </ChartCard>
            {data.weeklyTrend.length > 0 ? (
              <ChartCard
                title="Weekly meeting trend"
                subtitle="Turnout at weekly meetings"
                width={chartWidth}
              >
                <BarChart points={data.weeklyTrend} colour={t.success} />
              </ChartCard>
            ) : null}
            <ChartCard
              title="Unique attendees by month"
              width={chartWidth}
            >
              <BarChart points={data.uniqueByMonth} colour={t.primary} />
            </ChartCard>
            <ChartCard
              title="New vs returning"
              width={chartWidth}
              legend={
                <View style={{ gap: 4 }}>
                  <LegendDot colour={t.accent} label="New" />
                  <LegendDot colour={t.primary} label="Returning" />
                </View>
              }
            >
              <StackedBarChart points={data.newVsReturning} />
            </ChartCard>
            {data.breakdowns.map((b) => (
              <ChartCard key={b.field} title={`By ${b.field}`} width={chartWidth}>
                <BreakdownBars rows={b.rows} />
              </ChartCard>
            ))}
          </View>

          {/* Needs follow-up. */}
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

          <View style={{ height: spacing.xxl }} />
        </>
      ) : null}

      <Toast toast={toast} />
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
  filterBar: { gap: spacing.sm },
  rangeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rangePill: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  rangePillText: { fontSize: 12.5, fontWeight: "700" },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  toggle: { flexDirection: "row", alignItems: "center", gap: 6 },
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
