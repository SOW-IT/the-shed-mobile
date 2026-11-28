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
  standIn,
  pingBars,
  portalReached,
  posAt,
  ASKS,
  type AskKind,
  type DuelPick,
  type Place,
  INVITE_CARD_MS,
  NPC,
  FARMER,
  WORLD_PLACE,
  asksDevotional,
} from "@shared/world";
import { FURNITURE, fitInRoom, homeSeatPiece, isFurniture, isTurn, seatHere, seatsHere, type FurnitureId, type Placed, type WallpaperId } from "@shared/home";
import { CROPS, cropLabel, growth, isCrop, penStand, plantCard, plotPrice, plotStand, timeLeft, type BuildingId, type CropId } from "@shared/farm";
import { ANIMALS, animalCard, animalFor, animalLabel, BUILDINGS, buildingFor, GOODS, isAnimal, isGood, life, randomName, stageLabel, type AnimalId, type FeedId, type GoodId } from "@shared/animals";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Keyboard, PixelRatio, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Reanimated, { useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { keyboardLift } from "@/hooks/keyboardOverlap";
import { useKeyboardHeight } from "@/hooks/useKeyboardInset";
import { announce } from "./announce";
import { APPROACH_MS, approachStep } from "./approach";
import { CharacterEditor } from "./CharacterEditor";
import { Garden, type GardenFarm, type GardenYard } from "./Garden";
import { tripTarget, type InteractivePropId } from "./tripTarget";
import { BackyardGuide } from "./BackyardGuide";
import { BagPanel, BuildingOffer, PenSheet, PlantPicker, PlotOffer } from "./FarmPanels";
import { CropThumb, GainChip, PlotCard, type FarmCardData } from "./Farm";
import { AnimalThumb } from "./Animals";
import { useAnimals, useFarm, useMinuteClock } from "./useFarm";
import { hud } from "./palette";
import { popShadow } from "./popShadow";
import type { HudAction } from "./PersonHud";
import { PersonSheet } from "./Sheets";
import { NoticeBoardPanel } from "./NoticeBoard";
import { PeoplePanel } from "./People";
import { connectionLabel, DevotionalPromptDialog, LeaveDialog, WifiBars, WorldMenu, type MenuEntry } from "./Overlays";
import { useWorld } from "./useWorld";
import { useForeground } from "./useForeground";
import { ChatBar, CHAT_BAR_HEIGHT } from "./ChatBar";
import { ChatLog } from "./ChatLog";
import { lobbyChatLines, tableChatLog, worldChatLog } from "./chatLogSize";
import { STATUS_CARD_MS } from "./cards";
import { SettingsPanel } from "./SettingsPanel";
import { useBatterySaver, useWorldName, useWorldSetting } from "./settings";
import { duelFor } from "./duel";
import { DuelCard } from "./DuelCard";
import { CoinsPanel, useCoins } from "./Coins";
import { CoinCounter } from "@/components/games/CoinCounter";
import type { GamesTarget } from "@/components/games/GamesMenu";
import { ArcadePanel } from "./ArcadePanel";
import { arcadeStep, AWAY_FROM_ARCADE } from "./arcadeReach";
import { backFrom, exitOf, padTrip } from "./homeExit";
import { DecorateTray } from "./Decorate";
import { DRAFT_KEY, isPending, PENDING_PREFIX, showMove, showPlace, showRemove } from "./homeDecor";
import { seatsTaken } from "./seats";
import { InviteCard, KnockCard } from "./InviteCard";
import { ShopPanel } from "./Shop";
import type { Keeper } from "./shopTabs";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { gameLabel, gameToWatch, playingByPerson } from "./cafe";
import { CafeLayer, CafePicker } from "./CafeGames";
import { useCafe } from "./useCafe";
import { inLobbyAt, MahjongLayer, playingAtTable } from "./mahjong/MahjongLayer";
import { mahjongTags, mahjongTap, tableToWatch, takeoverSeats } from "./mahjong/tap";
import { useMahjong } from "./mahjong/useMahjong";

const KEYBOARD_GAP = 8;

const useKeyboardLift = (bottomInset: number) => {
  const keyboard = useKeyboardHeight();
  const scale = PixelRatio.get();
  const lift = useDerivedValue(() => keyboardLift(keyboard.get(), bottomInset, KEYBOARD_GAP, scale));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return { lift, open };
};

const ARCADE = OBSTACLES.find((o) => o.id === "arcade")!;
const NOTICEBOARD = OBSTACLES.find((o) => o.id === "noticeboard")!;
const NOTICES = OBSTACLES.find((o) => o.id === "notices")!;
const PIANO = PLACE_OBSTACLES.chapel.find((o) => o.id === "piano")!;

const OBJECT_SPOTS: Record<InteractivePropId, { x: number; z: number }> = {
  arcade: clampTarget(ARCADE.x + 0.9, ARCADE.z + 0.9, "garden"),
  noticeboard: clampTarget(NOTICEBOARD.x - 0.2, NOTICEBOARD.z + 1.0, "garden"),
  notices: clampTarget(NOTICES.x + 0.2, NOTICES.z + 1.0, "garden"),
  piano: clampTarget(PIANO.x + 0.2, PIANO.z + 1.1, "chapel"),
  // Behind the lectern, facing the pews (see STANDS).
  lectern: standIn("chapel", "lectern")!,
};

const AT_OBJECT = 0.35;
const CARD_GAP = 8;
const BESIDE = 1.2;
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

const TitlePill = ({ title, instance, open, onPress, bump, calm }: { title: string; instance: number; open: boolean; onPress: () => void; bump: number; calm: boolean }) => {
  const [turn] = useState(() => new Animated.Value(open ? 1 : 0));
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
  }, [open, turn]);
  const grow = useSharedValue(1);
  useEffect(() => {
    if (bump === 0 || calm) return;
    grow.value = withSequence(withTiming(1.12, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 220 }));
  }, [bump, calm, grow]);
  const bumped = useAnimatedStyle(() => ({ transform: [{ scale: grow.value }] }));
  const label = instance > 1 ? `${title} · ${instance}` : title;
  return (
    <Reanimated.View style={[styles.titleWrap, bumped]}>
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Outfit, bag, home, settings and leave`}
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
    </Reanimated.View>
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
 * nearby.
 */
const NOTE_LIVE_REGION = Platform.OS === "web" ? "none" : "polite";

export const WorldScreen = ({
  leaveAsked = false,
  onStay,
  onLeave,
  onGame,
  onCalendar,
  onPraise,
  onOpenLink,
  onDevotional,
  active = true,
  awayKind = null,
  opening,
  onOpeningUsed,
  arrival,
}: {
  arrival?: { poke?: string; invite?: string };
  leaveAsked?: boolean;
  onStay: () => void;
  onLeave: () => void;
  /** Goes into a game, or the leaderboard, picked from the arcade panel. */
  onGame: (target: GamesTarget) => void;
  onCalendar: () => void;
  onPraise: () => void;
  /** Opens an app link (a notification's) over the World, which waits. */
  onOpenLink: (url: string) => void;
  onDevotional: () => void;
  /** A sheet to open on arrival, from a link: the character editor, the poke list or the arcade. */
  opening?: "character" | "poke" | "arcade";
  /**
   * The arcade link has opened the arcade. The route forgets it, so the same
   * link opens it again later (after a game, say), not only when it changes.
   */
  onOpeningUsed?: () => void;
  /** False while another screen covers this one: the visit ends until it's back. */
  active?: boolean;
  awayKind?: AwayKind | null;
}) => {
  const foreground = useForeground();
  const away = awayKind !== null;
  const world = useWorld(active, awayKind === "arcade", arrival, awayKind === "devotional");
  const wallet = useCoins();
  const cafe = useCafe(world);
  const mahjong = useMahjong(world);
  const [mahjongWatch, setMahjongWatch] = useState<Id<"mahjongTables"> | null>(null);
  const inBackyard = world.place === "backyard" && world.status === "in";
  const calm = useBatterySaver();
  const farm = useFarm({ roomId: world.roomId, inBackyard });
  const minuteNow = useMinuteClock(world.serverNow, inBackyard);
  const [yardNow, setYardNow] = useState(0);
  const animals = useAnimals({ roomId: world.roomId, inBackyard });
  const yardLatest = latestYardTime(animals.view?.animals);
  const farmNow = Math.max(minuteNow, yardNow, yardLatest);
  const [animalTrip, setAnimalTrip] = useState<{ id: string; since: number } | null>(null);
  const [yardCard, setYardCard] = useState<{ at: BuildingId; id: string | null; extra: string | null; key: number } | null>(null);
  const [feeding, setFeeding] = useState<{ id: string; key: number } | null>(null);
  const [collecting, setCollecting] = useState<{ id: string; good: GoodId; key: number } | null>(null);
  const [buildingOffer, setBuildingOffer] = useState<BuildingId | null>(null);
  const [penSheet, setPenSheet] = useState<BuildingId | null>(null);
  const [leftIds, setLeftIds] = useState<ReadonlySet<string>>(new Set());
  const [bagOpen, setBagOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [pickPlot, setPickPlot] = useState<number | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState<{ plot: number; price: number | null }>({ plot: 0, price: null });
  const [plotTrip, setPlotTrip] = useState<{ plot: number; since: number } | null>(null);
  const [plotCard, setPlotCard] = useState<{ plot: number; key: number } | null>(null);
  const [yardCardAt, setYardCardAt] = useState<{ x: number; y: number; stageWidth: number } | null>(null);
  const [watering, setWatering] = useState<{ plot: number; key: number } | null>(null);
  const [flying, setFlying] = useState<{ plot: number; crop: CropId; key: number } | null>(null);
  const [picking, setPicking] = useState<{ memberId: Id<"worldMembers">; name: string } | null>(null);
  const [watching, setWatching] = useState<Id<"cafeGames"> | null>(null);
  const invites = useQuery(api.world.invites, world.status === "in" ? {} : "skip");
  const [dismissedInvites, setDismissedInvites] = useState<ReadonlySet<string>>(new Set());
  const knocks = useQuery(api.world.knocks, world.status === "in" ? {} : "skip");
  const [dismissedKnocks, setDismissedKnocks] = useState<ReadonlySet<string>>(new Set());
  const [knockTries, setKnockTries] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopKeeper, setShopKeeper] = useState<Keeper>("sijin");
  const [coinsOpen, setCoinsOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [decorating, setDecorating] = useState(false);
  const [chosenItem, setChosenItem] = useState<string | null>(null);
  // A piece taken from the tray: drawn and dragged here, saved once it's put down.
  const [draft, setDraft] = useState<Placed | null>(null);
  const placeItemM = useMutation(api.worldHome.placeItem);
  const moveItemM = useMutation(api.worldHome.moveItem);
  const removeItemM = useMutation(api.worldHome.removeItem);
  const wallpaperM = useMutation(api.worldHome.setWallpaper);
  const myHome = world.home?.mine === true;
  if (shopOpen && world.status === "in" && world.place !== (shopKeeper === "josh" ? FARMER.place : NPC.place)) setShopOpen(false);
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
  // The arcade's games, over the World rather than instead of it.
  const [arcadeOpen, setArcadeOpen] = useState(opening === "arcade");
  const openArcade = useCallback(() => {
    // Anything that would close the arcade the moment it opens goes first.
    setSheet(null);
    setDecorating(false);
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
  const [heardRefusal, setHeardRefusal] = useState(0);
  if (world.sitRefused && world.sitRefused.at !== heardRefusal) {
    setHeardRefusal(world.sitRefused.at);
    setNote(world.sitRefused.text);
  }
  const [editing, setEditing] = useState(false);
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
    } else if (opening === "arcade") {
      // A link can arrive over the editor, or before a pending one opens.
      setEditing(false);
      setEditorAsked(false);
      openArcade();
    }
  }
  useEffect(() => {
    if (opening === "arcade") onOpeningUsed?.();
  }, [opening, onOpeningUsed]);
  // The editor closes with the visit (your look goes with it); open it again after.
  const hasMe = world.people.some((p) => p.isMe);
  if (editing && !hasMe && world.status !== "in") setEditing(false);
  // Another panel opening, or going somewhere else, closes the arcade.
  // Only a move after joining counts: the first join can land somewhere other
  // than the default place (your saved one), and that's not you travelling.
  const [arcadePlace, setArcadePlace] = useState<Place | null>(null);
  if (world.status === "in" && arcadePlace !== world.place) {
    if (arcadePlace !== null) setArcadeOpen(false);
    setArcadePlace(world.place);
  }
  if (arcadeOpen && (placesOpen || peopleOpen || settingsOpen || coinsOpen || shopOpen || boardOpen || editing || decorating || sheet !== null)) setArcadeOpen(false);
  // Asks you've turned down, as `${from}:${askAt}`. Declining sends nothing:
  // the ask just runs out.
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const insets = useSafeAreaInsets();
  const worldName = useWorldName();
  const screen = useWindowDimensions();
  const coinsBeside = screen.width >= COINS_BESIDE_FROM;
  const worldLog = worldChatLog(screen.width, screen.height);
  const tableLog = tableChatLog(screen.width, screen.height);
  // The mahjong lobby opens under the chat log; on a short screen the log gives up lines for it.
  const inMahjongLobby = mahjong.mine !== null && mahjong.mine.phase === "lobby";
  const worldLines = inMahjongLobby ? lobbyChatLines(screen.width, screen.height) : worldLog.lines;
  const keyboard = useKeyboardLift(Math.max(insets.bottom, 12));
  const chatLift = useAnimatedStyle(() => ({ transform: [{ translateY: -keyboard.lift.get() }] }));

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
  // Sitting down at a mahjong table opens its lobby, which closes the arcade: the arcade's card would cover the lobby's buttons (Table 2 is beside the cabinet).
  if (arcadeOpen && inLobbyAt(mahjong.mine, me?.seat)) setArcadeOpen(false);
  const mahjongCovers = playingAtTable(mahjong.mine, me?.seat) || (world.place === "cafe" && mahjongWatch !== null);
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
  const mahjongTagged = mahjongTags(mahjong.tables);
  const botStools = takeoverSeats(mahjong.tables);
  const challengeTo = (to: Id<"worldMembers">, kind: string) => {
    setPicking(null);
    void cafe.challenge(to, kind).then((problem) => setNote(problem ?? `Asked ${nameOf(to)} to play ${gameLabel(kind)}.`));
  };
  const openPicker = (memberId: Id<"worldMembers">, name: string) => {
    setPerson(null);
    setSheet(null);
    setPicking({ memberId, name });
  };
  const spectate = (gameId: string) => {
    setPerson(null);
    setSheet(null);
    setWatching(gameId as Id<"cafeGames">);
  };
  const [sheetTop, setSheetTop] = useState<number | null>(null);
  const [logBottom, setLogBottom] = useState(0);
  const logOverCafe = sheetTop !== null && !keyboard.open && logBottom <= sheetTop;
  const tappedGame = gameToWatch(cafe.playing, tapped?.memberId);
  const selectedGame = gameToWatch(cafe.playing, selected?.memberId);

  const myDuel = world.memberId ? duelFor(world.duels, world.memberId, now) : null;
  const duelOpponent = myDuel ? (myDuel.a === world.memberId ? myDuel.b : myDuel.a) : null;
  const pickInMyDuel = (pick: DuelPick) => {
    if (myDuel) void world.pickInDuel(myDuel.id, myDuel.round, pick).then((problem) => problem && setNote(problem));
  };
  // A duel's card needs the room above the chat bar, and its picks are timed,
  // so How to farm puts itself away when one starts and stays shut during it.
  if (myDuel && guideOpen) setGuideOpen(false);
  // It goes away with the keyboard and when you leave the backyard, and doesn't come back on its own.
  if (guideOpen && (keyboard.open || !inBackyard)) setGuideOpen(false);
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

  const live = useRef({ world, askFor, worldName, farm, animals, mahjong });
  useEffect(() => {
    live.current = { world, askFor, worldName, farm, animals, mahjong };
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
    }, 120);
    return () => clearInterval(id);
  }, [propTrip, openArcade, openBoard, onCalendar, onPraise]);

  // Walking away from the arcade closes its games as you set off: a new walk
  // checks straight away, and a walk is a line in time, not a stream of
  // updates, so it also checks as you go. Whether you've stood by the arcade,
  // and on which walk, lasts while its games are open, through a trip to the
  // leaderboard, and starts again when they close.
  const arcadeReach = useRef(AWAY_FROM_ARCADE);
  useEffect(() => {
    if (!arcadeOpen) arcadeReach.current = AWAY_FROM_ARCADE;
  }, [arcadeOpen]);
  const watchArcade = arcadeOpen && !away && world.status === "in" && world.place === "garden";
  const myWalk = world.people.find((p) => p.isMe)?.walk;
  const [headedX, headedZ] = [myWalk?.toX, myWalk?.toZ];
  useEffect(() => {
    if (!watchArcade) return;
    const check = () => {
      const { world: latest } = live.current;
      const walk = latest.people.find((p) => p.isMe)?.walk;
      const step = arcadeStep(arcadeReach.current, walk ? posAt(walk, latest.serverNow()) : null, walk ? { x: walk.toX, z: walk.toZ } : null, OBJECT_SPOTS.arcade);
      arcadeReach.current = step.reach;
      if (step.leave) setArcadeOpen(false);
    };
    check();
    const id = setInterval(check, 150);
    return () => clearInterval(id);
  }, [watchArcade, headedX, headedZ]);

  useEffect(() => {
    if (seatTrip === null) return;
    const seat = seatHere(seatTrip.place, seatTrip.seatId, live.current.world.home?.items);
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
      setSeatTrip(null);
      if (arrived && asksDevotional(seatTrip.place, seat.id)) setDevotionalAsked(true);
    }, 120);
    return () => clearInterval(id);
  }, [seatTrip]);

  const highlighted = tripTarget({ prop: propTrip, seat: seatTrip, plot: plotTrip, animal: animalTrip });

  const [fade] = useState(() => new Animated.Value(0));
  const clearWatering = useCallback(() => setWatering(null), []);
  const [planting, setPlanting] = useState<{ plot: number; crop: CropId; key: number } | null>(null);
  const [gain, setGain] = useState<{ text: string; key: number } | null>(null);
  const [bagBump, setBagBump] = useState(0);
  const flyingCrop = flying?.crop;
  const clearFlying = useCallback(() => {
    setFlying(null);
    if (flyingCrop) {
      setGain({ text: `+1 ${CROPS[flyingCrop].label}`, key: Date.now() });
      setBagBump((n) => n + 1);
    }
  }, [flyingCrop]);
  const clearPlanting = useCallback(() => setPlanting(null), []);
  const clearGain = useCallback(() => setGain(null), []);
  const triedFromWalk = useRef<number | null>(null);
  const go = (to: Place, invite?: Id<"worldInvites">, onArrived?: () => void, door = false) => {
    setPerson(null);
    setPlotTrip(null);
    setAnimalTrip(null);
    setYardCard(null);
    setBuildingOffer(null);
    setPenSheet(null);
    setFeeding(null);
    setCollecting(null);
    setPlotCard(null);
    setPickPlot(null);
    setGuideOpen(false);
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
    setDraft(null);
    setWatching(null);
    const veil = (toValue: number) =>
      Animated.timing(fade, { toValue, duration: 180, useNativeDriver: Platform.OS !== "web" }).start();
    veil(1);
    void live.current.world.travel(to, { invite, door }).then((problem) => {
      veil(0);
      if (problem) setNote(problem);
      else {
        announce(to === "home" ? (invite ? "You're at their home." : "You're home.") : to === "backyard" ? "You're in the backyard." : `You're in ${PLACE_TITLES[to]}.`);
        onArrived?.();
      }
    });
  };
  const goHome = () => go("home");
  // The backyard's only door is in the home, so from anywhere else go home and straight on through.
  const goBackyard = () => (world.place === "home" || world.place === "backyard" ? go("backyard") : go("home", undefined, () => go("backyard")));
  const invitePerson = (memberId: Id<"worldMembers">, name: string) =>
    void world.invite(memberId).then((problem) => setNote(problem ?? `Invited ${worldName(name)} home.`));
  const askToVisit = (memberId: Id<"worldMembers">, name: string) =>
    void world.knock(memberId).then((problem) => setNote(problem ?? `Asked to visit ${worldName(name)}'s home.`));

  const said = (e: unknown, otherwise: string) => (e instanceof ConvexError ? String(e.data) : otherwise);
  const decorate = (change: () => Promise<{ ok: boolean; retryInMs?: number }>) =>
    void change()
      .then((reply) => {
        if (!reply.ok) setNote(`Slow down a little. Try again in ${Math.ceil((reply.retryInMs ?? 1000) / 1000)}s.`);
      })
      .catch((e: unknown) => setNote(said(e, "That didn't save.")));
  const pendingCount = useRef(0);
  /** Saves a piece taken from the tray where it now stands: the one write for it. */
  const putDown = (piece: Placed) => {
    pendingCount.current += 1;
    const key = `${PENDING_PREFIX}${pendingCount.current}`;
    setDraft(null);
    setChosenItem((was) => (was === DRAFT_KEY ? key : was));
    void placeItemM
      .withOptimisticUpdate(showPlace(key))({ item: piece.item, x: piece.x, z: piece.z, turn: piece.turn })
      .then((reply) => {
        setChosenItem((was) => (was === key ? (reply.ok ? reply.key : null) : was));
        if (!reply.ok) setNote(`Slow down a little. Try again in ${Math.ceil(reply.retryInMs / 1000)}s.`);
      })
      .catch((e: unknown) => {
        setChosenItem((was) => (was === key ? null : was));
        setNote(said(e, "That didn't fit."));
      });
  };
  const placeNew = (item: FurnitureId) => {
    if (draft) putDown(draft);
    const at = myPoseNow() ?? { x: 0, z: 0 };
    const spot = fitInRoom(item, at.x, Math.min(at.z - 2.6, 0), 0) ?? { x: 0, z: -4 };
    setDraft({ key: DRAFT_KEY, item, x: spot.x, z: spot.z, turn: 0 });
    setChosenItem(DRAFT_KEY);
  };
  // Decorating closed some other way (the arcade, leaving): the piece not put down goes back in the tray.
  if (draft && !decorating) setDraft(null);
  const shownHome = useMemo(() => (world.home && draft ? { ...world.home, items: [...world.home.items, draft] } : world.home), [world.home, draft]);
  const chosen = chosenItem ? shownHome?.items.find((p) => p.key === chosenItem) : undefined;
  // A piece put down keeps its ring while it waits for its key.
  if (chosenItem && shownHome && !chosen && !isPending(chosenItem)) setChosenItem(null);
  /** Moves the chosen piece: the draft only here, a placed one saved (shown at once, put back if it doesn't save). */
  const shift = (piece: Placed, x: number, z: number, turn: number) => {
    if (piece.key === DRAFT_KEY) setDraft({ ...piece, x, z, turn });
    else if (!isPending(piece.key) && (piece.x !== x || piece.z !== z || piece.turn !== turn)) decorate(() => moveItemM.withOptimisticUpdate(showMove)({ key: piece.key, x, z, turn }));
  };
  const turnChosen = () => {
    if (!chosen || !isFurniture(chosen.item)) return;
    const turn = ((chosen.turn + 1) % 4) as 0 | 1 | 2 | 3;
    const spot = fitInRoom(chosen.item, chosen.x, chosen.z, turn);
    if (!spot) return setNote("No room to turn it here.");
    shift(chosen, spot.x, spot.z, turn);
  };
  const moveChosen = (x: number, z: number) => {
    if (!chosen || !isFurniture(chosen.item) || !isTurn(chosen.turn)) return;
    const spot = fitInRoom(chosen.item, x, z, chosen.turn);
    if (!spot) return setNote("Keep it inside the room.");
    shift(chosen, spot.x, spot.z, chosen.turn);
  };
  /** A piece dragged and let go: put down where it was dropped, saved once. */
  const dropItem = (key: string, x: number, z: number) => {
    const piece = shownHome?.items.find((p) => p.key === key);
    if (!piece) return;
    // Another piece dragged while one from the tray waits: that one's put down where it is.
    if (draft && key !== DRAFT_KEY) putDown(draft);
    setChosenItem(key);
    if (key === DRAFT_KEY) putDown({ ...piece, x, z });
    else shift(piece, x, z, piece.turn);
  };
  const chooseItem = (key: string) => {
    if (draft && key !== DRAFT_KEY) putDown(draft);
    setChosenItem(key);
  };
  const doneMoving = () => {
    if (draft) putDown(draft);
    setChosenItem(null);
  };
  const putAway = () => {
    if (!chosen) return;
    setChosenItem(null);
    if (chosen.key === DRAFT_KEY) setDraft(null);
    else if (!isPending(chosen.key)) decorate(() => removeItemM.withOptimisticUpdate(showRemove)({ key: chosen.key }));
  };
  // A piece put down shows its ring while it waits for its key, but nothing can be done to it until then.
  const itemActions: HudAction[] = chosen && isFurniture(chosen.item) && !isPending(chosen.key)
    ? [
        { id: "turn", label: "Turn", hint: `Turn the ${FURNITURE[chosen.item].label.toLowerCase()}`, icon: "refresh", onPress: turnChosen },
        { id: "away", label: "Put away", hint: `Put the ${FURNITURE[chosen.item].label.toLowerCase()} away`, icon: "archive-outline", onPress: putAway },
        { id: "done", label: "Done", hint: chosen.key === DRAFT_KEY ? "Put it down here" : "Done moving it", icon: "checkmark", onPress: doneMoving },
      ]
    : [];
  const nowForInvites = world.serverNow();
  const invite = (invites ?? []).find((row) => nowForInvites - row.at < INVITE_CARD_MS && !dismissedInvites.has(`${row.id}:${row.at}`));
  const knock = (knocks ?? []).find((row) => nowForInvites < row.expiresAt && !dismissedKnocks.has(`${row.id}:${row.at}`));
  const [, setInviteExpired] = useState(0);
  const inviteEnds = invite ? invite.at + INVITE_CARD_MS : null;
  const knockEnds = knock ? knock.expiresAt : null;
  const cardEnds = inviteEnds !== null && knockEnds !== null ? Math.min(inviteEnds, knockEnds) : (inviteEnds ?? knockEnds);
  useEffect(() => {
    if (cardEnds === null) return;
    const id = setTimeout(() => setInviteExpired((n) => n + 1), Math.max(0, cardEnds - live.current.world.serverNow()) + 1);
    return () => clearTimeout(id);
  }, [cardEnds]);
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
    goRef.current(backTarget, undefined, undefined, backDoor);
  }, [backTarget, backDoor, onStay]);
  const myWalkStart = me?.walk?.startedAt ?? null;
  const myArrival = me?.walk ? posAt(me.walk, me.walk.startedAt).arrivesAt : null;
  useEffect(() => {
    if (away || myWalkStart === null || myArrival === null) return;
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
      goRef.current(trip.to, undefined, undefined, trip.door);
    };
    id = setTimeout(check, Math.max(0, myArrival + PAD_SETTLE_MS - live.current.world.serverNow()) + 1);
    return () => clearTimeout(id);
  }, [away, myWalkStart, myArrival]);

  // At a home each placed piece is its own furniture, however close two stand.
  const samePiece = (a: { id: string; x: number; z: number }, b: { id: string; x: number; z: number }) =>
    world.place === "home" ? homeSeatPiece(a.id) === homeSeatPiece(b.id) : Math.hypot(a.x - b.x, a.z - b.z) <= SAME_FURNITURE;
  const sitNear = (seatId: string) => {
    setPerson(null);
    setApproach(null);
    setPropTrip(null);
    setPlotTrip(null);
    setAnimalTrip(null);
    setDevotionalAsked(false);
    setTray(false);
    const seats = seatsHere(world.place, world.home?.items);
    const mahjongMove = mahjongTap(seatId, mahjong.tables, me?.memberId ?? null);
    if (mahjongMove?.kind === "watch") {
      setMahjongWatch(mahjongMove.tableId);
      return;
    }
    if (mahjongMove?.kind === "taken") {
      setNote("Those seats are taken.");
      return;
    }
    const tapped = seats.find((seat) => seat.id === (mahjongMove?.kind === "sit" ? mahjongMove.seat : seatId));
    if (!tapped) return;
    const taken = seatsTaken(world.people.filter((p) => !p.isMe), seats);
    const free = seats
      .filter((seat) => !taken.has(seat.id) && samePiece(seat, tapped))
      .sort((a, b) => Math.hypot(a.x - tapped.x, a.z - tapped.z) - Math.hypot(b.x - tapped.x, b.z - tapped.z))[0];
    if (!free) {
      setNote("Those seats are taken.");
      return;
    }
    const mePose = myPoseNow();
    if (me?.seat === free.id && mePose && !mePose.walking && distance(mePose, free) <= AT_OBJECT) {
      setSeatTrip(null);
      if (asksDevotional(world.place, free.id)) setDevotionalAsked(true);
      return;
    }
    world.sitOn(free.id);
    setSeatTrip({ seatId: free.id, place: world.place, since: Date.now() });
  };

  const goToObject = (kind: InteractivePropId, trigger: () => void) => {
    setPerson(null);
    setApproach(null);
    setSeatTrip(null);
    setPlotTrip(null);
    setAnimalTrip(null);
    setTray(false);
    const spot = OBJECT_SPOTS[kind];
    const mePose = myPoseNow();
    if (!mePose || distance(mePose, spot) <= AT_OBJECT) {
      setPropTrip(null);
      trigger();
      return;
    }
    if (kind === "lectern") world.standAt("lectern");
    else world.walkTo(spot.x, spot.z);
    setPropTrip({ kind, since: Date.now() });
  };

  const goToArcade = () => goToObject("arcade", openArcade);
  const goToNoticeBoard = () => goToObject("noticeboard", onCalendar);
  const goToNotices = () => goToObject("notices", openBoard);
  const goToPiano = () => goToObject("piano", onPraise);
  // The first tap takes you behind the lectern to face the room; a tap while
  // you stand there offers Devotionals.
  const goToLectern = () => goToObject("lectern", () => setDevotionalAsked(true));

  const emote = (id: string) => void world.act(id).then((problem) => problem && setNote(problem));

  const plantOn = (plot: number) => farmView?.plants.find((p) => p.plot === plot) ?? null;
  const wateredBy = (plant: NonNullable<ReturnType<typeof plantOn>>, wateredAt: number | null) =>
    wateredAt === null ? null : (plant.waterings.find((w) => w.at === wateredAt)?.by ?? null);
  const gardenPlants = (farmView?.plants ?? []).map((plant) => {
    const g = growth(plant, farmNow);
    const by = wateredBy(plant, g.wateredAt);
    return { plot: plant.plot, crop: plant.crop, stage: g.stage, progress: g.progress, wilted: g.wilted, thirsty: g.thirsty, wet: g.wateredAt !== null, ...(by ? { note: `Watered by ${worldName(by)}` } : {}) };
  });
  const cardFor = (plot: number): FarmCardData | null => {
    const plant = plantOn(plot);
    if (!plant) return null;
    const now = Math.max(farmNow, plant.plantedAt);
    const g = growth(plant, now);
    const crop: CropId = isCrop(plant.crop) ? plant.crop : "lettuce";
    const wilts = g.wilts > 0 ? ` · wilted ${g.wilts}×` : "";
    const badge =
      g.stage === "ripe"
        ? "Ready"
        : g.stage === "dead"
          ? "Died"
          : g.wilted
            ? "Wilted"
            : g.thirsty
              ? "Needs water"
              : "Growing";
    const tone: FarmCardData["tone"] =
      g.stage === "ripe"
        ? "ready"
        : g.stage === "dead"
          ? "muted"
          : g.wilted
            ? "warn"
            : g.thirsty
              ? "water"
              : "good";
    const detail =
      g.stage === "ripe"
        ? `${farmView?.mine ? "Tap to harvest" : "Ready to harvest"}${wilts}`
        : g.stage === "dead"
          ? `${farmView?.mine ? "Tap to clear" : "Needs clearing"}${wilts}`
          : `${timeLeft((g.readyAt ?? now) - now)}${wilts}`;
    return {
      title: cropLabel(plant.crop),
      badge,
      tone,
      detail,
      progress: g.stage === "dead" ? undefined : g.progress,
      icon: <CropThumb crop={crop} size={30} />,
    };
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
    // How to farm makes way for the plot, pen or animal you tap.
    setGuideOpen(false);
    setPerson(null);
    setApproach(null);
    setTray(false);
    setPropTrip(null);
    setSeatTrip(null);
    if (plot >= farmView.plots) {
      setPlotTrip(null);
      setAnimalTrip(null);
      if (farmView.mine) {
        setOffer({ plot: farmView.plots, price: plotPrice(farmView.plots) });
        setOfferOpen(true);
      }
      return;
    }
    setYardCard(null);
    if (plantOn(plot)) setPlotCard({ plot, key: Date.now() });
    if (!needsVisit(plot)) return;
    const spot = plotStand(plot);
    const mePose = myPoseNow();
    if (mePose && distance(mePose, spot) <= AT_OBJECT) {
      setPlotTrip(null);
      setAnimalTrip(null);
      actOnPlot(plot);
      return;
    }
    world.walkTo(spot.x, spot.z);
    setAnimalTrip(null);
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
      setAnimalTrip(null);
      if (arrived) actRef.current(plotTrip.plot);
    }, 120);
    return () => clearInterval(id);
  }, [plotTrip]);
  useEffect(() => {
    if (plotCard === null) return;
    const id = setTimeout(() => setPlotCard(null), STATUS_CARD_MS);
    return () => clearTimeout(id);
  }, [plotCard]);
  const describePlot = (plot: number): string | null => {
    if (!farmView) return null;
    if (plot >= farmView.plots) return farmView.mine ? `Plot ${plot + 1}, locked, ${plotPrice(plot)} coins` : null;
    const plant = plantOn(plot);
    if (!plant) return `Plot ${plot + 1}, empty`;
    const g = growth(plant, farmNow);
    return `${plantCard(plant, farmNow)}${g.thirsty ? ", needs water" : ""}`;
  };
  const plantPicked = (plot: number, crop: CropId) => {
    setPickPlot(null);
    setPlanting({ plot, crop, key: Date.now() });
    void farm.plant(plot, crop).then((problem) => {
      if (!problem) return;
      setPlanting(null);
      setNote(problem);
    });
  };
  const plotCardData = plotCard ? cardFor(plotCard.plot) : null;
  const gardenFarm: GardenFarm | null = farmView
    ? {
        plots: farmView.plots,
        mine: farmView.mine,
        plants: gardenPlants,
        card: plotCard && plotCardData ? { plot: plotCard.plot, data: plotCardData } : null,
        watering,
        flying,
        bagAt: { x: 54, y: insets.top + 30 },
        onTapPlot: tapPlot,
        onWatered: clearWatering,
        onFlown: clearFlying,
        planting,
        onPlanted: clearPlanting,
        describe: describePlot,
      }
    : null;

  const suggestName = useCallback((kind: AnimalId) => randomName(kind, Math.random()), []);
  const yardView = animals.view;
  const yardAnimals = yardView?.animals;
  const shownAnimals = useMemo(() => (yardAnimals ?? []).filter((a) => !leftIds.has(a.id)), [yardAnimals, leftIds]);
  const animalOn = (id: string) => shownAnimals.find((a) => a.id === id) ?? null;
  const feedOf = (kind: string): FeedId => (kind === "cow" ? "hay" : "grain");
  const settling = useRef(false);
  const settleNow = useCallback(() => {
    if (settling.current) return;
    settling.current = true;
    void live.current.animals.settle().then((names) => {
      settling.current = false;
      if (names.length > 0) setNote(`${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`} wandered off`);
    });
  }, []);
  const wanderedNotes = yardView?.mine ? yardView.wandered.length : 0;
  useEffect(() => {
    if (wanderedNotes > 0) settleNow();
  }, [wanderedNotes, settleNow]);
  const onAnimalLeft = useCallback(
    (id: string) => {
      setLeftIds((was) => new Set([...was, id]));
      if (live.current.animals.view?.mine) settleNow();
    },
    [settleNow]
  );
  const clearFeeding = useCallback(() => setFeeding(null), []);
  const collectedGood = collecting?.good;
  const clearCollecting = useCallback(() => {
    setCollecting(null);
    if (collectedGood) {
      setGain({ text: `+1 ${GOODS[collectedGood].label}`, key: Date.now() });
      setBagBump((n) => n + 1);
    }
  }, [collectedGood]);
  const actOnAnimal = (id: string) => {
    const { world: latest, animals: yardLive } = live.current;
    const animal = yardLive.view?.animals.find((a) => a.id === id);
    if (!animal || !yardLive.view) return;
    const l = life(animal, latest.serverNow());
    if (yardLive.view.mine && l.ready) {
      void yardLive.collect(id).then((reply) => {
        if (typeof reply === "string") setNote(reply);
        else if (isGood(reply.good)) {
          setYardNow(reply.serverNow);
          setCollecting({ id, good: reply.good, key: Date.now() });
        }
      });
    } else if (l.mood === "hungry" || l.mood === "frail") {
      setFeeding({ id, key: Date.now() });
      void yardLive.feed(id).then((reply) => {
        if (typeof reply === "number") return setYardNow(reply);
        setFeeding(null);
        setNote(reply);
      });
    }
  };
  const animalActRef = useRef(actOnAnimal);
  useEffect(() => {
    animalActRef.current = actOnAnimal;
  });
  const tapAnimal = (id: string) => {
    const animal = animalOn(id);
    if (!animal || !yardView) return;
    setGuideOpen(false);
    setPerson(null);
    setApproach(null);
    setTray(false);
    setPropTrip(null);
    setSeatTrip(null);
    setPlotTrip(null);
    setAnimalTrip(null);
    const at = buildingFor(isAnimal(animal.kind) ? animal.kind : "chicken");
    const l = life(animal, world.serverNow());
    const hungry = l.mood === "hungry" || l.mood === "frail";
    const collect = yardView.mine && l.ready;
    const noFeed = !collect && hungry && (farm.bag?.feed[feedOf(animal.kind)] ?? 0) < 1;
    setPlotCard(null);
    setYardCard({ at, id, extra: noFeed ? `Get feed from ${FARMER.name.split(" ")[0]}` : null, key: world.serverNow() });
    if (noFeed || !(hungry || collect)) return;
    const spot = penStand(at);
    const mine = world.people.find((p) => p.isMe);
    const mePose = mine?.walk ? posAt(mine.walk, world.serverNow()) : null;
    if (mePose && distance(mePose, spot) <= AT_OBJECT) {
      setAnimalTrip(null);
      actOnAnimal(id);
      return;
    }
    world.walkTo(spot.x, spot.z);
    setAnimalTrip({ id, since: world.serverNow() });
  };
  useEffect(() => {
    if (animalTrip === null) return;
    const animal = live.current.animals.view?.animals.find((a) => a.id === animalTrip.id);
    const spot = penStand(buildingFor(animal && isAnimal(animal.kind) ? animal.kind : "chicken"));
    const id = setInterval(() => {
      const { world: latest } = live.current;
      const at = latest.serverNow();
      const mine = latest.people.find((p) => p.isMe);
      const pose = mine?.walk ? posAt(mine.walk, at) : null;
      // The animal can wander off, or the yard can go, while you walk over.
      const still = live.current.animals.view?.animals.some((a) => a.id === animalTrip.id && life(a, at).mood !== "gone") ?? false;
      const arrived = still && pose !== null && distance(pose, spot) <= AT_OBJECT;
      const strayed = !still || pose === null || (!pose.walking && at - pose.arrivesAt > 400) || at - animalTrip.since > OBJECT_TRIP_MS;
      if (!arrived && !strayed) return;
      setAnimalTrip(null);
      if (arrived) animalActRef.current(animalTrip.id);
    }, 120);
    return () => clearInterval(id);
  }, [animalTrip]);
  useEffect(() => {
    if (yardCard === null) return;
    const id = setTimeout(() => setYardCard(null), STATUS_CARD_MS);
    return () => clearTimeout(id);
  }, [yardCard]);
  const tapBuilding = (kind: BuildingId) => {
    if (!yardView) return;
    setGuideOpen(false);
    setPerson(null);
    setTray(false);
    setAnimalTrip(null);
    if (!yardView[kind]) {
      if (yardView.mine) setBuildingOffer(kind);
      return;
    }
    if (yardView.mine) {
      setPenSheet(kind);
      return;
    }
    setPlotCard(null);
    setYardCard({ at: kind, id: null, extra: null, key: world.serverNow() });
  };
  const yardCardData: FarmCardData | null = (() => {
    if (!yardCard || !yardView) return null;
    if (yardCard.id === null) {
      const kind = animalFor(yardCard.at);
      const count = shownAnimals.filter((a) => a.kind === kind && life(a, farmNow).mood !== "gone").length;
      const cap = BUILDINGS[yardCard.at].capacity;
      return {
        title: BUILDINGS[yardCard.at].label,
        badge: `${count} of ${cap}`,
        tone: "good",
        icon: <AnimalThumb kind={kind} stage={2} size={30} />,
      };
    }
    const animal = animalOn(yardCard.id);
    if (!animal) return null;
    const l = life(animal, farmNow);
    const kind = animal.kind === "cow" ? "cow" : "chicken";
    const days = ANIMALS[kind].growDays;
    const readyWord = kind === "cow" ? "Milk ready" : "Egg ready";
    const needsFeed = l.mood === "frail" || l.mood === "hungry";
    const badge = l.mood === "gone" ? "Wandered off" : l.mood === "frail" ? "Frail" : l.mood === "hungry" ? "Hungry" : l.ready ? readyWord : "Fed";
    const tone: FarmCardData["tone"] = l.mood === "gone" ? "muted" : needsFeed ? "warn" : l.ready ? "ready" : "good";
    const collect = l.ready && yardView.mine ? " · Tap to collect" : "";
    const detail =
      l.mood === "gone"
        ? stageLabel(animal.kind, l.stage)
        : !l.grown
          ? `${stageLabel(animal.kind, l.stage)} · Day ${l.day} of ${days}`
          : l.ready && needsFeed
            ? `${readyWord}${collect}`
            : `${stageLabel(animal.kind, l.stage)}${collect}`;
    return {
      title: animal.name,
      badge,
      tone,
      detail,
      hint: yardCard.extra ?? undefined,
      progress: l.mood === "gone" || l.grown ? undefined : l.progress,
      icon: <AnimalThumb kind={kind} stage={l.stage} mood={l.mood} size={30} />,
    };
  })();
  const penAnimals = useMemo(
    () =>
      shownAnimals.map((animal) => {
        const l = life(animal, farmNow);
        const fed = l.fedAt === null ? undefined : animal.feedings.find((f) => f.at === l.fedAt);
        const by = !fed?.by ? null : fed.mine ? "you" : worldName(fed.by);
        return {
          id: animal.id,
          kind: animal.kind === "cow" ? ("cow" as const) : ("chicken" as const),
          name: animal.name,
          stage: l.stage,
          progress: l.progress,
          mood: l.mood,
          ready: l.ready,
          label: animalLabel(animal, farmNow),
          ...(by ? { note: `Fed by ${by}` } : {}),
        };
      }),
    [shownAnimals, farmNow, worldName]
  );
  const gardenYard: GardenYard | null = yardView
    ? {
        coop: yardView.coop,
        barn: yardView.barn,
        mine: yardView.mine,
        animals: penAnimals,
        card: yardCard && yardCardData ? { at: yardCard.at, data: yardCardData } : null,
        feeding,
        collecting,
        onTapAnimal: tapAnimal,
        onTapBuilding: tapBuilding,
        onFed: clearFeeding,
        onCollected: clearCollecting,
        onLeft: onAnimalLeft,
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
    setPlotTrip(null);
    setAnimalTrip(null);
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
  const gameAction: HudAction[] = !selected
    ? []
    : selectedGame
      ? [{ id: "spectate", label: "Spectate", hint: `Spectate ${selectedName}'s game`, icon: "eye-outline", onPress: () => spectate(selectedGame) }]
      : world.place === "cafe"
        ? [{ id: "play", label: "Play", hint: `Play a game with ${selectedName}`, emoji: "🎲", onPress: () => openPicker(selected.memberId, selected.name) }]
        : [];
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
                ...gameAction,
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

  const overlayOpen = shopOpen || coinsOpen || boardOpen || peopleOpen || arcadeOpen || bagOpen || offerOpen || pickPlot !== null || buildingOffer !== null || penSheet !== null || sheet !== null || editing;
  const noteOnTop = overlayOpen || mahjongCovers;
  const noteOver =
    note && noteOnTop ? (
      <View style={[styles.noteOver, { top: insets.top + 8 }]} pointerEvents="none">
        <Text style={styles.note} accessibilityLiveRegion={NOTE_LIVE_REGION}>
          {note}
        </Text>
      </View>
    ) : null;
  const chatTop = Math.max(insets.bottom, 12) + CHAT_BAR_HEIGHT + 12;
  const cafeLayer = (aboveChat: boolean) => (
    <CafeLayer
      cafe={cafe}
      people={world.people}
      muted={muted}
      place={world.place}
      serverNow={world.serverNow}
      bottom={chatTop}
      sheetBottom={aboveChat ? chatTop : Math.max(insets.bottom, 16)}
      lift={aboveChat ? keyboard.lift : undefined}
      safe={{ top: insets.top, bottom: insets.bottom }}
      onNote={setNote}
      onReturn={() => go("cafe")}
      watch={watching}
      onStopWatching={() => setWatching(null)}
      onSheetTop={setSheetTop}
    />
  );
  const sheets = (
    <>
      <NoticeBoardPanel
        open={boardOpen}
        top={insets.top + TOP_BAR_GAP}
        onClose={() => setBoardOpen(false)}
        onOpenLink={(url) => {
          setBoardOpen(false);
          onOpenLink(url);
        }}
        onNote={setNote}
      />
      <ShopPanel
        open={shopOpen}
        keeper={shopKeeper}
        top={insets.top + TOP_BAR_GAP}
        bottom={Math.max(insets.bottom, 12) + CHAT_BAR_HEIGHT + SHOP_CHAT_GAP}
        wallet={wallet}
        onClose={() => setShopOpen(false)}
        onBought={setNote}
        farm={{
          crops: farm.bag?.crops ?? {},
          seeds: farm.bag?.seeds ?? {},
          goods: farm.bag?.goods ?? {},
          feed: farm.bag?.feed ?? {},
          nameTags: farm.bag?.nameTags ?? 0,
          buySeeds: farm.buySeeds,
          buyFeed: animals.buyFeed,
          buyNameTag: animals.buyNameTag,
          buyAnimal: animals.buyAnimal,
          suggestName,
          serverNow: world.serverNow,
          sell: farm.sell,
        }}
      />
      <BagPanel open={bagOpen} top={insets.top + TOP_BAR_GAP} bag={farm.bag} onClose={() => setBagOpen(false)} />
      <BuildingOffer
        kind={buildingOffer}
        top={insets.top + TOP_BAR_GAP}
        balance={wallet?.balance ?? 0}
        onBuy={async (kind) => {
          const problem = await animals.buyBuilding(kind);
          if (!problem) setBuildingOffer(null);
          return problem;
        }}
        onClose={() => setBuildingOffer(null)}
      />
      <PenSheet
        kind={penSheet}
        top={insets.top + TOP_BAR_GAP}
        animals={shownAnimals
          .filter((a) => life(a, farmNow).mood !== "gone")
          .map((a) => {
            const l = life(a, farmNow);
            return { id: a.id, kind: a.kind, name: a.name, stage: l.stage, mood: l.mood, status: [stageLabel(a.kind, l.stage), ...animalCard(a, farmNow).split(" · ").slice(1)].join(" · ") };
          })}
        nameTags={farm.bag?.nameTags ?? 0}
        onRename={(id, name) => animals.rename(id, name)}
        onClose={() => setPenSheet(null)}
      />
      <PlantPicker plot={pickPlot} top={insets.top + TOP_BAR_GAP} bag={farm.bag} onPick={plantPicked} onClose={() => setPickPlot(null)} />
      <PlotOffer
        open={offerOpen}
        top={insets.top + TOP_BAR_GAP}
        plot={offer.plot}
        price={offer.price}
        balance={wallet?.balance ?? 0}
        onBuy={async () => {
          const problem = await farm.buyPlot(offer.plot);
          if (!problem) setOfferOpen(false);
          return problem;
        }}
        onClose={() => setOfferOpen(false)}
      />
      <CoinsPanel
        open={coinsOpen}
        top={insets.top + TOP_BAR_GAP}
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
        onPlay={world.place === "cafe" && tapped && !tappedGame ? (to) => openPicker(to, tapped.name) : undefined}
        onSpectate={tappedGame ? () => spectate(tappedGame) : undefined}
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
        top={insets.top + TOP_BAR_GAP}
        roomId={world.roomId}
        people={world.people}
        online={online}
        onPerson={(memberId) => {
          setPeopleOpen(false);
          setPerson(memberId);
        }}
        place={world.place}
        onWalkOver={walkOver}
        onInvite={invitePerson}
        onAskToVisit={askToVisit}
        playing={playingNow.lines}
        onClose={() => setPeopleOpen(false)}
        pokeListOpen={opening === "poke"}
      />
      <ArcadePanel
        open={arcadeOpen}
        top={insets.top + TOP_BAR_GAP}
        bottom={Math.max(insets.bottom, 12) + CHAT_BAR_HEIGHT + SHOP_CHAT_GAP}
        // The panel covers the coins under the title on a narrow phone.
        coins={!coinsBeside}
        nameOf={worldName}
        onOpen={(target) => {
          // The panel stays for the leaderboard, there when you come back.
          if (target !== "leaderboard") setArcadeOpen(false);
          onGame(target);
        }}
        onClose={() => setArcadeOpen(false)}
      />
      <CafePicker person={picking} look={picking ? (world.people.find((p) => p.memberId === picking.memberId)?.look ?? null) : null} top={insets.top + TOP_BAR_GAP} onPick={challengeTo} onClose={() => setPicking(null)} />
      <SettingsPanel
        open={settingsOpen}
        top={insets.top + TOP_BAR_GAP}
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
  const myBackyard = world.place === "backyard" && farmView?.mine === true;
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
            label: "Home",
            icon: "home" as const,
            section: "Your home",
            accessibilityLabel: "Go to your home",
            onPress: goHome,
          },
        ]),
    ...(myBackyard
      ? []
      : [
          {
            id: "backyard",
            label: "Backyard",
            icon: "flower-outline" as const,
            section: "Your home",
            accessibilityLabel: "Go to your backyard",
            onPress: goBackyard,
          },
        ]),
    ...(world.place === WORLD_PLACE
      ? []
      : [
          {
            id: "garden",
            label: "Garden",
            icon: "leaf" as const,
            accessibilityLabel: "Go to the Garden",
            onPress: () => go(WORLD_PLACE),
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
        go("home", invite.id, () => setDismissedInvites((set) => new Set(set).add(shown)));
      }}
      onLater={() => setDismissedInvites((set) => new Set(set).add(`${invite.id}:${invite.at}`))}
    />
  ) : null;

  const knockCard = knock ? (
    <KnockCard
      key={`${knock.id}:${knock.at}:${knockTries}`}
      name={knock.guestName}
      look={knock.look}
      onAnswer={(allow) => {
        const shown = `${knock.id}:${knock.at}`;
        const guestName = knock.guestName;
        void world.answerKnock(knock.id, allow).then((problem) => {
          if (problem) {
            setDismissedKnocks((set) => {
              const next = new Set(set);
              next.delete(shown);
              return next;
            });
            setKnockTries((n) => n + 1);
            setNote(problem);
          } else if (allow) setNote(`Invited ${worldName(guestName)} home.`);
        });
      }}
      onGone={() => {
        const shown = `${knock.id}:${knock.at}`;
        setDismissedKnocks((set) => new Set(set).add(shown));
      }}
    />
  ) : null;

  const liveNote =
    Platform.OS === "web" ? (
      <Text style={styles.offscreen} aria-live="polite">
        {note ?? ""}
      </Text>
    ) : null;

  if (away) return <View style={styles.fill} />;

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
          playing: playingNow.tags.get(p.memberId) ?? mahjongTagged.get(p.memberId),
        }))}
        serverNow={world.serverNow}
        target={world.target}
        onHoldStart={(x, z) => {
          setTray(false);
          setGuideOpen(false);
          setPerson(null);
          setPlotCard(null);
          setYardCard(null);
          setApproach(null);
          setPropTrip(null);
          setPlotTrip(null);
          setAnimalTrip(null);
          setSeatTrip(null);
          world.holdStart(x, z);
        }}
        onHoldMove={world.holdMove}
        onHoldEnd={world.holdEnd}
        onTapPerson={(memberId) => {
          // Tapping yourself opens nothing; it only puts away what was open.
          if (live.current.world.people.some((p) => p.isMe && p.memberId === memberId)) {
            setTray(false);
            setGuideOpen(false);
            setPerson(null);
            return;
          }
          setTray(false);
          setGuideOpen(false);
          setPropTrip(null);
          setPlotTrip(null);
          setAnimalTrip(null);
          setSeatTrip(null);
          setPlotCard(null);
          setYardCard(null);
          // Someone playing mahjong: open their game to watch.
          const atTable = tableToWatch(live.current.mahjong.tables, memberId);
          if (atTable) {
            setPerson(null);
            setMahjongWatch(atTable);
            return;
          }
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
        home={shownHome}
        homeExit={world.place === "home" ? exitOf(world.home) : undefined}
        cardTop={logBottom + CARD_GAP}
        onTapNpc={() => {
          setPerson(null);
          setTray(false);
          setShopKeeper("sijin");
          setShopOpen(true);
        }}
        onTapFarmer={() => {
          setPerson(null);
          setTray(false);
          setShopKeeper("josh");
          setShopOpen(true);
        }}
        decor={
          decorating
            ? { selected: chosenItem, onItem: chooseItem, onFloor: moveChosen, onDrop: dropItem, actions: itemActions, hudTop: insets.top + (coinsBeside ? 66 : 104) + 8 }
            : null
        }
        paused={!foreground || editing}
        farm={inBackyard ? gardenFarm : null}
        yard={inBackyard ? gardenYard : null}
        onYardCardAt={setYardCardAt}
        takeoverSeats={botStools}
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
            bump={bagBump}
            calm={calm}
          />
          {coinsBeside ? <CoinCounter balance={wallet?.balance} onPress={openCoins} /> : null}
        </View>
        {gain ? <GainChip key={gain.key} text={gain.text} x={20} y={52} live={!calm} onDone={clearGain} /> : null}
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
      <View style={[styles.logRow, { top: insets.top + (coinsBeside ? 66 : 104), maxWidth: worldLog.maxWidth }, logOverCafe ? styles.overCafe : null]} pointerEvents="box-none" testID="world-log-row" onLayout={(e) => setLogBottom(Math.ceil(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}>
        {/* The chat log sits where the arcade opens; it steps aside while the arcade is open. */}
        {decorating || arcadeOpen ? null : (
          <ChatLog
            roomId={world.status === "in" ? world.roomId : null}
            onLine={openSpeaker}
            muted={muted}
            serverNow={world.serverNow}
            lines={worldLines}
            text={worldLog.text}
            status={
              world.status === "joining"
                ? `Opening ${PLACE_TITLES[world.place].toLowerCase()}…`
                : world.status === "error"
                  ? world.error
                  : null
            }
          />
        )}
        {note && !noteOnTop ? (
          <Text style={styles.note} accessibilityLiveRegion={NOTE_LIVE_REGION}>
            {note}
          </Text>
        ) : null}
        {inviteCard}
        {knockCard}
      </View>
      {/* The animals' card sits in front of the chat log, where it points, rather than being pushed down under it. */}
      {inBackyard && yardView && yardCard && yardCardData && yardCardAt ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="world-yard-card-layer">
          <PlotCard x={yardCardAt.x} y={yardCardAt.y} card={yardCardData} stageWidth={yardCardAt.stageWidth} minTop={insets.top + (coinsBeside ? 66 : 104)} />
        </View>
      ) : null}
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
      {cafeLayer(true)}
      <MahjongLayer
        mahjong={mahjong}
        people={world.people}
        muted={muted}
        serverNow={world.serverNow}
        top={insets.top + TOP_BAR_GAP}
        lobbyTop={logBottom + CARD_GAP}
        safeTop={insets.top}
        bottom={chatTop}
        nameOf={worldName}
        watch={world.place === "cafe" ? mahjongWatch : null}
        onNote={setNote}
        onWatch={setMahjongWatch}
        onStopWatching={() => setMahjongWatch(null)}
        onSitBack={world.sitOn}
        keyboardOpen={keyboard.open}
        chatLog={<ChatLog roomId={world.status === "in" ? world.roomId : null} onLine={openSpeaker} muted={muted} serverNow={world.serverNow} status={null} lines={tableLog.lines} text={tableLog.text} />}
      />
      {keyboard.open && mahjongCovers ? <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} accessibilityRole="button" accessibilityLabel="Hide keyboard" testID="mahjong-keyboard-dismiss" /> : null}
      <Reanimated.View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }, chatLift]} pointerEvents="box-none">
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
            placed={shownHome?.items ?? world.home.items}
            wallpaper={world.home.wallpaper}
            onPlace={placeNew}
            onWallpaper={(id: WallpaperId) => decorate(() => wallpaperM({ wallpaper: id }))}
            onDone={() => {
              if (draft) putDown(draft);
              setDecorating(false);
              setChosenItem(null);
            }}
          />
        ) : null}
        {inBackyard && !keyboard.open ? (
          <>
            <BackyardGuide
              open={guideOpen}
              // Below the chat lines, above the (i) and the chat bar, with the column's gaps.
              room={screen.height - logBottom - GUIDE_GAP - (Math.max(insets.bottom, 12) + CHAT_BAR_HEIGHT + GUIDE_BUTTON + 2 * GUIDE_GAP)}
              onClose={() => setGuideOpen(false)}
            />
            <View style={styles.decorateRow} pointerEvents="box-none">
              <RoundButton
                icon={guideOpen ? "close" : "information-circle-outline"}
                label={guideOpen ? "Close how to farm" : "How to farm"}
                onPress={() => {
                  // How to farm and the emote tray take turns, as Decorate and the tray do.
                  setTray(false);
                  setGuideOpen((was) => !was && !myDuel);
                }}
                testID="world-backyard-guide-open"
              />
            </View>
          </>
        ) : null}
        <ChatBar
          keyboardOpen={keyboard.open}
          tray={tray}
          onTray={(open) => {
            setTray(open);
            if (open) setGuideOpen(false);
          }}
          onEmote={emote}
          say={world.say}
          typing={world.typing}
          onTypingAt={setTypingAt}
          serverNow={world.serverNow}
          onNote={setNote}
          savedDraft={savedDraft}
          keepDraft={keepDraft}
          // Typing puts How to farm away, on web too, where the keyboard isn't reported.
          onFocusChat={() => setGuideOpen(false)}
        />
      </Reanimated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veil, { opacity: fade }]} pointerEvents="none" />
      <WorldMenu open={placesOpen} top={insets.top + TOP_BAR_GAP} entries={menuEntries} onClose={() => setPlacesOpen(false)} />

      {sheets}
      {noteOver}
    </View>
  );
};

const latestYardTime = (animals: readonly { feedings: readonly { at: number }[]; collectedAt?: number }[] | undefined) =>
  (animals ?? []).reduce((latest, a) => Math.max(latest, a.collectedAt ?? 0, ...a.feedings.map((f) => f.at)), 0);

const PAD_SETTLE_MS = 150;
const COINS_BESIDE_FROM = 400;
const TOP_BAR_GAP = 62;
const UNDER_CHAT_SLACK = 10;
const SHOP_CHAT_GAP = 14;
const GUIDE_BUTTON = 44;
const GUIDE_GAP = 10;

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
  titleWrap: { flexShrink: 1 },
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
  decorateRow: { flexDirection: "row", justifyContent: "flex-end" },
  ping: { minWidth: 30, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  pingText: { fontSize: 12, fontWeight: "800", color: hud.forest, fontVariant: ["tabular-nums"] },
  overCafe: { zIndex: 2, elevation: 2 },
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
