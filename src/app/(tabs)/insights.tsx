import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { GENERAL_RECENT_YEARS } from "../../../shared/attendanceMetrics";
import {
  DEFAULT_RANGE_WEEKS,
  resolveRangeWeeks,
} from "../../../shared/attendanceMetricsView";
import { staffYearForDate, sydneyCalendarYear } from "../../../shared/flow";
import { isOrgWideSubgroup } from "../../../shared/rollcall";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import { GeneralMetricsTab } from "@/components/attendance/GeneralMetricsTab";
import {
  AttendanceRangeFab,
  ChartModeFab,
  type GeneralScope,
  GeneralScopeFab,
  PeriodFab,
} from "@/components/attendance/InsightsSelectors";
import {
  type ChartMode,
  ChartModeProvider,
} from "@/components/attendance/MetricsCharts";
import { MetricsTab } from "@/components/attendance/MetricsTab";
import { EmptyState, LoadingState } from "@/components/ui";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { useAttendanceSubgroup } from "@/hooks/useAttendanceSubgroup";

export default function InsightsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const me = useQuery(api.directory.me);
  const year = me?.year ?? staffYearForDate(new Date());
  const calendarYear = sydneyCalendarYear(new Date());
  const subgroups = useQuery(api.events.subgroups);
  const metadata = useQuery(api.attendanceMetadata.list, {});

  const [active, setActive] = useState("general");
  const [subgroup, setSelectedSubgroup] = useAttendanceSubgroup(
    subgroups,
    me?.profile?.assignments
  );
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [memberSheetId, setMemberSheetId] = useState<Id<"attendanceMembers"> | null>(
    null
  );
  const [pickedWeeks, setAttendanceWeeks] = useState(DEFAULT_RANGE_WEEKS);
  const rangeOptions = useQuery(api.attendanceMetrics.rangeOptions, {});
  const attendanceWeeks = resolveRangeWeeks(pickedWeeks, rangeOptions);
  const [includeCollaborative, setIncludeCollaborative] = useState(true);
  const [generalScope, setGeneralScope] = useState<GeneralScope>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("bar");
  const generalView = useQuery(api.generalMetrics.view, { scope: generalScope });
  const router = useRouter();
  // A campus shows its weeklies by term or year; SOW keeps the range picker.
  const campus = subgroup ?? subgroups?.[0] ?? null;
  const campusSelected = !!campus && !isOrgWideSubgroup(campus);
  const [periodByCampus, setPeriodByCampus] = useState<Record<string, string>>({});
  const weeklyView = useQuery(
    api.weeklyInsights.view,
    campusSelected && me?.profile ? { subgroup: campus, period: periodByCampus[campus] } : "skip"
  );
  const openPerson = (personKey: string) =>
    router.push({
      pathname: "/attendance/member/[key]",
      params: { key: personKey, ...(campus ? { subgroup: campus } : {}) },
    });

  useEffect(() => {
    if (tab === "attendance" || tab === "general") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link tab param
      setActive(tab);
    }
  }, [tab]);

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
        <GeneralMetricsTab view={generalView} />
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
        onOpenPerson={openPerson}
        rangeWeeks={attendanceWeeks}
        includeCollaborative={includeCollaborative}
        weeklyView={weeklyView}
      />
    ),
  };
  const tabs: PagerTab[] = isStaff ? [generalTab, attendanceTab] : [generalTab];
  const activeKey = tabs.some((t) => t.key === active) ? active : "general";

  const floating = (
    <>
      {activeKey === "attendance" && isStaff && campusSelected ? (
        weeklyView?.periods.length ? (
          <PeriodFab
            periods={weeklyView.periods}
            value={weeklyView.period}
            onChange={(key) => setPeriodByCampus((current) => ({ ...current, [campus!]: key }))}
          />
        ) : null
      ) : activeKey === "attendance" && isStaff ? (
        <AttendanceRangeFab
          options={rangeOptions ?? []}
          weeks={attendanceWeeks}
          onWeeksChange={setAttendanceWeeks}
          includeCollaborative={includeCollaborative}
          onCollaborativeChange={setIncludeCollaborative}
        />
      ) : isSignedIn ? (
        <GeneralScopeFab
          years={generalView?.years ?? []}
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
