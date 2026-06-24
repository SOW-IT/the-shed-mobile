import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { formatEventDate, subgroupColour } from "../../../shared/rollcall";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { CampusMark } from "@/components/CampusMark";
import {
  Card,
  Chip,
  EmptyState,
  FadeInView,
  LoadingState,
  Muted,
  stagger,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

const CAMPUS_MARK = 40;

export function EventsTab({
  year,
  subgroups,
  selectedSubgroup,
  onSelectedSubgroupChange,
}: {
  year: number;
  subgroups: string[];
  selectedSubgroup: string | null;
  onSelectedSubgroupChange: (subgroup: string) => void;
}) {
  const t = useAppTheme();
  const router = useRouter();
  const subgroup = selectedSubgroup ?? subgroups[0] ?? null;
  const events = useQuery(
    api.events.listBySubgroup,
    subgroup ? { year, subgroup } : "skip"
  );

  const accent = subgroup ? subgroupColour(subgroup) : t.primary;

  return (
    <>
      <View style={{ marginBottom: spacing.sm }}>
        <Muted>SOW · {year}</Muted>
      </View>

      {subgroups.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No groups yet"
          message="Add campuses in Admin to start taking attendance."
        />
      ) : (
        <>
          <View style={styles.campusRow}>
            {subgroups.map((sg) => {
              const active = sg === subgroup;
              const colour = subgroupColour(sg);
              return (
                <Pressable
                  key={sg}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelectedSubgroupChange(sg)}
                  style={({ pressed }) => [
                    styles.campusSlot,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View
                    style={[
                      styles.campusRing,
                      {
                        borderColor: active ? colour : "transparent",
                        borderWidth: active ? 2.5 : 0,
                      },
                    ]}
                  >
                    <CampusMark
                      campus={sg}
                      variant="circle"
                      circleDiameter={CAMPUS_MARK}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {events === undefined ? (
            <LoadingState />
          ) : events.length === 0 ? (
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
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {event.collaborative ? <Chip label="Collaborative" /> : null}
                        {event.tags?.map((tag) => (
                          <AttendanceTagPill
                            key={tag._id}
                            name={tag.name}
                            colour={tag.colour}
                            small
                          />
                        ))}
                      </View>
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
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  campusRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  campusSlot: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  /** Selection ring hugging the circular mark — no rectangular chip padding. */
  campusRing: {
    borderRadius: 999,
    padding: 0,
  },
});
