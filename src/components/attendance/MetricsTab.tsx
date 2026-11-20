import { useQuery } from "convex/react";
import { useState } from "react";
import {
  LayoutChangeEvent,
  useWindowDimensions,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { isOrgWideSubgroup } from "../../../shared/rollcall";
import { type WeeklyBlock } from "../../../shared/weeklyInsightsView";
import { CampusSelector } from "@/components/attendance/CampusSelector";
import { InsightsBlocks } from "@/components/attendance/InsightsBlocks";
import { LoadingState, Segmented } from "@/components/ui";
import { spacing } from "@/theme";

type SowTabChoice = { key: string; label: string; picker: "range" | "years" };

export function MetricsTab({
  subgroups,
  selectedSubgroup,
  onSelectedSubgroupChange,
  onOpenMember,
  onOpenPerson,
  rangeWeeks,
  includeCollaborative,
  weeklyView,
  sowTabs,
  sowTab,
  onSowTabChange,
  sowTabView,
  onSowYearChange,
}: {
  subgroups: string[];
  selectedSubgroup: string | null;
  onSelectedSubgroupChange: (subgroup: string) => void;
  onOpenMember: (memberId: Id<"attendanceMembers">) => void;
  onOpenPerson: (personKey: string, subgroup?: string) => void;
  rangeWeeks: number;
  includeCollaborative: boolean;
  weeklyView: { period: string | null; blocks: WeeklyBlock[] } | null | undefined;
  sowTabs?: SowTabChoice[] | null;
  sowTab?: SowTabChoice | null;
  onSowTabChange?: (key: string) => void;
  sowTabView?: { year: number; blocks: WeeklyBlock[] } | null;
  onSowYearChange?: (year: number) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const subgroup = selectedSubgroup ?? subgroups[0] ?? null;
  const [containerWidth, setContainerWidth] = useState(windowWidth);

  const orgWide = !!subgroup && isOrgWideSubgroup(subgroup);
  const usesRange = !sowTab || sowTab.picker === "range";
  const sowView = useQuery(
    api.attendanceMetrics.view,
    subgroup && orgWide && usesRange ? { subgroup, rangeWeeks, includeCollaborative } : "skip"
  );
  const view = !orgWide ? weeklyView : usesRange ? sowView : sowTabView;
  const viewKey = !orgWide
    ? `${subgroup}-${weeklyView?.period}`
    : usesRange
      ? `${subgroup}-${rangeWeeks}-${includeCollaborative}`
      : `${subgroup}-${sowTab?.key}-${sowTabView?.year}`;

  const onLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={{ gap: spacing.md }}>
      {subgroups.length > 0 ? (
        <CampusSelector
          subgroups={subgroups}
          selected={subgroup}
          onSelect={onSelectedSubgroupChange}
          labelOf={(sg) => sg}
        />
      ) : null}

      {orgWide && sowTabs && sowTabs.length > 1 && onSowTabChange ? (
        <Segmented
          segments={sowTabs}
          active={sowTab?.key ?? sowTabs[0].key}
          onChange={onSowTabChange}
        />
      ) : null}

      {subgroup && view === undefined ? (
        <LoadingState />
      ) : view ? (
        <InsightsBlocks
          key={viewKey}
          blocks={view.blocks}
          width={containerWidth}
          onOpenMember={onOpenMember}
          onOpenPerson={onOpenPerson}
          onPickPeriod={onSowYearChange ? (period) => onSowYearChange(Number(period)) : undefined}
        />
      ) : null}
      <View style={{ height: 96 }} />
    </View>
  );
}
