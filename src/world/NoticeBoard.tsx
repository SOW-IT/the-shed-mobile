import { fonts } from "@/theme";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import Ionicons from "@expo/vector-icons/Ionicons";
import { compactAgo } from "@shared/datetime";
import { boardCards, draftAfterSave, NOTICE_TEXT_MAX, NOTICE_TITLE_MAX } from "@shared/worldNotices";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { itemStyle, popStyle, scrimStyle, useOverlayClock } from "./Overlays";
import { board } from "./palette";
import { useWorldName } from "./settings";

/** How many of your newest notifications the board shows; the rest are a tap away. */
const NOTIFICATIONS_SHOWN = 20;

type Notice = { id: Id<"worldNotices">; title: string | null; text: string; authorName: string; at: number; editedAt: number | null };
type Notification = { id: Id<"notifications">; title: string; body: string; url: string | null; read: boolean; at: number };

/** Specks in the cork, as fractions of the board, so they scale with it. */
const SPECKS = Array.from({ length: 46 }, (_, i) => ({ x: ((i * 37) % 97) / 97, y: ((i * 61) % 89) / 89, r: 1 + (i % 3) }));
/** Each paper sits a little askew, the same way every time. */
const TILTS = ["-1.6deg", "1.2deg", "-0.6deg", "1.8deg", "-1.1deg", "0.7deg"];
const tiltOf = (i: number) => TILTS[i % TILTS.length];
const pinOf = (i: number) => board.pins[i % board.pins.length];
/** Joins parts for a screen reader, without doubling a full stop a part already ends with. */
const spoken = (parts: (string | null | false)[]) =>
  parts
    .filter((part): part is string => !!part)
    .map((part) => (/[.!?]$/.test(part.trim()) ? part.trim() : `${part.trim()}.`))
    .join(" ");

const Pin = ({ colour }: { colour: string }) => (
  <View style={[styles.pin, { backgroundColor: colour }]} pointerEvents="none">
    <View style={styles.pinShine} />
  </View>
);

/**
 * The notice board on the Garden's left: the admins' pinned notices, then
 * your own notifications, newest first. Tapping a notification marks it read
 * and goes where it points. Admins pin, edit and take down notices here.
 */
