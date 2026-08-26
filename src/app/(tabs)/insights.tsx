import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { GENERAL_RECENT_YEARS } from "../../../shared/attendanceMetrics";
import { staffYearForDate, sydneyCalendarYear } from "../../../shared/flow";
import { defaultAttendanceSubgroup } from "../../../shared/rollcall";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import { GeneralMetricsTab } from "@/components/attendance/GeneralMetricsTab";
import {
  AttendanceRangeFab,
  type AttendanceRangeSelection,
  ChartModeFab,
  type GeneralScope,
  GeneralScopeFab,
} from "@/components/attendance/InsightsSelectors";
import {
  type ChartMode,
  ChartModeProvider,
} from "@/components/attendance/MetricsCharts";
import { MetricsTab } from "@/components/attendance/MetricsTab";
import { EmptyState, LoadingState } from "@/components/ui";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";

export default function InsightsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const me = useQuery(api.directory.me);
  const year = me?.year ?? staffYearForDate(new Date());
  const calendarYear = sydneyCalendarYear(new Date());
  const subgroups = useQuery(api.events.subgroups);
  const metadata = useQuery(api.attendanceMetadata.list, {});

  const [active, setActive] = useState("general");
  const [selectedSubgroup, setSelectedSubgroup] = useState<string | null>(null);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [memberSheetId, setMemberSheetId] = useState<Id<"attendanceMembers"> | null>(
    null
  );
  const [attendanceRange, setAttendanceRange] = useState<AttendanceRangeSelection>({
    kind: "preset",
    weeks: 4,
  });
  const [includeCollaborative, setIncludeCollaborative] = useState(true);
  const [generalScope, setGeneralScope] = useState<GeneralScope>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("bar");
  const staffTrends = useQuery(api.generalMetrics.staffTrends, {});

  useEffect(() => {
    if (tab === "attendance" || tab === "general") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link tab param
      setActive(tab);
    }
  }, [tab]);

  useEffect(() => {
    if (!subgroups?.length || selectedSubgroup !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default campus once subgroups load
    setSelectedSubgroup(
      defaultAttendanceSubgroup(subgroups, me?.profile?.assignments) ?? subgroups[0]
    );
  }, [subgroups, selectedSubgroup, me?.profile?.assignments]);

  const subgroup = selectedSubgroup ?? subgroups?.[0] ?? null;

  const openEditMember = (memberId: Id<"attendanceMembers">) => {
    setMemberSheetId(memberId);
    setMemberSheetOpen(true);
  };

  if (me === undefined || subgroups === undefined || metadata === undefined) {
    return <LoadingState />;
  }

  const isStaff = !!me?.profile;
  const isSignedIn = !!me;
  const signInPrompt = !isSignedIn ? (
    <EmptyState
      icon="log-in-outline"
      title="Sign in to view more"
      message="You're seeing the public view. Sign in to see the full dashboard."
    />
  ) : null;

  const generalTab: PagerTab = {
    key: "general",
    label: "General",
    render: () => (
      <>
        <GeneralMetricsTab scope={generalScope} publicPreview={!isSignedIn} />
        {signInPrompt}
      </>
    ),
  };
  const attendanceTab: PagerTab = {
    key: "attendance",
    label: "Attendance",
    render: () => (
      <MetricsTab
        subgroups={subgroups}
        selectedSubgroup={subgroup}
        onSelectedSubgroupChange={setSelectedSubgroup}
        onOpenMember={openEditMember}
        range={attendanceRange}
        includeCollaborative={includeCollaborative}
      />
    ),
  };
  const tabs: PagerTab[] = isStaff ? [generalTab, attendanceTab] : [generalTab];
  const activeKey = tabs.some((t) => t.key === active) ? active : "general";

  const floating = (
    <>
      {activeKey === "attendance" && isStaff ? (
        <AttendanceRangeFab
          range={attendanceRange}
          onRangeChange={setAttendanceRange}
          includeCollaborative={includeCollaborative}
          onCollaborativeChange={setIncludeCollaborative}
        />
      ) : isSignedIn ? (
        <GeneralScopeFab
          years={staffTrends?.years ?? []}
          value={generalScope}
          onChange={setGeneralScope}
          recentYears={GENERAL_RECENT_YEARS}
        />
      ) : null}
      <ChartModeFab mode={chartMode} onChange={setChartMode} />
    </>
  );

  return (
    <ChartModeProvider value={chartMode}>
      <PagerScreen
        tabs={tabs}
        activeKey={activeKey}
        onActiveKeyChange={setActive}
        floating={floating}
        fullWidth
      />
      <EditMemberSheet
        visible={memberSheetOpen}
        onClose={() => setMemberSheetOpen(false)}
        year={calendarYear}
        staffYear={year}
        memberId={memberSheetId}
        metadataFields={metadata}
      />
    </ChartModeProvider>
  );
}
