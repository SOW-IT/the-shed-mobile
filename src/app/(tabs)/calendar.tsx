import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, type ScrollViewInstance, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import {
  CALENDAR_CATEGORIES,
  calendarCategoryLabel,
  daysOf,
  eventsByDay,
  monthGrid,
  monthWindow,
  parseDayKey,
  shiftMonth,
  sydneyDayKey,
  type CalendarCategory,
} from "@shared/calendar";
import { subgroupLabel } from "@shared/rollcall";
import { universityColour } from "@shared/flow";
import { ChromeScreen } from "@/components/ChromeScreen";
import { useWideLayout } from "@/components/nav/layout";
import type { Id } from "../../../convex/_generated/dataModel";
import { CalendarEntrySheet, type EditableEntry } from "@/components/calendar/CalendarEntrySheet";
import { CATEGORY_COLOURS } from "@/components/calendar/categoryColours";
import { FilterChip, FilterRow } from "@/components/FilterChips";
import { useAttendanceSubgroup } from "@/hooks/useAttendanceSubgroup";
import { sydneyTime } from "@/lib/sydneyTime";
import { Card, EmptyState, LoadingState, Muted, ReadableColumn, Screen } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type CalendarEvent = NonNullable<ReturnType<typeof useRange>>[number];
const useRange = (window: { from: number; to: number }, skip: boolean) =>
  useQuery(api.calendar.range, skip ? "skip" : window);

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MAX_ROWS = 3;

const monthTitle = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );

const dayTitle = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
};

const shortDay = (ms: number) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Australia/Sydney",
  }).format(new Date(ms));

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

const EventRow = ({ event, onPress }: { event: CalendarEvent; onPress?: () => void }) => {
  const t = useAppTheme();
  const colour = CATEGORY_COLOURS[event.category];
  const where = event.subgroups.map(subgroupLabel).join(", ");
  const multiDay = daysOf(event.dateStart, event.dateEnd).length > 1;
  const at = (ms: number) => (multiDay ? `${shortDay(ms)}, ${sydneyTime(ms)}` : sydneyTime(ms));
  const when = `${at(event.dateStart)} – ${at(event.dateEnd)}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${event.name}, ${calendarCategoryLabel(event.category)}, ${when}, ${where}`}
      style={({ pressed }) => [styles.eventRow, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.eventBar, { backgroundColor: colour }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.headline, { color: t.text }]} numberOfLines={2}>
          {event.name}
        </Text>
        <Text style={[typography.caption, { color: t.muted }]}>{when}</Text>
        <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
          <Text style={{ color: colour, fontWeight: "800" }}>{calendarCategoryLabel(event.category)}</Text>
          {` · ${where}`}
          {event.kind === "entry" ? " · Calendar only" : ""}
        </Text>
        {event.notes ? (
          <Text selectable style={[typography.caption, { color: t.text }]}>
            {event.notes}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <Ionicons
          name={event.kind === "entry" ? "create-outline" : "chevron-forward"}
          size={18}
          color={t.faint}
        />
      ) : null}
    </Pressable>
  );
};

