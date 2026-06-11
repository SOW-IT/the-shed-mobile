import { useQuery } from "convex/react";
import { useState } from "react";
import { requestCompleted } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { RequestCard } from "@/components/RequestCard";
import { Muted, SectionTitle, Segmented } from "@/components/ui";

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
        <Muted>Loading…</Muted>
      ) : filtered.length === 0 ? (
        <Muted>No {filter} requests.</Muted>
      ) : (
        filtered.map((request) => (
          <RequestCard key={request._id} request={request} showRequester />
        ))
      )}
    </>
  );
};
