import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const useMusicRequestsBadge = (): number => {
  const me = useQuery(api.directory.me);
  const shown = !!me?.profile && !me.isCampusLeader;
  return useQuery(api.musicRequests.waitingOnMe, shown ? {} : "skip") ?? 0;
};
