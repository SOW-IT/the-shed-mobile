import { CAFE_GAMES, boxesWon, isCafeGameKind, type Side } from "@shared/cafeGames";
import { Screen } from "@/components/ui";
import { fonts } from "@/theme";
import { storedValue } from "@/lib/deviceStorage";
import { cleanName, DEFAULT_NAMES, localResultWords, localTurnWords, NAME_MAX, playLocal, rematchLocal, restoreNames, startLocal, type LocalCafeGame, type LocalNames } from "@/lib/games/cafeLocal";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { CafeBoardView, CafePiece } from "./cafe/CafeBoards";
import { GameGlyph, GameTiles } from "./cafe/CafeParts";
import { useCafeTheme } from "./cafe/cafeTheme";

const namesStore = storedValue<LocalNames>({
  key: "cafeTableNames",
  initial: DEFAULT_NAMES,
  restore: (saved) => restoreNames(saved),
  serialize: (value) => JSON.stringify(value),
});

const useNames = () => {
  const names = useSyncExternalStore(namesStore.subscribe, namesStore.get, namesStore.get);
  return [names, namesStore.set] as const;
};

const Name = ({ side, names, onRename, align }: { side: Side; names: LocalNames; onRename: (side: Side, name: string) => void; align: "start" | "end" }) => {
  const c = useCafeTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const end = align === "end";
  const save = () => {
    if (draft !== null) onRename(side, cleanName(draft, DEFAULT_NAMES[side]));
    setDraft(null);
  };
  if (draft !== null) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={save}
        onSubmitEditing={save}
        autoFocus
        maxLength={NAME_MAX}
        selectTextOnFocus
        returnKeyType="done"
        accessibilityLabel={`Name for ${DEFAULT_NAMES[side]}`}
        testID={`cafe-local-name-input-${side}`}
        style={[styles.nameInput, { color: c.text, borderColor: c.tileEdge, backgroundColor: c.tile }, end && styles.alignEnd]}
      />
    );
  }
  return (
    <Pressable onPress={() => setDraft(names[side])} accessibilityRole="button" accessibilityLabel={`${names[side]}. Rename`} testID={`cafe-local-name-${side}`} hitSlop={6}>
      <Text style={[styles.name, { color: c.text }, end && styles.alignEnd]} numberOfLines={1} ellipsizeMode="tail">
        {names[side]}
      </Text>
    </Pressable>
  );
};

const Plate = ({
  side,
  names,
  active,
  winner,
  boxes,
  onRename,
  calm,
  idle = false,
}: {
  side: Side;
  names: LocalNames;
  active: boolean;
  winner: boolean;
  boxes: number | null;
  onRename: (side: Side, name: string) => void;
  calm: boolean;
  idle?: boolean;
}) => {
  const c = useCafeTheme();
  const end = side === "b";
  const lit = useSharedValue(active || winner ? 1 : 0);
  useEffect(() => {
    const to = active || winner ? 1 : 0;
    lit.set(calm ? to : withTiming(to, { duration: 200 }));
  }, [active, winner, calm, lit]);
  const fade = useAnimatedStyle(() => ({ opacity: idle ? 1 : 0.56 + 0.44 * lit.get() }));
  const tint = useAnimatedStyle(() => ({ opacity: lit.get() }));
  return (
    <Reanimated.View style={[styles.plate, end && styles.plateEnd, fade]} testID={`cafe-local-plate-${side}`} accessibilityState={{ selected: active }}>
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.plateTint, { backgroundColor: c.activeBg, borderColor: winner ? c.win : c.activeEdge }, tint]} />
      <View style={[styles.token, { borderColor: winner ? c.win : c.avatarEdge }]}>
        <CafePiece side={side} size={26} />
      </View>
      <View style={[styles.plateText, end && styles.plateTextEnd]}>
        <Name side={side} names={names} onRename={onRename} align={end ? "end" : "start"} />
        <View style={[styles.subRow, end && styles.subRowEnd]}>
          {boxes !== null ? (
            <View style={[styles.scorePill, { backgroundColor: c.scoreBg }]}>
              <Text style={[styles.scoreText, { color: c.text }]}>{boxes}</Text>
            </View>
          ) : null}
          {active ? <Text style={[styles.yourGo, { color: c[side].turn }]}>Your go</Text> : null}
        </View>
      </View>
    </Reanimated.View>
  );
};

