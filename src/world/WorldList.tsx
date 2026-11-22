import { Btn, Card, EmptyState, Muted, Screen } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { ASK_MS, canHear, EMOTE_IDS, EMOTES, MAX_SAY_LENGTH, MUTUALS, posAt } from "@shared/world";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { useWorld } from "./useWorld";

const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * The garden without the drawing: who's here, who can hear you, and the last
 * lines said. It reads only the roster and the chat log. Offline it says so
 * and offers the games.
 */
export const WorldList = ({
  world,
  offline,
  muted,
  onBack,
  onArcade,
  onPeople,
  onPerson,
  note,
  onNote,
  declined,
  onAccept,
  onDecline,
}: {
  world: ReturnType<typeof useWorld>;
  offline: boolean;
  muted: ReadonlySet<string>;
  onBack: () => void;
  onArcade: () => void;
  onPeople: () => void;
  onPerson: (memberId: string) => void;
  note: string | null;
  onNote: (note: string | null) => void;
  /** Asks declined, as `${from}:${askAt}`. */
  declined: ReadonlySet<string>;
  onAccept: (from: string, askAt: number) => void;
  onDecline: (from: string, askAt: number) => void;
}) => {
  const t = useAppTheme();
  const [draft, setDraft] = useState("");
  const log = useQuery(api.world.chatLog, world.roomId && !offline ? { roomId: world.roomId } : "skip");

  // Read new lines from others aloud as they arrive (VoiceOver), but not the
  // history that was there when the list opened.
  const heard = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!log) return;
    const known = heard.current;
    heard.current = new Set(log.map((line) => line.id));
    if (!known || Platform.OS === "web") return;
    for (const line of [...log].reverse()) {
      if (known.has(line.id) || line.isMe || muted.has(line.memberId)) continue;
      AccessibilityInfo.announceForAccessibilityWithOptions(`${line.name} said ${line.text}`, { queue: true });
    }
  }, [log, muted]);

  const title = world.instance > 1 ? `The Garden · ${world.instance}` : "The Garden";

  if (offline) {
    return (
      <Screen title="The Garden" onBack={onBack} maxWidth={640}>
        <EmptyState
          icon="cloud-offline-outline"
          title="You're offline"
          message="The garden needs a connection to see who's here. The games work offline."
        />
        <Btn title="Play a game" icon="game-controller-outline" onPress={onArcade} />
      </Screen>
    );
  }

  const now = world.serverNow();
  const me = world.people.find((p) => p.isMe);
  const mePose = me?.walk ? posAt(me.walk, now) : null;
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const problem = await world.say(text);
    if (problem) {
      onNote(problem);
      // Put it back, unless they've started typing something new.
      setDraft((current) => (current === "" ? text : current));
    }
  };

  return (
    <Screen
      title={title}
      onBack={onBack}
      maxWidth={640}
      headerRight={<Btn title="People" icon="people-outline" variant="tonal" onPress={onPeople} />}
    >
      {/* Asks made of you, with time to answer: the same as over heads in the garden. */}
      {world.people
        .filter(
          (p) =>
            p.ask &&
            p.ask.to === world.memberId &&
            now - p.ask.at < ASK_MS &&
            !declined.has(`${p.memberId}:${p.ask.at}`) &&
            !(me?.reply?.to === p.memberId && me.reply.askAt === p.ask.at)
        )
        .map((p) => {
          const askAt = p.ask!.at;
          const info = MUTUALS[p.ask!.kind as keyof typeof MUTUALS];
          if (!info) return null;
          const left = Math.max(0, Math.ceil((ASK_MS - (now - askAt)) / 1000));
          return (
            <Card key={`ask-${p.memberId}`} style={styles.card}>
              <Text style={[typography.headline, { color: t.text }]} accessibilityRole="header" testID="world-list-ask">
                {info.icon} {p.name}: {info.ask}
              </Text>
              <Muted>{`${left} second${left === 1 ? "" : "s"} to answer.`}</Muted>
              <View style={styles.compose}>
                <Btn title={`${info.label}!`} onPress={() => onAccept(p.memberId, askAt)} />
                <Btn title="Not now" variant="tonal" onPress={() => onDecline(p.memberId, askAt)} />
              </View>
            </Card>
          );
        })}
      <Card style={styles.card}>
        <Text style={[typography.headline, { color: t.text }]} accessibilityRole="header">
          Here now
        </Text>
        {world.status === "joining" ? <Muted>Opening the garden…</Muted> : null}
        {world.error ? <Muted>{world.error}</Muted> : null}
        {world.people.map((p) => {
          const near = mePose && p.walk && !p.isMe ? canHear(mePose, posAt(p.walk, now)) : false;
          const detail = p.isMe ? "You" : near ? "Can hear you" : "Out of earshot";
          return (
            <Pressable
              key={p.memberId}
              disabled={p.isMe}
              onPress={() => onPerson(p.memberId)}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${detail}${muted.has(p.memberId) ? ", muted" : ""}`}
              style={({ pressed }) => [styles.row, { borderColor: t.border }, pressed && { opacity: 0.7 }]}
            >
              <Text style={[typography.body, { color: t.text, flex: 1 }]}>{p.name}</Text>
              <Text style={[typography.caption, { color: t.muted }]}>
                {muted.has(p.memberId) ? "Muted" : detail}
              </Text>
            </Pressable>
          );
        })}
      </Card>
      <Card style={styles.card}>
        <Text style={[typography.headline, { color: t.text }]} accessibilityRole="header">
          Said lately
        </Text>
        <View style={styles.compose}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Talk to people nearby…"
            placeholderTextColor={t.faint}
            maxLength={MAX_SAY_LENGTH}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
            submitBehavior="submit"
            accessibilityLabel="Talk to people nearby"
            testID="world-list-input"
            style={[styles.input, typography.body, { color: t.text, borderColor: t.border, backgroundColor: t.background }]}
          />
          <Btn title="Send" onPress={() => void send()} />
        </View>
        <View style={styles.emotes}>
          {EMOTE_IDS.map((emote) => (
            <Pressable
              key={emote}
              onPress={() => void world.act(emote)}
              accessibilityRole="button"
              accessibilityLabel={`Emote: ${EMOTES[emote].label}`}
              style={({ pressed }) => [styles.emote, { backgroundColor: t.primarySoft }, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.emoteText}>{EMOTES[emote].icon}</Text>
            </Pressable>
          ))}
        </View>
        {note ? <Text style={[typography.caption, { color: t.danger }]}>{note}</Text> : null}
        {log && log.filter((l) => !muted.has(l.memberId)).length === 0 ? <Muted>Nothing yet. Say hello.</Muted> : null}
        {/* On the web, a polite live region reads new lines out. */}
        <View aria-live="polite" style={styles.lines}>
        {(log ?? [])
          .filter((line) => !muted.has(line.memberId))
          .map((line) => (
            <View key={line.id} style={styles.line} accessible accessibilityLabel={`${line.isMe ? "You" : line.name} said ${line.text}`}>
              <Text style={[typography.label, { color: t.text }]}>
                {line.isMe ? "You" : line.name} <Text style={{ color: t.muted, fontWeight: "400" }}>{clock(line.at)}</Text>
              </Text>
              <Text style={[typography.body, { color: t.text }]}>{line.text}</Text>
            </View>
          ))}
        </View>
        <Muted>Lines are kept for 15 minutes, unless someone reports them.</Muted>
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compose: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  emotes: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  emote: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emoteText: { fontSize: 20 },
  line: { gap: 2, paddingVertical: spacing.xs },
  lines: { gap: spacing.xs },
});
