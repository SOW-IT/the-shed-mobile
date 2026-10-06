import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { CommentThreadSheet } from "./CommentThreadSheet";

const CLOSE_ANIMATION_MS = 300;

/**
 * Whether a thread's query should be live: from opening its sheet until the
 * sheet has finished animating closed.
 */
export const useThreadActive = (visible: boolean): boolean => {
  const [active, setActive] = useState(visible);
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- subscribe on open
      setActive(true);
      return;
    }
    const id = setTimeout(() => setActive(false), CLOSE_ANIMATION_MS);
    return () => clearTimeout(id);
  }, [visible]);
  return active;
};

/** The last loaded value, so a reopened sheet doesn't flash a spinner. */
export const useRetained = <T,>(current: T | undefined): T | undefined => {
  const [loaded, setLoaded] = useState<T | undefined>(current);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- retain last loaded thread
    if (current !== undefined) setLoaded(current);
  }, [current]);
  return loaded;
};

/** A reimbursement request's comment thread. */
export const CommentsSheet = ({
  request,
  visible,
  onClose,
}: {
  request: Doc<"requests">;
  visible: boolean;
  onClose: () => void;
}) => {
  const active = useThreadActive(visible);
  const comments = useQuery(
    api.comments.list,
    active ? { requestId: request._id } : "skip"
  );
  const loaded = useRetained(comments);
  const add = useMutation(api.comments.add).withOptimisticUpdate(
    (localStore, { requestId, body }) => {
      const current = localStore.getQuery(api.comments.list, { requestId });
      if (!current) return;
      // eslint-disable-next-line react-hooks/purity -- optimistic id/timestamp
      const now = Date.now();
      localStore.setQuery(api.comments.list, { requestId }, [
        ...current,
        {
          id: `optimistic-${now}` as unknown as Id<"requestComments">,
          authorEmail: "",
          authorName: null,
          body: body.trim(),
          at: now,
          isMine: true,
          reactions: [],
        },
      ]);
    }
  );
  const markRead = useMutation(api.comments.markRead);
  const markNotificationsRead = useMutation(api.notifications.markReadForRequest);
  const toggleReaction = useMutation(api.comments.toggleReaction).withOptimisticUpdate(
    (localStore, { commentId, emoji }) => {
      const current = localStore.getQuery(api.comments.list, { requestId: request._id });
      if (!current) return;
      localStore.setQuery(
        api.comments.list,
        { requestId: request._id },
        current.map((c) => {
          if (c.id !== commentId) return c;
          const mine = c.reactions.find((r) => r.emoji === emoji);
          let reactions;
          if (mine?.mine) {
            reactions = c.reactions
              .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r))
              .filter((r) => r.count > 0);
          } else if (mine) {
            reactions = c.reactions.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r
            );
          } else {
            reactions = [...c.reactions, { emoji, count: 1, mine: true }];
          }
          return { ...c, reactions: [...reactions].sort((a, b) => b.count - a.count) };
        })
      );
    }
  );

  useEffect(() => {
    if (visible && comments) {
      void markRead({ requestId: request._id });
      void markNotificationsRead({ requestId: request._id });
    }
  }, [visible, comments, markRead, markNotificationsRead, request._id]);

  return (
    <CommentThreadSheet
      visible={visible}
      onClose={onClose}
      comments={loaded}
      onSend={(body) => add({ requestId: request._id, body })}
      onReact={(commentId, emoji) =>
        toggleReaction({ commentId: commentId as Id<"requestComments">, emoji })
      }
    />
  );
};
