import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  calendarCategoryLabel,
  dayBlocks,
  runsSeveralDays,
  sydneyMinutes,
  weekLayout,
  type CalendarCategory,
  type Due,
} from "@shared/calendar";
import { eventColour } from "@/components/calendar/categoryColours";
import { dayTitle } from "@/components/calendar/dayTitle";
import { BAR_ROW, barColumn, EventBar, MoreLabel } from "@/components/calendar/EventBar";
import { sydneyTime } from "@/lib/sydneyTime";
import { radius, typography, useAppTheme } from "@/theme";

type WeekEvent = {
  id: string;
  name: string;
  dateStart: number;
  dateEnd: number;
  category: CalendarCategory;
  subgroups: string[];
  due: Due | null;
};

// In the strip along the top: events over several days, and deadlines due all day.
const inStrip = (event: WeekEvent) => event.due === "day" || runsSeveralDays(event);

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const GUTTER = 36;
const HOUR_HEIGHT = 44;
const STRIP_ROWS = 3;
// Narrower than this, a block has room for one cut-short line of its name.
const ONE_LINE_BELOW = 40;
// Day columns this narrow (a phone) get smaller text, so "Weekly" isn't split.
const SMALL_TEXT_BELOW = 60;
// Opens scrolled to the start of the day most things happen in.
const FIRST_HOUR_SHOWN = 7;

const hourLabel = (hour: number) => (hour === 0 ? "" : `${hour % 12 || 12} ${hour < 12 ? "am" : "pm"}`);

