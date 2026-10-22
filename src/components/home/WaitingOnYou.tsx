import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { plural } from "@shared/reminders";
import { Card, FadeInView, Txt } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type Row = { key: string; icon: IconName; label: string; count: number; href: string };

const waitingRows = (
  summary: NonNullable<(typeof api.waitingOnMe.summary)["_returnType"]>
): Row[] => {
  const rows: Row[] = [
    {
      key: "review",
      icon: "receipt-outline",
      label: plural(summary.reimbursements.toReview, "reimbursement request") + " to approve",
      count: summary.reimbursements.toReview,
      href: "/?tab=review",
    },
    {
      key: "pay",
      icon: "cash-outline",
      label: plural(summary.reimbursements.toPay, "reimbursement") + " ready to pay",
      count: summary.reimbursements.toPay,
      href: "/?tab=review",
    },
    {
      key: "receipts",
      icon: "document-attach-outline",
      label: plural(summary.reimbursements.receipts, "receipt") + " to attach",
      count: summary.reimbursements.receipts,
      href: "/?tab=mine",
    },
    {
      key: "designApprove",
      icon: "color-palette-outline",
      label: plural(summary.design.toApprove, "design request") + " to approve",
      count: summary.design.toApprove,
      href: "/design-requests?tab=queue",
    },
    {
      key: "designFinish",
      icon: "brush-outline",
      label: plural(summary.design.toFinish, "design request") + " to finish",
      count: summary.design.toFinish,
      href: "/design-requests?tab=queue",
    },
    {
      key: "eventReview",
      icon: "calendar-outline",
      label: plural(summary.events.toReview, "event form") + " to review",
      count: summary.events.toReview,
      href: "/event-requests?tab=review",
    },
    {
      key: "eventFill",
      icon: "create-outline",
      label: plural(summary.events.toFill, "event form") + " to fill in",
      count: summary.events.toFill,
      href: "/event-requests?tab=mine",
    },
  ];
  return rows.filter((row) => row.count > 0);
};

export const WaitingOnYou = () => {
  const t = useAppTheme();
  const router = useRouter();
  const summary = useQuery(api.waitingOnMe.summary);
  if (!summary) return null;
  const rows = waitingRows(summary);
  if (rows.length === 0) return null;
  return (
    <FadeInView>
      <Card style={{ gap: spacing.xs }}>
        <View style={styles.titleRow}>
          <Ionicons name="hourglass-outline" size={18} color={t.accent} />
          <Txt style={typography.headline}>Waiting on you</Txt>
        </View>
        {rows.map((row, i) => (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            onPress={() => router.navigate(row.href as Href)}
            style={({ pressed }) => [
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name={row.icon} size={18} color={t.muted} />
            <Text style={[typography.body, { color: t.text, flex: 1 }]}>{row.label}</Text>
            <View style={[styles.count, { backgroundColor: t.accentSoft }]}>
              <Text style={[typography.caption, { color: t.accent, fontWeight: "800" }]}>
                {row.count}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.faint} />
          </Pressable>
        ))}
      </Card>
    </FadeInView>
  );
};

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  count: {
    minWidth: 26,
    alignItems: "center",
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
