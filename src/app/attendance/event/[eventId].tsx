import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  canReverseSignIn,
  contrastingText,
  eventHasEnded,
  formatEventRange,
  formatSignInTime,
  personKey,
  SOW_SUBGROUP,
  subgroupColour,
  subgroupLabel,
} from "@shared/rollcall";
import { eventStaffYear, sydneyCalendarYear } from "@shared/flow";
import { AttendanceRow, ATTENDANCE_ROW_ENTER_MS } from "@/components/AttendanceRow";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { CreateEventSheet } from "@/components/attendance/CreateEventSheet";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import { ExportSheet } from "@/components/attendance/ExportSheet";
import {
  ConfirmDialog,
  EmptyState,
  errorMessage,
  FadeInView,
  FooterAction,
  hapticSelect,
  LoadingState,
  Muted,
  Screen,
  SowSpinner,
  type ToastState,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const ROSTER_PAGE_SIZE = 30;
const UNSIGNED_PAGE_SIZE = 10;
const UNSIGNED_ROW_HEIGHT = 72 + spacing.sm;
const UNSIGNED_LIST_HEIGHT = UNSIGNED_ROW_HEIGHT * 3;

const TWO_COLUMN_MIN_WIDTH = 700;

const NEWLY_ADDED_CLEAR_MS = ATTENDANCE_ROW_ENTER_MS + 40;

const memberSubtitle = (member: {
  roles: string[];
  subtitle?: string;
}): string | undefined => {
  if (member.subtitle) return member.subtitle;
  if (member.roles.length > 0) return member.roles.join(" · ");
  return undefined;
};

const signedInSubtitle = (member: {
  signInTime: number;
  notes?: string;
  roles: string[];
  subtitle?: string;
}): string => {
  const org = member.roles.length > 0 ? member.roles.join(" · ") : "";
  const info = [org, member.subtitle].filter(Boolean).join(" · ");
  const trimmed = member.notes?.trim();
  const notePreview = trimmed
    ? trimmed.length > 36
      ? `${trimmed.slice(0, 36)}…`
      : trimmed
    : "";
  return [formatSignInTime(member.signInTime), info, notePreview]
    .filter(Boolean)
    .join(" · ");
};

function CountChip({
  count,
  accessibilityLabel,
}: {
  count: number;
  accessibilityLabel: string;
}) {
  const t = useAppTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[styles.countPill, { backgroundColor: t.primarySoft }]}
    >
      <Ionicons name="people" size={14} color={t.primary} accessible={false} />
      <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
        {count}
      </Text>
    </View>
  );
}

