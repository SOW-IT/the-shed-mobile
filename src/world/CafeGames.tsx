import Ionicons from "@expo/vector-icons/Ionicons";
import { CAFE_GAME_ORDER, CAFE_GAMES, CAFE_TURN_MS, boxesWon, isCafeGameKind, otherSide, recordScore, roundsWon, type Side } from "@shared/cafeGames";
import { shortName } from "@shared/names";
import { fonts } from "@/theme";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { announce } from "./announce";
import { challengeTitle, gameIcon, gameLabel, rematchWords, resultWords, secondsLeft, shownChallenge, turnWords, type CafeChallengeView } from "./cafe";
import { CafeBoardView } from "./CafeBoards";
import { usePresence } from "./Overlays";
import { cafe as colours, hud } from "./palette";
import { useBatterySaver } from "./settings";
import type { Cafe } from "./useCafe";

const NATIVE = Platform.OS !== "web";
const TICK_MS = 1000;

const useTick = (on: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [on]);
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
        <Text style={styles.gameText} numberOfLines={1}>
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
  const [kept, setKept] = useState(person);
  if (person && person !== kept) setKept(person);
  const { mounted, shown, calm } = usePresence(person !== null);
  if (!mounted || !kept) return null;
  const name = shortName(kept.name);
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
  const title = challengeTitle(challenge);
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

const TurnBar = ({ endsAt, live, now, serverNow, calm }: { endsAt: number; live: boolean; now: number; serverNow: () => number; calm: boolean }) => {
  const [bar] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!live) return;
    const remaining = Math.max(0, endsAt - serverNow());
    bar.setValue(Math.min(1, remaining / CAFE_TURN_MS));
    if (calm) return;
    const run = Animated.timing(bar, { toValue: 0, duration: remaining, easing: Easing.linear, useNativeDriver: NATIVE });
    run.start();
    return () => run.stop();
  }, [endsAt, live, calm, bar, serverNow, now]);
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.left, { transform: [{ scaleX: bar }] }]} />
    </View>
  );
};

const SPARKS = [
  { id: "left", icon: "🎉" },
  { id: "leftMid", icon: "✨" },
  { id: "middle", icon: "🎊" },
  { id: "rightMid", icon: "✨" },
  { id: "right", icon: "🎉" },
];

const Celebration = ({ calm }: { calm: boolean }) => {
  const [rise] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (calm) return;
    const run = Animated.timing(rise, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE });
    run.start();
    return () => run.stop();
  }, [calm, rise]);
  return (
    <View style={styles.sparks} pointerEvents="none" testID="cafe-celebration">
      {SPARKS.map((spark, i) => (
        <Animated.Text
          key={spark.id}
          style={[
            styles.spark,
            calm
              ? null
              : {
                  opacity: rise.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0.85] }),
                  transform: [
                    { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [16, -10 - (i % 2) * 10] }) },
                    { scale: rise.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.25, 1] }) },
                  ],
                },
          ]}
        >
          {spark.icon}
        </Animated.Text>
      ))}
    </View>
  );
};

type GameView = NonNullable<Cafe["game"]>;

const Score = ({ game, me, them }: { game: GameView; me: string; them: string }) => {
  const mine = game.side;
  const theirs = otherSide(mine);
  if (game.kind === "ticTacToe") {
    return (
      <View style={styles.scoreRow} testID="cafe-score">
        <View style={styles.chip}>
          <Text style={styles.chipText}>{`Round ${Math.min(game.board.round, 3)} of 3`}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{`${me} ${roundsWon(game.board.rounds, mine)}  ${them} ${roundsWon(game.board.rounds, theirs)}`}</Text>
        </View>
      </View>
    );
  }
  if (game.kind === "dotsAndBoxes") {
    return (
      <View style={styles.scoreRow} testID="cafe-score">
        <View style={styles.chip}>
          <Text style={styles.chipText}>{`${me} ${boxesWon(game.board.boxes, mine)}  ${them} ${boxesWon(game.board.boxes, theirs)}`}</Text>
        </View>
      </View>
    );
  }
  return null;
};

const Swatch = ({ side }: { side: Side }) => <View style={[styles.swatch, { backgroundColor: side === "a" ? colours.a : colours.b }]} />;

