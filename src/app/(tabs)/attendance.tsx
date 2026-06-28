import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { staffYearForDate, sydneyCalendarYear } from "../../../shared/flow";
import { defaultAttendanceSubgroup } from "../../../shared/rollcall";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { CreateEventSheet } from "@/components/attendance/CreateEventSheet";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import { AuditTab } from "@/components/attendance/AuditTab";
import { EventsTab } from "@/components/attendance/EventsTab";
import { MembersTab } from "@/components/attendance/MembersTab";
import { MetadataTab, type SaveControls } from "@/components/attendance/MetadataTab";
import { SettingsTab } from "@/components/attendance/SettingsTab";
import { ConfirmDialog, FooterAction, LoadingState } from "@/components/ui";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { spacing } from "@/theme";

// Lift the tab footers a little higher off the bottom bar. All tabs share one Y
// (the footer slides between them on swipe), so they all use the same offset.
const FOOTER_LIFT = spacing.lg;

export default function AttendanceScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const me = useQuery(api.directory.me);
  // Staff year scopes events/tags/profiles; the calendar year is only the
  // viewing year for the student "Year" level (metadata fields are global).
  const year = me?.year ?? staffYearForDate(new Date());
  const calendarYear = sydneyCalendarYear(new Date());
  const subgroups = useQuery(api.events.subgroups);
  const metadata = useQuery(api.attendanceMetadata.list, {});
  const [active, setActive] = useState("events");
  const [selectedSubgroup, setSelectedSubgroup] = useState<string | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [memberSheetId, setMemberSheetId] = useState<Id<"attendanceMembers"> | null>(
    null
  );
  const noSave: SaveControls = {
    dirty: false,
    saving: false,
    save: () => {},
    revert: () => {},
  };
  const [tagsSave, setTagsSave] = useState<SaveControls>(noSave);
  const [metaSave, setMetaSave] = useState<SaveControls>(noSave);
  const [confirmSaveTags, setConfirmSaveTags] = useState(false);
  const [confirmSaveMeta, setConfirmSaveMeta] = useState(false);
  const [confirmRevertTags, setConfirmRevertTags] = useState(false);
  const [confirmRevertMeta, setConfirmRevertMeta] = useState(false);

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
      tab === "audit" ||
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
            bottomOffset={FOOTER_LIFT}
            avoidKeyboard={false}
          />
        ),
      });
    }
    items.push({
      tabKey: "members",
      node: (
        <FooterAction
          title="+ Create member"
          onPress={openCreateMember}
          bottomOffset={FOOTER_LIFT}
          avoidKeyboard={active === "members"}
        />
      ),
    });
    items.push({
      tabKey: "settings",
      node: (
        <FooterAction
          title={tagsSave.saving ? "Saving…" : "Save tags"}
          disabled={!tagsSave.dirty || tagsSave.saving}
          note={tagsSave.dirty && !tagsSave.saving ? "You have unsaved changes" : null}
          onPress={() => setConfirmSaveTags(true)}
          avoidKeyboard={false}
          cancel={{
            onPress: () => setConfirmRevertTags(true),
            disabled: !tagsSave.dirty || tagsSave.saving,
          }}
          bottomOffset={FOOTER_LIFT}
        />
      ),
    });
    items.push({
      tabKey: "metadata",
      node: (
        <FooterAction
          title={metaSave.saving ? "Saving…" : "Save metadata"}
          disabled={!metaSave.dirty || metaSave.saving}
          note={metaSave.dirty && !metaSave.saving ? "You have unsaved changes" : null}
          onPress={() => setConfirmSaveMeta(true)}
          avoidKeyboard={false}
          cancel={{
            onPress: () => setConfirmRevertMeta(true),
            disabled: !metaSave.dirty || metaSave.saving,
          }}
          bottomOffset={FOOTER_LIFT}
        />
      ),
    });
    return items;
  }, [active, subgroup, subgroups, tagsSave, metaSave]);

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
          subgroups={subgroups}
          defaultSubgroup={subgroup}
          onSaveStateChange={setMetaSave}
        />
      ),
    },
    {
      key: "audit",
      label: "Audit",
      render: () => <AuditTab />,
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
        year={calendarYear}
        staffYear={year}
        memberId={memberSheetId}
        metadataFields={metadata}
      />
      <ConfirmDialog
        visible={confirmSaveTags}
        title="Save tags"
        message="Apply these tag changes? They take effect across all events that use them."
        confirmLabel="Save tags"
        destructive={false}
        onConfirm={tagsSave.save}
        onClose={() => setConfirmSaveTags(false)}
      />
      <ConfirmDialog
        visible={confirmSaveMeta}
        title="Save metadata"
        message="Apply these metadata changes? They update the fields shown for every member."
        confirmLabel="Save metadata"
        destructive={false}
        onConfirm={metaSave.save}
        onClose={() => setConfirmSaveMeta(false)}
      />
      <ConfirmDialog
        visible={confirmRevertTags}
        title="Discard changes"
        message="Discard your unsaved tag changes? This can't be undone."
        confirmLabel="Discard changes"
        onConfirm={tagsSave.revert}
        onClose={() => setConfirmRevertTags(false)}
      />
      <ConfirmDialog
        visible={confirmRevertMeta}
        title="Discard changes"
        message="Discard your unsaved metadata changes? This can't be undone."
        confirmLabel="Discard changes"
        onConfirm={metaSave.revert}
        onClose={() => setConfirmRevertMeta(false)}
      />
    </>
  );
}
