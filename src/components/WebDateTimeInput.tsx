import { type CSSProperties } from "react";
import { View } from "react-native";
import { Txt } from "@/components/ui";
import { typography, useAppTheme, type AppTheme } from "@/theme";

const inputStyle = (t: AppTheme): CSSProperties => ({
  display: "block",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  height: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "none",
  boxSizing: "border-box",
  WebkitAppearance: "none",
  appearance: "none",
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
