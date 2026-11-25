import Ionicons from "@expo/vector-icons/Ionicons";
import { CAFE_CHALLENGE_MS, CAFE_GAME_ORDER, CAFE_GAMES, CAFE_TURN_MS, boxesWon, isCafeGameKind, otherSide, recordScore, type CafeGameKind, type Side } from "@shared/cafeGames";
import type { Look } from "@shared/world";
import { fonts } from "@/theme";
import { useQuery } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Keyboard, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { announce } from "./announce";
import { challengeTitle, gameLabel, rematchWords, resultWords, secondsLeft, shownChallenge, turnWords, type CafeChallengeView } from "./cafe";
import { CafeBoardView, CafePiece } from "./CafeBoards";
import { useCafeTheme } from "./cafeTheme";
import { Bust, usePresence } from "./Overlays";
import type { CafeTheme } from "./palette";
import { useBatterySaver, useWorldName } from "./settings";
import type { Cafe } from "./useCafe";
import { useForeground } from "./useForeground";

const TICK_MS = 1000;
const TURN_SECONDS = CAFE_TURN_MS / 1000;
const CHALLENGE_SECONDS = CAFE_CHALLENGE_MS / 1000;

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

const Dot = ({ colour, size }: { colour: string; size: number }) => <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour }} />;

const GLYPH_PIECES: readonly { id: string; side: Side }[] = [
  { id: "tl", side: "a" },
  { id: "tr", side: "b" },
  { id: "bl", side: "b" },
  { id: "br", side: "a" },
];

const GameGlyph = ({ kind, size = 22 }: { kind: CafeGameKind; size?: number }) => {
  const c = useCafeTheme();
  const unit = size / 2;
  if (kind === "fourInARow" || kind === "fiveInARow") {
    const order = GLYPH_PIECES;
    return (
      <View style={[styles.glyph, { width: size, height: size }, kind === "fiveInARow" && { backgroundColor: c.fiveWoodTop, borderRadius: 4 }]}>
        {order.map(({ id, side }) => (
          <View key={id} style={[styles.centre, { width: unit, height: unit }]}>
            <Dot colour={c[side].fill} size={unit - 3} />
          </View>
        ))}
      </View>
    );
  }
  if (kind === "ticTacToe") {
    return (
      <View style={[styles.glyph, { width: size, height: size, backgroundColor: c.tttBoard, borderRadius: 4 }]}>
        <View style={[styles.centre, { width: unit, height: unit }]}>
          <Text style={[styles.glyphX, { color: c.a.fill }]}>✕</Text>
        </View>
        <View style={{ width: unit, height: unit }} />
        <View style={{ width: unit, height: unit }} />
        <View style={[styles.centre, { width: unit, height: unit }]}>
          <View style={{ width: unit - 3, height: unit - 3, borderRadius: unit, borderWidth: 2, borderColor: c.b.fill }} />
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.glyphBox, { width: size, height: size, borderColor: c.a.fill }]}>
      <View style={[styles.glyphFill, { backgroundColor: c.a.box }]} />
      {[0, 1, 2, 3].map((corner) => (
        <View key={corner} style={[styles.glyphPeg, { backgroundColor: c.peg, left: corner % 2 ? size - 6 : -2, top: corner > 1 ? size - 6 : -2 }]} />
      ))}
    </View>
  );
};

export const CafeRecord = ({ memberId, testID, tone = "app" }: { memberId: Id<"worldMembers">; testID?: string; tone?: "app" | "cafe" }) => {
  const c = useCafeTheme();
  const records = useQuery(api.cafeGames.record, { memberId });
  const shown = (records ?? []).filter((row) => isCafeGameKind(row.kind) && row.wins + row.losses + row.draws > 0);
  if (shown.length === 0) return null;
  return (
    <View style={styles.chips} testID={testID}>
      {CAFE_GAME_ORDER.map((kind) => {
        const row = shown.find((r) => r.kind === kind);
        return row ? (
          <View
            key={kind}
            style={[styles.chip, { backgroundColor: tone === "cafe" ? c.tile : c.scoreBg, borderColor: tone === "cafe" ? c.tileEdge : "transparent" }]}
            accessible
            accessibilityLabel={`${CAFE_GAMES[kind].label}: ${row.wins} won, ${row.losses} lost, ${row.draws} drawn`}
          >
            <GameGlyph kind={kind} size={14} />
            <Text style={[styles.chipText, { color: c.text }]}>{`${CAFE_GAMES[kind].label} ${recordScore(row)}`}</Text>
          </View>
        ) : null;
      })}
    </View>
  );
};

