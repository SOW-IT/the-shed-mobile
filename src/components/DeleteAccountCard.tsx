import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { typography, useAppTheme } from "../theme";
import { Btn, Card, ConfirmDialog, ErrorBanner } from "./ui";
import { notify } from "@/lib/notify";

const WHAT_HAPPENS = {
  sow:
    "Your SOW Google account is unlinked from The SHED and every device is signed out. " +
    "Your photo, church and saved bank accounts here are deleted and push notifications stop. " +
    "Your staff profile and service history stay with SOW, and you can sign in again later.",
  apple:
    "Your SHED account is deleted for good: your name, email, photo, church, notifications " +
    "and sign-in. Apple will ask for your Apple ID so The SHED's access to it is revoked too.",
};

const DELETED_TITLE = "Account deleted";
const DELETED_MESSAGE = "Your account has been deleted and you have been signed out.";

export const DeleteAccountCard = () => {
  const t = useAppTheme();
  const router = useRouter();
  const account = useQuery(api.account.get, {});
  const { deleteAccount, busy, error } = useDeleteAccount();
  const [confirming, setConfirming] = useState(false);

  if (!account) return null;

  const confirm = async () => {
    if (!(await deleteAccount(account.kind, account.name))) return;
    router.replace("/home");
    notify(DELETED_TITLE, DELETED_MESSAGE);
  };

  return (
    <Card
      style={[
        styles.card,
        { backgroundColor: t.dangerStrong, borderColor: t.dangerStrongEdge },
      ]}
    >
      <View style={styles.header}>
        <Ionicons name="nuclear" size={26} color={t.onDanger} />
        <Text style={[typography.section, { color: t.onDanger }]}>Delete account</Text>
      </View>
      <Text style={[typography.body, styles.body, { color: t.onDanger }]}>
        {WHAT_HAPPENS[account.kind]}
      </Text>
      <ErrorBanner message={error} />
      <Btn
        title={busy ? "Deleting…" : "Delete account"}
        variant="danger"
        icon="trash-outline"
        loading={busy}
        disabled={busy}
        onPress={() => setConfirming(true)}
      />
      <ConfirmDialog
        visible={confirming}
        title="Delete your account?"
        message="This can't be undone."
        confirmLabel="Delete account"
        requireText={account.name}
        onConfirm={() => void confirm()}
        onClose={() => setConfirming(false)}
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { gap: 10, borderWidth: 2 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  body: { fontWeight: "600" },
});
