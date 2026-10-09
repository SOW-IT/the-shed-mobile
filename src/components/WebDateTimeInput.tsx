import { Ionicons } from "@expo/vector-icons";
import { type CSSProperties, useState } from "react";
import { Pressable, View } from "react-native";
import { Txt } from "@/components/ui";
import { typography, useAppTheme } from "@/theme";
import { parseDateInputValue } from "@shared/datetime";
import {
  formatDateDisplay,
  formatTimeDisplay,
  inputToTime,
} from "./dateTimeDisplay";

// The browser's input covers the whole field but is invisible, so a tap or
// click opens its own date/time picker while the field looks like the native
// app's: an icon and "Wed, 7 Oct 2026" in the app font, not the browser's.
// 16px stops iOS Safari zooming in when it takes focus.
const hiddenInputStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  padding: 0,
  border: "none",
  opacity: 0,
  cursor: "pointer",
  fontSize: 16,
  boxSizing: "border-box",
  WebkitAppearance: "none",
  appearance: "none",
};

/** Opens the picker on a click, not only on the browser's own picker icon. */
const openPicker = (input: HTMLInputElement) => {
  try {
    input.showPicker?.();
  } catch {
    // Already open, or the browser won't open it from here; typing still works.
  }
};

const WebPickerField = ({
  label,
  type,
  icon,
  value,
  display,
  placeholder,
  min,
  max,
  onChange,
  onClear,
}: {
  label: string;
  type: "date" | "time";
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  display: string | null;
  placeholder: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}) => {
  const t = useAppTheme();
  const [focused, setFocused] = useState(false);
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
          borderWidth: 1.5,
          borderColor: focused ? t.primary : "transparent",
          backgroundColor: t.inputBackground,
        }}
      >
        <Ionicons name={icon} size={16} color={t.faint} />
        <Txt
          numberOfLines={1}
          style={[typography.body, { flex: 1, color: display ? t.text : t.faint }]}
        >
          {display ?? placeholder}
        </Txt>
        <input
          type={type}
          aria-label={label}
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => openPicker(e.currentTarget)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={hiddenInputStyle}
        />
        {display && onClear ? (
          // After the input and raised, so it takes the tap instead of the picker.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            hitSlop={8}
            onPress={onClear}
            style={({ pressed }) => [{ zIndex: 1 }, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close-circle" size={16} color={t.faint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

export const WebDateInput = ({
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
  const date = parseDateInputValue(value);
  return (
    <WebPickerField
      label={label}
      type="date"
      icon="calendar-outline"
      value={value}
      display={date ? formatDateDisplay(date) : null}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={onChange}
      onClear={onClear}
    />
  );
};

export const WebTimeInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => {
  const time = inputToTime(value);
  return (
    <WebPickerField
      label={label}
      type="time"
      icon="time-outline"
      value={value}
      display={time ? formatTimeDisplay(time) : null}
      placeholder="Select time"
      onChange={onChange}
    />
  );
};