export const NoticeBoardPanel = ({
  open,
  top,
  onClose,
  onOpenLink,
  onNote,
}: {
  open: boolean;
  top: number;
  onClose: () => void;
  /** Opens an app link over the World, the way the calendar board does. */
  onOpenLink: (url: string) => void;
  onNote: (note: string) => void;
}) => {
  const overlay = useOverlayClock(open);
  const { width, height } = useWindowDimensions();
  const live = overlay.mounted;
  const notices = useQuery(api.worldNotices.list, live ? {} : "skip");
  const feed = useQuery(api.notifications.feed, live ? { paginationOpts: { numItems: NOTIFICATIONS_SHOWN, cursor: null } } : "skip");
  const markRead = useMutation(api.notifications.markRead);
  const pin = useMutation(api.worldNotices.pin);
  const edit = useMutation(api.worldNotices.edit);
  const remove = useMutation(api.worldNotices.remove);
  // The notice being written: a new one, or an edit of one on the board.
  const [draft, setDraft] = useState<{ id: Id<"worldNotices"> | null; title: string; text: string } | null>(null);
  const [removing, setRemoving] = useState<Id<"worldNotices"> | null>(null);
  const [saving, setSaving] = useState(false);
  const reopen = useRef(0);
  const worldName = useWorldName();
  if (!live) return null;
  /** Who pinned a notice, named as the World names people, or "Admin" when only an email is known. */
  const authorOf = (name: string) => (name.includes("@") ? "Admin" : worldName(name));

  const loading = notices === undefined || feed === undefined;
  const noAccess = notices === null || feed === null;
  const canPin = notices?.canPin === true;
  const cards = boardCards((notices?.notices ?? []) as Notice[], (feed?.page ?? []) as Notification[]);
  const pinned = cards.flatMap((c) => (c.kind === "notice" ? [c.notice] : []));
  const mine = cards.flatMap((c) => (c.kind === "notification" ? [c.notification] : []));
  const unread = mine.filter((n) => !n.read).length;

  const openNotification = (n: Notification) => {
    if (!n.read) void markRead({ id: n.id }).catch((error: unknown) => onNote(problemOf(error, "That notification didn't mark as read. Tap it again.")));
    if (!n.url) return;
    reopen.current += 1;
    const separator = n.url.includes("?") ? "&" : "?";
    onOpenLink(`${n.url}${separator}reopen=${encodeURIComponent(`${n.id}:${reopen.current}`)}`);
  };

  const save = async () => {
    if (!draft || saving) return;
    const sent = draft;
    setSaving(true);
    try {
      const fields = { title: sent.title, text: sent.text };
      if (sent.id) await edit({ id: sent.id, ...fields });
      else await pin(fields);
      onNote(sent.id ? "Notice updated." : "Notice pinned up.");
      setDraft((current) => draftAfterSave(current, sent));
    } catch (error) {
      onNote(problemOf(error, "That notice didn't save."));
    } finally {
      setSaving(false);
    }
  };

  const takeDown = async (id: Id<"worldNotices">) => {
    setRemoving(null);
    try {
      await remove({ id });
      onNote("Notice taken down.");
    } catch (error) {
      onNote(problemOf(error, "That notice is still up."));
    }
  };

  const panelWidth = Math.min(460, width - 24);
  let item = 1;
  const next = () => item++;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the notice board" testID="world-board-scrim">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle(overlay)]} />
      </Pressable>
      <Animated.View
        style={[styles.frame, { top, width: panelWidth, maxHeight: Math.max(300, height - top - 24) }, popStyle(overlay)]}
        testID="world-board-panel"
        accessibilityViewIsModal
      >
        <View style={styles.cork}>
          {SPECKS.map((s) => (
            <View key={`${s.x},${s.y}`} pointerEvents="none" style={[styles.speck, { left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: s.r * 2, height: s.r * 2, borderRadius: s.r }]} />
          ))}
          <Animated.View style={[styles.header, itemStyle(overlay, 0)]}>
            <View style={styles.plaque}>
              <Text style={styles.plaqueText} accessibilityRole="header">
                Notice board
              </Text>
              {unread > 0 ? (
                <View style={styles.count} accessibilityLabel={`${unread} unread`}>
                  <Text style={styles.countText}>{unread}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.grow} />
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" testID="world-board-close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <Ionicons name="close" size={18} color={board.ink} />
            </Pressable>
          </Animated.View>
          <SharpScrollView style={styles.scroll} contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">
            {loading ? <Text style={styles.chalk}>Pinning things up…</Text> : null}
            {noAccess ? <Text style={styles.chalk}>The notice board is for people on this year&apos;s team.</Text> : null}

            {canPin && !draft ? (
              <Animated.View style={itemStyle(overlay, next())}>
                <Pressable
                  onPress={() => setDraft({ id: null, title: "", text: "" })}
                  accessibilityRole="button"
                  accessibilityLabel="Pin a notice"
                  testID="world-board-pin"
                  style={({ pressed }) => [styles.addNote, pressed && styles.pressed]}
                >
                  <Ionicons name="add" size={18} color={board.ink} />
                  <Text style={styles.addText}>Pin a notice</Text>
                </Pressable>
              </Animated.View>
            ) : null}

            {draft ? (
              <View style={[styles.paper, styles.notice, { transform: [{ rotate: "-0.4deg" }] }]} testID="world-board-draft">
                <Pin colour={board.pins[0]} />
                <TextInput
                  value={draft.title}
                  onChangeText={(title) => setDraft({ ...draft, title })}
                  placeholder="Heading (optional)"
                  placeholderTextColor={board.muted}
                  maxLength={NOTICE_TITLE_MAX}
                  style={[styles.input, styles.inputTitle]}
                  accessibilityLabel="Heading (optional)"
                  testID="field-notice-heading"
                />
                <TextInput
                  value={draft.text}
                  onChangeText={(text) => setDraft({ ...draft, text })}
                  placeholder="What should everyone know?"
                  placeholderTextColor={board.muted}
                  maxLength={NOTICE_TEXT_MAX}
                  multiline
                  style={[styles.input, styles.inputBody]}
                  accessibilityLabel="Notice"
                  testID="field-notice"
                />
                <View style={styles.actions}>
                  <Text style={styles.meta}>Everyone in the World sees it.</Text>
                  <View style={styles.grow} />
                  <TextButton label="Cancel" onPress={() => setDraft(null)} testID="world-board-cancel" />
                  <TextButton label={draft.id ? "Save" : "Pin it up"} strong disabled={saving || !draft.text.trim()} onPress={() => void save()} testID="world-board-save" />
                </View>
              </View>
            ) : null}

            {pinned.map((n, i) => (
              <Animated.View key={n.id} style={itemStyle(overlay, next())}>
                <View
                  style={[styles.paper, styles.notice, { transform: [{ rotate: tiltOf(i) }] }]}
                  accessible={!canPin}
                  accessibilityLabel={spoken(["Notice", n.title, n.text, `From ${authorOf(n.authorName)}`])}
                  testID={`world-board-notice-${n.id}`}
                >
                  <Pin colour={pinOf(i)} />
                  {n.title ? <Text style={styles.noteTitle}>{n.title}</Text> : null}
                  <Text style={styles.noteBody}>{n.text}</Text>
                  <Text style={styles.meta}>
                    {authorOf(n.authorName)} · {compactAgo(n.at)}
                    {n.editedAt ? " · edited" : ""}
                  </Text>
                  {canPin ? (
                    <View style={styles.actions}>
                      {removing === n.id ? (
                        <>
                          <Text style={styles.meta}>Take it down?</Text>
                          <View style={styles.grow} />
                          <TextButton label="Keep" onPress={() => setRemoving(null)} testID="world-board-keep" />
                          <TextButton label="Take down" strong onPress={() => void takeDown(n.id)} testID="world-board-remove-yes" />
                        </>
                      ) : (
                        <>
                          <View style={styles.grow} />
                          <TextButton label="Edit" onPress={() => setDraft({ id: n.id, title: n.title ?? "", text: n.text })} testID="world-board-edit" />
                          <TextButton label="Take down" onPress={() => setRemoving(n.id)} testID="world-board-remove" />
                        </>
                      )}
                    </View>
                  ) : null}
                </View>
              </Animated.View>
            ))}

            {!loading && !noAccess ? (
              <Animated.View style={[styles.label, itemStyle(overlay, next())]}>
                <Text style={styles.labelText}>For you</Text>
              </Animated.View>
            ) : null}
            {!loading && !noAccess && mine.length === 0 ? <Text style={styles.chalk}>No notifications yet.</Text> : null}
            <View style={styles.slips}>
              {mine.map((n, i) => (
                <Animated.View key={n.id} style={[styles.slipCell, itemStyle(overlay, next())]}>
                  <Pressable
                    onPress={() => openNotification(n)}
                    accessibilityRole="button"
                    accessibilityLabel={spoken([!n.read && "Unread", n.title, n.body, compactAgo(n.at)])}
                    testID={`world-board-note-${n.id}`}
                    style={({ pressed }) => [
                      styles.paper,
                      styles.slip,
                      !n.read && styles.unread,
                      { transform: [{ rotate: tiltOf(i + 3) }] },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Pin colour={n.read ? board.frameLight : board.tag} />
                    {n.read ? null : (
                      <View style={styles.newTag}>
                        <Text style={styles.newText}>New</Text>
                      </View>
                    )}
                    <Text style={[styles.slipTitle, !n.read && styles.slipTitleUnread]} numberOfLines={3}>
                      {n.title}
                    </Text>
                    {n.body ? (
                      <Text style={styles.slipBody} numberOfLines={3}>
                        {n.body}
                      </Text>
                    ) : null}
                    <Text style={styles.meta}>{compactAgo(n.at)}</Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
            {feed && !feed.isDone ? (
              <Pressable onPress={() => onOpenLink("/notifications")} accessibilityRole="button" testID="world-board-all" style={({ pressed }) => [styles.allLink, pressed && styles.pressed]}>
                <Text style={styles.allText}>See all notifications</Text>
                <Ionicons name="arrow-forward" size={14} color={board.ink} />
              </Pressable>
            ) : null}
          </SharpScrollView>
        </View>
      </Animated.View>
    </View>
  );
};

const TextButton = ({ label, onPress, strong, disabled, testID }: { label: string; onPress: () => void; strong?: boolean; disabled?: boolean; testID?: string }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled }}
    testID={testID}
    style={({ pressed }) => [styles.textButton, strong && styles.textButtonStrong, (pressed || disabled) && styles.pressed]}
  >
    <Text style={[styles.textButtonText, strong && styles.textButtonTextStrong]}>{label}</Text>
  </Pressable>
);

const problemOf = (error: unknown, fallback: string) => {
  const data = (error as { data?: unknown } | null)?.data;
  return typeof data === "string" ? data : fallback;
};

const shadow = { shadowColor: board.frameDark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 2, elevation: 2 };

const styles = StyleSheet.create({
  scrim: { backgroundColor: board.scrim },
  frame: {
    position: "absolute",
    alignSelf: "center",
    borderRadius: 18,
    borderWidth: 10,
    borderColor: board.frame,
    backgroundColor: board.frameDark,
    overflow: "hidden",
    shadowColor: board.drop,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  cork: { flexShrink: 1, backgroundColor: board.cork, borderRadius: 8, borderWidth: 2, borderColor: board.frameDark, overflow: "hidden" },
  speck: { position: "absolute", backgroundColor: board.speck },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6 },
  plaque: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: board.plaque,
    borderWidth: 2,
    borderColor: board.frameDark,
    ...shadow,
  },
  plaqueText: { fontFamily: fonts.display, fontSize: 19, color: board.ink, letterSpacing: -0.3 },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: board.tag },
  countText: { color: board.onTag, fontSize: 12, fontWeight: "800" },
  grow: { flex: 1 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: board.plaque, borderWidth: 2, borderColor: board.frameDark },
  pressed: { opacity: 0.6 },
  scroll: { flexGrow: 0 },
  stack: { gap: 14, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 18 },
  chalk: { color: board.ink, fontFamily: fonts.displaySemi, fontSize: 14, textAlign: "center", paddingVertical: 6 },
  paper: { backgroundColor: board.paper, borderRadius: 3, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10, gap: 4, ...shadow },
  notice: { backgroundColor: board.notice },
  pin: { position: "absolute", top: -5, alignSelf: "center", width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: board.pinEdge, ...shadow },
  pinShine: { position: "absolute", top: 2, left: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: board.pinShine },
  noteTitle: { fontFamily: fonts.display, fontSize: 17, color: board.ink, letterSpacing: -0.2 },
  noteBody: { fontSize: 15, lineHeight: 21, color: board.ink },
  meta: { fontSize: 12, color: board.muted, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  textButton: { paddingHorizontal: 10, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: board.frameDark },
  textButtonStrong: { backgroundColor: board.frameDark },
  textButtonText: { fontSize: 13, fontWeight: "800", color: board.ink },
  textButtonTextStrong: { color: board.plaque },
  addNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: 4,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: board.frameDark,
    backgroundColor: board.space,
  },
  addText: { fontFamily: fonts.displaySemi, fontSize: 15, color: board.ink },
  input: { color: board.ink, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: board.line },
  inputTitle: { fontFamily: fonts.display, fontSize: 17 },
  inputBody: { fontSize: 15, lineHeight: 21, minHeight: 72, textAlignVertical: "top" },
  label: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4, backgroundColor: board.frameDark, marginTop: 2 },
  labelText: { fontFamily: fonts.display, fontSize: 13, color: board.plaque, letterSpacing: 0.3 },
  slips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 },
  slipCell: { width: "48%" },
  slip: { minHeight: 96 },
  unread: { backgroundColor: board.unread },
  newTag: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3, backgroundColor: board.tag },
  newText: { color: board.onTag, fontSize: 11, fontWeight: "800" },
  slipTitle: { fontFamily: fonts.displaySemi, fontSize: 14, lineHeight: 18, color: board.ink },
  slipTitleUnread: { fontFamily: fonts.display },
  slipBody: { fontSize: 13, lineHeight: 17, color: board.muted },
  allLink: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: board.plaque, borderWidth: 2, borderColor: board.frameDark },
  allText: { fontFamily: fonts.displaySemi, fontSize: 14, color: board.ink },
});
