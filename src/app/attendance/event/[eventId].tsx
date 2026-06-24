import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  eventHasEnded,
  formatEventDate,
  formatSignInTime,
  SOW_SUBGROUP,
  subgroupLabel,
} from "../../../../shared/rollcall";
import { AttendanceRow } from "@/components/AttendanceRow";
import { CreateEventSheet } from "@/components/attendance/CreateEventSheet";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import { ReorderableList } from "@/components/ReorderableList";
import {
  Btn,
  Chip,
  EmptyState,
  FadeInView,
  FooterAction,
  hapticSelect,
  LoadingState,
  Muted,
  Screen,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const ROSTER_PAGE_SIZE = 30;

/** Subtitle for a roster row. */
const memberSubtitle = (member: {
  roles: string[];
  campuses: string[];
  subtitle?: string;
}): string | undefined => {
  if (member.subtitle) return member.subtitle;
  if (member.roles.length > 0) return member.roles.join(" · ");
  if (member.campuses.length > 0)
    return member.campuses.map(subgroupLabel).join(" · ");
  return undefined;
};

const personKey = (row: {
  email?: string | null;
  memberId?: string | null;
}): string =>
  row.email ? `staff:${row.email}` : row.memberId ? `member:${row.memberId}` : "";

const signedInSubtitle = (signInTime: number, notes?: string): string => {
  const base = formatSignInTime(signInTime);
  const trimmed = notes?.trim();
  if (!trimmed) return base;
  const preview = trimmed.length > 36 ? `${trimmed.slice(0, 36)}…` : trimmed;
  return `${base} · ${preview}`;
};

export default function EventAttendanceScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const evId = eventId as Id<"events">;

  const event = useQuery(api.events.get, { eventId: evId });
  const attendance = useQuery(api.attendance.listByEvent, { eventId: evId });
  const eventSubgroup = event?.subgroups[0];
  // The roll-call pool is the year's shared staff roster.
  const roster = useQuery(
    api.attendance.roster,
    event ? { year: event.year, subgroup: eventSubgroup, eventId: evId } : "skip"
  );
  const signIn = useMutation(api.attendance.signIn);
  const signOut = useMutation(api.attendance.signOut);
  const updateRecord = useMutation(api.attendance.updateRecord);
  const ensureForStaff = useMutation(api.attendanceMembers.ensureForStaff);
  const metadataFields = useQuery(
    api.attendanceMetadata.list,
    event ? { year: event.year, subgroup: eventSubgroup } : "skip"
  );
  const subgroups = useQuery(
    api.events.subgroups,
    event ? { year: event.year } : "skip"
  );

  const [search, setSearch] = useState("");
  const [eventEditOpen, setEventEditOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editMemberId, setEditMemberId] = useState<Id<"attendanceMembers"> | null>(
    null
  );
  const [editAttendance, setEditAttendance] = useState<{
    attendanceId: Id<"attendance">;
    notes?: string;
  } | null>(null);
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [unsignedLimit, setUnsignedLimit] = useState(ROSTER_PAGE_SIZE);
  const [signedInLimit, setSignedInLimit] = useState(ROSTER_PAGE_SIZE);
  const [searchLimit, setSearchLimit] = useState(ROSTER_PAGE_SIZE);
  const [signedInOrder, setSignedInOrder] = useState<Id<"attendance">[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset unlock when opening another event
    setEditUnlocked(false);
  }, [event?._id]);

  const pastEvent = event != null && eventHasEnded(event.dateEnd);
  const canEdit = !pastEvent || editUnlocked;

  const closeEdit = () => {
    setEditOpen(false);
    setEditAttendance(null);
  };

  const signedInKeys = useMemo(
    () => new Set((attendance ?? []).map((a) => personKey(a)).filter(Boolean)),
    [attendance]
  );

  const attendanceByKey = useMemo(() => {
    const map = new Map<string, NonNullable<typeof attendance>[number]>();
    for (const row of attendance ?? []) {
      const key = personKey(row);
      if (key) map.set(key, row);
    }
    return map;
  }, [attendance]);

  const searchQuery = search.trim().toLowerCase();
  const isSearching = searchQuery.length > 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging when roster/search changes
    setUnsignedLimit(ROSTER_PAGE_SIZE);
    setSignedInLimit(ROSTER_PAGE_SIZE);
    setSearchLimit(ROSTER_PAGE_SIZE);
  }, [search, signedInKeys]);

  useEffect(() => {
    if (!attendance) return;
    const ids = attendance.map((row) => row._id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local drag order from server rows
    setSignedInOrder((prev) => {
      const same =
        prev.length === ids.length && prev.every((id, index) => id === ids[index]);
      return same ? prev : ids;
    });
  }, [attendance]);

  const orderedAttendance = useMemo(() => {
    const rows = attendance ?? [];
    const byId = new Map(rows.map((row) => [row._id, row]));
    const ordered = signedInOrder.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    const seen = new Set(ordered.map((row) => row._id));
    return [...ordered, ...rows.filter((row) => !seen.has(row._id))];
  }, [attendance, signedInOrder]);

  const unsignedList = useMemo(() => {
    return (roster ?? []).filter((m) => !signedInKeys.has(m.key));
  }, [roster, signedInKeys]);

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return (roster ?? []).filter(
      (m) =>
        m.name.toLowerCase().includes(searchQuery) ||
        (m.email?.toLowerCase().includes(searchQuery) ?? false)
    );
  }, [roster, isSearching, searchQuery]);

  const visibleUnsigned = unsignedList.slice(0, unsignedLimit);
  const visibleSignedIn = orderedAttendance.slice(0, signedInLimit);
  const visibleSearchResults = searchResults.slice(0, searchLimit);

  const reorderSignedIn = (rows: typeof orderedAttendance) => {
    if (!canEdit) return;
    setSignedInOrder(rows.map((row) => row._id));
    const slots = orderedAttendance
      .map((row) => row.signInTime)
      .sort((a, b) => b - a);
    rows.forEach((row, index) => {
      const signInTime = slots[index];
      if (signInTime !== undefined && row.signInTime !== signInTime) {
        void updateRecord({ attendanceId: row._id, signInTime });
      }
    });
  };

  const reorderVisibleSignedIn = (visibleRows: typeof orderedAttendance) => {
    if (!canEdit) return;
    const visibleIds = new Set(visibleRows.map((row) => row._id));
    const tail = orderedAttendance.filter((row) => !visibleIds.has(row._id));
    reorderSignedIn([...visibleRows, ...tail]);
  };

  if (event === undefined || attendance === undefined || subgroups === undefined) {
    return <LoadingState />;
  }
  if (event === null) {
    return (
      <Screen title="Event" onBack={() => router.back()}>
        <EmptyState icon="lock-closed-outline" title="Event not found" />
      </Screen>
    );
  }
  if (roster === undefined) return <LoadingState />;

  const onSignIn = (m: NonNullable<typeof roster>[number]) => {
    if (!canEdit) return;
    hapticSelect();
    if (m.kind === "staff" && m.email) {
      void signIn({ eventId: evId, email: m.email });
    } else if (m.memberId) {
      void signIn({ eventId: evId, memberId: m.memberId as Id<"attendanceMembers"> });
    }
  };
  const onSignOut = (a: NonNullable<typeof attendance>[number]) => {
    if (!canEdit) return;
    hapticSelect();
    if (a.email) void signOut({ eventId: evId, email: a.email });
    else if (a.memberId) void signOut({ eventId: evId, memberId: a.memberId });
  };

  const openMemberEdit = (memberId: Id<"attendanceMembers">) => {
    setEditMemberId(memberId);
    setEditOpen(true);
  };

  const openEdit = async (opts: {
    memberId?: Id<"attendanceMembers">;
    staffEmail?: string;
    attendance?: { attendanceId: Id<"attendance">; notes?: string };
  }) => {
    if (!canEdit) return;
    hapticSelect();
    setEditAttendance(opts.attendance ?? null);
    try {
      let id = opts.memberId;
      if (!id && opts.staffEmail) {
        id = await ensureForStaff({
          year: event.year,
          staffEmail: opts.staffEmail,
        });
      }
      if (id) openMemberEdit(id);
    } catch {
      // ensureForStaff surfaces Convex errors via toast elsewhere if needed
    }
  };

  const editRosterEntry = (m: NonNullable<typeof roster>[number]) => {
    if (m.memberId) {
      void openEdit({ memberId: m.memberId as Id<"attendanceMembers"> });
    } else if (m.email) {
      void openEdit({ staffEmail: m.email });
    }
  };

  const editSignedIn = (a: NonNullable<typeof attendance>[number]) => {
    const attendanceCtx = { attendanceId: a._id, notes: a.notes };
    if (a.memberId) void openEdit({ memberId: a.memberId, attendance: attendanceCtx });
    else if (a.email) void openEdit({ staffEmail: a.email, attendance: attendanceCtx });
  };

  return (
    <Screen
      title={event.name}
      subtitle="Attendance"
      onBack={() => router.back()}
      footer={
        pastEvent && !editUnlocked ? (
          <FooterAction
            title="+ Enable editing"
            onPress={() => {
              hapticSelect();
              setEditUnlocked(true);
            }}
          />
        ) : undefined
      }
    >
      <View style={styles.metaRow}>
        <Muted>{formatEventDate(event.dateStart)}</Muted>
        <View style={styles.metaActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit event"
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return;
              setEventEditOpen(true);
            }}
            style={({ pressed }) => [
              styles.editEventButton,
              { borderColor: t.primary, opacity: canEdit ? 1 : 0.4 },
              pressed && canEdit && { opacity: 0.7 },
            ]}
          >
            <Text style={[typography.caption, styles.editEventText, { color: t.primary }]}>
              Edit
            </Text>
          </Pressable>
          <View style={[styles.countPill, { backgroundColor: t.primarySoft }]}>
            <Ionicons name="people" size={14} color={t.primary} />
            <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
              {attendance.length}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.badgeRow}>
        {event.collaborative ? <Chip label="Collaborative" /> : null}
        {event.subgroups.map((s) => (
          <Chip key={s} label={subgroupLabel(s)} />
        ))}
      </View>

      {pastEvent && !editUnlocked ? (
        <Text style={[typography.caption, { color: t.muted, marginBottom: spacing.sm }]}>
          This event has ended. Tap Enable editing below to change attendance.
        </Text>
      ) : null}

      {/* Search box for the suggested pool. */}
      <View style={[styles.search, { backgroundColor: t.inputBackground }]}>
        <Ionicons name="search" size={16} color={t.faint} />
        <TextInput
          style={[styles.searchInput, { color: t.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search members…"
          placeholderTextColor={t.faint}
          autoCapitalize="none"
        />
      </View>

      {isSearching ? (
        <>
          <Text style={[typography.label, styles.section, { color: t.muted }]}>
            Results · {searchResults.length}
          </Text>
          {searchResults.length === 0 ? (
            <Muted>No members match your search.</Muted>
          ) : (
            <>
              {visibleSearchResults.map((m, index) => {
                const signedIn = signedInKeys.has(m.key);
                const attendanceRow = attendanceByKey.get(m.key);
                return (
                  <FadeInView key={m.key} delay={Math.min(index, 6) * 35}>
                    <AttendanceRow
                      name={m.name}
                      subtitle={
                        signedIn && attendanceRow
                          ? signedInSubtitle(attendanceRow.signInTime, attendanceRow.notes)
                          : memberSubtitle(m)
                      }
                      photo={m.photo ?? null}
                      university={m.university}
                      mode={signedIn ? "signedIn" : "suggested"}
                      highlightSignedIn={signedIn}
                      disabled={!canEdit}
                      onAction={() => {
                        if (signedIn && attendanceRow) onSignOut(attendanceRow);
                        else onSignIn(m);
                      }}
                      onEdit={
                        canEdit
                          ? () =>
                              signedIn && attendanceRow
                                ? editSignedIn(attendanceRow)
                                : editRosterEntry(m)
                          : undefined
                      }
                    />
                  </FadeInView>
                );
              })}
              {visibleSearchResults.length < searchResults.length ? (
                <Btn
                  title={`Load more (${searchResults.length - visibleSearchResults.length} left)`}
                  variant="ghost"
                  onPress={() =>
                    setSearchLimit((limit) => limit + ROSTER_PAGE_SIZE)
                  }
                />
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <Text style={[typography.label, styles.section, { color: t.muted }]}>
            Not signed in · {unsignedList.length}
          </Text>
          {unsignedList.length === 0 ? (
            <Muted>Everyone in the pool is signed in 🎉</Muted>
          ) : (
            <>
              {visibleUnsigned.map((m, index) => (
                <FadeInView key={m.key} delay={Math.min(index, 6) * 35}>
                  <AttendanceRow
                    name={m.name}
                    subtitle={memberSubtitle(m)}
                    photo={m.photo ?? null}
                    university={m.university}
                    mode="suggested"
                    disabled={!canEdit}
                    onAction={() => onSignIn(m)}
                    onEdit={canEdit ? () => editRosterEntry(m) : undefined}
                  />
                </FadeInView>
              ))}
              {visibleUnsigned.length < unsignedList.length ? (
                <Btn
                  title={`Load more (${unsignedList.length - visibleUnsigned.length} left)`}
                  variant="ghost"
                  onPress={() =>
                    setUnsignedLimit((limit) => limit + ROSTER_PAGE_SIZE)
                  }
                />
              ) : null}
            </>
          )}

          {orderedAttendance.length > 0 ? (
            <>
              <Text style={[typography.label, styles.section, { color: t.muted }]}>
                Signed in · {orderedAttendance.length}
              </Text>
              <ReorderableList
                items={visibleSignedIn}
                keyExtractor={(row) => row._id}
                reorderEnabled={canEdit}
                onReorder={reorderVisibleSignedIn}
                renderItem={(a, _index, { dragHandle }) => (
                  <View style={styles.draggableRow}>
                    {canEdit ? (
                      <View style={styles.dragHandleSlot}>{dragHandle}</View>
                    ) : null}
                    <View style={styles.draggableContent}>
                      <AttendanceRow
                        name={a.name}
                        subtitle={signedInSubtitle(a.signInTime, a.notes)}
                        photo={a.photo ?? null}
                        university={a.university}
                        mode="signedIn"
                        disabled={!canEdit}
                        onAction={() => onSignOut(a)}
                        onEdit={canEdit ? () => editSignedIn(a) : undefined}
                      />
                    </View>
                  </View>
                )}
              />
              {visibleSignedIn.length < orderedAttendance.length ? (
                <Btn
                  title={`Load more (${orderedAttendance.length - visibleSignedIn.length} left)`}
                  variant="ghost"
                  onPress={() =>
                    setSignedInLimit((limit) => limit + ROSTER_PAGE_SIZE)
                  }
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
      <View style={{ height: spacing.xxl }} />

      {metadataFields ? (
        <EditMemberSheet
          visible={editOpen}
          onClose={closeEdit}
          year={event.year}
          memberId={editMemberId}
          metadataFields={metadataFields}
          eventAttendance={editAttendance}
        />
      ) : null}
      <CreateEventSheet
        visible={eventEditOpen}
        onClose={() => setEventEditOpen(false)}
        onDeleted={() => router.back()}
        year={event.year}
        subgroup={event.subgroups[0] ?? SOW_SUBGROUP}
        subgroups={subgroups}
        event={event}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  metaActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  editEventButton: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  editEventText: { fontWeight: "700" },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: spacing.sm,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15 },
  section: { marginTop: spacing.md, marginBottom: spacing.sm },
  draggableRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dragHandleSlot: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
    marginBottom: spacing.sm,
  },
  draggableContent: {
    flex: 1,
    minWidth: 0,
  },
});
