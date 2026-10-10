import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { staffYearForDate, sydneyCalendarYear } from "@shared/flow";
import { subgroupLabel } from "@shared/rollcall";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import { InsightsBlocks } from "@/components/attendance/InsightsBlocks";
import { EmptyState, LoadingState, Screen } from "@/components/ui";

/**
 * One person's attendance: their category and weeklies at the campus they
 * were opened from, their details, and every event they've signed in to. The
 * server lays the page out (`weeklyInsights.member`).
 */
export default function MemberInsightsScreen() {
  const { key, subgroup } = useLocalSearchParams<{ key: string; subgroup?: string }>();
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const metadata = useQuery(api.attendanceMetadata.list, {});
  const page = useQuery(
    api.weeklyInsights.member,
    key ? { personKey: key, subgroup: subgroup ?? "" } : "skip"
  );
  const [editing, setEditing] = useState<Id<"attendanceMembers"> | null>(null);
  const [width, setWidth] = useState(0);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/insights"));

  if (page === undefined || metadata === undefined) return <LoadingState />;
  if (page === null) {
    return (
      <Screen title="Attendance" onBack={back}>
        <EmptyState icon="lock-closed-outline" title="Staff only" message="Sign in with your SOW account to see this." />
      </Screen>
    );
  }
  return (
    <Screen
      title={page.title}
      subtitle={subgroup ? `Weeklies at ${subgroupLabel(subgroup)}` : undefined}
      onBack={back}
      maxWidth={720}
    >
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <InsightsBlocks
            blocks={page.blocks}
            width={width}
            onEditMember={(id) => setEditing(id as Id<"attendanceMembers">)}
          />
        ) : null}
      </View>
      <EditMemberSheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        year={sydneyCalendarYear(new Date())}
        staffYear={me?.year ?? staffYearForDate(new Date())}
        memberId={editing}
        metadataFields={metadata}
      />
    </Screen>
  );
}
