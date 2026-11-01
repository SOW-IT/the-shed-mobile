import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, type ScrollViewInstance, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import {
  CALENDAR_CATEGORIES,
  calendarCategoryLabel,
  campusColourOf,
  daysOf,
  eventsByDay,
  monthGrid,
  monthWindow,
  parseDayKey,
  shiftDay,
  shiftMonth,
  sydneyDayKey,
  weekLayout,
  weekOf,
  type CalendarCategory,
} from "@shared/calendar";
import { subgroupLabel } from "@shared/rollcall";
import { universityColour } from "@shared/flow";
import { ChromeScreen } from "@/components/ChromeScreen";
import { useWideLayout } from "@/components/nav/layout";
import type { Id } from "../../../convex/_generated/dataModel";
import { CalendarEntrySheet, type EditableEntry } from "@/components/calendar/CalendarEntrySheet";
import { CATEGORY_COLOURS } from "@/components/calendar/categoryColours";
import { dayTitle } from "@/components/calendar/dayTitle";
import { BAR_ROW, barColumn, EventBar, MoreLabel } from "@/components/calendar/EventBar";
import { WeekView } from "@/components/calendar/WeekView";
import { FilterChip, FilterRow } from "@/components/FilterChips";
import { useAttendanceSubgroup } from "@/hooks/useAttendanceSubgroup";
import { useCalendarView } from "@/hooks/useCalendarView";
import { sydneyTime } from "@/lib/sydneyTime";
import { Card, EmptyState, LoadingState, Muted, ReadableColumn, Screen, Segmented } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type CalendarEvent = NonNullable<ReturnType<typeof useRange>>[number];
const useRange = (window: { from: number; to: number }, skip: boolean) =>
  useQuery(api.calendar.range, skip ? "skip" : window);

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MAX_ROWS = 3;
const VIEWS = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
];

const monthTitle = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );

const formatDay = (key: string, options: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
};

