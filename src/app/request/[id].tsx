import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { RequestCard } from "@/components/RequestCard";
import { Muted, Screen, SectionTitle } from "@/components/ui";

/** Where push notifications about a request land. */
export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const request = useQuery(
    api.requests.get,
    id ? { requestId: id as Id<"requests"> } : "skip"
  );

  if (request === undefined) {
    return (
      <Screen>
        <Muted>Loading…</Muted>
      </Screen>
    );
  }
  if (request === null) {
    return (
      <Screen>
        <Muted>This request no longer exists (it may have been cancelled).</Muted>
      </Screen>
    );
  }
  return (
    <Screen>
      <SectionTitle>Request</SectionTitle>
      <RequestCard request={request} showRequester />
      <Muted>
        If this request is waiting on you, action it from the To Review tab.
      </Muted>
    </Screen>
  );
}
