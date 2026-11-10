import { MusicActionsMenu } from "@/components/music/MusicActionMenu";
import {
  usePagerFooterClearance,
  usePagerTopBarInset,
} from "@/components/PagerScreen";
import {
  Btn,
  Card,
  ErrorBanner,
  errorMessage,
  Field,
  LoadingState,
  Muted,
  Sheet,
} from "@/components/ui";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { releaseDateLabel, songServiceLabel } from "@shared/praiseList";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { openExternalLink } from "@/lib/openExternalLink";
import { radius, spacing, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { MutableRefObject, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
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
type SortOption =
  | "title-asc"
  | "title-desc"
  | "artist-asc"
  | "artist-desc"
  | "approved-desc"
  | "release-desc";
const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "title-asc", label: "Song name (A–Z)" },
  { key: "title-desc", label: "Song name (Z–A)" },
  { key: "artist-asc", label: "Artist (A–Z)" },
  { key: "artist-desc", label: "Artist (Z–A)" },
  { key: "approved-desc", label: "Recently approved" },
  { key: "release-desc", label: "Release date (newest)" },
];

const PAGE_SIZE = 15;
const LOAD_AHEAD = 600;

export const ApprovedPlaylistTab = ({
  onEditRequest,
  onDeleteRequest,
}: MusicRowActions = {}) => {
  const t = useAppTheme();
  const topInset = usePagerTopBarInset();
  const footerClearance = usePagerFooterClearance();
  const { isAuthenticated, isLoading } = useConvexAuth();

  const [search, setSearch] = useState("");
  const searching = useDebouncedValue(search.trim(), 300);
  const [sortBy, setSortBy] = useState<SortOption>("title-asc");
  const [sortOpen, setSortOpen] = useState(false);
  const [details, setDetails] = useState<MusicRequest | null>(null);
  const ready = !isLoading && isAuthenticated;

  const songs = usePagedQuery(api.musicRequests.approvedPage, {
    args: (cursor) =>
      ready
        ? {
            paginationOpts: { numItems: PAGE_SIZE, cursor },
            sort: sortBy,
            ...(searching ? { search: searching } : {}),
          }
        : "skip",
    scopeKey: `${sortBy}|${searching}`,
    rowsOf: (result) => result.page,
    keyOf: (row) => row._id,
    keepRowsWhileLoading: true,
  });
  const [viewportHeight, setViewportHeight] = useState(0);
  const loadAheadOf = (contentHeight: number, scrolled: number) => {
    if (contentHeight - (scrolled + viewportHeight) < LOAD_AHEAD) songs.loadMore();
  };

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
        scrollEventThrottle={100}
        onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
        onScroll={(e) =>
          loadAheadOf(e.nativeEvent.contentSize.height, e.nativeEvent.contentOffset.y)
        }
        onContentSizeChange={(_width, height) => {
          if (viewportHeight > 0 && height <= viewportHeight) songs.loadMore();
        }}
      >
        {songs.loadingFirstPage ? (
          <LoadingState />
        ) : (
          <>
            <View style={styles.musicMetaRow}>
              <Text style={{ color: t.faint, fontSize: 12 }}>
                {searching
                  ? "BEST MATCHES"
                  : SORT_OPTIONS.find((option) => option.key === sortBy)?.label.toUpperCase()}
              </Text>
            </View>

            {songs.rows.length === 0 ? (
              <Text style={{ color: t.faint }}>
                {searching
                  ? "No matching songs."
                  : "No songs approved yet."}
              </Text>
            ) : (
              <FlatList
                data={songs.rows}
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
                      accessibilityLabel={`${item.title} by ${item.artist}, details`}
                      onPress={() => setDetails(item)}
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

                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={t.faint}
                      />
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
            {songs.loadingMore ? <LoadingState /> : null}
          </>
        )}
      </ScrollView>
      <SongDetailsSheet request={details} onClose={() => setDetails(null)} />
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
      onPress={() => void openExternalLink(link)}
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

const formatMoment = (timestamp?: number) =>
  timestamp
    ? new Date(timestamp).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

function TrailStep({
  icon,
  title,
  when,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  when?: string;
}) {
  const t = useAppTheme();
  return (
    <View style={styles.trailStep}>
      <Ionicons name={icon} size={18} color={t.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: "600" }}>
          {title}
        </Text>
        {when ? (
          <Text style={{ color: t.faint, fontSize: 12 }}>{when}</Text>
        ) : null}
      </View>
    </View>
  );
}

function SongDetailsSheet({
  request,
  onClose,
}: {
  request: MusicRequest | null;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const [last, setLast] = useState<MusicRequest | null>(request);
  if (request && request !== last) setLast(request);
  const song = request ?? last;
  const requester = song ? (song.requesterName ?? song.requesterEmail) : "";
  const reviewer = song?.reviewedByEmail
    ? (song.reviewerName ?? song.reviewedByEmail)
    : null;
  const addedDirectly =
    !!song &&
    song.status === "APPROVED" &&
    song.reviewedByEmail?.toLowerCase() === song.requesterEmail.toLowerCase();
  const released = releaseDateLabel(song?.releaseDate);
  return (
    <Sheet
      visible={request !== null}
      onClose={onClose}
      title="Song details"
      footer={
        song?.link ? (
          <View style={{ gap: spacing.sm }}>
            <Btn
              title={songServiceLabel(song.link)}
              icon="open-outline"
              onPress={() => void openExternalLink(song.link)}
            />
            <Btn
              title="Share link"
              icon="share-outline"
              variant="ghost"
              onPress={() => void shareLink(song.link)}
            />
          </View>
        ) : undefined
      }
    >
      {song ? (
        <View style={{ gap: spacing.md }}>
          <SongHeader request={song} status />
          {released ? (
            <DetailLine icon="disc-outline">Released {released}</DetailLine>
          ) : null}
          <View style={{ gap: spacing.sm }}>
            <Text style={[styles.noteLabel, { color: t.faint }]}>HISTORY</Text>
            <TrailStep
              icon="add-circle-outline"
              title={
                addedDirectly
                  ? `Added to the list by ${requester}`
                  : `Suggested by ${requester}`
              }
              when={formatMoment(song._creationTime)}
            />
            {song.status === "PENDING" ? (
              <TrailStep icon="time-outline" title="Waiting for a Praise Manager" />
            ) : null}
            {song.status !== "PENDING" && !addedDirectly ? (
              <TrailStep
                icon={
                  song.status === "APPROVED"
                    ? "checkmark-circle-outline"
                    : "close-circle-outline"
                }
                title={`${song.status === "APPROVED" ? "Approved" : "Declined"}${
                  reviewer ? ` by ${reviewer}` : ""
                }`}
                when={formatMoment(song.reviewedTime)}
              />
            ) : null}
          </View>
          {song.requestComment?.trim() ? (
            <View style={{ gap: 5 }}>
              <Text style={[styles.noteLabel, { color: t.faint }]}>
                REQUEST NOTE
              </Text>
              <Text style={{ color: t.text, fontSize: 14, lineHeight: 21 }}>
                {song.requestComment}
              </Text>
            </View>
          ) : null}
          {song.status === "DECLINED" && song.declineComment ? (
            <View
              style={[styles.commentBox, { backgroundColor: t.inputBackground }]}
            >
              <Text style={{ color: t.danger, fontSize: 12, fontWeight: "700" }}>
                Decline reason
              </Text>
              <Text style={{ color: t.text, fontSize: 13 }}>
                {song.declineComment}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}
/* My Requests */
function PraiseManagersLine({
  managers,
}: {
  managers: { email: string; name: string }[] | null | undefined;
}) {
  const t = useAppTheme();
  if (!managers) return null;
  return (
    <View style={[styles.managersBox, { backgroundColor: t.inputBackground }]}>
      <Ionicons name="people-outline" size={18} color={t.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 13, fontWeight: "700" }}>
          Praise Managers
        </Text>
        <Text style={{ color: t.faint, fontSize: 13 }}>
          {managers.length
            ? `${managers.map((manager) => manager.name).join(", ")} review your requests.`
            : "There are no Praise Managers this year yet, so requests wait until an admin chooses one."}
        </Text>
      </View>
    </View>
  );
}

export const MyRequestsTab = ({
  onEditRequest,
  onDeleteRequest,
  onRequestAgain,
  loadMoreRef,
}: MusicRowActions & {
  onRequestAgain?: (request: Doc<"musicRequests">) => void;
  loadMoreRef?: MutableRefObject<(() => void) | null>;
} = {}) => {
  const t = useAppTheme();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ready = !isLoading && isAuthenticated;
  const [filter, setFilter] = useState<RequestFilter>("ALL");
  const [details, setDetails] = useState<MusicRequest | null>(null);
  const managers = useQuery(api.musicRequests.praiseManagers, ready ? {} : "skip");
  const mine = usePagedQuery(api.musicRequests.myRequestsPage, {
    args: (cursor) =>
      ready
        ? {
            paginationOpts: { numItems: PAGE_SIZE, cursor },
            ...(filter === "ALL" ? {} : { status: filter }),
          }
        : "skip",
    scopeKey: filter,
    rowsOf: (result) => result.page,
    keyOf: (row) => row._id,
    loadMoreRef,
    keepRowsWhileLoading: true,
  });
  return (
    <View style={styles.section}>
      <PraiseManagersLine managers={managers} />
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={["ALL", "PENDING", "APPROVED", "DECLINED"]}
      />
      {mine.loadingFirstPage ? (
        <LoadingState />
      ) : mine.rows.length === 0 ? (
        <Text style={{ color: t.faint, paddingVertical: spacing.md }}>
          {filter === "ALL"
            ? "You haven't requested any songs yet."
            : `No ${filter.toLowerCase()} requests.`}
        </Text>
      ) : (
        <FlatList
          data={mine.rows}
          scrollEnabled={false}
          keyExtractor={(item) => item._id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <MyRequestCard
              request={item}
              onPress={() => setDetails(item)}
              actions={
                item.status === "PENDING" &&
                (onEditRequest || onDeleteRequest) ? (
                  <MusicActionsMenu
                    onEdit={() => onEditRequest?.(item)}
                    onDelete={() => onDeleteRequest?.(item)}
                  />
                ) : undefined
              }
              footer={
                item.status === "DECLINED" && onRequestAgain ? (
                  <View style={{ alignItems: "flex-start" }}>
                    <Btn
                      title="Request again"
                      icon="refresh-outline"
                      variant="tonal"
                      onPress={() => onRequestAgain(item)}
                    />
                  </View>
                ) : undefined
              }
            />
          )}
        />
      )}
      {mine.loadingMore ? <LoadingState /> : null}
      <SongDetailsSheet request={details} onClose={() => setDetails(null)} />
    </View>
  );
};
function MyRequestCard({
  request,
  actions,
  footer,
  showRequester = false,
  onPress,
}: {
  request: MusicRequest;
  actions?: ReactNode;
  footer?: ReactNode;
  showRequester?: boolean;
  onPress?: () => void;
}) {
  const t = useAppTheme();
  const date =
    request.status === "PENDING" ? request._creationTime : request.reviewedTime;
  return (
    <Card>
      <View style={styles.requestCardContent}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <SongCardPress request={request} onPress={onPress}>
              <SongHeader request={request} status />
            </SongCardPress>
          </View>
          {actions}
        </View>
        {showRequester ? (
          <DetailLine icon="person-outline">
            Requested by {request.requesterName ?? request.requesterEmail}
          </DetailLine>
        ) : null}
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
            {request.status === "APPROVED" ? "Approved" : "Declined"} by{" "}
            {request.reviewerName ?? request.reviewedByEmail}
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
        <SongLinks link={request.link} onHistory={onPress} />
        {footer}
      </View>
    </Card>
  );
}

function SongLinks({
  link,
  onHistory,
}: {
  link?: string;
  onHistory?: () => void;
}) {
  const t = useAppTheme();
  if (!link && !onHistory) return null;
  return (
    <View style={styles.songLinks}>
      {link ? <SongLink link={link} /> : null}
      {onHistory ? (
        <Pressable
          accessibilityRole="button"
          onPress={onHistory}
          style={styles.songLink}
        >
          <Ionicons name="time-outline" size={15} color={t.primary} />
          <Text style={{ color: t.primary, fontSize: 13, fontWeight: "700" }}>
            History
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SongCardPress({
  request,
  onPress,
  children,
}: {
  request: MusicRequest;
  onPress?: () => void;
  children: ReactNode;
}) {
  if (!onPress) return <>{children}</>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${request.title} by ${request.artist}, details`}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.8 }}
    >
      {children}
    </Pressable>
  );
}
/* To Review */
export const ToReviewTab = ({
  onEditRequest,
  onDeleteRequest,
  canManageRequests = false,
  loadMoreRef,
}: MusicRowActions & {
  canManageRequests?: boolean;
  loadMoreRef?: MutableRefObject<(() => void) | null>;
} = {}) => {
  const t = useAppTheme();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [filter, setFilter] = useState<RequestFilter>("PENDING");
  const showingPending = filter === "PENDING";
  // Backend query and mutations enforce Praise Manager access.
  const review = usePagedQuery(api.musicRequests.reviewPage, {
    args: (cursor) =>
      !isLoading && isAuthenticated
        ? {
            paginationOpts: { numItems: PAGE_SIZE, cursor },
            status: showingPending ? ("PENDING" as const) : ("DECLINED" as const),
          }
        : "skip",
    scopeKey: filter,
    rowsOf: (result) => result.page,
    keyOf: (row) => row._id,
    loadMoreRef,
    keepRowsWhileLoading: true,
  });
  const visibleRequests = review.rows;
  const [declineTarget, setDeclineTarget] = useState<MusicRequest | null>(null);
  const [details, setDetails] = useState<MusicRequest | null>(null);

  return (
    <View style={styles.section}>
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={["PENDING", "DECLINED"]}
      />

      {!review.loadingFirstPage ? (
        <View style={styles.requestSectionHeading}>
          <Text style={{ color: t.faint, fontSize: 13 }}>
            {`${visibleRequests.length}${review.hasMore ? "+" : ""} ${
              showingPending ? "pending" : "declined"
            } song ${visibleRequests.length === 1 && !review.hasMore ? "request" : "requests"}`}
          </Text>
        </View>
      ) : null}

      {review.loadingFirstPage ? (
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
                canManageRequests={canManageRequests}
                onDecline={() => setDeclineTarget(item)}
                onPress={() => setDetails(item)}
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
              <MyRequestCard
                request={item}
                showRequester
                onPress={() => setDetails(item)}
              />
            )
          }
        />
      )}
      {review.loadingMore ? <LoadingState /> : null}
      <DeclineSheet
        request={declineTarget}
        onClose={() => setDeclineTarget(null)}
      />
      <SongDetailsSheet request={details} onClose={() => setDetails(null)} />
    </View>
  );
};

function DeclineSheet({
  request,
  onClose,
}: {
  request: MusicRequest | null;
  onClose: () => void;
}) {
  const decline = useMutation(api.musicRequests.decline);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shownFor, setShownFor] = useState(request?._id);
  const openFor = useRef(request?._id);
  useEffect(() => {
    openFor.current = request?._id;
  }, [request?._id]);
  if (shownFor !== request?._id) {
    setShownFor(request?._id);
    setReason("");
    setError(null);
    setSubmitting(false);
  }

  const handleDecline = async () => {
    if (!request || submitting) return;
    const requestId = request._id;
    const stillOpen = () => openFor.current === requestId;
    setError(null);
    setSubmitting(true);
    try {
      await decline({ requestId, reason: reason.trim() || undefined });
      if (stillOpen()) onClose();
    } catch (e) {
      if (stillOpen()) setError(errorMessage(e));
    } finally {
      if (stillOpen()) setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={request !== null}
      onClose={onClose}
      title="Decline song"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Btn
            title="Decline"
            variant="danger"
            loading={submitting}
            onPress={handleDecline}
          />
          <Btn title="Back" variant="ghost" onPress={onClose} />
        </View>
      }
    >
      {request ? (
        <Muted>
          {request.title} by {request.artist}, requested by{" "}
          {request.requesterName ?? request.requesterEmail}. They&apos;ll see
          your reason in the app.
        </Muted>
      ) : null}
      <Field
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        placeholder="Why isn't this song a fit?"
        autoCapitalize="sentences"
        multiline
      />
      <ErrorBanner message={error} />
    </Sheet>
  );
}

function ReviewCard({
  request,
  actions,
  canManageRequests,
  onDecline,
  onPress,
}: {
  request: MusicRequest;
  actions?: ReactNode;
  canManageRequests: boolean;
  onDecline: () => void;
  onPress?: () => void;
}) {
  const t = useAppTheme();
  const approve = useMutation(api.musicRequests.approve);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onApprove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await approve({ requestId: request._id });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <View style={styles.requestCardContent}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <SongCardPress request={request} onPress={onPress}>
              <SongHeader request={request} />
            </SongCardPress>
          </View>
          {actions}
        </View>
        <DetailLine icon="person-outline">
          Requested by {request.requesterName ?? request.requesterEmail}
        </DetailLine>
        <DetailLine icon="calendar-outline">
          Requested {formatDate(request._creationTime)}
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
        <SongLinks link={request.link} onHistory={onPress} />
        <ErrorBanner message={error} />
        {canManageRequests && (
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
        )}
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
  trailStep: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  songLinks: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  noteLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  managersBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
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
