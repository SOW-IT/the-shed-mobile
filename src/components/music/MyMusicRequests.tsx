import { Btn, errorMessage, Field, Row, Sheet } from "@/components/ui";
import { confirmAction, showNotice } from "@/lib/notice";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
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

const youtubeVideoUrl = (value: string): string | null => {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();

    let videoId: string | null = null;

    if (host === "youtu.be" || host === "www.youtu.be") {
      videoId = url.pathname.split("/")[1];
    } else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(host)
    ) {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v");
      } else {
        const match = url.pathname.match(
          /^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})/,
        );
        videoId = match?.[1] ?? null;
      }
    }

    return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube.com/watch?v=${videoId}`
      : null;
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

const songLinkKey = (value: string): string =>
  spotifyTrackUrl(value) ?? youtubeVideoUrl(value) ?? value.trim();

const MusicRequestSheetContent = ({
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
  const hideAutofill = prefill?.status === "APPROVED";
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [artist, setArtist] = useState(prefill?.artist ?? "");
  const [link, setLink] = useState(prefill?.link ?? "");
  const [requestComment, setRequestComment] = useState(
    prefill?.requestComment ?? "",
  );
  const [spotifyLink, setSpotifyLink] = useState("");
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(
    prefill?.albumArtUrl ?? null,
  );
  const [isrc, setIsrc] = useState<string | undefined>(
    prefill?.isrc ?? undefined,
  );
  const [fetchingSpotify, setFetchingSpotify] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [manualExpanded, setManualExpanded] = useState(!!prefill);
  const duplicateLink = link.trim()
    ? spotifyTrackUrl(link)
    : spotifyTrackUrl(spotifyLink);
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
  const getSpotifyTrack = useAction(api.spotify.getTrack);
  const importYouTubePlaylist = useAction(api.youtube.importPlaylist);
  const spotifyPlaylist = useSpotifyPlaylist();

  const spotifyLinkType = detectSpotifyLink(spotifyLink);
  const youtubePlaylistLink = youtubePlaylistUrl(spotifyLink);
  const youtubeLink = youtubeVideoUrl(spotifyLink);

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
  };

  const addSong = () => {
    if (!title.trim() || !artist.trim() || !link.trim()) {
      showNotice("Incomplete song", "Enter a title, artist and link.");
      return;
    }
    if (duplicateBlocked || (!!duplicateLink && duplicate === undefined)) {
      showNotice(
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
      showNotice("Already added", "Song is already on your list.");
      return;
    }
    if (songs.length >= 50) {
      showNotice("List full", "You can submit up to 50 songs at once.");
      return;
    }
    if (possibleDuplicate) {
      confirmAction({
        title: "Possible duplicate",
        message: `${duplicate?.title} by ${duplicate?.artist} has already been requested. Add this version anyway?`,
        confirmText: "Add anyway",
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
      showNotice(
        "Incomplete song",
        "Please enter both the song title and artist.",
      );
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
    if (!spotifyPlaylist.connected) {
      showNotice(
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
      showNotice(
        "Playlist imported",
        `${toAdd.length} song(s) added from ${result.name}.${result.limited ? " Only the first 50 playlist entries were fetched." : ""}${fresh.length > available ? " The submission limit is 50 songs." : ""} Existing requests will be skipped when submitted.`,
      );
    } catch (error) {
      const message = errorMessage(error);

      const accessDenied =
        /403|denied access to playlist songs|forbidden/i.test(message);

      const friendlyMessage = accessDenied
        ? "You don't have permission to import this playlist. Please use a Spotify playlist that you own or collaborate on."
        : "We couldn't import this playlist. Please check the Spotify link and try again.";

      showNotice("Couldn't import playlist", friendlyMessage);
    } finally {
      setImportingPlaylist(false);
    }
  };

  const importYouTube = async () => {
    if (importingPlaylist || submitting || prefill) return;

    const playlistUrl = youtubePlaylistUrl(spotifyLink);
    if (!playlistUrl) {
      setSpotifyError("Please enter a valid YouTube playlist URL.");
      return;
    }

    setImportingPlaylist(true);
    setSpotifyError(null);

    try {
      const result = await importYouTubePlaylist({
        link: playlistUrl,
      });

      const existing = new Set(
        songs.map(
          (song) =>
            spotifyTrackUrl(song.link) ??
            youtubeVideoUrl(song.link) ??
            song.link.trim().toLowerCase(),
        ),
      );

      const available = Math.max(0, 50 - songs.length);

      const fresh = result.songs.filter((song) => {
        const key =
          spotifyTrackUrl(song.link) ??
          youtubeVideoUrl(song.link) ??
          song.link.trim().toLowerCase();

        if (existing.has(key)) return false;

        existing.add(key);
        return true;
      });

      const toAdd = fresh.slice(0, available);

      setSongs((current) => [...current, ...toAdd]);

      showNotice(
        "YouTube playlist imported",
        `${toAdd.length} song(s) added.${
          result.limited
            ? " Only the first 50 playlist entries were fetched."
            : ""
        }${
          fresh.length > available ? " The submission limit is 50 songs." : ""
        }`,
      );
    } catch (error) {
      const message =
        errorMessage(error);

      setSpotifyError(message);
      showNotice("Couldn't import playlist", message);
    } finally {
      setImportingPlaylist(false);
    }
  };

  const clearSpotifyLink = () => {
    setSpotifyLink("");
    setSpotifyError(null);
  };
  const autofillSpotify = async () => {
    const cleanUrl = spotifyTrackUrl(spotifyLink);
    if (!cleanUrl) {
      setSpotifyError("Please paste a valid Spotify or YouTube URL. ");
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
        errorMessage(error),
      );
    } finally {
      setFetchingSpotify(false);
    }
  };

  const autofillYouTube = async () => {
    const cleanUrl = youtubeVideoUrl(spotifyLink);

    if (!cleanUrl) {
      setSpotifyError("Please paste a valid YouTube video link.");
      return;
    }

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
        thumbnail_url: string;
      } = await response.json();

      const { title, artist } = parseYouTubeSong(data.title, data.author_name);

      setTitle(title);
      setArtist(artist);
      setLink(cleanUrl);
      setAlbumArtUrl(data.thumbnail_url);
      setIsrc(undefined);
      setManualExpanded(true);
    } catch (error) {
      setSpotifyError(
        errorMessage(error),
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
      showNotice(
        "Songs submitted",
        `${result.added} song(s) submitted; ${result.skipped} duplicate(s) skipped.`,
      );
    } catch (error) {
      showNotice(
        "Couldn't submit",
        errorMessage(error),
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
          showNotice("Incomplete song", "Complete or clear the current song.");
          return;
        }
        if (duplicateBlocked || (!!duplicateLink && duplicate === undefined)) {
          showNotice(
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
          confirmAction({
            title: "Possible duplicate songs",
            message: `${preview.possibleDuplicates} song(s) may already have been requested in a different version. Submit these versions anyway? Exact duplicates will be skipped.`,
            confirmText: "Request anyway",
            onConfirm: () => void submitBatch(all, true),
          });
          return;
        }
        await submitBatch(all, false);
        return;
      } catch (error) {
        showNotice(
          "Couldn't check duplicates",
          errorMessage(error),
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!title.trim()) {
      showNotice("Song title required", "Please enter a song title.");
      return;
    }
    if (!artist.trim()) {
      showNotice("Artist name required", "Please enter an artist name.");
      return;
    }
    if (!link.trim()) {
      showNotice("Link required", "Please enter a song link.");
      return;
    }
    if (duplicateBlocked) {
      showNotice(
        "Song already requested",
        "This Spotify track has already been submitted and cannot be requested again.",
      );
      return;
    }
    if (possibleDuplicate) {
      confirmAction({
        title: "Possible duplicate",
        message: `${duplicate?.title} by ${duplicate?.artist} has already been requested. Request this version anyway?`,
        confirmText: "Request anyway",
        onConfirm: () => void saveSingle(true),
      });
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
      showNotice(
        prefill ? "Song updated" : "Request sent",
        prefill
          ? "Your changes have been saved."
          : "A Praise Manager will review your song request soon.",
      );
    } catch (error: unknown) {
      showNotice(
        prefill ? "Couldn't update song" : "Couldn't send request",
        errorMessage(error),
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
            Paste a Spotify or YouTube song or playlist link.
          </Text>

          <Text style={[typography.caption, { color: t.warning }]}>
            Spotify playlists require access through your connected account.
            Public YouTube playlists can be imported without signing in.
          </Text>

          <View style={{ position: "relative" }}>
            <Field
              label="Music Link"
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
      )}
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
            onChangeText={(value) => {
              // A different song: the autofilled ISRC and artwork no longer apply.
              if (songLinkKey(value) !== songLinkKey(link)) {
                setIsrc(undefined);
                setAlbumArtUrl(null);
              }
              setLink(value);
            }}
            placeholder="Spotify or YouTube link"
            autoCapitalize="none"
            keyboardType="url"
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
                  />

                  <Field
                    label="Artist"
                    value={editSongArtist}
                    onChangeText={setEditSongArtist}
                    placeholder="Enter artist"
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
          onChangeText={setRequestComment}
          placeholder="Why would you like to request this song?"
          multiline
        />
      )}
    </Sheet>
  );
};
export const NewMusicRequestSheet = (props: {
  visible: boolean;
  onClose: () => void;
  prefill: MusicRequest | null;
  hideRequestComment?: boolean;
}) => {
  if (!props.visible) return null;

  return (
    <MusicRequestSheetContent key={props.prefill?._id ?? "new"} {...props} />
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
