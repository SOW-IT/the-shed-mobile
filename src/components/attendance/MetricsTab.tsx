import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
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
import { type FollowUpPerson } from "../../../shared/attendanceMetrics";
import { type ViewBlock } from "../../../shared/attendanceMetricsView";
import { isOrgWideSubgroup, subgroupColour } from "../../../shared/rollcall";
import { CampusMark } from "@/components/CampusMark";
import {
  BarChart,
  BreakdownBars,
  ChartCard,
  FollowUpRow,
  MetricCard,
} from "@/components/attendance/MetricsCharts";
import {
  EmptyState,
  FadeInView,
  LoadingState,
  ReadableColumn,
  Sheet,
  stagger,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const CAMPUS_MARK = 40;

const timeAgo = (ms: number): string => {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

// The layout comes from `attendanceMetrics.view`; this file only draws each
// block type, so the tab can change with a Convex deploy. Unknown block types
// are skipped so an older app never breaks on a newer server.
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
  rangeWeeks: number;
  includeCollaborative: boolean;
}) {
  const t = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const subgroup = selectedSubgroup ?? subgroups[0] ?? null;
  const [containerWidth, setContainerWidth] = useState(windowWidth);

  const view = useQuery(
    api.attendanceMetrics.view,
    subgroup ? { subgroup, rangeWeeks, includeCollaborative } : "skip"
  );

  const onLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={{ gap: spacing.md }}>
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
                  accessibilityLabel={sg}
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

      {subgroup && view === undefined ? (
        <LoadingState />
      ) : view ? (
        <MetricsBlocks
          key={`${subgroup}-${rangeWeeks}-${includeCollaborative}`}
          blocks={view.blocks}
          width={containerWidth}
          onOpenMember={onOpenMember}
        />
      ) : null}
      <View style={{ height: 96 }} />
    </View>
  );
}

function MetricsBlocks({
  blocks,
  width,
  onOpenMember,
}: {
  blocks: ViewBlock[];
  width: number;
  onOpenMember: (memberId: Id<"attendanceMembers">) => void;
}) {
  const t = useAppTheme();
  const router = useRouter();
  const [info, setInfo] = useState<{ title: string; body: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const openPerson = (person: FollowUpPerson) => {
    if (person.key.startsWith("member:")) {
      onOpenMember(person.key.slice("member:".length) as Id<"attendanceMembers">);
    } else if (person.key.startsWith("staff:")) {
      router.push({
        pathname: "/person/[email]",
        params: { email: person.key.slice("staff:".length) },
      });
    }
  };

  const colours = { primary: t.primary, success: t.success, accent: t.accent };

  const render = (block: ViewBlock, i: number) => {
    switch (block.type) {
      case "updated":
        return (
          <View key={i} style={styles.updated}>
            <Ionicons name="time-outline" size={14} color={t.faint} />
            <Text style={[typography.caption, { color: t.faint }]}>
              {`Updated ${timeAgo(block.computedAt)}`}
            </Text>
          </View>
        );
      case "label":
        return (
          <Text key={i} style={[typography.label, { color: t.muted }]}>
            {block.text}
          </Text>
        );
      case "cards": {
        const cardWidth =
          (width - spacing.sm * (block.cards.length - 1)) / Math.max(1, block.cards.length);
        return (
          <View key={i} style={styles.cardRow}>
            {block.cards.map((card, j) => (
              <FadeInView key={card.label} delay={stagger(j)}>
                <MetricCard
                  label={card.label}
                  value={card.value}
                  delta={card.delta}
                  hint={card.hint}
                  tone={card.tone ?? "default"}
                  width={cardWidth}
                  labelLines={2}
                  onPress={card.info ? () => setInfo(card.info ?? null) : undefined}
                />
              </FadeInView>
            ))}
          </View>
        );
      }
      case "bars": {
        const colour = colours[block.colour] ?? t.primary;
        return (
          <ChartCard
            key={i}
            title={block.title}
            width={width}
            fullscreenContent={<BarChart points={block.points} colour={colour} fullscreen />}
          >
            <BarChart points={block.points} colour={colour} />
          </ChartCard>
        );
      }
      case "breakdown":
        return (
          <ChartCard key={i} title={block.title} width={width}>
            <BreakdownBars wideLabels rows={block.rows} />
          </ChartCard>
        );
      case "followUps": {
        const shown = showAll ? block.people : block.people.slice(0, block.preview);
        return (
          <ReadableColumn key={i} maxWidth={560}>
            <View style={[styles.followCard, { backgroundColor: t.card }, t.shadowCard]}>
              <View style={styles.followHeader}>
                <Ionicons name="heart-outline" size={18} color={t.primary} />
                <Text style={[typography.headline, { color: t.text, flex: 1 }]}>
                  {block.title}
                </Text>
                <Text style={[typography.caption, { color: t.muted }]}>{block.total}</Text>
              </View>
              {block.people.length === 0 ? (
                <View style={styles.followEmpty}>
                  <Ionicons name="checkmark-circle-outline" size={22} color={t.success} />
                  <Text style={[typography.caption, { color: t.muted }]}>
                    {block.emptyText}
                  </Text>
                </View>
              ) : (
                shown.map((person) => (
                  <FollowUpRow key={person.key} person={person} onOpen={openPerson} />
                ))
              )}
              {block.people.length > block.preview ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowAll((v) => !v)}
                  style={({ pressed }) => [styles.followMore, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
                    {showAll
                      ? "Show fewer"
                      : block.total > block.people.length
                        ? `Show top ${block.people.length}`
                        : `Show all ${block.people.length}`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ReadableColumn>
        );
      }
      case "empty":
        return (
          <EmptyState
            key={i}
            icon={block.icon as keyof typeof Ionicons.glyphMap}
            title={block.title}
            message={block.message}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      {blocks.map(render)}
      <Sheet visible={info !== null} onClose={() => setInfo(null)} title={info?.title}>
        <Text style={[typography.body, { color: t.text }]}>{info?.body}</Text>
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
  updated: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },
  cardRow: {
    flexDirection: "row",
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
  followMore: { alignSelf: "center", paddingVertical: spacing.sm },
});
