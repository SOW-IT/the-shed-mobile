import { Btn, Field, Row, Sheet } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { useSpotifyPlaylist } from "./useSpotifyPlaylist";

export type MusicRequest = Doc<"musicRequests">;
type SpotifySong = {
  title: string;
  artist: string;
  link: string;
  albumArtUrl?: string;
  isrc?: string;
};
const detectSpotifyLink = (value: string): "track" | "playlist" | null => {
  try {
    const url = new URL(value.trim());
    if (!["open.spotify.com", "www.open.spotify.com"].includes(url.hostname))
      return null;
    const match = url.pathname.match(
      /^\/(?:intl-[a-zA-Z-]+\/)?(track|playlist)\/[a-zA-Z0-9]+\/?$/,
    );
    return match ? (match[1] as "track" | "playlist") : null;
  } catch {
    return null;
  }
};
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
  hideRequestComment = false,
}: {
  visible: boolean;
  onClose: () => void;
  prefill: MusicRequest | null;
  hideRequestComment?: boolean;
}) => {
  const t = useAppTheme();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [link, setLink] = useState("");
  const [requestComment, setRequestComment] = useState("");
  const [spotifyLink, setSpotifyLink] = useState("");
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
  const [isrc, setIsrc] = useState<string | undefined>();
  const [fetchingSpotify, setFetchingSpotify] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [manualExpanded, setManualExpanded] = useState(false);
  const duplicateLink = link.trim()
    ? spotifyTrackUrl(link)
    : spotifyTrackUrl(spotifyLink);
  const duplicate = useQuery(
    api.musicRequests.checkDuplicate,
    visible && (duplicateLink || (title.trim() && artist.trim()))
      ? { link: duplicateLink ?? link.trim(), title, artist, isrc }
      : "skip",
  );
  const duplicateIsSelf =
    !!prefill &&
    !!duplicateLink &&
    spotifyTrackUrl(prefill.link) === duplicateLink;
  const duplicateBlocked = !duplicateIsSelf && duplicate?.kind === "exact";
  const possibleDuplicate = !duplicateIsSelf && duplicate?.kind === "possible";
  const getSpotifyTrack = useAction(api.spotify.getTrack);
  const spotifyPlaylist = useSpotifyPlaylist();
  useEffect(() => {
    if (visible) {
      void spotifyPlaylist.refreshConnection();
    }
  }, [visible, spotifyPlaylist.refreshConnection]);

  const spotifyLinkType = detectSpotifyLink(spotifyLink);
  const [importingPlaylist, setImportingPlaylist] = useState(false);
  const submit = useMutation(api.musicRequests.submit);
  const update = useMutation(api.musicRequests.update);
  const [submitting, setSubmitting] = useState(false);
  const submitMany = useMutation(api.musicRequests.submitMany);
  const previewBatch = useMutation(api.musicRequests.previewBatch);
  const [songs, setSongs] = useState<SpotifySong[]>([]);
  const clearSong = () => {
    setTitle("");
    setArtist("");
    setLink("");
    setSpotifyLink("");
    setAlbumArtUrl(null);
    setIsrc(undefined);
    setSpotifyError(null);
  };
  const clearAllSongs = () => {
    setSongs([]);
    clearSong();
  };
  const addSong = () => {
    if (!title.trim() || !artist.trim() || !link.trim()) {
      Alert.alert("Incomplete song", "Enter a title, artist and link.");
      return;
    }
    if (duplicateBlocked || (!!duplicateLink && duplicate === undefined)) {
      Alert.alert(
        "Duplicate",
        "Song already requested or still being checked.",
      );
      return;
    }
    const key = spotifyTrackUrl(link) ?? link.trim().toLowerCase();
    if (
      songs.some(
        (song) =>
          (spotifyTrackUrl(song.link) ?? song.link.toLowerCase()) === key,
      )
    ) {
      Alert.alert("Already added", "Song is already on your list.");
      return;
    }
    if (songs.length >= 50) {
      Alert.alert("List full", "You can submit up to 50 songs at once.");
      return;
    }
    if (possibleDuplicate) {
      Alert.alert(
        "Possible duplicate",
        `${duplicate?.title} by ${duplicate?.artist} has already been requested. Add this version anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add anyway", onPress: () => queueSong() },
        ],
      );
      return;
    }
    queueSong();
  };
  const queueSong = () => {
    setSongs((current) => [
      ...current,
      {
        title: title.trim(),
        artist: artist.trim(),
        link: link.trim(),
        albumArtUrl: albumArtUrl ?? undefined,
        isrc,
      },
    ]);
    clearSong();
  };
  const importPlaylist = async () => {
    if (importingPlaylist || submitting) return;
    if (!spotifyPlaylist.connected) {
      Alert.alert(
        "Spotify not connected",
        "Open your Profile page and connect Spotify to import playlists.",
      );
      return;
    }
    setImportingPlaylist(true);
    try {
      const result = await spotifyPlaylist.importPlaylist(spotifyLink.trim());
      const existing = new Set(
        songs.map(
          (song) => spotifyTrackUrl(song.link) ?? song.link.toLowerCase(),
        ),
      );
      const available = Math.max(0, 50 - songs.length);
      const fresh = result.songs.filter((song: SpotifySong) => {
        const key = spotifyTrackUrl(song.link) ?? song.link.toLowerCase();
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      const toAdd = fresh.slice(0, available);
      setSongs((current) => [...current, ...toAdd]);
      Alert.alert(
        "Playlist imported",
        `${toAdd.length} song(s) added from ${result.name}.${result.limited ? " Only the first 50 playlist entries were fetched." : ""}${fresh.length > available ? " The submission limit is 50 songs." : ""} Existing requests will be skipped when submitted.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      const accessDenied =
        /403|denied access to playlist songs|forbidden/i.test(message);

      const friendlyMessage = accessDenied
        ? "You don't have permission to import this playlist. Please use a Spotify playlist that you own or collaborate on."
        : "We couldn't import this playlist. Please check the Spotify link and try again.";

      if (Platform.OS === "web") {
        window.alert(friendlyMessage);
      } else {
        Alert.alert("Couldn't import playlist", friendlyMessage);
      }
    } finally {
      setImportingPlaylist(false);
    }
  };
  useEffect(() => {
    if (!visible) return;
    setTitle(prefill?.title ?? "");
    setArtist(prefill?.artist ?? "");
    setLink(prefill?.link ?? "");
    setRequestComment(prefill?.requestComment ?? "");
    setSpotifyLink("");
    setAlbumArtUrl(prefill?.albumArtUrl ?? null);
    setIsrc(prefill?.isrc);
    setSpotifyError(null);
    setSongs([]);
    setManualExpanded(!!prefill);
  }, [visible, prefill?._id]);
  const clearSpotifyLink = () => {
    setSpotifyLink("");
    setSpotifyError(null);
  };
  const autofillSpotify = async () => {
    const cleanUrl = spotifyTrackUrl(spotifyLink);
    if (!cleanUrl) {
      setSpotifyError("Please paste a valid Spotify track link. ");
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
      setIsrc(track.isrc ?? undefined);
      setManualExpanded(true);
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
  const submitBatch = async (
    all: SpotifySong[],
    allowPossibleDuplicates: boolean,
  ) => {
    setSubmitting(true);
    try {
      const result = await submitMany({
        songs: all,
        requestComment: requestComment.trim() || undefined,
        allowPossibleDuplicates,
      });
      setSongs([]);
      clearSong();
      setRequestComment("");
      onClose();
      Alert.alert(
        "Songs submitted",
        `${result.added} song(s) submitted; ${result.skipped} duplicate(s) skipped.`,
      );
    } catch (error) {
      Alert.alert(
        "Couldn't submit",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const onSubmit = async () => {
    if (submitting) return;
    if (!prefill && songs.length > 0) {
      const all = [...songs];
      if (title.trim() || artist.trim() || link.trim()) {
        if (!title.trim() || !artist.trim() || !link.trim()) {
          Alert.alert("Incomplete song", "Complete or clear the current song.");
          return;
        }
        if (duplicateBlocked || (!!duplicateLink && duplicate === undefined)) {
          Alert.alert(
            "Duplicate",
            "Current song is a duplicate or still being checked.",
          );
          return;
        }
        all.push({
          title: title.trim(),
          artist: artist.trim(),
          link: link.trim(),
          albumArtUrl: albumArtUrl ?? undefined,
          isrc,
        });
      }
      setSubmitting(true);
      try {
        const preview = await previewBatch({ songs: all });
        if (preview.possibleDuplicates > 0) {
          setSubmitting(false);
          Alert.alert(
            "Possible duplicate songs",
            `${preview.possibleDuplicates} song(s) may already have been requested in a different version. Submit these versions anyway? Exact duplicates will be skipped.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Request anyway",
                onPress: () => void submitBatch(all, true),
              },
            ],
          );
          return;
        }
        await submitBatch(all, false);
        return;
      } catch (error) {
        Alert.alert(
          "Couldn't check duplicates",
          error instanceof Error ? error.message : "Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }
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
        "This Spotify track has already been submitted and cannot be requested again.",
      );
      return;
    }
    if (possibleDuplicate) {
      Alert.alert(
        "Possible duplicate",
        `${duplicate?.title} by ${duplicate?.artist} has already been requested. Request this version anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Request anyway", onPress: () => void saveSingle(true) },
        ],
      );
      return;
    }
    await saveSingle(false);
  };
  const saveSingle = async (allowPossibleDuplicate: boolean) => {
    setSubmitting(true);
    try {
      const values = {
        title: title.trim(),
        artist: artist.trim(),
        link: link.trim(),
        requestComment: requestComment.trim() || undefined,
        albumArtUrl: albumArtUrl ?? undefined,
        isrc,
        allowPossibleDuplicate,
      };
      if (prefill) {
        await update({ requestId: prefill._id, ...values });
      } else {
        await submit(values);
      }
      setTitle("");
      setArtist("");
      setLink("");
      setRequestComment("");
      setSpotifyLink("");
      setAlbumArtUrl(null);
      setIsrc(undefined);
      setSpotifyError(null);
      onClose();
      Alert.alert(
        prefill ? "Song updated" : "Request sent",
        prefill
          ? "Your changes have been saved."
          : "A Praise Manager will review your song request soon.",
      );
    } catch (error: unknown) {
      Alert.alert(
        prefill ? "Couldn't update song" : "Couldn't send request",
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
      title={prefill ? "Edit song" : "Request a song"}
      footer={
        <Row spread>
          <Btn title="Cancel" variant="ghost" onPress={onClose} />
          <Btn
            title={
              submitting
                ? prefill
                  ? "Saving..."
                  : "Submitting..."
                : prefill
                  ? "Save Changes"
                  : "Submit Song"
            }
            onPress={onSubmit}
            disabled={
              submitting ||
              fetchingSpotify ||
              importingPlaylist ||
              (songs.length === 0 && duplicateBlocked) ||
              (songs.length === 0 && !!duplicateLink && duplicate === undefined)
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
            Add from Spotify
          </Text>
        </View>
        <Text style={[typography.caption, { color: t.muted }]}>
          Paste a Spotify song or playlist link.
        </Text>

        <Text style={[typography.caption, { color: t.warning }]}>
          Note: You can only import playlists that you own or collaborate on.
        </Text>

        <View style={{ position: "relative" }}>
          <Field
            label="Spotify song or playlist URL"
            value={spotifyLink}
            onChangeText={(value) => {
              setSpotifyLink(value);
              setSpotifyError(null);
              setTitle("");
              setArtist("");
              setLink("");
              setAlbumArtUrl(null);
              setIsrc(undefined);
            }}
            placeholder="https://open.spotify.com/track/... or playlist/..."
            autoCapitalize="none"
          />

          {spotifyLink.length > 0 && (
            <Pressable
              onPress={clearSpotifyLink}
              accessibilityRole="button"
              accessibilityLabel="Clear Spotify link"
              hitSlop={8}
              style={{
                position: "absolute",
                right: 12,
                bottom: 10,
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 14,
                backgroundColor: t.card,
              }}
            >
              <Ionicons name="close" size={18} color={t.muted} />
            </Pressable>
          )}
        </View>

        <Btn
          title={
            spotifyLinkType === "playlist"
              ? importingPlaylist
                ? "Importing..."
                : "Import playlist"
              : fetchingSpotify
                ? "Finding song..."
                : "Autofill song"
          }
          icon={
            spotifyLinkType === "playlist"
              ? "download-outline"
              : "search-outline"
          }
          onPress={() =>
            void (spotifyLinkType === "playlist"
              ? importPlaylist()
              : autofillSpotify())
          }
          disabled={
            !spotifyLinkType ||
            fetchingSpotify ||
            importingPlaylist ||
            submitting ||
            (spotifyLinkType === "playlist" &&
              (songs.length >= 50 || !!prefill))
          }
        />
        {spotifyLink.trim() && !spotifyLinkType ? (
          <Text style={[typography.caption, { color: t.warning }]}>
            Enter a valid Spotify track or playlist URL.
          </Text>
        ) : null}
        {spotifyLinkType === "playlist" &&
        !spotifyPlaylist.connected &&
        !prefill ? (
          <Text style={[typography.caption, { color: t.muted }]}>
            Connect Spotify from your Profile page to import playlists.
          </Text>
        ) : null}
        {spotifyError ? (
          <Text style={[typography.caption, { color: t.warning }]}>
            {spotifyError}
          </Text>
        ) : null}
        {!prefill && (
          <View style={{ marginTop: spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <Ionicons
                name={
                  !spotifyPlaylist.ready
                    ? "time-outline"
                    : spotifyPlaylist.connected
                      ? "checkmark-circle"
                      : "close-circle"
                }
                size={17}
                color={
                  !spotifyPlaylist.ready
                    ? t.muted
                    : spotifyPlaylist.connected
                      ? "#1DB954"
                      : "#EF4444"
                }
              />
              <Text
                style={[
                  typography.caption,
                  {
                    color: !spotifyPlaylist.ready
                      ? t.muted
                      : spotifyPlaylist.connected
                        ? "#1DB954"
                        : "#EF4444",
                    fontWeight: "600",
                  },
                ]}
              >
                {!spotifyPlaylist.ready
                  ? "Checking Spotify connection..."
                  : spotifyPlaylist.connected
                    ? "Spotify connected"
                    : "Spotify not connected"}
              </Text>
            </View>
          </View>
        )}

        {duplicate && !duplicateIsSelf ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: spacing.sm,
              paddingVertical: spacing.sm,
            }}
          >
            <Ionicons
              name={"alert-circle-outline"}
              size={20}
              color={t.warning}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>
                {possibleDuplicate
                  ? "Possible duplicate song"
                  : duplicate.status === "APPROVED"
                    ? "Already in the playlist"
                    : duplicate.status === "PENDING"
                      ? "This song has already been requested"
                      : "This song was previously declined"}
              </Text>
              <Text style={[typography.caption, { color: t.muted }]}>
                {duplicate.title} by {duplicate.artist}
                {possibleDuplicate
                  ? ". You can request this version anyway."
                  : ". You can't submit another request for this recording."}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      {albumArtUrl ? (
        <View style={styles.preview}>
          <Image
            source={{ uri: albumArtUrl }}
            style={styles.albumCover}
            resizeMode="cover"
          />
        </View>
      ) : null}
      <Pressable
        onPress={() => setManualExpanded((prev) => !prev)}
        accessibilityRole="button"
        accessibilityState={{ expanded: manualExpanded }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: spacing.md,
        }}
      >
        <Text style={{ color: t.text, fontWeight: "700" }}>
          Add song manually
        </Text>
        <Ionicons
          name={manualExpanded ? "chevron-up" : "chevron-down"}
          size={22}
          color={t.muted}
        />
      </Pressable>
      {manualExpanded && (
        <View style={{ gap: spacing.md }}>
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
          <Btn
            title="Add song to list"
            icon="add-outline"
            onPress={addSong}
            disabled={
              fetchingSpotify ||
              duplicateBlocked ||
              (!!duplicateLink && duplicate === undefined)
            }
          />
        </View>
      )}

      {!prefill && (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: t.text, fontWeight: "800" }}>
              Songs to submit ({songs.length})
            </Text>

            {songs.length > 0 && (
              <Pressable
                onPress={() => setSongs([])}
                disabled={submitting || importingPlaylist}
                accessibilityRole="button"
                accessibilityLabel="Clear all songs to submit"
                style={{ paddingHorizontal: spacing.sm, paddingVertical: 6 }}
              >
                <Text
                  style={{
                    color: "#dc2626",
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  Clear All
                </Text>
              </Pressable>
            )}
          </View>

          {songs.map((song, index) => (
            <View
              key={`${song.link}-${index}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                padding: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: t.card,
              }}
            >
              {song.albumArtUrl ? (
                <Image
                  source={{ uri: song.albumArtUrl }}
                  style={{ width: 42, height: 42, borderRadius: radius.sm }}
                />
              ) : (
                <Ionicons name="musical-note" size={24} color={t.muted} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>
                  {song.title}
                </Text>
                <Text style={{ color: t.muted }}>{song.artist}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${song.title}`}
                onPress={() =>
                  setSongs((current) => current.filter((_, i) => i !== index))
                }
              >
                <Ionicons name="trash-outline" size={22} color={t.warning} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {!hideRequestComment && (
        <Field
          label="Request Comment (Optional)"
          value={requestComment}
          onChangeText={setRequestComment}
          placeholder="Why would you like to request this song?"
          multiline
        />
      )}
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
    title: "Praise Manger approval",
    detail:
      "A Praise Manager reviews your request and decides whether to approve it.",
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
    justifyContent: "center",
    marginTop: spacing.md,
    marginBottom: spacing.md,
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
