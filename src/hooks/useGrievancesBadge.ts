import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const useGrievancesBadge = (): number => {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.grievances.waitingOnMe, isAuthenticated ? {} : "skip") ?? 0;
};