// "2 – 8 November 2026", "30 Nov – 6 Dec 2026", "28 Dec 2026 – 3 Jan 2027".
const weekTitle = (week: string[]) => {
  const [first, last] = [week[0], week[week.length - 1]];
  const full = formatDay(last, { day: "numeric", month: "long", year: "numeric" });
  if (first.slice(0, 7) === last.slice(0, 7)) return `${Number(first.slice(8))} – ${full}`;
  const short = { day: "numeric", month: "short" } as const;
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${formatDay(first, short)} – ${formatDay(last, { ...short, year: "numeric" })}`
    : `${formatDay(first, { ...short, year: "numeric" })} – ${formatDay(last, { ...short, year: "numeric" })}`;
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
  const campusColour = campusColourOf(event.category, event.subgroups);
  const colour = campusColour ?? CATEGORY_COLOURS[event.category];
  const where = event.subgroups.map(subgroupLabel).join(", ");
  const multiDay = daysOf(event.dateStart, event.dateEnd).length > 1;
  const at = (ms: number) => (multiDay ? `${shortDay(ms)}, ${sydneyTime(ms)}` : sydneyTime(ms));
  const when =
    event.due === "day"
      ? "Due all day"
      : event.due === "time"
        ? `Due ${sydneyTime(event.dateStart)}`
        : `${at(event.dateStart)} – ${at(event.dateEnd)}`;
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
          {event.due ? <Ionicons name="flag" size={14} color={colour} /> : null}
          {event.due ? " " : ""}
          {event.name}
        </Text>
        <Text style={[typography.caption, { color: t.muted }]}>{when}</Text>
        <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
          {/* Campus colours aren't all legible as text on both themes. */}
          <Text style={{ color: campusColour ? t.text : colour, fontWeight: "800" }}>
            {calendarCategoryLabel(event.category)}
          </Text>
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
  const [now, setNow] = useState(() => Date.now());
  const today = sydneyDayKey(now);
  const [ty, tm] = today.split("-").map(Number);
  const [{ year, month }, setMonth] = useState({ year: ty, month: tm });
  const [selected, setSelected] = useState(today);
  // Past Sydney midnight, move Today on; a selection still on the old day follows it.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const lastToday = useRef(today);
  useEffect(() => {
    const old = lastToday.current;
    lastToday.current = today;
    if (old === today || selected !== old) return;
    const [y, m] = today.split("-").map(Number);
    setSelected(today);
    setMonth({ year: y, month: m });
  }, [today, selected]);
  const [categories, setCategories] = useState<CalendarCategory[]>([]);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [view, setView] = useCalendarView();
  const [adding, setAdding] = useState(false);
  // A time picked on the week view, for the new event.
  const [addTime, setAddTime] = useState<string | undefined>();
  const [editing, setEditing] = useState<EditableEntry | null>(null);
  const wide = useWideLayout();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const gridBottom = useRef(0);
  const { day, view: linkedView } = useLocalSearchParams<{ day?: string; view?: string }>();
  useEffect(() => {
    const linked = parseDayKey(day);
    if (!linked) return;
    const [y, m] = linked.split("-").map(Number);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the day a link points at
    setMonth({ year: y, month: m });
    setSelected(linked);
  }, [day]);
  // `?view=week` opens the week view, and it's remembered like picking it.
  useEffect(() => {
    if (linkedView === "week" || linkedView === "month") setView(linkedView);
  }, [linkedView, setView]);
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
  // A chip picked in another month only applies where it has events.
  const pickedCategories = categories.filter((c) => all.some((e) => e.category === c));
  const pickedCampuses = campuses.filter((s) => all.some((e) => e.subgroups.includes(s)));
  const shown = all.filter(
    (e) =>
      (pickedCategories.length === 0 || pickedCategories.includes(e.category)) &&
      (pickedCampuses.length === 0 || e.subgroups.some((s) => pickedCampuses.includes(s)))
  );
  const byDay = eventsByDay(shown);
  const week = weekOf(selected);
  const visibleKeys = view === "week" ? new Set(week) : monthKeys;
  const inView = (list: CalendarEvent[]) =>
    new Set(
      [...eventsByDay(list).entries()]
        .filter(([key]) => visibleKeys.has(key))
        .flatMap(([, evs]) => evs.map((e) => e.id))
    ).size;
  const presentCategories = CALENDAR_CATEGORIES.filter((c) => all.some((e) => e.category === c.key));
  const presentCampuses = [...new Set(all.flatMap((e) => e.subgroups))].sort((a, b) =>
    a.localeCompare(b)
  );
  const dayEvents = byDay.get(selected) ?? [];

  const go = (by: number) => {
    if (view === "week") {
      const next = shiftDay(selected, 7 * by);
      const [y, m] = next.split("-").map(Number);
      setSelected(next);
      setMonth({ year: y, month: m });
      return;
    }
    const next = shiftMonth(year, month, by);
    setMonth(next);
    setSelected(
      next.year === ty && next.month === tm ? today : `${next.year}-${String(next.month).padStart(2, "0")}-01`
    );
  };

  const openerFor = (event: CalendarEvent) =>
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
              due: event.due,
            })
        : undefined;

  const floating = subgroup ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add an event on ${dayTitle(selected)}`}
      onPress={() => {
        setAddTime(undefined);
        setAdding(true);
      }}
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
                accessibilityLabel={view === "week" ? "Previous week" : "Previous month"}
                hitSlop={8}
                style={styles.arrow}
              >
                <Ionicons name="chevron-back" size={22} color={t.text} />
              </Pressable>
              <Text style={[typography.title, { color: t.text, flex: 1, textAlign: "center" }]}>
                {view === "week" ? weekTitle(week) : monthTitle(year, month)}
              </Text>
              <Pressable
                onPress={() => go(1)}
                accessibilityRole="button"
                accessibilityLabel={view === "week" ? "Next week" : "Next month"}
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
            <Segmented
              segments={VIEWS}
              active={view}
              onChange={(key) => {
                setView(key as typeof view);
                // Keep a `?view=` link in step, so reloading doesn't switch back.
                router.setParams({ view: key });
              }}
            />

            <View
              onLayout={(e) => {
                gridBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
              }}
            >
              {view === "week" ? (
                <Card>
                  <WeekView
                    week={week}
                    byDay={byDay}
                    today={today}
                    selected={selected}
                    now={now}
                    onSelectDay={setSelected}
                    onOpen={(event, day) => (openerFor(event) ?? (() => setSelected(day)))()}
                    onAddAt={
                      subgroup
                        ? (day, hour) => {
                            setSelected(day);
                            setAddTime(`${String(hour).padStart(2, "0")}:00`);
                            setAdding(true);
                          }
                        : undefined
                    }
                  />
                </Card>
              ) : (
                <Card>
                  <View style={styles.week}>
                    {WEEKDAYS.map((d, i) => (
                      <Text key={i} style={[styles.weekday, typography.caption, { color: t.faint }]}>
                        {d}
                      </Text>
                    ))}
                  </View>
                  {grid.map((gridWeek) => {
                    const { bars, more } = weekLayout(
                      gridWeek.map((d) => d.key),
                      byDay,
                      MAX_ROWS
                    );
                    return (
                      <View key={gridWeek[0].key} style={styles.week}>
                        {gridWeek.map((day) => {
                          const evs = byDay.get(day.key) ?? [];
                          const isSelected = day.key === selected;
                          const isToday = day.key === today;
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
                            </Pressable>
                          );
                        })}
                        {/* Over the days, so a camp is one bar; taps fall through to the day. */}
                        <View pointerEvents="none" style={styles.bars}>
                          {bars.map((bar) => (
                            <View
                              key={bar.event.id}
                              style={[styles.slot, barColumn(bar.start, bar.span), { top: bar.row * BAR_ROW }]}
                            >
                              <EventBar event={bar.event} fromBefore={bar.fromBefore} toAfter={bar.toAfter} />
                            </View>
                          ))}
                          {more.map((count, col) =>
                            count > 0 ? (
                              <View
                                key={col}
                                style={[styles.slot, barColumn(col), { top: (MAX_ROWS - 1) * BAR_ROW }]}
                              >
                                <MoreLabel count={count} />
                              </View>
                            ) : null
                          )}
                        </View>
                      </View>
                    );
                  })}
                </Card>
              )}
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
                    : "Add something with the button below."
                }
              />
            ) : (
              <Card>
                {dayEvents.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onPress={openerFor(event)}
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
                    count={inView(all.filter((e) => e.category === c.key))}
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
                    count={inView(all.filter((e) => e.subgroups.includes(s)))}
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
          time={editing ? undefined : addTime}
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
  // Below the day number: the cell's top padding, the number and the gap.
  bars: { position: "absolute", top: 38, left: 0, right: 0, bottom: 0 },
  slot: { position: "absolute", paddingHorizontal: 2 },
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
