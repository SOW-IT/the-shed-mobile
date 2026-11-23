import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * How many people are in the World right now, live. Every caller shares one
 * subscription (Convex dedupes the same query), and it only changes when
 * someone comes, goes or travels. Zero when signed out, or until it loads.
 */
export const useWorldOnline = (enabled = true): number => {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.world.onlineCount, enabled && isAuthenticated ? {} : "skip") ?? 0;
};

/** "3 online", or nothing when nobody is. */
export const onlineText = (count: number): string | undefined => (count > 0 ? `${count} online` : undefined);
