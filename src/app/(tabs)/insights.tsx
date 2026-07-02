import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { staffYearForDate, sydneyCalendarYear } from "../../../shared/flow";
import { defaultAttendanceSubgroup } from "../../../shared/rollcall";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import { GeneralMetricsTab } from "@/components/attendance/GeneralMetricsTab";
import {
  AttendanceRangeFab,
  GeneralScopeFab,
} from "@/components/attendance/InsightsSelectors";
import { MetricsTab } from "@/components/attendance/MetricsTab";
import { LoadingState } from "@/components/ui";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";

/**
 * Insights — its own bottom-tab home for the attendance metrics dashboard,
 * lifted out of the Attendance screen's tab strip. Two top-bar segments:
 *  - "General": org-wide staff trends ({@link GeneralMetricsTab}), on the left.
 *  - "Attendance": the leader-facing per-campus metrics dashboard
 *    ({@link MetricsTab}).
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

  const [active, setActive] = useState("attendance");
  const [selectedSubgroup, setSelectedSubgroup] = useState<string | null>(null);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [memberSheetId, setMemberSheetId] = useState<Id<"attendanceMembers"> | null>(
    null
  );
  // Owned here so the bottom-right selectors (rendered in PagerScreen's floating
  // slot) can drive them from outside the tab bodies.
  const [rangeWeeks, setRangeWeeks] = useState(8);
  const [includeCollaborative, setIncludeCollaborative] = useState(true);
  const [generalYear, setGeneralYear] = useState<number | null>(null); // null = All years
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

  const tabs: PagerTab[] = [
    {
      key: "general",
      label: "General",
      render: () => <GeneralMetricsTab year={generalYear} />,
    },
    {
      key: "attendance",
      label: "Attendance",
      render: () => (
        <MetricsTab
          subgroups={subgroups}
          selectedSubgroup={subgroup}
          onSelectedSubgroupChange={setSelectedSubgroup}
          onOpenMember={openEditMember}
          rangeWeeks={rangeWeeks}
          includeCollaborative={includeCollaborative}
        />
      ),
    },
  ];

  // The bottom-right selector is per-tab: range/collaborative on Attendance,
  // All-vs-year scope on General.
  const floating =
    active === "attendance" ? (
      <AttendanceRangeFab
        rangeWeeks={rangeWeeks}
        onRangeChange={setRangeWeeks}
        includeCollaborative={includeCollaborative}
        onCollaborativeChange={setIncludeCollaborative}
      />
    ) : (
      <GeneralScopeFab
        years={staffTrends?.years ?? []}
        value={generalYear}
        onChange={setGeneralYear}
      />
    );

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={active}
        onActiveKeyChange={setActive}
        floating={floating}
      />
      <EditMemberSheet
        visible={memberSheetOpen}
        onClose={() => setMemberSheetOpen(false)}
        year={calendarYear}
        staffYear={year}
        memberId={memberSheetId}
        metadataFields={metadata}
      />
    </>
  );
}
