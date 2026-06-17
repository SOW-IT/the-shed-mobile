import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { spacing, useAppTheme } from "../theme";
import {
  Btn,
  Card,
  ConfirmDialog,
  digitsOnly,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  LoadingState,
  Muted,
  Row,
  SectionTitle,
  stagger,
  Txt,
} from "./ui";

const maskAccount = (accountNumber: string) =>
  accountNumber.length > 4 ? `••${accountNumber.slice(-4)}` : accountNumber;

type Mode = "none" | "add" | "edit";

/**
 * Bank tab: manage your saved bank accounts. Add a preferred (auto-fill)
 * account, edit the preferred one, switch which account is preferred, and
 * remove accounts. The preferred account auto-fills when submitting a receipt.
 */
export const BankTab = () => {
  const t = useAppTheme();
  const savedAccounts = useQuery(api.bankAccounts.listMine, {});
  const addAccount = useMutation(api.bankAccounts.addAccount);
  const updateAccount = useMutation(api.bankAccounts.updateAccount);
  const removeAccount = useMutation(api.bankAccounts.remove);
  const setPreferred = useMutation(api.bankAccounts.setPreferred);

  const [mode, setMode] = useState<Mode>("none");
  const [editingId, setEditingId] = useState<Id<"savedBankAccounts"> | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [bsbDraft, setBsbDraft] = useState("");
  const [numberDraft, setNumberDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"savedBankAccounts">;
    title: string;
    message: string;
  } | null>(null);

  if (savedAccounts === undefined) return <LoadingState />;

  const preferred =
    (savedAccounts ?? []).find((a) => a.preferred) ?? (savedAccounts ?? [])[0];
  const others = (savedAccounts ?? []).filter((a) => a.id !== preferred?.id);

  const startAdd = () => {
    setEditingId(null);
    setNameDraft("");
    setBsbDraft("");
    setNumberDraft("");
    setError(null);
    setMode("add");
  };

  const startEdit = () => {
    if (!preferred) return;
    setEditingId(preferred.id);
    setNameDraft(preferred.accountName);
    setBsbDraft(preferred.bsb);
    setNumberDraft(preferred.accountNumber);
    setError(null);
    setMode("edit");
  };

  const cancel = () => {
    setMode("none");
    setEditingId(null);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (mode === "edit" && editingId) {
        await updateAccount({
          id: editingId,
          accountName: nameDraft,
          bsb: bsbDraft,
          accountNumber: numberDraft,
        });
      } else {
        await addAccount({
          accountName: nameDraft,
          bsb: bsbDraft,
          accountNumber: numberDraft,
        });
      }
      cancel();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (
    id: Id<"savedBankAccounts">,
    name: string,
    isPreferred: boolean
  ) => {
    setDeleteTarget({
      id,
      title: isPreferred ? "Delete preferred account" : "Delete account",
      message: isPreferred
        ? `"${name}" is your auto-filled account. Deleting it will remove your payment auto-fill. Continue?`
        : `Delete saved account "${name}"?`,
    });
  };

  const editing = mode !== "none";

  return (
    <>
      <FadeInView delay={stagger(1)}>
        <SectionTitle>Preferred Account</SectionTitle>
        <View style={{ marginBottom: spacing.sm }}>
          <Muted>This account is auto-filled when you submit a receipt.</Muted>
        </View>
        <ErrorBanner message={error} />

        {editing ? (
          <Card style={styles.bankCard}>
            <Field
              label="Account name"
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="e.g. John Smith"
            />
            <Field
              label="BSB"
              value={bsbDraft}
              onChangeText={(v) => setBsbDraft(digitsOnly(v))}
              placeholder="000-000"
              keyboardType="numeric"
            />
            <Field
              label="Account number"
              value={numberDraft}
              onChangeText={(v) => setNumberDraft(digitsOnly(v))}
              placeholder="00000000"
              keyboardType="numeric"
            />
            <Row spread loading={saving}>
              <Btn title="Cancel" variant="ghost" onPress={cancel} />
              <Btn
                title={mode === "edit" ? "Save" : "Add Account"}
                onPress={() => void save()}
                disabled={saving}
              />
            </Row>
          </Card>
        ) : preferred ? (
          <Card style={styles.bankCard}>
            <View style={styles.bankRow}>
              <Ionicons name="star" size={20} color={t.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: "700" }}>{preferred.accountName}</Txt>
                <Muted>
                  BSB {preferred.bsb} · {maskAccount(preferred.accountNumber)}
                </Muted>
              </View>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Edit preferred bank details"
                onPress={startEdit}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="pencil-outline" size={18} color={t.primary} />
              </Pressable>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${preferred.accountName}`}
                onPress={() => confirmDelete(preferred.id, preferred.accountName, true)}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="trash-outline" size={18} color={t.danger} />
              </Pressable>
            </View>
          </Card>
        ) : (
          <Card style={styles.bankCard}>
            <Muted>No preferred bank account yet. Add one below.</Muted>
          </Card>
        )}

        {!editing && (
          <Btn
            title={preferred ? "Add Another Account" : "Add Bank Details"}
            variant="ghost"
            onPress={startAdd}
          />
        )}
      </FadeInView>

      {!editing && others.length > 0 && (
        <FadeInView delay={stagger(2)}>
          <SectionTitle>Other Saved Accounts</SectionTitle>
          {others.map((account) => (
            <Card key={account.id} style={styles.bankCard}>
              <View style={styles.bankRow}>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Set as preferred"
                  onPress={() =>
                    void setPreferred({ id: account.id }).catch((e) =>
                      setError(errorMessage(e))
                    )
                  }
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="star-outline" size={20} color={t.faint} />
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt style={{ fontWeight: "700" }}>{account.accountName}</Txt>
                  <Muted>
                    BSB {account.bsb} · {maskAccount(account.accountNumber)}
                  </Muted>
                </View>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${account.accountName}`}
                  onPress={() => confirmDelete(account.id, account.accountName, false)}
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="trash-outline" size={18} color={t.danger} />
                </Pressable>
              </View>
            </Card>
          ))}
        </FadeInView>
      )}

      <ConfirmDialog
        visible={deleteTarget !== null}
        title={deleteTarget?.title ?? ""}
        message={deleteTarget?.message}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) {
            void removeAccount({ id: deleteTarget.id }).catch((e) =>
              setError(errorMessage(e))
            );
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  bankCard: { gap: spacing.xs },
  bankRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
