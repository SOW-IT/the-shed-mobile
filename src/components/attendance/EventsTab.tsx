import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  contrastingText,
  subgroupColour,
  subgroupLabel,
} from "../../../shared/rollcall";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { CampusMark } from "@/components/CampusMark";
import { CreateEventSheet } from "@/components/attendance/CreateEventSheet";
import {
  Chip,
  EmptyState,
  FadeInView,
  LoadingState,
  stagger,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const CAMPUS_MARK = 40;

type EventStatus = "UPCOMING" | "LIVE" | "ENDED";

const twoDigit = (value: number) => String(value).padStart(2, "0");

const formatEventRange = (startMs: number, endMs: number) => {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const date = `${twoDigit(start.getDate())}.${twoDigit(
    start.getMonth() + 1
  )}.${String(start.getFullYear()).slice(-2)}`;
  const time = (dateValue: Date) =>
    dateValue
      .toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
      .toLowerCase();
  return `${date}, ${time(start)} - ${time(end)}`;
};

const eventStatus = (startMs: number, endMs: number, now: number): EventStatus => {
  if (now < startMs) return "UPCOMING";
  if (now <= endMs) return "LIVE";
  return "ENDED";
};

const statusTone = (status: EventStatus, t: ReturnType<typeof useAppTheme>) => {
  if (status === "LIVE") {
    return { bg: t.successSoft, fg: t.success };
  }
  if (status === "UPCOMING") {
    return { bg: t.primarySoft, fg: t.dark ? t.text : t.primary };
  }
  return { bg: t.ghost, fg: t.ghostText };
};

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
  const [now, setNow] = useState(() => Date.now());
  const events = useQuery(
    api.events.listBySubgroup,
    subgroup ? { year, subgroup } : "skip"
  );
  const [editingEventId, setEditingEventId] = useState<Id<"events"> | null>(null);
  const editingEvent = events?.find((event) => event._id === editingEventId);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
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
                <View
                  style={[
                    styles.eventRow,
                    {
                      borderBottomColor: t.separator,
                      backgroundColor: t.background,
                    },
                  ]}
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.eventContent,
                      pressed && { opacity: 0.62 },
                    ]}
                    onPress={() =>
                      router.push({
                        pathname: "/attendance/event/[eventId]",
                        params: { eventId: event._id },
                      })
                    }
                  >
                    <View style={styles.eventTopLine}>
                      <Text
                        style={[typography.caption, styles.eventDate, { color: t.muted }]}
                      >
                        {formatEventRange(event.dateStart, event.dateEnd)}
                      </Text>
                      {(() => {
                        const status = eventStatus(event.dateStart, event.dateEnd, now);
                        const tone = statusTone(status, t);
                        return (
                          <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                            <Text style={[styles.statusText, { color: tone.fg }]}>
                              {status}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>

                    <View style={styles.badgeRow}>
                      {event.collaborative ? <Chip label="Collaborative" /> : null}
                      {event.subgroups.map((s) => {
                        const colour = subgroupColour(s);
                        return (
                          <View
                            key={s}
                            style={[
                              styles.subgroupPill,
                              {
                                backgroundColor: colour,
                              },
                            ]}
                          >
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
                        <AttendanceTagPill
                          key={tag._id}
                          name={tag.name}
                          colour={tag.colour}
                          small
                        />
                      ))}
                    </View>

                    <Text style={[typography.title, styles.eventName, { color: t.text }]}>
                      {event.name}
                    </Text>
                  </Pressable>

                  <View style={styles.attendanceLine}>
                    <Text style={[typography.label, { color: t.text }]}>
                      ATTENDANCE: {event.attendanceCount}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${event.name}`}
                      onPress={() => setEditingEventId(event._id)}
                      style={({ pressed }) => [
                        styles.editButton,
                        { borderColor: t.primary, backgroundColor: t.background },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={[styles.editButtonText, { color: t.primary }]}>
                        Edit
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </FadeInView>
            ))
          )}
        </>
      )}
      {editingEvent && subgroup ? (
        <CreateEventSheet
          visible={editingEvent !== undefined}
          onClose={() => setEditingEventId(null)}
          year={editingEvent.year}
          subgroup={editingEvent.subgroups[0] ?? subgroup}
          subgroups={subgroups}
          event={editingEvent}
        />
      ) : null}
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
  eventRow: {
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  eventContent: {
    gap: spacing.md,
  },
  eventTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  eventDate: { flex: 1 },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
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
  eventName: {
    textTransform: "uppercase",
  },
  attendanceLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  editButton: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  editButtonText: { fontSize: 13, fontWeight: "700" },
});
