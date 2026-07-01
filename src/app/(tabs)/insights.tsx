import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { staffYearForDate, sydneyCalendarYear } from "../../../shared/flow";
import { defaultAttendanceSubgroup } from "../../../shared/rollcall";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import {
  MetricsTab,
  type RefreshControls,
} from "@/components/attendance/MetricsTab";
import { EmptyState, FooterAction, LoadingState } from "@/components/ui";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";

/**
 * Insights — its own bottom-tab home for the attendance metrics dashboard,
 * lifted out of the Attendance screen's tab strip. Two top-bar segments:
 *  - "Attendance": the leader-facing metrics dashboard ({@link MetricsTab}).
 *  - "General": a scaffold for future cross-cutting insights (empty for now).
 *
 * The Attendance segment carries a pinned full-width "Build / Refresh insights"
 * footer (same affordance as "Make Request"), thrown up by {@link MetricsTab}
 * via `onRefreshStateChange` and gated by the once-per-week server cooldown.
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
  const [refresh, setRefresh] = useState<RefreshControls | null>(null);

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
      key: "attendance",
      label: "Attendance",
      render: () => (
        <MetricsTab
          year={year}
          subgroups={subgroups}
          selectedSubgroup={subgroup}
          onSelectedSubgroupChange={setSelectedSubgroup}
          onOpenMember={openEditMember}
          onRefreshStateChange={setRefresh}
        />
      ),
    },
    {
      key: "general",
      label: "General",
      render: () => (
        <EmptyState
          icon="sparkles-outline"
          title="General insights coming soon"
          message="Cross-cutting insights that aren't tied to a single campus will live here."
        />
      ),
    },
  ];

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={active}
        onActiveKeyChange={setActive}
        footer={
          refresh?.available ? (
            <FooterAction
              title={refresh.label}
              disabled={refresh.disabled}
              note={refresh.note}
              onPress={refresh.onRefresh}
              avoidKeyboard={false}
            />
          ) : null
        }
        footerTabKey="attendance"
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
