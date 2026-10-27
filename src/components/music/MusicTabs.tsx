import { MusicActionsMenu } from "@/components/music/MusicActionMenu";
import {
  usePagerFooterClearance,
  usePagerTopBarInset,
} from "@/components/PagerScreen";
import { Card, LoadingState } from "@/components/ui";
import { radius, spacing, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

export type MusicRowActions = {
  onEditRequest?: (request: Doc<"musicRequests">) => void;
  onDeleteRequest?: (request: Doc<"musicRequests">) => void;
};

type MusicRequest = Doc<"musicRequests"> & {
  requesterName?: string | null;
  reviewerName?: string | null;
};

const shareLink = async (url: string) => {
  try {
    await Share.share({ message: url });
  } catch {
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

export const ApprovedPlaylistTab = ({
  onEditRequest,
  onDeleteRequest,
}: MusicRowActions = {}) => {
  const t = useAppTheme();
  const topInset = usePagerTopBarInset();
  const footerClearance = usePagerFooterClearance();
  const { isAuthenticated, isLoading } = useConvexAuth();

  const approvedList = useQuery(
    api.musicRequests.approved,
    !isLoading && isAuthenticated ? {} : "skip",
  );

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
    <View style={{ flex: 1, backgroundColor: t.background }}>
      {/* FIXED SEARCH AND SORT */}
      <View
        style={{
          paddingTop: topInset + spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          gap: spacing.sm,
        }}
      >
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
          <View
            style={[styles.sortMenu, { backgroundColor: t.inputBackground }]}
          >
            <Text style={[styles.sortHeading, { color: t.text }]}>Sort by</Text>

            {SORT_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: sortBy === option.key,
                }}
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
      </View>

      {/* SCROLLABLE SONG LIST */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: footerClearance,
          gap: spacing.md,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
                {search.trim()
                  ? "No matching songs."
                  : "No songs approved yet."}
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
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${item.title} by ${item.artist}`}
                      onPress={() => item.link && Linking.openURL(item.link)}
                      onLongPress={() => item.link && shareLink(item.link)}
                      style={({ pressed }) => [
                        styles.musicSongRow,
                        { flex: 1 },
                        pressed && { opacity: 0.65 },
                      ]}
                    >
                      <SongArtwork
                        key={item.albumArtUrl ?? "no-artwork"}
                        url={item.albumArtUrl}
                      />

                      <View style={styles.musicSongDetails}>
                        <Text
                          numberOfLines={2}
                          style={[styles.musicSongTitle, { color: t.text }]}
                        >
                          {item.title}
                        </Text>

                        <Text
                          numberOfLines={1}
                          style={{
                            color: t.faint,
                            fontSize: 13,
                          }}
                        >
                          {item.artist}
                        </Text>
                      </View>

                      {item.link ? (
                        <Ionicons
                          name="open-outline"
                          size={19}
                          color={t.faint}
                        />
                      ) : null}
                    </Pressable>

                    {(onEditRequest || onDeleteRequest) && (
                      <MusicActionsMenu
                        onEdit={() => onEditRequest?.(item)}
                        onDelete={() => onDeleteRequest?.(item)}
                      />
                    )}
                  </View>
                )}
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

/* Shared request UI */
type RequestFilter = "ALL" | "PENDING" | "APPROVED" | "DECLINED";
const formatDate = (timestamp?: number) =>
  timestamp
    ? new Date(timestamp).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

function FilterChips({
  value,
  onChange,
  options,
}: {
  value: RequestFilter;
  onChange: (value: RequestFilter) => void;
  options: RequestFilter[];
}) {
  const t = useAppTheme();
  return (
    <View style={styles.filterRow}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[
              styles.filterChip,
              { backgroundColor: selected ? t.primary : t.inputBackground },
            ]}
          >
            <Text
              style={[styles.filterText, { color: selected ? "#fff" : t.text }]}
            >
              {option === "ALL"
                ? "All"
                : option[0] + option.slice(1).toLowerCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusPill({ status }: { status: MusicRequest["status"] }) {
  const t = useAppTheme();
  const chip =
    status === "APPROVED"
      ? t.chip.PAID
      : status === "DECLINED"
        ? t.chip.DECLINED
        : t.chip.default;
  const icon =
    status === "APPROVED"
      ? "checkmark-circle"
      : status === "DECLINED"
        ? "close-circle"
        : "time-outline";
  return (
    <View style={[styles.newStatusPill, { backgroundColor: chip.bg }]}>
      <Ionicons name={icon} size={13} color={chip.fg} />
      <Text style={[styles.newStatusText, { color: chip.fg }]}>
        {status === "PENDING"
          ? "Pending"
          : status === "APPROVED"
            ? "Approved"
            : "Declined"}
      </Text>
    </View>
  );
}

function SongHeader({
  request,
  status = false,
}: {
  request: MusicRequest;
  status?: boolean;
}) {
  const t = useAppTheme();
  return (
    <View style={styles.requestHeader}>
      <SongArtwork
        key={request.albumArtUrl ?? "no-artwork"}
        url={request.albumArtUrl}
        size={66}
      />
      <View style={styles.requestHeadingText}>
        <Text
          style={[styles.requestSongTitle, { color: t.text }]}
          numberOfLines={2}
        >
          {request.title}
        </Text>
        <Text style={{ color: t.faint, fontSize: 13 }} numberOfLines={2}>
          {request.artist}
        </Text>
      </View>
      {status ? <StatusPill status={request.status} /> : null}
    </View>
  );
}
function DetailLine({
  icon,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  const t = useAppTheme();
  return (
    <View style={styles.detailLine}>
      <Ionicons name={icon} size={15} color={t.faint} />
      <Text style={{ color: t.faint, fontSize: 13, flex: 1 }}>{children}</Text>
    </View>
  );
}
function SongLink({ link }: { link: string }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(link)}
      onLongPress={() => void shareLink(link)}
      style={styles.songLink}
    >
      <Ionicons name="open-outline" size={15} color={t.primary} />
      <Text style={{ color: t.primary, fontSize: 13, fontWeight: "700" }}>
        Open song
      </Text>
    </Pressable>
  );
}
/* My Requests */
export const MyRequestsTab = ({
  onEditRequest,
  onDeleteRequest,
}: MusicRowActions = {}) => {
  const t = useAppTheme();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const myRequests = useQuery(
    api.musicRequests.myRequests,
    !isLoading && isAuthenticated ? {} : "skip",
  );
  const [filter, setFilter] = useState<RequestFilter>("ALL");
  const visible = useMemo(
    () =>
      (myRequests ?? []).filter(
        (request) => filter === "ALL" || request.status === filter,
      ),
    [myRequests, filter],
  );
  return (
    <View style={styles.section}>
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={["ALL", "PENDING", "APPROVED", "DECLINED"]}
      />
      {myRequests === undefined ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <Text style={{ color: t.faint, paddingVertical: spacing.md }}>
          {filter === "ALL"
            ? "You haven't requested any songs yet."
            : `No ${filter.toLowerCase()} requests.`}
        </Text>
      ) : (
        <FlatList
          data={visible}
          scrollEnabled={false}
          keyExtractor={(item) => item._id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <MyRequestCard
              request={item}
              actions={
                item.status === "PENDING" &&
                (onEditRequest || onDeleteRequest) ? (
                  <MusicActionsMenu
                    onEdit={() => onEditRequest?.(item)}
                    onDelete={() => onDeleteRequest?.(item)}
                  />
                ) : undefined
              }
            />
          )}
        />
      )}
    </View>
  );
};
function MyRequestCard({
  request,
  actions,
}: {
  request: MusicRequest;
  actions?: ReactNode;
}) {
  const t = useAppTheme();
  const date =
    request.status === "PENDING" ? request._creationTime : request.reviewedTime;
  return (
    <Card>
      <View style={styles.requestCardContent}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <SongHeader request={request} status />
          </View>
          {actions}
        </View>
        <DetailLine icon="calendar-outline">
          {request.status === "PENDING"
            ? "Requested"
            : request.status === "APPROVED"
              ? "Approved"
              : "Declined"}{" "}
          {formatDate(date)}
        </DetailLine>
        {request.status !== "PENDING" && request.reviewedByEmail ? (
          <DetailLine icon="person-outline">
            Reviewed by {request.reviewerName ?? request.reviewedByEmail}
          </DetailLine>
        ) : null}
        {request.requestComment?.trim() ? (
          <View
            style={{
              gap: 5,
              marginTop: spacing.sm,
            }}
          >
            <Text
              style={{
                color: t.faint,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.6,
              }}
            >
              REQUEST NOTE
            </Text>
            <Text
              style={{
                color: t.text,
                fontSize: 14,
                lineHeight: 21,
              }}
            >
              {request.requestComment}
            </Text>
          </View>
        ) : null}
        {request.status === "DECLINED" && request.declineComment ? (
          <View
            style={[styles.commentBox, { backgroundColor: t.inputBackground }]}
          >
            <Text style={{ color: t.danger, fontSize: 12, fontWeight: "700" }}>
              Decline reason
            </Text>
            <Text style={{ color: t.text, fontSize: 13 }}>
              {request.declineComment}
            </Text>
          </View>
        ) : null}
        {!!request.link && <SongLink link={request.link} />}
      </View>
    </Card>
  );
}
/* To Review */
export const ToReviewTab = ({
  onEditRequest,
  onDeleteRequest,
}: MusicRowActions = {}) => {
  const t = useAppTheme();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [filter, setFilter] = useState<RequestFilter>("PENDING");
  // Backend query and mutations enforce Praise Manager access.
  const toReview = useQuery(
    api.musicRequests.toReview,
    !isLoading && isAuthenticated ? {} : "skip",
  );
  const declinedRequests = useQuery(
    api.musicRequests.declined,
    !isLoading && isAuthenticated && filter === "DECLINED" ? {} : "skip",
  );

  const showingPending = filter === "PENDING";
  const visibleRequests = showingPending ? toReview : declinedRequests;

  return (
    <View style={styles.section}>
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={["PENDING", "DECLINED"]}
      />

      <View style={styles.requestSectionHeading}>
        <Text style={{ color: t.faint, fontSize: 13 }}>
          {visibleRequests
            ? `${visibleRequests.length} ${
                showingPending ? "pending" : "declined"
              } song ${visibleRequests.length === 1 ? "request" : "requests"}`
            : "Loading requests..."}
        </Text>
      </View>

      {visibleRequests === undefined ? (
        <LoadingState />
      ) : visibleRequests.length === 0 ? (
        <View
          style={[styles.emptyReview, { backgroundColor: t.inputBackground }]}
        >
          <Ionicons
            name={
              showingPending
                ? "checkmark-circle-outline"
                : "close-circle-outline"
            }
            size={32}
            color={showingPending ? t.success : t.faint}
          />

          <Text style={{ color: t.text, fontWeight: "700" }}>
            {showingPending ? "You're all caught up!" : "No declined requests"}
          </Text>

          <Text style={{ color: t.faint, fontSize: 13 }}>
            {showingPending
              ? "No requests need reviewing."
              : "Previously declined songs will appear here."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleRequests}
          scrollEnabled={false}
          keyExtractor={(item) => item._id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) =>
            showingPending ? (
              <ReviewCard
                request={item}
                actions={
                  onEditRequest || onDeleteRequest ? (
                    <MusicActionsMenu
                      onEdit={() => onEditRequest?.(item)}
                      onDelete={() => onDeleteRequest?.(item)}
                    />
                  ) : undefined
                }
              />
            ) : (
              <MyRequestCard request={item} />
            )
          }
        />
      )}
    </View>
  );
};

function ReviewCard({
  request,
  actions,
}: {
  request: MusicRequest;
  actions?: ReactNode;
}) {
  const t = useAppTheme();
  const approve = useMutation(api.musicRequests.approve);
  const decline = useMutation(api.musicRequests.decline);
  const [busy, setBusy] = useState(false);
  const onApprove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await approve({ requestId: request._id });
    } catch (error) {
      Alert.alert(
        "Couldn't approve",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const runDecline = async (reason?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await decline({
        requestId: request._id,
        reason: reason?.trim() || undefined,
      });
    } catch (error) {
      Alert.alert(
        "Couldn't decline",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const onDecline = () => {
    if (busy) return;
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      if (!window.confirm(`Decline "${request.title}"?`)) return;
      const reason = window.prompt("(Optional) Reason for declining:");
      if (reason === null) return;
      void runDecline(reason);
      return;
    }
    if (Platform.OS === "ios") {
      Alert.prompt("Decline request", "(Optional) Reason for declining:", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: (reason?: string) => {
            void runDecline(reason);
          },
        },
      ]);
      return;
    }
    Alert.alert("Decline request?", request.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: () => void runDecline(),
      },
    ]);
  };
  return (
    <Card>
      <View style={styles.requestCardContent}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <SongHeader request={request} />
          </View>
          {actions}
        </View>
        <DetailLine icon="person-outline">
          Requested by {request.requesterName ?? request.requesterEmail}
        </DetailLine>
        <DetailLine icon="calendar-outline">
          {formatDate(request._creationTime)}
        </DetailLine>
        {request.requestComment?.trim() ? (
          <View
            style={{
              gap: 5,
              marginTop: spacing.sm,
            }}
          >
            <Text
              style={{
                color: t.faint,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.6,
              }}
            >
              REQUEST NOTE
            </Text>
            <Text
              style={{
                color: t.text,
                fontSize: 14,
                lineHeight: 21,
              }}
            >
              {request.requestComment}
            </Text>
          </View>
        ) : null}
        {!!request.link && <SongLink link={request.link} />}
        <View style={styles.reviewActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Approve ${request.title}`}
            disabled={busy}
            onPress={() => void onApprove()}
            style={[
              styles.reviewActionButton,
              { backgroundColor: t.success, opacity: busy ? 0.5 : 1 },
            ]}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.reviewActionText}>Approve</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decline ${request.title}`}
            disabled={busy}
            onPress={onDecline}
            style={[
              styles.reviewActionButton,
              { backgroundColor: t.danger, opacity: busy ? 0.5 : 1 },
            ]}
          >
            <Ionicons name="close" size={18} color="#fff" />
            <Text style={styles.reviewActionText}>Decline</Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}
const styles = StyleSheet.create({
  requestSectionHeading: { gap: 4, marginBottom: 4 },
  requestSectionTitle: { fontSize: 20, fontWeight: "800" },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 8,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: radius.full,
  },
  filterText: { fontSize: 12, fontWeight: "700" },
  requestCardContent: { gap: 12 },
  requestHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  requestHeadingText: { flex: 1, gap: 4, minWidth: 0 },
  requestSongTitle: { fontSize: 15, fontWeight: "800" },
  newStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  newStatusText: { fontSize: 10, fontWeight: "800" },
  detailLine: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  commentBox: { padding: 12, borderRadius: radius.md, gap: 6 },
  songLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 3,
  },
  reviewActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  reviewActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  reviewActionText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  emptyReview: {
    alignItems: "center",
    gap: 8,
    padding: 28,
    borderRadius: radius.lg,
  },
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
