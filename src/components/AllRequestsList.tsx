import { useQuery } from "convex/react";
import { useState } from "react";
import { requestCompleted } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { RequestCard } from "@/components/RequestCard";
import {
  EmptyState,
  FadeInView,
  LoadingState,
  SectionTitle,
  Segmented,
  stagger,
} from "@/components/ui";

/** Every request this year (Finance only), split into ongoing/completed. */
export const AllRequestsList = () => {
  const requests = useQuery(api.requests.allRequests, {});
  const [filter, setFilter] = useState<"ongoing" | "completed">("ongoing");

  const filtered = (requests ?? []).filter((request) =>
    filter === "ongoing" ? !requestCompleted(request) : requestCompleted(request)
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
