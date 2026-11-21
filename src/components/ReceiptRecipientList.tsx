import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { eventStaffYear } from "../../shared/flow";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Facts, formatAmount, LoadingBar, Row, Txt } from "@/components/ui";
import { keyed } from "@/lib/listKeys";
import { openExternalLink } from "@/lib/openExternalLink";

export const ReceiptRecipientList = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const files = useQuery(api.requests.receiptAttachments, {
    requestId: request._id,
  });
  const receipt = request.receipt;
  if (!receipt) return null;
  const anyDeleted = (files ?? []).some((r) =>
    (r?.attachments ?? []).some((f) => f.deleted)
  );
  const staffYear = eventStaffYear(request._creationTime);
  return (
    <View style={{ gap: spacing.sm }}>
      {keyed(receipt.recipients, (r) => `${r.accountName}|${r.bsb}|${r.accountNumber}`).map(({ item: recipient, key, index: i }) => (
        <View key={key} style={[styles.recipient, { backgroundColor: t.inputBackground }]}>
          <Row>
            <Txt style={{ fontWeight: "700", flexGrow: 1 }}>{recipient.accountName}</Txt>
            <Txt style={{ fontWeight: "700" }}>${formatAmount(recipient.amount)}</Txt>
          </Row>
          <Facts parts={[`BSB ${recipient.bsb}`, `Account ${recipient.accountNumber}`]} />
          {files === undefined ? (
            <View style={styles.fileLink}>
              <Ionicons name="document-attach-outline" size={15} color={t.muted} />
              <LoadingBar width={140} height={11} />
            </View>
          ) : null}
          {keyed(files?.[i]?.attachments ?? [], (file) => file.name).map(({ item: file, key }) =>
            file.deleted ? (
              <View key={key} style={styles.fileLink}>
                <Ionicons name="document-outline" size={15} color={t.muted} />
                <Text
                  numberOfLines={1}
                  style={[
                    typography.caption,
                    { color: t.muted, fontWeight: "600", flex: 1, textDecorationLine: "line-through" },
                  ]}
                >
                  {file.name}
                </Text>
              </View>
            ) : file.url ? (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.fileLink, pressed && { opacity: 0.6 }]}
                onPress={() => void openExternalLink(file.url!)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${file.name}`}
              >
                <Ionicons name="document-attach-outline" size={15} color={t.primary} />
                <Text
                  numberOfLines={1}
                  style={[typography.caption, { color: t.primary, fontWeight: "600", flex: 1 }]}
                >
                  {file.name}
                </Text>
              </Pressable>
            ) : null
          )}
        </View>
      ))}
      {receipt.recipients.length > 1 ? (
        <View style={styles.totalRow}>
          <Txt style={{ fontWeight: "800", flexGrow: 1 }}>Total</Txt>
          <Txt style={{ fontWeight: "800" }}>${formatAmount(receipt.totalAmount)}</Txt>
        </View>
      ) : null}
      {anyDeleted ? (
        <Text style={[typography.caption, { color: t.muted, fontStyle: "italic" }]}>
          {`Receipt files for the ${staffYear} staff year were deleted on 1 October ${staffYear + 1}. Only the file names remain.`}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  recipient: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  fileLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: 2,
  },
});
