import { useQuery } from "convex/react";
import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { requestCompleted, requestDisplayStatus } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { spacing } from "@/theme";
import { RequestCard } from "@/components/RequestCard";
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
  year,
  loadMoreRef,
  focusId,
  focusThread = false,
  focusReopenKey,
}: {
  year?: number;
  focusId?: string;
  focusThread?: boolean;
  focusReopenKey?: string;
  loadMoreRef?: MutableRefObject<(() => void) | null>;
}) => {
  const requests = useQuery(
    api.requests.allRequests,
    year !== undefined ? { year } : {}
  );
  const unread =
    useQuery(
      api.comments.unreadCountsForRequests,
      requests ? { requestIds: requests.map((r) => r._id) } : "skip"
    ) ?? {};
  const [filter, setFilter] = useState<"ongoing" | "completed">(
    year !== undefined ? "completed" : "ongoing"
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset tab on year change
    setFilter(year !== undefined ? "completed" : "ongoing");
  }, [year]);

  const isCompleted = filter === "completed";
  const filtered = sortRequests(
    (requests ?? []).filter((request) =>
      isCompleted ? requestCompleted(request) : !requestCompleted(request)
    ),
    unread
  );

  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging on filter/year change
    setVisible(PAGE_SIZE);
  }, [filter, year]);

  const shown = filtered.slice(0, visible);
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
  useEffect(() => {
    if (!loadMoreRef) return;
    loadMoreRef.current = hasMore ? loadMore : null;
    return () => {
      loadMoreRef.current = null;
    };
  }, [loadMoreRef, hasMore, loadMore]);

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
    </>
  );
};
