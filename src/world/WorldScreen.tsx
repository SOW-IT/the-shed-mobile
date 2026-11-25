import { useOffline } from "@/hooks/useOffline";
import { useWorldOnline } from "@/hooks/useWorldOnline";
import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  clampTarget,
  distance,
  EMOTES,
  MUTUALS,
  OBSTACLES,
  PLACE_OBSTACLES,
  PLACE_TITLES,
  placeName,
  SEATS,
  pingBars,
  portalReached,
  posAt,
  ASKS,
  type AskKind,
  type DuelPick,
  type Place,
  INVITE_CARD_MS,
  NPC,
} from "@shared/world";
import type { GameId } from "@shared/games";
import { FURNITURE, fitInRoom, isFurniture, type FurnitureId, type WallpaperId } from "@shared/home";
import { growth, isCrop, plantCard, plotPrice, plotStand, type CropId } from "@shared/farm";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Keyboard, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { announce } from "./announce";
import { APPROACH_MS, approachStep } from "./approach";
import { CharacterEditor } from "./CharacterEditor";
import { Garden, type GardenFarm, type HighlightTarget, type InteractivePropId } from "./Garden";
import { BagPanel, PlantPicker, PlotOffer } from "./FarmPanels";
import { FarmList } from "./FarmList";
import { useFarm, useMinuteClock } from "./useFarm";
import { hud } from "./palette";
import { popShadow } from "./popShadow";
import type { HudAction } from "./PersonHud";
import { PersonSheet } from "./Sheets";
import { NoticeBoardPanel } from "./NoticeBoard";
import { PeoplePanel } from "./People";
import { connectionLabel, DevotionalPromptDialog, LeaveDialog, WifiBars, WorldMenu, type MenuEntry } from "./Overlays";
import { useWorld } from "./useWorld";
import { useForeground } from "./useForeground";
import { canDrawOn, pickView } from "./view";
import { ChatBar, CHAT_BAR_HEIGHT } from "./ChatBar";
import { ChatLog } from "./ChatLog";
import { SettingsPanel } from "./SettingsPanel";
import { useWorldName, useWorldSetting } from "./settings";
import { duelFor } from "./duel";
import { DuelCard } from "./DuelCard";
import { WorldList } from "./WorldList";
import { ArcadePanel, type ArcadeTarget } from "./ArcadePanel";
import { arcadePlayers } from "./arcadePlayers";
import { backFrom, exitOf, padTrip } from "./homeExit";
import { CoinCounter, CoinsPanel, useCoins } from "./Coins";
import { DecorateTray } from "./Decorate";
import { InviteCard } from "./InviteCard";
import { ShopPanel } from "./Shop";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { gameLabel, playingByPerson } from "./cafe";
import { CafeLayer, CafePicker } from "./CafeGames";
import { useCafe } from "./useCafe";

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
    if (Platform.OS === "web") return;
    const ios = Platform.OS === "ios";
    const move = (toValue: number, duration: number) =>
      Animated.timing(lift, { toValue, duration: duration || 250, useNativeDriver: true }).start();
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      setOpen(true);
      move(-Math.max(0, e.endCoordinates.height - bottomInset + KEYBOARD_GAP), e.duration);
    });
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", (e) => {
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
const NOTICEBOARD = OBSTACLES.find((o) => o.id === "noticeboard")!;
const NOTICES = OBSTACLES.find((o) => o.id === "notices")!;
const PIANO = PLACE_OBSTACLES.chapel.find((o) => o.id === "piano")!;
const LECTERN = PLACE_OBSTACLES.chapel.find((o) => o.id === "lectern")!;

const OBJECT_SPOTS: Record<InteractivePropId, { x: number; z: number }> = {
  arcade: clampTarget(ARCADE.x + 0.9, ARCADE.z + 0.9, "garden"),
  noticeboard: clampTarget(NOTICEBOARD.x - 0.2, NOTICEBOARD.z + 1.0, "garden"),
  notices: clampTarget(NOTICES.x + 0.2, NOTICES.z + 1.0, "garden"),
  piano: clampTarget(PIANO.x + 0.2, PIANO.z + 1.1, "chapel"),
  lectern: clampTarget(LECTERN.x, LECTERN.z + 1.0, "chapel"),
};

const AT_OBJECT = 0.35;
const BESIDE = 1.2;
const FOLLOW_MS = 12_000;
const OBJECT_TRIP_MS = 20_000;
const SAME_FURNITURE = 1.7;

type AwayKind = "arcade" | "devotional" | "browse";

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
      accessibilityLabel={`${label}. Outfit, home, settings and leave`}
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

const PingBars = ({ ms, onPress }: { ms: number | null; onPress: () => void }) => {
  const bars = ms === null ? undefined : pingBars(ms);
  const [showMs] = useWorldSetting("pingMs");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ms === null ? "Your connection: measuring" : `Your connection: ${ms} milliseconds. ${connectionLabel(bars)}`}
      accessibilityHint="Opens settings"
      testID="world-ping"
      hitSlop={10}
      style={styles.ping}
    >
      {showMs === "on" ? (
        <Text style={styles.pingText} testID="world-ping-ms">
          {ms === null ? "… ms" : `${Math.min(999, ms)} ms`}
        </Text>
      ) : null}
      <WifiBars bars={bars} size={26} />
    </Pressable>
  );
};

/**
 * Shed World, the Garden. Tap the ground to walk; type to talk to people
 * nearby. Shows the list view instead offline, with VoiceOver, or by choice.
 */
const NOTE_LIVE_REGION = Platform.OS === "web" ? "none" : "polite";

