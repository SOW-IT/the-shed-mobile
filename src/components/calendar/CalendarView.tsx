import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import {
  CALENDAR_CATEGORIES,
  calendarCategoryLabel,
  daysOf,
  eventsByDay,
  monthGrid,
  monthNumber,
  monthWindow,
  parseDayKey,
  shiftDay,
  shiftMonth,
  sydneyDayKey,
  weekLayout,
  weekNumber,
  weekOf,
  type CalendarCategory,
} from "@shared/calendar";
import { subgroupLabel } from "@shared/rollcall";
import { universityColour } from "@shared/flow";
import { togglePicked } from "@shared/churches";
import { ChromeScreen } from "@/components/ChromeScreen";
import { useWideLayout } from "@/components/nav/layout";
import type { Id } from "../../../convex/_generated/dataModel";
import { type AttendanceDraft, CreateEventSheet } from "@/components/attendance/CreateEventSheet";
import { CalendarEntrySheet, type EditableEntry } from "@/components/calendar/CalendarEntrySheet";
import { CATEGORY_COLOURS, eventColour } from "@/components/calendar/categoryColours";
import { dayTitle } from "@/components/calendar/dayTitle";
import { BAR_ROW, barColumn, EventBar, MoreLabel } from "@/components/calendar/EventBar";
import { SwipePeriod, type SwipePeriodHandle } from "@/components/calendar/SwipePeriod";
import { WeekView } from "@/components/calendar/WeekView";
import { EVENTS, FilterChip, FilterRow } from "@/components/FilterChips";
import { useAttendanceSubgroup } from "@/hooks/useAttendanceSubgroup";
import { useCalendarView } from "@/hooks/useCalendarView";
import { sydneyTime } from "@/lib/sydneyTime";
import { visibleColour } from "@/lib/visibleColour";
import { Card, IconButton, LoadingState, Muted, ReadableColumn, Screen, Segmented, Facts, Txt } from "@/components/ui";
import { durations, radius, spacing, typography, useAppTheme } from "@/theme";

type CalendarEvent = NonNullable<ReturnType<typeof useRange>>[number];
const useRange = (window: { from: number; to: number }, skip: boolean) =>
  useQuery(api.calendar.range, skip ? "skip" : window);

const WEEKDAYS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
] as const;

const MAX_ROWS = 2;
const CELL_HEIGHT = 66;
const WEEK_GAP = 2;
const monthHeight = (year: number, month: number) =>
  (typography.caption.lineHeight ?? 0) + monthGrid(year, month).length * (CELL_HEIGHT + WEEK_GAP);
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