export default function CalendarScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const staff = !!me?.profile;
  const [today] = useState(() => sydneyDayKey(Date.now()));
  const [ty, tm] = today.split("-").map(Number);
  const [{ year, month }, setMonth] = useState({ year: ty, month: tm });
  const [selected, setSelected] = useState(today);
  const [categories, setCategories] = useState<CalendarCategory[]>([]);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EditableEntry | null>(null);
  const wide = useWideLayout();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const gridBottom = useRef(0);
  const { day } = useLocalSearchParams<{ day?: string }>();
  useEffect(() => {
    const linked = parseDayKey(day);
    if (!linked) return;
    const [y, m] = linked.split("-").map(Number);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the day a link points at
    setMonth({ year: y, month: m });
    setSelected(linked);
  }, [day]);
  const events = useRange(monthWindow(year, month), !staff);
  const subgroups = useQuery(api.events.subgroups, staff ? {} : "skip");
  const [subgroup] = useAttendanceSubgroup(subgroups, me?.profile?.assignments);

  if (me === undefined) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (!staff) return <Redirect href={me === null ? "/home" : "/org"} />;

  const grid = monthGrid(year, month);
  const monthKeys = new Set(grid.flat().filter((d) => d.inMonth).map((d) => d.key));
  const all = events ?? [];
  const shown = all.filter(
    (e) =>
      (categories.length === 0 || categories.includes(e.category)) &&
      (campuses.length === 0 || e.subgroups.some((s) => campuses.includes(s)))
  );
  const byDay = eventsByDay(shown);
  const inMonth = (list: CalendarEvent[]) =>
    new Set(
      [...eventsByDay(list).entries()]
        .filter(([key]) => monthKeys.has(key))
        .flatMap(([, evs]) => evs.map((e) => e.id))
    ).size;
  const presentCategories = CALENDAR_CATEGORIES.filter((c) => all.some((e) => e.category === c.key));
  const presentCampuses = [...new Set(all.flatMap((e) => e.subgroups))].sort((a, b) =>
    a.localeCompare(b)
  );
  const dayEvents = byDay.get(selected) ?? [];

  const go = (by: number) => {
    const next = shiftMonth(year, month, by);
    setMonth(next);
    setSelected(
      next.year === ty && next.month === tm ? today : `${next.year}-${String(next.month).padStart(2, "0")}-01`
    );
  };

  const floating = subgroup ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add an event on ${dayTitle(selected)}`}
      onPress={() => setAdding(true)}
      style={({ pressed }) => [
        styles.fab,
        t.surfaceEdge,
        { backgroundColor: t.primary, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name="add" size={18} color={t.onPrimary} />
      <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>Add Event</Text>
    </Pressable>
  ) : null;

  return (
    <>
      <ChromeScreen floating={floating} scrollRef={scrollRef}>
        <ReadableColumn>
          <View style={{ gap: spacing.md, paddingBottom: 72 }}>
            <View style={styles.monthBar}>
              <Pressable
                onPress={() => go(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                hitSlop={8}
                style={styles.arrow}
              >
                <Ionicons name="chevron-back" size={22} color={t.text} />
              </Pressable>
              <Text style={[typography.title, { color: t.text, flex: 1, textAlign: "center" }]}>
                {monthTitle(year, month)}
              </Text>
              <Pressable
                onPress={() => go(1)}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                hitSlop={8}
                style={styles.arrow}
              >
                <Ionicons name="chevron-forward" size={22} color={t.text} />
              </Pressable>
            </View>
            {selected !== today ? (
              <Pressable
                onPress={() => {
                  setMonth({ year: ty, month: tm });
                  setSelected(today);
                }}
                accessibilityRole="button"
                style={[styles.todayButton, { backgroundColor: t.primarySoft }]}
              >
                <Text style={[typography.caption, { color: t.dark ? t.text : t.primary, fontWeight: "800" }]}>
                  Today
                </Text>
              </Pressable>
            ) : null}

            <View
              onLayout={(e) => {
                gridBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
              }}
            >
              <Card>
                <View style={styles.week}>
                  {WEEKDAYS.map((d, i) => (
                    <Text key={i} style={[styles.weekday, typography.caption, { color: t.faint }]}>
                      {d}
                    </Text>
                  ))}
                </View>
                {grid.map((week) => (
                  <View key={week[0].key} style={styles.week}>
                    {week.map((day) => {
                      const evs = byDay.get(day.key) ?? [];
                      const isSelected = day.key === selected;
                      const isToday = day.key === today;
                      const more = evs.length - MAX_ROWS;
                      return (
                        <Pressable
                          key={day.key}
                          onPress={() => {
                            setSelected(day.key);
                            // On a phone the day's events sit below the month; bring them into view.
                            if (!wide) {
                              scrollRef.current?.scrollTo({ y: Math.max(0, gridBottom.current - 160), animated: true });
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          accessibilityLabel={`${dayTitle(day.key)}, ${evs.length} event${evs.length === 1 ? "" : "s"}`}
                          style={[
                            styles.cell,
                            isSelected && { backgroundColor: t.primarySoft },
                          ]}
                        >
                          <View
                            style={[
                              styles.dayNumber,
                              isToday && { borderColor: t.primary, borderWidth: 2 },
                            ]}
                          >
                            <Text
                              style={[
                                typography.body,
                                {
                                  color: day.inMonth ? t.text : t.faint,
                                  fontWeight: isSelected || isToday ? "800" : "500",
                                },
                              ]}
                            >
                              {day.day}
                            </Text>
                          </View>
                          <View style={styles.chips}>
                            {evs.slice(0, more > 0 ? MAX_ROWS - 1 : MAX_ROWS).map((e) => (
                              <View
                                key={e.id}
                                style={[
                                  styles.chip,
                                  {
                                    backgroundColor: `${CATEGORY_COLOURS[e.category]}26`,
                                    borderLeftColor: CATEGORY_COLOURS[e.category],
                                  },
                                ]}
                              >
                                <Text numberOfLines={1} style={[styles.chipText, { color: t.text }]}>
                                  {e.name}
                                </Text>
                              </View>
                            ))}
                            {more > 0 ? (
                              <Text style={[styles.chipText, { color: t.muted }]}>+{more + 1} more</Text>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </Card>
            </View>

            <Text style={[typography.section, { color: t.text }]}>{dayTitle(selected)}</Text>
            {events === undefined ? (
              <LoadingState />
            ) : dayEvents.length === 0 ? (
              <EmptyState
                icon="calendar-clear-outline"
                title="Nothing on"
                message={
                  shown.length < all.length
                    ? "Nothing that matches the filters on this day."
                    : "Add something with the button below. Everything here is also on the SOW Events Google Calendar."
                }
              />
            ) : (
              <Card>
                {dayEvents.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onPress={
                      event.kind === "attendance"
                        ? () => router.push(`/attendance/event/${event.id}`)
                        : event.canEdit
                          ? () =>
                              setEditing({
                                id: event.id as Id<"calendarEntries">,
                                name: event.name,
                                dateStart: event.dateStart,
                                dateEnd: event.dateEnd,
                                subgroups: event.subgroups,
                                category: event.category as EditableEntry["category"],
                                notes: event.notes,
                              })
                          : undefined
                    }
                  />
                ))}
              </Card>
            )}
            {presentCategories.length > 0 ? (
              <FilterRow title="What">
                {presentCategories.map((c) => (
                  <FilterChip
                    key={c.key}
                    on={categories.includes(c.key)}
                    label={c.label}
                    colour={CATEGORY_COLOURS[c.key]}
                    count={inMonth(all.filter((e) => e.category === c.key))}
                    onPress={() => setCategories((prev) => toggle(prev, c.key))}
                  />
                ))}
              </FilterRow>
            ) : null}
            {presentCampuses.length > 1 ? (
              <FilterRow title="Where">
                {presentCampuses.map((s) => (
                  <FilterChip
                    key={s}
                    on={campuses.includes(s)}
                    label={subgroupLabel(s)}
                    colour={universityColour(s)}
                    count={inMonth(all.filter((e) => e.subgroups.includes(s)))}
                    onPress={() => setCampuses((prev) => toggle(prev, s))}
                  />
                ))}
              </FilterRow>
            ) : null}

            {events && events.length >= 500 ? (
              <Muted>Showing the first 500 events this month.</Muted>
            ) : null}
          </View>
        </ReadableColumn>
      </ChromeScreen>
      {subgroup && subgroups ? (
        <CalendarEntrySheet
          visible={adding || editing !== null}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          day={selected}
          subgroups={subgroups}
          defaultSubgroup={subgroup}
          entry={editing ?? undefined}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  monthBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  arrow: { padding: spacing.xs },
  todayButton: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    marginTop: -spacing.sm,
  },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontWeight: "700" },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: radius.md,
    minHeight: 92,
    gap: 2,
  },
  dayNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: { alignSelf: "stretch", gap: 2 },
  chip: { borderLeftWidth: 3, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 },
  chipText: { fontSize: 10, lineHeight: 13, fontWeight: "600" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  eventBar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  fab: {
    position: "absolute",
    bottom: spacing.md,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.full,
    zIndex: 20,
  },
});
