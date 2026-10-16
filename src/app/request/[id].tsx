import { useConvexAuth, useQuery } from "convex/react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { SignInPrompt } from "@/components/SignInPrompt";
import { EmptyState, LoadingState, Screen } from "@/components/ui";

export default function RequestRedirectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const me = useQuery(api.directory.me);
  const request = useQuery(
    api.requests.get,
    id ? { requestId: id as Id<"requests"> } : "skip"
  );

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen title="Request">
        <SignInPrompt what="reimbursement request" />
      </Screen>
    );
  }
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
