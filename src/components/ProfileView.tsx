import { Ionicons } from "@expo/vector-icons";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { acronym, staffYearForDate } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "../theme";
import {
  Avatar,
  Btn,
  Card,
  digitsOnly,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  LoadingState,
  Muted,
  Row,
  Screen,
  SectionTitle,
  stagger,
  Txt,
} from "./ui";

const maskAccount = (accountNumber: string) =>
  accountNumber.length > 4 ? `••${accountNumber.slice(-4)}` : accountNumber;

/** Simple two-segment tab switcher used within the profile screen. */
const ProfileTabs = ({
  active,
  onChange,
}: {
  active: "profile" | "payment";
  onChange: (tab: "profile" | "payment") => void;
}) => {
  const t = useAppTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.inputBackground }]}>
      {(["profile", "payment"] as const).map((tab) => (
        <Pressable
          key={tab}
          onPress={() => onChange(tab)}
          style={[
            styles.segment,
            active === tab && { backgroundColor: t.card, ...t.shadowCard },
          ]}
        >
          <Text
            style={[
              typography.caption,
              {
                fontWeight: active === tab ? "700" : "500",
                color: active === tab ? t.text : t.muted,
              },
            ]}
          >
            {tab === "profile" ? "Profile" : "Payment"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

/**
 * Payment tab: shows the preferred (auto-fill) bank account with view/edit
 * and delete (with a stronger confirmation because it's the auto-fill account).
 */
const PaymentTab = () => {
  const t = useAppTheme();
  const savedAccounts = useQuery(api.bankAccounts.listMine, {});
  const updateAccount = useMutation(api.bankAccounts.updateAccount);
  const removeAccount = useMutation(api.bankAccounts.remove);
  const setPreferred = useMutation(api.bankAccounts.setPreferred);

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [bsbDraft, setBsbDraft] = useState("");
  const [numberDraft, setNumberDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (savedAccounts === undefined) return <LoadingState />;

  if (!savedAccounts || savedAccounts.length === 0) {
    return (
      <Card>
        <Muted>No saved bank accounts yet. Submit a receipt to save one.</Muted>
      </Card>
    );
  }

  const preferred = savedAccounts.find((a) => a.preferred) ?? savedAccounts[0];
  const others = savedAccounts.filter((a) => a.id !== preferred.id);

  const startEdit = () => {
    setNameDraft(preferred.accountName);
    setBsbDraft(preferred.bsb);
    setNumberDraft(preferred.accountNumber);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateAccount({
        id: preferred.id,
        accountName: nameDraft,
        bsb: bsbDraft,
        accountNumber: numberDraft,
      });
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: Id<"savedBankAccounts">, name: string, isPreferred: boolean) => {
    const title = isPreferred ? "Delete preferred account" : "Delete account";
    const message = isPreferred
      ? `"${name}" is your auto-filled account. Deleting it will remove your payment auto-fill. Continue?`
      : `Delete saved account "${name}"?`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        void removeAccount({ id }).catch((e) => setError(errorMessage(e)));
      }
      return;
    }
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void removeAccount({ id }).catch((e) => setError(errorMessage(e))),
      },
    ]);
  };

  return (
    <>
      <SectionTitle>Preferred Account</SectionTitle>
      <View style={{ marginBottom: spacing.sm }}>
        <Muted>This account is auto-filled when you submit a receipt.</Muted>
      </View>
      <ErrorBanner message={error} />

      <Card style={styles.paymentCard}>
        {editing ? (
          <>
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
            <Row>
              <Btn title="Save" onPress={() => void save()} disabled={saving} />
              <Btn title="Cancel" variant="ghost" onPress={cancelEdit} />
            </Row>
          </>
        ) : (
          <>
            <View style={styles.paymentRow}>
              <Ionicons name="star" size={20} color={t.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: "700" }}>{preferred.accountName}</Txt>
                <Muted>BSB {preferred.bsb} · {preferred.accountNumber}</Muted>
              </View>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Edit payment details"
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
          </>
        )}
      </Card>

      {others.length > 0 && (
        <>
          <SectionTitle>Other Saved Accounts</SectionTitle>
          {others.map((account) => (
            <Card key={account.id} style={styles.paymentCard}>
              <View style={styles.paymentRow}>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Set as preferred"
                  onPress={() => void setPreferred({ id: account.id }).catch((e) => setError(errorMessage(e)))}
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="star-outline" size={20} color={t.faint} />
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt style={{ fontWeight: "700" }}>{account.accountName}</Txt>
                  <Muted>BSB {account.bsb} · {maskAccount(account.accountNumber)}</Muted>
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
        </>
      )}
    </>
  );
};

/**
 * A person's profile. Church and photo are editable on your own profile;
 * name, email, role and department are read-only everywhere (roles and
 * departments are managed per-year by admins).
 */
export const ProfileView = ({ email }: { email?: string }) => {
  const t = useAppTheme();
  const { signOut } = useAuthActions();
  const profile = useQuery(api.profile.get, email ? { email } : {});
  const updateChurch = useMutation(api.profile.updateChurch);
  const generateAvatarUploadUrl = useMutation(api.profile.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.profile.setAvatar);

  const [activeTab, setActiveTab] = useState<"profile" | "payment">("profile");
  const [churchDraft, setChurchDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  if (!profile) {
    return (
      <Screen title="Profile">
        <LoadingState />
      </Screen>
    );
  }

  const currentYear = staffYearForDate(new Date());
  const current = profile.serviceHistory.find((h) => h.year === currentYear);

  const pickPhoto = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;
      setUploading(true);
      const asset = result.assets[0];
      const blob = await (await fetch(asset.uri)).blob();
      const uploadUrl = await generateAvatarUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": asset.mimeType ?? blob.type ?? "image/jpeg" },
        body: blob,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = await response.json();
      await setAvatar({ storageId });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const saveChurch = async () => {
    setError(null);
    try {
      await updateChurch({ localChurch: churchDraft ?? "" });
      setChurchDraft(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen title="Profile">
      <FadeInView delay={40}>
        <Card style={styles.hero}>
          <View>
            <Avatar photo={profile.photo} name={profile.name} size={92} />
            {profile.isMe && (
              <Pressable
                hitSlop={6}
                disabled={uploading}
                onPress={() => void pickPhoto()}
                style={({ pressed }) => [
                  styles.cameraBadge,
                  { backgroundColor: t.primary, borderColor: t.card },
                  (pressed || uploading) && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="camera" size={14} color={t.onPrimary} />
              </Pressable>
            )}
          </View>
          <Text style={[typography.title, { color: t.text, textAlign: "center" }]}>
            {profile.name ?? profile.email}
          </Text>
          <Text style={[typography.caption, { color: t.muted }]}>{profile.email}</Text>
          {current ? (
            <View style={[styles.assignmentPill, { backgroundColor: t.primarySoft }]}>
              <Text
                style={[
                  typography.caption,
                  { color: t.dark ? t.text : t.primary, fontWeight: "600" },
                ]}
              >
                {current.roles.map(acronym).join(", ")} ·{" "}
                {[current.department, current.division, current.university]
                  .map((name) => name && acronym(name))
                  .filter(Boolean)
                  .join(" / ") || "—"}{" "}
                · {current.year}
              </Text>
            </View>
          ) : (
            <Muted>No assignment for {currentYear}</Muted>
          )}
          {!profile.isMe && profile.localChurch ? (
            <Muted>Church: {profile.localChurch}</Muted>
          ) : null}
          <ErrorBanner message={error} />
        </Card>
      </FadeInView>

      {profile.isMe && (
        <FadeInView delay={stagger(1)}>
          <ProfileTabs active={activeTab} onChange={setActiveTab} />
        </FadeInView>
      )}

      {profile.isMe && activeTab === "payment" ? (
        <FadeInView delay={stagger(2)}>
          <PaymentTab />
        </FadeInView>
      ) : (
        <>
          {profile.isMe && (
            <FadeInView delay={stagger(2)}>
              <Card>
                <Field
                  label="Local church"
                  value={churchDraft ?? profile.localChurch ?? ""}
                  onChangeText={setChurchDraft}
                  placeholder="e.g. SOW City Church"
                />
                <Btn
                  title="Save Church"
                  onPress={() => void saveChurch()}
                  disabled={churchDraft === null}
                />
                <Muted>
                  Name and email sync from Google; your role and department are set
                  by admins per year.
                </Muted>
              </Card>
            </FadeInView>
          )}

          <SectionTitle>Service History</SectionTitle>
          {profile.serviceHistory.length === 0 ? (
            <Muted>No service history yet.</Muted>
          ) : (
            profile.serviceHistory.map((entry, index) => (
              <FadeInView key={entry.year} delay={stagger(index + 3)}>
                <Card style={styles.historyCard}>
                  <View style={[styles.yearBadge, { backgroundColor: t.inputBackground }]}>
                    <Text style={[styles.yearBadgeText, { color: t.text }]}>
                      {entry.year}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: "700" }}>
                      {entry.roles.map(acronym).join(", ")}
                      {entry.year === currentYear ? "  ·  current" : ""}
                    </Txt>
                    <Muted>
                      {[entry.department, entry.division, entry.university]
                        .map((name) => name && acronym(name))
                        .filter(Boolean)
                        .join(" / ") || "—"}
                    </Muted>
                  </View>
                </Card>
              </FadeInView>
            ))
          )}
          {profile.isMe && (
            confirmingSignOut ? (
              <Row>
                <Btn
                  title="Confirm sign out"
                  variant="danger"
                  onPress={() => void signOut()}
                />
                <Btn
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setConfirmingSignOut(false)}
                />
              </Row>
            ) : (
              <Btn
                title="Sign out"
                variant="danger"
                onPress={() => {
                  if (Platform.OS === "web") {
                    setConfirmingSignOut(true);
                  } else {
                    Alert.alert("Sign out", "Sign out of The Shed?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
                    ]);
                  }
                }}
              />
            )
          )}
        </>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: spacing.xxl },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  assignmentPill: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 2,
  },
  segmented: {
    flexDirection: "row",
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.sm,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  yearBadge: {
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  yearBadgeText: { fontSize: 14, fontWeight: "800", letterSpacing: -0.3 },
  paymentCard: { gap: spacing.xs },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
});