const PeriodTitle = ({ label, unit, step, wide }: { label: string; unit: string; step: (by: -1 | 1) => void; wide: boolean }) => {
  const t = useAppTheme();
  const native = Platform.OS !== "web";
  const heading = (
    <View
      accessible
      accessibilityRole={native ? "adjustable" : "header"}
      accessibilityLabel={label}
      accessibilityHint={native ? `Swipe up or down for the next or previous ${unit}` : `Left and right arrow keys change the ${unit}`}
      accessibilityActions={[
        { name: "increment", label: `Next ${unit}` },
        { name: "decrement", label: `Previous ${unit}` },
      ]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      style={wide ? styles.periodLabel : undefined}
    >
      <Text
        numberOfLines={1}
        style={[
          wide ? typography.title : typography.headline,
          { color: t.text, fontWeight: "800", textAlign: "center" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
  if (!wide) return heading;
  return (
    <View style={styles.periodRow}>
      <IconButton
        name="chevron-back"
        size={40}
        accessibilityLabel={`Previous ${unit}`}
        onPress={() => step(-1)}
      />
      {heading}
      <IconButton
        name="chevron-forward"
        size={40}
        accessibilityLabel={`Next ${unit}`}
        onPress={() => step(1)}
      />
    </View>
  );
};

const EventRow = ({ event, onPress }: { event: CalendarEvent; onPress?: () => void }) => {
  const t = useAppTheme();
  const picked = eventColour(event);
  const colour = visibleColour(picked, t);
  const ownColour = picked !== CATEGORY_COLOURS[event.category];
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
      accessibilityLabel={[event.name, calendarCategoryLabel(event.category), when, where].filter(Boolean).join(", ")}
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
        <View style={styles.eventFacts}>
          <Text
            numberOfLines={1}
            style={[typography.caption, { color: ownColour ? t.text : colour, fontWeight: "800" }]}
          >
            {calendarCategoryLabel(event.category)}
          </Text>
          <Facts
            numberOfLines={1}
            parts={[
              where,
              event.fromEventRequest
                ? "Event request"
                : event.kind === "entry" && !event.due
                  ? "Calendar only"
                  : null,
            ]}
          />
        </View>
        {event.notes ? (
          <Text selectable style={[typography.caption, { color: t.text }]}>
            {event.notes}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <Ionicons
          name={event.kind === "entry" && !event.eventRequestId ? "create-outline" : "chevron-forward"}
          size={18}
          color={t.faint}
        />
      ) : null}
    </Pressable>
  );
};

export function CalendarView({ onBack }: { onBack?: () => void } = {}) {
  const t = useAppTheme();
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const staff = !!me?.profile;
  const [now, setNow] = useState(() => Date.now());
  const today = sydneyDayKey(now);
  const [ty, tm] = today.split("-").map(Number);
  const [{ year, month }, setMonth] = useState({ year: ty, month: tm });
  const [selected, setSelected] = useState(today);
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
  const [addTime, setAddTime] = useState<string | undefined>();
  const [editing, setEditing] = useState<EditableEntry | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<{ subgroup: string; draft: AttendanceDraft } | null>(
    null
  );
  const handoff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useFocusEffect(useCallback(() => () => clearTimeout(handoff.current), []));
  const wide = useWideLayout();
  const { day, view: linkedView, at } = useLocalSearchParams<{ day?: string; view?: string; at?: string }>();
  const linkKey = `${day ?? ""}:${at ?? ""}`;
  const [appliedLink, setAppliedLink] = useState("");
  if (linkKey !== appliedLink) {
    setAppliedLink(linkKey);
    const linked = parseDayKey(day);
    if (linked) {
      const [y, m] = linked.split("-").map(Number);
      setMonth({ year: y, month: m });
      setSelected(linked);
    }
  }
  useEffect(() => {
    if (linkedView === "week" || linkedView === "month") setView(linkedView);
  }, [linkedView, setView]);
  const events = useRange(monthWindow(year, month), !staff);
  const before = shiftMonth(year, month, -1);
  const after = shiftMonth(year, month, 1);
  const eventsBefore = useRange(monthWindow(before.year, before.month), !staff);
  const eventsAfter = useRange(monthWindow(after.year, after.month), !staff);
  const period = useRef<SwipePeriodHandle>(null);
  const sheetOpen = adding || editing !== null || attendanceDraft !== null;
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web" || sheetOpen) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const target = e.target as HTMLElement | null;
        if (target?.closest?.("input, textarea, select, [contenteditable], [role=dialog]")) return;
        if (period.current?.slide(e.key === "ArrowRight" ? 1 : -1)) e.preventDefault();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [sheetOpen])
  );
  const subgroups = useQuery(api.events.subgroups, staff ? {} : "skip");
  const [subgroup] = useAttendanceSubgroup(subgroups, me?.profile?.assignments);

  if (me === undefined) {
    return (
      <Screen onBack={onBack}>
        <LoadingState />
      </Screen>
    );
  }
  if (!staff) {
    if (onBack) {
      return (
        <ChromeScreen onBack={onBack}>
          <Card>
            <Txt style={typography.section}>Calendar</Txt>
            <Muted>Calendar is for SOW staff.</Muted>
          </Card>
        </ChromeScreen>
      );
    }
    return <Redirect href={me === null ? "/home" : "/org"} />;
  }

  const monthKeys = new Set(
    monthGrid(year, month)
      .flat()
      .filter((d) => d.inMonth)
      .map((d) => d.key)
  );
  const all = events ?? [];
  const filtersFor = (list: CalendarEvent[]) => {
    const cats = categories.filter((c) => list.some((e) => e.category === c));
    const where = campuses.filter((s) => list.some((e) => e.subgroups.includes(s)));
    return (e: CalendarEvent) =>
      (cats.length === 0 || cats.includes(e.category)) &&
      (where.length === 0 || e.subgroups.some((s) => where.includes(s)));
  };
  const shown = all.filter(filtersFor(all));
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

  const landing = (by: number) => {
    if (view === "week") {
      const shifted = shiftDay(selected, 7 * by);
      const [y, m] = shifted.split("-").map(Number);
      return { year: y, month: m, selected: shifted };
    }
    const next = shiftMonth(year, month, by);
    const first = `${next.year}-${String(next.month).padStart(2, "0")}-01`;
    return { ...next, selected: next.year === ty && next.month === tm ? today : first };
  };
  const onPage = (by: number) => {
    const next = landing(by);
    setMonth({ year: next.year, month: next.month });
    setSelected(next.selected);
  };
  const goToday = () => {
    setMonth({ year: ty, month: tm });
    setSelected(today);
  };
  const showToday = () => {
    const by =
      view === "week" ? weekNumber(today) - weekNumber(selected) : monthNumber(ty, tm) - monthNumber(year, month);
    if (by !== 1 && by !== -1) return goToday();
    period.current?.slide(by, goToday);
  };
  const loadedMonth = (y: number, m: number) =>
    [eventsBefore, events, eventsAfter][monthNumber(y, m) - monthNumber(year, month) + 1];

  const openerFor = (event: CalendarEvent) =>
    event.kind === "attendance"
      ? () => router.push(`/attendance/event/${event.id}`)
      : event.eventRequestId
        ? () => router.push(`/event-requests/${event.eventRequestId}`)
        : event.canEdit
          ? () =>
              setEditing({
                id: event.id as Id<"calendarEntries">,
                name: event.name,
                dateStart: event.dateStart,
                dateEnd: event.dateEnd,
                notes: event.notes,
                due: event.due,
                colour: event.colour,
              })
          : undefined;

  const title = (
    <PeriodTitle
      label={view === "week" ? weekTitle(week) : monthTitle(year, month)}
      unit={view}
      step={(by) => period.current?.slide(by)}
      wide={wide}
    />
  );
  const floating = (
    <View style={styles.bottomBarWrap} pointerEvents="box-none">
      <View style={styles.bottomBar} pointerEvents="box-none">
        <View style={styles.side} pointerEvents="box-none">
          <Pressable
            onPress={showToday}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.todayButton,
              t.surfaceEdge,
              { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[typography.caption, { color: t.text, fontWeight: "800" }]}>Today</Text>
          </Pressable>
        </View>
        <View style={[styles.viewToggle, t.surfaceEdge, { backgroundColor: t.card }]}>
          <Segmented
            pill
            segments={VIEWS}
            active={view}
            onChange={(key) => {
              setView(key as typeof view);
              router.setParams({ view: key });
            }}
          />
        </View>
        <View style={[styles.side, styles.sideEnd]} pointerEvents="box-none">
          {me?.isAdmin ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Calendar history"
              onPress={() => router.push("/calendar-history")}
              style={({ pressed }) => [
                styles.historyButton,
                t.surfaceEdge,
                { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Ionicons name="time-outline" size={20} color={t.text} />
            </Pressable>
          ) : null}
          {subgroup ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add an event on ${dayTitle(selected)}`}
              onPress={() => {
                setAddTime(undefined);
                setAdding(true);
              }}
              style={({ pressed }) => [
                styles.addButton,
                t.surfaceEdge,
                { backgroundColor: t.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Ionicons name="add" size={26} color={t.onPrimary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  const renderPeriod = (by: -1 | 0 | 1): ReactNode => {
    const atPeriod = by === 0 ? { year, month, selected } : landing(by);
    const list = by === 0 ? all : (loadedMonth(atPeriod.year, atPeriod.month) ?? []);
    const days = by === 0 ? byDay : eventsByDay(list.filter(filtersFor(list)));
    if (view === "week") {
      return (
        <Card style={wide ? undefined : styles.fullBleedCard}>
          <WeekView
            height={monthHeight(atPeriod.year, atPeriod.month)}
            week={weekOf(atPeriod.selected)}
            byDay={days}
            today={today}
            selected={atPeriod.selected}
            now={now}
            onSelectDay={setSelected}
            onOpen={(event, d) => (openerFor(event) ?? (() => setSelected(d)))()}
            onAddAt={
              subgroup
                ? (d, hour) => {
                    setSelected(d);
                    setAddTime(`${String(hour).padStart(2, "0")}:00`);
                    setAdding(true);
                  }
                : undefined
            }
          />
        </Card>
      );
    }
    return (
      <Card style={[styles.monthCard, wide ? undefined : styles.fullBleedCard]}>
        <View style={styles.week}>
          {WEEKDAYS.map((d) => (
            <Text key={d.key} style={[styles.weekday, typography.caption, { color: t.faint }]}>
              {d.label}
            </Text>
          ))}
        </View>
        {monthGrid(atPeriod.year, atPeriod.month).map((gridWeek) => {
          const { bars, more } = weekLayout(
            gridWeek.map((d) => d.key),
            days,
            MAX_ROWS
          );
          return (
            <View key={gridWeek[0].key} style={styles.week}>
              {gridWeek.map((d) => {
                const evs = days.get(d.key) ?? [];
                const isSelected = d.key === atPeriod.selected;
                const isToday = d.key === today;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => setSelected(d.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${dayTitle(d.key)}, ${evs.length} event${evs.length === 1 ? "" : "s"}`}
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
                            color: d.inMonth ? t.text : t.faint,
                            fontWeight: isSelected || isToday ? "800" : "500",
                          },
                        ]}
                      >
                        {d.day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
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
                      key={gridWeek[col].key}
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
    );
  };

  return (
    <>
      <ChromeScreen floating={floating} title={title} onBack={onBack}>
        <ReadableColumn>
          <View style={{ gap: spacing.md, paddingBottom: 72 }}>
            {wide ? title : null}
            <SwipePeriod
              key={view}
              ref={period}
              index={view === "week" ? weekNumber(selected) : monthNumber(year, month)}
              onPage={onPage}
              renderPage={renderPeriod}
              style={wide ? undefined : styles.fullBleed}
            />

            {events === undefined ? (
              <LoadingState />
            ) : dayEvents.length === 0 ? (
              <Muted>
                {shown.length < all.length
                  ? "Nothing that matches the filters on this day."
                  : "Nothing on this day."}
              </Muted>
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
                    counting={EVENTS}
                    onPress={() => setCategories((prev) => togglePicked(prev, c.key))}
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
                    counting={EVENTS}
                    onPress={() => setCampuses((prev) => togglePicked(prev, s))}
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
          onTakeAttendance={(owner, draft) => {
            setAdding(false);
            setEditing(null);
            clearTimeout(handoff.current);
            handoff.current = setTimeout(
              () => setAttendanceDraft({ subgroup: owner, draft }),
              durations.sheetHandoff
            );
          }}
        />
      ) : null}
      {subgroup && subgroups ? (
        <CreateEventSheet
          visible={attendanceDraft !== null}
          onClose={() => setAttendanceDraft(null)}
          subgroup={attendanceDraft?.subgroup ?? subgroup}
          subgroups={subgroups}
          draft={attendanceDraft?.draft}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  bottomBarWrap: {
    position: "absolute",
    bottom: spacing.md,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    zIndex: 20,
  },
  bottomBar: {
    width: "100%",
    maxWidth: 720,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  todayButton: { height: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.full },
  side: { flexGrow: 1, flexBasis: 72, alignItems: "flex-start" },
  sideEnd: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: spacing.xs },
  historyButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  viewToggle: {
    width: 180,
    flexShrink: 1,
    marginHorizontal: spacing.xs,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  addButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  fullBleed: { marginHorizontal: -spacing.lg },
  fullBleedCard: {
    paddingHorizontal: 0,
    paddingVertical: spacing.sm,
    borderRadius: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  periodRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  periodLabel: { flex: 1, minWidth: 0 },
  monthCard: { gap: WEEK_GAP },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontWeight: "700" },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingTop: 2,
    paddingBottom: 4,
    paddingHorizontal: 2,
    borderRadius: radius.md,
    minHeight: CELL_HEIGHT,
    gap: 2,
  },
  dayNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  bars: { position: "absolute", top: 32, left: 0, right: 0, bottom: 0 },
  slot: { position: "absolute", paddingHorizontal: 2 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  eventBar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  eventFacts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: spacing.md },
});
