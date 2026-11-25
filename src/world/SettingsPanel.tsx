import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { styledName } from "@shared/names";
import { blurBehind, itemStyle, popStyle, scrimStyle, useOverlayClock, WifiBars } from "./Overlays";
import { glass, hud } from "./palette";
import { saverOn, useWorldSetting, type WorldSettingKey, type WorldSettingValue } from "./settings";

const Toggle = ({ on, label, onChange, testID }: { on: boolean; label: string; onChange: (on: boolean) => void; testID: string }) => (
  <Pressable
    onPress={() => onChange(!on)}
    accessibilityRole="switch"
    accessibilityState={{ checked: on }}
    accessibilityLabel={label}
    hitSlop={8}
    testID={testID}
    style={[styles.toggle, on && styles.toggleOn]}
  >
    <View style={[styles.knob, on && styles.knobOn]} />
  </Pressable>
);

const Choice = <K extends WorldSettingKey>({
  setting,
  options,
  label,
  fill = false,
}: {
  setting: K;
  options: readonly { value: WorldSettingValue<K>; text: string; hint: string }[];
  label: string;
  fill?: boolean;
}) => {
  const [value, set] = useWorldSetting(setting);
  return (
    <View style={[styles.choices, fill && styles.choicesFill]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => set(option.value)}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === option.value }}
          accessibilityLabel={option.hint}
          testID={`world-setting-${setting}-${option.value}`}
          style={({ pressed }) => [styles.choice, fill && styles.choiceFill, value === option.value && styles.choiceOn, pressed && styles.pressed]}
        >
          <Text style={styles.choiceText} numberOfLines={1}>
            {option.text}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

const Row = ({ icon, title, note, children, style }: { icon: string; title: string; note?: string; children: ReactNode; style: object | null }) => (
  <Animated.View style={[styles.row, style]}>
    <Text style={styles.rowIcon}>{icon}</Text>
    <View style={styles.rowText}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {title}
      </Text>
      {note ? <Text style={styles.rowNote}>{note}</Text> : null}
    </View>
    {children}
  </Animated.View>
);

const StackedRow = ({ icon, title, children, style }: { icon: string; title: string; children: ReactNode; style: object | null }) => (
  <Animated.View style={[styles.row, styles.stacked, style]}>
    <View style={styles.stackedHead}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
    {children}
  </Animated.View>
);

const SAMPLE_TIME = "[2:15 PM]";

export const SettingsPanel = ({ open, top, myName, onClose }: { open: boolean; top: number; myName: string; onClose: () => void }) => {
  const overlay = useOverlayClock(open, 6);
  const { width, height } = useWindowDimensions();
  const [times, setTimes] = useWorldSetting("chatTimes");
  const [ping, setPing] = useWorldSetting("pingMs");
  const [motion, setMotion] = useWorldSetting("motion");
  const systemReduce = useReducedMotion();
  if (!overlay.mounted) return null;
  const saver = saverOn(motion, systemReduce);
  const name = myName || "Your Name";
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close settings" testID="world-settings-close">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle(overlay)]} />
      </Pressable>
      <Animated.View
        style={[styles.panel, blurBehind, { top, width: Math.min(380, width - 28), maxHeight: Math.max(0, height - top - 24) }, popStyle(overlay)]}
        testID="world-settings"
      >
        <Animated.View style={[styles.header, itemStyle(overlay, 0)]}>
          <View style={styles.gear}>
            <Ionicons name="settings" size={18} color={hud.onAccent} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Settings
          </Text>
          <View style={styles.grow} />
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={glass.text} />
          </Pressable>
        </Animated.View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          <Row icon="🕑" title="Chat times" note={times === "on" ? SAMPLE_TIME : undefined} style={itemStyle(overlay, 1)}>
            <Toggle on={times === "on"} label="Chat times" onChange={(on) => setTimes(on ? "on" : "off")} testID="world-setting-chatTimes" />
          </Row>
          <Row icon="📶" title="Ping" style={itemStyle(overlay, 2)}>
            <View style={styles.pingSample}>
              {ping === "on" ? <Text style={styles.pingMs}>42 ms</Text> : null}
              <WifiBars bars={4} size={18} off={glass.row} />
            </View>
            <Toggle on={ping === "on"} label="Show ping in milliseconds" onChange={(on) => setPing(on ? "on" : "off")} testID="world-setting-pingMs" />
          </Row>
          <Row icon="🔋" title="Battery saver" note={motion === "auto" && systemReduce ? "On with Reduce Motion" : "Fewer animations"} style={itemStyle(overlay, 3)}>
            <Toggle on={saver} label="Battery saver" onChange={(on) => setMotion(on ? "saver" : "full")} testID="world-setting-motion" />
          </Row>
          <Row icon="🏷️" title="Name tags" style={itemStyle(overlay, 4)}>
            <Choice
              setting="nameTags"
              label="Name tags"
              options={[
                { value: "all", text: "All", hint: "Everyone's name tag" },
                { value: "near", text: "Near me", hint: "Name tags of people near me" },
              ]}
            />
          </Row>
          <StackedRow icon="🪪" title="Names" style={itemStyle(overlay, 5)}>
            <Choice
              setting="names"
              label="Names"
              fill
              options={[
                { value: "initials", text: styledName(name, "initials"), hint: "Initials" },
                { value: "short", text: styledName(name, "short"), hint: "First name and last initial" },
                { value: "full", text: styledName(name, "full"), hint: "Full name" },
              ]}
            />
          </StackedRow>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: glass.scrim },
  panel: {
    position: "absolute",
    left: 14,
    borderRadius: 24,
    backgroundColor: glass.panel,
    borderWidth: 1.5,
    borderColor: glass.edge,
    paddingTop: 12,
    overflow: "hidden",
    transformOrigin: "top left",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 10 },
  gear: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
  title: { fontFamily: fonts.display, fontSize: 19, color: glass.text },
  grow: { flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  pressed: { opacity: 0.7 },
  scroll: { flexGrow: 0 },
  rows: { gap: 6, paddingHorizontal: 8, paddingBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, backgroundColor: glass.row },
  rowIcon: { fontSize: 19, width: 26, textAlign: "center" },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.display, fontSize: 15.5, color: glass.text },
  rowNote: { fontSize: 12, color: glass.muted, fontWeight: "600" },
  toggle: { width: 50, height: 30, borderRadius: 15, padding: 3, backgroundColor: glass.rowPressed, borderWidth: 1.5, borderColor: glass.edge },
  toggleOn: { backgroundColor: hud.accent, borderColor: hud.accent },
  knob: { width: 21, height: 21, borderRadius: 10.5, backgroundColor: glass.text },
  knobOn: { transform: [{ translateX: 20 }] },
  choices: { flexDirection: "row", gap: 4, padding: 3, borderRadius: 16, backgroundColor: glass.scrim },
  choice: { minWidth: 46, height: 28, paddingHorizontal: 10, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  choiceOn: { backgroundColor: hud.accent },
  choicesFill: { alignSelf: "stretch" },
  choiceFill: { flex: 1, minWidth: 0 },
  stacked: { flexDirection: "column", alignItems: "stretch" },
  stackedHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  choiceText: { color: glass.text, fontWeight: "800", fontSize: 13 },
  pingSample: { flexDirection: "row", alignItems: "center", gap: 4 },
  pingMs: { color: glass.text, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
