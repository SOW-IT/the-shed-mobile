import { useQuery } from "convex/react";
import { useState } from "react";
import { requestCompleted } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { RequestCard } from "@/components/RequestCard";
import { Btn, Muted, Row, Screen, SectionTitle } from "@/components/ui";

export default function AllRequestsScreen() {
  const me = useQuery(api.directory.me);
  const requests = useQuery(
    api.requests.allRequests,
    me?.isFinance ? {} : "skip"
  );
  const [filter, setFilter] = useState<"ongoing" | "completed">("ongoing");

  const filtered = (requests ?? []).filter((request) =>
    filter === "ongoing" ? !requestCompleted(request) : requestCompleted(request)
  );

  return (
    <Screen>
      <Row>
        <Btn
          title="Ongoing"
          variant={filter === "ongoing" ? "primary" : "ghost"}
          onPress={() => setFilter("ongoing")}
        />
        <Btn
          title="Completed"
          variant={filter === "completed" ? "primary" : "ghost"}
          onPress={() => setFilter("completed")}
        />
      </Row>
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
    </Screen>
  );
}
