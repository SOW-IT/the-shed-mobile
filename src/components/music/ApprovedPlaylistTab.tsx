import { MusicActionsMenu } from "@/components/music/MusicActionMenu";
import {
  usePagerFooterClearance,
  usePagerTopBarInset,
} from "@/components/PagerScreen";
import { LoadingState } from "@/components/ui";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { radius, spacing, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth } from "convex/react";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../../../convex/_generated/api";
import {
  type MusicRequest,
  type MusicRowActions,
  PAGE_SIZE,
  shareLink,
  SongArtwork,
  SongDetailsSheet,
} from "./MusicRequestParts";

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
        style={styles.fill}
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
  musicSongDetails: { flex: 1, gap: 3 },
  musicSongTitle: { fontSize: 14, fontWeight: "600" },
  musicDivider: { height: StyleSheet.hairlineWidth },
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
  fill: { flex: 1 },
});
