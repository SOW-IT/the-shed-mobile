import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Id } from "../../../convex/_generated/dataModel";
import { type FollowUpPerson } from "../../../shared/attendanceMetrics";
import {
  type ViewBlock,
  type ViewLegendItem,
  type ViewPaint,
} from "../../../shared/attendanceMetricsView";
import { type WeeklyBlock } from "../../../shared/weeklyInsightsView";
import {
  BarChart,
  BreakdownBars,
  ChartCard,
  FollowUpRow,
  MetricCard,
  MultiStackedBarChart,
  StackedBarChart,
} from "@/components/attendance/MetricsCharts";
import { renderWeeklyBlock } from "@/components/attendance/WeeklyBlocks";
import { EmptyState, FadeInView, ReadableColumn, Sheet, stagger } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const timeAgo = (ms: number): string => {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const CHART_TYPES = new Set(["bars", "breakdown", "stacked", "multiBars"]);
const CHART_MIN_WIDTH = 440;

// Draws the blocks an Insights `view` query returns. The server decides what
// appears and in what order; this only knows how to draw each block type and
// skips any it doesn't know, so an older app never breaks on a newer server.
export function InsightsBlocks({
  blocks,
  width,
  onOpenMember,
  onOpenPerson,
  onEditMember,
}: {
  blocks: (ViewBlock | WeeklyBlock)[];
  width: number;
  onOpenMember?: (memberId: Id<"attendanceMembers">) => void;
  /** Campus weeklies rows open the person's page by their key. */
  onOpenPerson?: (personKey: string) => void;
  onEditMember?: (memberId: string) => void;
}) {
  const t = useAppTheme();
  const router = useRouter();
  const [info, setInfo] = useState<{ title: string; body: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const tokens: Record<string, string> = {
    text: t.text,
    primary: t.primary,
    accent: t.accent,
    success: t.success,
  };
  const paint = (c: ViewPaint): string => (c.startsWith("#") ? c : (tokens[c] ?? t.primary));
  const legend = (items: ViewLegendItem[]) => items.map((l) => ({ ...l, colour: paint(l.colour) }));

  const openPerson = (person: FollowUpPerson) => {
    if (person.key.startsWith("member:")) {
      onOpenMember?.(person.key.slice("member:".length) as Id<"attendanceMembers">);
    } else if (person.key.startsWith("staff:")) {
      router.push({
        pathname: "/person/[email]",
        params: { email: person.key.slice("staff:".length) },
      });
    }
  };

  const renderChart = (block: ViewBlock | WeeklyBlock, key: string, chartWidth: number): ReactNode => {
    switch (block.type) {
      case "bars": {
        const colour = paint(block.colour);
        return (
          <ChartCard
            key={key}
            title={block.title}
            width={chartWidth}
            fullscreenContent={<BarChart points={block.points} colour={colour} fullscreen />}
          >
            <BarChart points={block.points} colour={colour} />
          </ChartCard>
        );
      }
      case "breakdown":
        return (
          <ChartCard key={key} title={block.title} width={chartWidth}>
            <BreakdownBars wideLabels rows={block.rows} />
          </ChartCard>
        );
      case "stacked": {
        const tooltip = (p: { at: number }) => String(p.at);
        return (
          <ChartCard
            key={key}
            title={block.title}
            subtitle={block.subtitle}
            width={chartWidth}
            legendItems={legend(block.legend)}
            fullscreenContent={
              <StackedBarChart points={block.points} labels={block.labels} tooltipLabel={tooltip} fullscreen />
            }
          >
            <StackedBarChart points={block.points} labels={block.labels} tooltipLabel={tooltip} />
          </ChartCard>
        );
      }
      case "multiBars": {
        const points = block.points.map((p) => ({
          ...p,
          segments: p.segments.map((s) => ({ ...s, colour: paint(s.colour) })),
        }));
        const props = {
          points,
          tooltipLabel: (p: { at: number }) => String(p.at),
          stacked: block.stacked,
          axisMax: block.axisMax,
          keepZeros: block.keepZeros,
        };
        return (
          <ChartCard
            key={key}
            title={block.title}
            subtitle={block.subtitle}
            width={chartWidth}
            legendItems={legend(block.legend)}
            fullscreenContent={<MultiStackedBarChart {...props} fullscreen />}
          >
            <MultiStackedBarChart {...props} />
          </ChartCard>
        );
      }
      default:
        return null;
    }
  };

  const renderBlock = (block: ViewBlock | WeeklyBlock, key: string): ReactNode => {
    switch (block.type) {
      case "updated":
        return (
          <View key={key} style={styles.updated}>
            <Ionicons name="time-outline" size={14} color={t.faint} />
            <Text style={[typography.caption, { color: t.faint }]}>
              {`Updated ${timeAgo(block.computedAt)}`}
            </Text>
          </View>
        );
      case "label":
        return (
          <Text key={key} style={[typography.label, { color: t.muted }]}>
            {block.text}
          </Text>
        );
      case "heading":
        return (
          <Text key={key} style={[typography.headline, { color: t.text }]}>
            {block.text}
          </Text>
        );
      case "caption":
        return (
          <Text key={key} style={[typography.caption, { color: t.muted }]}>
            {block.text}
          </Text>
        );
      case "cards": {
        const grid = block.layout === "grid";
        const cols = grid ? (width >= 640 ? 3 : 2) : Math.max(1, block.cards.length);
        const cardWidth = (width - spacing.sm * (cols - 1)) / cols;
        return (
          <View key={key} style={[styles.cardRow, grid && styles.wrap]}>
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
      case "followUps": {
        const shown = showAll ? block.people : block.people.slice(0, block.preview);
        return (
          <ReadableColumn key={key} maxWidth={560}>
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
                  <Text style={[typography.caption, { color: t.muted }]}>{block.emptyText}</Text>
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
            key={key}
            icon={
              block.icon in Ionicons.glyphMap
                ? (block.icon as keyof typeof Ionicons.glyphMap)
                : "information-circle-outline"
            }
            title={block.title}
            message={block.message}
          />
        );
      default:
        return renderWeeklyBlock(block, key, { onOpenPerson, onEditMember, colours: t });
    }
  };

  // Consecutive charts share a responsive grid: as many columns as fit.
  const rendered: ReactNode[] = [];
  for (let i = 0; i < blocks.length; ) {
    if (!CHART_TYPES.has(blocks[i].type)) {
      rendered.push(renderBlock(blocks[i], `b${i}`));
      i += 1;
      continue;
    }
    const start = i;
    while (i < blocks.length && CHART_TYPES.has(blocks[i].type)) i += 1;
    const group = blocks.slice(start, i);
    const cols = Math.max(1, Math.min(group.length, Math.floor(width / CHART_MIN_WIDTH)));
    const chartWidth = cols > 1 ? (width - spacing.sm * (cols - 1)) / cols : width;
    rendered.push(
      <View key={`g${start}`} style={[styles.cardRow, styles.wrap]}>
        {group.map((block, j) => (
          <FadeInView key={j} delay={stagger(j)}>
            {renderChart(block, `c${start + j}`, chartWidth)}
          </FadeInView>
        ))}
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {rendered}
      <Sheet visible={info !== null} onClose={() => setInfo(null)} title={info?.title}>
        <Text style={[typography.body, { color: t.text }]}>{info?.body}</Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  updated: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },
  cardRow: { flexDirection: "row", gap: spacing.sm },
  wrap: { flexWrap: "wrap" },
  followCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  followHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  followEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  followMore: { alignSelf: "center", paddingVertical: spacing.sm },
});
