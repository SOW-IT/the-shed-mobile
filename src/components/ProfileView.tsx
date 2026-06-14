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

/** Payment details management: saved bank accounts with preferred toggle and delete. */
const PaymentDetails = () => {
  const t = useAppTheme();
  const savedAccounts = useQuery(api.bankAccounts.listMine, {});
  const setPreferred = useMutation(api.bankAccounts.setPreferred);
  const removeAccount = useMutation(api.bankAccounts.remove);
  const [error, setError] = useState<string | null>(null);

  if (!savedAccounts || savedAccounts.length === 0) {
    return (
      <Card>
        <Muted>No saved bank accounts yet. Submit a receipt to save one.</Muted>
      </Card>
    );
  }

  const confirmDelete = (id: Id<"savedBankAccounts">, name: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Delete saved account "${name}"?`)) {
        void removeAccount({ id }).catch((e) => setError(errorMessage(e)));
      }
      return;
    }
    Alert.alert("Delete account", `Delete saved account "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void removeAccount({ id }).catch((e) => setError(errorMessage(e))),
      },
    ]);
  };

  return (
    <>
      <ErrorBanner message={error} />
      {savedAccounts.map((account) => (
        <Card key={account.id} style={styles.paymentCard}>
          <View style={styles.paymentRow}>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={account.preferred ? "Preferred account" : "Set as preferred"}
              onPress={() =>
                !account.preferred &&
                void setPreferred({ id: account.id }).catch((e) => setError(errorMessage(e)))
              }
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Ionicons
                name={account.preferred ? "star" : "star-outline"}
                size={20}
                color={account.preferred ? t.accent : t.faint}
              />
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt style={{ fontWeight: "700" }}>{account.accountName}</Txt>
              <Muted>BSB {account.bsb} · {maskAccount(account.accountNumber)}</Muted>
            </View>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${account.accountName}`}
              onPress={() => confirmDelete(account.id, account.accountName)}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="trash-outline" size={18} color={t.danger} />
            </Pressable>
          </View>
          {account.preferred && savedAccounts.length > 1 && (
            <Muted>This account is auto-filled when you submit a receipt.</Muted>
          )}
        </Card>
      ))}
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

      {profile.isMe && (
        <>
          <SectionTitle>Payment Details</SectionTitle>
          <PaymentDetails />
        </>
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