export const WorldScreen = ({
  onBack,
  leaveAsked = false,
  onStay,
  onLeave,
  onGame,
  awayGame,
  onCalendar,
  onPraise,
  onOpenLink,
  onDevotional,
  active = true,
  awayKind = null,
  opening,
  arrival,
}: {
  arrival?: { poke?: string; invite?: string };
  onBack: () => void;
  leaveAsked?: boolean;
  onStay: () => void;
  onLeave: () => void;
  onGame: (target: ArcadeTarget) => void;
  awayGame?: GameId;
  onCalendar: () => void;
  onPraise: () => void;
  /** Opens an app link (a notification's) over the World, which waits. */
  onOpenLink: (url: string) => void;
  onDevotional: () => void;
  /** A sheet to open on arrival, from a link: the character editor or the poke list. */
  opening?: "character" | "poke";
  /** False while another screen covers this one: the visit ends until it's back. */
  active?: boolean;
  awayKind?: AwayKind | null;
}) => {
  const offline = useOffline();
  const foreground = useForeground();
  const screenReader = useScreenReader();
  const view = pickView({ offline, screenReader, canDraw: canDrawOn(Platform.OS, Platform.Version) });
  const away = awayKind !== null;
  const world = useWorld(active, awayKind === "arcade", arrival, view === "list", awayKind === "devotional", awayKind === "arcade" ? awayGame : undefined);
  const wallet = useCoins();
  const cafe = useCafe(world);
  const inBackyard = world.place === "backyard" && world.status === "in";
  const farm = useFarm({ roomId: world.roomId, inBackyard, wantOwn: view === "list" });
  const farmNow = useMinuteClock(world.serverNow, inBackyard || view === "list");
  const [bagOpen, setBagOpen] = useState(false);
  const [pickPlot, setPickPlot] = useState<number | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [plotTrip, setPlotTrip] = useState<{ plot: number; since: number } | null>(null);
  const [plotCard, setPlotCard] = useState<{ plot: number; key: number } | null>(null);
  const [watering, setWatering] = useState<{ plot: number; key: number } | null>(null);
  const [flying, setFlying] = useState<{ plot: number; crop: CropId; key: number } | null>(null);
  const [picking, setPicking] = useState<{ memberId: Id<"worldMembers">; name: string } | null>(null);
  const invites = useQuery(api.world.invites, world.status === "in" ? {} : "skip");
  const [dismissedInvites, setDismissedInvites] = useState<ReadonlySet<string>>(new Set());
  const [shopOpen, setShopOpen] = useState(false);
  const [coinsOpen, setCoinsOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [decorating, setDecorating] = useState(false);
  const [chosenItem, setChosenItem] = useState<string | null>(null);
  const placeItemM = useMutation(api.worldHome.placeItem);
  const moveItemM = useMutation(api.worldHome.moveItem);
  const removeItemM = useMutation(api.worldHome.removeItem);
  const wallpaperM = useMutation(api.worldHome.setWallpaper);
  const myHome = world.home?.mine === true;
  if (decorating && !myHome && world.status === "in") setDecorating(false);
  const [propTrip, setPropTrip] = useState<{ kind: InteractivePropId; since: number } | null>(null);
  const [seatTrip, setSeatTrip] = useState<{ seatId: string; place: Place; since: number } | null>(null);
  const [devotionalAsked, setDevotionalAsked] = useState(false);
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  const [person, setPerson] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ memberId: string; safetyOnly: boolean; name?: string } | null>(null);
  const [approach, setApproach] = useState<{ to: string; since: number; kind: AskKind } | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(opening === "poke");
  const [placesOpen, setPlacesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tray, setTray] = useState(false);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const openArcade = useCallback(() => {
    setPlacesOpen(false);
    setPeopleOpen(false);
    setShopOpen(false);
    setSettingsOpen(false);
    setCoinsOpen(false);
    setBoardOpen(false);
    setBagOpen(false);
    setTray(false);
    setArcadeOpen(true);
  }, []);
  const openBoard = useCallback(() => {
    setPlacesOpen(false);
    setPeopleOpen(false);
    setShopOpen(false);
    setSettingsOpen(false);
    setCoinsOpen(false);
    setArcadeOpen(false);
    setTray(false);
    setBoardOpen(true);
  }, []);
  const openCoins = () => {
    setPlacesOpen(false);
    setPeopleOpen(false);
    setShopOpen(false);
    setSettingsOpen(false);
    setCoinsOpen(true);
  };
  const [leaving, setLeaving] = useState(false);
  const [typingAt, setTypingAt] = useState<number | null>(null);
  const draftKept = useRef("");
  const savedDraft = () => draftKept.current;
  const keepDraft = (text: string, onlyIfEmpty = false) => {
    if (!onlyIfEmpty || draftKept.current === "") draftKept.current = text;
  };
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  if (arcadeOpen && (placesOpen || peopleOpen || settingsOpen || coinsOpen || shopOpen || boardOpen || editing || sheet !== null)) setArcadeOpen(false);
  const online = useWorldOnline() ?? 0;
  // A link to the editor opens it once your look has loaded.
  const [editorAsked, setEditorAsked] = useState(opening === "character");
  const [openedFor, setOpenedFor] = useState(opening);
  if (opening !== openedFor) {
    setOpenedFor(opening);
    if (opening === "poke") {
      setEditorAsked(false);
      setEditing(false);
      setSheet(null);
      setShopOpen(false);
      setCoinsOpen(false);
      setPlacesOpen(false);
      setSettingsOpen(false);
      setPeopleOpen(true);
    } else if (opening === "character") {
      setPeopleOpen(false);
      setEditorAsked(true);
    }
  }
  // The editor closes with the visit (your look goes with it); open it again after.
  const hasMe = world.people.some((p) => p.isMe);
  if (editing && !hasMe && world.status !== "in") setEditing(false);
  // Asks you've turned down, as `${from}:${askAt}`. Declining sends nothing:
  // the ask just runs out.
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const insets = useSafeAreaInsets();
  const worldName = useWorldName();
  const coinsBeside = useWindowDimensions().width >= COINS_BESIDE_FROM;
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

  const now = world.serverNow();
  const me = world.people.find((p) => p.isMe);
  if (editorAsked && me && opening !== "poke") {
    setEditorAsked(false);
    setEditing(true);
  }
  const myPoseNow = () => {
    const { world: latest } = live.current;
    const mine = latest.people.find((p) => p.isMe);
    return mine?.walk ? posAt(mine.walk, latest.serverNow()) : null;
  };
  const selected = world.people.find((p) => p.memberId === person) ?? null;
  // How the selected person is named in the action hints: first name and last initial.
  const selectedName = selected ? worldName(selected.name) : "";
  if (person !== null && !selected && world.status === "in") setPerson(null);
  const tapped =
    world.people.find((p) => p.memberId === sheet?.memberId) ??
    (sheet?.name ? { memberId: sheet.memberId as Id<"worldMembers">, name: sheet.name } : null);
  const openSpeaker = (memberId: string, name: string) => {
    if (live.current.world.people.some((p) => p.isMe && p.memberId === memberId)) return;
    setPerson(null);
    setSheet({ memberId, safetyOnly: true, name });
  };
  const nameOf = (memberId: string) => {
    const full = world.people.find((p) => p.memberId === memberId)?.name;
    return full ? worldName(full) : "them";
  };

  const playingNow = playingByPerson(cafe.playing, nameOf);
  const challengeTo = (to: Id<"worldMembers">, kind: string) => {
    setPicking(null);
    void cafe.challenge(to, kind).then((problem) => setNote(problem ?? `Asked ${nameOf(to)} to play ${gameLabel(kind)}.`));
  };
  const openPicker = (memberId: Id<"worldMembers">, name: string) => {
    setPerson(null);
    setSheet(null);
    setPicking({ memberId, name });
  };

  const myDuel = world.memberId ? duelFor(world.duels, world.memberId, now) : null;
  const duelOpponent = myDuel ? (myDuel.a === world.memberId ? myDuel.b : myDuel.a) : null;
  const pickInMyDuel = (pick: DuelPick) => {
    if (myDuel) void world.pickInDuel(myDuel.id, myDuel.round, pick).then((problem) => problem && setNote(problem));
  };
  const duelProps = {
    duel: myDuel,
    side: myDuel && myDuel.b === world.memberId ? ("b" as const) : ("a" as const),
    opponentName: duelOpponent ? nameOf(duelOpponent) : "them",
    serverNow: world.serverNow,
    onPick: pickInMyDuel,
  };

  const askFor = (to: string, kind: AskKind) => {
    const other = world.people.find((p) => p.memberId === to);
    if (other) void world.ask(other.memberId, kind).then((problem) => setNote(problem ?? "Asked. They have 10 seconds to say yes."));
  };

  const live = useRef({ world, askFor, worldName, farm });
  useEffect(() => {
    live.current = { world, askFor, worldName, farm };
  });
  const aimedAt = useRef<string | null>(null);
  const stepToward = (to: string, since: number, kind: AskKind): boolean => {
    const { world: latest, askFor: ask, worldName: nameOf } = live.current;
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
      setNote(`Couldn't get close to ${nameOf(theirs.name)}.`);
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
    if (propTrip === null) return;
    const spot = OBJECT_SPOTS[propTrip.kind];
    const id = setInterval(() => {
      const { world: latest } = live.current;
      const at = latest.serverNow();
      const mine = latest.people.find((p) => p.isMe);
      const pose = mine?.walk ? posAt(mine.walk, at) : null;
      const arrived = pose !== null && distance(pose, spot) <= AT_OBJECT;
      const strayed = pose === null || (!pose.walking && at - pose.arrivesAt > 400) || Date.now() - propTrip.since > OBJECT_TRIP_MS;
      if (!arrived && !strayed) return;
      const kind = propTrip.kind;
      setPropTrip(null);
      if (!arrived) return;
      if (kind === "arcade") openArcade();
      else if (kind === "noticeboard") onCalendar();
      else if (kind === "notices") openBoard();
      else if (kind === "piano") onPraise();
      else setDevotionalAsked(true);
    }, 120);
    return () => clearInterval(id);
  }, [propTrip, openArcade, openBoard, onCalendar, onPraise]);

  useEffect(() => {
    if (seatTrip === null) return;
    const seat = SEATS[seatTrip.place].find((s) => s.id === seatTrip.seatId);
    const id = setInterval(() => {
      if (!seat) {
        setSeatTrip(null);
        return;
      }
      const { world: latest } = live.current;
      const at = latest.serverNow();
      const mine = latest.people.find((p) => p.isMe);
      const pose = mine?.walk ? posAt(mine.walk, at) : null;
      const arrived = pose !== null && !pose.walking && distance(pose, seat) <= AT_OBJECT && mine?.seat === seat.id;
      const strayed =
        pose === null ||
        mine?.seat !== seat.id ||
        (!pose.walking && at - pose.arrivesAt > 400 && distance(pose, seat) > AT_OBJECT) ||
        Date.now() - seatTrip.since > OBJECT_TRIP_MS;
      if (!arrived && !strayed) return;
      const place = seatTrip.place;
      setSeatTrip(null);
      if (arrived && place === "chapel") setDevotionalAsked(true);
    }, 120);
    return () => clearInterval(id);
  }, [seatTrip]);

  const highlighted: HighlightTarget | null = propTrip
    ? { kind: "prop", id: propTrip.kind }
    : seatTrip
      ? { kind: "seat", id: seatTrip.seatId }
      : null;

  const [fade] = useState(() => new Animated.Value(0));
  const clearWatering = useCallback(() => setWatering(null), []);
  const clearFlying = useCallback(() => setFlying(null), []);
  const triedFromWalk = useRef<number | null>(null);
  const go = (to: Place, toMember?: Id<"worldMembers">, invite?: Id<"worldInvites">, onArrived?: () => void, door = false) => {
    setPerson(null);
    setPlotTrip(null);
    setPlotCard(null);
    setPickPlot(null);
    setOfferOpen(false);
    setApproach(null);
    setPropTrip(null);
    setSeatTrip(null);
    setDevotionalAsked(false);
    setTray(false);
    setPeopleOpen(false);
    setPlacesOpen(false);
    setSettingsOpen(false);
    setShopOpen(false);
    setArcadeOpen(false);
    setDecorating(false);
    setChosenItem(null);
    const veil = (toValue: number) =>
      Animated.timing(fade, { toValue, duration: 180, useNativeDriver: Platform.OS !== "web" }).start();
    veil(1);
    void live.current.world.travel(to, { toMember, invite, door }).then((problem) => {
      veil(0);
      if (problem) setNote(problem);
      else {
        announce(to === "home" ? (invite ? "You're at their home." : "You're home.") : to === "backyard" ? "You're in the backyard." : `You're in ${PLACE_TITLES[to]}.`);
        onArrived?.();
      }
    });
  };
  const goHome = () => go("home");
  const invitePerson = (memberId: Id<"worldMembers">, name: string) =>
    void world.invite(memberId).then((problem) => setNote(problem ?? `Invited ${worldName(name)} home.`));

  const said = (e: unknown, otherwise: string) => (e instanceof ConvexError ? String(e.data) : otherwise);
  const decorate = (change: () => Promise<{ ok: boolean; retryInMs?: number }>) =>
    void change()
      .then((reply) => {
        if (!reply.ok) setNote(`Slow down a little. Try again in ${Math.ceil((reply.retryInMs ?? 1000) / 1000)}s.`);
      })
      .catch((e: unknown) => setNote(said(e, "That didn't save.")));
  const placeNew = (item: FurnitureId) => {
    const at = myPoseNow() ?? { x: 0, z: 0 };
    const spot = fitInRoom(item, at.x, Math.min(at.z - 2.6, 0), 0) ?? { x: 0, z: -4 };
    void placeItemM({ item, x: spot.x, z: spot.z, turn: 0 })
      .then((reply) => {
        if (reply.ok) setChosenItem(reply.key);
        else setNote(`Slow down a little. Try again in ${Math.ceil(reply.retryInMs / 1000)}s.`);
      })
      .catch((e: unknown) => setNote(said(e, "That didn't fit.")));
  };
  const chosen = chosenItem ? world.home?.items.find((p) => p.key === chosenItem) : undefined;
  if (chosenItem && world.home && !chosen) setChosenItem(null);
  const turnChosen = () => {
    if (!chosen || !isFurniture(chosen.item)) return;
    const turn = ((chosen.turn + 1) % 4) as 0 | 1 | 2 | 3;
    const spot = fitInRoom(chosen.item, chosen.x, chosen.z, turn);
    if (!spot) return setNote("No room to turn it here.");
    decorate(() => moveItemM({ key: chosen.key, x: spot.x, z: spot.z, turn }));
  };
  const moveChosen = (x: number, z: number) => {
    if (!chosen || !isFurniture(chosen.item)) return;
    const spot = fitInRoom(chosen.item, x, z, chosen.turn as 0 | 1 | 2 | 3);
    if (!spot) return setNote("Keep it inside the room.");
    decorate(() => moveItemM({ key: chosen.key, x: spot.x, z: spot.z, turn: chosen.turn }));
  };
  const putAway = () => {
    if (!chosen) return;
    setChosenItem(null);
    decorate(() => removeItemM({ key: chosen.key }));
  };
  const itemActions: HudAction[] = chosen && isFurniture(chosen.item)
    ? [
        { id: "turn", label: "Turn", hint: `Turn the ${FURNITURE[chosen.item].label.toLowerCase()}`, icon: "refresh", onPress: turnChosen },
        { id: "away", label: "Put away", hint: `Put the ${FURNITURE[chosen.item].label.toLowerCase()} away`, icon: "archive-outline", onPress: putAway },
        { id: "done", label: "Done", hint: "Done moving it", icon: "checkmark", onPress: () => setChosenItem(null) },
      ]
    : [];
  const nowForInvites = world.serverNow();
  const invite = (invites ?? []).find((row) => nowForInvites - row.at < INVITE_CARD_MS && !dismissedInvites.has(`${row.id}:${row.at}`));
  const [, setInviteExpired] = useState(0);
  const inviteEnds = invite ? invite.at + INVITE_CARD_MS : null;
  useEffect(() => {
    if (inviteEnds === null) return;
    const id = setTimeout(() => setInviteExpired((n) => n + 1), Math.max(0, inviteEnds - live.current.world.serverNow()) + 1);
    return () => clearTimeout(id);
  }, [inviteEnds]);
  const farmView = farm.view;
  const placeTitle =
    world.place === "home"
      ? world.home
        ? world.home.mine
          ? "Your home"
          : `${worldName(world.home.ownerName)}'s home`
        : "Home"
      : world.place === "backyard"
        ? farmView
          ? farmView.mine
            ? "Your backyard"
            : `${worldName(farmView.ownerName)}'s backyard`
          : "Backyard"
        : placeName(world.place);
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  const backToPlace = leaveAsked ? backFrom(world.place, world.home, world.homeLoading) : null;
  const backTarget = backToPlace?.kind === "travel" ? backToPlace.to : null;
  const backDoor = backToPlace?.kind === "travel" && backToPlace.door === true;
  useEffect(() => {
    if (backTarget === null) return;
    onStay();
    goRef.current(backTarget, undefined, undefined, undefined, backDoor);
  }, [backTarget, backDoor, onStay]);
  const myWalkStart = me?.walk?.startedAt ?? null;
  const myArrival = me?.walk ? posAt(me.walk, me.walk.startedAt).arrivesAt : null;
  useEffect(() => {
    if (view !== "garden" || away || myWalkStart === null || myArrival === null) return;
    let id: ReturnType<typeof setTimeout>;
    const check = () => {
      const { world: latest } = live.current;
      const mine = latest.people.find((p) => p.isMe);
      if (!mine?.walk || triedFromWalk.current === mine.walk.startedAt) return;
      const at = latest.serverNow();
      const pose = posAt(mine.walk, at);
      if (pose.walking || at - pose.arrivesAt < PAD_SETTLE_MS) {
        id = setTimeout(check, Math.max(0, pose.arrivesAt + PAD_SETTLE_MS - at) + 1);
        return;
      }
      const pad = portalReached(latest.place, mine.walk);
      if (!pad) return;
      triedFromWalk.current = mine.walk.startedAt;
      // A home's door goes back to where you came from (the server remembers).
      const trip = padTrip(latest.place, pad.to, latest.home);
      goRef.current(trip.to, undefined, undefined, undefined, trip.door);
    };
    id = setTimeout(check, Math.max(0, myArrival + PAD_SETTLE_MS - live.current.world.serverNow()) + 1);
    return () => clearTimeout(id);
  }, [view, away, myWalkStart, myArrival]);

  const sitNear = (seatId: string) => {
    setPerson(null);
    setApproach(null);
    setPropTrip(null);
    setDevotionalAsked(false);
    setTray(false);
    const seats = SEATS[world.place];
    const tapped = seats.find((seat) => seat.id === seatId);
    if (!tapped) return;
    const taken = new Set(world.people.filter((p) => !p.isMe && p.seat).map((p) => p.seat));
    const free = seats
      .filter((seat) => !taken.has(seat.id) && Math.hypot(seat.x - tapped.x, seat.z - tapped.z) <= SAME_FURNITURE)
      .sort((a, b) => Math.hypot(a.x - tapped.x, a.z - tapped.z) - Math.hypot(b.x - tapped.x, b.z - tapped.z))[0];
    if (!free) {
      setNote("Those seats are taken.");
      return;
    }
    const mePose = myPoseNow();
    if (me?.seat === free.id && mePose && !mePose.walking && distance(mePose, free) <= AT_OBJECT) {
      setSeatTrip(null);
      if (world.place === "chapel") setDevotionalAsked(true);
      return;
    }
    world.sitOn(free.id);
    setSeatTrip({ seatId: free.id, place: world.place, since: Date.now() });
  };

  const goToObject = (kind: InteractivePropId, trigger: () => void) => {
    setPerson(null);
    setApproach(null);
    setSeatTrip(null);
    setTray(false);
    const spot = OBJECT_SPOTS[kind];
    const mePose = myPoseNow();
    if (!mePose || distance(mePose, spot) <= AT_OBJECT) {
      setPropTrip(null);
      trigger();
      return;
    }
    world.walkTo(spot.x, spot.z);
    setPropTrip({ kind, since: Date.now() });
  };

  const goToArcade = () => goToObject("arcade", openArcade);
  const goToNoticeBoard = () => goToObject("noticeboard", onCalendar);
  const goToNotices = () => goToObject("notices", openBoard);
  const goToPiano = () => goToObject("piano", onPraise);
  const goToLectern = () => goToObject("lectern", () => setDevotionalAsked(true));

  const emote = (id: string) => void world.act(id).then((problem) => problem && setNote(problem));

  const plantOn = (plot: number) => farmView?.plants.find((p) => p.plot === plot) ?? null;
  const wateredBy = (plant: NonNullable<ReturnType<typeof plantOn>>, wateredAt: number | null) =>
    wateredAt === null ? null : (plant.waterings.find((w) => w.at === wateredAt)?.by ?? null);
  const gardenPlants = (farmView?.plants ?? []).map((plant) => {
    const g = growth(plant, farmNow);
    const by = wateredBy(plant, g.wateredAt);
    return { plot: plant.plot, crop: plant.crop, stage: g.stage, wilted: g.wilted, thirsty: g.thirsty, ...(by ? { note: `Watered by ${worldName(by)}` } : {}) };
  });
  const cardFor = (plot: number) => {
    const plant = plantOn(plot);
    return plant ? plantCard(plant, farmNow) : null;
  };
  const needsVisit = (plot: number) => {
    const plant = plantOn(plot);
    if (!plant) return farmView?.mine === true;
    const g = growth(plant, world.serverNow());
    return g.thirsty || (farmView?.mine === true && (g.stage === "ripe" || g.stage === "dead"));
  };
  const actOnPlot = (plot: number) => {
    const { world: latest, farm: farmNowLive } = live.current;
    const plants = farmNowLive.view;
    const plant = plants?.plants.find((p) => p.plot === plot);
    if (!plants) return;
    if (!plant) {
      if (plants.mine && plot < plants.plots) setPickPlot(plot);
      return;
    }
    const g = growth(plant, latest.serverNow());
    if (g.thirsty) {
      setWatering({ plot, key: Date.now() });
      void farmNowLive.water(plot).then((problem) => problem && setNote(problem));
    } else if (plants.mine && g.stage === "ripe") {
      void farmNowLive.harvest(plot).then((reply) => {
        if (typeof reply === "string") setNote(reply);
        else if (isCrop(reply.crop)) setFlying({ plot, crop: reply.crop, key: Date.now() });
      });
    } else if (plants.mine && g.stage === "dead") {
      void farmNowLive.clear(plot).then((problem) => problem && setNote(problem));
    }
  };
  const actRef = useRef(actOnPlot);
  useEffect(() => {
    actRef.current = actOnPlot;
  });
  const tapPlot = (plot: number) => {
    if (!farmView) return;
    setPerson(null);
    setTray(false);
    setPropTrip(null);
    setSeatTrip(null);
    if (plot >= farmView.plots) {
      setPlotTrip(null);
      if (farmView.mine) setOfferOpen(true);
      return;
    }
    if (plantOn(plot)) setPlotCard({ plot, key: Date.now() });
    if (!needsVisit(plot)) return;
    const spot = plotStand(plot);
    const mePose = myPoseNow();
    if (mePose && distance(mePose, spot) <= AT_OBJECT) {
      setPlotTrip(null);
      actOnPlot(plot);
      return;
    }
    world.walkTo(spot.x, spot.z);
    setPlotTrip({ plot, since: Date.now() });
  };
  useEffect(() => {
    if (plotTrip === null) return;
    const spot = plotStand(plotTrip.plot);
    const id = setInterval(() => {
      const { world: latest } = live.current;
      const at = latest.serverNow();
      const mine = latest.people.find((p) => p.isMe);
      const pose = mine?.walk ? posAt(mine.walk, at) : null;
      const arrived = pose !== null && distance(pose, spot) <= AT_OBJECT;
      const strayed = pose === null || (!pose.walking && at - pose.arrivesAt > 400) || Date.now() - plotTrip.since > OBJECT_TRIP_MS;
      if (!arrived && !strayed) return;
      setPlotTrip(null);
      if (arrived) actRef.current(plotTrip.plot);
    }, 120);
    return () => clearInterval(id);
  }, [plotTrip]);
  useEffect(() => {
    if (plotCard === null) return;
    const id = setTimeout(() => setPlotCard(null), PLOT_CARD_MS);
    return () => clearTimeout(id);
  }, [plotCard]);
  const plantPicked = (plot: number, crop: CropId) => {
    setPickPlot(null);
    void farm.plant(plot, crop).then((problem) => problem && setNote(problem));
  };
  const nextPlot = farmView?.plots ?? 0;
  const gardenFarm: GardenFarm | null = farmView
    ? {
        plots: farmView.plots,
        mine: farmView.mine,
        plants: gardenPlants,
        card: plotCard && cardFor(plotCard.plot) ? { plot: plotCard.plot, text: cardFor(plotCard.plot)! } : null,
        watering,
        flying,
        bagAt: { x: 54, y: insets.top + 30 },
        onTapPlot: tapPlot,
        onWatered: clearWatering,
        onFlown: clearFlying,
      }
    : null;

  const walkOverAndAsk = (to: string, kind: AskKind) => {
    setPerson(null);
    aimedAt.current = null;
    const since = Date.now();
    if (!stepToward(to, since, kind)) return setApproach(null);
    setApproach({ to, since, kind });
    setNote(`Walking over to ${nameOf(to)}…`);
  };
  const highFive = (to: string) => walkOverAndAsk(to, "highFive");

  const walkOver = (to: string) => {
    setPeopleOpen(false);
    setPerson(null);
    setApproach(null);
    setPropTrip(null);
    setSeatTrip(null);
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
    setNote(`Walking over to ${worldName(theirs.name)}…`);
  };
  const walkOverRef = useRef(walkOver);
  useEffect(() => {
    walkOverRef.current = walkOver;
  });
  const [following, setFollowing] = useState<{ memberId: string; since: number } | null>(null);
  const follow = (to: Place, memberId: string) => {
    if (world.people.some((p) => p.memberId === memberId)) return walkOver(memberId);
    setFollowing({ memberId, since: Date.now() });
    go(to, memberId as Id<"worldMembers">);
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

  // Only someone else is ever selected: tapping yourself opens nothing.
  const hudActions: HudAction[] = !selected || selected.isMe
    ? []
      : [
          ...(selected.away || selected.reading
            ? []
            : [
                {
                  id: "highfive",
                  label: MUTUALS.highFive.label,
                  hint: `${MUTUALS.highFive.label} with ${selectedName}`,
                  emoji: MUTUALS.highFive.icon,
                  onPress: () => highFive(selected.memberId),
                },
                {
                  id: "rps",
                  label: "Duel",
                  hint: `${ASKS.rps.label} with ${selectedName}`,
                  emoji: ASKS.rps.icon,
                  onPress: () => walkOverAndAsk(selected.memberId, "rps"),
                },
                ...(world.place === "cafe"
                  ? [
                      {
                        id: "play",
                        label: "Play",
                        hint: `Play a game with ${selectedName}`,
                        emoji: "🎲",
                        onPress: () => openPicker(selected.memberId, selected.name),
                      },
                    ]
                  : []),
              ]),
          ...(world.place === "cafe" && !selected.away && !selected.reading
            ? []
            : [
                {
                  id: "wave",
                  label: EMOTES.wave.label,
                  hint: `Wave at ${selectedName}`,
                  emoji: EMOTES.wave.icon,
                  onPress: () => {
                    setPerson(null);
                    emote("wave");
                  },
                },
              ]),
          {
            id: "invite",
            label: "Invite",
            hint: `Invite ${selectedName} to your home`,
            emoji: "✉️",
            onPress: () => {
              setPerson(null);
              invitePerson(selected.memberId, selected.name);
            },
          },
          {
            id: "more",
            label: "More",
            hint: `Mute, block or report ${selectedName}`,
            icon: "ellipsis-horizontal",
            onPress: () => {
              setPerson(null);
              setSheet({ memberId: selected.memberId, safetyOnly: true });
            },
          },
        ];

  const overlayOpen = shopOpen || coinsOpen || boardOpen || peopleOpen || arcadeOpen || bagOpen || offerOpen || pickPlot !== null || sheet !== null || editing;
  const noteOver =
    note && overlayOpen ? (
      <View style={[styles.noteOver, { top: insets.top + 8 }]} pointerEvents="none">
        <Text style={styles.note} accessibilityLiveRegion={NOTE_LIVE_REGION}>
          {note}
        </Text>
      </View>
    ) : null;
  const sheets = (
    <>
      <CafeLayer
        cafe={cafe}
        people={world.people}
        place={world.place}
        serverNow={world.serverNow}
        bottom={Math.max(insets.bottom, 12) + CHAT_BAR_HEIGHT + 12}
        safe={{ top: insets.top, bottom: insets.bottom }}
        onNote={setNote}
        onReturn={() => go("cafe")}
      />
      <NoticeBoardPanel
        open={boardOpen}
        top={view === "list" ? insets.top + 64 : insets.top + TOP_BAR_GAP}
        onClose={() => setBoardOpen(false)}
        onOpenLink={(url) => {
          setBoardOpen(false);
          onOpenLink(url);
        }}
        onNote={setNote}
      />
      <ShopPanel
        open={shopOpen}
        top={view === "list" ? insets.top + 64 : insets.top + TOP_BAR_GAP}
        bottom={Math.max(insets.bottom, 12) + CHAT_BAR_HEIGHT + SHOP_CHAT_GAP}
        wallet={wallet}
        onClose={() => setShopOpen(false)}
        onBought={setNote}
        farm={{ crops: farm.bag?.crops ?? {}, seeds: farm.bag?.seeds ?? {}, buySeeds: farm.buySeeds, sell: farm.sell }}
      />
      <BagPanel open={bagOpen} top={view === "list" ? insets.top + 64 : insets.top + TOP_BAR_GAP} bag={farm.bag} onClose={() => setBagOpen(false)} />
      <PlantPicker plot={pickPlot} top={view === "list" ? insets.top + 64 : insets.top + TOP_BAR_GAP} bag={farm.bag} onPick={plantPicked} onClose={() => setPickPlot(null)} />
      <PlotOffer
        open={offerOpen}
        top={view === "list" ? insets.top + 64 : insets.top + TOP_BAR_GAP}
        plot={nextPlot}
        price={plotPrice(nextPlot)}
        balance={wallet?.balance ?? 0}
        onBuy={async () => {
          const problem = await farm.buyPlot();
          if (!problem) setOfferOpen(false);
          return problem;
        }}
        onClose={() => setOfferOpen(false)}
      />
      <CoinsPanel
        open={coinsOpen}
        top={view === "list" ? insets.top + 64 : insets.top + TOP_BAR_GAP}
        balance={wallet?.balance}
        onClose={() => setCoinsOpen(false)}
      />
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
        onPlay={world.place === "cafe" && tapped ? (to) => openPicker(to, tapped.name) : undefined}
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
        roomId={world.roomId}
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
        onHome={goHome}
        onInvite={invitePerson}
        playing={playingNow.lines}
        onClose={() => setPeopleOpen(false)}
        pokeListOpen={opening === "poke"}
        showPlaces={view === "list"}
      />
      <ArcadePanel
        open={arcadeOpen}
        top={view === "list" ? insets.top + 64 : insets.top + TOP_BAR_GAP}
        playing={arcadePlayers(world.people, worldName)}
        onOpen={(target) => {
          setArcadeOpen(false);
          onGame(target);
        }}
        onClose={() => setArcadeOpen(false)}
      />
      <CafePicker person={picking} look={picking ? (world.people.find((p) => p.memberId === picking.memberId)?.look ?? null) : null} top={insets.top + TOP_BAR_GAP} onPick={challengeTo} onClose={() => setPicking(null)} />
      <SettingsPanel
        open={settingsOpen}
        top={view === "list" ? insets.top + 64 : insets.top + TOP_BAR_GAP}
        myName={me?.name ?? ""}
        farmReminders={farm.bag?.reminders}
        onFarmReminders={(on) => void farm.setReminders(on).then((problem) => problem && setNote(problem))}
        onClose={() => setSettingsOpen(false)}
      />
      <DevotionalPromptDialog
        open={devotionalAsked}
        onCancel={() => setDevotionalAsked(false)}
        onConfirm={() => {
          setDevotionalAsked(false);
          onDevotional();
        }}
      />
      <LeaveDialog
        open={leaving || (leaveAsked && backFrom(world.place, world.home, world.homeLoading).kind === "leave")}
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

  // No trips from here: you walk to a place. Outfit sits above Your home.
  const menuEntries: MenuEntry[] = [
    {
      id: "outfit",
      label: "Outfit",
      icon: "shirt-outline",
      accessibilityLabel: "Outfit. Change your look",
      onPress: () => {
        setPlacesOpen(false);
        setPerson(null);
        setEditing(true);
      },
    },
    {
      id: "bag",
      label: "Bag",
      icon: "bag-handle-outline",
      accessibilityLabel: "Bag. Your seeds and crops",
      onPress: () => {
        setPlacesOpen(false);
        setPerson(null);
        setBagOpen(true);
      },
    },
    ...(myHome
      ? []
      : [
          {
            id: "home",
            label: "Your home",
            icon: "home" as const,
            accessibilityLabel: "Go to your home",
            onPress: goHome,
          },
        ]),
    {
      id: "settings",
      label: "Settings",
      icon: "settings-outline",
      accessibilityLabel: "Settings",
      onPress: () => {
        setPlacesOpen(false);
        setSettingsOpen(true);
      },
    },
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

  const inviteCard = invite ? (
    <InviteCard
      key={`${invite.id}:${invite.at}`}
      name={invite.ownerName}
      look={invite.look}
      onGo={() => {
        const shown = `${invite.id}:${invite.at}`;
        go("home", undefined, invite.id, () => setDismissedInvites((set) => new Set(set).add(shown)));
      }}
      onLater={() => setDismissedInvites((set) => new Set(set).add(`${invite.id}:${invite.at}`))}
    />
  ) : null;

  const liveNote =
    Platform.OS === "web" ? (
      <Text style={styles.offscreen} aria-live="polite">
        {note ?? ""}
      </Text>
    ) : null;

  if (away) return <View style={styles.fill} />;

  if (view === "list") {
    return (
      <>
        {liveNote}
        <WorldList
          world={world}
          offline={offline}
          muted={muted}
          onBack={onBack}
          onArcade={openArcade}
          onPeople={() => setPeopleOpen(true)}
          placeTitle={placeTitle}
          extra={
            <View style={styles.listExtra}>
              <View style={styles.listRow}>
                <CoinCounter balance={wallet?.balance} onPress={openCoins} />
                {world.place === NPC.place ? (
                  <RoundButton icon="cart-outline" label={`Shop with ${NPC.name}`} onPress={() => setShopOpen(true)} testID="world-list-shop" />
                ) : null}
                <RoundButton icon="bag-handle-outline" label="Bag" onPress={() => setBagOpen(true)} testID="world-list-bag" />
                <RoundButton icon="clipboard-outline" label="Notice board" onPress={openBoard} testID="world-list-notices" />
                <RoundButton icon="settings-outline" label="Settings" onPress={() => setSettingsOpen(true)} testID="world-list-settings" />
              </View>
              {inviteCard}
              <FarmList
                view={farmView}
                inBackyard={inBackyard}
                now={farmNow}
                title={placeTitle}
                nameOf={worldName}
                onWater={(plot) => void farm.water(plot).then((problem) => problem && setNote(problem))}
                onHarvest={(plot) =>
                  void farm.harvest(plot).then((reply) => setNote(typeof reply === "string" ? reply : "Into the Bag."))
                }
                onClear={(plot) => void farm.clear(plot).then((problem) => problem && setNote(problem))}
                onPlant={setPickPlot}
                onBuyPlot={() => setOfferOpen(true)}
                onGo={() => go("backyard")}
              />
            </View>
          }
          online={online}
          onPerson={(memberId) => {
            if (world.people.some((p) => p.isMe && p.memberId === memberId)) setEditing(true);
            else setSheet({ memberId, safetyOnly: false });
          }}
          note={overlayOpen ? null : note}
          onNote={setNote}
          onLine={openSpeaker}
          duelCard={<DuelCard {...duelProps} showResult />}
          declined={declined}
          onAccept={accept}
          onDecline={decline}
        />
        {sheets}
        {noteOver}
      </>
    );
  }


  return (
    <View style={styles.fill}>
      {liveNote}
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
          reading: p.reading === true,
          seat: p.seat,
          typing: p.isMe ? (typingAt ?? undefined) : p.typing,
          playing: playingNow.tags.get(p.memberId),
        }))}
        serverNow={world.serverNow}
        target={world.target}
        onHoldStart={(x, z) => {
          setTray(false);
          setPerson(null);
          setApproach(null);
          setPropTrip(null);
          setSeatTrip(null);
          world.holdStart(x, z);
        }}
        onHoldMove={world.holdMove}
        onHoldEnd={world.holdEnd}
        onTapPerson={(memberId) => {
          // Tapping yourself opens nothing; it only puts away what was open.
          if (live.current.world.people.some((p) => p.isMe && p.memberId === memberId)) {
            setTray(false);
            setPerson(null);
            return;
          }
          setTray(false);
          setPropTrip(null);
          setSeatTrip(null);
          setPerson((current) => (current === memberId ? null : memberId));
        }}
        selected={person}
        hudActions={hudActions}
        place={world.place}
        placeCounts={world.placeCounts}
        duels={world.duels}
        ball={world.ball}
        onKick={world.kick}
        onTapArcade={goToArcade}
        onTapNoticeBoard={goToNoticeBoard}
        onTapNotices={goToNotices}
        onTapPiano={goToPiano}
        onTapLectern={goToLectern}
        onTapSeat={sitNear}
        highlighted={highlighted}
        onAccept={accept}
        onDecline={decline}
        declined={declined}
        home={world.home}
        homeExit={world.place === "home" ? exitOf(world.home) : undefined}
        onTapNpc={() => {
          setPerson(null);
          setTray(false);
          setShopOpen(true);
        }}
        decor={
          decorating
            ? { selected: chosenItem, onItem: setChosenItem, onFloor: moveChosen, actions: itemActions, hudTop: insets.top + (coinsBeside ? 66 : 104) + 8 }
            : null
        }
        paused={!foreground || editing}
        farm={inBackyard ? gardenFarm : null}
      />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.left}>
          <TitlePill
            title={placeTitle}
            instance={world.place === "home" ? 1 : world.instance}
            open={placesOpen}
            onPress={() => {
              setPeopleOpen(false);
              setSettingsOpen(false);
              setPlacesOpen((was) => !was);
            }}
          />
          {coinsBeside ? <CoinCounter balance={wallet?.balance} onPress={openCoins} /> : null}
        </View>
        <View style={styles.right}>
          <PingBars
            ms={world.ping}
            onPress={() => {
              setPlacesOpen(false);
              setPeopleOpen(false);
              setCoinsOpen(false);
              setSettingsOpen((was) => !was);
            }}
          />
          <RoundButton
            icon="people-outline"
            label="People"
            onPress={() => {
              setPlacesOpen(false);
              setSettingsOpen(false);
              setBoardOpen(false);
              setPropTrip((trip) => (trip?.kind === "notices" ? null : trip));
              setPeopleOpen((was) => !was);
            }}
            testID="world-people"
            badge={online}
          />
        </View>
      </View>
      {coinsBeside ? null : (
        <View style={[styles.coinsUnder, { top: insets.top + 62 }]} pointerEvents="box-none">
          <CoinCounter balance={wallet?.balance} onPress={openCoins} />
        </View>
      )}
      <View style={[styles.logRow, { top: insets.top + (coinsBeside ? 66 : 104) }]} pointerEvents="box-none">
        {decorating ? null : (
          <ChatLog
            roomId={world.status === "in" ? world.roomId : null}
            onLine={openSpeaker}
            muted={muted}
            serverNow={world.serverNow}
            status={
              world.status === "joining"
                ? `Opening ${PLACE_TITLES[world.place].toLowerCase()}…`
                : world.status === "error"
                  ? world.error
                  : null
            }
          />
        )}
        {note && !overlayOpen ? (
          <Text style={styles.note} accessibilityLiveRegion={NOTE_LIVE_REGION}>
            {note}
          </Text>
        ) : null}
        {inviteCard}
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
        {myHome && !decorating ? (
          <View style={styles.decorateRow} pointerEvents="box-none">
            <RoundButton
              icon="color-palette-outline"
              label="Decorate"
              onPress={() => {
                setTray(false);
                setPerson(null);
                setDecorating(true);
              }}
              testID="world-decorate-open"
            />
          </View>
        ) : null}
        {myHome && world.home ? (
          <DecorateTray
            open={decorating}
            owned={wallet?.items ?? {}}
            wallpapers={wallet?.wallpapers ?? []}
            placed={world.home.items}
            wallpaper={world.home.wallpaper}
            onPlace={placeNew}
            onWallpaper={(id: WallpaperId) => decorate(() => wallpaperM({ wallpaper: id }))}
            onDone={() => {
              setDecorating(false);
              setChosenItem(null);
            }}
          />
        ) : null}
        <ChatBar
          keyboardOpen={keyboard.open}
          tray={tray}
          onTray={setTray}
          onEmote={emote}
          say={world.say}
          typing={world.typing}
          onTypingAt={setTypingAt}
          serverNow={world.serverNow}
          onNote={setNote}
          savedDraft={savedDraft}
          keepDraft={keepDraft}
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veil, { opacity: fade }]} pointerEvents="none" />
      <WorldMenu open={placesOpen} top={insets.top + TOP_BAR_GAP} entries={menuEntries} onClose={() => setPlacesOpen(false)} />

      {sheets}
      {noteOver}
    </View>
  );
};

const PAD_SETTLE_MS = 150;
const PLOT_CARD_MS = 4000;
const COINS_BESIDE_FROM = 400;
const TOP_BAR_GAP = 62;
const UNDER_CHAT_SLACK = 10;
const SHOP_CHAT_GAP = 14;

const ink = { borderWidth: 2.5, borderColor: hud.forest };
const pop = popShadow();

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
  left: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  coinsUnder: { position: "absolute", left: 14 },
  listExtra: { gap: 10, marginBottom: 12 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  decorateRow: { flexDirection: "row", justifyContent: "flex-end" },
  ping: { minWidth: 30, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  pingText: { fontSize: 12, fontWeight: "800", color: hud.forest, fontVariant: ["tabular-nums"] },
  logRow: { position: "absolute", left: 14, right: 14, maxWidth: 460, alignItems: "flex-start", gap: 8 },
  noteOver: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  offscreen: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
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
  underChat: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
