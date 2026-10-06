import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { compactAgo } from "@shared/datetime";
import { QUICK_REACTION_EMOJIS, REACTION_EMOJIS } from "@shared/flow";
import {
  Avatar,
  errorMessage,
  ErrorBanner,
  IconButton,
  Muted,
  Sheet,
  SowSpinner,
} from "./ui";

export type ThreadReaction = { emoji: string; count: number; mine: boolean };

export type ThreadComment = {
  id: string;
  authorEmail: string;
  authorName: string | null;
  body: string;
  at: number;
  isMine: boolean;
  reactions?: ThreadReaction[];
};

/** Comments added optimistically have no server id yet, so can't be reacted to. */
export const isOptimisticId = (id: string) => id.startsWith("optimistic-");

/**
 * A request's comment thread in a bottom sheet: the comments, a composer, and,
 * when `onReact` is given, emoji reactions. The caller owns the data and
 * passes `comments` (undefined while loading, null when it can't be read).
 */
export const CommentThreadSheet = ({
  visible,
  onClose,
  comments,
  onSend,
  onReact,
}: {
  visible: boolean;
  onClose: () => void;
  comments: ThreadComment[] | null | undefined;
  onSend: (body: string) => Promise<unknown>;
  onReact?: (commentId: string, emoji: string) => Promise<unknown>;
}) => {
  const t = useAppTheme();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const canSend = !sending && draft.trim() !== "";
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- dismiss pickers on close
      setReactingTo(null);
      setMoreFor(null);
    }
  }, [visible]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    setError(null);
    try {
      await onSend(body);
    } catch (e) {
      setError(errorMessage(e));
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const react = async (commentId: string, emoji: string) => {
    setReactingTo(null);
    setMoreFor(null);
    if (!onReact || isOptimisticId(commentId)) return;
    try {
      await onReact(commentId, emoji);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Comments"
        keyboardAnchor="bottom"
        stickToBottom
        footer={
          <>
            <ErrorBanner message={error} />
            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Write a comment…"
                placeholderTextColor={t.faint}
                multiline
                style={[
                  styles.composerInput,
                  {
                    backgroundColor: t.inputBackground,
                    color: t.text,
                    borderColor: focused ? t.primary : t.border,
                  },
                ]}
              />
              <IconButton
                name="arrow-up"
                bg={canSend ? t.primary : t.ghost}
                color={canSend ? t.onPrimary : t.faint}
                size={40}
                accessibilityLabel="Send comment"
                disabled={!canSend}
                onPress={() => void send()}
              />
            </View>
          </>
        }
      >
        {comments === undefined ? (
          <View style={styles.loading}>
            <SowSpinner size={18} />
          </View>
        ) : comments === null || comments.length === 0 ? (
          <Muted>No comments yet.</Muted>
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

                  {onReact ? (
                    <View style={styles.reactionRow}>
                      {(comment.reactions ?? []).map((reaction) => (
                        <Pressable
                          key={reaction.emoji}
                          accessibilityRole="button"
                          accessibilityLabel={`${reaction.emoji} ${reaction.count}${reaction.mine ? ", you reacted" : ""}`}
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
                      {!isOptimisticId(comment.id) && (
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
                      )}
                    </View>
                  ) : null}

                  {reactingTo === comment.id ? (
                    <View style={[styles.quickPicker, { backgroundColor: t.inputBackground }]}>
                      {QUICK_REACTION_EMOJIS.map((emoji) => (
                        <Pressable
                          key={emoji}
                          hitSlop={4}
                          accessibilityRole="button"
                          accessibilityLabel={`React with ${emoji}`}
                          onPress={() => void react(comment.id, emoji)}
                          style={({ pressed }) => [styles.quickEmoji, pressed && { opacity: 0.5 }]}
                        >
                          <Text style={{ fontSize: 20 }}>{emoji}</Text>
                        </Pressable>
                      ))}
                      <Pressable
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel="More reactions"
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
      </Sheet>

      {onReact ? (
        <Sheet
          visible={visible && moreFor !== null}
          onClose={() => setMoreFor(null)}
          scrollable={false}
          title="Pick a reaction"
        >
          <View style={styles.emojiGrid}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
                onPress={() => moreFor && void react(moreFor, emoji)}
                style={({ pressed }) => [styles.gridEmoji, pressed && { opacity: 0.5 }]}
              >
                <Text style={{ fontSize: 26 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </Sheet>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  loading: { alignSelf: "flex-start", paddingVertical: 2 },
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
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    lineHeight: 20,
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
