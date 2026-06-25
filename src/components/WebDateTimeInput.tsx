import { type CSSProperties } from "react";
import { View } from "react-native";
import { Txt } from "@/components/ui";
import { typography, useAppTheme, type AppTheme } from "@/theme";

/**
 * Web-only date/time fields backed by the browser's native pickers. On web,
 * react-native-web renders raw DOM elements via react-dom, so `<input>` works.
 * Values are plain strings: "YYYY-MM-DD" for dates, "HH:MM" for times — which
 * is exactly what the event/export parsing already expects.
 *
 * Callers gate these behind `Platform.OS === "web"`; on native the components
 * are imported but never rendered.
 */

const inputStyle = (t: AppTheme): CSSProperties => ({
  width: "100%",
  // Let the native date control shrink with its flex column instead of forcing
  // its intrinsic width and spilling out of the row on narrow (mobile) screens.
  minWidth: 0,
  height: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "none",
  boxSizing: "border-box",
  backgroundColor: t.inputBackground,
  color: t.text,
  fontSize: 15,
  fontFamily: "inherit",
  accentColor: t.primary,
});

export const WebDateInput = ({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) => {
  const t = useAppTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Txt style={[typography.label, { color: t.muted }]}>{label}</Txt>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle(t)}
      />
    </View>
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
  const t = useAppTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Txt style={[typography.label, { color: t.muted }]}>{label}</Txt>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle(t)}
      />
    </View>
  );
};
