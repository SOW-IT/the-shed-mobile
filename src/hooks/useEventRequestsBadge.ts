import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * The count on Event Requests (and the phone's menu avatar): event forms
 * waiting on your approval. Zero for anyone who can't see Event Requests.
 */
export const useEventRequestsBadge = (): number => {
  const me = useQuery(api.directory.me);
  const shown = !!me?.profile && !me.isCampusLeader;
  return useQuery(api.eventRequests.waitingOnMe, shown ? {} : "skip") ?? 0;
};
