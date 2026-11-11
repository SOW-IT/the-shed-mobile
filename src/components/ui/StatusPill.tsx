import { StyleSheet, Text, View } from "react-native";
import { radius, useAppTheme, type AppTheme } from "@/theme";

export type Tone = "waiting" | "done" | "problem" | "quiet" | "info";

const toneColours = (t: AppTheme, tone: Tone) => {
  switch (tone) {
    case "waiting":
      return { bg: t.warningSoft, fg: t.dark ? t.warning : t.text };
    case "done":
      return { bg: t.successSoft, fg: t.success };
    case "problem":
      return { bg: t.dangerSoft, fg: t.danger };
    case "info":
      return { bg: t.primarySoft, fg: t.dark ? t.text : t.primary };
    case "quiet":
      return { bg: t.ghost, fg: t.muted };
  }
};

export const toneColour = (t: AppTheme, tone: Tone) =>
  tone === "waiting" ? t.warning : toneColours(t, tone).fg;

export const StatusPill = ({ label, tone }: { label: string; tone: Tone }) => {
  const t = useAppTheme();
  const { bg, fg } = toneColours(t, tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text numberOfLines={1} style={[styles.text, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: "700" },
});
