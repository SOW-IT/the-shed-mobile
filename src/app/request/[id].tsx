import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { EmptyState, LoadingState, Screen } from "@/components/ui";

/**
 * Legacy deep-link target for a single request. Notifications now link straight
 * to the live Requests tab where the action is taken (see `requestUrl` in
 * convex/requests.ts), so this route just forwards there — to "Mine" for the
 * requester, "Review" for everyone else — focusing the request so it expands.
 * Kept so older notifications/bookmarks still land somewhere useful.
 */
export default function RequestRedirectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useQuery(api.directory.me);
  const request = useQuery(
    api.requests.get,
    id ? { requestId: id as Id<"requests"> } : "skip"
  );

  if (request === undefined || me === undefined) {
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
  const tab = me?.email === request.requesterEmail ? "mine" : "review";
  return <Redirect href={`/?tab=${tab}&focus=${request._id}`} />;
}
