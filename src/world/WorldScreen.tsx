import { useOffline } from "@/hooks/useOffline";
import { useWorldOnline } from "@/hooks/useWorldOnline";
import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  clampTarget,
  distance,
  EMOTE_TRAY,
  EMOTES,
  MAX_SAY_LENGTH,
  MUTUALS,
  OBSTACLES,
  PLACE_TITLES,
  PLACES,
  SEATS,
  pingBars,
  portalAt,
  posAt,
  ASKS,
  type AskKind,
  type DuelPick,
  type Place,
} from "@shared/world";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { announce } from "./announce";
import { APPROACH_MS, approachStep } from "./approach";
import { CharacterEditor } from "./CharacterEditor";
import { Garden } from "./Garden";
import { hud } from "./palette";
import type { HudAction } from "./PersonHud";
import { PersonSheet } from "./Sheets";
import { PeoplePanel } from "./People";
import { connectionLabel, LeaveDialog, PLACE_ICONS, WifiBars, WorldMenu, type MenuEntry } from "./Overlays";
import { useWorld } from "./useWorld";
import { pickView } from "./view";
import { ChatLog } from "./ChatLog";
import { duelFor } from "./duel";
import { DuelCard } from "./DuelCard";
import { WorldList } from "./WorldList";
import type { Id } from "../../convex/_generated/dataModel";

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
const BESIDE = 1.2;
const FOLLOW_MS = 12_000;
const ARCADE_TRIP_MS = 20_000;
const SAME_FURNITURE = 1.7;

