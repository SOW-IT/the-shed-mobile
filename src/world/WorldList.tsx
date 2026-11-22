import { Btn, Card, EmptyState, Muted, Screen } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { canHear, EMOTE_IDS, EMOTES, MAX_SAY_LENGTH, posAt } from "@shared/world";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
}) => {
  const t = useAppTheme();
  const [draft, setDraft] = useState("");
  const log = useQuery(api.world.chatLog, world.roomId && !offline ? { roomId: world.roomId } : "skip");
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
      setDraft(text);
    }
  };

  return (
    <Screen
      title={title}
      onBack={onBack}
      maxWidth={640}
      headerRight={<Btn title="People" icon="people-outline" variant="tonal" onPress={onPeople} />}
    >
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
});
