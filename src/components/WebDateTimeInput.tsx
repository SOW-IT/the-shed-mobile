import Ionicons from "@expo/vector-icons/Ionicons";
import { type CSSProperties, useState } from "react";
import { Pressable, View } from "react-native";
import { Txt } from "@/components/ui";
import { type AppTheme, typography, useAppTheme } from "@/theme";
import { parseDateInputValue } from "@shared/datetime";
import {
  formatDateDisplay,
  formatTimeDisplay,
  inputToTime,
} from "./dateTimeDisplay";

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

const typingInputStyle = (t: AppTheme): CSSProperties => ({
  ...hiddenInputStyle,
  opacity: 1,
  cursor: "text",
  padding: "0 12px",
  borderRadius: 8,
  backgroundColor: t.inputBackground,
  color: t.text,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  accentColor: t.primary,
});

const NOT_TYPING_KEYS = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "Escape", "Enter", " "]);

const openPicker = (input: HTMLInputElement) => {
  try {
    input.showPicker?.();
  } catch {
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
  needed,
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
  needed?: boolean;
}) => {
  const t = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [typing, setTyping] = useState(false);
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
          borderColor: focused || (needed && !display) ? t.primary : "transparent",
          backgroundColor: t.inputBackground,
        }}
      >
        <Ionicons name={icon} size={16} color={needed && !display ? t.primary : t.faint} />
        <Txt
          numberOfLines={1}
          style={[typography.body, { flex: 1, color: display ? t.text : needed ? t.primary : t.faint }]}
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
          onKeyDown={(e) => {
            if (!NOT_TYPING_KEYS.has(e.key)) setTyping(true);
          }}
          onBlur={() => {
            setFocused(false);
            setTyping(false);
          }}
          style={typing ? typingInputStyle(t) : hiddenInputStyle}
        />
        {display && onClear ? (
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
  needed,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  needed?: boolean;
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
      needed={needed}
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
