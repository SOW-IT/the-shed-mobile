import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const useDesignRequestsBadge = (): number => {
  const me = useQuery(api.directory.me);
  const shown = !!me?.profile && !me.isCampusLeader;
  return useQuery(api.designRequests.waitingOnMe, shown ? {} : "skip") ?? 0;
};
