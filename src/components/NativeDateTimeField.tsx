import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Btn, Sheet, Txt } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

/**
 * Native date/time fields. They mirror the string API of WebDateTimeInput
 * ("YYYY-MM-DD" for dates, "HH:MM" for times) so a caller can pick the right
 * pair by `Platform.OS` without any value-shape changes.
 *
 * Unlike rendering `DateTimePicker` straight into a form, the picker here opens
 * in its OWN modal `Sheet` (a "Done" footer dismisses it). Both the date and
 * time pickers use the `spinner` (wheel) display on every native platform: the
 * iOS `inline` calendar's month/year expander is a native overlay that spilled
 * out of the sheet and overlapped the surrounding fields, so the spinner — which
 * has no such overlay — sits tidily in its dedicated surface instead. Callers
 * gate these behind `Platform.OS !== "web"`; on web the components are imported
 * but never rendered.
 */

const pad = (n: number) => String(n).padStart(2, "0");

const dateToInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inputToDate = (value: string): Date | null => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};
const timeToInput = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const inputToTime = (value: string): Date | null => {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
};

const formatDateDisplay = (d: Date): string =>
  d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const formatTimeDisplay = (d: Date): string =>
  d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const clampDate = (d: Date, min?: Date, max?: Date): Date => {
  let ms = d.getTime();
  if (min) ms = Math.max(ms, min.getTime());
  if (max) ms = Math.min(ms, max.getTime());
  return new Date(ms);
};

/** The tappable field that opens the picker sheet (and an optional clear ×). */
const FieldButton = ({
  label,
  display,
  hasValue,
  icon,
  onOpen,
  onClear,
}: {
  label: string;
  display: string;
  hasValue: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onOpen: () => void;
  onClear?: () => void;
}) => {
  const t = useAppTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Txt style={[typography.label, { color: t.muted }]}>{label}</Txt>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          height: 44,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: t.inputBackground,
        }}
      >
        {/* The clear button is a sibling (not nested) so tapping it can't bubble
            up and re-open the picker. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onOpen}
          style={({ pressed }) => [
            { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name={icon} size={16} color={t.faint} />
          <Txt
            numberOfLines={1}
            style={[typography.body, { flex: 1, color: hasValue ? t.text : t.faint }]}
          >
            {display}
          </Txt>
        </Pressable>
        {hasValue && onClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            hitSlop={8}
            onPress={onClear}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close-circle" size={16} color={t.faint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

export const NativeDateInput = ({
  label,
  value,
  min,
  max,
  placeholder = "Select date",
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  /** Shown when `value` is empty (e.g. "Any" for an optional range bound). */
  placeholder?: string;
  onChange: (value: string) => void;
  /** When set, an empty value is allowed and a clear (×) affordance is shown. */
  onClear?: () => void;
}) => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const current = inputToDate(value);
  const minDate = min ? inputToDate(min) ?? undefined : undefined;
  const maxDate = max ? inputToDate(max) ?? undefined : undefined;
  // The picker must open on a value within [min, max]; fall back to today.
  const initial = clampDate(current ?? new Date(), minDate, maxDate);
  return (
    <>
      <FieldButton
        label={label}
        icon="calendar-outline"
        hasValue={current !== null}
        display={current ? formatDateDisplay(current) : placeholder}
        onOpen={() => setOpen(true)}
        onClear={onClear ? () => onClear() : undefined}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        scrollable={false}
        title={label}
        footer={<Btn title="Done" onPress={() => setOpen(false)} />}
      >
        <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
          <DateTimePicker
            mode="date"
            // Spinner (not the iOS `inline` calendar) so the month/year expander
            // overlay can't spill out of the sheet over the other fields.
            display="spinner"
            value={initial}
            minimumDate={minDate}
            maximumDate={maxDate}
            accentColor={t.primary}
            onValueChange={(_event, date) => onChange(dateToInput(date))}
            onDismiss={() => setOpen(false)}
          />
        </View>
      </Sheet>
    </>
  );
};

export const NativeTimeInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const current = inputToTime(value);
  const initial = current ?? new Date();
  return (
    <>
      <FieldButton
        label={label}
        icon="time-outline"
        hasValue={current !== null}
        display={current ? formatTimeDisplay(current) : "Select time"}
        onOpen={() => setOpen(true)}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        scrollable={false}
        title={label}
        footer={<Btn title="Done" onPress={() => setOpen(false)} />}
      >
        <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
          <DateTimePicker
            mode="time"
            display="spinner"
            value={initial}
            accentColor={t.primary}
            onValueChange={(_event, date) => onChange(timeToInput(date))}
            onDismiss={() => setOpen(false)}
          />
        </View>
      </Sheet>
    </>
  );
};
