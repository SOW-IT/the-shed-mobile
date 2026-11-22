import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { CannotUndo, Txt } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

export function DeleteImpact({
  title,
  body,
  rows,
  total,
}: {
  title: string;
  body: string;
  rows: { key: string; name: string; detail: string }[];
  total: number;
}) {
  const t = useAppTheme();
  return (
    <>
      <View
        style={[
          styles.warning,
          { backgroundColor: t.dangerSoft, borderColor: t.danger },
        ]}
      >
        <View style={styles.row}>
          <Ionicons name="warning" size={20} color={t.danger} />
          <Txt style={[typography.headline, { color: t.danger, flex: 1 }]}>
            {title}
          </Txt>
        </View>
        {total > 0 ? (
          <Txt style={[typography.body, { color: t.text }]}>{body}</Txt>
        ) : null}
        <CannotUndo />
      </View>
      {total > 0 ? (
        <>
          <Txt style={[typography.label, { color: t.muted, marginTop: spacing.sm }]}>
            Attendance deleted
          </Txt>
          <View
            style={[
              styles.list,
              { borderColor: t.separator, backgroundColor: t.card },
            ]}
          >
            {rows.map((r) => (
              <View key={r.key} style={styles.row}>
                <Ionicons name="close-circle" size={14} color={t.danger} />
                <Txt
                  style={[typography.body, { color: t.text, flex: 1 }]}
                  numberOfLines={1}
                >
                  {r.name}
                </Txt>
                <Txt style={[typography.caption, { color: t.muted }]}>
                  {r.detail}
                </Txt>
              </View>
            ))}
            {total > rows.length ? (
              <Txt style={[typography.caption, { color: t.muted }]}>
                and {total - rows.length} more
              </Txt>
            ) : null}
          </View>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  warning: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  list: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
});
