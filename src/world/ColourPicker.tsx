import { typography, useAppTheme } from "@/theme";
import { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View, type ViewStyle } from "react-native";
import { hslToRgb, parseHex, rgbToHsl, sliderColour, type Hsl } from "./colourPick";
import { hud, rgbHex } from "./palette";

const SEGMENTS = 24;
const noBrowserGestures = (Platform.OS === "web" ? { touchAction: "none", userSelect: "none" } : {}) as unknown as ViewStyle;
const THUMB = 26;
const ROWS = [
  { key: "h", name: "Hue" },
  { key: "s", name: "Strength" },
  { key: "l", name: "Lightness" },
] as const;

/**
 * One of the picker's sliders: its track shows the colours along it, and a
 * drag or tap anywhere on it picks. It takes the touch, so a drag here
 * doesn't scroll the editor.
 */
const ColourSlider = ({
  value,
  colourAt,
  onPick,
  label,
  testID,
}: {
  value: number;
  colourAt: (t: number) => number;
  onPick: (v: number) => void;
  label: string;
  testID: string;
}) => {
  const [width, setWidth] = useState(0);
  const pickAt = (x: number) => {
    if (width > 0) onPick(Math.max(0, Math.min(1, x / width)));
  };
  const step = (by: number) => onPick(Math.max(0, Math.min(1, value + by)));
  const keys =
    Platform.OS === "web"
      ? ({
          tabIndex: 0,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            const by = { ArrowRight: 0.02, ArrowUp: 0.02, ArrowLeft: -0.02, ArrowDown: -0.02, Home: -1, End: 1 }[e.key];
            if (by === undefined) return;
            e.preventDefault();
            step(by);
          },
        } as object)
      : {};
  return (
    <View
      style={[styles.track, noBrowserGestures]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 0.05 : -0.05)}
      {...keys}
      testID={testID}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponderCapture={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => pickAt(e.nativeEvent.locationX)}
      onResponderMove={(e) => pickAt(e.nativeEvent.locationX)}
    >
      <View style={styles.bar} pointerEvents="none">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <View key={`seg${i}`} style={[styles.segment, { backgroundColor: rgbHex(colourAt((i + 0.5) / SEGMENTS)) }]} />
        ))}
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: value * width - THUMB / 2, backgroundColor: rgbHex(colourAt(value)) }]}
      />
    </View>
  );
};

/**
 * Any colour: hue, strength and lightness sliders, and a box to type its hex
 * code. The colour changes as you drag; nothing is sent until Save.
 */
export const ColourPicker = ({ rgb, onPick, label }: { rgb: number; onPick: (rgb: number) => void; label: string }) => {
  const t = useAppTheme();
  // The sliders keep their own place, so the hue isn't lost on a grey.
  const [held, setHeld] = useState<{ rgb: number; hsl: Hsl }>(() => ({ rgb, hsl: rgbToHsl(rgb) }));
  const [typed, setTyped] = useState<string | null>(null);
  const current = held.rgb === rgb ? held : { rgb, hsl: rgbToHsl(rgb) };
  if (current !== held) setHeld(current);
  const pickHsl = (hsl: Hsl) => {
    const next = hslToRgb(hsl);
    setHeld({ rgb: next, hsl });
    setTyped(null);
    onPick(next);
  };
  const id = label.toLowerCase().replace(/ /g, "-");
  const hex = rgbHex(rgb).toUpperCase();
  return (
    <View style={[styles.panel, { backgroundColor: hud.primarySoft }]} testID={`world-editor-${id}-picker`}>
      {ROWS.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={[typography.caption, styles.name, { color: t.text }]}>{row.name}</Text>
          <View style={styles.grow}>
            <ColourSlider
              value={current.hsl[row.key]}
              colourAt={(v) => sliderColour(row.key, current.hsl, v)}
              onPick={(v) => pickHsl({ ...current.hsl, [row.key]: v })}
              label={`${label} ${row.name.toLowerCase()}`}
              testID={`world-editor-${id}-${row.key}`}
            />
          </View>
        </View>
      ))}
      <View style={styles.row}>
        <Text style={[typography.caption, styles.name, { color: t.text }]}>Hex</Text>
        <TextInput
          value={typed ?? hex}
          onChangeText={(text) => {
            setTyped(text);
            const parsed = parseHex(text);
            if (parsed !== null) {
              setHeld({ rgb: parsed, hsl: rgbToHsl(parsed) });
              onPick(parsed);
            }
          }}
          onBlur={() => setTyped(null)}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          accessibilityLabel={`${label} hex code`}
          testID={`world-editor-${id}-hex`}
          style={[typography.body, styles.hex, { color: t.text, borderColor: t.border, backgroundColor: t.background }]}
        />
        <View style={[styles.chip, { backgroundColor: rgbHex(rgb), borderColor: t.border }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { borderRadius: 14, padding: 10, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { width: 64 },
  grow: { flex: 1 },
  // Inset by half the thumb, so the thumb stays inside the panel at either end.
  track: { height: 30, justifyContent: "center", marginHorizontal: THUMB / 2 },
  bar: { flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden" },
  segment: { flex: 1 },
  thumb: { position: "absolute", top: 2, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3, borderColor: hud.cream },
  hex: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  chip: { width: 34, height: 34, borderRadius: 17, borderWidth: 2 },
});
