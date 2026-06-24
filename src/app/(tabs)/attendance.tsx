import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { staffYearForDate } from "../../../shared/flow";
import { defaultAttendanceSubgroup } from "../../../shared/rollcall";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { CreateEventSheet } from "@/components/attendance/CreateEventSheet";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import { EventsTab } from "@/components/attendance/EventsTab";
import { MembersTab } from "@/components/attendance/MembersTab";
import { MetadataTab } from "@/components/attendance/MetadataTab";
import { SettingsTab } from "@/components/attendance/SettingsTab";
import { FooterAction, LoadingState } from "@/components/ui";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";

/**
 * Attendance tab: Events, Members, Settings (tags), and Metadata — swipeable
 * like Mine / To Review on Requests, with the shared top chrome.
 */
export default function AttendanceScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const me = useQuery(api.directory.me);
  const year = me?.year ?? staffYearForDate(new Date());
  const subgroups = useQuery(api.events.subgroups, { year });
  const metadata = useQuery(api.attendanceMetadata.list, { year });
  const [active, setActive] = useState("events");
  const [selectedSubgroup, setSelectedSubgroup] = useState<string | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [memberSheetId, setMemberSheetId] = useState<Id<"attendanceMembers"> | null>(
    null
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset campus filter on year change
    setSelectedSubgroup(null);
  }, [year]);

  useEffect(() => {
    if (!subgroups?.length || selectedSubgroup !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default campus once subgroups load
    setSelectedSubgroup(
      defaultAttendanceSubgroup(subgroups, me?.profile?.assignments) ?? subgroups[0]
    );
  }, [subgroups, selectedSubgroup, me?.profile?.assignments]);

  const subgroup = selectedSubgroup ?? subgroups?.[0] ?? null;

  useEffect(() => {
    if (
      tab === "members" ||
      tab === "settings" ||
      tab === "metadata" ||
      tab === "events"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link tab param
      setActive(tab);
    }
  }, [tab]);

  const openCreateMember = () => {
    setMemberSheetId(null);
    setMemberSheetOpen(true);
  };

  const openEditMember = (memberId: Id<"attendanceMembers">) => {
    setMemberSheetId(memberId);
    setMemberSheetOpen(true);
  };

  const tabFooters = useMemo(() => {
    const items: { tabKey: string; node: ReactNode }[] = [];
    if (subgroups && subgroups.length > 0 && subgroup) {
      items.push({
        tabKey: "events",
        node: (
          <FooterAction
            title="+ Create event"
            onPress={() => setCreateEventOpen(true)}
          />
        ),
      });
    }
    items.push({
      tabKey: "members",
      node: (
        <FooterAction title="+ Create member" onPress={openCreateMember} />
      ),
    });
    return items;
  }, [subgroup, subgroups]);

  if (me === undefined || subgroups === undefined || metadata === undefined) {
    return <LoadingState />;
  }

  const tabs: PagerTab[] = [
    {
      key: "events",
      label: "Events",
      render: () => (
        <EventsTab
          year={year}
          subgroups={subgroups}
          selectedSubgroup={subgroup}
          onSelectedSubgroupChange={setSelectedSubgroup}
        />
      ),
    },
    {
      key: "members",
      label: "Members",
      render: () => (
        <MembersTab year={year} onEditMember={openEditMember} />
      ),
    },
    {
      key: "settings",
      label: "Tags",
      render: () => <SettingsTab year={year} subgroups={subgroups} />,
    },
    {
      key: "metadata",
      label: "Metadata",
      render: () => (
        <MetadataTab year={year} subgroups={subgroups} defaultSubgroup={subgroup} />
      ),
    },
  ];

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={active}
        onActiveKeyChange={setActive}
        footers={tabFooters}
      />
      {subgroup && subgroups ? (
        <CreateEventSheet
          visible={createEventOpen}
          onClose={() => setCreateEventOpen(false)}
          year={year}
          subgroup={subgroup}
          subgroups={subgroups}
        />
      ) : null}
      <EditMemberSheet
        visible={memberSheetOpen}
        onClose={() => setMemberSheetOpen(false)}
        year={year}
        memberId={memberSheetId}
        metadataFields={metadata}
      />
    </>
  );
}
