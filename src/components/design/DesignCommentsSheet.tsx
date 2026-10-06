import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { CommentThreadSheet } from "@/components/CommentThreadSheet";
import { useRetained, useThreadActive } from "@/components/CommentsSheet";

/** A design request's comment thread: the requester and the Marketing team. */
export const DesignCommentsSheet = ({
  id,
  visible,
  onClose,
}: {
  id: Id<"designRequests">;
  visible: boolean;
  onClose: () => void;
}) => {
  const active = useThreadActive(visible);
  const comments = useQuery(api.designRequestComments.list, active ? { id } : "skip");
  const loaded = useRetained(comments);
  const add = useMutation(api.designRequestComments.add).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.designRequestComments.list, { id: args.id });
      if (!current) return;
      // eslint-disable-next-line react-hooks/purity -- optimistic id/timestamp
      const now = Date.now();
      localStore.setQuery(api.designRequestComments.list, { id: args.id }, [
        ...current,
        {
          id: `optimistic-${now}` as unknown as Id<"designRequestComments">,
          authorEmail: "",
          authorName: "",
          body: args.body.trim(),
          at: now,
          isMine: true,
        },
      ]);
    }
  );
  const markRead = useMutation(api.designRequestComments.markRead);

  useEffect(() => {
    if (visible && comments) void markRead({ id }).catch(() => {});
  }, [visible, comments, markRead, id]);

  return (
    <CommentThreadSheet
      visible={visible}
      onClose={onClose}
      comments={loaded}
      onSend={(body) => add({ id, body })}
    />
  );
};
