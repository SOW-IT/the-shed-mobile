import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ReactNode, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { timeAgo } from "../../shared/datetime";
import { acronym, formatAssignment, staffYearForDate } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { ChromeScreen } from "./ChromeScreen";
import { ChurchDetails, ChurchPicker } from "./ChurchPicker";
import { DeleteAccountCard } from "./DeleteAccountCard";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { useMinuteTick } from "@/hooks/useMinuteTick";
import { shrinkPhotoForUpload } from "@/lib/shrinkPhotoForUpload";
import { uploadLocalFileToUrl } from "@/lib/uploadLocalFile";
import {
  Avatar,
  Card,
  ErrorBanner,
  errorMessage,
  FadeInView,
  LoadingState,
  Muted,
  Screen,
  SectionTitle,
  stagger,
  Txt,
} from "./ui";
import { isSowStaffAddress } from "@shared/rollcallImport";
import { SignInPrompt } from "./SignInPrompt";

const ProfileFrame = ({
  asTab,
  onBack,
  children,
}: {
  asTab: boolean;
  onBack?: () => void;
  children: ReactNode;
}) =>
  asTab ? (
    <ChromeScreen>{children}</ChromeScreen>
  ) : (
    <Screen title="Profile" onBack={onBack}>
      {children}
    </Screen>
  );

/**
 * A person's profile. Your own (`asTab`) is a root screen from the side menu,
 * with the top bar; anyone else's opens on top of the screen you came from,
 * with a back button.
 */
export const ProfileView = ({ email, asTab = false }: { email?: string; asTab?: boolean }) => {
  const t = useAppTheme();
  const profile = useQuery(api.profile.get, email ? { email } : {});
  // Keeps "Last online 5m ago" current while the profile is open.
  useMinuteTick();
  const generateAvatarUploadUrl = useMutation(api.profile.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.profile.setAvatar);
  const setReminderEmails = useMutation(api.profile.setReminderEmails);

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/org"));

  if (profile === undefined) {
    return (
      <ProfileFrame asTab={asTab} onBack={goBack}>
        <LoadingState />
      </ProfileFrame>
    );
  }
  if (profile === null) {
    return (
      <ProfileFrame asTab={asTab} onBack={goBack}>
        <SignInPrompt what="page" />
      </ProfileFrame>
    );
  }

  const currentYear = staffYearForDate(new Date());
  const current = profile.serviceHistory.find((h) => h.year === currentYear);
  const neverStaff = profile.serviceHistory.length === 0;

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
      const photo = await shrinkPhotoForUpload(result.assets[0].uri);
      const uploadUrl = await generateAvatarUploadUrl();
      const storageId = await uploadLocalFileToUrl(uploadUrl, photo);
      await setAvatar({ storageId });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ProfileFrame asTab={asTab} onBack={goBack}>
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
          {profile.email ? (
            <Text style={[typography.caption, { color: t.muted }]}>{profile.email}</Text>
          ) : null}
          {profile.isMe ? (
            profile.googleSyncedAt ? (
              <View style={[styles.syncChip, { backgroundColor: t.inputBackground }]}>
                <Ionicons name="logo-google" size={12} color={t.muted} />
                <Text style={[typography.caption, { color: t.muted }]}>
                  Synced from Google {timeAgo(profile.googleSyncedAt)}
                </Text>
              </View>
            ) : null
          ) : profile.lastOnlineAt ? (
            <Text style={[typography.caption, { color: t.muted }]}>
              Last online {timeAgo(profile.lastOnlineAt)}
            </Text>
          ) : profile.hasSignedIn === false ? (
            <Text style={[typography.caption, { color: t.muted }]}>
              Hasn&apos;t signed in to The SHED yet
            </Text>
          ) : null}
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
          ) : neverStaff && !isSowStaffAddress(profile.email ?? undefined) ? (
            <Muted>Personal account</Muted>
          ) : neverStaff ? (
            <Muted>No staff profile for {currentYear}</Muted>
          ) : (
            <Muted>No assignment for {currentYear}</Muted>
          )}
          <ErrorBanner message={error} />
        </Card>
      </FadeInView>

      {profile.isMe && (
        <FadeInView delay={stagger(1)}>
          <Card>
            <ChurchPicker church={profile.church} />
          </Card>
        </FadeInView>
      )}

      {profile.isMe && profile.reminderEmails !== null && (
        <FadeInView delay={stagger(2)}>
          <Card>
            <Text style={[typography.label, { color: t.muted }]}>Notifications</Text>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: "600" }}>Email me daily reminders</Txt>
                <Muted>
                  One morning email listing what is waiting on you. Reminders still show in the
                  app and as push notifications when this is off.
                </Muted>
              </View>
              <Switch
                accessibilityLabel="Email me daily reminders"
                value={profile.reminderEmails}
                onValueChange={(enabled) => {
                  setError(null);
                  void setReminderEmails({ enabled }).catch((e: unknown) =>
                    setError(errorMessage(e))
                  );
                }}
                trackColor={{ false: t.ghost, true: t.primarySoft }}
                thumbColor={profile.reminderEmails ? t.primary : t.faint}
              />
            </View>
          </Card>
        </FadeInView>
      )}

      {!profile.isMe && profile.church ? (
        <FadeInView delay={stagger(1)}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${profile.church.name}. See who goes there`}
            onPress={() => router.push({ pathname: "/churches", params: { church: profile.church!._id } })}
            style={({ pressed }) => pressed && { opacity: 0.85 }}
          >
            <Card style={{ gap: spacing.sm }}>
              <Text style={[typography.label, { color: t.muted }]}>Local church</Text>
              <ChurchDetails church={profile.church} />
              <View style={styles.seeWho}>
                <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
                  See who goes there
                </Text>
                <Ionicons name="chevron-forward" size={16} color={t.primary} />
              </View>
            </Card>
          </Pressable>
        </FadeInView>
      ) : null}

      {neverStaff ? null : <SectionTitle>Service history</SectionTitle>}
      {neverStaff ? null : (
        <FadeInView delay={stagger(2)}>
          <Card style={styles.history}>
            {profile.serviceHistory.map((entry, index) => (
              <View
                key={entry.year}
                style={[
                  styles.historyRow,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator },
                ]}
              >
                <View style={styles.yearCol}>
                  <Text style={[styles.yearText, { color: t.text }]}>{entry.year}</Text>
                  {entry.year === currentYear ? (
                    <Text style={[typography.caption, { color: t.muted }]}>This year</Text>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
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
              </View>
            ))}
          </Card>
        </FadeInView>
      )}
      {profile.isMe && <DeleteAccountCard />}
      {profile.isMe && (
        <Text style={[typography.caption, { color: t.muted, textAlign: "center" }]}>
          Version {Constants.expoConfig?.version ?? "—"}
        </Text>
      )}
    </ProfileFrame>
  );
};

const styles = StyleSheet.create({
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  syncChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  seeWho: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-end" },
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
  history: { paddingVertical: spacing.xs, gap: 0 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  yearCol: { width: 64 },
  yearText: { ...typography.section },
});
