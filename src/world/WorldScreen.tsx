import { useOffline } from "@/hooks/useOffline";
import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { distance, EMOTE_IDS, EMOTES, INTERACT_RADIUS, MAX_SAY_LENGTH, posAt } from "@shared/world";
import { useEffect, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CharacterEditor } from "./CharacterEditor";
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
export const WorldScreen = ({
  onBack,
  onArcade,
  active = true,
}: {
  onBack: () => void;
  onArcade: () => void;
  /** False while another screen covers this one: the visit ends until it's back. */
  active?: boolean;
}) => {
  const offline = useOffline();
  const screenReader = useScreenReader();
  const [chosen, setChosen] = useState<WorldView | null>(null);
  const view = pickView({ offline, screenReader, chosen, canDraw: Platform.OS !== "android" });
  const world = useWorld(!offline && active);
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  const [person, setPerson] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [tray, setTray] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Asks you've turned down, as `${from}:${askAt}`. Declining sends nothing:
  // the ask just runs out.
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const insets = useSafeAreaInsets();
  // How many can hear you, as the garden draws it.
  const [hearing, setHearing] = useState(0);

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
      // Put it back, unless they've started typing something new.
      setDraft((current) => (current === "" ? text : current));
    }
  };

  const now = world.serverNow();
  const me = world.people.find((p) => p.isMe);
  const mePose = me?.walk ? posAt(me.walk, now) : null;
  const tapped = world.people.find((p) => p.memberId === person) ?? null;
  const tappedPose = tapped?.walk ? posAt(tapped.walk, now) : null;
  const near = mePose !== null && tappedPose !== null && distance(mePose, tappedPose) <= INTERACT_RADIUS;

  const sheets = (
    <>
      <PersonSheet
        // A report started for one person never carries over to another.
        key={person ?? "nobody"}
        person={tapped}
        muted={person !== null && muted.has(person)}
        near={near}
        onToggleMute={toggleMute}
        onWave={() => void world.act("wave")}
        onHighFive={(to) => void world.ask(to, "highFive").then((problem) => setNote(problem ?? "Asked. They have 10 seconds to say yes."))}
        onCustomize={() => {
          setPerson(null);
          setEditing(true);
        }}
        onClose={() => setPerson(null)}
        onDone={setNote}
      />
      <CharacterEditor visible={editing} look={me?.look ?? { skin: 0, hair: 0, hairColour: 0, shirt: 0 }} onSave={world.saveLook} onClose={() => setEditing(false)} />
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
        onCustomize={() => {
          setPeopleOpen(false);
          setEditing(true);
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
          ask: p.ask,
          reply: p.reply,
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
        onAccept={(from) => {
          const p = world.people.find((x) => x.memberId === from);
          if (p) void world.accept(p.memberId).then((problem) => problem && setNote(problem));
        }}
        onDecline={(from, askAt) => setDeclined((set) => new Set(set).add(`${from}:${askAt}`))}
        declined={declined}
        onHearing={setHearing}
      />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <RoundButton icon="chevron-back" label="Back" onPress={onBack} testID="world-back" />
        <TitlePill instance={world.instance} />
        <RoundButton icon="people-outline" label="People here" onPress={() => setPeopleOpen(true)} testID="world-people" />
      </View>
      <View style={[styles.side, { top: insets.top + 64 }]} pointerEvents="box-none">
        <RoundButton icon="shirt-outline" label="Customize your character" onPress={() => setEditing(true)} testID="world-customize" />
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
          <View style={styles.tray} testID="world-emote-tray">
            {EMOTE_IDS.map((id) => (
              <Pressable
                key={id}
                onPress={() => {
                  setTray(false);
                  void world.act(id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Emote: ${EMOTES[id].label}`}
                testID={`world-emote-${id}`}
                style={({ pressed }) => [styles.trayItem, pressed && styles.pressed]}
              >
                <Text style={styles.trayEmoji}>{EMOTES[id].icon}</Text>
                <Text style={styles.trayLabel}>{EMOTES[id].label}</Text>
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
  side: { position: "absolute", right: 14 },
  tray: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    backgroundColor: hud.card,
    borderRadius: 22,
    padding: 8,
    ...ink,
    ...pop,
  },
  trayItem: { width: 54, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: hud.accentSoft },
  trayEmoji: { fontSize: 22 },
  trayLabel: { fontSize: 10.5, fontWeight: "600", color: hud.forest, marginTop: 2 },
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