const EndCard = ({ title, win, onRematch, onPicker, calm, score }: { title: string; win: boolean; onRematch: () => void; onPicker: () => void; calm: boolean; score: string | null }) => {
  const c = useCafeTheme();
  const shown = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (!calm) shown.set(withDelay(180, withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) })));
  }, [calm, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * 16 }, { scale: 0.96 + 0.04 * shown.get() }] }));
  return (
    <Reanimated.View style={[styles.endCard, { backgroundColor: win ? c.endWin : c.endCard, borderColor: win ? c.endWinEdge : c.endEdge }, style]} testID="cafe-local-result">
      <View style={styles.resultRow}>
        {win ? <Text style={[styles.star, { color: c.win }]}>★</Text> : null}
        <Text style={[styles.resultTitle, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {score ? (
          <View style={[styles.scorePill, { backgroundColor: c.scoreBg }]}>
            <Text style={[styles.scoreText, { color: c.text }]}>{score}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.answers}>
        <Pressable onPress={onRematch} accessibilityRole="button" accessibilityLabel="Rematch" testID="cafe-local-rematch" style={({ pressed }) => [styles.button, { backgroundColor: c.primary }, pressed && styles.pressed]}>
          <Text style={[styles.buttonText, { color: c.onPrimary }]}>Rematch</Text>
        </Pressable>
        <Pressable onPress={onPicker} accessibilityRole="button" accessibilityLabel="Other games" testID="cafe-local-picker" style={({ pressed }) => [styles.button, { backgroundColor: c.secondary }, pressed && styles.pressed]}>
          <Text style={[styles.buttonText, { color: c.onSecondary }]}>Other games</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
};

const LocalGame = ({ game, names, onMove, onRename, onRematch, onPicker }: { game: LocalCafeGame; names: LocalNames; onMove: (move: number) => void; onRename: (side: Side, name: string) => void; onRematch: () => void; onPicker: () => void }) => {
  const c = useCafeTheme();
  const calm = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const live = game.winner === null;
  const turn = game.board.turn;
  const dots = game.kind === "dotsAndBoxes";
  const boardSize = Math.max(240, Math.min(Math.min(440, width - 28) - 32, height - 330));
  const winner = game.winner !== null && game.winner !== "draw" ? game.winner : null;
  const boxes = (side: Side) => (dots ? boxesWon(game.board.boxes, side) : null);
  return (
    <View style={[styles.sheet, { backgroundColor: c.sheet, borderColor: c.sheetEdge }]} testID="cafe-local-game">
      <View style={styles.head}>
        <GameGlyph kind={game.kind} />
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
          {CAFE_GAMES[game.kind].label}
        </Text>
      </View>
      <View style={styles.versus}>
        <Plate side="a" names={names} active={live && turn === "a"} winner={winner === "a"} boxes={boxes("a")} onRename={onRename} calm={calm} />
        <Text style={[styles.vs, { color: c.faint }]}>vs</Text>
        <Plate side="b" names={names} active={live && turn === "b"} winner={winner === "b"} boxes={boxes("b")} onRename={onRename} calm={calm} />
      </View>
      {live ? (
        <View style={[styles.passBar, { backgroundColor: c.activeBg, borderColor: c.activeEdge }]}>
          <CafePiece side={turn} size={16} />
          <Text style={[styles.passText, { color: c[turn].turn }]} numberOfLines={1} testID="cafe-local-turn">
            {localTurnWords(game, names)}
          </Text>
        </View>
      ) : null}
      <CafeBoardView kind={game.kind} board={game.board} side={turn} canMove={live} onMove={onMove} size={boardSize} calm={calm} winner={winner} />
      {game.winner !== null ? (
        <EndCard
          title={localResultWords(game.winner, names)}
          win={winner !== null}
          score={dots ? `${boxesWon(game.board.boxes, "a")}–${boxesWon(game.board.boxes, "b")}` : null}
          onRematch={onRematch}
          onPicker={onPicker}
          calm={calm}
        />
      ) : null}
    </View>
  );
};

export const CafeTableGames = ({ onExit }: { onExit: () => void }) => {
  const c = useCafeTheme();
  const [names, setNames] = useNames();
  const [game, setGame] = useState<LocalCafeGame | null>(null);
  const [round, setRound] = useState(0);
  const rename = (side: Side, name: string) => setNames({ ...names, [side]: name });
  const pick = (kind: string) => {
    if (!isCafeGameKind(kind)) return;
    setRound((n) => n + 1);
    setGame(startLocal(kind));
  };
  return (
    <Screen title="Café Games" onBack={game ? () => setGame(null) : onExit} maxWidth={480}>
      {game ? (
        <LocalGame
          key={round}
          game={game}
          names={names}
          onMove={(move) => setGame((current) => (current ? playLocal(current, move) : current))}
          onRename={rename}
          onRematch={() => {
            setRound((n) => n + 1);
            setGame((current) => (current ? rematchLocal(current) : current));
          }}
          onPicker={() => setGame(null)}
        />
      ) : (
        <View style={[styles.sheet, { backgroundColor: c.sheet, borderColor: c.sheetEdge }]} testID="cafe-local-picker-card">
          <View style={styles.versus}>
            <Plate side="a" names={names} active={false} winner={false} boxes={null} onRename={rename} calm idle />
            <Text style={[styles.vs, { color: c.faint }]}>vs</Text>
            <Plate side="b" names={names} active={false} winner={false} boxes={null} onRename={rename} calm idle />
          </View>
          <Text style={[styles.lead, { color: c.muted }]}>Pass the phone between turns.</Text>
          <GameTiles testPrefix="cafe-local" onPick={pick} />
        </View>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  sheet: { borderWidth: 1.5, borderRadius: 28, padding: 16, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.25 },
  versus: { flexDirection: "row", alignItems: "center", gap: 6 },
  vs: { width: 22, textAlign: "center", fontSize: 12, fontWeight: "800" },
  plate: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 16 },
  plateEnd: { flexDirection: "row-reverse" },
  plateTint: { borderRadius: 16, borderWidth: 1.5 },
  token: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  plateText: { flex: 1, minWidth: 0, gap: 2 },
  plateTextEnd: { alignItems: "flex-end" },
  name: { fontFamily: fonts.display, fontSize: 15, letterSpacing: -0.2 },
  nameInput: { alignSelf: "stretch", fontFamily: fonts.display, fontSize: 15, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 8, borderWidth: 1 },
  alignEnd: { textAlign: "right" },
  subRow: { flexDirection: "row", alignItems: "center", gap: 6, height: 18 },
  subRowEnd: { flexDirection: "row-reverse" },
  yourGo: { fontSize: 12, fontWeight: "800" },
  scorePill: { minWidth: 20, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 8, alignItems: "center" },
  scoreText: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  passBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 40, borderRadius: 20, borderWidth: 1.5 },
  passText: { fontFamily: fonts.display, fontSize: 16 },
  lead: { fontSize: 13, fontWeight: "600" },
  endCard: { gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 },
  resultRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  star: { fontSize: 20 },
  resultTitle: { flexShrink: 1, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.35 },
  answers: { flexDirection: "row", gap: 10 },
  button: { flex: 1, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: fonts.display, fontSize: 15.5, letterSpacing: -0.15 },
});
