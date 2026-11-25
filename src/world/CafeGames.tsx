import Ionicons from "@expo/vector-icons/Ionicons";
import { CAFE_CHALLENGE_MS, CAFE_GAME_ORDER, CAFE_GAMES, CAFE_TURN_MS, boxesWon, isCafeGameKind, otherSide, recordScore, type CafeBoard, type Side } from "@shared/cafeGames";
import { BUBBLE_MS, type Look } from "@shared/world";
import { fonts } from "@/theme";
import { useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Reanimated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { announce } from "./announce";
import {
  challengeTitle,
  freshSay,
  gameLabel,
  LOW_TIME_MS,
  lowTimeDelay,
  lowTimeLevel,
  rematchWords,
  resultWords,
  secondsLeft,
  shownChallenge,
  turnEdge,
  turnStarts,
  turnWords,
  watchersWords,
  watcherResultWords,
  watcherTurnWords,
  type CafeChallengeView,
  type TurnMark,
} from "./cafe";
import { CafeBoardView, CafePiece } from "@/components/games/cafe/CafeBoards";
import { GameGlyph, GameTiles } from "@/components/games/cafe/CafeParts";
import { useCafeTheme, type CafeTheme } from "@/components/games/cafe/cafeTheme";
import { Bust, usePresence } from "./Overlays";
import { useBatterySaver, useWorldName } from "./settings";
import { useWatch, type Cafe } from "./useCafe";
import { useForeground } from "./useForeground";
import { useSwipeToClose } from "@/components/ui/swipeToClose";
import { gradientStyle } from "@/components/ui/Grid";

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

const CafeRecord = ({ memberId, testID, tone = "app" }: { memberId: Id<"worldMembers">; testID?: string; tone?: "app" | "cafe" }) => {
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

const STAT_COLUMNS = [
  { key: "wins", label: "Won" },
  { key: "losses", label: "Lost" },
  { key: "draws", label: "Drew" },
] as const;

const Versus = ({ name, mine, theirs, draws }: { name: string; mine: number; theirs: number; draws: number }) => {
  const c = useCafeTheme();
  const drawsText = draws === 1 ? "1 draw" : `${draws} draws`;
  return (
    <View style={styles.versusRow} accessible accessibilityLabel={`You ${mine}, ${name} ${theirs}${draws > 0 ? `, ${drawsText}` : ""}`} testID="cafe-versus">
      <View style={[styles.versusChip, { backgroundColor: c.tile, borderColor: c.tileEdge }]}>
        <View style={styles.versusSide}>
          <CafePiece side="a" size={11} />
          <Text style={[styles.versusName, { color: c.muted }]}>You</Text>
          <Text style={[styles.versusScore, { color: c.text }]}>{mine}</Text>
        </View>
        <View style={[styles.versusRule, { backgroundColor: c.tileEdge }]} />
        <View style={styles.versusSide}>
          <Text style={[styles.versusScore, { color: c.text }]}>{theirs}</Text>
          <Text style={[styles.versusName, { color: c.muted }]} numberOfLines={1}>
            {name}
          </Text>
          <CafePiece side="b" size={11} />
        </View>
      </View>
      {draws > 0 ? <Text style={[styles.versusDraws, { color: c.faint }]}>{drawsText}</Text> : null}
    </View>
  );
};

export const CafeStats = ({ memberId, name, testID }: { memberId: Id<"worldMembers">; name: string; testID?: string }) => {
  const c = useCafeTheme();
  const records = useQuery(api.cafeGames.record, { memberId });
  const versus = useQuery(api.cafeGames.versus, { memberId });
  const rows = CAFE_GAME_ORDER.map((kind) => ({ kind, row: records?.find((r) => r.kind === kind) }));
  const played = rows.some(({ row }) => row !== undefined && row.wins + row.losses + row.draws > 0);
  if (!played && !versus) return null;
  return (
    <View style={[styles.stats, { backgroundColor: c.sheet, borderColor: c.sheetEdge }]} testID={testID}>
      {versus ? <Versus name={name} {...versus} /> : null}
      {played ? (
        <View>
          <View style={styles.statRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.statGame} />
            {STAT_COLUMNS.map(({ key, label }) => (
              <Text key={key} style={[styles.statHead, { color: c.faint }]}>
                {label}
              </Text>
            ))}
          </View>
          {rows.map(({ kind, row }) => (
            <View
              key={kind}
              style={[styles.statRow, styles.statLine, { borderTopColor: c.tileEdge }]}
              accessible
              accessibilityLabel={`${CAFE_GAMES[kind].label}: ${row?.wins ?? 0} won, ${row?.losses ?? 0} lost, ${row?.draws ?? 0} drawn`}
              testID={`cafe-stats-${kind}`}
            >
              <View style={styles.statGame}>
                <GameGlyph kind={kind} size={18} />
                <Text style={[styles.statLabel, { color: c.text }]} numberOfLines={1}>
                  {CAFE_GAMES[kind].label}
                </Text>
              </View>
              {STAT_COLUMNS.map(({ key }) => {
                const count = row?.[key] ?? 0;
                return (
                  <Text key={key} style={[styles.statCount, { color: count > 0 ? c.text : c.faint }]}>
                    {count}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
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

type SheetGame = {
  id: Id<"cafeGames">;
  kind: string;
  board: CafeBoard;
  turnEndsAt: number;
  result?: NonNullable<Cafe["game"]>["result"];
  rematch?: Side;
  away: boolean;
  watchers: number;
};

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
  const turn = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    const to = bright ? 1 : 0;
    lit.set(calm ? to : withTiming(to, { duration: 200 }));
  }, [bright, calm, lit]);
  useEffect(() => {
    const to = active ? 1 : 0;
    turn.set(calm ? to : withTiming(to, { duration: 200 }));
  }, [active, calm, turn]);
  const fade = useAnimatedStyle(() => ({ opacity: 0.56 + 0.44 * lit.get() }));
  const tint = useAnimatedStyle(() => ({ opacity: turn.get() }));
  const score = boxes !== null ? (
    <View style={[styles.scorePill, { backgroundColor: c.scoreBg }]}>
      <Text style={[styles.scoreText, { color: c.text }]}>{boxes}</Text>
    </View>
  ) : null;
  return (
    <Reanimated.View style={[styles.player, end && styles.playerEnd, fade]} testID={testID} accessibilityState={{ selected: active }}>
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.playerTint, { backgroundColor: c.activeBg, borderColor: c.activeEdge }, tint]} testID={`${testID}-tint`} />
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

const Said = ({ text, end, wide, testID }: { text: string | null; end: boolean; wide: boolean; testID: string }) => {
  const c = useCafeTheme();
  if (!text) return null;
  return (
    <View
      style={[styles.said, end ? styles.saidEnd : styles.saidStart, wide ? styles.saidWide : styles.saidHalf, { backgroundColor: c.sheet, borderColor: c.sheetEdge, shadowColor: c.shadow }]}
      pointerEvents="none"
      testID={testID}
    >
      <Text style={[styles.saidText, { color: c.text }]} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
};

const EDGE_WIDTH = 3;
const PULSE_WIDTH = 12;
const EDGE_RADIUS = Platform.OS === "web" ? 0 : 44;

const TurnEdge = ({ colour, mine, endsAt, calm }: { colour: string; mine: boolean; endsAt: number; calm: boolean }) => {
  const steady = useSharedValue(0);
  const pulse = useSharedValue(0);
  const last = useRef<TurnMark | null>(null);
  useEffect(() => {
    const mark = { mine, endsAt };
    const starts = turnStarts(last.current, mark);
    last.current = mark;
    if (!mine) {
      cancelAnimation(pulse);
      pulse.set(0);
      steady.set(calm ? 0 : withTiming(0, { duration: 180 }));
      return;
    }
    if (calm) {
      steady.set(1);
      pulse.set(0);
      return;
    }
    steady.set(withTiming(1, { duration: 260 }));
    if (!starts) return;
    pulse.set(
      withSequence(
        withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
        withTiming(0.3, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 650, easing: Easing.in(Easing.quad) })
      )
    );
  }, [mine, endsAt, calm, pulse, steady]);
  useEffect(() => {
    if (mine && Platform.OS !== "web") void Haptics.selectionAsync();
  }, [mine, endsAt]);
  const steadyStyle = useAnimatedStyle(() => ({ opacity: steady.get() }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.75 * pulse.get() }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID={mine ? "cafe-edge-mine" : "cafe-edge-none"}>
      <Reanimated.View style={[StyleSheet.absoluteFill, { borderColor: colour, borderWidth: PULSE_WIDTH, borderRadius: EDGE_RADIUS }, pulseStyle]} />
      <Reanimated.View style={[StyleSheet.absoluteFill, { borderColor: colour, borderWidth: EDGE_WIDTH, borderRadius: EDGE_RADIUS }, steadyStyle]} />
    </View>
  );
};

const GLOW_WIDTH = 56;
const BEAT_MS = 520;
const STILL_GLOW = 0.85;

const LowTimeGlow = ({ colour, active, endsAt, now, serverNow, calm }: { colour: string; active: boolean; endsAt: number; now: number; serverNow: () => number; calm: boolean }) => {
  const level = useSharedValue(0);
  const beat = useSharedValue(0);
  const foreground = useForeground();
  useEffect(() => {
    cancelAnimation(level);
    cancelAnimation(beat);
    level.set(0);
    beat.set(0);
    if (!active || calm) return;
    const at = serverNow();
    const delay = lowTimeDelay(endsAt, at);
    level.set(lowTimeLevel(endsAt, at));
    level.set(withDelay(delay, withTiming(1, { duration: Math.max(0, Math.min(LOW_TIME_MS, endsAt - at)), easing: Easing.linear })));
    beat.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: BEAT_MS }), withTiming(0, { duration: BEAT_MS })), -1)));
  }, [active, calm, endsAt, foreground, level, beat, serverNow]);
  const glow = useAnimatedStyle(() => {
    const lit = level.get();
    return { opacity: Math.min(1, lit * 4) * (0.35 + 0.65 * lit) * (0.6 + 0.4 * beat.get()) };
  });
  const still = calm && active && endsAt - now <= LOW_TIME_MS;
  if (calm && !still) return null;
  const sides = (
    <>
      <View style={[styles.glow, styles.glowLeft, gradientStyle(`linear-gradient(to right, ${colour}, transparent)`)]} />
      <View style={[styles.glow, styles.glowRight, gradientStyle(`linear-gradient(to left, ${colour}, transparent)`)]} />
    </>
  );
  return calm ? (
    <View style={[StyleSheet.absoluteFill, { opacity: STILL_GLOW }]} pointerEvents="none" testID="cafe-low-time">
      {sides}
    </View>
  ) : (
    <Reanimated.View style={[StyleSheet.absoluteFill, glow]} pointerEvents="none" testID={active ? "cafe-low-time" : undefined}>
      {sides}
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

const WatchersCount = ({ count }: { count: number }) => {
  const c = useCafeTheme();
  const words = watchersWords(count);
  return (
    <View style={styles.watchers} accessible accessibilityLabel={words} testID="cafe-watchers">
      <Ionicons name="eye-outline" size={14} color={c.faint} />
      <Text style={[styles.watchersText, { color: c.faint }]}>{words}</Text>
    </View>
  );
};

const WatchingPill = () => {
  const c = useCafeTheme();
  return (
    <View style={[styles.watchingPill, { backgroundColor: c.pill }]} accessible accessibilityLabel="Watching" testID="cafe-watching">
      <Ionicons name="eye" size={13} color={c.pillText} />
      <Text style={[styles.giveUpText, { color: c.pillText }]}>Watching</Text>
    </View>
  );
};

const CafeSheet = ({
  game,
  side,
  names,
  now,
  serverNow,
  awayFromCafe,
  onReturn,
  safe,
  bottom,
  lift,
  looks,
  said,
  busy,
  onMove,
  onGiveUp,
  onRematch,
  onClose,
  onSeen,
}: {
  game: SheetGame;
  side: Side | null;
  names: Record<Side, string>;
  now: number;
  serverNow: () => number;
  awayFromCafe: boolean;
  onReturn: () => void;
  safe: { top: number; bottom: number };
  bottom: number;
  lift?: SharedValue<number>;
  looks: Record<Side, Look | null>;
  said: Record<Side, string | null>;
  busy: boolean;
  onMove: (move: number) => void;
  onGiveUp: () => void;
  onRematch: () => void;
  onClose: () => void;
  onSeen: (gameId: Id<"cafeGames">) => void;
}) => {
  const c = useCafeTheme();
  const calm = useBatterySaver();
  const { width, height } = useWindowDimensions();
  const [confirming, setConfirming] = useState(false);
  const { mounted, shown } = usePresence(true);
  const ended = game.result !== undefined;
  const live = !ended;
  const watching = side === null;
  const mine = side ?? "a";
  const theirs = otherSide(mine);
  const leftTurn = live && game.board.turn === mine;
  const myTurn = !watching && leftTurn;
  const them = names[theirs];
  const kind = isCafeGameKind(game.kind) ? game.kind : null;
  const sheetWidth = Math.min(400, width - 28);
  const room = height - safe.top - bottom - 12;
  const boardSize = Math.max(240, Math.min(sheetWidth - 32, room - 300));
  const result = game.result ? (watching ? watcherResultWords(game.result, names) : resultWords(game.result, mine, them)) : null;
  const turn = watching ? watcherTurnWords(game.board.turn, names) : turnWords(game.board.turn, mine, them);
  const dots = kind === "dotsAndBoxes";
  const myBoxes = boxesWon(game.board.boxes, mine);
  const theirBoxes = boxesWon(game.board.boxes, theirs);
  const winner = game.result && game.result.winner !== "draw" ? game.result.winner : null;
  const closable = ended || watching;
  const swipe = useSwipeToClose(closable, () => {
    onClose();
    return true;
  });
  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: lift ? -lift.get() : 0 }] }));
  const onSeenRef = useRef(onSeen);
  useEffect(() => {
    onSeenRef.current = onSeen;
  }, [onSeen]);
  useEffect(() => {
    if (!ended || watching) return;
    return () => onSeenRef.current(game.id);
  }, [ended, watching, game.id]);
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
  const rematch = watching ? null : rematchWords(game.rematch, mine, them);
  const seconds = Math.min(TURN_SECONDS, secondsLeft(game.turnEndsAt, now));
  const turnColour = c[game.board.turn].turn;
  const edge = turnEdge(game, mine);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} accessible={false} testID="cafe-scrim">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: shown }]} />
      </Pressable>
      {watching ? null : (
        <>
          <TurnEdge colour={c[mine].turn} mine={edge === "mine"} endsAt={game.turnEndsAt} calm={calm} />
          <LowTimeGlow colour={c.lowTime} active={edge === "mine" && !busy} endsAt={game.turnEndsAt} now={now} serverNow={serverNow} calm={calm} />
        </>
      )}
      <Reanimated.View style={[StyleSheet.absoluteFill, lifted]} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            card(c),
            styles.sheet,
            { width: sheetWidth, bottom, maxHeight: room },
            calm ? { opacity: shown, ...swipe.dragStyle } : { opacity: shown, transform: [{ translateY: Animated.add(shown.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }), swipe.drag) }] },
          ]}
          testID="cafe-sheet"
          accessibilityViewIsModal
        >
          <ScrollView contentContainerStyle={styles.sheetBody} bounces={false} keyboardShouldPersistTaps="handled">
            <View testID="cafe-sheet-header" style={closable ? null : styles.headNoHandle} {...(closable ? swipe.headerHandlers : null)}>
              {closable ? <View style={[styles.handle, { backgroundColor: c.handle }]} testID="cafe-handle" /> : null}
              <View style={styles.sheetHead}>
                <GameGlyph kind={kind} />
                <Text style={[styles.sheetTitle, { color: c.text }]} accessibilityRole="header" numberOfLines={1}>
                  {CAFE_GAMES[kind].label}
                </Text>
                {watching ? <WatchingPill /> : game.watchers > 0 ? <WatchersCount count={game.watchers} /> : null}
                {closable ? (
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
            </View>
            <View style={styles.versus}>
              <Player name={names[mine]} look={looks[mine]} side={mine} boxes={dots ? myBoxes : null} end={false} active={leftTurn} winner={winner === mine} calm={calm} testID={watching ? "cafe-plate-a" : "cafe-plate-me"} />
              <Text style={[styles.vs, { color: c.faint }]}>vs</Text>
              <Player name={them} look={looks[theirs]} side={theirs} boxes={dots ? theirBoxes : null} end active={live && !leftTurn} winner={winner === theirs} calm={calm} testID={watching ? "cafe-plate-b" : "cafe-plate-them"} />
              <Said text={said[mine]} end={false} wide={!said[theirs]} testID={watching ? "cafe-plate-a-said" : "cafe-plate-me-said"} />
              <Said text={said[theirs]} end wide={!said[mine]} testID={watching ? "cafe-plate-b-said" : "cafe-plate-them-said"} />
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
            {live && !watching && (game.away || awayFromCafe) ? (
              <Pressable
                onPress={onReturn}
                accessibilityRole="button"
                accessibilityLabel="Back to the Café. You lose if you stay away."
                testID="cafe-away"
                style={({ pressed }) => [styles.warn, { backgroundColor: c.primary }, pressed && styles.pressed]}
              >
                <Text style={[styles.warnText, { color: c.onPrimary }]}>Back to the Café</Text>
                <Text style={[styles.warnSub, { color: c.onPrimary }]}>or you lose</Text>
              </Pressable>
            ) : null}
            <CafeBoardView kind={kind} board={game.board} side={mine} canMove={myTurn && !busy} onMove={onMove} size={boardSize} calm={calm} winner={winner} names={watching ? names : undefined} />
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
                  {watching || game.result?.why === "abandoned" || game.result?.why === "left" ? null : (
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
      </Reanimated.View>
    </View>
  );
};

type Seated = { memberId: string; isMe: boolean; seat?: string; look: Look; say?: { text: string; at: number } };

export const CafeLayer = ({
  cafe: games,
  people,
  muted,
  place,
  serverNow,
  bottom,
  sheetBottom,
  lift,
  safe,
  onNote,
  onReturn,
  watch,
  onStopWatching,
}: {
  cafe: Cafe;
  people: readonly Seated[];
  muted: ReadonlySet<string>;
  place: string;
  serverNow: () => number;
  bottom: number;
  sheetBottom: number;
  lift?: SharedValue<number>;
  safe: { top: number; bottom: number };
  onNote: (note: string) => void;
  onReturn: () => void;
  watch: Id<"cafeGames"> | null;
  onStopWatching: () => void;
}) => {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [closedGame, setClosedGame] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const worldName = useWorldName();
  const game = games.game && games.game.id !== closedGame ? games.game : null;
  const stopWatching = useCallback(
    (note: string) => {
      onStopWatching();
      onNote(note);
    },
    [onStopWatching, onNote]
  );
  const watched = useWatch(game ? null : watch, stopWatching);
  useEffect(() => {
    if (game && watch) onStopWatching();
  }, [game, watch, onStopWatching]);
  const now = useClock(serverNow, games.challenges.length > 0 || game !== null || watched !== null);
  const { close } = games;
  const seen = useCallback((gameId: Id<"cafeGames">) => void close(gameId), [close]);
  const saidBy = (memberId: string | null) => {
    const person = memberId === null || muted.has(memberId) ? undefined : people.find((p) => p.memberId === memberId);
    return freshSay(person?.say, now, BUBBLE_MS);
  };
  const challenge = shownChallenge(games.challenges, { now, people, dismissed });
  const hide = (c: CafeChallengeView) => setDismissed((set) => new Set(set).add(`${c.id}:${c.picked}`));
  const lookOf = (memberId: string | null) => (memberId ? (people.find((p) => p.memberId === memberId)?.look ?? null) : null);
  const myId = people.find((p) => p.isMe)?.memberId ?? null;
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
          side={game.side}
          names={game.side === "a" ? { a: "You", b: worldName(game.opponentName) } : { a: worldName(game.opponentName), b: "You" }}
          now={now}
          serverNow={serverNow}
          awayFromCafe={place !== "cafe"}
          onReturn={onReturn}
          safe={safe}
          bottom={sheetBottom}
          lift={lift}
          looks={game.side === "a" ? { a: lookOf(myId), b: lookOf(game.opponent) } : { a: lookOf(game.opponent), b: lookOf(myId) }}
          said={game.side === "a" ? { a: saidBy(myId), b: saidBy(game.opponent) } : { a: saidBy(game.opponent), b: saidBy(myId) }}
          busy={busy}
          onMove={(index) => move(game.id, index)}
          onGiveUp={() => void games.giveUp(game.id).then(say)}
          onRematch={() => void games.rematch(game.id).then(say)}
          onClose={() => setClosedGame(game.id)}
          onSeen={seen}
        />
      ) : watched ? (
        <CafeSheet
          key={`watch-${watched.id}`}
          game={{ ...watched, away: false, watchers: 0 }}
          side={null}
          names={{ a: worldName(watched.a.name), b: worldName(watched.b.name) }}
          now={now}
          serverNow={serverNow}
          awayFromCafe={false}
          onReturn={onReturn}
          safe={safe}
          bottom={sheetBottom}
          lift={lift}
          looks={{ a: lookOf(watched.a.member), b: lookOf(watched.b.member) }}
          said={{ a: saidBy(watched.a.member), b: saidBy(watched.b.member) }}
          busy={false}
          onMove={() => undefined}
          onGiveUp={() => undefined}
          onRematch={() => undefined}
          onClose={onStopWatching}
          onSeen={() => undefined}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
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
  tile: { flexGrow: 1, flexBasis: "40%", flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 11, paddingHorizontal: 9, borderRadius: 16, borderWidth: 1 },
  tileWide: { flexBasis: "auto" },
  tileText: { flexShrink: 1, fontFamily: fonts.display, fontSize: 13.5, letterSpacing: -0.2 },
  answers: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  button: { flex: 1, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  primary: { shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 5, elevation: 3 },
  decline: { height: 42, borderRadius: 21 },
  declineText: { fontSize: 14.5, fontWeight: "700" },
  buttonText: { fontFamily: fonts.display, fontSize: 15.5, letterSpacing: -0.15 },
  waiting: { opacity: 0.55 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stats: { borderWidth: 1, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statLine: { minHeight: 34, borderTopWidth: StyleSheet.hairlineWidth },
  statGame: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  statLabel: { flexShrink: 1, fontFamily: fonts.display, fontSize: 14, letterSpacing: -0.2 },
  statHead: { width: 44, textAlign: "center", fontSize: 11.5, fontWeight: "700" },
  statCount: { width: 44, textAlign: "center", fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  versusRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  versusChip: { flexShrink: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, gap: 10 },
  versusSide: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  versusName: { flexShrink: 1, fontSize: 13, fontWeight: "700" },
  versusScore: { fontFamily: fonts.display, fontSize: 18, fontVariant: ["tabular-nums"] },
  versusRule: { width: 1, alignSelf: "stretch" },
  versusDraws: { fontSize: 12.5, fontWeight: "700" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingLeft: 6, paddingRight: 10, borderRadius: 999, borderWidth: 1 },
  chipText: { fontWeight: "700", fontSize: 12.5, fontVariant: ["tabular-nums"] },
  sheet: { position: "absolute", alignSelf: "center" },
  headNoHandle: { paddingTop: 2 },
  said: {
    position: "absolute",
    bottom: "100%",
    marginBottom: -14,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
    elevation: 3,
  },
  saidStart: { left: 4, borderBottomLeftRadius: 3 },
  saidEnd: { right: 4, borderBottomRightRadius: 3 },
  saidWide: { maxWidth: "82%" },
  saidHalf: { maxWidth: "49%" },
  saidText: { fontSize: 12.5, fontWeight: "700" },
  glow: { position: "absolute", top: 0, bottom: 0, width: GLOW_WIDTH },
  glowLeft: { left: 0 },
  glowRight: { right: 0 },
  sheetBody: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 18, gap: 12 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 30 },
  sheetTitle: { flex: 1, fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.25 },
  giveUp: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 13 },
  giveUpText: { fontSize: 12.5, fontWeight: "700" },
  watchingPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 13 },
  watchers: { flexDirection: "row", alignItems: "center", gap: 4 },
  watchersText: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
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
  warn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 20 },
  warnText: { fontFamily: fonts.display, fontSize: 15 },
  warnSub: { fontSize: 13, fontWeight: "600", opacity: 0.85 },
  endCard: { gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 },
  result: { alignItems: "center", gap: 4 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%" },
  star: { fontSize: 20, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 1 },
  resultTitle: { flexShrink: 1, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.35 },
  resultDetail: { fontSize: 13, fontWeight: "600" },
  note: { alignSelf: "center", fontSize: 13, fontWeight: "700" },
});
