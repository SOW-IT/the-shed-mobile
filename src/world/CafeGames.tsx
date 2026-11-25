import Ionicons from "@expo/vector-icons/Ionicons";
import { CAFE_GAME_ORDER, CAFE_GAMES, CAFE_TURN_MS, boxesWon, isCafeGameKind, otherSide, recordScore, type Side } from "@shared/cafeGames";
import type { Look } from "@shared/world";
import { fonts } from "@/theme";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Animated, Keyboard, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { announce } from "./announce";
import { challengeTitle, gameIcon, gameLabel, rematchWords, resultWords, secondsLeft, shownChallenge, turnWords, type CafeChallengeView } from "./cafe";
import { CafeBoardView, CafePiece } from "./CafeBoards";
import { Bust, usePresence } from "./Overlays";
import { cafe as colours, glass, hud } from "./palette";
import { useBatterySaver, useWorldName } from "./settings";
import type { Cafe } from "./useCafe";
import { useForeground } from "./useForeground";

const TICK_MS = 1000;

const useClock = (serverNow: () => number, on: boolean) => {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!on) return;
    const tick = () => setNow(serverNow());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [on, serverNow]);
  return now;
};

export const CafeRecord = ({ memberId, testID }: { memberId: Id<"worldMembers">; testID?: string }) => {
  const records = useQuery(api.cafeGames.record, { memberId });
  const shown = (records ?? []).filter((row) => isCafeGameKind(row.kind) && row.wins + row.losses + row.draws > 0);
  if (shown.length === 0) return null;
  return (
    <View style={styles.chips} testID={testID}>
      {CAFE_GAME_ORDER.map((kind) => {
        const row = shown.find((r) => r.kind === kind);
        return row ? (
          <View key={kind} style={styles.chip} accessible accessibilityLabel={`${CAFE_GAMES[kind].label}: ${row.wins} won, ${row.losses} lost, ${row.draws} drawn`}>
            <Text style={styles.chipText}>{`${CAFE_GAMES[kind].label} ${recordScore(row)}`}</Text>
          </View>
        ) : null;
      })}
    </View>
  );
};

const GameButtons = ({ onPick, testPrefix }: { onPick: (kind: string) => void; testPrefix: string }) => (
  <View style={styles.games}>
    {CAFE_GAME_ORDER.map((kind) => (
      <Pressable
        key={kind}
        onPress={() => onPick(kind)}
        accessibilityRole="button"
        accessibilityLabel={CAFE_GAMES[kind].label}
        testID={`${testPrefix}-${kind}`}
        style={({ pressed }) => [styles.game, pressed && styles.pressed]}
      >
        <Text style={styles.gameIcon}>{CAFE_GAMES[kind].icon}</Text>
        <Text style={styles.gameText} numberOfLines={2}>
          {CAFE_GAMES[kind].label}
        </Text>
      </Pressable>
    ))}
  </View>
);

