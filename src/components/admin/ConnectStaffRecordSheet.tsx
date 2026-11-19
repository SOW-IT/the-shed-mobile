import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { MemberRow } from "@/components/attendance/MemberRow";
import { MergeMemberSheet } from "@/components/attendance/MergeMemberSheet";
import { EmptyState, SearchField, Sheet, Txt } from "@/components/ui";
import { useHeldValue } from "@/hooks/useHeldValue";
import { durations, typography, useAppTheme } from "@/theme";

export type OldStaff = { email: string; name: string; year: number };

type PickedRecord = { memberId: Id<"attendanceMembers">; name: string; email?: string };

const SHEET_HANDOFF_MS = durations.overlayOut + 80;

export function ConnectStaffRecordSheet({
  staff,
  currentYear,
  onClose,
  onConnected,
}: {
  staff: OldStaff | null;
  currentYear: number;
  onClose: () => void;
  onConnected: (summary: string) => void;
}) {
  const t = useAppTheme();
  const [stage, setStage] = useState<"search" | "review" | "handoff">("search");
  const [picked, setPicked] = useState<PickedRecord | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const handoff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(handoff.current), []);

  useEffect(() => {
    if (staff) return;
    clearTimeout(handoff.current);
    /* eslint-disable react-hooks/set-state-in-effect -- start over when the sheet closes */
    setStage("search");
    setPicked(null);
    setSearch("");
    setDebouncedSearch("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [staff]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const moveTo = (next: "search" | "review") => {
    setStage("handoff");
    clearTimeout(handoff.current);
    handoff.current = setTimeout(() => setStage(next), SHEET_HANDOFF_MS);
  };

  const typed = search.trim();
  const searching = staff !== null && stage === "search" && Boolean(debouncedSearch) && Boolean(typed);
  const { value: results, stale } = useHeldValue(
    useQuery(
      api.attendanceMembers.list,
      searching
        ? { year: currentYear, search: debouncedSearch, paginationOpts: { numItems: 25, cursor: null } }
        : "skip"
    ),
    searching ? "search" : "idle"
  );
  const loading = Boolean(typed) && (typed !== debouncedSearch || !results || stale);
  const candidates = (results?.page ?? []).filter(
    (row): row is typeof row & { memberId: Id<"attendanceMembers"> } =>
      !row.key.startsWith("staff:") && Boolean(row.memberId)
  );

  return (
    <>
      <Sheet
        visible={staff !== null && stage === "search"}
        onClose={onClose}
        title="Connect attendance record"
      >
        {staff ? (
          <Txt style={[typography.body, { color: t.text }]}>
            Find {staff.name}&apos;s attendance record, for example one signed in under a personal email.
            It&apos;s merged into their {staff.year} staff profile and their attendance moves across.
          </Txt>
        ) : null}
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or email…"
          loading={loading}
          autoFocus
        />
        {results && !stale && candidates.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No one matches"
            message="Try another spelling, or search by email. Current staff can't be merged away."
          />
        ) : (
          <View>
            {candidates.map((row) => (
              <MemberRow
                key={row.key}
                name={row.name}
                subtitle={row.subtitle || row.email}
                photo={row.photo}
                university={row.university}
                roles={row.roles}
                accessibilityLabel={`Connect ${row.name}`}
                onPress={() => {
                  setPicked({ memberId: row.memberId, name: row.name, email: row.email ?? undefined });
                  moveTo("review");
                }}
              />
            ))}
          </View>
        )}
      </Sheet>
      {staff && picked ? (
        <MergeMemberSheet
          visible={stage === "review"}
          onClose={onClose}
          onMerged={onConnected}
          memberId={picked.memberId}
          memberEmail={picked.email}
          isStaff={false}
          year={currentYear}
          staffYear={staff.year}
          initialStaff={{ email: staff.email, name: staff.name }}
          onChooseSomeoneElse={() => moveTo("search")}
        />
      ) : null}
    </>
  );
}
