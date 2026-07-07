import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { formatAmount, LoadingBar, Muted, Row, Txt } from "@/components/ui";

/**
 * A submitted receipt's recipients: each one's bank details and receipt files
 * as tappable links (signed URLs — tap to view or download). Shared by the
 * request card's receipt section and the Pay sheet so both render identically.
 */
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
  return (
    <View style={{ gap: spacing.sm }}>
      {receipt.recipients.map((recipient, i) => (
        <View key={i} style={[styles.recipient, { backgroundColor: t.inputBackground }]}>
          <Row>
            <Txt style={{ fontWeight: "700", flexGrow: 1 }}>{recipient.accountName}</Txt>
            <Txt style={{ fontWeight: "700" }}>${formatAmount(recipient.amount)}</Txt>
          </Row>
          <Muted>
            BSB {recipient.bsb} · Account {recipient.accountNumber}
          </Muted>
          {files === undefined ? (
            // Files (signed URLs) load async — show a blurred placeholder link.
            <View style={styles.fileLink}>
              <Ionicons name="document-attach-outline" size={15} color={t.muted} />
              <LoadingBar width={140} height={11} />
            </View>
          ) : null}
          {(files?.[i]?.attachments ?? []).map((file, j) =>
            file.deleted ? (
              // The file was purged by the retention cron; show the name so
              // history is intact, but it is no longer openable.
              <View key={j} style={styles.fileLink}>
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
                key={j}
                style={({ pressed }) => [styles.fileLink, pressed && { opacity: 0.6 }]}
                onPress={() => void Linking.openURL(file.url!)}
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
      {anyDeleted ? (
        <Text style={[typography.caption, { color: t.muted, fontStyle: "italic" }]}>
          Receipt files are deleted one year after a request is paid. The file
          names remain for reference, but they can no longer be opened.
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
});