export const CafePicker = ({
  person,
  top,
  onPick,
  onClose,
}: {
  person: { memberId: Id<"worldMembers">; name: string } | null;
  top: number;
  onPick: (to: Id<"worldMembers">, kind: string) => void;
  onClose: () => void;
}) => {
  const { width } = useWindowDimensions();
  const worldName = useWorldName();
  const [kept, setKept] = useState(person);
  if (person && person !== kept) setKept(person);
  const { mounted, shown, calm } = usePresence(person !== null);
  if (!mounted || !kept) return null;
  const name = worldName(kept.name);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={person ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close games" testID="cafe-picker-scrim">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: shown }]} />
      </Pressable>
      <Animated.View
        style={[styles.card, styles.picker, { top, width: Math.min(360, width - 32) }, calm ? { opacity: shown } : { opacity: shown, transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}
        testID="cafe-picker"
        accessibilityViewIsModal
      >
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{`Play ${name}`}</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" testID="cafe-picker-close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={hud.forest} />
          </Pressable>
        </View>
        <CafeRecord memberId={kept.memberId} testID="cafe-picker-record" />
        <GameButtons testPrefix="cafe-pick" onPick={(kind) => onPick(kept.memberId, kind)} />
      </Animated.View>
    </View>
  );
};

const ChallengeCard = ({
  challenge,
  now,
  onPick,
  onAnswer,
}: {
  challenge: CafeChallengeView;
  now: number;
  onPick: (kind: string) => void;
  onAnswer: (accept: boolean) => void;
}) => {
  const { mounted, shown, calm } = usePresence(true);
  const worldName = useWorldName();
  const title = challengeTitle({ ...challenge, otherName: worldName(challenge.otherName) });
  useEffect(() => {
    announce(challenge.picked === "them" ? `${title}: ${gameLabel(challenge.kind)}` : title);
  }, [title, challenge.picked, challenge.kind]);
  if (!mounted) return null;
  return (
    <Animated.View
      style={[styles.card, calm ? { opacity: shown } : { opacity: shown, transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}
      testID={`cafe-challenge-${challenge.picked}`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.count} accessibilityLabel={`${secondsLeft(challenge.expiresAt, now)} seconds left`}>
          {secondsLeft(challenge.expiresAt, now)}
        </Text>
      </View>
      {challenge.picked === "nobody" ? (
        <GameButtons testPrefix="cafe-prompt" onPick={onPick} />
      ) : (
        <View style={styles.picked}>
          <Text style={styles.gameIcon}>{gameIcon(challenge.kind)}</Text>
          <Text style={styles.pickedText}>{gameLabel(challenge.kind)}</Text>
        </View>
      )}
      <View style={styles.answers}>
        {challenge.picked === "them" ? (
          <Pressable onPress={() => onAnswer(true)} accessibilityRole="button" accessibilityLabel={`Play ${gameLabel(challenge.kind)}`} testID="cafe-accept" style={({ pressed }) => [styles.yes, pressed && styles.pressed]}>
            <Text style={styles.yesText}>Play</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onAnswer(false)}
          accessibilityRole="button"
          accessibilityLabel={challenge.picked === "me" ? "Cancel" : "Not now"}
          testID="cafe-decline"
          style={({ pressed }) => [styles.no, pressed && styles.pressed]}
        >
          <Text style={styles.noText}>{challenge.picked === "me" ? "Cancel" : "Not now"}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};

const TURN_SECONDS = CAFE_TURN_MS / 1000;
const shownSeconds = (endsAt: number, now: number) => Math.min(TURN_SECONDS, secondsLeft(endsAt, now));

const TurnBar = ({ endsAt, live, mineActive, now, serverNow, calm }: { endsAt: number; live: boolean; mineActive: boolean; now: number; serverNow: () => number; calm: boolean }) => {
  const left = useSharedValue(1);
  const foreground = useForeground();
  useEffect(() => {
    if (!live || calm) return;
    const remaining = Math.max(0, endsAt - serverNow());
    left.set(Math.min(1, remaining / CAFE_TURN_MS));
    left.set(withTiming(0, { duration: remaining, easing: Easing.linear }));
  }, [endsAt, live, calm, foreground, left, serverNow]);
  const style = useAnimatedStyle(() => ({ width: `${left.get() * 100}%` }));
  const still = Math.max(0, Math.min(1, (endsAt - now) / CAFE_TURN_MS));
  const fill = { backgroundColor: mineActive ? colours.aRing : colours.bRing, alignSelf: mineActive ? ("flex-start" as const) : ("flex-end" as const) };
  return (
    <View style={styles.track} testID="cafe-timer">
      {!live ? null : calm ? <View style={[styles.fill, fill, { width: `${still * 100}%` }]} /> : <Reanimated.View style={[styles.fill, fill, style]} />}
    </View>
  );
};

const SPARKS = [
  { id: "left", icon: "🎉", x: -70 },
  { id: "leftMid", icon: "✨", x: -36 },
  { id: "middle", icon: "🏆", x: 0 },
  { id: "rightMid", icon: "✨", x: 36 },
  { id: "right", icon: "🎉", x: 70 },
];

const Spark = ({ icon, x, order, calm }: { icon: string; x: number; order: number; calm: boolean }) => {
  const rise = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (!calm) rise.set(withDelay(order * 70, withSpring(1, { damping: 8, stiffness: 160 })));
  }, [calm, order, rise]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, rise.get()), transform: [{ translateX: x * rise.get() }, { translateY: -6 * rise.get() }, { scale: 0.3 + 0.7 * rise.get() }] }));
  return <Reanimated.Text style={[styles.spark, style]}>{icon}</Reanimated.Text>;
};

const Celebration = ({ calm }: { calm: boolean }) => (
  <View style={styles.sparks} pointerEvents="none" testID="cafe-celebration">
    {SPARKS.map((spark, i) => (
      <Spark key={spark.id} icon={spark.icon} x={spark.x} order={i} calm={calm} />
    ))}
  </View>
);

type GameView = NonNullable<Cafe["game"]>;

const Avatar = ({ look, name, side }: { look: Look | null; name: string; side: Side }) => (
  <View style={[styles.avatar, { borderColor: side === "a" ? colours.aRing : colours.bRing }]}>
    {look ? <Bust look={look} size={40} /> : <Text style={styles.initial}>{Array.from(name)[0] ?? "?"}</Text>}
  </View>
);

const Plate = ({
  name,
  look,
  side,
  boxes,
  align,
  active,
  calm,
  testID,
}: {
  name: string;
  look: Look | null;
  side: Side;
  boxes: number | null;
  align: "start" | "end";
  active: boolean;
  calm: boolean;
  testID: string;
}) => {
  const lit = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    lit.set(calm ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: 220 }));
  }, [active, calm, lit]);
  const glow = useAnimatedStyle(() => ({ opacity: lit.get() }));
  const end = align === "end";
  return (
    <View style={[styles.plate, end && styles.plateEnd]} testID={testID} accessibilityState={{ selected: active }}>
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.plateLit, glow]} />
      <Avatar look={look} name={name} side={side} />
      <View style={[styles.plateText, end && styles.plateTextEnd]}>
        <Text style={[styles.plateName, end && styles.alignEnd]} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>
        <View style={[styles.plateSub, end && styles.plateSubEnd]}>
          <CafePiece mark={side === "a" ? 1 : 2} size={14} />
          {boxes !== null ? <Text style={styles.plateCount}>{`${boxes} ${boxes === 1 ? "box" : "boxes"}`}</Text> : null}
        </View>
      </View>
    </View>
  );
};

