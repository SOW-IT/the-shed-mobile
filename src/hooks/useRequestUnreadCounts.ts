import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const NONE: Record<string, number> = {};

/**
 * Unread comment counts for a list's requests, in one query. A card given
 * its count doesn't open a subscription of its own, so a list of 20 cards
 * asks the server once instead of 20 times.
 */
export const useRequestUnreadCounts = (
  ids: Id<"requests">[] | undefined
): Record<string, number> =>
  useQuery(
    api.comments.unreadCountsForRequests,
    ids && ids.length > 0 ? { requestIds: ids } : "skip"
  ) ?? NONE;
