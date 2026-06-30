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
  Muted,
  Sheet,
  SowSpinner,
} from "./ui";

/** Roughly the Sheet's Modal fade duration; we hold the query this long on close. */
const CLOSE_ANIMATION_MS = 300;

/** A handful of one-tap reactions; the rest live behind "More". */
const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🙏", "👀", "✅"];
const MORE_EMOJIS = [
  "👍", "👎", "❤️", "🔥", "🎉", "😂", "😅", "🙏", "👀", "✅",
  "❌", "⚠️", "💰", "💸", "🧾", "📎", "⏳", "🚀", "💯", "🤝",
  "🙌", "👏", "🤔", "😮", "😢", "😡", "🥳", "🫡", "💪", "✍️",
];

/** Optimistic comments carry a synthetic id (`optimistic-…`) until the server
 *  reconciles them; reactions can't target a row that doesn't exist yet. */
const isOptimisticId = (id: Id<"requestComments">) =>
  String(id).startsWith("optimistic-");

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
  // Keep the comments query subscribed until the close animation has
  // finished. `visible` switches it on immediately; on close we hold the
  // subscription for the fade duration so the request comments state never
  // reverts to the loading spinner mid-animation — the query would otherwise
  // flip to "skip" (-> undefined) the instant the close button is pressed.
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

  const comments = useQuery(
    api.comments.list,
    active ? { requestId: request._id } : "skip"
  );
  // Also retain the last loaded result so re-opening shows the thread
  // instantly instead of flashing the spinner before the query resolves.
  const [loaded, setLoaded] = useState<typeof comments>(comments);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- retain last loaded thread
    if (comments !== undefined) setLoaded(comments);
  }, [comments]);
  // Optimistic: show the comment immediately (as "You") so the thread feels
  // instant; the real query replaces it on response, or Convex reverts on error.
  const add = useMutation(api.comments.add).withOptimisticUpdate(
    (localStore, { requestId, body }) => {
      const current = localStore.getQuery(api.comments.list, { requestId });
      if (!current) return;
      // Runs at mutation time (not render); the synthetic id/timestamp are
      // replaced when the server result lands.
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
  // Also clear any in-app notifications about this request once its thread is
  // open — reading the comment marks the "new comment" notification read too.
  const markNotificationsRead = useMutation(api.notifications.markReadForRequest);
  // Optimistic: toggle my reaction locally (add/remove, re-sorted by count) so
  // the chip updates on tap instead of after the round-trip.
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

  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const canSend = !sending && draft.trim() !== "";
  const [reactingTo, setReactingTo] = useState<Id<"requestComments"> | null>(null);
  const [moreFor, setMoreFor] = useState<Id<"requestComments"> | null>(null);

  // Clear the unread badge while the thread is open (including as new ones land).
  useEffect(() => {
    if (visible && comments) {
      void markRead({ requestId: request._id });
      void markNotificationsRead({ requestId: request._id });
    }
  }, [visible, comments, markRead, markNotificationsRead, request._id]);

  // Closing the thread also dismisses any open reaction picker.
  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- dismiss pickers on close
      setReactingTo(null);
      setMoreFor(null);
    }
  }, [visible]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return; // guard against double-taps
    setSending(true);
    setDraft("");
    setError(null);
    try {
      await add({ requestId: request._id, body });
    } catch (e) {
      setError(errorMessage(e));
      setDraft(body); // restore so the text isn't lost
    } finally {
      setSending(false);
    }
  };

  const react = async (commentId: Id<"requestComments">, emoji: string) => {
    setReactingTo(null);
    setMoreFor(null);
    // The comment hasn't been persisted yet — toggling a reaction on its
    // synthetic id would fail the mutation's id validator with a false error.
    if (isOptimisticId(commentId)) return;
    try {
      await toggleReaction({ commentId, emoji });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title="Comments">
        {loaded === undefined ? (
          <View style={styles.loading}>
            <SowSpinner size={18} />
          </View>
        ) : loaded === null || loaded.length === 0 ? (
          <Muted>No comments yet.</Muted>
        ) : (
          <View style={{ gap: spacing.md }}>
            {loaded.map((comment) => (
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
      </Sheet>

      <Sheet
        visible={visible && moreFor !== null}
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
  // Compact, left-aligned to occupy roughly the same footprint as the
  // "No comments yet" line so the sheet doesn't jump in size after loading.
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
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.md },
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