const EndCard = ({ children, calm }: { children: React.ReactNode; calm: boolean }) => {
  const shown = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (!calm) shown.set(withSpring(1, { damping: 14, stiffness: 180 }));
  }, [calm, shown]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.get() * 1.4), transform: [{ translateY: (1 - shown.get()) * 24 }, { scale: 0.92 + 0.08 * shown.get() }] }));
  return <Reanimated.View style={[styles.endCard, style]}>{children}</Reanimated.View>;
};

const CafeSheet = ({
  game,
  now,
  serverNow,
  awayFromCafe,
  safe,
  looks,
  busy,
  onMove,
  onGiveUp,
  onRematch,
  onClose,
}: {
  game: GameView;
  now: number;
  serverNow: () => number;
  awayFromCafe: boolean;
  safe: { top: number; bottom: number };
  looks: { mine: Look | null; theirs: Look | null };
  busy: boolean;
  onMove: (move: number) => void;
  onGiveUp: () => void;
  onRematch: () => void;
  onClose: () => void;
}) => {
  const calm = useBatterySaver();
  const worldName = useWorldName();
  const { width, height } = useWindowDimensions();
  const [confirming, setConfirming] = useState(false);
  const { mounted, shown } = usePresence(true);
  const ended = game.result !== undefined;
  const live = !ended;
  const mine = game.side;
  const theirs = otherSide(mine);
  const myTurn = live && game.board.turn === mine;
  const them = worldName(game.opponentName);
  const kind = isCafeGameKind(game.kind) ? game.kind : null;
  const sheetWidth = Math.min(440, width - 24);
  const room = height - safe.top - Math.max(safe.bottom, 12) - 12;
  const boardSize = Math.min(sheetWidth - 28, room - 300);
  const result = game.result ? resultWords(game.result, mine, them) : null;
  const turn = turnWords(game.board.turn, mine, them);
  const dots = kind === "dotsAndBoxes";
  useEffect(() => {
    Keyboard.dismiss();
  }, []);
  useEffect(() => {
    if (live) announce(turn);
  }, [live, turn]);
  const resultSaid = result ? [result.title, result.detail].filter(Boolean).join(" ") : null;
  useEffect(() => {
    if (resultSaid) announce(resultSaid);
  }, [resultSaid]);
  if (!mounted || !kind) return null;
  const rematch = rematchWords(game.rematch, mine, them);
  const seconds = shownSeconds(game.turnEndsAt, now);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: shown }]} pointerEvents="auto" />
      <Animated.View
        style={[
          styles.sheet,
          { width: sheetWidth, bottom: Math.max(safe.bottom, 12), maxHeight: room },
          calm ? { opacity: shown } : { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] },
        ]}
        testID="cafe-sheet"
        accessibilityViewIsModal
      >
        <ScrollView contentContainerStyle={styles.sheetBody} bounces={false} keyboardShouldPersistTaps="handled">
          <View style={styles.board}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow} accessibilityRole="header" numberOfLines={1}>
                {`${CAFE_GAMES[kind].icon}  ${CAFE_GAMES[kind].label}`}
              </Text>
              {ended ? (
                <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" testID="cafe-close-x" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
                  <Ionicons name="close" size={16} color={glass.text} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.players}>
              <Plate name="You" look={looks.mine} side={mine} boxes={dots ? boxesWon(game.board.boxes, mine) : null} align="start" active={myTurn} calm={calm} testID="cafe-plate-me" />
              <Text style={styles.vs}>vs</Text>
              <Plate
                name={them}
                look={looks.theirs}
                side={theirs}
                boxes={dots ? boxesWon(game.board.boxes, theirs) : null}
                align="end"
                active={live && !myTurn}
                calm={calm}
                testID="cafe-plate-them"
              />
            </View>
            <TurnBar endsAt={game.turnEndsAt} live={live} mineActive={myTurn} now={now} serverNow={serverNow} calm={calm} />
          </View>
          {live ? (
            <View style={styles.status}>
              <Text style={[styles.turnText, myTurn && styles.myTurn]} numberOfLines={1} testID="cafe-turn">
                {turn}
              </Text>
              <Text style={styles.count} accessibilityLabel={`${seconds} seconds left`} testID="cafe-seconds">
                {seconds}
              </Text>
            </View>
          ) : null}
          {live && (game.away || awayFromCafe) ? (
            <Text style={styles.warn} testID="cafe-away">
              Go back to the Café or you&apos;ll lose.
            </Text>
          ) : null}
          <CafeBoardView kind={kind} board={game.board} side={mine} canMove={myTurn && !busy} onMove={onMove} size={boardSize} calm={calm} />
          {result ? (
            <EndCard calm={calm}>
              <View style={styles.result} testID="cafe-result">
                {result.won ? <Celebration calm={calm} /> : null}
                <Text style={styles.resultTitle}>{result.title}</Text>
                {result.detail ? <Text style={styles.resultDetail}>{result.detail}</Text> : null}
              </View>
              <View style={styles.answers}>
                {game.result?.why === "abandoned" || game.result?.why === "left" ? null : (
                  <Pressable
                    onPress={onRematch}
                    disabled={game.rematch === mine}
                    accessibilityRole="button"
                    accessibilityLabel="Rematch"
                    testID="cafe-rematch"
                    style={({ pressed }) => [styles.yes, game.rematch === mine && styles.waiting, pressed && styles.pressed]}
                  >
                    <Text style={styles.yesText}>Rematch</Text>
                  </Pressable>
                )}
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" testID="cafe-close" style={({ pressed }) => [styles.no, pressed && styles.pressed]}>
                  <Text style={styles.noText}>Close</Text>
                </Pressable>
              </View>
              {rematch ? (
                <Text style={styles.note} testID="cafe-rematch-note">
                  {rematch}
                </Text>
              ) : null}
            </EndCard>
          ) : confirming ? (
            <View style={styles.answers}>
              <Pressable onPress={onGiveUp} accessibilityRole="button" accessibilityLabel="Yes, give up" testID="cafe-give-up-yes" style={({ pressed }) => [styles.yes, pressed && styles.pressed]}>
                <Text style={styles.yesText}>Give up</Text>
              </Pressable>
              <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Keep playing" testID="cafe-give-up-no" style={({ pressed }) => [styles.no, pressed && styles.pressed]}>
                <Text style={styles.noText}>Keep playing</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel="Give up" testID="cafe-give-up" style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}>
              <Text style={styles.quietText}>Give up</Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

type Seated = { memberId: string; isMe: boolean; seat?: string; look: Look };

export const CafeLayer = ({
  cafe,
  people,
  place,
  serverNow,
  bottom,
  safe,
  onNote,
}: {
  cafe: Cafe;
  people: readonly Seated[];
  place: string;
  serverNow: () => number;
  bottom: number;
  safe: { top: number; bottom: number };
  onNote: (note: string) => void;
}) => {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [closedGame, setClosedGame] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const game = cafe.game && cafe.game.id !== closedGame ? cafe.game : null;
  const now = useClock(serverNow, cafe.challenges.length > 0 || (game !== null && game.result === undefined));
  const challenge = shownChallenge(cafe.challenges, { now, people, dismissed });
  const hide = (c: CafeChallengeView) => setDismissed((set) => new Set(set).add(`${c.id}:${c.picked}`));
  const say = (problem: string | null) => {
    if (problem) onNote(problem);
  };
  const move = (gameId: Id<"cafeGames">, index: number) => {
    if (busy) return;
    setBusy(true);
    void cafe
      .move(gameId, index)
      .then(say)
      .finally(() => setBusy(false));
  };
  const looks = {
    mine: people.find((p) => p.isMe)?.look ?? null,
    theirs: (game?.opponent && people.find((p) => p.memberId === game.opponent)?.look) || null,
  };
  return (
    <>
      {challenge && !game ? (
        <View style={[styles.cardRow, { bottom }]} pointerEvents="box-none">
          <ChallengeCard
            key={`${challenge.id}:${challenge.picked}`}
            challenge={challenge}
            now={now}
            onPick={(kind) => void cafe.pick(challenge.id as Id<"cafeChallenges">, kind).then(say)}
            onAnswer={(accept) => {
              if (!accept) hide(challenge);
              void cafe.respond(challenge.id as Id<"cafeChallenges">, accept).then(say);
            }}
          />
        </View>
      ) : null}
      {game ? (
        <CafeSheet
          key={game.id}
          game={game}
          now={now}
          serverNow={serverNow}
          awayFromCafe={place !== "cafe"}
          safe={safe}
          looks={looks}
          busy={busy}
          onMove={(index) => move(game.id, index)}
          onGiveUp={() => void cafe.giveUp(game.id).then(say)}
          onRematch={() => void cafe.rematch(game.id).then(say)}
          onClose={() => setClosedGame(game.id)}
        />
      ) : null}
    </>
  );
};

const ink = { borderWidth: 2.5, borderColor: hud.forest };
const pop = { shadowColor: hud.forest, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0 };

const styles = StyleSheet.create({
  scrim: { backgroundColor: hud.scrim },
  pressed: { opacity: 0.75 },
  card: { gap: 8, padding: 10, borderRadius: 20, backgroundColor: hud.card, ...ink, ...pop },
  cardRow: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  picker: { position: "absolute", alignSelf: "center", padding: 14, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: hud.forest, fontFamily: fonts.display, fontSize: 17 },
  count: { color: hud.accent, fontSize: 20, fontWeight: "900", minWidth: 30, textAlign: "right", fontVariant: ["tabular-nums"] },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  games: { flexDirection: "row", flexWrap: "wrap", gap: 8, maxWidth: 340 },
  game: { flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: hud.accentSoft },
  gameIcon: { fontSize: 20 },
  gameText: { flexShrink: 1, color: hud.forest, fontWeight: "800", fontSize: 14 },
  picked: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 14, backgroundColor: hud.accentSoft },
  pickedText: { color: hud.forest, fontWeight: "800", fontSize: 15 },
  answers: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
  yes: { flex: 1, backgroundColor: hud.accent, borderRadius: 999, paddingVertical: 11, alignItems: "center", borderWidth: 2, borderColor: hud.forest },
  waiting: { opacity: 0.55 },
  yesText: { color: hud.onAccent, fontWeight: "800", fontSize: 15 },
  no: { flex: 1, backgroundColor: hud.primarySoft, borderRadius: 999, paddingVertical: 11, alignItems: "center", borderWidth: 2, borderColor: "transparent" },
  noText: { color: hud.forest, fontWeight: "700", fontSize: 15 },
  quiet: { alignSelf: "center", paddingVertical: 6, paddingHorizontal: 14 },
  quietText: { color: hud.placeholder, fontWeight: "700", fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: hud.primarySoft },
  chipText: { color: hud.forest, fontWeight: "700", fontSize: 13, fontVariant: ["tabular-nums"] },
  sheet: { position: "absolute", alignSelf: "center", borderRadius: 26, backgroundColor: hud.card, ...ink, ...pop, overflow: "hidden" },
  sheetBody: { padding: 12, gap: 10 },
  board: { backgroundColor: glass.panel, borderRadius: 18, paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 28 },
  eyebrow: { color: glass.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  players: { flexDirection: "row", alignItems: "center", gap: 6 },
  vs: { width: 30, textAlign: "center", color: glass.muted, fontFamily: fonts.display, fontSize: 15 },
  plate: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, padding: 6, borderRadius: 16 },
  plateEnd: { flexDirection: "row-reverse" },
  plateLit: { borderRadius: 16, backgroundColor: glass.here, borderWidth: 1.5, borderColor: glass.edge },
  plateText: { flex: 1, minWidth: 0, gap: 3 },
  plateTextEnd: { alignItems: "flex-end" },
  plateName: { color: glass.text, fontFamily: fonts.display, fontSize: 16 },
  alignEnd: { textAlign: "right" },
  plateSub: { flexDirection: "row", alignItems: "center", gap: 6, height: 16 },
  plateSubEnd: { flexDirection: "row-reverse" },
  plateCount: { color: glass.muted, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: hud.cream },
  initial: { color: hud.forest, fontFamily: fonts.display, fontSize: 18 },
  status: { flexDirection: "row", alignItems: "center", height: 28, paddingHorizontal: 4 },
  turnText: { flex: 1, color: hud.primary, fontWeight: "800", fontSize: 16 },
  myTurn: { color: hud.accent },
  track: { height: 5, borderRadius: 3, backgroundColor: glass.row, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
  warn: { color: hud.onAccent, backgroundColor: hud.accent, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, fontWeight: "700", fontSize: 13, overflow: "hidden" },
  endCard: { gap: 10, padding: 12, borderRadius: 18, backgroundColor: hud.cream, borderWidth: 2, borderColor: hud.chipRing },
  result: { alignItems: "center", gap: 2 },
  resultTitle: { fontFamily: fonts.display, fontSize: 26, color: hud.forest },
  resultDetail: { color: hud.primary, fontSize: 14, fontWeight: "600" },
  sparks: { height: 30, width: 200, alignItems: "center", justifyContent: "flex-end" },
  spark: { position: "absolute", bottom: 0, fontSize: 22 },
  note: { alignSelf: "center", color: hud.primary, fontSize: 13, fontWeight: "700" },
});
