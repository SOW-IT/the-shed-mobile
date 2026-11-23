import { useOffline } from "@/hooks/useOffline";
import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { clampTarget, distance, EMOTE_TRAY, EMOTES, INTERACT_RADIUS, MAX_SAY_LENGTH, MUTUALS, OBSTACLES, posAt } from "@shared/world";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { announce } from "./announce";
import { APPROACH_MS, approachStep } from "./approach";
import { CharacterEditor } from "./CharacterEditor";
import { Garden } from "./Garden";
import { hud } from "./palette";
import type { HudAction } from "./PersonHud";
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

const KEYBOARD_GAP = 8;

const useKeyboardLift = (bottomInset: number) => {
  const [lift] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const move = (toValue: number, duration: number) =>
      Animated.timing(lift, { toValue, duration: duration || 250, useNativeDriver: true }).start();
    const show = Keyboard.addListener("keyboardWillShow", (e) => {
      setOpen(true);
      move(-Math.max(0, e.endCoordinates.height - bottomInset + KEYBOARD_GAP), e.duration);
    });
    const hide = Keyboard.addListener("keyboardWillHide", (e) => {
      setOpen(false);
      move(0, e.duration);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [lift, bottomInset]);
  return { lift, open };
};

const ARCADE = OBSTACLES.find((o) => o.id === "arcade")!;
const ARCADE_SPOT = clampTarget(ARCADE.x + 0.9, ARCADE.z + 0.9);
const AT_ARCADE = 0.3;
const ARCADE_TRIP_MS = 20_000;

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
  away = false,
}: {
  onBack: () => void;
  onArcade: () => void;
  /** False while another screen covers this one: the visit ends until it's back. */
  active?: boolean;
  away?: boolean;
}) => {
  const offline = useOffline();
  const screenReader = useScreenReader();
  const [chosen, setChosen] = useState<WorldView | null>(null);
  const view = pickView({ offline, screenReader, chosen, canDraw: Platform.OS !== "android" });
  const world = useWorld(!offline && active, away);
  const [arcadeTrip, setArcadeTrip] = useState<number | null>(null);
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  const [person, setPerson] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ memberId: string; safetyOnly: boolean } | null>(null);
  const [approach, setApproach] = useState<{ to: string; since: number } | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [tray, setTray] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // The editor closes with the visit (your look goes with it); open it again after.
  const hasMe = world.people.some((p) => p.isMe);
  if (editing && !hasMe && world.status !== "in") setEditing(false);
  // Asks you've turned down, as `${from}:${askAt}`. Declining sends nothing:
  // the ask just runs out.
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardLift(Math.max(insets.bottom, 12));
  // How many can hear you, as the garden draws it.
  const [hearing, setHearing] = useState(0);

  useEffect(() => {
    if (!note) return;
    // Read it out too: it goes in 3.5 seconds, wherever focus is.
    announce(note);
    const id = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(id);
  }, [note]);

  const accept = (from: string, askAt: number) => {
    const p = world.people.find((x) => x.memberId === from);
    if (p) void world.accept(p.memberId, askAt).then((problem) => problem && setNote(problem));
  };
  const decline = (from: string, askAt: number) => setDeclined((set) => new Set(set).add(`${from}:${askAt}`));

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
  const meOnServer = world.serverWalk ? posAt(world.serverWalk, now) : mePose;
  const selected = world.people.find((p) => p.memberId === person) ?? null;
  if (person !== null && !selected && world.status === "in") setPerson(null);
  const tapped = world.people.find((p) => p.memberId === sheet?.memberId) ?? null;
  const tappedPose = tapped?.walk ? posAt(tapped.walk, now) : null;
  const near = meOnServer !== null && tappedPose !== null && distance(meOnServer, tappedPose) <= INTERACT_RADIUS;
  const firstName = (memberId: string) => world.people.find((p) => p.memberId === memberId)?.name.split(" ")[0] ?? "them";

  const askHighFive = (to: string) => {
    const other = world.people.find((p) => p.memberId === to);
    if (other) void world.ask(other.memberId, "highFive").then((problem) => setNote(problem ?? "Asked. They have 10 seconds to say yes."));
  };

  const live = useRef({ world, askHighFive });
  useEffect(() => {
    live.current = { world, askHighFive };
  });
  const aimedAt = useRef<string | null>(null);
  const stepToward = (to: string, since: number): boolean => {
    const { world: latest, askHighFive: ask } = live.current;
    const at = latest.serverNow();
    const mine = latest.people.find((p) => p.isMe);
    const theirs = latest.people.find((p) => p.memberId === to);
    if (!mine?.walk || !theirs?.walk) {
      setNote("They've left the garden.");
      return false;
    }
    const drawn = posAt(mine.walk, at);
    const known = latest.serverWalk ? posAt(latest.serverWalk, at) : drawn;
    const step = approachStep({
      mine: { ...known, walking: known.walking || drawn.walking, arrivesAt: Math.max(known.arrivesAt, drawn.arrivesAt) },
      theirs: posAt(theirs.walk, at),
      theirGoal: { x: theirs.walk.toX, z: theirs.walk.toZ },
      aimedAt: aimedAt.current,
      now: at,
    });
    if (step.kind === "ask") {
      ask(to);
      return false;
    }
    if (step.kind === "giveUp" || Date.now() - since > APPROACH_MS) {
      setNote(`Couldn't get close to ${theirs.name.split(" ")[0]}.`);
      return false;
    }
    if (step.kind === "walk") {
      aimedAt.current = step.aimedAt;
      latest.walkTo(step.to.x, step.to.z);
    }
    return true;
  };
  useEffect(() => {
    if (!approach) return;
    const id = setInterval(() => {
      if (!stepToward(approach.to, approach.since)) setApproach(null);
    }, 150);
    return () => clearInterval(id);
  }, [approach]);

  useEffect(() => {
    if (arcadeTrip === null) return;
    const id = setInterval(() => {
      const { world: latest } = live.current;
      const at = latest.serverNow();
      const mine = latest.people.find((p) => p.isMe);
      const pose = mine?.walk ? posAt(mine.walk, at) : null;
      const arrived = pose !== null && distance(pose, ARCADE_SPOT) <= AT_ARCADE;
      const strayed = pose === null || (!pose.walking && at - pose.arrivesAt > 400) || Date.now() - arcadeTrip > ARCADE_TRIP_MS;
      if (!arrived && !strayed) return;
      setArcadeTrip(null);
      if (arrived) onArcade();
    }, 120);
    return () => clearInterval(id);
  }, [arcadeTrip, onArcade]);

  const goToArcade = () => {
    setPerson(null);
    setApproach(null);
    setTray(false);
    if (!mePose) return onArcade();
    if (distance(mePose, ARCADE_SPOT) <= AT_ARCADE) return onArcade();
    world.walkTo(ARCADE_SPOT.x, ARCADE_SPOT.z);
    setArcadeTrip(Date.now());
    setNote("Walking to the arcade…");
  };

  const emote = (id: string) => void world.act(id).then((problem) => problem && setNote(problem));

  const highFive = (to: string) => {
    setPerson(null);
    aimedAt.current = null;
    const since = Date.now();
    if (!stepToward(to, since)) return setApproach(null);
    setApproach({ to, since });
    setNote(`Walking over to ${firstName(to)}…`);
  };

  const hudActions: HudAction[] = !selected
    ? []
    : selected.isMe
      ? [
          {
            id: "customize",
            label: "Outfit",
            hint: "Customize your character",
            icon: "shirt-outline",
            onPress: () => {
              setPerson(null);
              setEditing(true);
            },
          },
          {
            id: "emotes",
            label: "Emotes",
            hint: "Emotes",
            emoji: "🌸",
            onPress: () => {
              setPerson(null);
              setTray(true);
            },
          },
        ]
      : [
          ...(selected.away
            ? []
            : [
                {
                  id: "highfive",
                  label: MUTUALS.highFive.label,
                  hint: `${MUTUALS.highFive.label} with ${selected.name}`,
                  emoji: MUTUALS.highFive.icon,
                  onPress: () => highFive(selected.memberId),
                },
              ]),
          {
            id: "wave",
            label: EMOTES.wave.label,
            hint: `Wave at ${selected.name}`,
            emoji: EMOTES.wave.icon,
            onPress: () => {
              setPerson(null);
              emote("wave");
            },
          },
          {
            id: "more",
            label: "More",
            hint: `Mute, block or report ${selected.name}`,
            icon: "ellipsis-horizontal",
            onPress: () => {
              setPerson(null);
              setSheet({ memberId: selected.memberId, safetyOnly: true });
            },
          },
        ];

  const sheets = (
    <>
      <PersonSheet
        // A report started for one person never carries over to another.
        key={sheet?.memberId ?? "nobody"}
        person={tapped}
        safetyOnly={sheet?.safetyOnly ?? false}
        muted={sheet !== null && muted.has(sheet.memberId)}
        near={near}
        onToggleMute={toggleMute}
        onWave={() => emote("wave")}
        onHighFive={askHighFive}
        onCustomize={() => {
          setSheet(null);
          setEditing(true);
        }}
        onClose={() => setSheet(null)}
        onDone={setNote}
      />
      {/* Only once your look has loaded, so a draft never starts from a placeholder. */}
      {me ? <CharacterEditor
          visible={editing}
          look={me.look}
          onSave={(look) => world.saveLook(look).then((problem) => problem && setNote(`Your new look didn't save. ${problem}`))}
          onClose={() => setEditing(false)}
        /> : null}
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
          if (view === "list") setSheet({ memberId, safetyOnly: false });
          else setPerson(memberId);
        }}
        onCustomize={() => {
          setPeopleOpen(false);
          setEditing(true);
        }}
        onClose={() => setPeopleOpen(false)}
      />
    </>
  );

  if (away) return <View style={styles.fill} />;

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
          onPerson={(memberId) => setSheet({ memberId, safetyOnly: false })}
          note={note}
          onNote={setNote}
          declined={declined}
          onAccept={accept}
          onDecline={decline}
        />
        {sheets}
      </>
    );
  }


  return (
    <View style={styles.fill}>
      <Garden
        people={world.people.map((p) => ({
          memberId: p.memberId,
          name: p.name,
          look: p.look,
          me: p.isMe,
          walk: p.walk,
          gait: p.gait,
          say: p.say,
          act: p.act,
          ask: p.ask,
          reply: p.reply,
          answered: p.answered,
          muted: muted.has(p.memberId),
          away: p.away !== undefined,
        }))}
        serverNow={world.serverNow}
        target={world.target}
        onHoldStart={(x, z) => {
          setTray(false);
          setPerson(null);
          setApproach(null);
          setArcadeTrip(null);
          world.holdStart(x, z);
        }}
        onHoldMove={world.holdMove}
        onHoldEnd={world.holdEnd}
        onTapPerson={(memberId) => {
          setTray(false);
          setPerson((current) => (current === memberId ? null : memberId));
        }}
        selected={person}
        hudActions={hudActions}
        onTapArcade={goToArcade}
        onAccept={accept}
        onDecline={decline}
        declined={declined}
        onHearing={setHearing}
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
        {note ? (
          <Text style={styles.note} accessibilityLiveRegion="polite" aria-live="polite">
            {note}
          </Text>
        ) : null}
      </View>
      {keyboard.open ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={Keyboard.dismiss}
          accessibilityRole="button"
          accessibilityLabel="Hide keyboard"
          testID="world-keyboard-dismiss"
        />
      ) : null}
      <Animated.View
        style={[
          styles.bottom,
          { paddingBottom: Math.max(insets.bottom, 12) },
          { transform: [{ translateY: keyboard.lift }] },
        ]}
        pointerEvents="box-none"
      >
        {tray ? (
          <View style={styles.tray} testID="world-emote-tray">
            {EMOTE_TRAY.map((id) => (
              <Pressable
                key={id}
                onPress={() => {
                  setTray(false);
                  emote(id);
                }}
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
            ))}
          </View>
        ) : null}
        <View style={styles.chat}>
          {keyboard.open ? (
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
              onPress={() => setTray((open) => !open)}
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
            onChangeText={setDraft}
            onFocus={() => setTray(false)}
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
      </Animated.View>
      {sheets}
    </View>
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
    flexDirection: "row",
    gap: 6,
    backgroundColor: hud.card,
    borderRadius: 22,
    padding: 8,
    ...ink,
    ...pop,
  },
  trayItem: { flex: 1, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: hud.accentSoft },
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
