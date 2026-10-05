import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { requestFullyApproved } from "../../shared/flow";

/**
 * The orange count on Reimbursements (and the phone's menu avatar): your
 * approved requests still waiting on a receipt, requests waiting on your
 * review, and unread comments on both. Zero for anyone who can't see
 * Reimbursements (guests and campus leaders).
 */
export const useReimbursementsBadge = (): number => {
  const me = useQuery(api.directory.me);
  const shown = !!me?.profile && !me.isCampusLeader;
  const reviews = shown && !!me?.isApprover;

  const myRequests = useQuery(api.requests.myRequests, shown ? {} : "skip");
  const mineActionCount = (myRequests ?? []).filter(
    (r) => requestFullyApproved(r) && !r.receipt
  ).length;
  const mineUnread = useQuery(api.comments.myUnreadTotal, shown ? {} : "skip") ?? 0;

  const review = useQuery(api.requests.toReview, reviews ? {} : "skip");
  const reviewRequests = review
    ? [
        ...review.hod,
        ...review.budgetManager,
        ...review.director,
        ...review.financeHead,
        ...review.readyToPay,
      ]
    : [];
  const reviewUnread =
    useQuery(
      api.comments.unreadTotalForRequests,
      reviews && review ? { requestIds: reviewRequests.map((r) => r._id) } : "skip"
    ) ?? 0;

  if (!shown) return 0;
  return mineActionCount + mineUnread + reviewRequests.length + reviewUnread;
};
