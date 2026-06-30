import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
  Btn,
  ConfirmDialog,
  EmptyState,
  errorMessage,
  FadeInView,
  FooterAction,
  hapticSelect,
  LoadingState,
  Muted,
  Screen,
  type ToastState,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const ROSTER_PAGE_SIZE = 30;
/** The not-signed-in list starts short; "Load more" reveals the rest. */
const UNSIGNED_PAGE_SIZE = 10;
/** One AttendanceRow's vertical footprint: the 72px card + its bottom margin. */
const UNSIGNED_ROW_HEIGHT = 72 + spacing.sm;
/**
 * Fixed height of the not-signed-in list viewport (it scrolls internally), sized
 * to show exactly three member cards. Kept constant so signing people in/out —
 * which adds/removes rows — never changes the height of the surrounding page,
 * avoiding layout jumps under the list.
 */
const UNSIGNED_LIST_HEIGHT = UNSIGNED_ROW_HEIGHT * 3;

/** When to drop a row's "newly added" lock — a hair past its entrance grow-in,
 *  derived from the row's own animation duration so the two stay in sync. */
const NEWLY_ADDED_CLEAR_MS = ATTENDANCE_ROW_ENTER_MS + 40;

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

const signedInSubtitle = (signInTime: number, notes?: string): string => {
  const base = formatSignInTime(signInTime);
  const trimmed = notes?.trim();
  if (!trimmed) return base;
  const preview = trimmed.length > 36 ? `${trimmed.slice(0, 36)}…` : trimmed;
  return `${base} · ${preview}`;
};

