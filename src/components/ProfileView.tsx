import { useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { staffYearForDate } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { useAppTheme } from "../theme";
import {
  Btn,
  Card,
  ErrorBanner,
  errorMessage,
  Field,
  Muted,
  Row,
  Screen,
  SectionTitle,
  Txt,
} from "./ui";

const Avatar = ({ photo, name }: { photo: string | null; name: string | null }) => {
  const t = useAppTheme();
  if (photo) {
    return <Image source={{ uri: photo }} style={styles.avatar} />;
  }
  const initials = (name ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: t.ghost }]}>
      <Text style={[styles.avatarInitials, { color: t.ghostText }]}>{initials}</Text>
    </View>
  );
};

/**
 * A person's profile. Church and photo are editable on your own profile;
 * name, email, role and department are read-only everywhere (roles and
 * departments are managed per-year by admins).
 */
export const ProfileView = ({ email }: { email?: string }) => {
  const profile = useQuery(api.profile.get, email ? { email } : {});
  const updateChurch = useMutation(api.profile.updateChurch);
  const generateAvatarUploadUrl = useMutation(api.profile.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.profile.setAvatar);

  const [churchDraft, setChurchDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (profile === undefined) {
    return (
      <Screen>
        <Muted>Loading…</Muted>
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
    <Screen>
      <Card>
        <Row>
          <Avatar photo={profile.photo} name={profile.name} />
          <View style={{ flexGrow: 1, flexShrink: 1 }}>
            <Txt style={styles.name}>{profile.name ?? profile.email}</Txt>
            <Muted>{profile.email}</Muted>
            {current ? (
              <Muted>
                {current.role} • {current.department} • {current.year}
              </Muted>
            ) : (
              <Muted>No assignment for {currentYear}</Muted>
            )}
            {!profile.isMe && profile.localChurch ? (
              <Muted>Church: {profile.localChurch}</Muted>
            ) : null}
          </View>
        </Row>
        {profile.isMe && (
          <>
            <Field
              label="Local church"
              value={churchDraft ?? profile.localChurch ?? ""}
              onChangeText={setChurchDraft}
              placeholder="e.g. SOW City Church"
            />
            <Row>
              <Btn
                title="Save Church"
                onPress={() => void saveChurch()}
                disabled={churchDraft === null}
              />
              <Btn
                title={uploading ? "Uploading…" : "Change Photo"}
                variant="ghost"
                onPress={() => void pickPhoto()}
                disabled={uploading}
              />
            </Row>
            <Muted>
              Name and email sync from Google; your role and department are set
              by admins per year.
            </Muted>
          </>
        )}
        <ErrorBanner message={error} />
      </Card>

      <SectionTitle>Service History</SectionTitle>
      {profile.serviceHistory.length === 0 ? (
        <Muted>No service history yet.</Muted>
      ) : (
        profile.serviceHistory.map((entry) => (
          <Card key={entry.year}>
            <Row>
              <Txt style={{ fontWeight: "700", flexGrow: 1 }}>
                {entry.year}
                {entry.year === currentYear ? " (current)" : ""}
              </Txt>
            </Row>
            <Muted>
              {entry.role} • {entry.department}
            </Muted>
          </Card>
        ))
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitials: { fontSize: 28, fontWeight: "800" },
  name: { fontSize: 20, fontWeight: "800" },
});
