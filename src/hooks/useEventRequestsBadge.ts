import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const useEventRequestsBadge = (): number => {
  const me = useQuery(api.directory.me);
  const shown = !!me?.profile && !me.isCampusLeader;
  return useQuery(api.eventRequests.waitingOnMe, shown ? {} : "skip") ?? 0;
};
