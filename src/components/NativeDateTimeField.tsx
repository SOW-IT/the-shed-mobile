import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Btn, Sheet, Txt } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";
import {
  parseDateInputValue,
  parseTimeInputValue,
  toDateInputValue,
  toTimeInputValue,
} from "@shared/datetime";

const inputToTime = (value: string): Date | null => {
  const parts = parseTimeInputValue(value);
  if (!parts) return null;
  const d = new Date();
  d.setHours(parts.hours, parts.minutes, 0, 0);
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
  placeholder?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}) => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const current = parseDateInputValue(value);
  const minDate = min ? parseDateInputValue(min) ?? undefined : undefined;
  const maxDate = max ? parseDateInputValue(max) ?? undefined : undefined;
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
        <View style={{ alignSelf: "stretch", paddingVertical: spacing.sm }}>
          <DateTimePicker
            mode="date"
            display="spinner"
            style={{ width: "100%" }}
            value={initial}
            minimumDate={minDate}
            maximumDate={maxDate}
            accentColor={t.primary}
            onValueChange={(_event, date) => onChange(toDateInputValue(date))}
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
        <View style={{ alignSelf: "stretch", paddingVertical: spacing.sm }}>
          <DateTimePicker
            mode="time"
            display="spinner"
            style={{ width: "100%" }}
            value={initial}
            accentColor={t.primary}
            onValueChange={(_event, date) => onChange(toTimeInputValue(date))}
            onDismiss={() => setOpen(false)}
          />
        </View>
      </Sheet>
    </>
  );
};
