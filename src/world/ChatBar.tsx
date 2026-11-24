import Ionicons from "@expo/vector-icons/Ionicons";
import { EMOTE_TRAY, EMOTES, MAX_SAY_LENGTH, TYPING_REFRESH_MS } from "@shared/world";
import { useRef, useState } from "react";
import { Animated, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { itemStyle, popStyle, useOverlayClock } from "./Overlays";
import { hud } from "./palette";

export const CHAT_BAR_HEIGHT = 54;

const EmoteTray = ({ open, onEmote }: { open: boolean; onEmote: (id: string) => void }) => {
  const overlay = useOverlayClock(open, EMOTE_TRAY.length);
  if (!overlay.mounted) return null;
  return (
    <Animated.View style={[styles.tray, popStyle(overlay)]} pointerEvents={open ? "auto" : "none"} testID="world-emote-tray">
      {EMOTE_TRAY.map((id, i) => (
        <Animated.View key={id} style={[styles.trayCell, itemStyle(overlay, i)]}>
          <Pressable
            onPress={() => onEmote(id)}
            accessibilityRole="button"
            accessibilityLabel={`Emote: ${EMOTES[id].label}`}
            testID={`world-emote-${id}`}
            style={({ pressed }) => [styles.trayItem, pressed && styles.pressed]}
          >
            <Text style={styles.trayEmoji}>{EMOTES[id].icon}</Text>
            <Text style={styles.trayLabel} numberOfLines={1}>
              {EMOTES[id].label}
            </Text>
          </Pressable>
        </Animated.View>
      ))}
    </Animated.View>
  );
};

export const ChatBar = ({
  keyboardOpen,
  tray,
  onTray,
  onEmote,
  say,
  typing,
  onTypingAt,
  serverNow,
  onNote,
}: {
  keyboardOpen: boolean;
  tray: boolean;
  onTray: (open: boolean) => void;
  onEmote: (id: string) => void;
  say: (text: string) => Promise<string | null>;
  typing: (on: boolean) => void;
  onTypingAt: (at: number | null) => void;
  serverNow: () => number;
  onNote: (note: string) => void;
}) => {
  const [draft, setDraft] = useState("");
  const shownAt = useRef<number | null>(null);

  const markTyping = (on: boolean) => {
    typing(on);
    if (!on) {
      if (shownAt.current !== null) onTypingAt(null);
      shownAt.current = null;
      return;
    }
    const at = serverNow();
    if (shownAt.current !== null && at - shownAt.current < TYPING_REFRESH_MS) return;
    shownAt.current = at;
    onTypingAt(at);
  };

  const editDraft = (text: string) => {
    setDraft(text);
    markTyping(text.trim() !== "");
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    markTyping(false);
    const problem = await say(text);
    if (problem) {
      onNote(problem);
      setDraft((current) => (current === "" ? text : current));
    }
  };

  return (
    <>
      <EmoteTray
        open={tray}
        onEmote={(id) => {
          onTray(false);
          onEmote(id);
        }}
      />
      <View style={styles.chat}>
        {keyboardOpen ? (
          <Pressable
            onPress={Keyboard.dismiss}
            accessibilityRole="button"
            accessibilityLabel="Hide keyboard"
            testID="world-keyboard-close"
            style={({ pressed }) => [styles.emo, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={20} color={hud.forest} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onTray(!tray)}
            accessibilityRole="button"
            accessibilityLabel="Emotes"
            testID="world-emotes"
            style={({ pressed }) => [styles.emo, pressed && styles.pressed]}
          >
            <Text style={styles.emoText}>🌸</Text>
          </Pressable>
        )}
        <TextInput
          value={draft}
          onChangeText={editDraft}
          onFocus={() => {
            onTray(false);
            if (draft.trim()) markTyping(true);
          }}
          onBlur={() => markTyping(false)}
          placeholder="Talk to everyone in the World…"
          placeholderTextColor={hud.placeholder}
          maxLength={MAX_SAY_LENGTH}
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          submitBehavior="submit"
          style={styles.input}
          accessibilityLabel="Talk to everyone in the World"
          testID="world-chat-input"
        />
        <Pressable
          onPress={() => void send()}
          accessibilityRole="button"
          accessibilityLabel="Send"
          testID="world-send"
          style={({ pressed }) => [styles.send, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-up" size={20} color={hud.onAccent} />
        </Pressable>
      </View>
    </>
  );
};

const ink = { borderWidth: 2.5, borderColor: hud.forest };
const pop = { shadowColor: hud.forest, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0 };

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  tray: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: hud.card,
    borderRadius: 22,
    padding: 8,
    transformOrigin: "bottom left",
    ...ink,
    ...pop,
  },
  trayCell: { flex: 1 },
  trayItem: { height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: hud.accentSoft },
  trayEmoji: { fontSize: 22 },
  trayLabel: { fontSize: 10.5, fontWeight: "600", color: hud.forest, marginTop: 2 },
  chat: {
    height: CHAT_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: hud.card,
    borderRadius: 27,
    paddingHorizontal: 6,
    ...ink,
    ...pop,
    shadowOffset: { width: 0, height: 4 },
  },
  emo: { width: 38, height: 38, borderRadius: 19, backgroundColor: hud.accentSoft, alignItems: "center", justifyContent: "center" },
  emoText: { fontSize: 20 },
  input: { flex: 1, fontSize: 15.5, color: hud.forest, paddingVertical: 8 },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: hud.accent,
    alignItems: "center",
    justifyContent: "center",
    ...ink,
  },
});
