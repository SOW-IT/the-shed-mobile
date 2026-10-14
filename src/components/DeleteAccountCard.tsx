import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text } from "react-native";
import { api } from "../../convex/_generated/api";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { typography, useAppTheme } from "../theme";
import { Btn, Card, ConfirmDialog, ErrorBanner, Muted } from "./ui";

const WHAT_HAPPENS = {
  sow:
    "Your SOW Google account is unlinked from The SHED and every device is signed out. " +
    "Your photo, church and notification settings here are deleted. " +
    "Your staff profile and service history stay with SOW, and you can sign in again later.",
  apple:
    "Your SHED account is deleted for good: your name, email, photo, church, notifications " +
    "and sign-in. Apple will ask for your Apple ID so The SHED's access to it is revoked too.",
};

export const DeleteAccountCard = () => {
  const t = useAppTheme();
  const router = useRouter();
  const account = useQuery(api.account.get, {});
  const { deleteAccount, busy, error } = useDeleteAccount();
  const [confirming, setConfirming] = useState(false);

  if (!account || !account.name) return null;

  const confirm = async () => {
    if (!(await deleteAccount(account.kind, account.name))) return;
    router.replace("/home");
    Alert.alert("Account deleted", "Your account has been deleted.", [{ text: "OK" }]);
  };

  return (
    <Card style={{ gap: 10 }}>
      <Text style={[typography.label, { color: t.danger }]}>Delete account</Text>
      <Muted>{WHAT_HAPPENS[account.kind]}</Muted>
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