const RoundButton = ({
  icon,
  label,
  onPress,
  testID,
  badge = 0,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
  /** A count in the corner; hidden at 0. */
  badge?: number;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={badge > 0 ? `${label}, ${badge} online` : label}
    testID={testID}
    hitSlop={6}
    style={({ pressed }) => [styles.round, pressed && styles.pressed]}
  >
    <Ionicons name={icon} size={20} color={hud.forest} />
    {badge > 0 ? (
      <View style={styles.badge} testID={testID ? `${testID}-badge` : undefined}>
        <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
      </View>
    ) : null}
  </Pressable>
);

/** The SHED's leaf mark, drawn small for the title pill. */
const Mark = () => (
  <View style={styles.mark}>
    <Ionicons name="leaf" size={16} color={hud.cream} />
  </View>
);

const TitlePill = ({ title, instance, open, onPress }: { title: string; instance: number; open: boolean; onPress: () => void }) => {
  const [turn] = useState(() => new Animated.Value(open ? 1 : 0));
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
  }, [open, turn]);
  const label = instance > 1 ? `${title} · ${instance}` : title;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Places and leave`}
      accessibilityState={{ expanded: open }}
      testID="world-title"
      style={({ pressed }) => [styles.title, pressed && styles.pressed]}
    >
      <Mark />
      <Text style={styles.titleText} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}>
        <Ionicons name="chevron-down" size={16} color={hud.forest} />
      </Animated.View>
    </Pressable>
  );
};

const PingBars = ({ ms }: { ms: number | null }) => {
  const bars = ms === null ? undefined : pingBars(ms);
  const [showMs, setShowMs] = useState(false);
  useEffect(() => {
    if (!showMs) return;
    const id = setTimeout(() => setShowMs(false), 2500);
    return () => clearTimeout(id);
  }, [showMs]);
  return (
    <Pressable
      onPress={() => setShowMs(true)}
      onLongPress={() => setShowMs(true)}
      accessibilityRole="button"
      accessibilityLabel={ms === null ? "Your connection: measuring" : `Your connection: ${ms} milliseconds. ${connectionLabel(bars)}`}
      testID="world-ping"
      hitSlop={10}
      style={styles.ping}
    >
      <WifiBars bars={bars} size={26} />
      {showMs && ms !== null ? (
        <Text style={styles.pingText}>{`${Math.min(999, ms)} ms`}</Text>
      ) : null}
    </Pressable>
  );
};

/**
 * Shed World, the Garden. Tap the ground to walk; type to talk to people
 * nearby. Shows the list view instead offline, with VoiceOver, or by choice.
 */
export const WorldScreen = ({
  onBack,
  leaveAsked = false,
  onStay,
  onLeave,
  onArcade,
  active = true,
  away = false,
  opening,
}: {
  onBack: () => void;
  leaveAsked?: boolean;
  onStay: () => void;
  onLeave: () => void;
  onArcade: () => void;
  /** A sheet to open on arrival, from a link: the character editor or the poke list. */
  opening?: "character" | "poke";
  /** False while another screen covers this one: the visit ends until it's back. */
  active?: boolean;
  away?: boolean;
}) => {
  const offline = useOffline();
  const screenReader = useScreenReader();
  const view = pickView({ offline, screenReader, canDraw: Platform.OS !== "android" });
  const world = useWorld(!offline && active, away);
  const [arcadeTrip, setArcadeTrip] = useState<number | null>(null);
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  const [person, setPerson] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ memberId: string; safetyOnly: boolean; name?: string } | null>(null);
  const [approach, setApproach] = useState<{ to: string; since: number; kind: AskKind } | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(opening === "poke");
  const [placesOpen, setPlacesOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const typingNow = composing && draft.trim() !== "";
  const [tray, setTray] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const online = useWorldOnline() ?? 0;
  // A link to the editor opens it once your look has loaded.
  const [editorAsked, setEditorAsked] = useState(opening === "character");
  // The editor closes with the visit (your look goes with it); open it again after.
  const hasMe = world.people.some((p) => p.isMe);
  if (editing && !hasMe && world.status !== "in") setEditing(false);
  // Asks you've turned down, as `${from}:${askAt}`. Declining sends nothing:
  // the ask just runs out.
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardLift(Math.max(insets.bottom, 12));

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

  const editDraft = (text: string) => {
    setDraft(text);
    world.typing(text.trim() !== "");
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    world.typing(false);
    const problem = await world.say(text);
    if (problem) {
      setNote(problem);
      // Put it back, unless they've started typing something new.
      setDraft((current) => (current === "" ? text : current));
    }
  };

  const now = world.serverNow();
  const me = world.people.find((p) => p.isMe);
  if (editorAsked && me) {
    setEditorAsked(false);
    setEditing(true);
  }
  const mePose = me?.walk ? posAt(me.walk, now) : null;
  const selected = world.people.find((p) => p.memberId === person) ?? null;
  if (person !== null && !selected && world.status === "in") setPerson(null);
  const tapped =
    world.people.find((p) => p.memberId === sheet?.memberId) ??
    (sheet?.name ? { memberId: sheet.memberId as Id<"worldMembers">, name: sheet.name } : null);
  const openSpeaker = (memberId: string, name: string) => {
    if (world.people.some((p) => p.isMe && p.memberId === memberId)) return;
    setPerson(null);
    setSheet({ memberId, safetyOnly: true, name });
  };
  const firstName = (memberId: string) => world.people.find((p) => p.memberId === memberId)?.name.split(" ")[0] ?? "them";

  const myDuel = world.memberId ? duelFor(world.duels, world.memberId, now) : null;
  const duelOpponent = myDuel ? (myDuel.a === world.memberId ? myDuel.b : myDuel.a) : null;
  const pickInMyDuel = (pick: DuelPick) => {
    if (myDuel) void world.pickInDuel(myDuel.id, myDuel.round, pick).then((problem) => problem && setNote(problem));
  };
  const duelProps = {
    duel: myDuel,
    side: myDuel && myDuel.b === world.memberId ? ("b" as const) : ("a" as const),
    opponentName: duelOpponent ? firstName(duelOpponent) : "them",
    serverNow: world.serverNow,
    onPick: pickInMyDuel,
  };

  const askFor = (to: string, kind: AskKind) => {
    const other = world.people.find((p) => p.memberId === to);
    if (other) void world.ask(other.memberId, kind).then((problem) => setNote(problem ?? "Asked. They have 10 seconds to say yes."));
  };

  const live = useRef({ world, askFor });
  useEffect(() => {
    live.current = { world, askFor };
  });
  const aimedAt = useRef<string | null>(null);
  const stepToward = (to: string, since: number, kind: AskKind): boolean => {
    const { world: latest, askFor: ask } = live.current;
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
      ask(to, kind);
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
      if (!stepToward(approach.to, approach.since, approach.kind)) setApproach(null);
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

  const [fade] = useState(() => new Animated.Value(0));
  const triedFromWalk = useRef<number | null>(null);
  const go = (to: Place) => {
    setPerson(null);
    setApproach(null);
    setArcadeTrip(null);
    setTray(false);
    setPeopleOpen(false);
    setPlacesOpen(false);
    const veil = (toValue: number) =>
      Animated.timing(fade, { toValue, duration: 180, useNativeDriver: Platform.OS !== "web" }).start();
    veil(1);
    void live.current.world.travel(to).then((problem) => {
      veil(0);
      if (problem) setNote(problem);
      else announce(`You're in ${PLACE_TITLES[to]}.`);
    });
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    if (view !== "garden" || away) return;
    const id = setInterval(() => {
      const { world: latest } = live.current;
      const mine = latest.people.find((p) => p.isMe);
      if (!mine?.walk || triedFromWalk.current === mine.walk.startedAt) return;
      const at = latest.serverNow();
      const pose = posAt(mine.walk, at);
      if (pose.walking || at - pose.arrivesAt < 150) return;
      const pad = portalAt(latest.place, pose);
      if (!pad) return;
      triedFromWalk.current = mine.walk.startedAt;
      goRef.current(pad.to);
    }, 200);
    return () => clearInterval(id);
  }, [view, away]);

  const sitNear = (seatId: string) => {
    setPerson(null);
    setApproach(null);
    setArcadeTrip(null);
    setTray(false);
    const seats = SEATS[world.place];
    const tapped = seats.find((seat) => seat.id === seatId);
    if (!tapped) return;
    const taken = new Set(world.people.filter((p) => !p.isMe && p.seat).map((p) => p.seat));
    const free = seats
      .filter((seat) => !taken.has(seat.id) && Math.hypot(seat.x - tapped.x, seat.z - tapped.z) <= SAME_FURNITURE)
      .sort((a, b) => Math.hypot(a.x - tapped.x, a.z - tapped.z) - Math.hypot(b.x - tapped.x, b.z - tapped.z))[0];
    if (free) world.sitOn(free.id);
    else setNote("Those seats are taken.");
  };

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

  const walkOverAndAsk = (to: string, kind: AskKind) => {
    setPerson(null);
    aimedAt.current = null;
    const since = Date.now();
    if (!stepToward(to, since, kind)) return setApproach(null);
    setApproach({ to, since, kind });
    setNote(`Walking over to ${firstName(to)}…`);
  };
  const highFive = (to: string) => walkOverAndAsk(to, "highFive");

  const walkOver = (to: string) => {
    setPeopleOpen(false);
    setPerson(null);
    const { world: latest } = live.current;
    const at = latest.serverNow();
    const mine = latest.people.find((p) => p.isMe);
    const theirs = latest.people.find((p) => p.memberId === to);
    if (!mine?.walk || !theirs?.walk) return;
    const from = posAt(mine.walk, at);
    const there = posAt(theirs.walk, at);
    const gap = Math.hypot(there.x - from.x, there.z - from.z);
    if (gap <= BESIDE) return;
    const k = (gap - BESIDE) / gap;
    latest.walkTo(from.x + (there.x - from.x) * k, from.z + (there.z - from.z) * k);
    setNote(`Walking over to ${theirs.name.split(" ")[0]}…`);
  };
  const walkOverRef = useRef(walkOver);
  useEffect(() => {
    walkOverRef.current = walkOver;
  });
  const [following, setFollowing] = useState<{ memberId: string; since: number } | null>(null);
  const follow = (to: Place, memberId: string) => {
    if (to === world.place) return walkOver(memberId);
    setFollowing({ memberId, since: Date.now() });
    go(to);
  };
  useEffect(() => {
    if (!following) return;
    const id = setInterval(() => {
      const { world: latest } = live.current;
      const arrived =
        latest.status === "in" &&
        latest.people.some((p) => p.isMe && p.walk) &&
        latest.people.some((p) => p.memberId === following.memberId && p.walk);
      if (arrived) {
        setFollowing(null);
        walkOverRef.current(following.memberId);
      } else if (Date.now() - following.since > FOLLOW_MS) setFollowing(null);
    }, 300);
    return () => clearInterval(id);
  }, [following]);

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
                {
                  id: "rps",
                  label: "Duel",
                  hint: `${ASKS.rps.label} with ${selected.name}`,
                  emoji: ASKS.rps.icon,
                  onPress: () => walkOverAndAsk(selected.memberId, "rps"),
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
        onToggleMute={toggleMute}
        onWave={() => emote("wave")}
        onHighFive={highFive}
        onDuel={(to) => walkOverAndAsk(to, "rps")}
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
      <PeoplePanel
        open={peopleOpen}
        top={view === "list" ? insets.top + 64 : insets.top + TOP_BAR_GAP}
        people={world.people}
        online={online}
        onPerson={(memberId) => {
          setPeopleOpen(false);
          if (view === "list") setSheet({ memberId, safetyOnly: false });
          else setPerson(memberId);
        }}
        place={world.place}
        onGo={go}
        onWalkOver={walkOver}
        onFollow={follow}
        onClose={() => setPeopleOpen(false)}
        pokeListOpen={opening === "poke"}
        showPlaces={view === "list"}
      />
      <LeaveDialog
        open={leaving || leaveAsked}
        onStay={() => {
          setLeaving(false);
          onStay();
        }}
        onLeave={() => {
          setLeaving(false);
          onLeave();
        }}
      />
    </>
  );

  const menuEntries: MenuEntry[] = [
    ...PLACES.filter((to) => to !== world.place).map((to) => {
      const count = world.placeCounts?.[to] ?? 0;
      return {
        id: to,
        label: PLACE_TITLES[to],
        emoji: PLACE_ICONS[to],
        count,
        accessibilityLabel: `Go to ${PLACE_TITLES[to]}, ${count} ${count === 1 ? "person" : "people"} there`,
        onPress: () => go(to),
      };
    }),
    {
      id: "leave",
      label: "Leave",
      icon: "exit-outline",
      tone: "leave",
      accessibilityLabel: "Leave the World",
      onPress: () => {
        setPlacesOpen(false);
        setLeaving(true);
      },
    },
  ];

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
          online={online}
          onPerson={(memberId) => {
            if (world.people.some((p) => p.isMe && p.memberId === memberId)) setEditing(true);
            else setSheet({ memberId, safetyOnly: false });
          }}
          note={note}
          onNote={setNote}
          onLine={openSpeaker}
          duelCard={<DuelCard {...duelProps} showResult />}
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
          seat: p.seat,
          typing: p.isMe ? (typingNow ? world.serverNow() : undefined) : p.typing,
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
        place={world.place}
        placeCounts={world.placeCounts}
        duels={world.duels}
        onTapArcade={goToArcade}
        onTapSeat={sitNear}
        onAccept={accept}
        onDecline={decline}
        declined={declined}
      />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TitlePill
          title={PLACE_TITLES[world.place]}
          instance={world.instance}
          open={placesOpen}
          onPress={() => {
            setPeopleOpen(false);
            setPlacesOpen((was) => !was);
          }}
        />
        <View style={styles.right}>
          <PingBars ms={world.ping} />
          <RoundButton
            icon="people-outline"
            label="People"
            onPress={() => {
              setPlacesOpen(false);
              setPeopleOpen((was) => !was);
            }}
            testID="world-people"
            badge={online}
          />
        </View>
      </View>
      <View style={[styles.logRow, { top: insets.top + 66 }]} pointerEvents="box-none">
        <ChatLog
          roomId={world.status === "in" ? world.roomId : null}
          onLine={openSpeaker}
          muted={muted}
          now={world.serverNow()}
          status={
            world.status === "joining"
              ? `Opening ${PLACE_TITLES[world.place].toLowerCase()}…`
              : world.status === "error"
                ? world.error
                : null
          }
        />
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
      <View
        style={[styles.underChat, { height: Math.max(insets.bottom, 12) + CHAT_BAR_HEIGHT + UNDER_CHAT_SLACK }]}
        onStartShouldSetResponder={() => true}
        testID="world-under-chat"
      />
      <Animated.View
        style={[
          styles.bottom,
          { paddingBottom: Math.max(insets.bottom, 12) },
          { transform: [{ translateY: keyboard.lift }] },
        ]}
        pointerEvents="box-none"
      >
        <DuelCard {...duelProps} />
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
            onChangeText={editDraft}
            onFocus={() => {
              setTray(false);
              setComposing(true);
              if (draft.trim()) world.typing(true);
            }}
            onBlur={() => {
              setComposing(false);
              world.typing(false);
            }}
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
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veil, { opacity: fade }]} pointerEvents="none" />
      <WorldMenu open={placesOpen} top={insets.top + TOP_BAR_GAP} entries={menuEntries} onClose={() => setPlacesOpen(false)} />

      {sheets}
    </View>
  );
};

