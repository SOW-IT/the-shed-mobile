import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Sheet } from "./overlays";

export type GuideStep = {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  detail: string;
};

export const GuideSheet = ({
  visible,
  onClose,
  title,
  steps,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  steps: GuideStep[];
}) => {
  const t = useAppTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {steps.map((step, i) => (
        <View key={i} style={styles.step}>
          <View style={[styles.iconWrap, { backgroundColor: t.primarySoft }]}>
            <Ionicons name={step.icon} size={18} color={t.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.caption, { color: t.text, fontWeight: "700" }]}>
              {step.title}
            </Text>
            <Text style={[typography.caption, { color: t.muted }]}>{step.detail}</Text>
          </View>
        </View>
      ))}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
