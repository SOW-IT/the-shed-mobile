import { useOffline } from "@/hooks/useOffline";
import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { canHear, EMOTES, MAX_SAY_LENGTH, posAt } from "@shared/world";
import { useEffect, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Garden } from "./Garden";
import { hud } from "./palette";
import { PeopleSheet, PersonSheet } from "./Sheets";
import { useWorld } from "./useWorld";
import { hearingLabel, pickView, type WorldView } from "./view";
import { WorldList } from "./WorldList";

const useScreenReader = () => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // The web can't tell (react-native-web always says yes), so the web
    // starts on the garden; the list is one tap away under People.
    if (Platform.OS === "web") return;
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => live && setOn(value))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setOn);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
};

const RoundButton = ({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    testID={testID}
    hitSlop={6}
    style={({ pressed }) => [styles.round, pressed && styles.pressed]}
  >
    <Ionicons name={icon} size={20} color={hud.forest} />
  </Pressable>
);

/** The SHED's leaf mark, drawn small for the title pill. */
const Mark = () => (
  <View style={styles.mark}>
    <Ionicons name="leaf" size={16} color={hud.cream} />
  </View>
);

const TitlePill = ({ instance }: { instance: number }) => (
  <View style={styles.title} accessibilityRole="header">
    <Mark />
    <Text style={styles.titleText}>{instance > 1 ? `The Garden · ${instance}` : "The Garden"}</Text>
  </View>
);

/**
 * Shed World, the Garden. Tap the ground to walk; type to talk to people
 * nearby. Shows the list view instead offline, with VoiceOver, or by choice.
 */
export const WorldScreen = ({ onBack, onArcade }: { onBack: () => void; onArcade: () => void }) => {
  const offline = useOffline();
  const screenReader = useScreenReader();
  const [chosen, setChosen] = useState<WorldView | null>(null);
  const view = pickView({ offline, screenReader, chosen });
  const world = useWorld(!offline);
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  const [person, setPerson] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [tray, setTray] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  // The chip counts who can hear you as people walk; once a second is plenty.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (view !== "garden") return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [view]);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(id);
  }, [note]);

  const toggleMute = (memberId: string) =>
    setMuted((set) => {
      const next = new Set(set);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const problem = await world.say(text);
    if (problem) {
      setNote(problem);
      setDraft(text);
    }
  };

  const sheets = (
    <>
      <PersonSheet
        person={world.people.find((p) => p.memberId === person) ?? null}
        muted={person !== null && muted.has(person)}
        onToggleMute={toggleMute}
        onWave={() => void world.act("👋")}
        onClose={() => setPerson(null)}
        onDone={setNote}
      />
      <PeopleSheet
        visible={peopleOpen}
        people={world.people}
        view={view}
        onView={(next) => {
          setChosen(next);
          setPeopleOpen(false);
        }}
        onPerson={(memberId) => {
          setPeopleOpen(false);
          setPerson(memberId);
        }}
        onClose={() => setPeopleOpen(false)}
      />
    </>
  );

  if (view === "list") {
    return (
      <>
        <WorldList
          world={world}
          offline={offline}
          muted={muted}
          onBack={onBack}
          onArcade={onArcade}
          onPeople={() => setPeopleOpen(true)}
          onPerson={setPerson}
          note={note}
          onNote={setNote}
        />
        {sheets}
      </>
    );
  }

  const now = world.serverNow();
  const me = world.people.find((p) => p.isMe);
  const mePose = me?.walk ? posAt(me.walk, now) : null;
  const hearing = mePose
    ? world.people.filter((p) => !p.isMe && p.walk && canHear(mePose, posAt(p.walk, now))).length
    : 0;

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Garden
        people={world.people.map((p) => ({
          memberId: p.memberId,
          name: p.name,
          look: p.look,
          me: p.isMe,
          walk: p.walk,
          say: p.say,
          act: p.act,
          muted: muted.has(p.memberId),
        }))}
        serverNow={world.serverNow}
        target={world.target}
        onTapGround={(x, z) => {
          setTray(false);
          world.walkTo(x, z);
        }}
        onTapPerson={setPerson}
        onTapArcade={onArcade}
      />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <RoundButton icon="chevron-back" label="Back" onPress={onBack} testID="world-back" />
        <TitlePill instance={world.instance} />
        <RoundButton icon="people-outline" label="People here" onPress={() => setPeopleOpen(true)} testID="world-people" />
      </View>
      <View style={[styles.chipRow, { top: insets.top + 66 }]} pointerEvents="none">
        <View style={styles.chip} testID="world-hearing">
          <View style={styles.chipRing} />
          <Text style={styles.chipText}>
            {world.status === "joining" ? "Opening the garden…" : world.status === "error" ? world.error : hearingLabel(hearing)}
          </Text>
        </View>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
        {tray ? (
          <View style={styles.tray}>
            {EMOTES.map((emote) => (
              <Pressable
                key={emote}
                onPress={() => {
                  setTray(false);
                  void world.act(emote);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Emote ${emote}`}
                style={({ pressed }) => [styles.trayItem, pressed && styles.pressed]}
              >
                <Text style={styles.trayEmoji}>{emote}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.chat}>
          <Pressable
            onPress={() => setTray((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Emotes"
            testID="world-emotes"
            style={({ pressed }) => [styles.emo, pressed && styles.pressed]}
          >
            <Text style={styles.emoText}>🌸</Text>
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Talk to people nearby…"
            placeholderTextColor={hud.placeholder}
            maxLength={MAX_SAY_LENGTH}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
            submitBehavior="submit"
            style={styles.input}
            accessibilityLabel="Talk to people nearby"
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
      </View>
      {sheets}
    </KeyboardAvoidingView>
  );
};

const ink = { borderWidth: 2.5, borderColor: hud.forest };
const pop = { shadowColor: hud.forest, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0 };

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: hud.cream },
  pressed: { opacity: 0.75 },
  top: {
    position: "absolute",
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: hud.card,
    alignItems: "center",
    justifyContent: "center",
    ...ink,
    ...pop,
  },
  title: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: hud.card,
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: 16,
    paddingVertical: 6,
    ...ink,
    ...pop,
  },
  mark: { width: 30, height: 30, borderRadius: 15, backgroundColor: hud.primary, alignItems: "center", justifyContent: "center" },
  titleText: { fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.3, color: hud.forest },
  chipRow: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: hud.chip,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  chipRing: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderStyle: "dashed", borderColor: hud.chipRing },
  chipText: { color: hud.cream, fontSize: 12.5, fontWeight: "600" },
  note: {
    backgroundColor: hud.card,
    color: hud.forest,
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    ...ink,
  },
  bottom: { position: "absolute", left: 14, right: 14, bottom: 0, gap: 10 },
  tray: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    backgroundColor: hud.card,
    borderRadius: 999,
    padding: 5,
    ...ink,
    ...pop,
  },
  trayItem: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: hud.accentSoft },
  trayEmoji: { fontSize: 22 },
  chat: {
    height: 54,
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
