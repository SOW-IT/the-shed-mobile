import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Doc } from "../../../convex/_generated/dataModel";
import { grievanceCategoryLabel } from "@shared/grievances";
import { sydneyDay } from "@/lib/sydneyTime";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { WaitingLine } from "@/components/design/DesignRequestRow";
import { GrievanceStatusPill } from "./GrievanceStatusPill";

export const GrievanceRow = ({
  grievance,
  forTeam,
  onPress,
}: {
  grievance: Doc<"grievances">;
  forTeam: boolean;
  onPress: () => void;
}) => {
  const t = useAppTheme();
  const about = grievanceCategoryLabel(grievance.category);
  const meta = [forTeam ? grievance.name : null, `Raised ${sydneyDay(grievance.submittedAt)}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Grievance ${grievance.number}, ${about}, ${meta}`}
      style={({ pressed }) => [
        styles.row,
        t.surfaceEdge,
        { backgroundColor: t.card },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[typography.caption, { color: t.faint, fontWeight: "700" }]}>
          #{grievance.number}
        </Text>
        <Text numberOfLines={2} style={[typography.headline, { color: t.text }]}>
          {about}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
          {meta}
        </Text>
        {forTeam && grievance.status === "SUBMITTED" ? (
          <WaitingLine since={grievance.submittedAt} />
        ) : null}
        <View style={styles.footer}>
          <GrievanceStatusPill status={grievance.status} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.faint} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
});
