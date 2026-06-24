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

/** Person row in the roster (the shared SOW member pool for the year). */
type Member = {
  email: string;
  name: string;
  roles: string[];
  campuses: string[];
};

/** Subtitle for a roster row: roles if any, else the person's campuses. */
const memberSubtitle = (member: Member): string | undefined => {
  if (member.roles.length > 0) return member.roles.join(" · ");
  if (member.campuses.length > 0)
    return member.campuses.map(subgroupLabel).join(" · ");
  return undefined;
};

export default function RollCallScreen() {
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

  const [search, setSearch] = useState("");

  const signedInEmails = useMemo(
    () =>
      new Set((attendance ?? []).map((a) => a.email.trim().toLowerCase())),
    [attendance]
  );

  const suggested = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (roster ?? [])
      .filter((m) => !signedInEmails.has(m.email.trim().toLowerCase()))
      .filter((m) =>
        q
          ? m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
          : true
      );
  }, [roster, signedInEmails, search]);

  if (event === undefined || attendance === undefined) return <LoadingState />;
  if (event === null) {
    return (
      <Screen title="Event" onBack={() => router.back()}>
        <EmptyState icon="lock-closed-outline" title="Event not found" />
      </Screen>
    );
  }
  if (roster === undefined) return <LoadingState />;

  const onSignIn = (email: string) => {
    hapticSelect();
    void signIn({ eventId: evId, email });
  };
  const onSignOut = (email: string) => {
    hapticSelect();
    void signOut({ eventId: evId, email });
  };

  return (
    <Screen title={event.name} subtitle="Roll-call" onBack={() => router.back()}>
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
          placeholder="Search staff…"
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
              subtitle={formatSignInTime(a.signInTime)}
              mode="signedIn"
              onAction={() => onSignOut(a.email)}
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
            ? "No staff match your search."
            : "Everyone in the pool is signed in 🎉"}
        </Muted>
      ) : (
        suggested.map((m, index) => (
          <FadeInView key={m.email} delay={Math.min(index, 6) * 35}>
            <AttendanceRow
              name={m.name}
              subtitle={memberSubtitle(m)}
              mode="suggested"
              onAction={() => onSignIn(m.email)}
            />
          </FadeInView>
        ))
      )}
      <View style={{ height: spacing.xxl }} />
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
