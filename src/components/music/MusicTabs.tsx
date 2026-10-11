import { Card, LoadingState } from "@/components/ui";
import { radius, spacing, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
type MusicRequest = Doc<"musicRequests"> & {
  requesterName?: string | null;
  reviewerName?: string | null;
};
const shareLink = async (url: string) => {
  try {
    await Share.share({ message: url });
  } catch (e) {
    // user cancelled or share failed
  }
};
/** Album art saved with the request; icon fallback for manual entries. */
function SongArtwork({ url, size = 46 }: { url?: string; size?: number }) {
  const t = useAppTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={[
        styles.musicArtwork,
        {
          width: size,
          height: size,
          backgroundColor: t.inputBackground,
        },
      ]}
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: radius.md }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Ionicons name="musical-notes-outline" size={21} color={t.faint} />
      )}
    </View>
  );
}

/* Approved Playlist */
type SortOption = "title-asc" | "title-desc" | "artist-asc" | "artist-desc";
const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "title-asc", label: "Song name (A–Z)" },
  { key: "title-desc", label: "Song name (Z–A)" },
  { key: "artist-asc", label: "Artist (A–Z)" },
  { key: "artist-desc", label: "Artist (Z–A)" },
];
export const ApprovedPlaylistTab = () => {
  const t = useAppTheme();
  const approvedList = useQuery(api.musicRequests.approved);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("title-asc");
  const [sortOpen, setSortOpen] = useState(false);
  const visibleSongs = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return [...(approvedList ?? [])]
      .filter((song) =>
        [song.title, song.artist, song.requesterName, song.requesterEmail].some(
          (value) => (value ?? "").toLocaleLowerCase().includes(q),
        ),
      )
      .sort((a, b) => {
        const byArtist = sortBy.startsWith("artist");
        const first = byArtist ? a.artist : a.title;
        const second = byArtist ? b.artist : b.title;
        const order = (first ?? "").localeCompare(second ?? "", undefined, {
          sensitivity: "base",
        });
        return sortBy.endsWith("desc") ? -order : order;
      });
  }, [approvedList, search, sortBy]);
  return (
    <View style={styles.section}>
      <View style={styles.musicSearchRow}>
        <View
          style={[
            styles.search,
            styles.musicSearchField,
            { backgroundColor: t.inputBackground },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={t.faint} />
          <TextInput
            style={[styles.searchInput, { color: t.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search songs or artists"
            placeholderTextColor={t.faint}
            accessibilityLabel="Search approved songs"
          />
          {!!search && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setSearch("")}
            >
              <Ionicons name="close-circle" size={19} color={t.faint} />
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sort approved songs"
          accessibilityState={{ expanded: sortOpen }}
          onPress={() => setSortOpen((value) => !value)}
          style={[styles.sortButton, { backgroundColor: t.inputBackground }]}
        >
          <Ionicons name="options-outline" size={21} color={t.text} />
        </Pressable>
      </View>
      {sortOpen && (
        <View style={[styles.sortMenu, { backgroundColor: t.inputBackground }]}>
          <Text style={[styles.sortHeading, { color: t.text }]}>Sort by</Text>
          {SORT_OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: sortBy === option.key }}
              onPress={() => {
                setSortBy(option.key);
                setSortOpen(false);
              }}
              style={styles.sortOption}
            >
              <Text style={{ color: t.text, flex: 1 }}>{option.label}</Text>
              {sortBy === option.key && (
                <Ionicons name="checkmark" size={18} color={t.success} />
              )}
            </Pressable>
          ))}
        </View>
      )}
      {approvedList === undefined ? (
        <LoadingState />
      ) : (
        <>
          <View style={styles.musicMetaRow}>
            <Text style={{ color: t.faint, fontSize: 12 }}>
              {visibleSongs.length} SONGS
            </Text>
            <Text style={{ color: t.faint, fontSize: 12 }}>
              {SORT_OPTIONS.find((option) => option.key === sortBy)?.label}
            </Text>
          </View>
          {visibleSongs.length === 0 ? (
            <Text style={{ color: t.faint }}>
              {search.trim() ? "No matching songs." : "No songs approved yet."}
            </Text>
          ) : (
            <FlatList
              data={visibleSongs}
              scrollEnabled={false}
              keyExtractor={(song) => song._id}
              ItemSeparatorComponent={() => (
                <View
                  style={[
                    styles.musicDivider,
                    { backgroundColor: t.inputBackground },
                  ]}
                />
              )}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title} by ${item.artist}`}
                  onPress={() => item.link && Linking.openURL(item.link)}
                  onLongPress={() => item.link && shareLink(item.link)}
                  style={({ pressed }) => [
                    styles.musicSongRow,
                    pressed && { opacity: 0.65 },
                  ]}
                >
                  <SongArtwork url={item.albumArtUrl} />
                  <View style={styles.musicSongDetails}>
                    <Text
                      numberOfLines={2}
                      style={[styles.musicSongTitle, { color: t.text }]}
                    >
                      {item.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ color: t.faint, fontSize: 13 }}
                    >
                      {item.artist}
                    </Text>
                  </View>
                  {item.link ? (
                    <Ionicons name="open-outline" size={19} color={t.faint} />
                  ) : null}
                </Pressable>
              )}
            />
          )}
        </>
      )}
    </View>
  );
};
/* My Requests*/
const cardBorderStyle = (
  status: MusicRequest["status"],
  t: ReturnType<typeof useAppTheme>,
): { borderWidth?: number; borderColor?: string } => {
  if (status === "APPROVED")
    return { borderWidth: 1.5, borderColor: t.success };
  if (status === "DECLINED") return { borderWidth: 1.5, borderColor: t.danger };
  if (status === "PENDING")
    return { borderWidth: 1.5, borderColor: t.chip.default.fg };
  return {};
};
export const MyRequestsTab = () => {
  const t = useAppTheme();
  const myRequests = useQuery(api.musicRequests.myRequests);
  const me = useQuery(api.directory.me);
  if (me === undefined || myRequests === undefined) {
    return <LoadingState />;
  }
  const statusChip = (
    status: MusicRequest["status"],
    t: ReturnType<typeof useAppTheme>,
  ): { bg: string; fg: string } => {
    if (status === "APPROVED") return t.chip.PAID;
    if (status === "DECLINED") return t.chip.DECLINED;
    return t.chip.default; // AWAITING …
  };
  function MyRequestCard({ request }: { request: MusicRequest }) {
    const t = useAppTheme();
    const chip = statusChip(request.status, t);
    const [bodyHeight, setBodyHeight] = useState(0);
    return (
      <Card style={cardBorderStyle(request.status, t)}>
        <View style={styles.topRow}>
          <View
            style={[
              styles.topSide,
              { flexDirection: "row", alignItems: "center", gap: spacing.sm },
            ]}
          >
            <SongArtwork url={request.albumArtUrl} size={54} />
            <Text style={[styles.cardTitle, { color: t.text, flex: 1 }]}>
              {request.title}
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: chip.bg }]}>
            <Text
              numberOfLines={1}
              style={[styles.statusPillText, { color: chip.fg }]}
            >
              {request.status}
            </Text>
          </View>
        </View>
        <View
          style={styles.bodyMeasure}
          onLayout={(e) => setBodyHeight(e.nativeEvent.layout.height)}
        >
          <Text style={[{ color: t.text }]}>{request.artist}</Text>
          <Text>
            <Text style={{ color: t.text, fontWeight: "bold" }}>
              Requested by{" "}
            </Text>
            <Text style={{ color: t.text }}>
              {request.requesterName ?? request.requesterEmail}
            </Text>
          </Text>
          {request.status != "PENDING" && (
            <Text>
              <Text style={{ color: t.text, fontWeight: "bold" }}>
                Reviewed by{" "}
              </Text>
              <Text style={{ color: t.text }}>
                {request.reviewerName ?? request.reviewedByEmail}
              </Text>
            </Text>
          )}
          {request.status === "DECLINED" && !!request.declineComment && (
            <Text>
              <Text style={{ color: t.text, fontWeight: "bold" }}>
                Decline Reason:{" "}
              </Text>
              <Text style={{ color: t.text }}>{request.declineComment}</Text>
            </Text>
          )}
          <Pressable
            onPress={() => Linking.openURL(request.link!)}
            onLongPress={() => shareLink(request.link!)}
          >
            <Text style={{ color: "#007AFF", marginTop: 2 }} numberOfLines={1}>
              Open Link
            </Text>
          </Pressable>
        </View>
      </Card>
    );
  }
  return (
    <View style={styles.section}>
      {myRequests.length === 0 ? (
        <Text style={{ color: t.faint }}>
          You haven't requested any songs yet.
        </Text>
      ) : (
        <FlatList
          data={myRequests}
          scrollEnabled={false}
          keyExtractor={(r) => r._id}
          renderItem={({ item }) => <MyRequestCard request={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
};
/* To Review*/
export const ToReviewTab = () => {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  // const isChaplain = !!me?.isChaplain; TODO
  const isChaplain = true; // TODO: remove this line when chaplain check is implemented
  const toReview = useQuery(
    api.musicRequests.toReview,
    isChaplain ? {} : "skip",
  );
  return (
    <View style={styles.section}>
      {toReview === undefined ? (
        <LoadingState />
      ) : toReview.length === 0 ? (
        <Text style={{ color: t.faint }}>Nothing pending. 🎶</Text>
      ) : (
        <FlatList
          data={toReview}
          scrollEnabled={false}
          keyExtractor={(r) => r._id}
          renderItem={({ item }) => <ReviewCard request={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
};
function ReviewCard({ request }: { request: MusicRequest }) {
  const t = useAppTheme();
  const approve = useMutation(api.musicRequests.approve);
  const decline = useMutation(api.musicRequests.decline);
  const [busy, setBusy] = useState(false);
  const onApprove = async () => {
    setBusy(true);
    try {
      await approve({ requestId: request._id as Id<"musicRequests"> });
    } catch (e: any) {
      Alert.alert("Couldn't approve", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const runDecline = async (reason?: string) => {
    setBusy(true);
    try {
      await decline({
        requestId: request._id as Id<"musicRequests">,
        reason: reason || undefined,
      });
    } catch (e: any) {
      Alert.alert("Couldn't decline", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const onDecline = () => {
    // Alert for the web version
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      const confirmed = window.confirm(`Decline "${request.title}"?`);
      if (!confirmed) return;
      const reason = window.prompt("Reason for declining:") ?? undefined;
      void runDecline(reason || undefined);
      return;
    }
    // Alert.prompt for the ios
    const promptFn = (Alert as { prompt?: (...args: any[]) => void }).prompt;
    if (typeof promptFn === "function") {
      promptFn(
        "Decline request",
        "Optional reason for declining:",
        (reason?: string) => runDecline(reason),
      );
      return;
    }
    // Android fallback: a plain confirm, no reason field.
    Alert.alert("Decline request?", request.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => runDecline() },
    ]);
  };
  return (
    <Card style={cardBorderStyle(request.status, t)}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
      >
        <SongArtwork url={request.albumArtUrl} size={58} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.cardTitle, { color: t.text }]}>
            {request.title}
          </Text>
          <Text style={{ color: t.text }}>{request.artist}</Text>
        </View>
      </View>
      <Text style={{ color: t.text, marginTop: 2 }}>
        Requested by {request.requesterName ?? request.requesterEmail}
      </Text>
      <Pressable
        onPress={() => Linking.openURL(request.link!)}
        onLongPress={() => shareLink(request.link!)}
      >
        <Text style={{ color: "#007AFF", marginTop: 2 }} numberOfLines={1}>
          Open Link
        </Text>
      </Pressable>
      <View style={styles.actionsRow}>
        <Pressable
          onPress={onApprove}
          disabled={busy}
          style={[styles.smallButton, { backgroundColor: t.success }]}
        >
          <Ionicons name="checkmark" size={16} color="#fff" />
          <Text style={styles.smallButtonText}>Approve</Text>
        </Pressable>
        <Pressable
          onPress={onDecline}
          disabled={busy}
          style={[styles.smallButton, { backgroundColor: t.danger }]}
        >
          <Ionicons name="close" size={16} color="#fff" />
          <Text style={styles.smallButtonText}>Decline</Text>
        </Pressable>
      </View>
    </Card>
  );
}
const styles = StyleSheet.create({
  musicSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  musicSearchField: { flex: 1, marginTop: 0, marginBottom: 0 },
  sortButton: {
    height: 44,
    width: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sortMenu: { borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  sortHeading: { fontWeight: "700", padding: spacing.sm },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    minHeight: 42,
  },
  musicMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  musicSongRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 9,
  },
  musicArtwork: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  musicSongDetails: { flex: 1, gap: 3 },
  musicSongTitle: { fontSize: 14, fontWeight: "600" },
  musicDivider: { height: StyleSheet.hairlineWidth },
  container: { padding: 16, gap: 16 },
  heading: { fontSize: 28, fontWeight: "800" },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  card: { borderRadius: 12, padding: 14, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  button: {
    marginTop: 12,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  smallButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topSide: { flex: 1 },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "60%",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  bodyMeasure: { gap: spacing.sm + 2, paddingTop: spacing.sm + 2 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15 },
  searchClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});
