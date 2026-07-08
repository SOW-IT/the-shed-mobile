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

/** How many completed requests to reveal per infinite-scroll page. */
const COMPLETED_PAGE_SIZE = 20;

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
    // Requests with unread comments float to the top (most unread first).
    const ua = unread[a._id] ?? 0;
    const ub = unread[b._id] ?? 0;
    if (ua !== ub) return ub - ua;
    const pa = STATUS_PRIORITY[requestDisplayStatus(a)] ?? 9;
    const pb = STATUS_PRIORITY[requestDisplayStatus(b)] ?? 9;
    if (pa !== pb) return pa - pb;
    return b._creationTime - a._creationTime;
  });

/** Every request this year (Finance only), split into ongoing/completed. */
export const AllRequestsList = ({
  year,
  loadMoreRef,
  focusId,
  focusThread = false,
  focusReopenKey,
}: {
  year?: number;
  /** Notification deep-link: id of the request to focus (expand / open thread). */
  focusId?: string;
  focusThread?: boolean;
  focusReopenKey?: string;
  /**
   * Set by the parent screen's ScrollView so it can drive the completed-tab
   * infinite scroll. Points at this list's "reveal more" handler, or null when
   * there's nothing more to reveal.
   */
  loadMoreRef?: MutableRefObject<(() => void) | null>;
}) => {
  const requests = useQuery(
    api.requests.allRequests,
    year !== undefined ? { year } : {}
  );
  // Per-request unread comment counts, to float requests with unread to the top.
  const unread =
    useQuery(
      api.comments.unreadCountsForRequests,
      requests ? { requestIds: requests.map((r) => r._id) } : "skip"
    ) ?? {};
  // Past years (year set) are almost all completed, so default to that tab;
  // reset the default whenever the browsed year changes.
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

  // Completed requests are revealed a page at a time as the user scrolls down.
  const [visible, setVisible] = useState(COMPLETED_PAGE_SIZE);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging on filter/year change
    setVisible(COMPLETED_PAGE_SIZE);
  }, [filter, year]);

  const shown = isCompleted ? filtered.slice(0, visible) : filtered;
  const hasMore = isCompleted && filtered.length > shown.length;

  // Guard against the scroll handler firing many times before the next render:
  // reveal at most one page per render cycle.
  const pending = useRef(false);
  useEffect(() => {
    pending.current = false;
  }, [visible]);
  const loadMore = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    setVisible((n) => n + COMPLETED_PAGE_SIZE);
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
        // Wide screens lay requests out as side-by-side columns; phones stack.
        <Grid minColumnWidth={380}>
          {shown.map((request, index) => (
            <FadeInView key={request._id} delay={stagger(index)}>
              <RequestCard
                request={request}
                showRequester
                collapsible={isCompleted}
                autoExpand={request._id === focusId}
                autoOpenThread={request._id === focusId && focusThread}
                deepLinkOpenKey={request._id === focusId ? focusReopenKey : undefined}
              />
            </FadeInView>
          ))}
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