const GameTiles = ({ onPick, testPrefix }: { onPick: (kind: string) => void; testPrefix: string }) => {
  const c = useCafeTheme();
  return (
    <View style={styles.tiles}>
      {CAFE_GAME_ORDER.map((kind) => (
        <Pressable
          key={kind}
          onPress={() => onPick(kind)}
          accessibilityRole="button"
          accessibilityLabel={CAFE_GAMES[kind].label}
          testID={`${testPrefix}-${kind}`}
          style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? c.tilePressed : c.tile, borderColor: c.tileEdge }]}
        >
          <GameGlyph kind={kind} />
          <Text style={[styles.tileText, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {CAFE_GAMES[kind].label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

const Face = ({ look, name, size, edge }: { look: Look | null; name: string; size: number; edge: string }) => {
  const c = useCafeTheme();
  return (
    <View style={[styles.face, { width: size + 4, height: size + 4, borderRadius: size, borderColor: edge, backgroundColor: c.avatarBg }]}>
      {look ? <Bust look={look} size={size} /> : <Text style={[styles.initial, { color: c.text }]}>{Array.from(name)[0] ?? "?"}</Text>}
    </View>
  );
};

const card = (c: CafeTheme) => ({ backgroundColor: c.sheet, borderColor: c.sheetEdge, shadowColor: c.shadow });

export const CafePicker = ({
  person,
  look,
  top,
  onPick,
  onClose,
}: {
  person: { memberId: Id<"worldMembers">; name: string } | null;
  look: Look | null;
  top: number;
  onPick: (to: Id<"worldMembers">, kind: string) => void;
  onClose: () => void;
}) => {
  const c = useCafeTheme();
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
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: shown }]} />
      </Pressable>
      <Animated.View
        style={[
          styles.card,
          card(c),
          styles.picker,
          { top, width: Math.min(400, width - 28) },
          calm ? { opacity: shown } : { opacity: shown, transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] },
        ]}
        testID="cafe-picker"
        accessibilityViewIsModal
      >
        <View style={styles.cardHead}>
          <Face look={look} name={name} size={34} edge={c.avatarEdge} />
          <Text style={[styles.cardTitle, { color: c.text }]} accessibilityRole="header" numberOfLines={1}>{`Play ${name}`}</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" testID="cafe-picker-close" style={({ pressed }) => [styles.closeRound, { backgroundColor: c.close }, pressed && styles.pressed]}>
            <Ionicons name="close" size={16} color={c.text} />
          </Pressable>
        </View>
        <CafeRecord memberId={kept.memberId} testID="cafe-picker-record" tone="cafe" />
        <GameTiles testPrefix="cafe-pick" onPick={(kind) => onPick(kept.memberId, kind)} />
      </Animated.View>
    </View>
  );
};

const SecPill = ({ seconds }: { seconds: number }) => {
  const c = useCafeTheme();
  return (
    <View style={[styles.secPill, { backgroundColor: c.secPill }]} accessible accessibilityLabel={`${seconds} seconds left`}>
      <Text style={[styles.secPillText, { color: c.secPillText }]}>{`${seconds}s`}</Text>
    </View>
  );
};

