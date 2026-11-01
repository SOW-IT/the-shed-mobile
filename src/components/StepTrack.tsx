import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { sydneyDay } from "@/lib/sydneyTime";
import { spacing, typography, useAppTheme } from "@/theme";

export type TrackStep = {
  key: string;
  label: string;
  state: "done" | "declined" | "current" | "todo";
  name: string | null;
  at: number | null;
};

const STEP_ICON = { done: "checkmark", declined: "close", current: null, todo: null } as const;

export const StepTrack = ({ steps }: { steps: TrackStep[] }) => {
  const t = useAppTheme();
  const fill = { done: t.success, declined: t.danger, current: t.warningSoft, todo: t.ghost };
  return (
    <View
      style={styles.track}
      accessible
      accessibilityLabel={steps
        .map((step) => `${step.label}: ${step.state === "done" || step.state === "declined" ? `${step.name ?? ""} ${step.at ? sydneyDay(step.at) : ""}` : step.state === "current" ? "next" : "not yet"}`)
        .join(", ")}
    >
      {steps.map((step, i) => {
        const icon = STEP_ICON[step.state];
        return (
          <View key={step.key} style={styles.trackStep}>
            <View style={styles.trackDotRow}>
              <View style={[styles.trackLine, { backgroundColor: i === 0 ? "transparent" : fill[step.state === "current" ? "todo" : step.state] }]} />
              <View
                style={[
                  styles.trackDot,
                  { backgroundColor: fill[step.state] },
                  step.state === "current" && { borderWidth: 2, borderColor: t.warning },
                ]}
              >
                {icon ? <Ionicons name={icon} size={12} color={t.background} /> : null}
              </View>
              <View
                style={[
                  styles.trackLine,
                  {
                    backgroundColor:
                      i === steps.length - 1
                        ? "transparent"
                        : fill[steps[i + 1].state === "done" ? "done" : "todo"],
                  },
                ]}
              />
            </View>
            <Text
              style={[
                typography.caption,
                { color: step.state === "todo" ? t.faint : t.text, fontWeight: "700", textAlign: "center" },
              ]}
            >
              {step.label}
            </Text>
            {step.name ? (
              <Text numberOfLines={2} style={[typography.caption, { color: t.muted, textAlign: "center" }]}>
                {step.name}
              </Text>
            ) : null}
            {step.at ? (
              <Text style={[typography.caption, { color: t.faint, textAlign: "center" }]}>
                {sydneyDay(step.at)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  track: { flexDirection: "row", alignItems: "flex-start", marginTop: spacing.xs },
  trackStep: { flex: 1, alignItems: "center", gap: 2 },
  trackDotRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginBottom: 4 },
  trackLine: { flex: 1, height: 2 },
  trackDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
