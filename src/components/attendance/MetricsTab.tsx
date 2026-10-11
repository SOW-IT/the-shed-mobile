import { useQuery } from "convex/react";
import { useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { isOrgWideSubgroup, subgroupColour } from "../../../shared/rollcall";
import { type WeeklyBlock } from "../../../shared/weeklyInsightsView";
import { CampusMark } from "@/components/CampusMark";
import { InsightsBlocks } from "@/components/attendance/InsightsBlocks";
import { FadeInView, LoadingState, stagger } from "@/components/ui";
import { spacing, useAppTheme } from "@/theme";

const CAMPUS_MARK = 40;

// The layout comes from the server (see InsightsBlocks): `weeklyInsights.view`
// for a campus, passed in as `weeklyView`, and `attendanceMetrics.view` for SOW.
export function MetricsTab({
  subgroups,
  selectedSubgroup,
  onSelectedSubgroupChange,
  onOpenMember,
  onOpenPerson,
  rangeWeeks,
  includeCollaborative,
  weeklyView,
}: {
  subgroups: string[];
  selectedSubgroup: string | null;
  onSelectedSubgroupChange: (subgroup: string) => void;
  onOpenMember: (memberId: Id<"attendanceMembers">) => void;
  onOpenPerson: (personKey: string) => void;
  rangeWeeks: number;
  includeCollaborative: boolean;
  weeklyView: { period: string | null; blocks: WeeklyBlock[] } | null | undefined;
}) {
  const t = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const subgroup = selectedSubgroup ?? subgroups[0] ?? null;
  const [containerWidth, setContainerWidth] = useState(windowWidth);

  const orgWide = !!subgroup && isOrgWideSubgroup(subgroup);
  const sowView = useQuery(
    api.attendanceMetrics.view,
    subgroup && orgWide ? { subgroup, rangeWeeks, includeCollaborative } : "skip"
  );
  const view = orgWide ? sowView : weeklyView;

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
        <InsightsBlocks
          key={orgWide ? `${subgroup}-${rangeWeeks}-${includeCollaborative}` : `${subgroup}-${weeklyView?.period}`}
          blocks={view.blocks}
          width={containerWidth}
          onOpenMember={onOpenMember}
          onOpenPerson={onOpenPerson}
        />
      ) : null}
      <View style={{ height: 96 }} />
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
});
