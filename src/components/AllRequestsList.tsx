import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { requestCompleted, requestDisplayStatus } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { RequestCard } from "@/components/RequestCard";
import {
  EmptyState,
  FadeInView,
  LoadingState,
  SectionTitle,
  Segmented,
  stagger,
} from "@/components/ui";

const STATUS_PRIORITY: Record<string, number> = {
  "AWAITING PAYMENT": 0,
  "AWAITING RECEIPT": 1,
  "AWAITING APPROVAL": 2,
  DECLINED: 3,
  PAID: 4,
};

const sortRequests = (list: Doc<"requests">[]): Doc<"requests">[] =>
  [...list].sort((a, b) => {
    const pa = STATUS_PRIORITY[requestDisplayStatus(a)] ?? 9;
    const pb = STATUS_PRIORITY[requestDisplayStatus(b)] ?? 9;
    if (pa !== pb) return pa - pb;
    return b._creationTime - a._creationTime;
  });

/** Every request this year (Finance only), split into ongoing/completed. */
export const AllRequestsList = ({ year }: { year?: number }) => {
  const requests = useQuery(
    api.requests.allRequests,
    year !== undefined ? { year } : {}
  );
  // Past years (year set) are almost all completed, so default to that tab;
  // reset the default whenever the browsed year changes.
  const [filter, setFilter] = useState<"ongoing" | "completed">(
    year !== undefined ? "completed" : "ongoing"
  );
  useEffect(() => {
    setFilter(year !== undefined ? "completed" : "ongoing");
  }, [year]);

  const filtered = sortRequests(
    (requests ?? []).filter((request) =>
      filter === "ongoing" ? !requestCompleted(request) : requestCompleted(request)
    )
  );

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
        All {filter === "ongoing" ? "Ongoing" : "Completed"} Requests (
        {filtered.length})
      </SectionTitle>
      {requests == null ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="file-tray-outline"
          title={`No ${filter} requests`}
          message={
            filter === "ongoing"
              ? "New requests will appear here as staff submit them."
              : "Paid and declined requests will appear here."
          }
        />
      ) : (
        filtered.map((request, index) => (
          <FadeInView key={request._id} delay={stagger(index)}>
            <RequestCard request={request} showRequester />
          </FadeInView>
        ))
      )}
    </>
  );
};
