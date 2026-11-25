import { boxEdges, DOTS_BOXES, DOTS_LINES, dotLine, dropRow, gridOf, type CafeBoard, type CafeGameKind, type Side } from "@shared/cafeGames";
import { useEffect, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { cafe, shade } from "./palette";

type BoardProps = {
  board: CafeBoard;
  side: Side;
  canMove: boolean;
  onMove: (move: number) => void;
  size: number;
  calm: boolean;
};

const sideOfMark = (mark: number): Side | null => (mark === 1 ? "a" : mark === 2 ? "b" : null);
const colourOf = (mark: number) => (mark === 1 ? cafe.a : cafe.b);
const spots = (cells: readonly number[]) => cells.map((mark, index) => ({ mark, index }));
const owner = (mark: number, side: Side) => {
  const who = sideOfMark(mark);
  return who === null ? "empty" : who === side ? "yours" : "theirs";
};

const WIN_STEP_MS = 90;

const useEntrance = (play: boolean, calm: boolean, run: (progress: SharedValue<number>) => void) => {
  const progress = useSharedValue(play && !calm ? 0 : 1);
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (play && !calm) latest.current(progress);
  }, [play, calm, progress]);
  return progress;
};

const WinGlow = ({ order, calm, round }: { order: number; calm: boolean; round: boolean }) => {
  const glow = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (!calm) glow.set(withDelay(order * WIN_STEP_MS, withSequence(withTiming(1.2, { duration: 160 }), withTiming(1, { duration: 140 }))));
  }, [calm, order, glow]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, glow.get()), transform: [{ scale: glow.get() }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, round ? styles.winRound : styles.winSquare, style]} />;
};

const Piece = ({ mark, size }: { mark: number; size: number }) => {
  const base = colourOf(mark);
  return (
    <View style={[styles.piece, { width: size, height: size, borderRadius: size / 2, backgroundColor: base, borderColor: shade(base, -0.3) }]}>
      <View style={[styles.shine, { width: size * 0.34, height: size * 0.2, borderRadius: size, top: size * 0.12, left: size * 0.2 }]} />
    </View>
  );
};

const DroppingDisc = ({ mark, size, fall, play, calm }: { mark: number; size: number; fall: number; play: boolean; calm: boolean }) => {
  const y = useEntrance(play, calm, (p) =>
    p.set(
      withSequence(
        withTiming(1, { duration: 170 + fall * 0.9, easing: Easing.in(Easing.quad) }),
        withTiming(1.06, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 110, easing: Easing.in(Easing.quad) })
      )
    )
  );
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (y.get() - 1) * fall }] }));
  return (
    <Animated.View style={style}>
      <Piece mark={mark} size={size} />
    </Animated.View>
  );
};