export default function EventAttendanceScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const footerBottomOffset = insets.bottom + spacing.xl;
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const evId = eventId as Id<"events">;

  const event = useQuery(api.events.get, { eventId: evId });
  const attendance = useQuery(api.attendance.listByEvent, { eventId: evId });
  const eventSubgroup = event?.subgroups[0];
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

  const [optimisticSignedIn, setOptimisticSignedIn] = useState<
    Map<string, NonNullable<typeof roster>[number]>
  >(new Map());
  const [optimisticSignedOut, setOptimisticSignedOut] = useState<Set<string>>(
    new Set()
  );
  const [signedOutOrder, setSignedOutOrder] = useState<string[]>([]);

  const [remoteSignedIn, setRemoteSignedIn] = useState<Set<string>>(new Set());
  const [remoteSignedOut, setRemoteSignedOut] = useState<
    Map<string, NonNullable<typeof attendance>[number]>
  >(new Map());

  const [revealTriggers, setRevealTriggers] = useState<Map<string, number>>(new Map());
  const triggerReveal = (key: string) =>
    setRevealTriggers((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));

  const [suppressFadeIn, setSuppressFadeIn] = useState<Set<string>>(new Set());
  const [suppressUnsignedFadeIn, setSuppressUnsignedFadeIn] = useState<Set<string>>(
    new Set()
  );

  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [eventEditOpen, setEventEditOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createMemberOpen, setCreateMemberOpen] = useState(false);
  const [createPrefillName, setCreatePrefillName] = useState("");
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
  const lastUnsignedEndHeight = useRef(-1);
  const lastSignedInEndHeight = useRef(-1);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset unlock when opening another event
    setEditUnlocked(false);
  }, [event?._id]);

  const pastEvent = event != null && eventHasEnded(event.dateEnd);
  const canEdit = !pastEvent || editUnlocked;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const twoColumn = windowWidth >= TWO_COLUMN_MIN_WIDTH;

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

  const prevSignedInKeysRef = useRef<Set<string>>(new Set());
  const prevAttendanceByKeyRef = useRef<
    Map<string, NonNullable<typeof attendance>[number]>
  >(new Map());
  const remoteSyncInitializedRef = useRef(false);

  useEffect(() => {
    const prevByKey = prevAttendanceByKeyRef.current;
    prevAttendanceByKeyRef.current = attendanceByKey;

    if (!remoteSyncInitializedRef.current) {
      if (attendance === undefined) return;
      remoteSyncInitializedRef.current = true;
      prevSignedInKeysRef.current = signedInKeys;
      return;
    }

    const prev = prevSignedInKeysRef.current;
    const next = signedInKeys;
    prevSignedInKeysRef.current = next;

    const added = [...next].filter((k) => !prev.has(k));
    const removed = [...prev].filter((k) => !next.has(k));
    if (added.length === 0 && removed.length === 0) return;

    if (added.length > 0) {
      const addedSet = new Set(added);
      setSignedOutOrder((order) =>
        order.some((k) => addedSet.has(k))
          ? order.filter((k) => !addedSet.has(k))
          : order
      );
    }

    const confirmedSignedIn = added.filter((k) => optimisticSignedIn.has(k));
    const genuinelyRemoteSignedIn = added.filter((k) => !optimisticSignedIn.has(k));
    const confirmedSignedOut = removed.filter((k) => optimisticSignedOut.has(k));
    const genuinelyRemoteSignedOut = removed.filter((k) => !optimisticSignedOut.has(k));

    if (confirmedSignedIn.length > 0) {
      setOptimisticSignedIn((o) => { const n = new Map(o); for (const k of confirmedSignedIn) n.delete(k); return n.size < o.size ? n : o; });
      setSuppressFadeIn((s) => { const n = new Set(s); for (const k of confirmedSignedIn) n.add(k); return n; });
    }
    if (confirmedSignedOut.length > 0) {
      setOptimisticSignedOut((o) => { const n = new Set(o); for (const k of confirmedSignedOut) n.delete(k); return n.size < o.size ? n : o; });
      setSuppressUnsignedFadeIn((s) => { const n = new Set(s); for (const k of confirmedSignedOut) n.add(k); return n; });
    }
    if (genuinelyRemoteSignedIn.length > 0)
      setRemoteSignedIn((r) => { const n = new Set(r); for (const k of genuinelyRemoteSignedIn) n.add(k); return n; });
    if (genuinelyRemoteSignedOut.length > 0)
      setRemoteSignedOut((r) => {
        const n = new Map(r);
        for (const k of genuinelyRemoteSignedOut) {
          const row = prevByKey.get(k);
          if (row) n.set(k, row);
        }
        return n;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- optimisticSignedIn/Out + attendance read as snapshot; only re-run when query fires
  }, [signedInKeys]);

  const searchQuery = search.trim().toLowerCase();
  const isSearching = searchQuery.length > 0;

  const columnsRef = useRef<View>(null);
  const [columnsHeight, setColumnsHeight] = useState<number>();
  const hasFooter = (isSearching && canEdit) || pastEvent;
  const measureColumns = useCallback(() => {
    columnsRef.current?.measureInWindow((_x, y) => {
      const gap = insets.bottom + (hasFooter ? 96 : spacing.md);
      const h = windowHeight - y - gap;
      setColumnsHeight(h > 120 ? h : undefined);
    });
  }, [windowHeight, insets.bottom, hasFooter]);
  useEffect(() => {
    measureColumns();
  }, [measureColumns, twoColumn]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging when roster/search changes
    setUnsignedLimit(UNSIGNED_PAGE_SIZE);
    setSignedInLimit(ROSTER_PAGE_SIZE);
    lastUnsignedEndHeight.current = -1;
    lastSignedInEndHeight.current = -1;
  }, [search, signedInKeys, event?._id]);

  const rosterByKey = useMemo(() => {
    const map = new Map<string, NonNullable<typeof roster>[number]>();
    for (const m of roster ?? []) map.set(m.key, m);
    return map;
  }, [roster]);

  const signedInList = useMemo(() => {
    const enteringKeys = new Set([...optimisticSignedIn.keys(), ...remoteSignedIn]);
    const real = (attendance ?? []).filter((a) => !enteringKeys.has(personKey(a)));
    const exitingRows = [...remoteSignedOut.values()];
    const withExiting = exitingRows.length > 0 ? [...exitingRows, ...real] : real;
    if (enteringKeys.size === 0) return withExiting;
    // eslint-disable-next-line react-hooks/purity -- optimistic placeholder timestamp, replaced on confirm
    const now = Date.now();
    const pending = [...enteringKeys]
      .map((key) => rosterByKey.get(key))
      .filter((m): m is NonNullable<typeof roster>[number] => m != null)
      .map((m) => ({
        _id: `optimistic:${m.key}` as NonNullable<typeof attendance>[number]["_id"],
        _creationTime: now,
        eventId: evId,
        name: m.name,
        photo: m.photo ?? null,
        university: m.university,
        email: m.email ?? null,
        memberId: m.memberId ?? null,
        roles: m.roles,
        campuses: m.campuses,
        signInTime: now,
        notes: undefined,
        key: m.key,
      })) as unknown as NonNullable<typeof attendance>;
    return [...pending, ...withExiting];
  }, [attendance, optimisticSignedIn, remoteSignedIn, remoteSignedOut, rosterByKey, evId]);

  const unsignedList = useMemo(() => {
    const enteringKeys = new Set([...optimisticSignedOut, ...remoteSignedOut.keys()]);
    const real = (roster ?? []).filter(
      (m) => !signedInKeys.has(m.key) && !enteringKeys.has(m.key)
    );
    const exitingRows = [...remoteSignedIn]
      .map((key) => rosterByKey.get(key))
      .filter((m): m is NonNullable<typeof roster>[number] => m != null);
    const withExiting = exitingRows.length > 0 ? [...exitingRows, ...real] : real;
    const pending = [...enteringKeys]
      .map((key) => rosterByKey.get(key))
      .filter((m): m is NonNullable<typeof roster>[number] => m != null);
    const combined = enteringKeys.size === 0 ? withExiting : [...pending, ...withExiting];

    if (signedOutOrder.length === 0) return combined;
    const rank = new Map(signedOutOrder.map((k, i) => [k, i]));
    const pinned: NonNullable<typeof roster> = [];
    const rest: NonNullable<typeof roster> = [];
    for (const m of combined) (rank.has(m.key) ? pinned : rest).push(m);
    pinned.sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
    return [...pinned, ...rest];
  }, [roster, signedInKeys, optimisticSignedOut, remoteSignedIn, remoteSignedOut, rosterByKey, signedOutOrder]);

  const unsignedKeySig = useMemo(
    () => unsignedList.map((m) => m.key).join(" "),
    [unsignedList]
  );
  const [prevUnsignedSig, setPrevUnsignedSig] = useState<string | null>(null);
  const [newlyAddedUnsigned, setNewlyAddedUnsigned] = useState<Set<string>>(
    () => new Set()
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per-event baseline
    setPrevUnsignedSig(null);
    setNewlyAddedUnsigned(new Set());
    setSignedOutOrder([]);
    setSuppressUnsignedFadeIn(new Set());
  }, [event?._id]);
  if (roster !== undefined && prevUnsignedSig !== unsignedKeySig) {
    const prevKeys =
      prevUnsignedSig === null
        ? null
        : new Set(prevUnsignedSig.split(" ").filter(Boolean));
    const added = new Set<string>();
    if (prevKeys) {
      for (const m of unsignedList) if (!prevKeys.has(m.key)) added.add(m.key);
    }
    setPrevUnsignedSig(unsignedKeySig);
    setNewlyAddedUnsigned(added);
  }

  useEffect(() => {
    if (newlyAddedUnsigned.size === 0) return;
    const keys = newlyAddedUnsigned;
    const timer = setTimeout(() => {
      setSuppressUnsignedFadeIn((s) => {
        const n = new Set(s);
        for (const k of keys) n.add(k);
        return n;
      });
      setNewlyAddedUnsigned((prev) => (prev === keys ? new Set() : prev));
    }, NEWLY_ADDED_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [newlyAddedUnsigned]);

  const matchesSearch = useCallback(
    (p: {
      name: string;
      email?: string | null;
      subtitle?: string;
      roles?: string[];
      university?: string;
    }) =>
      p.name.toLowerCase().includes(searchQuery) ||
      (p.email?.toLowerCase().includes(searchQuery) ?? false) ||
      (p.subtitle?.toLowerCase().includes(searchQuery) ?? false) ||
      (p.roles?.some((role) => role.toLowerCase().includes(searchQuery)) ??
        false) ||
      (p.university?.toLowerCase().includes(searchQuery) ?? false),
    [searchQuery]
  );
  const filteredUnsignedList = useMemo(
    () => (isSearching ? unsignedList.filter(matchesSearch) : unsignedList),
    [unsignedList, isSearching, matchesSearch]
  );
  const filteredSignedInList = useMemo(
    () => (isSearching ? signedInList.filter(matchesSearch) : signedInList),
    [signedInList, isSearching, matchesSearch]
  );

  const pendingSignedIn = [...optimisticSignedIn.keys()].filter(
    (k) => !signedInKeys.has(k)
  ).length;
  const pendingSignedOut = [...optimisticSignedOut].filter((k) =>
    signedInKeys.has(k)
  ).length;
  const optimisticSignedInCount =
    (attendance?.length ?? 0) + pendingSignedIn - pendingSignedOut;
  const rosterSize = roster?.length ?? 0;
  const optimisticUnsignedCount = Math.max(0, rosterSize - optimisticSignedInCount);

  const visibleUnsigned = filteredUnsignedList.slice(0, unsignedLimit);
  const visibleSignedIn = filteredSignedInList.slice(0, signedInLimit);
  const hasMoreUnsigned = visibleUnsigned.length < filteredUnsignedList.length;
  const hasMoreSignedIn = visibleSignedIn.length < filteredSignedInList.length;

  const onUnsignedScroll = useCallback(
    (e: { nativeEvent: { layoutMeasurement: { height: number }; contentOffset: { y: number }; contentSize: { height: number } } }) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (contentSize.height < lastUnsignedEndHeight.current) {
        lastUnsignedEndHeight.current = -1;
      }
      if (!hasMoreUnsigned) return;
      const distance =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distance < 200 && contentSize.height > lastUnsignedEndHeight.current) {
        lastUnsignedEndHeight.current = contentSize.height;
        setUnsignedLimit((limit) => limit + UNSIGNED_PAGE_SIZE);
      }
    },
    [hasMoreUnsigned]
  );
  const onSignedInColumnScroll = useCallback(
    (e: { nativeEvent: { layoutMeasurement: { height: number }; contentOffset: { y: number }; contentSize: { height: number } } }) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (contentSize.height < lastSignedInEndHeight.current) {
        lastSignedInEndHeight.current = -1;
      }
      if (!hasMoreSignedIn) return;
      const distance =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distance < 200 && contentSize.height > lastSignedInEndHeight.current) {
        lastSignedInEndHeight.current = contentSize.height;
        setSignedInLimit((limit) => limit + ROSTER_PAGE_SIZE);
      }
    },
    [hasMoreSignedIn]
  );
  const loadMoreSignedIn = useCallback(() => {
    if (!hasMoreSignedIn) return;
    setSignedInLimit((limit) => limit + ROSTER_PAGE_SIZE);
  }, [hasMoreSignedIn]);

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
    setSignedOutOrder((order) =>
      order.includes(m.key) ? order.filter((k) => k !== m.key) : order
    );
  };
  const onSignIn = (m: NonNullable<typeof roster>[number]) => {
    if (!canEdit) return;
    hapticSelect();
    const onFailure = (e: unknown) => {
      setOptimisticSignedIn((prev) => {
        const next = new Map(prev);
        next.delete(m.key);
        return next;
      });
      setToast({ text: errorMessage(e) });
    };
    if (m.kind === "staff" && m.email) {
      void signIn({ eventId: evId, email: m.email }).catch(onFailure);
    } else if (m.memberId) {
      void signIn({ eventId: evId, memberId: m.memberId as Id<"attendanceMembers"> }).catch(
        onFailure
      );
    }
  };
  const onSignOutStart = (a: NonNullable<typeof attendance>[number]) => {
    const key = personKey(a);
    if (!key) return;
    setOptimisticSignedOut((prev) => new Set(prev).add(key));
    setSignedOutOrder((order) => [key, ...order.filter((k) => k !== key)]);
  };
  const onSignOut = (a: NonNullable<typeof attendance>[number]) => {
    if (!canEdit) return;
    hapticSelect();
    const key = personKey(a);
    const onFailure = (e: unknown) => {
      if (key) {
        setOptimisticSignedOut((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
      setToast({ text: errorMessage(e) });
    };
    if (a.email) void signOut({ eventId: evId, email: a.email }).catch(onFailure);
    else if (a.memberId) void signOut({ eventId: evId, memberId: a.memberId }).catch(onFailure);
  };

  const openMemberEdit = (memberId: Id<"attendanceMembers">) => {
    setEditMemberId(memberId);
    setEditOpen(true);
  };

  const openCreateMember = () => {
    if (!canEdit) return;
    hapticSelect();
    setCreatePrefillName(search.trim());
    setCreateMemberOpen(true);
  };

  const onMemberCreated = (memberId: Id<"attendanceMembers">) => {
    if (!canEdit) return;
    hapticSelect();
    void signIn({ eventId: evId, memberId }).catch((e) =>
      setToast({ text: errorMessage(e) })
    );
    setSearch("");
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
          staffYear: event ? eventStaffYear(event.dateStart) : undefined,
        });
      }
      if (id) openMemberEdit(id);
    } catch (e) {
      console.error("ensureForStaff failed", e);
      setToast({ text: errorMessage(e) });
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

  const notSignedInHeader = (
    <View style={[styles.section, styles.sectionHeader]}>
      <Text style={[typography.label, { color: t.muted }]}>Not signed in</Text>
      <CountChip
        count={optimisticUnsignedCount}
        accessibilityLabel={`${optimisticUnsignedCount} not signed in`}
      />
    </View>
  );

  const signedInHeader = (
    <View style={[styles.section, styles.sectionHeader]}>
      <Text style={[typography.label, { color: t.muted }]}>Signed in</Text>
      <CountChip
        count={optimisticSignedInCount}
        accessibilityLabel={`${optimisticSignedInCount} signed in`}
      />
    </View>
  );

  const unsignedRows = (
    <>
      {visibleUnsigned.map((m, index) => {
        const isEntering =
          optimisticSignedOut.has(m.key) ||
          remoteSignedOut.has(m.key) ||
          newlyAddedUnsigned.has(m.key);
        const isExiting = remoteSignedIn.has(m.key);
        const isAnimating = isEntering || isExiting;
        const isSuppressed = suppressUnsignedFadeIn.has(m.key);
        const staggerIndex = visibleSignedIn.length + index;
        const nextKey = visibleUnsigned[index + 1]?.key;
        const row = (
          <AttendanceRow
            name={m.name}
            subtitle={memberSubtitle(m)}
            photo={m.photo ?? null}
            university={m.university}
            roles={m.roles}
            mode="suggested"
            disabled={isAnimating || !canEdit}
            dimmed={!canEdit}
            entering={isEntering}
            exiting={isExiting}
            revealTrigger={revealTriggers.get(m.key) ?? 0}
            onExited={isExiting ? () => setRemoteSignedIn((s) => { const n = new Set(s); n.delete(m.key); return n; }) : undefined}
            onActionStart={isAnimating || !canEdit ? undefined : () => { onSignInStart(m); if (nextKey) triggerReveal(nextKey); }}
            onAction={() => { if (!isAnimating && canEdit) onSignIn(m); }}
            onEdit={!isAnimating && canEdit ? () => editRosterEntry(m) : undefined}
          />
        );
        return isAnimating || isSuppressed ? (
          <View key={m.key}>{row}</View>
        ) : (
          <FadeInView key={m.key} delay={Math.min(staggerIndex, 12) * 35}>{row}</FadeInView>
        );
      })}
      {visibleUnsigned.length < filteredUnsignedList.length ? (
        <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
          <SowSpinner size={28} />
        </View>
      ) : null}
    </>
  );

  const signedInRows = (
    <>
      {visibleSignedIn.map((a, index) => {
        const isEntering = (a._id as string).startsWith("optimistic:");
        const isExiting = remoteSignedOut.has(personKey(a));
        const isAnimating = isEntering || isExiting;
        const aKey = personKey(a);
        const isSuppressed = suppressFadeIn.has(aKey);
        const nextKey = personKey(visibleSignedIn[index + 1] ?? {});
        const rowKey = aKey || (a._id as string);
        const row = (
          <AttendanceRow
            name={a.name}
            subtitle={signedInSubtitle(a)}
            photo={a.photo ?? null}
            university={a.university}
            roles={a.roles}
            mode="signedIn"
            disabled={
              !canReverseSignIn(event, a.signInTime) || !canEdit || isAnimating
            }
            dimmed={!canReverseSignIn(event, a.signInTime) || !canEdit}
            entering={isEntering}
            exiting={isExiting}
            revealTrigger={revealTriggers.get(aKey) ?? 0}
            onExited={isExiting ? () => setRemoteSignedOut((s) => { const n = new Map(s); n.delete(aKey); return n; }) : undefined}
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
      {visibleSignedIn.length < filteredSignedInList.length ? (
        <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
          <SowSpinner size={28} />
        </View>
      ) : null}
    </>
  );

  const unsignedEmptyState = isSearching ? null : (
    <Muted>Everyone in the pool is signed in 🎉</Muted>
  );

  return (
    <Screen
      title={event.name}
      subtitle="Attendance"
      onBack={() => router.back()}
      toast={toast}
      maxWidth={840}
      stickyHeaderIndices={twoColumn ? undefined : [1]}
      onEndReached={
        !twoColumn && hasMoreSignedIn ? loadMoreSignedIn : undefined
      }
      headerRight={
        <View style={styles.headerMeta}>
          <View style={styles.headerActions}>
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
          <CountChip
            count={optimisticSignedInCount}
            accessibilityLabel={`${optimisticSignedInCount} signed in`}
          />
          </View>
          <Text style={[typography.caption, { color: t.muted }]}>
            {formatEventRange(event.dateStart, event.dateEnd)}
          </Text>
        </View>
      }
      footer={
        isSearching && canEdit ? (
          <FooterAction
            title={`Create "${
              search.trim().length > 22
                ? `${search.trim().slice(0, 22)}…`
                : search.trim()
            }"`}
            onPress={openCreateMember}
            bottomOffset={footerBottomOffset}
          />
        ) : pastEvent ? (
          <FooterAction
            title={editUnlocked ? "Disable editing" : "Enable editing"}
            note={
              editUnlocked
                ? null
                : "This event has ended. Tap Enable editing below to sign in a missed attendee or fix details. People who attended cannot be signed out."
            }
            onPress={() => {
              hapticSelect();
              if (editUnlocked) setEditUnlocked(false);
              else setConfirmEnableEdit(true);
            }}
            bottomOffset={footerBottomOffset}
          />
        ) : undefined
      }
    >
      <View collapsable={false}>
      <View style={styles.badgeRow}>
        <View style={styles.badgeGroup}>
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
        </View>
        {event.tags && event.tags.length > 0 ? (
          <View style={[styles.badgeGroup, styles.badgeGroupRight]}>
            {event.tags.map((tag) => (
              <AttendanceTagPill key={tag._id} name={tag.name} colour={tag.colour} small />
            ))}
          </View>
        ) : null}
      </View>

      </View>

      <View style={{ backgroundColor: t.background, paddingTop: spacing.sm }}>
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
          {search.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => setSearch("")}
            >
              <Ionicons name="close-circle" size={18} color={t.faint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {twoColumn ? (
        <View
          ref={columnsRef}
          onLayout={measureColumns}
          style={[
            styles.columns,
            columnsHeight != null ? { height: columnsHeight } : { flex: 1 },
          ]}
        >
          <View style={styles.column}>
            {notSignedInHeader}
            {filteredUnsignedList.length === 0 ? (
              unsignedEmptyState
            ) : (
              <ScrollView
                style={styles.columnScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                onScroll={onUnsignedScroll}
              >
                {unsignedRows}
              </ScrollView>
            )}
          </View>
          <View style={styles.column}>
            {signedInHeader}
            <ScrollView
              style={styles.columnScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={onSignedInColumnScroll}
            >
              {signedInRows}
            </ScrollView>
          </View>
        </View>
      ) : (
        <>
          {notSignedInHeader}
          {filteredUnsignedList.length === 0 ? (
            unsignedEmptyState
          ) : (
            <ScrollView
              style={styles.unsignedScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={onUnsignedScroll}
            >
              {unsignedRows}
            </ScrollView>
          )}
          {signedInHeader}
          <View>{signedInRows}</View>
        </>
      )}
      {twoColumn ? null : <View style={{ height: spacing.xxl }} />}

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
      {metadataFields ? (
        <EditMemberSheet
          visible={createMemberOpen}
          onClose={() => setCreateMemberOpen(false)}
          year={sydneyCalendarYear(new Date(event.dateStart))}
          staffYear={eventStaffYear(event.dateStart)}
          memberId={null}
          metadataFields={metadataFields}
          prefillName={createPrefillName}
          onCreated={onMemberCreated}
        />
      ) : null}
      <CreateEventSheet
        visible={eventEditOpen}
        onClose={() => setEventEditOpen(false)}
        onDeleted={() => router.back()}
        subgroup={event.subgroups[0] ?? SOW_SUBGROUP}
        subgroups={subgroups}
        event={event}
      />
      <ExportSheet
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        subgroup={event.subgroups[0] ?? SOW_SUBGROUP}
        eventId={evId}
      />
      <ConfirmDialog
        visible={confirmEnableEdit}
        title="Enable editing?"
        message="This event has ended."
        confirmLabel="Enable editing"
        destructive={false}
        onConfirm={() => setEditUnlocked(true)}
        onClose={() => setConfirmEnableEdit(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerMeta: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: -spacing.xs,
    marginBottom: -spacing.xs,
  },
  badgeGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    flexShrink: 1,
  },
  badgeGroupRight: {
    justifyContent: "flex-end",
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
  unsignedScroll: { height: UNSIGNED_LIST_HEIGHT, flexGrow: 0, flexShrink: 0 },
  columns: { flexDirection: "row", gap: spacing.md },
  column: { flex: 1, minWidth: 0 },
  columnScroll: { flex: 1 },
});
