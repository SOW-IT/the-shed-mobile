import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  contrastingText,
  eventHasEnded,
  formatEventDate,
  formatSignInTime,
  SOW_SUBGROUP,
  subgroupColour,
  subgroupLabel,
} from "../../../../shared/rollcall";
import { eventStaffYear, sydneyCalendarYear } from "../../../../shared/flow";
import { AttendanceRow } from "@/components/AttendanceRow";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { CreateEventSheet } from "@/components/attendance/CreateEventSheet";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import { ExportSheet } from "@/components/attendance/ExportSheet";
import {
  Btn,
  ConfirmDialog,
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
/** The not-signed-in list starts short; "Load more" reveals the rest. */
const UNSIGNED_PAGE_SIZE = 10;

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
  row.email
    ? `staff:${row.email.toLowerCase()}`
    : row.memberId
      ? `member:${row.memberId}`
      : "";

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
    event ? { year: eventStaffYear(event.dateStart), subgroup: eventSubgroup, eventId: evId } : "skip"
  );
  const signIn = useMutation(api.attendance.signIn);
  const signOut = useMutation(api.attendance.signOut);
  const ensureForStaff = useMutation(api.attendanceMembers.ensureForStaff);
  const metadataFields = useQuery(
    api.attendanceMetadata.list,
    event ? { subgroup: eventSubgroup } : "skip"
  );
  const subgroups = useQuery(api.events.subgroups);

  // Optimistic state: track sign-ins/outs that have been swiped but not yet
  // confirmed by the Convex query. This keeps total list height constant during
  // the swipe animation.
  const [optimisticSignedIn, setOptimisticSignedIn] = useState<
    Map<string, NonNullable<typeof roster>[number]>
  >(new Map());
  const [optimisticSignedOut, setOptimisticSignedOut] = useState<Set<string>>(
    new Set()
  );

  // Remote animation state: rows changed by another client. We hold them in
  // their source list with exiting=true while they collapse, and in the
  // destination list with entering=true while they expand.
  const [remoteSignedIn, setRemoteSignedIn] = useState<Set<string>>(new Set());
  const [remoteSignedOut, setRemoteSignedOut] = useState<Set<string>>(new Set());

  // Reveal triggers: incremented when the row above is swiped, so the next
  // row in the list plays a slide-in animation simultaneously.
  const [revealTriggers, setRevealTriggers] = useState<Map<string, number>>(new Map());
  const triggerReveal = (key: string) =>
    setRevealTriggers((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));

  // Keys that transitioned from optimistic → real this session. Their real rows
  // must not re-run the FadeInView entrance since the row was already visible.
  const [suppressFadeIn, setSuppressFadeIn] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [eventEditOpen, setEventEditOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editMemberId, setEditMemberId] = useState<Id<"attendanceMembers"> | null>(
    null
  );
  const [editAttendance, setEditAttendance] = useState<{
    attendanceId: Id<"attendance">;
    notes?: string;
  } | null>(null);
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [confirmEnableEdit, setConfirmEnableEdit] = useState(false);
  const [unsignedLimit, setUnsignedLimit] = useState(UNSIGNED_PAGE_SIZE);
  const [signedInLimit, setSignedInLimit] = useState(ROSTER_PAGE_SIZE);
  const [searchLimit, setSearchLimit] = useState(ROSTER_PAGE_SIZE);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset unlock when opening another event
    setEditUnlocked(false);
  }, [event?._id]);

  // Any event — including past years — can be edited; an event that has merely
  // ended asks for an explicit "Enable editing" tap first to avoid accidental
  // changes. Members are editable wherever attendance is.
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

  // Track previous signedInKeys to detect remote changes.
  const prevSignedInKeysRef = useRef<Set<string>>(new Set());

  // Sync optimistic + remote animation state whenever signedInKeys changes.
  // Reads optimisticSignedIn/Out directly (not via updater) so classification
  // happens against the snapshot at the moment the query fires — not against
  // state after a prior updater has already mutated it.
  useEffect(() => {
    const prev = prevSignedInKeysRef.current;
    const next = signedInKeys;
    prevSignedInKeysRef.current = next;

    const added = [...next].filter((k) => !prev.has(k));
    const removed = [...prev].filter((k) => !next.has(k));
    if (added.length === 0 && removed.length === 0) return;

    // Classify using the current snapshot of optimistic state.
    const confirmedSignedIn = added.filter((k) => optimisticSignedIn.has(k));
    const genuinelyRemoteSignedIn = added.filter((k) => !optimisticSignedIn.has(k));
    const confirmedSignedOut = removed.filter((k) => optimisticSignedOut.has(k));
    const genuinelyRemoteSignedOut = removed.filter((k) => !optimisticSignedOut.has(k));

    if (confirmedSignedIn.length > 0) {
      setOptimisticSignedIn((o) => { const n = new Map(o); for (const k of confirmedSignedIn) n.delete(k); return n.size < o.size ? n : o; });
      setSuppressFadeIn((s) => { const n = new Set(s); for (const k of confirmedSignedIn) n.add(k); return n; });
    }
    if (confirmedSignedOut.length > 0)
      setOptimisticSignedOut((o) => { const n = new Set(o); for (const k of confirmedSignedOut) n.delete(k); return n.size < o.size ? n : o; });
    if (genuinelyRemoteSignedIn.length > 0)
      setRemoteSignedIn((r) => { const n = new Set(r); for (const k of genuinelyRemoteSignedIn) n.add(k); return n; });
    if (genuinelyRemoteSignedOut.length > 0)
      setRemoteSignedOut((r) => { const n = new Set(r); for (const k of genuinelyRemoteSignedOut) n.add(k); return n; });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- optimisticSignedIn/Out read as snapshot; only re-run when query fires
  }, [signedInKeys]);

  const searchQuery = search.trim().toLowerCase();
  const isSearching = searchQuery.length > 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging when roster/search changes
    setUnsignedLimit(UNSIGNED_PAGE_SIZE);
    setSignedInLimit(ROSTER_PAGE_SIZE);
    setSearchLimit(ROSTER_PAGE_SIZE);
  }, [search, signedInKeys]);

  // Signed-in members display newest-first, as returned by the backend.
  const rosterByKey = useMemo(() => {
    const map = new Map<string, NonNullable<typeof roster>[number]>();
    for (const m of roster ?? []) map.set(m.key, m);
    return map;
  }, [roster]);

  // Signed-in members display newest-first, as returned by the backend.
  // Prepend optimistic/remote sign-ins (entering from height 0). Also retain
  // remotely signed-out rows (exiting=true) until their collapse completes.
  const signedInList = useMemo(() => {
    // Entering keys — shown as synthetic rows; suppress their real counterpart
    // to avoid duplicate keys in the render until the cleanup effect fires.
    const enteringKeys = new Set([...optimisticSignedIn.keys(), ...remoteSignedIn]);
    const real = (attendance ?? []).filter((a) => !enteringKeys.has(personKey(a)));
    // Exiting rows: retain in list for their collapse animation.
    const exitingRows = [...remoteSignedOut]
      .map((key) => attendanceByKey.get(key))
      .filter((a): a is NonNullable<typeof attendance>[number] => a != null);
    const withExiting = exitingRows.length > 0 ? [...exitingRows, ...real] : real;
    if (enteringKeys.size === 0) return withExiting;
    const pending = [...enteringKeys]
      .map((key) => rosterByKey.get(key))
      .filter((m): m is NonNullable<typeof roster>[number] => m != null)
      .map((m) => ({
        _id: `optimistic:${m.key}` as NonNullable<typeof attendance>[number]["_id"],
        _creationTime: Date.now(),
        eventId: evId,
        name: m.name,
        photo: m.photo ?? null,
        university: m.university,
        email: m.email ?? null,
        memberId: m.memberId ?? null,
        signInTime: Date.now(),
        notes: undefined,
        key: m.key,
      })) as unknown as NonNullable<typeof attendance>;
    return [...pending, ...withExiting];
  }, [attendance, optimisticSignedIn, remoteSignedIn, remoteSignedOut, attendanceByKey, rosterByKey, evId]);

  // Not-signed-in members. Prepend optimistic/remote sign-outs as entering rows.
  // Also retain remotely signed-in rows (exiting=true) until their collapse completes.
  const unsignedList = useMemo(() => {
    // Entering keys — shown as dedicated rows; suppress their real counterpart
    // to avoid duplicate keys until the cleanup effect fires.
    const enteringKeys = new Set([...optimisticSignedOut, ...remoteSignedOut]);
    const real = (roster ?? []).filter(
      (m) => !signedInKeys.has(m.key) && !enteringKeys.has(m.key)
    );
    // Exiting rows: retain in list for their collapse animation.
    const exitingRows = [...remoteSignedIn]
      .map((key) => rosterByKey.get(key))
      .filter((m): m is NonNullable<typeof roster>[number] => m != null);
    const withExiting = exitingRows.length > 0 ? [...exitingRows, ...real] : real;
    if (enteringKeys.size === 0) return withExiting;
    const pending = [...enteringKeys]
      .map((key) => rosterByKey.get(key))
      .filter((m): m is NonNullable<typeof roster>[number] => m != null);
    return [...pending, ...withExiting];
  }, [roster, signedInKeys, optimisticSignedOut, remoteSignedIn, remoteSignedOut, rosterByKey]);

  // Members that newly appear in the not-signed-in list since the previous
  // render. Their card expands its height in (0 → 72) so the list grows
  // smoothly rather than the new row popping in at full height. The first
  // population is skipped — FadeInView handles the initial staggered entrance.
  const prevUnsignedKeysRef = useRef<Set<string> | null>(null);
  const newlyAddedUnsigned = useMemo(() => {
    const prev = prevUnsignedKeysRef.current;
    if (prev === null) return new Set<string>();
    const added = new Set<string>();
    for (const m of unsignedList) if (!prev.has(m.key)) added.add(m.key);
    return added;
  }, [unsignedList]);
  useEffect(() => {
    prevUnsignedKeysRef.current = new Set(unsignedList.map((m) => m.key));
  }, [unsignedList]);

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return (roster ?? []).filter(
      (m) =>
        m.name.toLowerCase().includes(searchQuery) ||
        (m.email?.toLowerCase().includes(searchQuery) ?? false)
    );
  }, [roster, isSearching, searchQuery]);

  // Optimistic counts: base server count ± pending swipes, so the pill and
  // section headers update the moment a swipe commits rather than waiting for
  // the Convex round-trip to confirm.
  const optimisticSignedInCount =
    (attendance?.length ?? 0) + optimisticSignedIn.size - optimisticSignedOut.size;
  const rosterSize = roster?.length ?? 0;
  const optimisticUnsignedCount = Math.max(0, rosterSize - optimisticSignedInCount);

  const visibleUnsigned = unsignedList.slice(0, unsignedLimit);
  const visibleSignedIn = signedInList.slice(0, signedInLimit);
  const visibleSearchResults = searchResults.slice(0, searchLimit);

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

  const onSignInStart = (m: NonNullable<typeof roster>[number]) => {
    setOptimisticSignedIn((prev) => new Map(prev).set(m.key, m));
  };
  const onSignIn = (m: NonNullable<typeof roster>[number]) => {
    if (!canEdit) return;
    hapticSelect();
    if (m.kind === "staff" && m.email) {
      void signIn({ eventId: evId, email: m.email });
    } else if (m.memberId) {
      void signIn({ eventId: evId, memberId: m.memberId as Id<"attendanceMembers"> });
    }
  };
  const onSignOutStart = (a: NonNullable<typeof attendance>[number]) => {
    const key = personKey(a);
    if (key) setOptimisticSignedOut((prev) => new Set(prev).add(key));
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
          staffEmail: opts.staffEmail,
          // Verify the profile against the event's staff year, matching the
          // roster, so an Oct–Dec event resolves the right year's profile.
          staffYear: event ? eventStaffYear(event.dateStart) : undefined,
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
        pastEvent ? (
          <FooterAction
            title={editUnlocked ? "Disable editing" : "Enable editing"}
            onPress={() => {
              hapticSelect();
              if (editUnlocked) setEditUnlocked(false);
              else setConfirmEnableEdit(true);
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export event attendance"
            onPress={() => setExportOpen(true)}
            style={({ pressed }) => [
              styles.editEventButton,
              { borderColor: t.primary },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="download-outline" size={14} color={t.primary} />
          </Pressable>
          <View style={[styles.countPill, { backgroundColor: t.primarySoft }]}>
            <Ionicons name="people" size={14} color={t.primary} />
            <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
              {optimisticSignedInCount}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.badgeRow}>
        {event.subgroups.map((s) => {
          const colour = subgroupColour(s);
          return (
            <View key={s} style={[styles.subgroupPill, { backgroundColor: colour }]}>
              <Text
                style={[
                  typography.caption,
                  styles.subgroupPillText,
                  { color: contrastingText(colour) },
                ]}
              >
                {subgroupLabel(s)}
              </Text>
            </View>
          );
        })}
        {event.tags?.map((tag) => (
          <AttendanceTagPill key={tag._id} name={tag.name} colour={tag.colour} small />
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
          {/* Not-signed-in list sits above the signed-in list. The signed-in
              rows are still staggered first (see staggerIndex below), so on
              initial load they animate in before the not-signed-in remainder. */}
          <Text style={[typography.label, styles.section, { color: t.muted }]}>
            Not signed in · {optimisticUnsignedCount}
          </Text>
          {unsignedList.length === 0 ? (
            <Muted>Everyone in the pool is signed in 🎉</Muted>
          ) : (
            <>
              {visibleUnsigned.map((m, index) => {
                const isEntering =
                  optimisticSignedOut.has(m.key) ||
                  remoteSignedOut.has(m.key) ||
                  newlyAddedUnsigned.has(m.key);
                const isExiting = remoteSignedIn.has(m.key);
                const isAnimating = isEntering || isExiting;
                const staggerIndex = visibleSignedIn.length + index;
                const nextKey = visibleUnsigned[index + 1]?.key;
                const row = (
                  <AttendanceRow
                    name={m.name}
                    subtitle={memberSubtitle(m)}
                    photo={m.photo ?? null}
                    university={m.university}
                    mode="suggested"
                    disabled={!canEdit || isAnimating}
                    entering={isEntering}
                    exiting={isExiting}
                    revealTrigger={revealTriggers.get(m.key) ?? 0}
                    onExited={isExiting ? () => setRemoteSignedIn((s) => { const n = new Set(s); n.delete(m.key); return n; }) : undefined}
                    onActionStart={isAnimating ? undefined : () => { onSignInStart(m); if (nextKey) triggerReveal(nextKey); }}
                    onAction={() => { if (!isAnimating) onSignIn(m); }}
                    onEdit={canEdit && !isAnimating ? () => editRosterEntry(m) : undefined}
                  />
                );
                return isAnimating ? (
                  <View key={m.key}>{row}</View>
                ) : (
                  <FadeInView key={m.key} delay={Math.min(staggerIndex, 12) * 35}>{row}</FadeInView>
                );
              })}
              {visibleUnsigned.length < unsignedList.length ? (
                <Btn
                  title={`Load more (${unsignedList.length - visibleUnsigned.length} left)`}
                  variant="ghost"
                  onPress={() =>
                    setUnsignedLimit((limit) => limit + UNSIGNED_PAGE_SIZE)
                  }
                />
              ) : null}
            </>
          )}

          {signedInList.length > 0 ? (
            <>
              <Text style={[typography.label, styles.section, { color: t.muted }]}>
                Signed in · {optimisticSignedInCount}
              </Text>
              {visibleSignedIn.map((a, index) => {
                const isEntering = (a._id as string).startsWith("optimistic:");
                const isExiting = remoteSignedOut.has(personKey(a));
                const isAnimating = isEntering || isExiting;
                const aKey = personKey(a);
                const isSuppressed = suppressFadeIn.has(aKey);
                const nextKey = personKey(visibleSignedIn[index + 1] ?? {});
                // Key by the stable person key (not _id) so the optimistic
                // synthetic row and its confirmed real row share one instance —
                // the mutation landing flips `entering` false without remounting,
                // so the spawn-in animation never replays.
                const rowKey = aKey || (a._id as string);
                const row = (
                  <AttendanceRow
                    name={a.name}
                    subtitle={signedInSubtitle(a.signInTime, a.notes)}
                    photo={a.photo ?? null}
                    university={a.university}
                    mode="signedIn"
                    disabled={!canEdit || isAnimating}
                    entering={isEntering}
                    exiting={isExiting}
                    revealTrigger={revealTriggers.get(aKey) ?? 0}
                    onExited={isExiting ? () => setRemoteSignedOut((s) => { const n = new Set(s); n.delete(aKey); return n; }) : undefined}
                    onActionStart={isAnimating ? undefined : () => { onSignOutStart(a); if (nextKey) triggerReveal(nextKey); }}
                    onAction={() => { if (!isAnimating) onSignOut(a); }}
                    onEdit={canEdit && !isAnimating ? () => editSignedIn(a) : undefined}
                  />
                );
                return isAnimating || isSuppressed ? (
                  <View key={rowKey}>{row}</View>
                ) : (
                  <FadeInView key={rowKey} delay={Math.min(index, 12) * 35}>{row}</FadeInView>
                );
              })}
              {visibleSignedIn.length < signedInList.length ? (
                <Btn
                  title={`Load more (${signedInList.length - visibleSignedIn.length} left)`}
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
          year={sydneyCalendarYear(new Date(event.dateStart))}
          staffYear={eventStaffYear(event.dateStart)}
          memberId={editMemberId}
          metadataFields={metadataFields}
          eventAttendance={editAttendance}
        />
      ) : null}
      <CreateEventSheet
        visible={eventEditOpen}
        onClose={() => setEventEditOpen(false)}
        onDeleted={() => router.back()}
        year={eventStaffYear(event.dateStart)}
        subgroup={event.subgroups[0] ?? SOW_SUBGROUP}
        subgroups={subgroups}
        event={event}
      />
      <ExportSheet
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        year={eventStaffYear(event.dateStart)}
        subgroup={event.subgroups[0] ?? SOW_SUBGROUP}
        eventId={evId}
      />
      <ConfirmDialog
        visible={confirmEnableEdit}
        title="Enable editing"
        message="This event has ended. Enable editing to change its attendance?"
        confirmLabel="Enable editing"
        destructive={false}
        onConfirm={() => setEditUnlocked(true)}
        onClose={() => setConfirmEnableEdit(false)}
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
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  subgroupPill: {
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  subgroupPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
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
});