const CHAT_BAR_HEIGHT = 54;
const TOP_BAR_GAP = 62;
const UNDER_CHAT_SLACK = 10;

const ink = { borderWidth: 2.5, borderColor: hud.forest };
const pop = { shadowColor: hud.forest, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0 };

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: hud.cream },
  veil: { backgroundColor: hud.cream },
  pressed: { opacity: 0.75 },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: hud.accent,
    borderWidth: 2,
    borderColor: hud.card,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: hud.onAccent, fontFamily: fonts.display, fontSize: 11, lineHeight: 13 },
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
    paddingRight: 12,
    paddingVertical: 6,
    ...ink,
    ...pop,
  },
  mark: { width: 30, height: 30, borderRadius: 15, backgroundColor: hud.primary, alignItems: "center", justifyContent: "center" },
  titleText: { flexShrink: 1, fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.3, color: hud.forest },
  right: { flexDirection: "row", alignItems: "center", gap: 10 },
  ping: { width: 30, height: 44, alignItems: "center", justifyContent: "center" },
  pingText: { position: "absolute", top: 36, left: -25, width: 80, textAlign: "center", fontSize: 11, fontWeight: "800", color: hud.forest },
  logRow: { position: "absolute", left: 14, right: 14, maxWidth: 460, alignItems: "flex-start", gap: 8 },
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
  underChat: { position: "absolute", left: 0, right: 0, bottom: 0 },
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
