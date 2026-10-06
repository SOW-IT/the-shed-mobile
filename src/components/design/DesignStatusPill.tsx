import { StyleSheet, Text, View } from "react-native";
import {
  DESIGN_STATUS_LABELS,
  type DesignRequestStatus,
} from "@shared/designRequests";
import { radius, useAppTheme, type AppTheme } from "@/theme";

const colours = (t: AppTheme, status: DesignRequestStatus) => {
  switch (status) {
    case "PENDING":
      return { bg: t.warningSoft, fg: t.dark ? t.warning : t.text };
    case "APPROVED":
      return { bg: t.primarySoft, fg: t.dark ? t.text : t.primary };
    case "COMPLETED":
      return { bg: t.successSoft, fg: t.success };
    case "DECLINED":
      return { bg: t.dangerSoft, fg: t.danger };
    case "CANCELLED":
      return { bg: t.ghost, fg: t.muted };
  }
};

export const DesignStatusPill = ({ status }: { status: DesignRequestStatus }) => {
  const t = useAppTheme();
  const { bg, fg } = colours(t, status);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text numberOfLines={1} style={[styles.text, { color: fg }]}>
        {DESIGN_STATUS_LABELS[status]}
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
