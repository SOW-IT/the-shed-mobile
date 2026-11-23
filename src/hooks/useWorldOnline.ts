import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * How many people are in the World right now, live. Every caller shares one
 * subscription (Convex dedupes the same query), and it only changes when
 * someone comes, goes or travels. Undefined while it loads, and when signed
 * out or not asked for, so nothing claims a count it doesn't know.
 */
export const useWorldOnline = (enabled = true): number | undefined => {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.world.onlineCount, enabled && isAuthenticated ? {} : "skip");
};

/** "3 online", or nothing when nobody is or the count isn't known yet. */
export const onlineText = (count: number | undefined): string | undefined => (count ? `${count} online` : undefined);

/** The Games list's line for the World: nothing until the count is known. */
export const onlineNow = (count: number | undefined): string | undefined =>
  count === undefined ? undefined : count > 0 ? `${count} online now` : "Nobody online right now";
