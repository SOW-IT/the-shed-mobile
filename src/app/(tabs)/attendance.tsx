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
import { MetadataTab, type SaveControls } from "@/components/attendance/MetadataTab";
import { SettingsTab } from "@/components/attendance/SettingsTab";
import { FloatingYearPicker, FooterAction, LoadingState } from "@/components/ui";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";

/** Earliest staff year the attendance picker offers (the import history start). */
const ATTENDANCE_EARLIEST_YEAR = 2024;

/**
 * Attendance tab: Events, Members, Settings (tags), and Metadata — swipeable
 * like Mine / To Review on Requests, with the shared top chrome. A floating
 * year picker (bottom-right) lets staff browse past years back to 2024; those
 * years are strictly view-only and expose only the Events and Members tabs.
 */
export default function AttendanceScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const me = useQuery(api.directory.me);
  const currentYear = me?.year ?? staffYearForDate(new Date());
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? currentYear;
  const readOnly = year < currentYear;
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear; y >= ATTENDANCE_EARLIEST_YEAR; y--) list.push(y);
    return list;
  }, [currentYear]);
  const subgroups = useQuery(api.events.subgroups, { year });
  const metadata = useQuery(api.attendanceMetadata.list, { year });
  const [active, setActive] = useState("events");
  const [selectedSubgroup, setSelectedSubgroup] = useState<string | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [memberSheetId, setMemberSheetId] = useState<Id<"attendanceMembers"> | null>(
    null
  );
  // Save controls reported by the Tags / Metadata tabs, surfaced as sliding
  // footer buttons (like "Create event").
  const noSave: SaveControls = { dirty: false, saving: false, save: () => {} };
  const [tagsSave, setTagsSave] = useState<SaveControls>(noSave);
  const [metaSave, setMetaSave] = useState<SaveControls>(noSave);

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

  // Past years are view-only: switch off any creation footer and the Tags /
  // Metadata tabs (which don't apply to a closed year).
  useEffect(() => {
    if (readOnly && (active === "settings" || active === "metadata")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- snap back to a visible tab
      setActive("events");
    }
  }, [readOnly, active]);

  const tabFooters = useMemo(() => {
    if (readOnly) return [];
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
    items.push({
      tabKey: "settings",
      node: (
        <FooterAction
          title={tagsSave.saving ? "Saving…" : "Save tags"}
          disabled={!tagsSave.dirty || tagsSave.saving}
          onPress={tagsSave.save}
        />
      ),
    });
    items.push({
      tabKey: "metadata",
      node: (
        <FooterAction
          title={metaSave.saving ? "Saving…" : "Save metadata"}
          disabled={!metaSave.dirty || metaSave.saving}
          onPress={metaSave.save}
        />
      ),
    });
    return items;
  }, [subgroup, subgroups, readOnly, tagsSave, metaSave]);

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
          readOnly={readOnly}
        />
      ),
    },
    {
      key: "members",
      label: "Members",
      render: () => (
        <MembersTab year={year} onEditMember={openEditMember} readOnly={readOnly} />
      ),
    },
    // Tags and Metadata are configuration for the live year and don't apply to
    // a closed year — hide them entirely when browsing the past.
    ...(readOnly
      ? []
      : [
          {
            key: "settings",
            label: "Tags",
            render: () => (
              <SettingsTab
                year={year}
                subgroups={subgroups}
                onSaveStateChange={setTagsSave}
              />
            ),
          },
          {
            key: "metadata",
            label: "Metadata",
            render: () => (
              <MetadataTab
                year={year}
                subgroups={subgroups}
                defaultSubgroup={subgroup}
                onSaveStateChange={setMetaSave}
              />
            ),
          },
        ]),
  ];

  const yearLabel = (y: number) =>
    y === currentYear ? `${y} (current)` : `${y}`;

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={active}
        onActiveKeyChange={setActive}
        footers={tabFooters}
        floating={
          <FloatingYearPicker
            year={year}
            years={years}
            onSelect={setSelectedYear}
            formatLabel={yearLabel}
            // Lift clear of the pinned create-action pill on the live year.
            bottomOffset={readOnly ? 0 : 62}
          />
        }
      />
      {!readOnly && subgroup && subgroups ? (
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
