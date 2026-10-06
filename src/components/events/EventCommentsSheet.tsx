import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import type { SubFormKind } from "@shared/eventRequests";
import { CommentThreadSheet } from "@/components/CommentThreadSheet";
import { useRetained, useThreadActive } from "@/components/CommentsSheet";

/** One of an event's form threads: the requester's side and the team that reviews it. */
export const EventCommentsSheet = ({
  id,
  form,
  canPost,
  visible,
  onClose,
}: {
  id: Id<"eventRequests">;
  form: SubFormKind;
  /** Anyone who can see the event can read; only those in the thread can post. */
  canPost: boolean;
  visible: boolean;
  onClose: () => void;
}) => {
  const active = useThreadActive(visible);
  const comments = useQuery(api.eventRequestComments.list, active ? { id, form } : "skip");
  const loaded = useRetained(comments);
  const add = useMutation(api.eventRequestComments.add).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.eventRequestComments.list, {
        id: args.id,
        form: args.form,
      });
      if (!current) return;
      // eslint-disable-next-line react-hooks/purity -- optimistic id/timestamp
      const now = Date.now();
      localStore.setQuery(api.eventRequestComments.list, { id: args.id, form: args.form }, [
        ...current,
        {
          id: `optimistic-${now}` as unknown as Id<"eventRequestComments">,
          authorEmail: "",
          authorName: "",
          body: args.body.trim(),
          at: now,
          isMine: true,
        },
      ]);
    }
  );
  const markRead = useMutation(api.eventRequestComments.markRead);

  useEffect(() => {
    if (visible && comments) void markRead({ id, form }).catch(() => {});
  }, [visible, comments, markRead, id, form]);

  return (
    <CommentThreadSheet
      visible={visible}
      onClose={onClose}
      comments={loaded}
      onSend={(body) =>
        canPost
          ? add({ id, form, body })
          : Promise.reject(new Error("Only the requester's side and this form's team can comment."))
      }
    />
  );
};
