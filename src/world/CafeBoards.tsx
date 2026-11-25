import { boxEdges, DOTS_BOXES, DOTS_LINES, dotLine, dropRow, gridOf, type CafeBoard, type CafeGameKind, type Side } from "@shared/cafeGames";
import { fonts } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { cafe } from "./palette";

type BoardProps = {
  board: CafeBoard;
  side: Side;
  canMove: boolean;
  onMove: (move: number) => void;
  size: number;
};

const sideOfMark = (mark: number): Side | null => (mark === 1 ? "a" : mark === 2 ? "b" : null);
const colourOf = (mark: number) => (mark === 1 ? cafe.a : cafe.b);
const spots = (cells: readonly number[]) => cells.map((mark, index) => ({ mark, index }));
const owner = (mark: number, side: Side) => {
  const who = sideOfMark(mark);
  return who === null ? "empty" : who === side ? "yours" : "theirs";
};

const FourInARow = ({ board, canMove, onMove, size }: BoardProps) => {
  const { width, height } = gridOf("fourInARow");
  const cell = Math.min(46, Math.floor((size - 12) / width));
  const won = new Set(board.line ?? []);
  return (
    <View style={[styles.frame, styles.row, { padding: 6 }]} testID="cafe-board-fourInARow">
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
            style={({ pressed }) => [{ width: cell }, pressed && styles.pressed]}
          >
            {Array.from({ length: height }, (__, row) => {
              const index = row * width + col;
              const mark = board.cells[index];
              return (
                <View key={row} style={[styles.slot, { width: cell, height: cell }]}>
                  <View
                    style={[
                      styles.disc,
                      { width: cell - 8, height: cell - 8, borderRadius: cell / 2, backgroundColor: mark ? colourOf(mark) : cafe.hole },
                      won.has(index) && styles.winRing,
                      board.last === index && !won.has(index) && styles.lastRing,
                    ]}
                  />
                </View>
              );
            })}
          </Pressable>
        );
      })}
    </View>
  );
};

const TicTacToe = ({ board, side, canMove, onMove, size }: BoardProps) => {
  const cell = Math.min(92, Math.floor((size - 12) / 3));
  const won = new Set(board.line ?? []);
  return (
    <View style={[styles.frame, styles.grid, { width: cell * 3 + 12, padding: 6 }]} testID="cafe-board-ticTacToe">
      {spots(board.cells).map(({ mark, index }) => (
        <Pressable
          key={index}
          onPress={() => onMove(index)}
          disabled={!canMove || mark !== 0}
          accessibilityRole="button"
          accessibilityLabel={`Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}, ${owner(mark, side)}`}
          testID={`cafe-cell-${index}`}
          style={({ pressed }) => [styles.square, { width: cell, height: cell }, won.has(index) && { backgroundColor: cafe.win }, pressed && styles.pressed]}
        >
          {mark ? <Text style={[styles.mark, { fontSize: cell * 0.6, color: colourOf(mark) }]}>{mark === 1 ? "✕" : "◯"}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
};

const DOT = 10;
const HIT = 26;
const BAR = 6;

const DotsAndBoxes = ({ board, side, canMove, onMove, size }: BoardProps) => {
  const pad = HIT / 2;
  const step = Math.min(68, Math.floor((size - HIT) / DOTS_BOXES));
  const span = step * DOTS_BOXES + HIT;
  return (
    <View style={[styles.frame, { width: span, height: span }]} testID="cafe-board-dotsAndBoxes">
      {spots(board.boxes).map(({ mark, index: box }) => {
        if (!mark) return null;
        const [top] = boxEdges(box);
        const { row, col } = dotLine(top);
        return (
          <View
            key={`box-${box}`}
            style={[styles.box, { left: pad + col * step + 4, top: pad + row * step + 4, width: step - 8, height: step - 8, backgroundColor: mark === 1 ? cafe.aSoft : cafe.bSoft }]}
            accessibilityLabel={`Box ${owner(mark, side)}`}
          />
        );
      })}
      {Array.from({ length: DOTS_LINES }, (_, index) => {
        const { dir, row, col } = dotLine(index);
        const mark = board.cells[index];
        const across = dir === "h";
        const frame = across
          ? { left: pad + col * step + DOT / 2, top: pad + row * step - HIT / 2, width: step - DOT, height: HIT }
          : { left: pad + col * step - HIT / 2, top: pad + row * step + DOT / 2, width: HIT, height: step - DOT };
        return (
          <Pressable
            key={`line-${index}`}
            onPress={() => onMove(index)}
            disabled={!canMove || mark !== 0}
            accessibilityRole="button"
            accessibilityLabel={`${across ? "Across" : "Down"}, row ${row + 1}, column ${col + 1}, ${owner(mark, side)}`}
            testID={`cafe-line-${index}`}
            style={({ pressed }) => [styles.lineHit, frame, pressed && styles.pressed]}
          >
            <View
              style={[
                across ? { width: "100%", height: BAR } : { width: BAR, height: "100%" },
                styles.bar,
                { backgroundColor: mark ? colourOf(mark) : cafe.emptyLine },
                board.last === index && styles.lastBar,
              ]}
            />
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

const FiveInARow = ({ board, side, canMove, onMove, size }: BoardProps) => {
  const { width: n } = gridOf("fiveInARow");
  const cell = Math.floor((size - 8) / n);
  const span = cell * n;
  const won = new Set(board.line ?? []);
  return (
    <View style={[styles.frame, { padding: 4 }]} testID="cafe-board-fiveInARow">
      <View style={{ width: span, height: span }}>
        {Array.from({ length: n }, (_, i) => (
          <View key={`h-${i}`} pointerEvents="none" style={[styles.gridLine, { left: cell / 2, right: cell / 2, top: i * cell + cell / 2, height: 1 }]} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <View key={`v-${i}`} pointerEvents="none" style={[styles.gridLine, { top: cell / 2, bottom: cell / 2, left: i * cell + cell / 2, width: 1 }]} />
        ))}
        {spots(board.cells).map(({ mark, index }) => (
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
              <View
                style={[
                  { width: cell - 4, height: cell - 4, borderRadius: cell / 2, backgroundColor: colourOf(mark) },
                  won.has(index) && styles.winRing,
                  board.last === index && !won.has(index) && styles.lastRing,
                ]}
              />
            ) : null}
          </Pressable>
        ))}
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

const styles = StyleSheet.create({
  frame: { alignSelf: "center", backgroundColor: cafe.board, borderRadius: 16, borderWidth: 2.5, borderColor: cafe.edge },
  row: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  pressed: { opacity: 0.7 },
  slot: { alignItems: "center", justifyContent: "center" },
  disc: {},
  winRing: { borderWidth: 3, borderColor: cafe.win },
  lastRing: { borderWidth: 2, borderColor: cafe.last },
  square: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: cafe.hole, borderRadius: 10 },
  mark: { fontFamily: fonts.display, fontWeight: "900" },
  box: { position: "absolute", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  lineHit: { position: "absolute", alignItems: "center", justifyContent: "center" },
  bar: { borderRadius: BAR / 2 },
  lastBar: { borderWidth: 1.5, borderColor: cafe.last },
  dot: { position: "absolute", width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: cafe.line },
  gridLine: { position: "absolute", backgroundColor: cafe.line, opacity: 0.45 },
  point: { position: "absolute", alignItems: "center", justifyContent: "center" },
});
