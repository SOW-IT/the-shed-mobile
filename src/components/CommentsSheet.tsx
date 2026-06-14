import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "../theme";
import {
  Avatar,
  errorMessage,
  ErrorBanner,
  IconButton,
  LoadingState,
  Muted,
  Sheet,
} from "./ui";

/** A handful of one-tap reactions; the rest live behind "More". */
const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🙏", "👀", "✅"];
const MORE_EMOJIS = [
  "👍", "👎", "❤️", "🔥", "🎉", "😂", "😅", "🙏", "👀", "✅",
  "❌", "⚠️", "💰", "💸", "🧾", "📎", "⏳", "🚀", "💯", "🤝",
  "🙌", "👏", "🤔", "😮", "😢", "😡", "🥳", "🫡", "💪", "✍️",
];

const compactAgo = (ms: number): string => {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/**
 * The clarification thread for a request: read the conversation, post a
 * comment, and react to comments with emoji. Opening it marks the thread read.
 */
export const CommentsSheet = ({
  request,
  visible,
  onClose,
}: {
  request: Doc<"requests">;
  visible: boolean;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const comments = useQuery(
    api.comments.list,
    visible ? { requestId: request._id } : "skip"
  );
  const add = useMutation(api.comments.add);
  const markRead = useMutation(api.comments.markRead);
  const toggleReaction = useMutation(api.comments.toggleReaction);

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reactingTo, setReactingTo] = useState<Id<"requestComments"> | null>(null);
  const [moreFor, setMoreFor] = useState<Id<"requestComments"> | null>(null);

  // Clear the unread badge while the thread is open (including as new ones land).
  useEffect(() => {
    if (visible && comments) void markRead({ requestId: request._id });
  }, [visible, comments, markRead, request._id]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError(null);
    try {
      await add({ requestId: request._id, body });
    } catch (e) {
      setError(errorMessage(e));
      setDraft(body); // restore so the text isn't lost
    }
  };

  const react = async (commentId: Id<"requestComments">, emoji: string) => {
    setReactingTo(null);
    setMoreFor(null);
    try {
      await toggleReaction({ commentId, emoji });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title="Comments">
        {comments === undefined ? (
          <LoadingState />
        ) : comments === null || comments.length === 0 ? (
          <Muted>No comments yet. Start the conversation below.</Muted>
        ) : (
          <View style={{ gap: spacing.md }}>
            {comments.map((comment) => (
              <View key={comment.id} style={styles.commentRow}>
                <Avatar photo={null} name={comment.authorName ?? comment.authorEmail} size={32} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.commentHead}>
                    <Text
                      numberOfLines={1}
                      style={[typography.caption, { color: t.text, fontWeight: "700", flexShrink: 1 }]}
                    >
                      {comment.isMine ? "You" : comment.authorName ?? comment.authorEmail}
                    </Text>
                    <Text style={[typography.caption, { color: t.faint }]}>
                      {compactAgo(comment.at)}
                    </Text>
                  </View>
                  <Text style={[typography.body, { color: t.text }]}>{comment.body}</Text>

                  <View style={styles.reactionRow}>
                    {comment.reactions.map((reaction) => (
                      <Pressable
                        key={reaction.emoji}
                        onPress={() => void react(comment.id, reaction.emoji)}
                        style={[
                          styles.reactionChip,
                          {
                            backgroundColor: reaction.mine ? t.primarySoft : t.inputBackground,
                            borderColor: reaction.mine ? t.primary : "transparent",
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 13 }}>{reaction.emoji}</Text>
                        <Text style={[typography.caption, { color: t.muted, fontWeight: "700" }]}>
                          {reaction.count}
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Add a reaction"
                      onPress={() =>
                        setReactingTo((current) => (current === comment.id ? null : comment.id))
                      }
                      style={[styles.reactionAdd, { borderColor: t.border }]}
                    >
                      <Ionicons name="happy-outline" size={15} color={t.muted} />
                      <Ionicons name="add" size={12} color={t.muted} />
                    </Pressable>
                  </View>

                  {reactingTo === comment.id ? (
                    <View style={[styles.quickPicker, { backgroundColor: t.inputBackground }]}>
                      {QUICK_EMOJIS.map((emoji) => (
                        <Pressable
                          key={emoji}
                          hitSlop={4}
                          onPress={() => void react(comment.id, emoji)}
                          style={({ pressed }) => [styles.quickEmoji, pressed && { opacity: 0.5 }]}
                        >
                          <Text style={{ fontSize: 20 }}>{emoji}</Text>
                        </Pressable>
                      ))}
                      <Pressable
                        hitSlop={4}
                        onPress={() => {
                          setReactingTo(null);
                          setMoreFor(comment.id);
                        }}
                        style={({ pressed }) => [styles.quickMore, pressed && { opacity: 0.5 }]}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color={t.muted} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        <ErrorBanner message={error} />
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a comment…"
            placeholderTextColor={t.faint}
            multiline
            style={[
              styles.composerInput,
              { backgroundColor: t.inputBackground, color: t.text, borderColor: t.border },
            ]}
          />
          <IconButton
            name="arrow-up"
            bg={t.primary}
            color={t.onPrimary}
            size={40}
            accessibilityLabel="Send comment"
            disabled={draft.trim() === ""}
            onPress={() => void send()}
          />
        </View>
      </Sheet>

      <Sheet
        visible={moreFor !== null}
        onClose={() => setMoreFor(null)}
        scrollable={false}
        title="Pick a reaction"
      >
        <View style={styles.emojiGrid}>
          {MORE_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              hitSlop={4}
              onPress={() => moreFor && void react(moreFor, emoji)}
              style={({ pressed }) => [styles.gridEmoji, pressed && { opacity: 0.5 }]}
            >
              <Text style={{ fontSize: 26 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  commentRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  commentHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionAdd: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  quickPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    alignSelf: "flex-start",
    flexWrap: "wrap",
  },
  quickEmoji: { paddingHorizontal: 2 },
  quickMore: { paddingHorizontal: 4, paddingVertical: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.sm },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  gridEmoji: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
});
