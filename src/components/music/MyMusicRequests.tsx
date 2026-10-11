import { Btn, Field, Row, Sheet } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/\_generated/api";
import type { Doc } from "../../../convex/\_generated/dataModel";
export type MusicRequest = Doc<"musicRequests">;
const spotifyTrackUrl = (value: string): string | null => {
  try {
    const url = new URL(value.trim());
    if (
      url.hostname !== "open.spotify.com" &&
      url.hostname !== "www.open.spotify.com"
    )
      return null;
    const match = url.pathname.match(
      /^\/(?:intl-[a-zA-Z-]+\/)?track\/([a-zA-Z0-9]+)\/?$/,
    );
    return match ? `https://open.spotify.com/track/${match[1]}` : null;
  } catch {
    return null;
  }
};
export const NewMusicRequestSheet = ({
  visible,
  onClose,
  prefill,
}: {
  visible: boolean;
  onClose: () => void;
  prefill: MusicRequest | null;
}) => {
  const t = useAppTheme();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [link, setLink] = useState("");
  const [requestComment, setRequestComment] = useState("");
  const [spotifyLink, setSpotifyLink] = useState("");
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
  const [fetchingSpotify, setFetchingSpotify] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  // Check either the Spotify autofill field or the final song link.
  const duplicateLink = link.trim()
    ? spotifyTrackUrl(link)
    : spotifyTrackUrl(spotifyLink);
  const duplicate = useQuery(
    api.musicRequests.checkDuplicate,
    visible && duplicateLink ? { link: duplicateLink } : "skip",
  );
  const duplicateBlocked =
    duplicate?.status === "APPROVED" || duplicate?.status === "PENDING";
  const getSpotifyTrack = useAction(api.spotify.getTrack);
  const submit = useMutation(api.musicRequests.submit);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setTitle(prefill?.title ?? "");
    setArtist(prefill?.artist ?? "");
    setLink(prefill?.link ?? "");
    setRequestComment(prefill?.requestComment ?? "");
    setSpotifyLink("");
    setAlbumArtUrl(null);
    setSpotifyError(null);
  }, [visible, prefill?._id]);
  const autofillSpotify = async () => {
    const cleanUrl = spotifyTrackUrl(spotifyLink);
    if (!cleanUrl) {
      setSpotifyError("Please paste a valid Spotify track link.");
      return;
    }
    setFetchingSpotify(true);
    setSpotifyError(null);
    try {
      const track = await getSpotifyTrack({
        link: cleanUrl,
      });
      setTitle(track.title);
      setArtist(track.artist);
      setLink(track.link);
      setAlbumArtUrl(track.albumArtUrl);
    } catch (error) {
      setSpotifyError(
        error instanceof Error
          ? error.message
          : "Could not retrieve Spotify information.",
      );
    } finally {
      setFetchingSpotify(false);
    }
  };
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
    if (duplicateBlocked) {
      Alert.alert(
        "Song already requested",
        "This Spotify track is already approved or pending review.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await submit({
        title: title.trim(),
        artist: artist.trim(),
        link: link.trim(),
        requestComment: requestComment.trim() || undefined,
        albumArtUrl: albumArtUrl ?? undefined,
      });
      setTitle("");
      setArtist("");
      setLink("");
      setRequestComment("");
      setSpotifyLink("");
      setAlbumArtUrl(null);
      setSpotifyError(null);
      onClose();
      Alert.alert(
        "Request sent",
        "A Chaplain will review your song request soon.",
      );
    } catch (error: unknown) {
      Alert.alert(
        "Couldn't send request",
        error instanceof Error ? error.message : "Please try again.",
      );
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
            disabled={
              submitting ||
              fetchingSpotify ||
              duplicateBlocked ||
              (!!duplicateLink && duplicate === undefined)
            }
          />
        </Row>
      }
    >
      <View
        style={[
          styles.spotifySection,
          {
            borderColor: t.separator,
            backgroundColor: t.card,
          },
        ]}
      >
        <View style={styles.spotifyHeading}>
          <Ionicons name="musical-notes-outline" size={20} color={t.primary} />
          <Text style={[styles.spotifyTitle, { color: t.text }]}>
            Autofill from Spotify
          </Text>
        </View>
        <Text style={[typography.caption, { color: t.muted }]}>
          Paste a Spotify song link to automatically fill in the title, artist,
          link and album artwork.
        </Text>
        <Field
          label="Spotify Track URL"
          value={spotifyLink}
          onChangeText={(value) => {
            setSpotifyLink(value);
            setSpotifyError(null);
            setTitle("");
            setArtist("");
            setLink("");
            setAlbumArtUrl(null);
          }}
          placeholder="https://open.spotify.com/track/..."
          autoCapitalize="none"
        />
        <Btn
          title={fetchingSpotify ? "Finding song..." : "Autofill"}
          icon="search-outline"
          onPress={() => void autofillSpotify()}
          disabled={fetchingSpotify || !spotifyLink.trim()}
        />
        {spotifyError ? (
          <Text style={[typography.caption, { color: t.warning }]}>
            {spotifyError}
          </Text>
        ) : null}
        {albumArtUrl ? (
          <View style={styles.preview}>
            <Image
              source={{ uri: albumArtUrl }}
              style={styles.albumCover}
              resizeMode="cover"
            />
          </View>
        ) : null}
        {duplicate ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: spacing.sm,
              paddingVertical: spacing.sm,
            }}
          >
            <Ionicons
              name={
                duplicateBlocked
                  ? "alert-circle-outline"
                  : "information-circle-outline"
              }
              size={20}
              color={duplicateBlocked ? t.warning : t.muted}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>
                {duplicate.status === "APPROVED"
                  ? "Already in the playlist"
                  : duplicate.status === "PENDING"
                    ? "This song has already been requested"
                    : "This song was previously declined"}
              </Text>
              <Text style={[typography.caption, { color: t.muted }]}>
                {duplicate.title} by {duplicate.artist}
                {duplicateBlocked
                  ? ". You can't submit another request for this track."
                  : ". You can submit a new request if you'd like it reconsidered."}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
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
              style={[typography.caption, { color: t.text, fontWeight: "700" }]}
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
  spotifySection: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  spotifyHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  spotifyTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  albumCover: {
    width: 76,
    height: 76,
    borderRadius: radius.sm,
  },
  previewText: {
    flex: 1,
    gap: spacing.xs,
  },
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