const CafeSheet = ({
  game,
  now,
  serverNow,
  awayFromCafe,
  onMove,
  onGiveUp,
  onRematch,
  onClose,
}: {
  game: GameView;
  now: number;
  serverNow: () => number;
  awayFromCafe: boolean;
  onMove: (move: number) => void;
  onGiveUp: () => void;
  onRematch: () => void;
  onClose: () => void;
}) => {
  const calm = useBatterySaver();
  const { width, height } = useWindowDimensions();
  const [confirming, setConfirming] = useState(false);
  const { mounted, shown } = usePresence(true);
  const ended = game.result !== undefined;
  const live = !ended;
  const myTurn = live && game.board.turn === game.side;
  const them = shortName(game.opponentName);
  const kind = isCafeGameKind(game.kind) ? game.kind : null;
  const sheetWidth = Math.min(440, width - 24);
  const boardSize = Math.min(sheetWidth - 28, height * 0.5);
  const result = game.result ? resultWords(game.result, game.side, them) : null;
  const turn = turnWords(game.board.turn, game.side, them);
  useEffect(() => {
    if (live) announce(turn);
  }, [live, turn]);
  const resultSaid = result ? [result.title, result.detail].filter(Boolean).join(" ") : null;
  useEffect(() => {
    if (resultSaid) announce(resultSaid);
  }, [resultSaid]);
  if (!mounted || !kind) return null;
  const rematch = rematchWords(game.rematch, game.side, them);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: shown }]} pointerEvents="auto" />
      <Animated.View
        style={[styles.sheet, { width: sheetWidth, maxHeight: height - 24 }, calm ? { opacity: shown } : { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}
        testID="cafe-sheet"
        accessibilityViewIsModal
      >
        <ScrollView contentContainerStyle={styles.sheetBody} bounces={false}>
          <View style={styles.head}>
            <Text style={styles.gameIcon}>{CAFE_GAMES[kind].icon}</Text>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
              {CAFE_GAMES[kind].label}
            </Text>
            {ended ? (
              <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" testID="cafe-close-x" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
                <Ionicons name="close" size={18} color={hud.forest} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.players}>
            <View style={styles.player}>
              <Swatch side={game.side} />
              <Text style={styles.playerText}>You</Text>
            </View>
            <Text style={styles.vs}>vs</Text>
            <View style={styles.player}>
              <Swatch side={otherSide(game.side)} />
              <Text style={styles.playerText} numberOfLines={1}>
                {them}
              </Text>
            </View>
          </View>
          <Score game={game} me="You" them={them} />
          {result ? (
            <View style={styles.result} testID="cafe-result">
              {result.won ? <Celebration calm={calm} /> : null}
              <Text style={styles.resultTitle}>{result.title}</Text>
              {result.detail ? <Text style={styles.resultDetail}>{result.detail}</Text> : null}
            </View>
          ) : (
            <View style={styles.turn}>
              <View style={styles.head}>
                <Text style={[styles.turnText, myTurn && styles.myTurn]} testID="cafe-turn">
                  {turn}
                </Text>
                <Text style={styles.count} accessibilityLabel={`${secondsLeft(game.turnEndsAt, now)} seconds left`} testID="cafe-seconds">
                  {secondsLeft(game.turnEndsAt, now)}
                </Text>
              </View>
              <TurnBar endsAt={game.turnEndsAt} live={live} now={now} serverNow={serverNow} calm={calm} />
            </View>
          )}
          {live && (game.away || awayFromCafe) ? (
            <Text style={styles.warn} testID="cafe-away">
              Go back to the Café or you&apos;ll lose.
            </Text>
          ) : null}
          <CafeBoardView kind={kind} board={game.board} side={game.side} canMove={myTurn} onMove={onMove} size={boardSize} />
          {ended ? (
            <View style={styles.answers}>
              {game.result?.why === "abandoned" || game.result?.why === "left" ? null : (
                <Pressable onPress={onRematch} accessibilityRole="button" accessibilityLabel="Rematch" testID="cafe-rematch" style={({ pressed }) => [styles.yes, game.rematch === game.side && styles.waiting, pressed && styles.pressed]}>
                  <Text style={styles.yesText}>Rematch</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" testID="cafe-close" style={({ pressed }) => [styles.no, pressed && styles.pressed]}>
                <Text style={styles.noText}>Close</Text>
              </Pressable>
            </View>
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
          {rematch ? (
            <Text style={styles.note} testID="cafe-rematch-note">
              {rematch}
            </Text>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

export const CafeLayer = ({
  cafe,
  people,
  place,
  serverNow,
  bottom,
  onNote,
}: {
  cafe: Cafe;
  people: readonly { memberId: string; isMe: boolean; seat?: string }[];
  place: string;
  serverNow: () => number;
  bottom: number;
  onNote: (note: string) => void;
}) => {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [closedGame, setClosedGame] = useState<string | null>(null);
  const now = serverNow();
  const challenge = shownChallenge(cafe.challenges, { now, people, dismissed });
  const game = cafe.game && cafe.game.id !== closedGame ? cafe.game : null;
  useTick(challenge !== null || (game !== null && game.result === undefined));
  const hide = (c: CafeChallengeView) => setDismissed((set) => new Set(set).add(`${c.id}:${c.picked}`));
  const say = (problem: string | null) => {
    if (problem) onNote(problem);
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
          onMove={(move) => void cafe.move(game.id, move).then(say)}
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
  count: { color: hud.accent, fontSize: 20, fontWeight: "900", minWidth: 26, textAlign: "right", fontVariant: ["tabular-nums"] },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: hud.primarySoft },
  games: { flexDirection: "row", flexWrap: "wrap", gap: 8, maxWidth: 340 },
  game: { flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: hud.accentSoft },
  gameIcon: { fontSize: 20 },
  gameText: { flexShrink: 1, color: hud.forest, fontWeight: "800", fontSize: 14 },
  picked: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 14, backgroundColor: hud.accentSoft },
  pickedText: { color: hud.forest, fontWeight: "800", fontSize: 15 },
  answers: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
  yes: { flex: 1, backgroundColor: hud.accent, borderRadius: 999, paddingVertical: 10, alignItems: "center", borderWidth: 2, borderColor: hud.forest },
  waiting: { opacity: 0.6 },
  yesText: { color: hud.onAccent, fontWeight: "800", fontSize: 15 },
  no: { flex: 1, backgroundColor: hud.primarySoft, borderRadius: 999, paddingVertical: 10, alignItems: "center" },
  noText: { color: hud.forest, fontWeight: "700", fontSize: 15 },
  quiet: { alignSelf: "center", paddingVertical: 6, paddingHorizontal: 14 },
  quietText: { color: hud.placeholder, fontWeight: "700", fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: hud.primarySoft },
  chipText: { color: hud.forest, fontWeight: "700", fontSize: 13, fontVariant: ["tabular-nums"] },
  sheet: { position: "absolute", alignSelf: "center", bottom: 12, borderRadius: 24, backgroundColor: hud.card, ...ink, ...pop, overflow: "hidden" },
  sheetBody: { padding: 14, gap: 10 },
  players: { flexDirection: "row", alignItems: "center", gap: 10 },
  player: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  playerText: { color: hud.forest, fontWeight: "800", fontSize: 15, flexShrink: 1 },
  vs: { color: hud.placeholder, fontWeight: "700", fontSize: 13 },
  swatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: hud.forest },
  scoreRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  turn: { gap: 6 },
  turnText: { flex: 1, color: hud.primary, fontWeight: "800", fontSize: 16 },
  myTurn: { color: hud.accent },
  track: { height: 6, borderRadius: 3, backgroundColor: hud.primarySoft, overflow: "hidden" },
  left: { width: "100%", height: 6, backgroundColor: hud.accent, transformOrigin: "left" },
  warn: { color: hud.onAccent, backgroundColor: hud.accent, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, fontWeight: "700", fontSize: 13, overflow: "hidden" },
  result: { alignItems: "center", gap: 2, paddingVertical: 4 },
  resultTitle: { fontFamily: fonts.display, fontSize: 26, color: hud.forest },
  resultDetail: { color: hud.primary, fontSize: 14, fontWeight: "600" },
  sparks: { flexDirection: "row", gap: 10, height: 30, alignItems: "flex-end" },
  spark: { fontSize: 22 },
  note: { alignSelf: "center", color: hud.primary, fontSize: 13, fontWeight: "700" },
});
