import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { ReactNode, useLayoutEffect, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { spacing, USE_NATIVE_DRIVER, useAppTheme } from "../theme";
import {
  Btn,
  Card,
  ConfirmDialog,
  digitsOnly,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  IconButton,
  LoadingState,
  maskAccount,
  Muted,
  OptionRow,
  Row,
  SectionTitle,
  stagger,
  Txt,
} from "./ui";

type Mode = "none" | "add" | "edit";

type Measurable = {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
  getBoundingClientRect?: () => { top: number };
};

const measureY = (node: Measurable, callback: (y: number | null) => void) => {
  if (Platform.OS === "web") {
    const rect = node.getBoundingClientRect?.();
    callback(rect ? rect.top : null);
  } else if (node.measureInWindow) {
    node.measureInWindow((_x, y) => callback(y));
  } else {
    callback(null);
  }
};

export const BankTab = () => {
  const t = useAppTheme();
  const savedAccounts = useQuery(api.bankAccounts.listMine, {});
  const addAccount = useMutation(api.bankAccounts.addAccount);
  const updateAccount = useMutation(api.bankAccounts.updateAccount);
  const removeAccount = useMutation(api.bankAccounts.remove).withOptimisticUpdate(
    (localStore, { id }) => {
      const current = localStore.getQuery(api.bankAccounts.listMine, {});
      if (!current) return;
      const remaining = current.filter((a) => a.id !== id);
      const hasPreferred = remaining.some((a) => a.preferred);
      localStore.setQuery(
        api.bankAccounts.listMine,
        {},
        remaining.map((a, i) => ({
          ...a,
          preferred: a.preferred || (!hasPreferred && i === 0),
        }))
      );
    }
  );
  const setPreferred = useMutation(api.bankAccounts.setPreferred).withOptimisticUpdate(
    (localStore, { id }) => {
      const current = localStore.getQuery(api.bankAccounts.listMine, {});
      if (!current) return;
      localStore.setQuery(
        api.bankAccounts.listMine,
        {},
        current.map((a) => ({ ...a, preferred: a.id === id }))
      );
    }
  );

  const [mode, setMode] = useState<Mode>("none");
  const [editingId, setEditingId] = useState<Id<"savedBankAccounts"> | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [bsbDraft, setBsbDraft] = useState("");
  const [numberDraft, setNumberDraft] = useState("");
  const [makePreferredDraft, setMakePreferredDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"savedBankAccounts">;
    title: string;
    message?: string;
  } | null>(null);

  const [cardRefs] = useState(() => new Map<string, Measurable>());
  const [translateYs] = useState(() => new Map<string, Animated.Value>());
  const [prevPositions] = useState(() => new Map<string, number>());

  const preferred =
    (savedAccounts ?? []).find((a) => a.preferred) ?? (savedAccounts ?? [])[0];
  const others = (savedAccounts ?? []).filter((a) => a.id !== preferred?.id);
  const editing = mode !== "none";
  const orderKey = [preferred?.id, ...others.map((a) => a.id)]
    .filter(Boolean)
    .join("|");

  const getTranslateY = (id: string) => {
    let value = translateYs.get(id);
    if (!value) {
      value = new Animated.Value(0);
      translateYs.set(id, value);
    }
    return value;
  };

  useLayoutEffect(() => {
    if (editing) return;
    const ids = [preferred?.id, ...others.map((a) => a.id)].filter(Boolean) as string[];
    if (ids.length === 0) {
      prevPositions.clear();
      return;
    }
    const nextPositions = new Map<string, number>();
    let remaining = ids.length;
    const finish = () => {
      for (const id of ids) {
        const oldY = prevPositions.get(id);
        const newY = nextPositions.get(id);
        if (oldY != null && newY != null && Math.abs(oldY - newY) > 0.5) {
          const ty = getTranslateY(id);
          ty.setValue(oldY - newY);
          Animated.timing(ty, {
            toValue: 0,
            duration: 340,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start();
        }
      }
      prevPositions.clear();
      nextPositions.forEach((y, id) => prevPositions.set(id, y));
    };
    for (const id of ids) {
      const node = cardRefs.get(id);
      if (!node) {
        if (--remaining === 0) finish();
        continue;
      }
      measureY(node, (y) => {
        if (y != null) nextPositions.set(id, y);
        if (--remaining === 0) finish();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, editing]);

  if (savedAccounts === undefined) return <LoadingState />;

  type Account = NonNullable<typeof savedAccounts>[number];

  const registerCard = (id: string, node: Measurable | null) => {
    if (node) cardRefs.set(id, node);
    else cardRefs.delete(id);
  };

  const animatedWrap = (id: string, children: ReactNode) => (
    <View
      key={id}
      ref={(node) => registerCard(id, node as unknown as Measurable | null)}
      collapsable={false}
    >
      <Animated.View style={{ transform: [{ translateY: getTranslateY(id) }] }}>
        {children}
      </Animated.View>
    </View>
  );

  const startAdd = () => {
    setEditingId(null);
    setNameDraft("");
    setBsbDraft("");
    setNumberDraft("");
    setMakePreferredDraft(false);
    setError(null);
    setMode("add");
  };

  const startEdit = (account: Account) => {
    setEditingId(account.id);
    setNameDraft(account.accountName);
    setBsbDraft(account.bsb);
    setNumberDraft(account.accountNumber);
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
          makePreferred: makePreferredDraft,
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
      title: `Delete "${name}"?`,
      message: isPreferred
        ? "This is your auto-fill account. Deleting it turns off payment auto-fill."
        : undefined,
    });
  };

  const isEditing = (id: Id<"savedBankAccounts">) =>
    mode === "edit" && editingId === id;

  const editingAccount =
    mode === "edit" && editingId
      ? (savedAccounts ?? []).find((a) => a.id === editingId)
      : undefined;
  const editUnchanged =
    !!editingAccount &&
    nameDraft.trim() === editingAccount.accountName &&
    bsbDraft === editingAccount.bsb &&
    numberDraft === editingAccount.accountNumber;

  const accountForm = (isAdd: boolean) => (
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
      {isAdd && (
        <OptionRow
          label="Make this your preferred account"
          selected={makePreferredDraft}
          onPress={() => setMakePreferredDraft((v) => !v)}
          multi
        />
      )}
      <ErrorBanner message={error} />
      <Row spread loading={saving}>
        <Btn title="Cancel" variant="ghost" onPress={cancel} />
        <Btn
          title={isAdd ? "Add Account" : "Save"}
          onPress={() => void save()}
          disabled={saving || (!isAdd && editUnchanged)}
        />
      </Row>
    </Card>
  );

  return (
    <>
      <FadeInView delay={stagger(1)}>
        <SectionTitle>Preferred Account</SectionTitle>
        <View style={{ marginBottom: spacing.sm }}>
          <Muted>Auto-filled when you submit a receipt.</Muted>
        </View>
        <ErrorBanner message={mode === "none" ? error : null} />

        {preferred ? (
          animatedWrap(
            preferred.id,
            isEditing(preferred.id) ? (
              accountForm(false)
            ) : (
              <Card style={styles.bankCard}>
                <View style={styles.bankRow}>
                  <Ionicons name="star" size={20} color={t.accent} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt style={{ fontWeight: "700" }}>{preferred.accountName}</Txt>
                    <Muted>
                      BSB {preferred.bsb} · {maskAccount(preferred.accountNumber)}
                    </Muted>
                  </View>
                  <IconButton
                    name="create-outline"
                    size={40}
                    accessibilityLabel="Edit preferred bank details"
                    onPress={() => startEdit(preferred)}
                  />
                  <IconButton
                    name="trash-outline"
                    size={40}
                    color={t.danger}
                    accessibilityLabel={`Delete ${preferred.accountName}`}
                    onPress={() => confirmDelete(preferred.id, preferred.accountName, true)}
                  />
                </View>
              </Card>
            )
          )
        ) : (
          <Card style={styles.bankCard}>
            <Muted>No preferred account yet.</Muted>
          </Card>
        )}
      </FadeInView>

      {others.length > 0 && (
        <FadeInView delay={stagger(2)} style={styles.othersList}>
          <SectionTitle>Other Saved Accounts</SectionTitle>
          {others.map((account) =>
            animatedWrap(
              account.id,
              isEditing(account.id) ? (
                accountForm(false)
              ) : (
                <Card style={styles.bankCard}>
                  <View style={styles.bankRow}>
                    <Pressable
                      hitSlop={8}
                      disabled={editing}
                      accessibilityRole="button"
                      accessibilityLabel="Set as preferred"
                      onPress={() =>
                        void setPreferred({ id: account.id }).catch((e) =>
                          setError(errorMessage(e))
                        )
                      }
                      style={({ pressed }) => [(pressed || editing) && { opacity: 0.6 }]}
                    >
                      <Ionicons name="star-outline" size={20} color={t.faint} />
                    </Pressable>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt style={{ fontWeight: "700" }}>{account.accountName}</Txt>
                      <Muted>
                        BSB {account.bsb} · {maskAccount(account.accountNumber)}
                      </Muted>
                    </View>
                    <IconButton
                      name="create-outline"
                      size={40}
                      accessibilityLabel={`Edit ${account.accountName}`}
                      onPress={() => startEdit(account)}
                    />
                    <IconButton
                      name="trash-outline"
                      size={40}
                      color={t.danger}
                      accessibilityLabel={`Delete ${account.accountName}`}
                      onPress={() => confirmDelete(account.id, account.accountName, false)}
                    />
                  </View>
                </Card>
              )
            )
          )}
        </FadeInView>
      )}

      <FadeInView delay={stagger(3)}>
        <View style={styles.addButton}>
          {mode === "add" ? (
            accountForm(true)
          ) : (
            <Btn
              title={preferred ? "Add Another Account" : "Add Bank Details"}
              variant="ghost"
              disabled={editing}
              onPress={startAdd}
            />
          )}
        </View>
      </FadeInView>

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
  othersList: { gap: spacing.md },
  addButton: { marginTop: spacing.lg },
});
