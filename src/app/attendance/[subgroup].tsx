import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { formatEventDate, subgroupColour, subgroupLabel } from "../../../shared/rollcall";
import {
  Card,
  Chip,
  EmptyState,
  FadeInView,
  FooterAction,
  LoadingState,
  Muted,
  Screen,
  SowSpinner,
  stagger,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

/** Events run under one sub-group (a campus or "ALL"), newest first. */
export default function SubgroupEventsScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { subgroup } = useLocalSearchParams<{ subgroup: string }>();
  const [pagination, setPagination] = useState<{
    subgroup: string;
    cursor: string | null;
  }>({
    subgroup,
    cursor: null,
  });
  const [events, setEvents] = useState<
    NonNullable<ReturnType<typeof useQuery<typeof api.events.listBySubgroup>>>["events"]
  >([]);
  const cursor = pagination.subgroup === subgroup ? pagination.cursor : null;
  const result = useQuery(api.events.listBySubgroup, {
    subgroup,
    cursor: cursor ?? null,
  });
  const accent = subgroupColour(subgroup);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination on route param change
    setPagination({ subgroup, cursor: null });
    setEvents([]);
  }, [subgroup]);

  useEffect(() => {
    if (!result?.events) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- append the latest Convex page into local pagination state
    setEvents((prev) => {
      if (!cursor) return result.events;
      const seen = new Set(prev.map((event) => event._id));
      return [...prev, ...result.events.filter((event) => !seen.has(event._id))];
    });
  }, [result, cursor]);

  const hasMore = result != null && !result.isDone;
  const continueCursor = result?.continueCursor;
  const pending = useRef(false);
  useEffect(() => {
    pending.current = false;
  }, [cursor, result?.isDone]);
  const loadMore = useCallback(() => {
    if (pending.current || !hasMore || continueCursor == null) return;
    pending.current = true;
    setPagination({ subgroup, cursor: continueCursor });
  }, [hasMore, continueCursor, subgroup]);

  if (result === undefined && events.length === 0) return <LoadingState />;

  return (
    <>
      <Screen
        title={subgroupLabel(subgroup)}
        subtitle="Events"
        onBack={() => router.back()}
        onEndReached={hasMore ? loadMore : undefined}
      >
        {events.length === 0 && result?.isDone ? (
          <EmptyState
            icon="calendar-outline"
            title="No events yet"
            message="Create an event to take attendance."
          />
        ) : events.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="Looking for older events"
            message="Scroll to keep scanning this subgroup's history."
          />
        ) : (
          events.map((event, i) => (
            <FadeInView key={event._id} delay={stagger(i)}>
              <Card
                style={{
                  marginBottom: spacing.sm,
                  borderLeftWidth: event.collaborative ? 0 : 4,
                  borderLeftColor: accent,
                }}
              >
                <Pressable
                  style={({ pressed }) => [
                    { flexDirection: "row", alignItems: "center", gap: 10 },
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/attendance/event/[eventId]",
                      params: { eventId: event._id },
                    })
                  }
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[typography.headline, { color: t.text }]}>
                      {event.name}
                    </Text>
                    <Muted>{formatEventDate(event.dateStart)}</Muted>
                    {event.collaborative ? (
                      <View style={styles.badgeRow}>
                        <Chip label="Collaborative" />
                        {event.subgroups
                          .filter((s) => s !== subgroup)
                          .map((s) => (
                            <Chip key={s} label={subgroupLabel(s)} />
                          ))}
                      </View>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Ionicons name="checkmark-circle" size={18} color={t.success} />
                    <Text style={[typography.caption, { color: t.muted }]}>
                      {event.attendanceCount}
                    </Text>
                  </View>
                </Pressable>
              </Card>
            </FadeInView>
          ))
        )}
        {hasMore ? (
          <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
            <SowSpinner size={36} />
          </View>
        ) : null}
        <View style={{ height: spacing.xxl }} />
      </Screen>
      <FooterAction
        title="New event"
        onPress={() =>
          router.push({
            pathname: "/attendance/event/new",
            params: { subgroup },
          })
        }
      />
    </>
  );
}

const styles = {
  badgeRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 4,
  },
};
