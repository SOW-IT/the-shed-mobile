import { Ionicons } from "@expo/vector-icons";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { acronym, formatAssignment, staffYearForDate } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { radius, spacing, typography, useAppTheme } from "../theme";
import {
  Avatar,
  Btn,
  Card,
  ConfirmDialog,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  LoadingState,
  MAX_UPLOAD_BYTES,
  Muted,
  Screen,
  SectionTitle,
  stagger,
  Txt,
} from "./ui";

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

  const router = useRouter();
  // Swipe-back is handled natively by the parent Stack (which reveals the
  // previous screen as you drag); we just expose the explicit back button.
  const goBack = router.canGoBack() ? () => router.back() : undefined;

  if (!profile) {
    return (
      <Screen title="Profile" onBack={goBack}>
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
      if (blob.size > MAX_UPLOAD_BYTES) {
        const maxMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
        throw new Error(`Image is too large. Please choose one ${maxMb}MB or less.`);
      }
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
    <Screen title="Profile" onBack={goBack}>
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
                {(current.assignments ?? []).length > 0
                  ? current.assignments.map(formatAssignment).join("  ·  ")
                  : current.roles.map(acronym).join(", ")}{" "}
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
          <FadeInView key={entry.year} delay={stagger(index + 2)}>
            <Card style={styles.historyCard}>
              <View style={[styles.yearBadge, { backgroundColor: t.inputBackground }]}>
                <Text style={[styles.yearBadgeText, { color: t.text }]}>
                  {entry.year}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                {entry.year === currentYear ? (
                  <Txt style={{ fontWeight: "700" }}>current</Txt>
                ) : null}
                {(entry.assignments ?? []).length > 0 ? (
                  <View style={styles.assignmentChips}>
                    {entry.assignments.map((a, i) => (
                      <View
                        key={i}
                        style={[styles.assignmentChip, { backgroundColor: t.primarySoft }]}
                      >
                        <Text
                          style={[
                            styles.assignmentChipText,
                            { color: t.dark ? t.text : t.primary },
                          ]}
                        >
                          {formatAssignment(a)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Txt style={{ fontWeight: "700" }}>
                    {entry.roles.map(acronym).join(", ") || "—"}
                  </Txt>
                )}
              </View>
            </Card>
          </FadeInView>
        ))
      )}
      {profile.isMe && (
        <Btn
          title="Sign out"
          variant="danger"
          onPress={() => setConfirmingSignOut(true)}
        />
      )}

      <ConfirmDialog
        visible={confirmingSignOut}
        title="Sign out of The Shed?"
        confirmLabel="Sign out"
        onConfirm={() => void signOut()}
        onClose={() => setConfirmingSignOut(false)}
      />
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
  assignmentChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  assignmentChip: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  assignmentChipText: {
    fontSize: 12,
    fontWeight: "600",
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
});
