import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";

export const useStaffWaitingBadge = (
  query: FunctionReference<"query", "public", Record<string, never>, number>
): number => {
  const me = useQuery(api.directory.me);
  const shown = !!me?.profile && !me.isCampusLeader;
  return useQuery(query, shown ? {} : "skip") ?? 0;
};
