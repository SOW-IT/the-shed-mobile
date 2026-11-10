import {
  Btn,
  ConfirmDialog,
  ErrorBanner,
  errorMessage,
  Field,
  InfoBanner,
  Row,
  Sheet,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  songLinkKey,
  spotifyTrackUrl,
  youtubeThumbnailUrl,
  youtubeVideoId,
  youtubeVideoUrl,
} from "../../../convex/shared/musicLinks";
import { parseYouTubeSong } from "../../../convex/shared/youtube";
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
const youtubePlaylistUrl = (value: string): string | null => {
  try {
    const url = new URL(value.trim());

    if (
      ![
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(url.hostname.toLowerCase())
    ) {
      return null;
    }

    const playlistId = url.searchParams.get("list");

    if (!playlistId || !/^[a-zA-Z0-9_-]+$/.test(playlistId)) {
      return null;
    }

    return `https://www.youtube.com/playlist?list=${playlistId}`;
  } catch {
    return null;
  }
};

const normalizeMusicLink = (value: string) =>
  value.trim().replace(/^http:\/\//i, "https://");

const songCount = (count: number) =>
  `${count} ${count === 1 ? "song" : "songs"}`;

type PendingConfirm = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

const MusicRequestSheetContent = ({
  visible,
  onClose,
  prefill,
  again = null,
  hideRequestComment = false,
  addsDirectly = false,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  prefill: MusicRequest | null;
  again?: MusicRequest | null;
  hideRequestComment?: boolean;
  /** A Praise Manager's songs go straight onto the playlist. */
  addsDirectly?: boolean;
  onSaved: (message: string) => void;
}) => {
  const t = useAppTheme();
  const hideAutofill = prefill?.status === "APPROVED";
  const seed = prefill ?? again;
  const [title, setTitle] = useState(seed?.title ?? "");
  const [artist, setArtist] = useState(seed?.artist ?? "");
  const [link, setLink] = useState(seed?.link ?? "");
  const [requestComment, setRequestComment] = useState(
    prefill?.requestComment ?? "",
  );
  const [spotifyLink, setSpotifyLink] = useState("");
  const musicLink = normalizeMusicLink(spotifyLink);
  const [autofilledFrom, setAutofilledFrom] = useState<string | null>(null);
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(
    seed?.albumArtUrl ?? null,
  );
  const [isrc, setIsrc] = useState<string | undefined>(
    seed?.isrc ?? undefined,
  );
  const [fetchingSpotify, setFetchingSpotify] = useState(false);
  const autofillVersion = useRef(0);
  const musicLinkEdits = useRef(0);
  const dropPendingAutofill = () => {
    autofillVersion.current++;
    setFetchingSpotify(false);
  };
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [manualExpanded, setManualExpanded] = useState(!!seed);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const editing = (setValue: (value: string) => void) => (value: string) => {
    setError(null);
    setValue(value);
  };
  const duplicateLink = link.trim()
    ? spotifyTrackUrl(link)
    : spotifyTrackUrl(musicLink);
  const duplicate = useQuery(
    api.musicRequests.checkDuplicate,
    visible && (duplicateLink || (title.trim() && artist.trim()))
      ? {
          link: duplicateLink ?? link.trim(),
          title,
          artist,
          isrc,
          // Editing: the request itself isn't a duplicate of itself.
          excludeId: prefill?._id,
        }
      : "skip",
  );
  const duplicateBlocked = duplicate?.kind === "exact";
  const possibleDuplicate = duplicate?.kind === "possible";
  const declinedBefore = duplicate?.kind === "declined";
  const declinedVersion =
    duplicate?.kind === "declined" && !duplicate.sameRecording;
  const getSpotifyTrack = useAction(api.spotify.getTrack);
  const importYouTubePlaylist = useAction(api.youtube.importPlaylist);
  const spotifyPlaylist = useSpotifyPlaylist();

  const spotifyLinkType = detectSpotifyLink(musicLink);
  const youtubePlaylistLink = youtubePlaylistUrl(musicLink);
  const youtubeLink = youtubeVideoUrl(musicLink);

  const isPlaylist = spotifyLinkType === "playlist" || !!youtubePlaylistLink;

  const validMusicLink =
    !!spotifyLinkType || !!youtubeLink || !!youtubePlaylistLink;
  const [importingPlaylist, setImportingPlaylist] = useState(false);
  const submit = useMutation(api.musicRequests.submit);
  const update = useMutation(api.musicRequests.update);
  const [submitting, setSubmitting] = useState(false);
  const submitMany = useMutation(api.musicRequests.submitMany);
  const previewBatch = useMutation(api.musicRequests.previewBatch);
  const [songs, setSongs] = useState<SpotifySong[]>([]);
  const [editingSongIndex, setEditingSongIndex] = useState<number | null>(null);
  const [editSongTitle, setEditSongTitle] = useState("");
  const [editSongArtist, setEditSongArtist] = useState("");
  const clearSong = () => {
    setTitle("");
    setArtist("");
    setLink("");
    setSpotifyLink("");
    setAlbumArtUrl(null);
    setIsrc(undefined);
    setSpotifyError(null);
    setAutofilledFrom(null);
    musicLinkEdits.current++;
    dropPendingAutofill();
  };

  const addSong = () => {
    setError(null);
    if (!title.trim() || !artist.trim() || !link.trim()) {
      setError("Enter a title, artist and link.");
      return;
    }
    if (duplicateBlocked || (!!duplicateLink && duplicate === undefined)) {
      setError(
        "This song has already been requested, or is still being checked.",
      );
      return;
    }
    const key = songLinkKey(link);
    if (songs.some((song) => songLinkKey(song.link) === key)) {
      setError("This song is already on your list.");
      return;
    }
    if (songs.length >= 50) {
      setError("You can submit up to 50 songs at once.");
      return;
    }
    if (possibleDuplicate) {
      setPendingConfirm({
        title: "Possible duplicate",
        message: `${duplicate?.title} by ${duplicate?.artist} has already been requested. Add this version anyway?`,
        confirmLabel: "Add anyway",
        onConfirm: queueSong,
      });
      return;
    }
    queueSong();
  };

  const startEditingSong = (index: number) => {
    const song = songs[index];
    if (!song) return;

    setEditingSongIndex(index);
    setEditSongTitle(song.title);
    setEditSongArtist(song.artist);
  };

  const saveEditedSong = () => {
    if (editingSongIndex === null) return;

    if (!editSongTitle.trim() || !editSongArtist.trim()) {
      setError("Enter both the song title and artist.");
      return;
    }

    setSongs((current) =>
      current.map((song, index) =>
        index === editingSongIndex
          ? {
              ...song,
              title: editSongTitle.trim(),
              artist: editSongArtist.trim(),
            }
          : song,
      ),
    );

    setEditingSongIndex(null);
  };

  const cancelEditingSong = () => {
    setEditingSongIndex(null);
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
    setError(null);
    setInfo(null);
    if (!spotifyPlaylist.connected) {
      setError("Connect Spotify from your Profile page to import playlists.");
      return;
    }
    setImportingPlaylist(true);
    const edits = musicLinkEdits.current;
    try {
      const result = await spotifyPlaylist.importPlaylist(musicLink);
      const existing = new Set(songs.map((song) => songLinkKey(song.link)));
      const available = Math.max(0, 50 - songs.length);
      const fresh = result.songs.filter((song: SpotifySong) => {
        const key = songLinkKey(song.link);
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      const toAdd = fresh.slice(0, available);
      setSongs((current) => [...current, ...toAdd]);
      if (edits === musicLinkEdits.current) setSpotifyLink("");
      setInfo(
        `${songCount(toAdd.length)} added from ${result.name}.${result.limited ? " Only the first 50 playlist entries were fetched." : ""}${fresh.length > available ? " You can submit up to 50 songs at once." : ""} Songs already requested are skipped when you submit.`,
      );
    } catch (error) {
      const message = errorMessage(error);

      const accessDenied =
        /403|denied access to playlist songs|forbidden/i.test(message);

      const friendlyMessage = /connect spotify again/i.test(message)
        ? message
        : accessDenied
          ? "You don't have permission to import this playlist. Please use a Spotify playlist that you own or collaborate on."
          : "We couldn't import this playlist. Please check the Spotify link and try again.";

      setError(friendlyMessage);
    } finally {
      setImportingPlaylist(false);
    }
  };

  const importYouTube = async () => {
    if (importingPlaylist || submitting || prefill) return;

    const playlistUrl = youtubePlaylistUrl(musicLink);
    if (!playlistUrl) {
      setSpotifyError("Please enter a valid YouTube playlist URL.");
      return;
    }

    setImportingPlaylist(true);
    setSpotifyError(null);
    setError(null);
    setInfo(null);
    const edits = musicLinkEdits.current;

    try {
      const result = await importYouTubePlaylist({
        link: playlistUrl,
      });

      const existing = new Set(songs.map((song) => songLinkKey(song.link)));

      const available = Math.max(0, 50 - songs.length);

      const fresh = result.songs.filter((song) => {
        const key = songLinkKey(song.link);

        if (existing.has(key)) return false;

        existing.add(key);
        return true;
      });

      const toAdd = fresh.slice(0, available);

      setSongs((current) => [...current, ...toAdd]);
      if (edits === musicLinkEdits.current) setSpotifyLink("");

      setInfo(
        `${songCount(toAdd.length)} added from the YouTube playlist.${
          result.limited
            ? " Only the first 50 playlist entries were fetched."
            : ""
        }${
          fresh.length > available
            ? " You can submit up to 50 songs at once."
            : ""
        } Songs already requested are skipped when you submit.`,
      );
    } catch (error) {
      setSpotifyError(errorMessage(error));
    } finally {
      setImportingPlaylist(false);
    }
  };

  const changeMusicLink = (value: string) => {
    musicLinkEdits.current++;
    const nextKey = songLinkKey(normalizeMusicLink(value));
    if (nextKey !== songLinkKey(musicLink)) dropPendingAutofill();
    setSpotifyLink(value);
    setSpotifyError(null);
    setError(null);
    if (autofilledFrom !== null && nextKey !== songLinkKey(autofilledFrom)) {
      setTitle("");
      setArtist("");
      setLink("");
      setAlbumArtUrl(null);
      setIsrc(undefined);
      setAutofilledFrom(null);
    }
  };
  const autofillSpotify = async () => {
    const cleanUrl = spotifyTrackUrl(musicLink);
    if (!cleanUrl) {
      setSpotifyError("Paste a valid Spotify or YouTube link.");
      return;
    }
    const version = autofillVersion.current;
    setFetchingSpotify(true);
    setSpotifyError(null);
    try {
      const track = await getSpotifyTrack({
        link: cleanUrl,
      });
      if (version !== autofillVersion.current) return;
      setTitle(track.title);
      setArtist(track.artist);
      setLink(track.link);
      setAlbumArtUrl(track.albumArtUrl);
      setIsrc(track.isrc ?? undefined);
      setAutofilledFrom(musicLink);
      setManualExpanded(true);
    } catch (error) {
      if (version === autofillVersion.current)
        setSpotifyError(errorMessage(error));
    } finally {
      if (version === autofillVersion.current) setFetchingSpotify(false);
    }
  };

  const autofillYouTube = async () => {
    const cleanUrl = youtubeVideoUrl(musicLink);

    if (!cleanUrl) {
      setSpotifyError("Please paste a valid YouTube video link.");
      return;
    }

    const version = autofillVersion.current;
    setFetchingSpotify(true);
    setSpotifyError(null);

    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`,
      );

      if (!response.ok) {
        throw new Error("Could not retrieve YouTube video information.");
      }

      const data: {
        title: string;
        author_name: string;
      } = await response.json();
      if (version !== autofillVersion.current) return;

      const { title, artist } = parseYouTubeSong(data.title, data.author_name);

      setTitle(title);
      setArtist(artist);
      setLink(cleanUrl);
      const videoId = youtubeVideoId(cleanUrl);
      setAlbumArtUrl(videoId ? youtubeThumbnailUrl(videoId) : null);
      setIsrc(undefined);
      setAutofilledFrom(musicLink);
      setManualExpanded(true);
    } catch (error) {
      if (version === autofillVersion.current)
        setSpotifyError(errorMessage(error));
    } finally {
      if (version === autofillVersion.current) setFetchingSpotify(false);
    }
  };

  const submitBatch = async (
    all: SpotifySong[],
    allowPossibleDuplicates: boolean,
  ) => {
    setSubmitting(true);
    setError(null);
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
      const done = addsDirectly
        ? `${songCount(result.added)} added to the playlist`
        : `${songCount(result.added)} sent for review`;
      onSaved(
        result.skipped ? `${done}, ${result.skipped} already requested` : done,
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };
  const onSubmit = async () => {
    if (submitting) return;
    setError(null);
    if (!prefill && songs.length > 0) {
      const all = [...songs];
      if (title.trim() || artist.trim() || link.trim()) {
        if (!title.trim() || !artist.trim() || !link.trim()) {
          setError("Complete or clear the song you're typing in.");
          return;
        }
        if (duplicateBlocked || (!!duplicateLink && duplicate === undefined)) {
          setError(
            "The song you're typing in has already been requested, or is still being checked.",
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
          setPendingConfirm({
            title: "Possible duplicates",
            message: `${songCount(preview.possibleDuplicates)} may already have been requested in a different version. Submit these versions anyway? Songs already requested are skipped.`,
            confirmLabel: "Submit anyway",
            onConfirm: () => void submitBatch(all, true),
          });
          return;
        }
        await submitBatch(all, false);
        return;
      } catch (error) {
        setError(errorMessage(error));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!title.trim()) {
      setError("Enter a song title.");
      setManualExpanded(true);
      return;
    }
    if (!artist.trim()) {
      setError("Enter the artist.");
      setManualExpanded(true);
      return;
    }
    if (!link.trim()) {
      setError("Enter a link to the song.");
      setManualExpanded(true);
      return;
    }
    if (duplicateBlocked) {
      setError(
        "This recording has already been requested, so it can't be requested again.",
      );
      return;
    }
    if (possibleDuplicate) {
      setPendingConfirm({
        title: "Possible duplicate",
        message: `${duplicate?.title} by ${duplicate?.artist} has already been requested. ${prefill ? "Use" : "Request"} this version anyway?`,
        confirmLabel: prefill ? "Save anyway" : "Request anyway",
        onConfirm: () => void saveSingle(true),
      });
      return;
    }
    await saveSingle(false);
  };
  const saveSingle = async (allowPossibleDuplicate: boolean) => {
    setSubmitting(true);
    setError(null);
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
      onSaved(
        prefill
          ? "Song updated"
          : addsDirectly
            ? "Song added to the playlist"
            : "Request sent for review",
      );
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };
  const spotifyStatusColor = !spotifyPlaylist.ready
    ? t.muted
    : spotifyPlaylist.connected
      ? t.success
      : t.danger;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={
        prefill ? "Edit song" : addsDirectly ? "Add songs" : "Request a song"
      }
      footer={
        <View style={{ gap: spacing.sm }}>
          <ErrorBanner message={error} />
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
                    : addsDirectly
                      ? "Add to Playlist"
                      : "Submit Request"
              }
              onPress={onSubmit}
              disabled={
                submitting ||
                fetchingSpotify ||
                importingPlaylist ||
                (songs.length === 0 && duplicateBlocked) ||
                (songs.length === 0 &&
                  !!duplicateLink &&
                  duplicate === undefined)
              }
            />
          </Row>
        </View>
      }
    >
      {!hideAutofill && (
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
            <Ionicons
              name="musical-notes-outline"
              size={20}
              color={t.primary}
            />
            <Text style={[styles.spotifyTitle, { color: t.text }]}>
              Add from Spotify or YouTube
            </Text>
          </View>
          <Text style={[typography.caption, { color: t.muted }]}>
            Paste a Spotify or YouTube song or playlist link. Spotify playlists
            need Spotify connected on your Profile; public YouTube playlists
            don&apos;t.
          </Text>

          <View style={{ position: "relative" }}>
            <Field
              label="Music Link"
              value={spotifyLink}
              onChangeText={changeMusicLink}
              placeholder="https://open.spotify.com/track/... or playlist/..."
              autoCapitalize="none"
            />

            {spotifyLink.length > 0 && (
              <Pressable
                onPress={() => changeMusicLink("")}
                accessibilityRole="button"
                accessibilityLabel="Clear music link"
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
              isPlaylist
                ? importingPlaylist
                  ? "Importing..."
                  : "Import playlist"
                : fetchingSpotify
                  ? "Finding song..."
                  : "Autofill song"
            }
            icon={isPlaylist ? "download-outline" : "search-outline"}
            onPress={() => {
              if (youtubePlaylistLink) {
                void importYouTube();
              } else if (spotifyLinkType === "playlist") {
                void importPlaylist();
              } else if (youtubeLink) {
                void autofillYouTube();
              } else {
                void autofillSpotify();
              }
            }}
            disabled={
              !validMusicLink ||
              fetchingSpotify ||
              importingPlaylist ||
              submitting ||
              (isPlaylist && (songs.length >= 50 || !!prefill))
            }
          />

          {spotifyLink.trim() && !validMusicLink ? (
            <Text style={[typography.caption, { color: t.warning }]}>
              Enter a valid Spotify or YouTube song or playlist URL.
            </Text>
          ) : null}
          {spotifyError ? (
            <Text style={[typography.caption, { color: t.warning }]}>
              {spotifyError}
            </Text>
          ) : null}

          {(youtubeLink || youtubePlaylistLink) && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: spacing.sm,
                padding: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: t.card,
              }}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={t.warning}
              />
              <Text style={[typography.caption, { color: t.warning, flex: 1 }]}>
                YouTube song details may be inaccurate. Please double-check the
                song title and artist before submitting.
              </Text>
            </View>
          )}

          {!prefill && spotifyLinkType === "playlist" && (
            <View style={{ gap: spacing.xs }}>
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
                  color={spotifyStatusColor}
                />
                <Text
                  style={[
                    typography.caption,
                    {
                      color: spotifyStatusColor,
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
              {spotifyPlaylist.ready && !spotifyPlaylist.connected ? (
                <Text style={[typography.caption, { color: t.muted }]}>
                  Connect Spotify from your Profile page to import playlists.
                </Text>
              ) : null}
            </View>
          )}
        </View>
      )}
      {info ? <InfoBanner message={info} /> : null}
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
              declinedBefore
                ? "information-circle-outline"
                : "alert-circle-outline"
            }
            size={20}
            color={declinedBefore ? t.muted : t.warning}
          />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: t.text, fontWeight: "700" }}>
              {declinedVersion
                ? "A song like this was declined before"
                : declinedBefore
                  ? "This song was declined before"
                  : possibleDuplicate
                    ? "Possible duplicate song"
                    : duplicate.status === "APPROVED"
                      ? "Already in the playlist"
                      : "This song has already been requested"}
            </Text>
            <Text style={[typography.caption, { color: t.muted }]}>
              {duplicate.title} by {duplicate.artist}
              {declinedVersion
                ? prefill
                  ? ", a different recording. You can still save this version."
                  : ", a different recording. You can still request this version."
                : declinedBefore
                  ? prefill
                    ? ". You can still save it."
                    : ". You can request it again."
                  : possibleDuplicate
                    ? prefill
                      ? ". You can still save this version."
                      : ". You can request this version anyway."
                    : prefill
                      ? ". Choose a different recording."
                      : ". You can't submit another request for this recording."}
            </Text>
          </View>
        </View>
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
          {prefill ? "Edit song details" : "Add song manually"}
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
            onChangeText={editing(setTitle)}
            placeholder="Enter song title"
            autoCapitalize="words"
          />
          <Field
            label="Artist"
            value={artist}
            onChangeText={editing(setArtist)}
            placeholder="Enter artist name"
            autoCapitalize="words"
          />
          <Field
            label="Link"
            value={link}
            onChangeText={(value) => {
              // A different song: the autofilled ISRC and artwork no longer apply.
              if (songLinkKey(value) !== songLinkKey(link)) {
                dropPendingAutofill();
                setIsrc(undefined);
                setAlbumArtUrl(null);
              }
              setLink(value);
              setError(null);
            }}
            placeholder="Spotify or YouTube link"
            autoCapitalize="none"
            keyboardType="url"
          />
          {!prefill && (
            <Btn
              title="Add song to list"
              icon="add-outline"
              onPress={addSong}
              disabled={
                fetchingSpotify ||
                importingPlaylist ||
                duplicateBlocked ||
                (!!duplicateLink && duplicate === undefined)
              }
            />
          )}
        </View>
      )}

      {!prefill && songs.length > 0 && (
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
                    color: t.danger,
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
                padding: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: t.card,
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                }}
              >
                {song.albumArtUrl ? (
                  <Image
                    source={{ uri: song.albumArtUrl }}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: radius.sm,
                    }}
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
                  accessibilityLabel={`Edit ${song.title}`}
                  disabled={submitting || importingPlaylist}
                  onPress={() => startEditingSong(index)}
                  style={{ padding: spacing.xs }}
                >
                  <Ionicons name="pencil-outline" size={20} color={t.primary} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${song.title}`}
                  disabled={submitting || importingPlaylist}
                  onPress={() => {
                    setSongs((current) =>
                      current.filter((_, i) => i !== index),
                    );

                    setEditingSongIndex((current) => {
                      if (current === null) return null;
                      if (current === index) return null;
                      return current > index ? current - 1 : current;
                    });
                  }}
                  style={{ padding: spacing.xs }}
                >
                  <Ionicons name="trash-outline" size={22} color={t.warning} />
                </Pressable>
              </View>

              {editingSongIndex === index && (
                <View style={{ gap: spacing.sm }}>
                  <Field
                    label="Song Title"
                    value={editSongTitle}
                    onChangeText={setEditSongTitle}
                    placeholder="Enter song title"
                    autoCapitalize="words"
                  />

                  <Field
                    label="Artist"
                    value={editSongArtist}
                    onChangeText={setEditSongArtist}
                    placeholder="Enter artist"
                    autoCapitalize="words"
                  />

                  <Row spread>
                    <Btn
                      title="Cancel"
                      variant="ghost"
                      onPress={cancelEditingSong}
                    />
                    <Btn
                      title="Save"
                      onPress={saveEditedSong}
                      disabled={
                        !editSongTitle.trim() ||
                        !editSongArtist.trim() ||
                        submitting ||
                        importingPlaylist
                      }
                    />
                  </Row>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
      {!hideRequestComment && (
        <Field
          label="Request Comment (Optional)"
          value={requestComment}
          onChangeText={editing(setRequestComment)}
          placeholder="Why would you like to request this song?"
          autoCapitalize="sentences"
          multiline
        />
      )}
      <ConfirmDialog
        visible={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.message}
        confirmLabel={pendingConfirm?.confirmLabel}
        destructive={false}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onClose={() => setPendingConfirm(null)}
      />
    </Sheet>
  );
};
export const NewMusicRequestSheet = (props: {
  visible: boolean;
  onClose: () => void;
  prefill: MusicRequest | null;
  again?: MusicRequest | null;
  hideRequestComment?: boolean;
  addsDirectly?: boolean;
  onSaved: (message: string) => void;
}) => {
  if (!props.visible) return null;

  return (
    <MusicRequestSheetContent
      key={
        props.prefill?._id ?? (props.again ? `again-${props.again._id}` : "new")
      }
      {...props}
    />
  );
};
const buildGuideSteps = () => [
  {
    icon: "create-outline" as const,
    title: "Submit your request",
    detail:
      "Paste a Spotify or YouTube link to fill in the song, or type the title, artist and link yourself. Add a few songs at once if you like, with an optional comment.",
  },
  {
    icon: "person-outline" as const,
    title: "Praise Manager approval",
    detail:
      "A Praise Manager approves or declines each song. Approved songs join the playlist that can be played at weeklies and events.",
  },
  {
    icon: "list-outline" as const,
    title: "Track it under Mine",
    detail:
      "Each request shows Pending, Approved or Declined (with the reason), and you get a notification when it's reviewed. You can edit or delete a request while it's pending, and request a declined song again.",
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
