import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * The count on Design Requests (and the phone's menu avatar): requests waiting
 * on the Marketing Head's approval, or on the Marketing team to finish them.
 * Zero for everyone else.
 */
export const useDesignRequestsBadge = (): number => {
  const me = useQuery(api.directory.me);
  const shown = !!me?.profile && !me.isCampusLeader;
  return useQuery(api.designRequests.waitingOnMe, shown ? {} : "skip") ?? 0;
};
