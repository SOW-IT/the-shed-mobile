import { useQuery } from "convex/react";
import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { requestCompleted, requestDisplayStatus } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { spacing } from "@/theme";
import { RequestCard } from "@/components/RequestCard";
import { EarlierYears, useEarlierYears } from "@/components/EarlierYears";
import { createdAtOf, ReceiptFilesNote, requestStaffYear } from "@/components/ReceiptFilesNote";
import {
  EmptyState,
  FadeInView,
  Grid,
  LoadingState,
  SectionTitle,
  Segmented,
  SowSpinner,
  stagger,
} from "@/components/ui";

const PAGE_SIZE = 20;

const STATUS_PRIORITY: Record<string, number> = {
  "AWAITING PAYMENT": 0,
  "AWAITING RECEIPT": 1,
  "AWAITING APPROVAL": 2,
  DECLINED: 3,
  PAID: 4,
};

const sortRequests = (
  list: Doc<"requests">[],
  unread: Record<string, number>
): Doc<"requests">[] =>
  [...list].sort((a, b) => {
    const ua = unread[a._id] ?? 0;
    const ub = unread[b._id] ?? 0;
    if (ua !== ub) return ub - ua;
    const pa = STATUS_PRIORITY[requestDisplayStatus(a)] ?? 9;
    const pb = STATUS_PRIORITY[requestDisplayStatus(b)] ?? 9;
    if (pa !== pb) return pa - pb;
    return b._creationTime - a._creationTime;
  });

export const AllRequestsList = ({
  loadMoreRef,
  focusId,
  focusThread = false,
  focusReopenKey,
  onFocusThreadOpened,
}: {
  focusId?: string;
  focusThread?: boolean;
  focusReopenKey?: string;
  onFocusThreadOpened?: () => void;
  loadMoreRef?: MutableRefObject<(() => void) | null>;
}) => {
  const requests = useQuery(api.requests.allRequests, {});
  const unread =
    useQuery(
      api.comments.unreadCountsForRequests,
      requests ? { requestIds: requests.map((r) => r._id) } : "skip"
    ) ?? {};
  const [pickedFilter, setFilter] = useState<"ongoing" | "completed" | null>(null);
  const focused = focusId ? requests?.find((request) => request._id === focusId) : undefined;
  const filter =
    pickedFilter ??
    (focused
      ? requestCompleted(focused)
        ? "completed"
        : "ongoing"
      : "ongoing");

  const isCompleted = filter === "completed";
  const filtered = sortRequests(
    (requests ?? []).filter((request) =>
      isCompleted ? requestCompleted(request) : !requestCompleted(request)
    ),
    unread
  );

  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging on filter change
    setVisible(PAGE_SIZE);
  }, [filter]);

  const focusIndex = focused ? filtered.findIndex((request) => request._id === focused._id) : -1;
  const shown = filtered.slice(0, Math.max(visible, focusIndex + 1));
  const hasMore = filtered.length > shown.length;

  const pending = useRef(false);
  useEffect(() => {
    pending.current = false;
  }, [visible]);
  const loadMore = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    setVisible((n) => n + PAGE_SIZE);
  }, []);
  const earlierLoadMoreRef = useRef<(() => void) | null>(null);
  const showEarlier = isCompleted && requests != null && !hasMore;
  const earlier = useEarlierYears(api.requests.earlierAll, {
    enabled: showEarlier,
    exclude: (requests ?? []).map((r) => r._id),
    yearOf: requestStaffYear,
    newestOf: createdAtOf,
    loadMoreRef: earlierLoadMoreRef,
  });
  useEffect(() => {
    if (!loadMoreRef) return;
    loadMoreRef.current = hasMore
      ? loadMore
      : showEarlier
        ? () => earlierLoadMoreRef.current?.()
        : null;
    return () => {
      loadMoreRef.current = null;
    };
  }, [loadMoreRef, hasMore, loadMore, showEarlier]);

  return (
    <>
      <Segmented
        segments={[
          { key: "ongoing", label: "Ongoing" },
          { key: "completed", label: "Completed" },
        ]}
        active={filter}
        onChange={(key) => setFilter(key as "ongoing" | "completed")}
      />
      <SectionTitle>
        All {isCompleted ? "Completed" : "Ongoing"} Requests ({filtered.length})
      </SectionTitle>
      {requests == null ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="file-tray-outline"
          title={`No ${filter} requests`}
          message={
            isCompleted
              ? "Paid and declined requests will appear here."
              : "New requests will appear here as staff submit them."
          }
        />
      ) : (
        <Grid minColumnWidth={380}>
          {shown.map((request, index) => {
            const card = (
              <RequestCard
                request={request}
                showRequester
                collapsible={isCompleted}
                autoExpand={request._id === focusId}
                autoOpenThread={request._id === focusId && focusThread}
                deepLinkOpenKey={request._id === focusId ? focusReopenKey : undefined}
                onAutoOpenThread={request._id === focusId ? onFocusThreadOpened : undefined}
              />
            );
            return index < PAGE_SIZE ? (
              <FadeInView key={request._id} delay={stagger(index)}>
                {card}
              </FadeInView>
            ) : (
              <View key={request._id}>{card}</View>
            );
          })}
        </Grid>
      )}
      {hasMore && (
        <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
          <SowSpinner size={36} />
        </View>
      )}
      {showEarlier ? (
        <EarlierYears
          groups={earlier.groups}
          hasMore={earlier.hasMore}
          loadingMore={earlier.loadingMore}
          onLoadMore={earlier.loadMore}
          note={(y) => <ReceiptFilesNote year={y} />}
          renderRows={(rows) => (
            <Grid minColumnWidth={380}>
              {rows.map((request) => (
                <RequestCard key={request._id} request={request} showRequester collapsible />
              ))}
            </Grid>
          )}
        />
      ) : null}
    </>
  );
};
