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

/**
 * Insights — its own bottom-tab home for the attendance metrics dashboard,
 * lifted out of the Attendance screen's tab strip. Two top-bar segments:
 *  - "General": public org-wide trends ({@link GeneralMetricsTab}), on the left.
 *  - "Attendance": private per-campus metrics dashboard
 *    ({@link MetricsTab}), hidden for visitors and staff-only sign-ins.
 *
 * Snapshots are kept fresh server-side (weekly cron + dirty-recompute on
 * roll-call changes), so there's no manual refresh affordance here for now.
 */
export default function InsightsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const me = useQuery(api.directory.me);
  // Staff year scopes events/tags/profiles; the calendar year is only the
  // viewing year for the student "Year" level (metadata fields are global).
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
  // Owned here so the bottom-right selectors (rendered in PagerScreen's floating
  // slot) can drive them from outside the tab bodies.
  // Default to past month — operational view rather than the longest history.
  const [attendanceRange, setAttendanceRange] = useState<AttendanceRangeSelection>({
    kind: "preset",
    weeks: 4,
  });
  const [includeCollaborative, setIncludeCollaborative] = useState(true);
  // null = recent years (default); "all" = full history; year number = cards.
  const [generalScope, setGeneralScope] = useState<GeneralScope>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("bar");
  // Just the year list for the General selector; the tab runs its own query too
  // (Convex dedupes the identical call).
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

  // Insights:
  // - General: org-wide trend charts (aggregate head-counts) are open to
  //   everyone. Any signed-in account — even without a staff profile (1.7.4) —
  //   gets the FULL General view (year picker + per-year card breakdown); only
  //   signed-out visitors get the trimmed public preview and the "sign in to
  //   view more" prompt.
  // - Attendance: staff-only (shows per-campus student data). Visitors and
  //   signed-in non-staff don't see the tab, so the top-bar segments collapse to
  //   just General for them.
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
        {/* Signed-out visitors have no year picker, so scope stays null
            (recent years); publicPreview trims the per-year cards for them. */}
        <GeneralMetricsTab scope={generalScope} publicPreview={!isSignedIn} />
        {/* Sign-in prompt sits below the graphs for signed-out visitors. */}
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
  // Attendance is staff-only, so visitors get just General (a single segment,
  // which collapses the top bar).
  const tabs: PagerTab[] = isStaff ? [generalTab, attendanceTab] : [generalTab];
  const activeKey = tabs.some((t) => t.key === active) ? active : "general";

  // The bottom-right selector is per-tab: range/collaborative on the staff-only
  // Attendance tab, recent/all/year scope on General for any signed-in account
  // (1.7.4). Signed-out visitors get neither (no picker), only the bottom-left
  // bars/lines toggle.
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
        // Charts read better using the whole width on tablets/desktop than
        // squeezed into the 720pt column.
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
