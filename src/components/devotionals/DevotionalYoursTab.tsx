import { Card, IconButton, Muted, Segmented } from "@/components/ui";
import { useLocalDevotionals } from "@/lib/devotionalStorage";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { monthGrid, shiftDay, shiftMonth, weekOf } from "@shared/calendar";
import { isDevotionalDone } from "@shared/devotionalGroups";
import {
  hasDevotionalContent,
  isFutureDevotionalDate,
  mergeMonthDevotionals,
  todayDevotionalDate,
} from "@shared/devotionals";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";

const WEEKDAYS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
] as const;

const VIEWS = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
];

const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );

const dayLabel = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
};

const weekHeading = (week: readonly string[]) => `${dayLabel(week[0])} - ${dayLabel(week[6])}`;

export const DevotionalYoursTab = () => {
  const t = useAppTheme();
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const email = me?.email ?? null;
  const drafts = useLocalDevotionals(email);

  const today = todayDevotionalDate();
  const [ty, tm] = today.split("-").map(Number);
  const [view, setView] = useState<"month" | "week">("month");
  const [{ year, month }, setPeriod] = useState({ year: ty, month: tm });
  const [weekAnchor, setWeekAnchor] = useState(today);

  const activeWeek = weekOf(weekAnchor);
  const [wy1, wm1] = activeWeek[0].split("-").map(Number);
  const [wy2, wm2] = activeWeek[6].split("-").map(Number);
  const queryYear = view === "month" ? year : wy1;
  const queryMonth = view === "month" ? month : wm1;
  const spansTwoMonths = view === "week" && (wy1 !== wy2 || wm1 !== wm2);

  const monthRows = useQuery(api.devotionals.byMonth, { year: queryYear, month: queryMonth });
  const secondMonthRows = useQuery(
    api.devotionals.byMonth,
    spansTwoMonths ? { year: wy2, month: wm2 } : "skip"
  );

  const byDate = mergeMonthDevotionals(monthRows, drafts, queryYear, queryMonth);
  if (spansTwoMonths) {
    for (const [key, entry] of mergeMonthDevotionals(secondMonthRows, drafts, wy2, wm2)) {
      byDate.set(key, entry);
    }
  }

  const openDay = (date: string) => {
    if (isFutureDevotionalDate(date, today)) return;
    router.push(`/devotionals/${date}`);
  };

  const atLatestMonth = year > ty || (year === ty && month >= tm);
  const atLatestWeek = activeWeek[6] >= today;

  const stepPeriod = (dir: -1 | 1) => {
    if (view === "month") {
      if (dir === 1 && atLatestMonth) return;
      setPeriod((prev) => shiftMonth(prev.year, prev.month, dir));
    } else {
      if (dir === 1 && atLatestWeek) return;
      const next = shiftDay(weekAnchor, dir * 7);
      setWeekAnchor(next);
      const [ny, nm] = next.split("-").map(Number);
      setPeriod({ year: ny, month: nm });
    }
  };

  const full = t.devoCalendar.full;
  const doneGlow =
    Platform.OS === "web"
      ? { boxShadow: `0px 0px 8px ${full.glow}` }
      : { shadowColor: full.bg, shadowOpacity: 0.4, shadowRadius: 5, shadowOffset: { width: 0, height: 1 }, elevation: 3 };

  const todayEntry = byDate.get(today) ?? (drafts[today] && hasDevotionalContent(drafts[today]) ? drafts[today] : undefined);

  return (
    <View style={styles.stack} testID="devotional-yours-tab">
      <Pressable
        onPress={() => openDay(today)}
        accessibilityRole="button"
        accessibilityLabel="Open today's devotional"
        testID="devotional-today-card"
        style={({ pressed }) => [pressed && { opacity: 0.75 }]}
      >
        <Card style={styles.todayCard}>
          <View style={styles.todayInfo}>
            <Text style={[typography.caption, { color: t.muted, fontWeight: "700" }]}>
              Today · {dayLabel(today)}
            </Text>
            <Text style={[typography.headline, { color: t.text }]} numberOfLines={1}>
              {todayEntry?.passage || (todayEntry ? "Saved devotional" : "Start today's devotional")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.faint} />
        </Card>
      </Pressable>

      <Segmented
        segments={VIEWS}
        active={view}
        onChange={(next) => {
          const mode = next as "month" | "week";
          setView(mode);
          if (mode === "week") {
            const target = year === ty && month === tm ? today : `${year}-${String(month).padStart(2, "0")}-01`;
            setWeekAnchor(target);
          }
        }}
      />

      <View style={styles.periodRow}>
        <IconButton
          name="chevron-back"
          size={38}
          accessibilityLabel={view === "month" ? "Previous month" : "Previous week"}
          onPress={() => stepPeriod(-1)}
        />
        <Text style={[typography.headline, styles.periodText, { color: t.text }]} numberOfLines={1}>
          {view === "month" ? monthLabel(year, month) : weekHeading(activeWeek)}
        </Text>
        <IconButton
          name="chevron-forward"
          size={38}
          accessibilityLabel={view === "month" ? "Next month" : "Next week"}
          disabled={view === "month" ? atLatestMonth : atLatestWeek}
          onPress={() => stepPeriod(1)}
        />
      </View>

      {view === "month" ? (
        <View testID="devotional-month-grid">
        <Card style={styles.monthCard}>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day.key} style={[styles.weekday, typography.caption, { color: t.faint }]}>
                {day.label}
              </Text>
            ))}
          </View>
          {monthGrid(year, month).map((week) => (
            <View key={week[0].key} style={styles.weekRow}>
              {week.map((day) => {
                const future = isFutureDevotionalDate(day.key, today);
                const isToday = day.key === today;
                const hasEntry = day.inMonth && byDate.has(day.key);
                const done = hasEntry && !future && isDevotionalDone(byDate.get(day.key));
                return (
                  <Pressable
                    key={day.key}
                    disabled={future || !day.inMonth}
                    onPress={() => openDay(day.key)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: future || !day.inMonth }}
                    accessibilityLabel={`${dayLabel(day.key)}${done ? ", done" : hasEntry ? ", has devotional" : ""}`}
                    testID={`devotional-day-${day.key}`}
                    style={({ pressed }) => [
                      styles.cell,
                      pressed && !future && day.inMonth && { opacity: 0.65 },
                    ]}
                  >
                    <View
                      style={[
                        styles.dayNum,
                        done && [{ backgroundColor: full.bg, borderColor: full.border, borderWidth: 1 }, doneGlow],
                        isToday && { borderColor: done ? full.text : t.primary, borderWidth: 2 },
                      ]}
                    >
                      <Text
                        style={[
                          typography.body,
                          {
                            color: done ? full.text : !day.inMonth || future ? t.faint : t.text,
                            opacity: !day.inMonth ? 0.35 : future ? 0.45 : 1,
                            fontWeight: isToday || done ? "800" : "500",
                          },
                        ]}
                      >
                        {day.day}
                      </Text>
                    </View>
                    <View style={styles.dotSlot}>
                      {done ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={11}
                          color={full.bg}
                          testID={`devotional-tick-${day.key}`}
                        />
                      ) : hasEntry ? (
                        <View
                          style={[styles.dot, { backgroundColor: t.primary }]}
                          testID={`devotional-dot-${day.key}`}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Card>
        </View>
      ) : (
        <View testID="devotional-week-list">
        <Card style={styles.weekCard}>
          {activeWeek.map((dayKey) => {
            const future = isFutureDevotionalDate(dayKey, today);
            const isToday = dayKey === today;
            const entry = byDate.get(dayKey);
            const done = !future && isDevotionalDone(entry);
            return (
              <Pressable
                key={dayKey}
                disabled={future}
                onPress={() => openDay(dayKey)}
                accessibilityRole="button"
                accessibilityState={{ disabled: future }}
                accessibilityLabel={`${dayLabel(dayKey)}${entry?.passage ? `, ${entry.passage}` : ""}`}
                testID={`devotional-week-day-${dayKey}`}
                style={({ pressed }) => [
                  styles.weekItem,
                  { borderBottomColor: t.separator },
                  pressed && !future && { opacity: 0.65 },
                ]}
              >
                <View style={styles.weekDayCol}>
                  <Text
                    style={[
                      typography.label,
                      {
                        color: future ? t.faint : isToday ? t.primary : t.text,
                        fontWeight: isToday ? "800" : "600",
                      },
                    ]}
                  >
                    {dayLabel(dayKey)}
                  </Text>
                </View>
                <Text
                  style={[
                    typography.body,
                    styles.weekPassage,
                    { color: entry?.passage ? t.text : t.faint },
                  ]}
                  numberOfLines={1}
                >
                  {entry?.passage || (entry ? "Saved" : "")}
                </Text>
                {done ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={full.bg}
                    testID={`devotional-week-tick-${dayKey}`}
                  />
                ) : null}
                {!future ? (
                  <Ionicons name="chevron-forward" size={16} color={t.faint} />
                ) : null}
              </Pressable>
            );
          })}
        </Card>
        </View>
      )}

      {monthRows === undefined ? <Muted>Loading...</Muted> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  todayCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  todayInfo: { flex: 1, gap: 2 },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  periodText: { flex: 1, textAlign: "center" },
  monthCard: { gap: spacing.xs },
  weekRow: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontWeight: "700", paddingBottom: spacing.xs },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    gap: 3,
  },
  dayNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dotSlot: { height: 11, alignItems: "center", justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  weekCard: { paddingVertical: spacing.xs },
  weekItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekDayCol: { width: 108 },
  weekPassage: { flex: 1 },
});
