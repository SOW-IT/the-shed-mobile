import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { SUB_FORM_LABELS, type SubFormKind } from "@shared/eventRequests";
import { CommentThreadSheet } from "@/components/CommentThreadSheet";
import { optimisticComment, useRetained, useThreadActive } from "@/components/CommentsSheet";

export const EventCommentsSheet = ({
  id,
  form,
  canPost,
  visible,
  onClose,
}: {
  id: Id<"eventRequests">;
  form: SubFormKind;
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
      localStore.setQuery(api.eventRequestComments.list, { id: args.id, form: args.form }, [
        ...current,
        optimisticComment(args.body, { authorName: "" }),
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
      onSend={(body) => add({ id, form, body })}
      canPost={canPost}
      readOnlyNote={`Only the requester's department and the team that reviews ${SUB_FORM_LABELS[form]} forms can comment on this form.`}
    />
  );
};
