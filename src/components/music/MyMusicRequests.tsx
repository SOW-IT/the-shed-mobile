import { Btn, Field, Row, Sheet } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

export type MusicRequest = Doc<"musicRequests">;

export const NewMusicRequestSheet = ({
  visible,
  onClose,
  prefill,
}: {
  visible: boolean;
  onClose: () => void;
  prefill: MusicRequest | null;
}) => {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [link, setLink] = useState("");
  const [requestComment, setRequestComment] = useState("");

  const submit = useMutation(api.musicRequests.submit);
  const [submitting, setSubmitting] = useState(false);

  // Populate fields when opening with an existing request
  useEffect(() => {
    if (!visible) return;

    setTitle(prefill?.title ?? "");
    setArtist(prefill?.artist ?? "");
    setLink(prefill?.link ?? "");
    setRequestComment(prefill?.requestComment ?? "");
  }, [visible, prefill]);

  const onSubmit = async () => {
    if (submitting) return;

    if (!title.trim()) {
      Alert.alert("Song title required", "Please enter a song title.");
      return;
    }

    if (!artist.trim()) {
      Alert.alert("Artist name required", "Please enter an artist name.");
      return;
    }

    if (!link.trim()) {
      Alert.alert("Link required", "Please enter a song link.");
      return;
    }

    setSubmitting(true);

    try {
      await submit({
        title: title.trim(),
        artist: artist.trim(),
        link: link.trim(),
        requestComment: requestComment.trim() || undefined,
      });

      // Clear form after successful submission
      setTitle("");
      setArtist("");
      setLink("");
      setRequestComment("");

      onClose();

      Alert.alert(
        "Request sent",
        "A Chaplain will review your song request soon.",
      );
    } catch (e: any) {
      Alert.alert("Couldn't send request", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Request a song"
      footer={
        <Row spread>
          <Btn title="Cancel" variant="ghost" onPress={onClose} />
          <Btn
            title={submitting ? "Submitting..." : "Submit Request"}
            onPress={onSubmit}
          />
        </Row>
      }
    >
      <Field
        label="Song Title"
        value={title}
        onChangeText={setTitle}
        placeholder="Enter song title"
      />

      <Field
        label="Artist"
        value={artist}
        onChangeText={setArtist}
        placeholder="Enter artist name"
      />

      <Field
        label="Link"
        value={link}
        onChangeText={setLink}
        placeholder="Spotify or YouTube link"
      />

      <Field
        label="Request Comment (Optional)"
        value={requestComment}
        onChangeText={setRequestComment}
        placeholder="Why would you like to request this song?"
        multiline
      />
    </Sheet>
  );
};

const buildGuideSteps = () => [
  {
    icon: "create-outline" as const,
    title: "Submit your request",
    detail:
      "Enter the song name, artist, link, and an optional comment explaining your request.",
  },
  {
    icon: "person-outline" as const,
    title: "Chaplain approval",
    detail:
      "A Chaplain reviews your request and decides whether to approve it.",
  },
];

export const MusicGuideSheet = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const t = useAppTheme();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="How to submit a music request"
    >
      {buildGuideSteps().map((step, i) => (
        <View key={i} style={styles.guideStep}>
          <View
            style={[styles.guideIconWrap, { backgroundColor: t.primarySoft }]}
          >
            <Ionicons name={step.icon} size={18} color={t.primary} />
          </View>

          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={[
                typography.caption,
                {
                  color: t.text,
                  fontWeight: "700",
                },
              ]}
            >
              {step.title}
            </Text>

            <Text style={[typography.caption, { color: t.muted }]}>
              {step.detail}
            </Text>
          </View>
        </View>
      ))}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  guideStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  guideIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