// A week like Google Calendar's: hours down the side, each event where it
// happens, and events running over several days in a strip along the top.
export const WeekView = <E extends WeekEvent>({
  week,
  byDay,
  today,
  selected,
  now,
  onSelectDay,
  onOpen,
  onAddAt,
}: {
  week: string[];
  byDay: Map<string, E[]>;
  today: string;
  selected: string;
  now: number;
  onSelectDay: (day: string) => void;
  onOpen: (event: E, day: string) => void;
  onAddAt?: (day: string, hour: number) => void;
}) => {
  const t = useAppTheme();
  const { height } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrolled = useRef(false);
  const [dayWidth, setDayWidth] = useState(0);
  const small = dayWidth > 0 && dayWidth < SMALL_TEXT_BELOW;
  const lineHeight = small ? 12 : 13;
  const strip = weekLayout(
    week,
    new Map(week.map((key) => [key, (byDay.get(key) ?? []).filter(inStrip)])),
    STRIP_ROWS
  );
  const stripRows = strip.more.some((count) => count > 0)
    ? STRIP_ROWS
    : Math.max(0, ...strip.bars.map((bar) => bar.row + 1));

  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row}>
        <View style={{ width: GUTTER }} />
        {week.map((key, i) => {
          const isSelected = key === selected;
          const isToday = key === today;
          return (
            <Pressable
              key={key}
              onPress={() => onSelectDay(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={dayTitle(key)}
              style={[styles.head, isSelected && { backgroundColor: t.primarySoft }]}
            >
              <Text style={[typography.caption, { color: t.faint, fontWeight: "700" }]}>{WEEKDAYS[i]}</Text>
              <View style={[styles.dayNumber, isToday && { borderColor: t.primary, borderWidth: 2 }]}>
                <Text
                  style={[
                    typography.body,
                    { color: t.text, fontWeight: isSelected || isToday ? "800" : "500" },
                  ]}
                >
                  {Number(key.slice(8))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {stripRows > 0 ? (
        <View style={[styles.row, { height: stripRows * BAR_ROW }]}>
          <View style={{ width: GUTTER }} />
          <View style={{ flex: 1 }}>
            {strip.bars.map((bar) => (
              <View
                key={bar.event.id}
                style={[styles.slot, barColumn(bar.start, bar.span), { top: bar.row * BAR_ROW }]}
              >
                <EventBar event={bar.event} fromBefore={bar.fromBefore} toAfter={bar.toAfter} />
                {/* A target per day, so tapping Friday on a long bar picks Friday. */}
                <View style={[StyleSheet.absoluteFill, styles.row]}>
                  {Array.from({ length: bar.span }, (_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => onOpen(bar.event, week[bar.start + i])}
                      accessible={i === 0}
                      accessibilityRole="button"
                      accessibilityLabel={`${bar.event.name}, ${bar.event.due ? "due all day, " : ""}${calendarCategoryLabel(bar.event.category)}`}
                      style={{ flex: 1 }}
                    />
                  ))}
                </View>
              </View>
            ))}
            {strip.more.map((count, col) =>
              count > 0 ? (
                <Pressable
                  key={col}
                  onPress={() => onSelectDay(week[col])}
                  accessibilityRole="button"
                  accessibilityLabel={`${count} more on ${dayTitle(week[col])}`}
                  style={[styles.slot, barColumn(col), { top: (STRIP_ROWS - 1) * BAR_ROW }]}
                >
                  <MoreLabel count={count} />
                </Pressable>
              ) : null
            )}
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        style={{ height: Math.min(24 * HOUR_HEIGHT, Math.max(360, height * 0.6)) }}
        onLayout={() => {
          if (scrolled.current) return;
          scrolled.current = true;
          // A little above the hour, so its label isn't cut off.
          scrollRef.current?.scrollTo({ y: FIRST_HOUR_SHOWN * HOUR_HEIGHT - 10, animated: false });
        }}
      >
        <View
          style={[styles.row, { height: 24 * HOUR_HEIGHT }]}
          onLayout={(e) => setDayWidth((e.nativeEvent.layout.width - GUTTER) / 7)}
        >
          <View style={{ width: GUTTER }}>
            {HOURS.map((hour) => (
              <Text
                key={hour}
                numberOfLines={1}
                style={[styles.hourLabel, { top: hour * HOUR_HEIGHT - 7, color: t.faint }]}
              >
                {hourLabel(hour)}
              </Text>
            ))}
          </View>
          {week.map((key) => (
            <View key={key} style={[styles.day, { borderLeftColor: t.border }]}>
              {key === selected ? (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.picked, { backgroundColor: t.primarySoft }]} />
              ) : null}
              {HOURS.map((hour) => (
                <Pressable
                  key={hour}
                  disabled={!onAddAt}
                  accessible={false}
                  onPress={() => onAddAt?.(key, hour)}
                  style={({ pressed }) => [
                    styles.hour,
                    { top: hour * HOUR_HEIGHT, borderTopColor: t.border },
                    pressed && { backgroundColor: t.primarySoft },
                  ]}
                />
              ))}
              {dayBlocks((byDay.get(key) ?? []).filter((event) => !inStrip(event))).map((block) => {
                const colour = eventColour(block.event);
                const blockHeight = ((block.to - block.from) / 60) * HOUR_HEIGHT;
                const narrow = dayWidth / block.cols < ONE_LINE_BELOW;
                const lines = narrow ? 1 : Math.max(1, Math.floor((blockHeight - 4) / lineHeight));
                const start = sydneyTime(block.event.dateStart);
                return (
                  <Pressable
                    key={block.event.id}
                    onPress={() => onOpen(block.event, key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${block.event.name}, ${calendarCategoryLabel(block.event.category)}, ${
                      block.event.due ? `due ${start}` : `${start} – ${sydneyTime(block.event.dateEnd)}`
                    }`}
                    style={[
                      styles.blockSlot,
                      {
                        top: (block.from / 60) * HOUR_HEIGHT,
                        height: blockHeight,
                        left: `${(block.col / block.cols) * 100}%`,
                        width: `${100 / block.cols}%`,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.block,
                        small && styles.blockSmall,
                        { backgroundColor: t.card, borderLeftColor: colour },
                      ]}
                    >
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: `${colour}33` }]} />
                      <Text
                        numberOfLines={lines}
                        style={[styles.blockText, small && styles.blockTextSmall, { color: t.text }]}
                      >
                        {block.event.due ? <Ionicons name="flag" size={10} color={colour} /> : null}
                        {block.event.due ? " " : ""}
                        <Text style={{ fontWeight: "700" }}>{block.event.name}</Text>
                        {lines > 1 ? `\n${start}` : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              {key === today ? (
                <View
                  pointerEvents="none"
                  style={[styles.now, { top: (sydneyMinutes(now) / 60) * HOUR_HEIGHT - 1 }]}
                >
                  <View style={[styles.nowDot, { backgroundColor: t.danger }]} />
                  <View style={[styles.nowLine, { backgroundColor: t.danger }]} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  head: { flex: 1, minWidth: 0, alignItems: "center", paddingVertical: 4, borderRadius: radius.md, gap: 2 },
  dayNumber: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  slot: { position: "absolute", paddingHorizontal: 2 },
  hourLabel: { position: "absolute", left: 0, right: 4, textAlign: "right", fontSize: 10, lineHeight: 14 },
  day: { flex: 1, minWidth: 0, borderLeftWidth: StyleSheet.hairlineWidth },
  picked: { opacity: 0.5 },
  hour: { position: "absolute", left: 0, right: 0, height: HOUR_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth },
  blockSlot: { position: "absolute", padding: 1 },
  // A phone's day column is about 43 points: enough for "Weekly" only without the usual padding.
  blockSmall: { borderLeftWidth: 2, paddingHorizontal: 1 },
  block: { flex: 1, borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 2, paddingVertical: 2, overflow: "hidden" },
  blockText: { fontSize: 10, lineHeight: 13 },
  blockTextSmall: { fontSize: 9, lineHeight: 12 },
  now: { position: "absolute", left: -3, right: 0, height: 2, flexDirection: "row", alignItems: "center" },
  nowDot: { width: 8, height: 8, borderRadius: 4, marginVertical: -3 },
  nowLine: { flex: 1, height: 2 },
});