/** Rounded people-count chip — reused for the header total and the two section
 *  headers so the "signed in / not signed in" counts share one consistent look.
 *  Takes a contextual label so the header chip (which has no adjacent text)
 *  announces e.g. "12 signed in" rather than a bare number to screen readers. */
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
  // This screen is a pushed route with no bottom tab bar, so the footer would
  // otherwise hug the very bottom edge. Lift it to clear the home indicator and
  // sit a little higher.
  const footerBottomOffset = insets.bottom + spacing.xl;
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
  // Keys signed out (reversed) this session, newest-first. Used to pin those
  // members to the top of the not-signed-in list and keep them there after the
  // mutation confirms — otherwise the refreshed roster would re-sort them into
  // their frequency-ranked slot and the row would jump from the top. A key is
  // dropped once the person is signed back in.
  const [signedOutOrder, setSignedOutOrder] = useState<string[]>([]);

  // Remote animation state: rows changed by another client. We hold them in
  // their source list with exiting=true while they collapse, and in the
  // destination list with entering=true while they expand.
  const [remoteSignedIn, setRemoteSignedIn] = useState<Set<string>>(new Set());
  // Maps key → the removed attendance row, captured from the snapshot before
  // the server dropped it, so the exiting signed-in row can still render its
  // collapse (the refreshed server list no longer contains that row).
  const [remoteSignedOut, setRemoteSignedOut] = useState<
    Map<string, NonNullable<typeof attendance>[number]>
  >(new Map());

  // Reveal triggers: incremented when the row above is swiped, so the next
  // row in the list plays a slide-in animation simultaneously.
  const [revealTriggers, setRevealTriggers] = useState<Map<string, number>>(new Map());
  const triggerReveal = (key: string) =>
    setRevealTriggers((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));

  // Keys that transitioned from optimistic → real this session. Their real rows
  // must not re-run the FadeInView entrance since the row was already visible.
  const [suppressFadeIn, setSuppressFadeIn] = useState<Set<string>>(new Set());
  // Same idea for the not-signed-in list: once a reversed (signed-out) member's
  // optimistic entrance has confirmed, keep their row wrapped in a plain View so
  // it doesn't flip to FadeInView and replay a reappear animation.
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset unlock when opening another event
    setEditUnlocked(false);
  }, [event?._id]);

  // Any event — including past years — can be edited; an event that has merely
  // ended asks for an explicit "Enable editing" tap first to avoid accidental
  // changes. Members are editable wherever attendance is.
  const pastEvent = event != null && eventHasEnded(event.dateEnd);
  // On a finished event every change — signing missed people in, signing out a
  // retroactive add, editing details — is gated behind an explicit "Enable
  // editing" tap (canEdit). Attendees who were signed in before/during the event
  // stay locked even then (see canReverseSignIn), so the real roll-call can't be
  // erased — those rows render greyed-out.
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

  // Track previous signedInKeys to detect remote changes, the prior attendance
  // snapshot to recover a row the server has already dropped, and whether the
  // first (initial-load) snapshot has been seeded.
  const prevSignedInKeysRef = useRef<Set<string>>(new Set());
  const prevAttendanceByKeyRef = useRef<
    Map<string, NonNullable<typeof attendance>[number]>
  >(new Map());
  const remoteSyncInitializedRef = useRef(false);

  // Sync optimistic + remote animation state whenever signedInKeys changes.
  // Reads optimisticSignedIn/Out directly (not via updater) so classification
  // happens against the snapshot at the moment the query fires — not against
  // state after a prior updater has already mutated it.
  useEffect(() => {
    const prevByKey = prevAttendanceByKeyRef.current;
    prevAttendanceByKeyRef.current = attendanceByKey;

    // Don't classify the first loaded snapshot as remote changes: once
    // attendance has loaded, seed the baseline from it and bail, so only later
    // updates run the remote transfer animations.
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

    // A person who is signed in is no longer in the not-signed-in list, so drop
    // them from the top-pin order (covers remote sign-ins and any re-sign-in).
    if (added.length > 0) {
      const addedSet = new Set(added);
      setSignedOutOrder((order) =>
        order.some((k) => addedSet.has(k))
          ? order.filter((k) => !addedSet.has(k))
          : order
      );
    }

    // Classify using the current snapshot of optimistic state.
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
        // Capture the removed row from the prior snapshot; the current server
        // list no longer has it, so without this the exit row never renders.
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging when roster/search changes
    setUnsignedLimit(UNSIGNED_PAGE_SIZE);
    setSignedInLimit(ROSTER_PAGE_SIZE);
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
    // Exiting rows: the refreshed server list already dropped them, so render
    // the stored snapshot rows until their collapse animation completes.
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

  // Not-signed-in members. Prepend optimistic/remote sign-outs as entering rows.
  // Also retain remotely signed-in rows (exiting=true) until their collapse completes.
  const unsignedList = useMemo(() => {
    // Entering keys — shown as dedicated rows; suppress their real counterpart
    // to avoid duplicate keys until the cleanup effect fires.
    const enteringKeys = new Set([...optimisticSignedOut, ...remoteSignedOut.keys()]);
    const real = (roster ?? []).filter(
      (m) => !signedInKeys.has(m.key) && !enteringKeys.has(m.key)
    );
    // Exiting rows: retain in list for their collapse animation.
    const exitingRows = [...remoteSignedIn]
      .map((key) => rosterByKey.get(key))
      .filter((m): m is NonNullable<typeof roster>[number] => m != null);
    const withExiting = exitingRows.length > 0 ? [...exitingRows, ...real] : real;
    const pending = [...enteringKeys]
      .map((key) => rosterByKey.get(key))
      .filter((m): m is NonNullable<typeof roster>[number] => m != null);
    const combined = enteringKeys.size === 0 ? withExiting : [...pending, ...withExiting];

    // Pin members signed out (reversed) this session to the top, in sign-out
    // order (newest first). This keeps a just-reversed person where they
    // optimistically appeared even after the mutation confirms and the roster
    // re-sorts — so the row never jumps back into its frequency-ranked slot.
    if (signedOutOrder.length === 0) return combined;
    const rank = new Map(signedOutOrder.map((k, i) => [k, i]));
    const pinned: NonNullable<typeof roster> = [];
    const rest: NonNullable<typeof roster> = [];
    for (const m of combined) (rank.has(m.key) ? pinned : rest).push(m);
    pinned.sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
    return [...pinned, ...rest];
  }, [roster, signedInKeys, optimisticSignedOut, remoteSignedIn, remoteSignedOut, rosterByKey, signedOutOrder]);

  // Members that newly appear in the not-signed-in list since the previous
  // commit. Their card expands its height in (0 → 72) so the list grows
  // smoothly rather than the new row popping in at full height. The first
  // population is skipped — FadeInView handles the initial staggered entrance.
  //
  // Computed with React's setState-during-render pattern (storing info derived
  // from the previous render) so the row mounts already knowing it is new,
  // without reading a ref during render.
  const unsignedKeySig = useMemo(
    () => unsignedList.map((m) => m.key).join(" "),
    [unsignedList]
  );
  const [prevUnsignedSig, setPrevUnsignedSig] = useState<string | null>(null);
  const [newlyAddedUnsigned, setNewlyAddedUnsigned] = useState<Set<string>>(
    () => new Set()
  );
  // This screen reuses one instance across events (see the editUnlocked reset
  // above), so drop the unsigned baseline when the event changes — otherwise the
  // next event's first resolved roster would diff against the previous event's
  // signature and flag its rows as newly added (stuck entering/disabled).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per-event baseline
    setPrevUnsignedSig(null);
    setNewlyAddedUnsigned(new Set());
    setSignedOutOrder([]);
    setSuppressUnsignedFadeIn(new Set());
  }, [event?._id]);
  // Wait for the roster to load before seeding the baseline: an empty
  // loading-render signature ("") would otherwise consume the null sentinel, so
  // the first real population would diff against "" and flag every row as newly
  // added — leaving the whole list stuck `entering` (and therefore disabled).
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

  // The newly-added flag only drives the one-shot entrance animation (and the
  // brief lock while it plays), so clear it once the animation is done. Without
  // this, a row that appears and then stays put — e.g. a reversed (signed-out)
  // member pinned to the top — keeps its `entering`/disabled state forever,
  // because the list signature never changes again to recompute the set. It
  // would only unlock on the next list change (such as signing someone else in).
  useEffect(() => {
    if (newlyAddedUnsigned.size === 0) return;
    const keys = newlyAddedUnsigned;
    const timer = setTimeout(() => {
      // Clearing the flag flips a row's wrapper from View → FadeInView, which
      // remounts it and would replay the entrance. Suppress every key we clear
      // (not just locally-reversed ones) so remote sign-outs and backend-created
      // members keep a stable wrapper and their entrance stays one-shot.
      setSuppressUnsignedFadeIn((s) => {
        const n = new Set(s);
        for (const k of keys) n.add(k);
        return n;
      });
      setNewlyAddedUnsigned((prev) => (prev === keys ? new Set() : prev));
    }, NEWLY_ADDED_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [newlyAddedUnsigned]);

  // While searching, the two lists below are filtered in place by name/email —
  // there's no separate "Results" list. An empty query passes everything through.
  const filteredUnsignedList = useMemo(
    () =>
      isSearching
        ? unsignedList.filter(
            (m) =>
              m.name.toLowerCase().includes(searchQuery) ||
              (m.email?.toLowerCase().includes(searchQuery) ?? false)
          )
        : unsignedList,
    [unsignedList, isSearching, searchQuery]
  );
  const filteredSignedInList = useMemo(
    () =>
      isSearching
        ? signedInList.filter(
            (a) =>
              a.name.toLowerCase().includes(searchQuery) ||
              (a.email?.toLowerCase().includes(searchQuery) ?? false)
          )
        : signedInList,
    [signedInList, isSearching, searchQuery]
  );

  // Optimistic counts: base server count ± pending swipes, so the pill and
  // section headers update the moment a swipe commits rather than waiting for
  // the Convex round-trip to confirm. Only count optimistic entries the server
  // hasn't reflected yet (sign-ins not yet in attendance, sign-outs still in
  // it); the cleanup effect clears them a render later, so without this guard
  // the confirming render briefly double-counts and the pill flickers ±1.
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
    // Signing back in removes the person from the not-signed-in list, so unpin.
    setSignedOutOrder((order) =>
      order.includes(m.key) ? order.filter((k) => k !== m.key) : order
    );
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
    if (!key) return;
    setOptimisticSignedOut((prev) => new Set(prev).add(key));
    // Pin the reversed member to the top of the not-signed-in list and keep them
    // there after the mutation lands (newest sign-out first).
    setSignedOutOrder((order) => [key, ...order.filter((k) => k !== key)]);
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

  // Create a brand-new member from the current search text. The sheet opens in
  // create mode with the name prefilled; on save, onMemberCreated signs them in.
  const openCreateMember = () => {
    if (!canEdit) return;
    hapticSelect();
    setCreatePrefillName(search.trim());
    setCreateMemberOpen(true);
  };

  const onMemberCreated = (memberId: Id<"attendanceMembers">) => {
    if (!canEdit) return;
    hapticSelect();
    void signIn({ eventId: evId, memberId });
    // Clear the search so the freshly signed-in member is visible at the top of
    // the signed-in list rather than hidden behind the search results.
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
          // Verify the profile against the event's staff year, matching the
          // roster, so an Oct–Dec event resolves the right year's profile.
          staffYear: event ? eventStaffYear(event.dateStart) : undefined,
        });
      }
      if (id) openMemberEdit(id);
    } catch (e) {
      // ensureForStaff failed (network, auth expiry, validation) — the edit
      // sheet never opens, so tell the user instead of failing silently.
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

  return (
    <Screen
      title={event.name}
      subtitle="Attendance"
      onBack={() => router.back()}
      toast={toast}
      // Index 1 is the member search box (index 0 is the grouped badges/notice
      // block) — pin it so it stays reachable while the roster scrolls.
      stickyHeaderIndices={[1]}
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
          // Searching with editing available: offer to create whoever was typed
          // (and sign them straight in). Takes the footer slot over the past-event
          // editing toggle, which is still reachable by clearing the search.
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
      {/* Badges + the past-event notice are grouped into one element so the
          search box stays at a fixed child index (1) for the page's
          stickyHeaderIndices, whether or not the notice is showing.
          collapsable={false} keeps this style-less View in the native tree on
          Android (otherwise it'd be flattened away, shifting the sticky index). */}
      <View collapsable={false}>
      <View style={styles.badgeRow}>
        {/* Collab/owner groups on the left, event tags on the right (mirrors
            the events list's split badge row). */}
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

      {pastEvent && !editUnlocked ? (
        <Text style={[typography.caption, { color: t.muted, marginBottom: spacing.sm }]}>
          This event has ended. Tap Enable editing below to sign in a missed
          attendee or fix details. People who attended cannot be signed out.
        </Text>
      ) : null}
      </View>

      {/* Search box for the suggested pool. Sticky: pins to the top while the
          roster scrolls under it. The opaque page-background wrapper masks rows
          passing behind the rounded pill; paddingTop mirrors the box's bottom
          spacing so it has some space before the top edge when pinned. */}
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

      {/* While searching, both lists below are filtered in place. The "Signed
          in" section stays visible even with no matches (see its condition
          below); counts always show the event total, not the filtered subset. */}

      {/* The not-signed-in roster only appears once the event is editable:
          future/ongoing events always (canEdit is true), a finished event only
          after "Enable editing" is tapped. While searching it's hidden when no
          not-signed-in member matches, so it never shows an empty header. */}
      {canEdit ? (
        <>
          {/* Not-signed-in list sits above the signed-in list. Like the signed-in
              section it stays visible during a search even with no matches — the
              title and count remain with an empty list under them. The signed-in
              rows are still staggered first (see staggerIndex below), so on
              initial load they animate in before the not-signed-in remainder. */}
          <View style={[styles.section, styles.sectionHeader]}>
            <Text style={[typography.label, { color: t.muted }]}>Not signed in</Text>
            <CountChip
              count={optimisticUnsignedCount}
              accessibilityLabel={`${optimisticUnsignedCount} not signed in`}
            />
          </View>
          {filteredUnsignedList.length === 0 ? (
            // No "everyone's in 🎉" while searching — that reads as a no-match
            // empty list, so just leave the list empty under the header.
            isSearching ? null : (
              <Muted>Everyone in the pool is signed in 🎉</Muted>
            )
          ) : (
            <ScrollView
              style={styles.unsignedScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
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
                    // The list only renders when canEdit, so a row is blocked
                    // only while its enter/exit animation plays — and it's held
                    // non-interactive without greying out (dimmed stays false).
                    disabled={isAnimating}
                    entering={isEntering}
                    exiting={isExiting}
                    revealTrigger={revealTriggers.get(m.key) ?? 0}
                    onExited={isExiting ? () => setRemoteSignedIn((s) => { const n = new Set(s); n.delete(m.key); return n; }) : undefined}
                    onActionStart={isAnimating ? undefined : () => { onSignInStart(m); if (nextKey) triggerReveal(nextKey); }}
                    onAction={() => { if (!isAnimating) onSignIn(m); }}
                    onEdit={!isAnimating ? () => editRosterEntry(m) : undefined}
                  />
                );
                return isAnimating || isSuppressed ? (
                  <View key={m.key}>{row}</View>
                ) : (
                  <FadeInView key={m.key} delay={Math.min(staggerIndex, 12) * 35}>{row}</FadeInView>
                );
              })}
              {visibleUnsigned.length < filteredUnsignedList.length ? (
                <Btn
                  title={`Load more (${filteredUnsignedList.length - visibleUnsigned.length} left)`}
                  variant="ghost"
                  onPress={() =>
                    setUnsignedLimit((limit) => limit + UNSIGNED_PAGE_SIZE)
                  }
                />
              ) : null}
            </ScrollView>
          )}
        </>
      ) : null}

      {/* Always shown — the "Signed in" title and total count stay put even with
          zero signed-in members (or no search matches), with an empty list under
          them, so the layout below "Not signed in" never shifts. */}
      {(
        <>
          <View style={[styles.section, styles.sectionHeader]}>
            <Text style={[typography.label, { color: t.muted }]}>Signed in</Text>
            <CountChip
              count={optimisticSignedInCount}
              accessibilityLabel={`${optimisticSignedInCount} signed in`}
            />
          </View>
              {/* Wrapped so the Screen scroll's outer `gap` doesn't stack on top
                  of each row's marginBottom — keeps the row spacing tight and
                  matching the not-signed-in list (which sits in its own scroll). */}
              <View>
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
                    roles={a.roles}
                    mode="signedIn"
                    // Attendees signed in before/during a finished event are
                    // locked (greyed, never sign-out-able). A retroactive add is
                    // editable once editing is enabled. Both honour canEdit.
                    // `dimmed` greys only genuinely-locked rows; an in-flight
                    // optimistic row is held non-interactive (disabled) without
                    // the grey.
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
                <Btn
                  title={`Load more (${filteredSignedInList.length - visibleSignedIn.length} left)`}
                  variant="ghost"
                  onPress={() =>
                    setSignedInLimit((limit) => limit + ROSTER_PAGE_SIZE)
                  }
                />
              ) : null}
              </View>
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
  // Header right column: actions row on top, event date right-aligned beneath.
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
    // Negative vertical margins trim the scroll's spacing.md gaps above and
    // below the badge row so it sits closer to the header and the search box.
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
  // flexGrow/Shrink 0 pins the viewport to exactly three cards: react-native-web's
  // ScrollView base style sets flexGrow 1, so when the signed-in list is empty the
  // page content is short, the Screen's scroll container stretches, and this list
  // would otherwise grow past its height (showing ~5 cards). Keep it rigid.
  unsignedScroll: { height: UNSIGNED_LIST_HEIGHT, flexGrow: 0, flexShrink: 0 },
});
