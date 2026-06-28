import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { formatEventDate, subgroupColour, subgroupLabel } from "../../../shared/rollcall";
import {
  Card,
  Chip,
  Btn,
  EmptyState,
  FadeInView,
  FooterAction,
  LoadingState,
  Muted,
  Screen,
  stagger,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

/** Events run under one sub-group (a campus or "ALL"), newest first. */
export default function SubgroupEventsScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { subgroup } = useLocalSearchParams<{ subgroup: string }>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [events, setEvents] = useState<
    NonNullable<ReturnType<typeof useQuery<typeof api.events.listBySubgroup>>>["events"]
  >([]);
  const result = useQuery(api.events.listBySubgroup, {
    subgroup,
    cursor: cursor ?? null,
  });
  const accent = subgroupColour(subgroup);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination on route param change
    setCursor(null);
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

  if (result === undefined && events.length === 0) return <LoadingState />;

  return (
    <>
      <Screen
        title={subgroupLabel(subgroup)}
        subtitle="Events"
        onBack={() => router.back()}
      >
        {events.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No events yet"
            message="Create an event to take attendance."
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
        {result && !result.isDone ? (
          <Btn
            title="Load more"
            variant="ghost"
            onPress={() => setCursor(result.continueCursor)}
          />
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
