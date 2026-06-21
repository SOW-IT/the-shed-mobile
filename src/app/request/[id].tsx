import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { RequestCard } from "@/components/RequestCard";
import {
  EmptyState,
  FadeInView,
  LoadingState,
  Muted,
  Screen,
} from "@/components/ui";

/** Where push notifications about a request land. */
export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const request = useQuery(
    api.requests.get,
    id ? { requestId: id as Id<"requests"> } : "skip"
  );
  // Opening the request is "seeing" what its notifications were about, so clear
  // them (e.g. landing here from a push or a tapped in-app notification).
  const markNotificationsRead = useMutation(api.notifications.markReadForRequest);
  const requestId = request?._id;
  useEffect(() => {
    if (requestId) void markNotificationsRead({ requestId });
  }, [requestId, markNotificationsRead]);

  if (request === undefined) {
    return (
      <Screen title="Request">
        <LoadingState />
      </Screen>
    );
  }
  if (request === null) {
    return (
      <Screen title="Request">
        <EmptyState
          icon="trash-bin-outline"
          title="Request not found"
          message="This request no longer exists (it may have been cancelled)."
        />
      </Screen>
    );
  }
  return (
    <Screen title="Request">
      <FadeInView delay={40}>
        <RequestCard request={request} showRequester />
      </FadeInView>
      <Muted>
        If this request is waiting on you, action it from the To Review tab.
      </Muted>
    </Screen>
  );
}
