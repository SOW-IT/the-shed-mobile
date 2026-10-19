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
          message="It may have been cancelled, or it isn't one you can see."
        />
      </Screen>
    );
  }
  const tab =
    me?.email === request.requesterEmail
      ? "mine"
      : !me?.isApprover && me?.isFinance
        ? "all"
        : "review";
  return <Redirect href={`/?tab=${tab}&focus=${request._id}`} />;
}
