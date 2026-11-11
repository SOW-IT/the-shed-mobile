import { MusicActionsMenu } from "@/components/music/MusicActionMenu";
import { Btn, LoadingState } from "@/components/ui";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { radius, spacing, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth, useQuery } from "convex/react";
import type { MutableRefObject } from "react";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  FilterChips,
  type MusicRequest,
  type MusicRowActions,
  MyRequestCard,
  PAGE_SIZE,
  type RequestFilter,
  SongDetailsSheet,
} from "./MusicRequestParts";

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
      <View style={styles.textColumn}>
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
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
                  <View style={styles.startAligned}>
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

const styles = StyleSheet.create({
  managersBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  section: { gap: 10 },
  textColumn: { flex: 1, gap: 2 },
  separator: { height: 12 },
  startAligned: { alignItems: "flex-start" },
});