const FourInARow = ({ board, canMove, onMove, size, calm }: BoardProps) => {
  const { width, height } = gridOf("fourInARow");
  const cell = Math.min(46, Math.floor((size - 22) / width));
  const won = board.line ?? [];
  return (
    <View style={[styles.tray, styles.row, { padding: 8 }]} testID="cafe-board-fourInARow">
      {Array.from({ length: width }, (_, col) => {
        const open = dropRow(board.cells, col) !== null;
        return (
          <Pressable
            key={col}
            onPress={() => onMove(col)}
            disabled={!canMove || !open}
            accessibilityRole="button"
            accessibilityLabel={`Column ${col + 1}${open ? "" : ", full"}`}
            testID={`cafe-col-${col}`}
            style={({ pressed }) => [{ width: cell }, pressed && styles.pressedColumn]}
          >
            {Array.from({ length: height }, (__, row) => {
              const index = row * width + col;
              const mark = board.cells[index];
              const order = won.indexOf(index);
              return (
                <View key={row} style={[styles.slot, { width: cell, height: cell }]}>
                  <View style={[styles.hole, { width: cell - 8, height: cell - 8, borderRadius: cell / 2 }]} />
                  {mark ? (
                    <View style={[StyleSheet.absoluteFill, styles.centre]}>
                      <DroppingDisc mark={mark} size={cell - 8} fall={(row + 0.6) * cell} play={board.last === index} calm={calm} />
                      {order >= 0 ? (
                        <View pointerEvents="none" style={[styles.glowSpot, { width: cell - 4, height: cell - 4 }]}>
                          <WinGlow order={order} calm={calm} round />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Pressable>
        );
      })}
    </View>
  );
};

const Pop = ({ play, calm, spring, children }: { play: boolean; calm: boolean; spring?: boolean; children: ReactNode }) => {
  const p = useEntrance(play, calm, (v) => v.set(spring ? withSpring(1, { damping: 9, stiffness: 240 }) : withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.6)) })));
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.get() * 1.6),
    transform: [{ scale: 0.25 + 0.75 * p.get() }, { rotate: `${(1 - p.get()) * (spring ? 0 : -40)}deg` }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
};

const Mark = ({ mark, size }: { mark: number; size: number }) => {
  const ink = colourOf(mark);
  const stroke = Math.max(6, size * 0.16);
  if (mark === 2) return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: ink }} />;
  return (
    <View style={{ width: size, height: size }}>
      {[45, -45].map((turn) => (
        <View
          key={turn}
          style={[styles.crossBar, { width: size * 1.2, height: stroke, borderRadius: stroke, backgroundColor: ink, top: size / 2 - stroke / 2, left: -size * 0.1, transform: [{ rotate: `${turn}deg` }] }]}
        />
      ))}
    </View>
  );
};

const TicTacToe = ({ board, side, canMove, onMove, size, calm }: BoardProps) => {
  const cell = Math.min(96, Math.floor((size - 22) / 3));
  const won = board.line ?? [];
  return (
    <View style={[styles.tray, { padding: 8 }]} testID="cafe-board-ticTacToe">
      <View style={[styles.grid, { width: cell * 3 }]}>
        {spots(board.cells).map(({ mark, index }) => {
          const order = won.indexOf(index);
          return (
            <Pressable
              key={index}
              onPress={() => onMove(index)}
              disabled={!canMove || mark !== 0}
              accessibilityRole="button"
              accessibilityLabel={`Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}, ${owner(mark, side)}`}
              testID={`cafe-cell-${index}`}
              style={({ pressed }) => [styles.square, { width: cell, height: cell }, pressed && styles.pressedSquare]}
            >
              {order >= 0 ? <WinGlow order={order} calm={calm} round={false} /> : null}
              {mark ? (
                <Pop play={board.last === index} calm={calm}>
                  <Mark mark={mark} size={cell * 0.5} />
                </Pop>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const DOT = 12;
const HIT = 28;
const BAR = 7;

const Line = ({ mark, across, length, play, calm }: { mark: number; across: boolean; length: number; play: boolean; calm: boolean }) => {
  const grow = useEntrance(play, calm, (p) => p.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) })));
  const style = useAnimatedStyle(() => (across ? { width: length * grow.get() } : { height: length * grow.get() }));
  return (
    <View style={[across ? { width: length, height: BAR } : { width: BAR, height: length }, styles.lineTrack]}>
      <Animated.View style={[across ? { height: BAR } : { width: BAR }, styles.bar, { backgroundColor: colourOf(mark) }, style]} />
    </View>
  );
};

const Box = ({ mark, size, play, calm }: { mark: number; size: number; play: boolean; calm: boolean }) => {
  const fill = useEntrance(play, calm, (p) => p.set(withDelay(160, withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.4)) }))));
  const style = useAnimatedStyle(() => ({ opacity: fill.get(), transform: [{ scale: 0.4 + 0.6 * fill.get() }] }));
  return (
    <Animated.View style={[styles.box, { width: size, height: size, backgroundColor: mark === 1 ? cafe.aSoft : cafe.bSoft, borderColor: colourOf(mark) }, style]}>
      <Piece mark={mark} size={Math.min(22, size * 0.34)} />
    </Animated.View>
  );
};

const boxesTouching = (line: number) => {
  const found: number[] = [];
  for (let box = 0; box < DOTS_BOXES * DOTS_BOXES; box++) if (boxEdges(box).includes(line)) found.push(box);
  return found;
};

const DotsAndBoxes = ({ board, side, canMove, onMove, size, calm }: BoardProps) => {
  const pad = HIT / 2 + 4;
  const step = Math.min(70, Math.floor((size - pad * 2 - 6) / DOTS_BOXES));
  const span = step * DOTS_BOXES + pad * 2;
  const justClosed = board.last === undefined ? [] : boxesTouching(board.last);
  return (
    <View style={[styles.tray, { width: span + 5, height: span + 8.5 }]} testID="cafe-board-dotsAndBoxes">
      {spots(board.boxes).map(({ mark, index: box }) => {
        if (!mark) return null;
        const [top] = boxEdges(box);
        const { row, col } = dotLine(top);
        return (
          <View key={`box-${box}`} style={[styles.boxSpot, { left: pad + col * step, top: pad + row * step, width: step, height: step }]} accessibilityLabel={`Box ${owner(mark, side)}`}>
            <Box mark={mark} size={step - 14} play={justClosed.includes(box)} calm={calm} />
          </View>
        );
      })}
      {Array.from({ length: DOTS_LINES }, (_, index) => {
        const { dir, row, col } = dotLine(index);
        const mark = board.cells[index];
        const across = dir === "h";
        const length = step - DOT;
        const frame = across
          ? { left: pad + col * step + DOT / 2, top: pad + row * step - HIT / 2, width: length, height: HIT }
          : { left: pad + col * step - HIT / 2, top: pad + row * step + DOT / 2, width: HIT, height: length };
        return (
          <Pressable
            key={`line-${index}`}
            onPress={() => onMove(index)}
            disabled={!canMove || mark !== 0}
            accessibilityRole="button"
            accessibilityLabel={`${across ? "Across" : "Down"}, row ${row + 1}, column ${col + 1}, ${owner(mark, side)}`}
            testID={`cafe-line-${index}`}
            style={({ pressed }) => [styles.lineHit, frame, pressed && styles.pressedLine]}
          >
            {mark ? (
              <Line mark={mark} across={across} length={length} play={board.last === index} calm={calm} />
            ) : (
              <View style={[across ? { width: length, height: BAR } : { width: BAR, height: length }, styles.lineTrack]} />
            )}
          </Pressable>
        );
      })}
      {Array.from({ length: (DOTS_BOXES + 1) * (DOTS_BOXES + 1) }, (_, i) => (
        <View
          key={`dot-${i}`}
          pointerEvents="none"
          style={[styles.dot, { left: pad + (i % (DOTS_BOXES + 1)) * step - DOT / 2, top: pad + Math.floor(i / (DOTS_BOXES + 1)) * step - DOT / 2 }]}
        />
      ))}
    </View>
  );
};

const FiveInARow = ({ board, side, canMove, onMove, size, calm }: BoardProps) => {
  const { width: n } = gridOf("fiveInARow");
  const cell = Math.floor((size - 18) / n);
  const span = cell * n;
  const won = board.line ?? [];
  return (
    <View style={[styles.tray, { padding: 6 }]} testID="cafe-board-fiveInARow">
      <View style={{ width: span, height: span }}>
        {Array.from({ length: n }, (_, i) => (
          <View key={`h-${i}`} pointerEvents="none" style={[styles.gridLine, { left: cell / 2, right: cell / 2, top: i * cell + cell / 2 - 0.5, height: 1 }]} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <View key={`v-${i}`} pointerEvents="none" style={[styles.gridLine, { top: cell / 2, bottom: cell / 2, left: i * cell + cell / 2 - 0.5, width: 1 }]} />
        ))}
        {spots(board.cells).map(({ mark, index }) => {
          const order = won.indexOf(index);
          return (
            <Pressable
              key={index}
              onPress={() => onMove(index)}
              disabled={!canMove || mark !== 0}
              accessibilityRole="button"
              accessibilityLabel={`Row ${Math.floor(index / n) + 1}, column ${(index % n) + 1}, ${owner(mark, side)}`}
              testID={`cafe-point-${index}`}
              style={[styles.point, { left: (index % n) * cell, top: Math.floor(index / n) * cell, width: cell, height: cell }]}
            >
              {mark ? (
                <>
                  <Pop play={board.last === index} calm={calm} spring>
                    <Piece mark={mark} size={cell - 3} />
                  </Pop>
                  {order >= 0 ? <WinGlow order={order} calm={calm} round /> : null}
                </>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const BOARDS: Record<CafeGameKind, (props: BoardProps) => React.JSX.Element> = {
  fourInARow: FourInARow,
  ticTacToe: TicTacToe,
  dotsAndBoxes: DotsAndBoxes,
  fiveInARow: FiveInARow,
};

export const CafeBoardView = ({ kind, ...props }: BoardProps & { kind: CafeGameKind }) => {
  const Board = BOARDS[kind];
  return <Board {...props} />;
};

export const CafePiece = Piece;

const styles = StyleSheet.create({
  tray: {
    alignSelf: "center",
    backgroundColor: cafe.board,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: cafe.edge,
    borderBottomWidth: 6,
  },
  row: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  centre: { alignItems: "center", justifyContent: "center" },
  glowSpot: { position: "absolute" },
  pressedColumn: { backgroundColor: cafe.press, borderRadius: 12 },
  pressedSquare: { backgroundColor: cafe.press },
  pressedLine: { opacity: 0.6 },
  slot: { alignItems: "center", justifyContent: "center" },
  hole: { backgroundColor: cafe.hole, borderTopWidth: 2, borderColor: cafe.holeShadow },
  piece: { borderWidth: 2, borderBottomWidth: 3.5 },
  shine: { position: "absolute", backgroundColor: cafe.shine },
  winRound: { borderRadius: 999, borderWidth: 3, borderColor: cafe.win },
  winSquare: { borderRadius: 12, backgroundColor: cafe.winSoft },
  square: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: cafe.hole, borderRadius: 12, overflow: "hidden" },
  crossBar: { position: "absolute" },
  boxSpot: { position: "absolute", alignItems: "center", justifyContent: "center" },
  box: { borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  lineHit: { position: "absolute", alignItems: "center", justifyContent: "center" },
  lineTrack: { borderRadius: BAR / 2, backgroundColor: cafe.emptyLine, overflow: "hidden" },
  bar: { borderRadius: BAR / 2 },
  dot: { position: "absolute", width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: cafe.line },
  gridLine: { position: "absolute", backgroundColor: cafe.line, opacity: 0.45 },
  point: { position: "absolute", alignItems: "center", justifyContent: "center" },
});
