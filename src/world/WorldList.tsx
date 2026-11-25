import { Btn, Card, EmptyState, Muted, Screen } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { ASK_MS, CHAT_LOG_SIZE, CHAT_TTL_MS, EMOTE_TRAY, EMOTES, INTERACT_RADIUS, PLACE_TITLES, MAX_SAY_LENGTH, askInfo, posAt } from "@shared/world";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Id } from "../../convex/_generated/dataModel";
import { accepted, announce } from "./announce";
import { useWorldName, useWorldSetting } from "./settings";
import { useChatLog } from "./useChatLog";
import { PENDING, type useWorld } from "./useWorld";
import { clock, lineWhere, saidLabel, systemLine } from "./view";


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
  placeTitle,
  extra,
  online = 0,
  onPerson,
  note,
  onNote,
  onLine,
  duelCard,
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
  placeTitle?: string;
  extra?: ReactNode;
  /** People in the World right now, shown on the People button when above 0. */
  online?: number;
  onPerson: (memberId: string) => void;
  note: string | null;
  onNote: (note: string | null) => void;
  onLine: (memberId: Id<"worldMembers">, name: string) => void;
  duelCard?: ReactNode;
  /** Asks declined, as `${from}:${askAt}`. */
  declined: ReadonlySet<string>;
  onAccept: (from: string, askAt: number) => void;
  onDecline: (from: string, askAt: number) => void;
}) => {
  const t = useAppTheme();
  const [draft, setDraft] = useState("");
  const worldName = useWorldName();
  const [names] = useWorldSetting("names");
  const log = useChatLog(offline ? null : world.roomId, CHAT_LOG_SIZE);

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
      announce(saidLabel(line, names));
    }
  }, [log, muted, names]);

  const place = placeTitle ?? PLACE_TITLES[world.place];
  const title = world.instance > 1 ? `${place} · ${world.instance}` : place;

  // Asks made of you that are open: announced once each (VoiceOver), since
  // they lapse in 10 seconds wherever focus is.
  const meNow = world.people.find((p) => p.isMe);
  const openAsks = world.people.filter(
    (p) =>
      p.ask !== undefined &&
      p.ask.to === world.memberId &&
      world.serverNow() - p.ask.at < ASK_MS &&
      !declined.has(`${p.memberId}:${p.ask.at}`) &&
      !accepted(meNow, p.memberId, p.ask.at)
  );
  const askKeys = openAsks.map((p) => `${p.memberId}:${p.ask?.at}`).join(",");
  const told = useRef(new Set<string>());
  useEffect(() => {
    for (const p of openAsks) {
      const key = `${p.memberId}:${p.ask?.at}`;
      if (told.current.has(key)) continue;
      told.current.add(key);
      const info = askInfo(p.ask?.kind);
      if (info) announce(`${worldName(p.name)}: ${info.ask} You have 10 seconds to answer.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on which asks are open, not the array
  }, [askKeys]);

  // A line on screen goes when it passes the chat TTL, even if nothing else
  // changes: redraw at the oldest line's expiry.
  const [expired, setExpired] = useState(0);
  const { serverNow } = world;
  // The oldest line still showing: after it expires the redraw picks the
  // next, so each line goes on time even when nothing else changes.
  const showing = (log ?? []).filter((line) => serverNow() - line.at < CHAT_TTL_MS);
  const oldest = showing.length ? Math.min(...showing.map((line) => line.at)) : null;
  useEffect(() => {
    if (oldest === null) return;
    const id = setTimeout(() => setExpired((n) => n + 1), Math.max(0, oldest + CHAT_TTL_MS - serverNow()) + 50);
    return () => clearTimeout(id);
  }, [oldest, serverNow, expired]);

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
  // Unmuted lines still inside the chat TTL.
  const shown = (log ?? []).filter((line) => !muted.has(line.memberId) && now - line.at < CHAT_TTL_MS);
  const mePose = me?.walk ? posAt(me.walk, now) : null;
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const problem = await world.say(text);
    if (problem) {
      onNote(problem);
      setDraft((current) => (current === "" ? text : current));
    }
  };

  return (
    <Screen
      title={title}
      onBack={onBack}
      maxWidth={640}
      headerRight={<Btn title={online > 0 ? `People · ${online}` : "People"} icon="people-outline" variant="tonal" onPress={onPeople} />}
    >
      {extra}
      {duelCard}
      {/* Asks made of you, with time to answer: the same as over heads in the
          garden. A polite live region on the web; announced on iOS. */}
      <View aria-live="polite" style={styles.lines}>
      {openAsks
        .map((p) => {
          const askAt = p.ask!.at;
          const info = askInfo(p.ask!.kind);
          if (!info) return null;
          const left = Math.max(0, Math.ceil((ASK_MS - (now - askAt)) / 1000));
          return (
            <Card key={`ask-${p.memberId}`} style={styles.card}>
              <Text style={[typography.headline, { color: t.text }]} accessibilityRole="header" testID="world-list-ask">
                {info.icon} {worldName(p.name)}: {info.ask}
              </Text>
              <Muted>{`${left} second${left === 1 ? "" : "s"} to answer.`}</Muted>
              <View style={styles.compose}>
                <Btn title={`${info.label}!`} onPress={() => onAccept(p.memberId, askAt)} />
                <Btn title="Not now" variant="tonal" onPress={() => onDecline(p.memberId, askAt)} />
              </View>
            </Card>
          );
        })}
      </View>
      <Card style={styles.card}>
        <Text style={[typography.headline, { color: t.text }]} accessibilityRole="header">
          Here now
        </Text>
        {world.status === "joining" ? <Muted>Opening the garden…</Muted> : null}
        {world.error ? <Muted>{world.error}</Muted> : null}
        {world.people.map((p) => {
          const theirs = p.walk ? posAt(p.walk, now) : null;
          const detail = p.isMe
            ? "You · change your look"
            : p.reading
              ? "Doing devotional"
              : p.away
                ? "Playing at the arcade"
                : "Here";
          // Close enough for a high five? If not, a way to walk over: the list
          // view (and Android, which always has it) can't tap the ground.
          const gap = mePose && theirs ? Math.hypot(theirs.x - mePose.x, theirs.z - mePose.z) : 0;
          const walkOver =
            !p.isMe && mePose && theirs && gap > INTERACT_RADIUS
              ? () => {
                  const k = (gap - 1.2) / gap;
                  world.walkTo(mePose.x + (theirs.x - mePose.x) * k, mePose.z + (theirs.z - mePose.z) * k);
                }
              : null;
          return (
            // The row and Walk over sit side by side: a button can't hold another on the web.
            <View key={p.memberId} style={[styles.row, { borderColor: t.border }]}>
              <Pressable
                onPress={() => onPerson(p.memberId)}
                accessibilityRole="button"
                accessibilityLabel={p.isMe ? `${worldName(p.name)}, you. Change your look` : `${worldName(p.name)}, ${detail}${muted.has(p.memberId) ? ", muted" : ""}`}
                style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}
              >
                <Text style={[typography.body, { color: t.text, flex: 1 }]}>{worldName(p.name)}</Text>
                <Text style={[typography.caption, { color: t.muted }]}>
                  {muted.has(p.memberId) ? "Muted" : detail}
                </Text>
              </Pressable>
              {walkOver ? (
                <Pressable
                  onPress={walkOver}
                  accessibilityRole="button"
                  accessibilityLabel={`Walk over to ${worldName(p.name)}`}
                  testID="world-list-walk"
                  hitSlop={6}
                  style={({ pressed }) => [styles.walk, { backgroundColor: t.primarySoft }, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[typography.label, { color: t.dark ? t.text : t.primary }]}>Walk over</Text>
                </Pressable>
              ) : null}
            </View>
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
            onChangeText={(text) => {
              setDraft(text);
              world.typing(text.trim() !== "");
            }}
            onBlur={() => world.typing(false)}
            placeholder="Talk to everyone in the World…"
            placeholderTextColor={t.faint}
            maxLength={MAX_SAY_LENGTH}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
            submitBehavior="submit"
            accessibilityLabel="Talk to everyone in the World"
            testID="world-list-input"
            style={[styles.input, typography.body, { color: t.text, borderColor: t.border, backgroundColor: t.background }]}
          />
          <Btn title="Send" onPress={() => void send()} />
        </View>
        <View style={styles.emotes}>
          {EMOTE_TRAY.map((emote) => (
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
        {note ? (
          <Text style={[typography.caption, { color: t.danger }]} aria-live="polite">
            {note}
          </Text>
        ) : null}
        {log && shown.length === 0 ? <Muted>Nothing yet. Say hello.</Muted> : null}
        {/* On the web, a polite live region reads new lines out. */}
        <View aria-live="polite" style={styles.lines}>
        {shown
          .map((line) => line.kind ? (
            <Text
              key={line.id}
              style={[typography.caption, styles.line, { color: t.warning, fontWeight: "700" }]}
              accessibilityLabel={saidLabel(line, names)}
              testID="world-list-system"
            >
              [{clock(line.at)}] {systemLine(line, names)}
              {line.here ? "" : ` · ${lineWhere(line)}`}
            </Text>
          ) : (
            <Pressable
              key={line.id}
              style={styles.line}
              accessible
              accessibilityLabel={saidLabel(line, names)}
              accessibilityHint={line.isMe ? undefined : `Mute, block or report ${worldName(line.name)}`}
              disabled={line.isMe}
              onPress={() => onLine(line.memberId, line.name)}
            >
              <Text style={[typography.label, { color: t.text }]}>
                {line.isMe ? "You" : worldName(line.name)}{" "}
                <Text style={{ color: t.muted, fontWeight: "400" }}>
                  {/* Shown at once; marked until the server has it. */}
                  {line.id.startsWith(PENDING) ? "Sending…" : clock(line.at)}
                  {line.here ? "" : ` · ${lineWhere(line)}`}
                </Text>
              </Text>
              <Text style={[typography.body, { color: t.text }]}>{line.text}</Text>
            </Pressable>
          ))}
        </View>
        <Muted>Lines are kept for an hour, unless someone reports them.</Muted>
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
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  walk: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
});
