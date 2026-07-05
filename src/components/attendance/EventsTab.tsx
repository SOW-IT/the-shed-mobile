import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  contrastingText,
  formatEventRange,
  isOrgWideSubgroup,
  subgroupColour,
  subgroupLabel,
  subgroupMatches,
} from "../../../shared/rollcall";
import { Ionicons } from "@expo/vector-icons";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { CampusMark } from "@/components/CampusMark";
import { CreateEventSheet } from "@/components/attendance/CreateEventSheet";
import { ExportSheet } from "@/components/attendance/ExportSheet";
import {
  Btn,
  EmptyState,
  FadeInView,
  LoadingState,
  stagger,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const CAMPUS_MARK = 40;

type EventStatus = "UPCOMING" | "LIVE" | "ENDED";

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
  const [pagination, setPagination] = useState<{
    subgroup: string | null;
    cursor: string | null;
  }>({
    subgroup,
    cursor: null,
  });
  const [accumulated, setAccumulated] = useState<
    NonNullable<ReturnType<typeof useQuery<typeof api.events.listBySubgroup>>>["events"]
  >([]);
  const cursor = pagination.subgroup === subgroup ? pagination.cursor : null;

  const page = useQuery(
    api.events.listBySubgroup,
    subgroup ? { subgroup, cursor: cursor ?? null } : "skip"
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on subgroup change
    setPagination({ subgroup, cursor: null });
    setAccumulated([]);
  }, [subgroup]);

  useEffect(() => {
    if (!page?.events) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- append paginated events
    setAccumulated((prev) => {
      if (!cursor) return page.events;
      const seen = new Set(prev.map((e) => e._id));
      return [...prev, ...page.events.filter((e) => !seen.has(e._id))];
    });
  }, [page, cursor]);

  const [editingEventId, setEditingEventId] = useState<Id<"events"> | null>(null);
  const editingEvent = accumulated.find((event) => event._id === editingEventId);
  const [exportOpen, setExportOpen] = useState(false);

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
            {subgroups.map((sg, i) => {
              const active = sg === subgroup;
              // SOW's brand colour is black, which is invisible as a ring on the
              // dark theme's dark background — use the cream logo colour (the dark
              // theme text colour) so the selected ring matches the SOW mark.
              // Every other group uses its brand colour.
              const ringColour =
                isOrgWideSubgroup(sg) && t.dark ? t.text : subgroupColour(sg);
              return (
                <FadeInView key={sg} delay={stagger(i)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => onSelectedSubgroupChange(sg)}
                    style={({ pressed }) => [
                      styles.campusSlot,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    {/* The ring border is always present but transparent until
                        selected, so selecting only colours it in — the logo never
                        shifts as the 2.5px border appears/disappears. */}
                    <View
                      style={[
                        styles.campusRing,
                        active && { borderColor: ringColour },
                      ]}
                    >
                      <CampusMark
                        campus={sg}
                        variant="circle"
                        circleDiameter={CAMPUS_MARK}
                      />
                    </View>
                  </Pressable>
                </FadeInView>
              );
            })}
          </View>

          {subgroup ? (
            <View style={styles.toolbar}>
              <Text style={[typography.label, { color: t.muted }]}>EVENTS</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Export attendance"
                onPress={() => setExportOpen(true)}
                style={({ pressed }) => [
                  styles.exportButton,
                  { borderColor: t.primary, backgroundColor: t.background },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="download-outline" size={15} color={t.primary} />
                <Text style={[styles.exportButtonText, { color: t.primary }]}>
                  Export
                </Text>
              </Pressable>
            </View>
          ) : null}

          {page === undefined && accumulated.length === 0 ? (
            <LoadingState />
          ) : accumulated.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="No events yet"
              message="Create an event to take attendance."
            />
          ) : (
            <View style={styles.eventsList}>
            {accumulated.map((event, i) => {
              const ownerSubgroup = event.subgroups[0] ?? subgroup;
              const ownerColour = subgroupColour(ownerSubgroup);
              const isExternalEvent =
                subgroup != null && !subgroupMatches(ownerSubgroup, subgroup);
              const openEvent = () =>
                router.push({
                  pathname: "/attendance/event/[eventId]",
                  params: { eventId: event._id },
                });

              return (
                <FadeInView key={event._id} delay={stagger(i)}>
                  <View
                    style={[
                      styles.eventRow,
                      i > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: t.separator,
                      },
                      {
                        borderLeftWidth: isExternalEvent ? 4 : 0,
                        borderLeftColor: isExternalEvent ? ownerColour : "transparent",
                        backgroundColor: t.background,
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${event.name}`}
                      onPress={openEvent}
                      style={({ pressed }) => [pressed && { opacity: 0.76 }]}
                    >
                      <View style={styles.eventContent}>
                        <View style={styles.eventTopLine}>
                          <Text
                            style={[
                              typography.caption,
                              styles.eventDate,
                              { color: t.muted },
                            ]}
                          >
                            {formatEventRange(event.dateStart, event.dateEnd)}
                          </Text>
                          {(() => {
                            const status = eventStatus(
                              event.dateStart,
                              event.dateEnd,
                              now
                            );
                            const tone = statusTone(status, t);
                            return (
                              <View
                                style={[styles.statusPill, { backgroundColor: tone.bg }]}
                              >
                                <Text style={[styles.statusText, { color: tone.fg }]}>
                                  {status}
                                </Text>
                              </View>
                            );
                          })()}
                        </View>

                        <View style={styles.badgeRow}>
                          <View style={styles.badgeGroup}>
                            {event.tags?.map((tag) => (
                              <AttendanceTagPill
                                key={tag._id}
                                name={tag.name}
                                colour={tag.colour}
                                small
                              />
                            ))}
                          </View>
                          <View style={[styles.badgeGroup, styles.badgeGroupRight]}>
                            {event.subgroups
                              .filter((s) => subgroup == null || !subgroupMatches(s, subgroup))
                              .map((s) => {
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
                          </View>
                        </View>

                        <Text
                          style={[typography.title, styles.eventName, { color: t.text }]}
                        >
                          {event.name}
                        </Text>
                      </View>
                    </Pressable>

                    <View style={styles.attendanceLine}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${event.name}`}
                        onPress={openEvent}
                        style={({ pressed }) => [
                          styles.attendancePressable,
                          pressed && { opacity: 0.76 },
                        ]}
                      >
                        <Text style={[typography.label, { color: t.text }]}>
                          ATTENDANCE: {event.attendanceCount}
                        </Text>
                      </Pressable>
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
              );
            })}
            </View>
          )}
          {page && !page.isDone ? (
            <Btn
              title="Load more"
              variant="ghost"
              onPress={() => setPagination({ subgroup, cursor: page.continueCursor })}
            />
          ) : null}
        </>
      )}
      {editingEvent && subgroup ? (
        <CreateEventSheet
          visible={editingEvent !== undefined}
          onClose={() => setEditingEventId(null)}
          subgroup={editingEvent.subgroups[0] ?? subgroup}
          subgroups={subgroups}
          event={editingEvent}
        />
      ) : null}
      {subgroup ? (
        <ExportSheet
          visible={exportOpen}
          onClose={() => setExportOpen(false)}
          subgroup={subgroup}
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
  /** Selection ring hugging the circular mark — no rectangular chip padding.
   *  The border is always 2.5px (transparent when unselected) so the layout
   *  stays put; selecting only changes its colour. */
  campusRing: {
    borderRadius: 999,
    padding: 0,
    borderWidth: 2.5,
    borderColor: "transparent",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  exportButtonText: { fontSize: 13, fontWeight: "700" },
  eventsList: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  eventRow: {
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    paddingLeft: spacing.md,
    gap: spacing.sm,
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
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
  eventName: {
    textTransform: "uppercase",
  },
  attendanceLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  attendancePressable: {
    flex: 1,
  },
  editButton: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  editButtonText: { fontSize: 13, fontWeight: "700" },
});