const ChallengeCard = ({
  challenge,
  look,
  now,
  onPick,
  onAnswer,
}: {
  challenge: CafeChallengeView;
  look: Look | null;
  now: number;
  onPick: (kind: string) => void;
  onAnswer: (accept: boolean) => void;
}) => {
  const c = useCafeTheme();
  const { mounted, shown, calm } = usePresence(true);
  const { width } = useWindowDimensions();
  const worldName = useWorldName();
  const name = worldName(challenge.otherName);
  const title = challengeTitle({ ...challenge, otherName: name });
  const left = Math.min(CHALLENGE_SECONDS, secondsLeft(challenge.expiresAt, now));
  const kind = isCafeGameKind(challenge.kind) ? challenge.kind : null;
  useEffect(() => {
    announce(challenge.picked === "them" ? `${title}: ${gameLabel(challenge.kind)}` : title);
  }, [title, challenge.picked, challenge.kind]);
  if (!mounted) return null;
  return (
    <Animated.View
      style={[
        styles.card,
        card(c),
        styles.challenge,
        { width: Math.min(400, width - 28) },
        calm ? { opacity: shown } : { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
      ]}
      testID={`cafe-challenge-${challenge.picked}`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.cardHead}>
        <Face look={look} name={name} size={34} edge={c.avatarEdge} />
        <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        <SecPill seconds={left} />
      </View>
      {challenge.picked === "nobody" ? (
        <GameTiles testPrefix="cafe-prompt" onPick={onPick} />
      ) : kind ? (
        <View style={[styles.tile, styles.tileWide, { backgroundColor: c.tile, borderColor: c.tileEdge }]}>
          <GameGlyph kind={kind} />
          <Text style={[styles.tileText, { color: c.text }]}>{CAFE_GAMES[kind].label}</Text>
        </View>
      ) : null}
      <View style={styles.answers}>
        {challenge.picked === "them" ? (
          <Pressable
            onPress={() => onAnswer(true)}
            accessibilityRole="button"
            accessibilityLabel={`Play ${gameLabel(challenge.kind)}`}
            testID="cafe-accept"
            style={({ pressed }) => [styles.button, styles.primary, { backgroundColor: c.primary, shadowColor: c.primary }, pressed && styles.pressed]}
          >
            <Text style={[styles.buttonText, { color: c.onPrimary }]}>Play</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onAnswer(false)}
          accessibilityRole="button"
          accessibilityLabel={challenge.picked === "me" ? "Cancel" : "Decline"}
          testID="cafe-decline"
          style={({ pressed }) => [styles.button, styles.decline, { backgroundColor: c.decline }, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, styles.declineText, { color: c.declineText }]}>{challenge.picked === "me" ? "Cancel" : "Decline"}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};

const TurnBar = ({ endsAt, side, now, serverNow, calm }: { endsAt: number; side: Side; now: number; serverNow: () => number; calm: boolean }) => {
  const c = useCafeTheme();
  const left = useSharedValue(1);
  const foreground = useForeground();
  useEffect(() => {
    if (calm) return;
    const remaining = Math.max(0, endsAt - serverNow());
    left.set(Math.min(1, remaining / CAFE_TURN_MS));
    left.set(withTiming(0, { duration: remaining, easing: Easing.linear }));
  }, [endsAt, calm, foreground, left, serverNow]);
  const style = useAnimatedStyle(() => ({ width: `${left.get() * 100}%` }));
  const still = Math.max(0, Math.min(1, (endsAt - now) / CAFE_TURN_MS));
  const fill = { backgroundColor: c[side].fill };
  return (
    <View style={[styles.track, { backgroundColor: c.track }]} testID="cafe-timer">
      {calm ? <View style={[styles.fill, fill, { width: `${still * 100}%` }]} /> : <Reanimated.View style={[styles.fill, fill, style]} />}
    </View>
  );
};

type GameView = NonNullable<Cafe["game"]>;

const Player = ({
  name,
  look,
  side,
  boxes,
  end,
  active,
  winner,
  calm,
  testID,
}: {
  name: string;
  look: Look | null;
  side: Side;
  boxes: number | null;
  end: boolean;
  active: boolean;
  winner: boolean;
  calm: boolean;
  testID: string;
}) => {
  const c = useCafeTheme();
  const bright = active || winner;
  const lit = useSharedValue(bright ? 1 : 0);
  useEffect(() => {
    const to = bright ? 1 : 0;
    lit.set(calm ? to : withTiming(to, { duration: 200 }));
  }, [bright, calm, lit]);
  const fade = useAnimatedStyle(() => ({ opacity: 0.56 + 0.44 * lit.get() }));
  const tint = useAnimatedStyle(() => ({ opacity: lit.get() }));
  const score = boxes !== null ? (
    <View style={[styles.scorePill, { backgroundColor: c.scoreBg }]}>
      <Text style={[styles.scoreText, { color: c.text }]}>{boxes}</Text>
    </View>
  ) : null;
  return (
    <Reanimated.View style={[styles.player, end && styles.playerEnd, fade]} testID={testID} accessibilityState={{ selected: active }}>
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.playerTint, { backgroundColor: c.activeBg, borderColor: c.activeEdge }, active ? tint : styles.none]} />
      <Face look={look} name={name} size={36} edge={winner ? c.win : c.avatarEdge} />
      <View style={[styles.playerText, end && styles.playerTextEnd]}>
        <Text style={[styles.playerName, { color: c.text }, end && styles.alignEnd]} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>
        <View style={[styles.tokenRow, end && styles.rowEnd]}>
          <CafePiece side={side} size={13} />
          {score}
        </View>
      </View>
    </Reanimated.View>
  );
};

const EndCard = ({ children, calm, win }: { children: ReactNode; calm: boolean; win: boolean }) => {
  const c = useCafeTheme();
  const shown = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (!calm) shown.set(withDelay(180, withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) })));
  }, [calm, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * 16 }, { scale: 0.96 + 0.04 * shown.get() }] }));
  return (
    <Reanimated.View style={[styles.endCard, { backgroundColor: win ? c.endWin : c.endCard, borderColor: win ? c.endWinEdge : c.endEdge }, style]}>
      {children}
    </Reanimated.View>
  );
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
  const c = useCafeTheme();
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
  const sheetWidth = Math.min(400, width - 28);
  const room = height - safe.top - Math.max(safe.bottom, 16) - 12;
  const boardSize = Math.max(240, Math.min(sheetWidth - 32, room - 300));
  const result = game.result ? resultWords(game.result, mine, them) : null;
  const turn = turnWords(game.board.turn, mine, them);
  const dots = kind === "dotsAndBoxes";
  const myBoxes = boxesWon(game.board.boxes, mine);
  const theirBoxes = boxesWon(game.board.boxes, theirs);
  const winner = game.result && game.result.winner !== "draw" ? game.result.winner : null;
  useEffect(() => {
    Keyboard.dismiss();
  }, []);
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);
  useEffect(() => {
    if (live) announce(turn);
  }, [live, turn]);
  const resultSaid = result ? [result.title, result.detail].filter(Boolean).join(" ") : null;
  useEffect(() => {
    if (resultSaid) announce(resultSaid);
  }, [resultSaid]);
  if (!mounted || !kind) return null;
  const rematch = rematchWords(game.rematch, mine, them);
  const seconds = Math.min(TURN_SECONDS, secondsLeft(game.turnEndsAt, now));
  const turnColour = c[game.board.turn].turn;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: shown }]} pointerEvents="auto" />
      <Animated.View
        style={[
          styles.card,
          card(c),
          styles.sheet,
          { width: sheetWidth, bottom: Math.max(safe.bottom, 16), maxHeight: room },
          calm ? { opacity: shown } : { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }] },
        ]}
        testID="cafe-sheet"
        accessibilityViewIsModal
      >
        <ScrollView contentContainerStyle={styles.sheetBody} bounces={false} keyboardShouldPersistTaps="handled">
          <View style={[styles.handle, { backgroundColor: c.handle }]} />
          <View style={styles.sheetHead}>
            <GameGlyph kind={kind} />
            <Text style={[styles.sheetTitle, { color: c.text }]} accessibilityRole="header" numberOfLines={1}>
              {CAFE_GAMES[kind].label}
            </Text>
            {ended ? (
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" testID="cafe-close-x" style={({ pressed }) => [styles.closeRound, { backgroundColor: c.close }, pressed && styles.pressed]}>
                <Ionicons name="close" size={16} color={c.text} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => (confirming ? onGiveUp() : setConfirming(true))}
                accessibilityRole="button"
                accessibilityLabel={confirming ? "Tap again to give up" : "Give up"}
                testID={confirming ? "cafe-give-up-yes" : "cafe-give-up"}
                style={({ pressed }) => [styles.giveUp, { backgroundColor: confirming ? c.primary : c.pill }, pressed && styles.pressed]}
              >
                <Text style={[styles.giveUpText, { color: confirming ? c.onPrimary : c.pillText }]}>{confirming ? "Give up?" : "Give up"}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.versus}>
            <Player name="You" look={looks.mine} side={mine} boxes={dots ? myBoxes : null} end={false} active={myTurn} winner={winner === mine} calm={calm} testID="cafe-plate-me" />
            <Text style={[styles.vs, { color: c.faint }]}>vs</Text>
            <Player name={them} look={looks.theirs} side={theirs} boxes={dots ? theirBoxes : null} end active={live && !myTurn} winner={winner === theirs} calm={calm} testID="cafe-plate-them" />
          </View>
          {live ? (
            <View style={styles.turnStrip}>
              <View style={styles.turnRow}>
                <View style={[styles.turnDot, { backgroundColor: turnColour }]} />
                <Text style={[styles.turnText, { color: turnColour }]} numberOfLines={1} testID="cafe-turn">
                  {turn}
                </Text>
                <Text style={[styles.seconds, { color: c.secs }]} accessibilityLabel={`${seconds} seconds left`} testID="cafe-seconds">{`${seconds}s`}</Text>
              </View>
              <TurnBar endsAt={game.turnEndsAt} side={game.board.turn} now={now} serverNow={serverNow} calm={calm} />
            </View>
          ) : null}
          {live && (game.away || awayFromCafe) ? (
            <Text style={[styles.warn, { backgroundColor: c.primary, color: c.onPrimary }]} testID="cafe-away">
              Go back to the Café or you&apos;ll lose.
            </Text>
          ) : null}
          <CafeBoardView kind={kind} board={game.board} side={mine} canMove={myTurn && !busy} onMove={onMove} size={boardSize} calm={calm} winner={winner} />
          {result ? (
            <EndCard calm={calm} win={result.won}>
              <View style={styles.result} testID="cafe-result">
                <View style={styles.resultRow}>
                  {result.won ? <Text style={[styles.star, { color: c.win, textShadowColor: c.crest }]}>★</Text> : null}
                  <Text style={[styles.resultTitle, { color: c.text }]} numberOfLines={1}>
                    {result.title}
                  </Text>
                  {dots ? (
                    <View style={[styles.scorePill, { backgroundColor: c.scoreBg }]}>
                      <Text style={[styles.scoreText, { color: c.text }]}>{`${myBoxes}–${theirBoxes}`}</Text>
                    </View>
                  ) : null}
                </View>
                {result.detail ? <Text style={[styles.resultDetail, { color: c.muted }]}>{result.detail}</Text> : null}
              </View>
              <View style={styles.answers}>
                {game.result?.why === "abandoned" || game.result?.why === "left" ? null : (
                  <Pressable
                    onPress={onRematch}
                    disabled={game.rematch === mine}
                    accessibilityRole="button"
                    accessibilityLabel="Rematch"
                    testID="cafe-rematch"
                    style={({ pressed }) => [styles.button, styles.primary, { backgroundColor: c.primary, shadowColor: c.primary }, game.rematch === mine && styles.waiting, pressed && styles.pressed]}
                  >
                    <Text style={[styles.buttonText, { color: c.onPrimary }]}>Rematch</Text>
                  </Pressable>
                )}
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" testID="cafe-close" style={({ pressed }) => [styles.button, { backgroundColor: c.secondary }, pressed && styles.pressed]}>
                  <Text style={[styles.buttonText, { color: c.onSecondary }]}>Close</Text>
                </Pressable>
              </View>
              {rematch ? (
                <Text style={[styles.note, { color: c.muted }]} testID="cafe-rematch-note">
                  {rematch}
                </Text>
              ) : null}
            </EndCard>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

type Seated = { memberId: string; isMe: boolean; seat?: string; look: Look };

export const CafeLayer = ({
  cafe: games,
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
  const game = games.game && games.game.id !== closedGame ? games.game : null;
  const now = useClock(serverNow, games.challenges.length > 0 || (game !== null && game.result === undefined));
  const challenge = shownChallenge(games.challenges, { now, people, dismissed });
  const hide = (c: CafeChallengeView) => setDismissed((set) => new Set(set).add(`${c.id}:${c.picked}`));
  const lookOf = (memberId: string | null) => (memberId ? (people.find((p) => p.memberId === memberId)?.look ?? null) : null);
  const say = (problem: string | null) => {
    if (problem) onNote(problem);
  };
  const move = (gameId: Id<"cafeGames">, index: number) => {
    if (busy) return;
    setBusy(true);
    void games
      .move(gameId, index)
      .then(say)
      .finally(() => setBusy(false));
  };
  return (
    <>
      {challenge && !game ? (
        <View style={[styles.cardRow, { bottom }]} pointerEvents="box-none">
          <ChallengeCard
            key={`${challenge.id}:${challenge.picked}`}
            challenge={challenge}
            look={lookOf(challenge.other)}
            now={now}
            onPick={(kind) => void games.pick(challenge.id as Id<"cafeChallenges">, kind).then(say)}
            onAnswer={(accept) => {
              if (!accept) hide(challenge);
              void games.respond(challenge.id as Id<"cafeChallenges">, accept).then(say);
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
          looks={{ mine: lookOf(people.find((p) => p.isMe)?.memberId ?? null), theirs: lookOf(game.opponent) }}
          busy={busy}
          onMove={(index) => move(game.id, index)}
          onGiveUp={() => void games.giveUp(game.id).then(say)}
          onRematch={() => void games.rematch(game.id).then(say)}
          onClose={() => setClosedGame(game.id)}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  none: { opacity: 0 },
  centre: { alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1.5, borderRadius: 28, shadowOffset: { width: 0, height: 20 }, shadowOpacity: 1, shadowRadius: 22, elevation: 12 },
  cardRow: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  picker: { position: "absolute", alignSelf: "center", padding: 16, gap: 12 },
  challenge: { padding: 16, gap: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { flex: 1, fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.3 },
  secPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  secPillText: { fontSize: 12.5, fontWeight: "800", fontVariant: ["tabular-nums"], minWidth: 24, textAlign: "center" },
  closeRound: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  tile: { flexGrow: 1, flexBasis: "40%", flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 11, paddingHorizontal: 9, borderRadius: 16, borderWidth: 1 },
  tileWide: { flexBasis: "auto" },
  tileText: { flexShrink: 1, fontFamily: fonts.display, fontSize: 13.5, letterSpacing: -0.2 },
  glyph: { flexDirection: "row", flexWrap: "wrap", overflow: "hidden" },
  glyphX: { fontSize: 10, fontWeight: "900", lineHeight: 11 },
  glyphBox: { borderWidth: 2, borderRadius: 3 },
  glyphFill: { flex: 1, margin: 2, borderRadius: 2 },
  glyphPeg: { position: "absolute", width: 6, height: 6, borderRadius: 3 },
  answers: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  button: { flex: 1, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  primary: { shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 5, elevation: 3 },
  decline: { height: 42, borderRadius: 21 },
  declineText: { fontSize: 14.5, fontWeight: "700" },
  buttonText: { fontFamily: fonts.display, fontSize: 15.5, letterSpacing: -0.15 },
  waiting: { opacity: 0.55 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingLeft: 6, paddingRight: 10, borderRadius: 999, borderWidth: 1 },
  chipText: { fontWeight: "700", fontSize: 12.5, fontVariant: ["tabular-nums"] },
  sheet: { position: "absolute", alignSelf: "center" },
  sheetBody: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 18, gap: 12 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 30 },
  sheetTitle: { flex: 1, fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.25 },
  giveUp: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 13 },
  giveUpText: { fontSize: 12.5, fontWeight: "700" },
  versus: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  vs: { width: 22, textAlign: "center", fontSize: 12, fontWeight: "800" },
  player: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 16 },
  playerEnd: { flexDirection: "row-reverse" },
  playerTint: { borderRadius: 16, borderWidth: 1.5 },
  face: { borderWidth: 2, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: fonts.display, fontSize: 16 },
  playerText: { flex: 1, minWidth: 0, gap: 2 },
  playerTextEnd: { alignItems: "flex-end" },
  playerName: { fontFamily: fonts.display, fontSize: 15, letterSpacing: -0.2 },
  alignEnd: { textAlign: "right" },
  tokenRow: { flexDirection: "row", alignItems: "center", gap: 5, height: 18 },
  rowEnd: { flexDirection: "row-reverse" },
  scorePill: { minWidth: 20, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 8, alignItems: "center" },
  scoreText: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  turnStrip: { gap: 6 },
  turnRow: { flexDirection: "row", alignItems: "center", gap: 6, height: 20 },
  turnDot: { width: 7, height: 7, borderRadius: 3.5 },
  turnText: { flex: 1, fontFamily: fonts.display, fontSize: 14 },
  seconds: { minWidth: 30, textAlign: "right", fontSize: 12.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
  warn: { borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, fontWeight: "700", fontSize: 13, overflow: "hidden" },
  endCard: { gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 },
  result: { alignItems: "center", gap: 4 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%" },
  star: { fontSize: 20, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 1 },
  resultTitle: { flexShrink: 1, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.35 },
  resultDetail: { fontSize: 13, fontWeight: "600" },
  note: { alignSelf: "center", fontSize: 13, fontWeight: "700" },
});
