import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  formatEventDate,
  formatSignInTime,
  subgroupLabel,
} from "../../../../shared/rollcall";
import { AttendanceRow } from "@/components/AttendanceRow";
import { EditMemberSheet } from "@/components/attendance/EditMemberSheet";
import {
  Chip,
  EmptyState,
  FadeInView,
  hapticSelect,
  LoadingState,
  Muted,
  Screen,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

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
  // The roll-call pool is the year's shared staff roster.
  const roster = useQuery(
    api.attendance.roster,
    event ? { year: event.year } : "skip"
  );
  const signIn = useMutation(api.attendance.signIn);
  const signOut = useMutation(api.attendance.signOut);
  const ensureForStaff = useMutation(api.attendanceMembers.ensureForStaff);
  const metadataFields = useQuery(
    api.attendanceMetadata.list,
    event ? { year: event.year } : "skip"
  );

  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editMemberId, setEditMemberId] = useState<Id<"attendanceMembers"> | null>(
    null
  );
  const [editAttendance, setEditAttendance] = useState<{
    attendanceId: Id<"attendance">;
    notes?: string;
  } | null>(null);

  const closeEdit = () => {
    setEditOpen(false);
    setEditAttendance(null);
  };

  const signedInKeys = useMemo(
    () => new Set((attendance ?? []).map((a) => personKey(a)).filter(Boolean)),
    [attendance]
  );

  const suggested = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (roster ?? [])
      .filter((m) => !signedInKeys.has(m.key))
      .filter((m) =>
        q
          ? m.name.toLowerCase().includes(q) ||
            (m.email?.toLowerCase().includes(q) ?? false)
          : true
      );
  }, [roster, signedInKeys, search]);

  if (event === undefined || attendance === undefined) return <LoadingState />;
  if (event === null) {
    return (
      <Screen title="Event" onBack={() => router.back()}>
        <EmptyState icon="lock-closed-outline" title="Event not found" />
      </Screen>
    );
  }
  if (roster === undefined) return <LoadingState />;

  const onSignIn = (m: NonNullable<typeof roster>[number]) => {
    hapticSelect();
    if (m.kind === "staff" && m.email) {
      void signIn({ eventId: evId, email: m.email });
    } else if (m.memberId) {
      void signIn({ eventId: evId, memberId: m.memberId as Id<"attendanceMembers"> });
    }
  };
  const onSignOut = (a: NonNullable<typeof attendance>[number]) => {
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
    <Screen title={event.name} subtitle="Attendance" onBack={() => router.back()}>
      <View style={styles.metaRow}>
        <Muted>{formatEventDate(event.dateStart)}</Muted>
        <View style={[styles.countPill, { backgroundColor: t.primarySoft }]}>
          <Ionicons name="people" size={14} color={t.primary} />
          <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
            {attendance.length}
          </Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        {event.collaborative ? <Chip label="Collaborative" /> : null}
        {event.subgroups.map((s) => (
          <Chip key={s} label={subgroupLabel(s)} />
        ))}
      </View>

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

      {attendance.length > 0 ? (
        <>
          <Text style={[typography.label, styles.section, { color: t.muted }]}>
            Signed in · {attendance.length}
          </Text>
          {attendance.map((a) => (
            <AttendanceRow
              key={a._id}
              name={a.name}
              subtitle={signedInSubtitle(a.signInTime, a.notes)}
              mode="signedIn"
              onAction={() => onSignOut(a)}
              onEdit={() => editSignedIn(a)}
            />
          ))}
        </>
      ) : null}

      <Text style={[typography.label, styles.section, { color: t.muted }]}>
        Not signed in · {suggested.length}
      </Text>
      {suggested.length === 0 ? (
        <Muted>
          {search
            ? "No members match your search."
            : "Everyone in the pool is signed in 🎉"}
        </Muted>
      ) : (
        suggested.map((m, index) => (
          <FadeInView key={m.key} delay={Math.min(index, 6) * 35}>
            <AttendanceRow
              name={m.name}
              subtitle={memberSubtitle(m)}
              mode="suggested"
              onAction={() => onSignIn(m)}
              onEdit={() => editRosterEntry(m)}
            />
          </FadeInView>
        ))
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
});
