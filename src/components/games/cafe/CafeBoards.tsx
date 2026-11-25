import { boxEdges, DOTS_BOXES, DOTS_LINES, dotLine, dropRow, gridOf, type CafeBoard, type CafeGameKind, type Side, type Winner } from "@shared/cafeGames";
import { useEffect, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { useCafeTheme } from "./cafeTheme";

type BoardProps = {
  board: CafeBoard;
  side: Side;
  canMove: boolean;
  onMove: (move: number) => void;
  size: number;
  calm: boolean;
  winner: Winner | null;
  names?: Record<Side, string>;
};

type Point = { x: number; z: number };

const sideOfMark = (mark: number): Side | null => (mark === 1 ? "a" : mark === 2 ? "b" : null);
const spots = (cells: readonly number[]) => cells.map((mark, index) => ({ mark, index }));
const ownerOf = (who: Side | null, side: Side, names?: Record<Side, string>) =>
  who === null ? "empty" : names ? names[who] : who === side ? "yours" : "theirs";
const owner = (mark: number, side: Side, names?: Record<Side, string>) => ownerOf(sideOfMark(mark), side, names);

const DIM = 0.42;
const HALO_STEP_MS = 45;

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

const useDim = (dim: boolean, calm: boolean) => {
  const opacity = useSharedValue(dim ? DIM : 1);
  useEffect(() => {
    const to = dim ? DIM : 1;
    opacity.set(calm ? to : withTiming(to, { duration: 220, easing: Easing.out(Easing.quad) }));
  }, [dim, calm, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.get() }));
};

const Emblem = ({ side, size, colour }: { side: Side; size: number; colour: string }) =>
  side === "a" ? (
    <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size, borderWidth: Math.max(1.6, size * 0.065), borderColor: colour }} />
  ) : (
    <View style={{ width: size * 0.24, height: size * 0.24, borderRadius: 1, backgroundColor: colour, transform: [{ rotate: "45deg" }] }} />
  );

export const CafePiece = ({ side, size }: { side: Side; size: number }) => {
  const tone = useCafeTheme()[side];
  return (
    <View style={[styles.piece, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone.shade }]}>
      <View style={[styles.pieceTop, { width: size - 2, height: size - 2, borderRadius: size / 2, backgroundColor: tone.fill, top: 0, left: 1 }]} />
      <View style={[styles.shine, { width: size * 0.26, height: size * 0.16, borderRadius: size, top: size * 0.13, right: size * 0.15, backgroundColor: tone.hi, transform: [{ rotate: "-24deg" }] }]} />
      <Emblem side={side} size={size} colour={tone.mark} />
    </View>
  );
};

const Halo = ({ order, calm, size, square }: { order: number; calm: boolean; size: number; square?: boolean }) => {
  const c = useCafeTheme();
  const k = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (!calm) k.set(withDelay(order * HALO_STEP_MS, withSequence(withTiming(1.06, { duration: 120 }), withTiming(1, { duration: 80 }))));
  }, [calm, order, k]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, k.get() / 0.92), transform: [{ scale: 0.92 + 0.08 * Math.min(1, k.get()) + (k.get() > 1 ? k.get() - 1 : 0) }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.halo,
        { width: size, height: size, borderRadius: square ? 12 : size / 2, marginLeft: -size / 2, marginTop: -size / 2, borderColor: c.win },
        style,
      ]}
    />
  );
};

const LastRing = ({ size }: { size: number }) => {
  const c = useCafeTheme();
  return <View pointerEvents="none" style={[styles.lastRing, { width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2, borderColor: c.last }]} />;
};

const WinStroke = ({ from, to, calm, thick }: { from: Point; to: Point; calm: boolean; thick: number }) => {
  const c = useCafeTheme();
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const angle = Math.atan2(to.z - from.z, to.x - from.x);
  const grow = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (!calm) grow.set(withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
  }, [calm, grow]);
  const style = useAnimatedStyle(() => ({ width: length * grow.get() }));
  return (
    <View pointerEvents="none" style={[styles.strokeAnchor, { left: from.x, top: from.z, transform: [{ rotate: `${angle}rad` }] }]}>
      <Animated.View style={[styles.stroke, { top: -thick / 2, height: thick, borderRadius: thick / 2, backgroundColor: c.win, opacity: thick > 7 ? 0.45 : 0.95 }, style]} />
    </View>
  );
};

const winStroke = (line: readonly number[] | undefined, centre: (index: number) => Point, calm: boolean, thick: number) =>
  line && line.length > 1 ? <WinStroke from={centre(line[0])} to={centre(line[line.length - 1])} calm={calm} thick={thick} /> : null;

const DroppingDisc = ({ side, size, fall, play, calm }: { side: Side; size: number; fall: number; play: boolean; calm: boolean }) => {
  const y = useEntrance(play, calm, (p) =>
    p.set(
      withSequence(
        withTiming(1, { duration: 110 + (fall / size) * 28, easing: Easing.in(Easing.quad) }),
        withTiming(1.03, { duration: 55, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 55, easing: Easing.in(Easing.quad) })
      )
    )
  );
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (y.get() - 1) * fall }, { scaleY: y.get() >= 1 ? 1 - Math.min(0.06, (y.get() - 1) * 2) : 1 }],
  }));
  return (
    <Animated.View style={style}>
      <CafePiece side={side} size={size} />
    </Animated.View>
  );
};

const Dimmed = ({ dim, calm, children, style }: { dim: boolean; calm: boolean; children: ReactNode; style?: object }) => {
  const fade = useDim(dim, calm);
  return <Animated.View style={[style, fade]}>{children}</Animated.View>;
};

const Wood = ({ radius, top, base }: { radius: number; top: string; base: string }) => (
  <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: base, overflow: "hidden" }]}>
    <View style={[styles.woodTop, { backgroundColor: top }]} />
    <View style={[styles.woodMid, { backgroundColor: top }]} />
  </View>
);

const FourInARow = ({ board, canMove, onMove, size, calm }: BoardProps) => {
  const c = useCafeTheme();
  const { width, height } = gridOf("fourInARow");
  const pad = 12;
  const cell = Math.min(46, Math.floor((size - pad * 2 - 2) / width));
  const disc = Math.round(cell * 0.79);
  const won = board.line ?? [];
  const over = won.length > 0;
  const centre = (index: number) => ({ x: pad + (index % width) * cell + cell / 2, z: pad + Math.floor(index / width) * cell + cell / 2 });
  return (
    <View style={[styles.tray, styles.row, { padding: pad, borderColor: c.rim }]} testID="cafe-board-fourInARow">
      <Wood radius={16} top={c.woodTop} base={c.wood} />
      {winStroke(board.line, centre, calm, 10)}
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
            style={({ pressed }) => [{ width: cell }, styles.column, pressed && { backgroundColor: c.pressed }]}
          >
            {Array.from({ length: height }, (__, row) => {
              const index = row * width + col;
              const side = sideOfMark(board.cells[index]);
              return (
                <View key={row} style={[styles.slot, { width: cell, height: cell }]}>
                  <View style={[styles.well, { width: disc, height: disc, borderRadius: disc / 2, backgroundColor: c.hole, borderColor: c.holeShadow }]} />
                  {side ? (
                    <Dimmed dim={over && !won.includes(index)} calm={calm} style={[StyleSheet.absoluteFill, styles.centre]}>
                      <DroppingDisc side={side} size={disc} fall={(row + 1) * cell} play={board.last === index} calm={calm} />
                    </Dimmed>
                  ) : null}
                </View>
              );
            })}
          </Pressable>
        );
      })}
      {won.map((index, order) => (
        <View key={`halo-${index}`} pointerEvents="none" style={[styles.at, { left: centre(index).x, top: centre(index).z }]}>
          <Halo order={order} calm={calm} size={disc + 6} />
        </View>
      ))}
      {!over && board.last !== undefined ? (
        <View pointerEvents="none" style={[styles.at, { left: centre(board.last).x, top: centre(board.last).z }]}>
          <LastRing size={disc + 5} />
        </View>
      ) : null}
    </View>
  );
};

const Pop = ({ play, calm, children }: { play: boolean; calm: boolean; children: ReactNode }) => {
  const p = useEntrance(play, calm, (v) => v.set(withSpring(1, { damping: 16, stiffness: 280 })));
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, p.get() * 3), transform: [{ scale: 0.72 + 0.28 * p.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
};

const MarkGlyph = ({ side, size }: { side: Side; size: number }) => {
  const ink = useCafeTheme()[side].fill;
  const stroke = 9;
  if (side === "b") return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: ink }} />;
  return (
    <View style={{ width: size, height: size }}>
      {[45, -45].map((turn) => (
        <View
          key={turn}
          style={[styles.crossBar, { width: size * 1.25, height: stroke, borderRadius: stroke, backgroundColor: ink, top: size / 2 - stroke / 2, left: -size * 0.125, transform: [{ rotate: `${turn}deg` }] }]}
        />
      ))}
    </View>
  );
};

const TTT_GAP = 10;

const TicTacToe = ({ board, side, canMove, onMove, size, calm, names }: BoardProps) => {
  const c = useCafeTheme();
  const pad = 12;
  const cell = Math.min(84, Math.floor((size - pad * 2 - TTT_GAP * 2 - 5) / 3));
  const pitch = cell + TTT_GAP;
  const won = board.line ?? [];
  const over = won.length > 0;
  const centre = (index: number) => ({ x: pad + (index % 3) * pitch + cell / 2, z: pad + Math.floor(index / 3) * pitch + cell / 2 });
  return (
    <View style={[styles.tray, { padding: pad, backgroundColor: c.tttBoard, borderColor: c.rim }]} testID="cafe-board-ticTacToe">
      <View style={[styles.grid, { width: cell * 3 + TTT_GAP * 2, gap: TTT_GAP }]}>
        {spots(board.cells).map(({ mark, index }) => {
          const who = sideOfMark(mark);
          return (
            <Pressable
              key={index}
              onPress={() => onMove(index)}
              disabled={!canMove || mark !== 0}
              accessibilityRole="button"
              accessibilityLabel={`Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}, ${owner(mark, side, names)}`}
              testID={`cafe-cell-${index}`}
              style={({ pressed }) => [
                styles.square,
                { width: cell, height: cell, backgroundColor: won.includes(index) ? c.tttWin : c.tttTile, borderColor: won.includes(index) ? c.win : c.tttTileEdge },
                won.includes(index) && styles.squareWon,
                pressed && { opacity: 0.8 },
              ]}
            >
              {who ? (
                <Dimmed dim={over && !won.includes(index)} calm={calm}>
                  <Pop play={board.last === index} calm={calm}>
                    <MarkGlyph side={who} size={cell * 0.46} />
                  </Pop>
                </Dimmed>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {won.map((index, order) => (
        <View key={`halo-${index}`} pointerEvents="none" style={[styles.at, { left: centre(index).x, top: centre(index).z }]}>
          <Halo order={order} calm={calm} size={cell + 2} square />
        </View>
      ))}
      {winStroke(board.line, centre, calm, 6)}
    </View>
  );
};

const PEG = 10.8;
const HIT = 28;
const BAR = 5.5;

const Line = ({ side, across, length, play, calm }: { side: Side; across: boolean; length: number; play: boolean; calm: boolean }) => {
  const c = useCafeTheme();
  const grow = useEntrance(play, calm, (p) => p.set(withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) })));
  const style = useAnimatedStyle(() => (across ? { width: length * grow.get() } : { height: length * grow.get() }));
  return (
    <View style={[across ? { width: length, height: BAR } : { width: BAR, height: length }, styles.lineSlot]}>
      <Animated.View style={[across ? { height: BAR } : { width: BAR }, styles.bar, { backgroundColor: c[side].fill }, style]} />
    </View>
  );
};

const Box = ({ side, size, play, calm, gold, order, dim }: { side: Side; size: number; play: boolean; calm: boolean; gold: boolean; order: number; dim: boolean }) => {
  const c = useCafeTheme();
  const fill = useEntrance(play, calm, (p) => p.set(withDelay(150 + 70, withTiming(1, { duration: 190, easing: Easing.out(Easing.back(1.3)) }))));
  const style = useAnimatedStyle(() => ({ opacity: fill.get(), transform: [{ scale: 0.82 + 0.18 * fill.get() }] }));
  const fade = useDim(dim, calm);
  const k = useSharedValue(gold && !calm ? 0 : 1);
  useEffect(() => {
    if (gold && !calm) k.set(withDelay(Math.min(220, order * 25), withSequence(withTiming(1.02, { duration: 120 }), withTiming(1, { duration: 80 }))));
  }, [gold, calm, order, k]);
  const glow = useAnimatedStyle(() => ({ opacity: gold ? Math.min(1, k.get()) : 0, transform: [{ scale: 0.96 + 0.04 * k.get() }] }));
  return (
    <Animated.View style={fade}>
      <Animated.View style={[styles.box, { width: size, height: size, backgroundColor: c[side].box }, style]}>
        <Emblem side={side} size={size * 0.62} colour={c[side].fill} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.boxGold, { borderColor: c.win }, glow]} />
      </Animated.View>
    </Animated.View>
  );
};

const boxesTouching = (line: number) => {
  const found: number[] = [];
  for (let box = 0; box < DOTS_BOXES * DOTS_BOXES; box++) if (boxEdges(box).includes(line)) found.push(box);
  return found;
};

const DotsAndBoxes = ({ board, side, canMove, onMove, size, calm, winner, names }: BoardProps) => {
  const c = useCafeTheme();
  const pad = 26;
  const step = Math.min(62, Math.floor((size - pad * 2 - 2) / DOTS_BOXES));
  const span = step * DOTS_BOXES + pad * 2;
  const justClosed = board.last === undefined ? [] : boxesTouching(board.last);
  const winMark = winner === "a" ? 1 : winner === "b" ? 2 : 0;
  let goldOrder = 0;
  return (
    <View style={[styles.tray, { width: span + 5, height: span + 5, backgroundColor: c.linen, borderColor: c.rim }]} testID="cafe-board-dotsAndBoxes">
      {spots(board.boxes).map(({ mark, index: box }) => {
        const who = sideOfMark(mark);
        if (!who) return null;
        const [top] = boxEdges(box);
        const { row, col } = dotLine(top);
        const gold = winMark !== 0 && mark === winMark;
        return (
          <View key={`box-${box}`} style={[styles.boxSpot, { left: pad + col * step, top: pad + row * step, width: step, height: step }]} accessibilityLabel={`Box ${owner(mark, side, names)}`}>
            <Box side={who} size={step - 14} play={justClosed.includes(box)} calm={calm} gold={gold} order={gold ? goldOrder++ : 0} dim={winMark !== 0 && !gold} />
          </View>
        );
      })}
      {Array.from({ length: DOTS_LINES }, (_, index) => {
        const { dir, row, col } = dotLine(index);
        const who = sideOfMark(board.cells[index]);
        const across = dir === "h";
        const length = step - PEG;
        const frame = across
          ? { left: pad + col * step + PEG / 2, top: pad + row * step - HIT / 2, width: length, height: HIT }
          : { left: pad + col * step - HIT / 2, top: pad + row * step + PEG / 2, width: HIT, height: length };
        return (
          <Pressable
            key={`line-${index}`}
            onPress={() => onMove(index)}
            disabled={!canMove || who !== null}
            accessibilityRole="button"
            accessibilityLabel={`${across ? "Across" : "Down"}, row ${row + 1}, column ${col + 1}, ${ownerOf(who, side, names)}`}
            testID={`cafe-line-${index}`}
            style={({ pressed }) => [styles.lineHit, frame, pressed && { opacity: 0.6 }]}
          >
            {who ? (
              <>
                {board.last === index && winMark === 0 ? <View style={[styles.lastLine, { backgroundColor: c.win }, across ? { width: length + 4, height: BAR + 5 } : { width: BAR + 5, height: length + 4 }]} /> : null}
                <Line side={who} across={across} length={length} play={board.last === index} calm={calm} />
              </>
            ) : (
              <View style={[across ? { width: length, height: 2 } : { width: 2, height: length }, { backgroundColor: c.emptyEdge }]} />
            )}
          </Pressable>
        );
      })}
      {Array.from({ length: (DOTS_BOXES + 1) * (DOTS_BOXES + 1) }, (_, i) => (
        <View
          key={`peg-${i}`}
          pointerEvents="none"
          style={[styles.peg, { backgroundColor: c.peg, left: pad + (i % (DOTS_BOXES + 1)) * step - PEG / 2, top: pad + Math.floor(i / (DOTS_BOXES + 1)) * step - PEG / 2 }]}
        >
          <View style={[styles.glint, { backgroundColor: c.glint }]} />
        </View>
      ))}
    </View>
  );
};

const STAR_POINTS = [
  [3, 3],
  [3, 9],
  [6, 6],
  [9, 3],
  [9, 9],
] as const;

const FiveInARow = ({ board, side, canMove, onMove, size, calm, names }: BoardProps) => {
  const c = useCafeTheme();
  const { width: n } = gridOf("fiveInARow");
  const pad = 14;
  const cell = Math.floor((size - pad * 2 - 2) / n);
  const span = cell * n;
  const stone = Math.round(cell * 0.84);
  const won = board.line ?? [];
  const over = won.length > 0;
  const centre = (index: number) => ({ x: pad + (index % n) * cell + cell / 2, z: pad + Math.floor(index / n) * cell + cell / 2 });
  return (
    <View style={[styles.tray, { padding: pad, backgroundColor: c.rim, borderColor: c.rim }]} testID="cafe-board-fiveInARow">
      <View pointerEvents="none" style={styles.fiveInset}>
        <Wood radius={15} top={c.fiveWoodTop} base={c.fiveWood} />
      </View>
      {winStroke(board.line, centre, calm, 9)}
      <View style={{ width: span, height: span }}>
        {Array.from({ length: n }, (_, i) => (
          <View key={`h-${i}`} pointerEvents="none" style={[styles.gridLine, { backgroundColor: c.fiveGrid, left: cell / 2, right: cell / 2, top: i * cell + cell / 2 - 0.5, height: 1 }]} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <View key={`v-${i}`} pointerEvents="none" style={[styles.gridLine, { backgroundColor: c.fiveGrid, top: cell / 2, bottom: cell / 2, left: i * cell + cell / 2 - 0.5, width: 1 }]} />
        ))}
        {STAR_POINTS.map(([row, col]) => (
          <View key={`star-${row}-${col}`} pointerEvents="none" style={[styles.star, { backgroundColor: c.fiveGrid, left: col * cell + cell / 2 - 2.6, top: row * cell + cell / 2 - 2.6 }]} />
        ))}
        {spots(board.cells).map(({ mark, index }) => {
          const who = sideOfMark(mark);
          return (
            <Pressable
              key={index}
              onPress={() => onMove(index)}
              disabled={!canMove || mark !== 0}
              accessibilityRole="button"
              accessibilityLabel={`Row ${Math.floor(index / n) + 1}, column ${(index % n) + 1}, ${owner(mark, side, names)}`}
              testID={`cafe-point-${index}`}
              style={[styles.point, { left: (index % n) * cell, top: Math.floor(index / n) * cell, width: cell, height: cell }]}
            >
              {who ? (
                <Dimmed dim={over && !won.includes(index)} calm={calm}>
                  <Pop play={board.last === index} calm={calm}>
                    <CafePiece side={who} size={stone} />
                  </Pop>
                </Dimmed>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {won.map((index, order) => (
        <View key={`halo-${index}`} pointerEvents="none" style={[styles.at, { left: centre(index).x, top: centre(index).z }]}>
          <Halo order={order} calm={calm} size={stone + 5} />
        </View>
      ))}
      {!over && board.last !== undefined ? (
        <View pointerEvents="none" style={[styles.at, { left: centre(board.last).x, top: centre(board.last).z }]}>
          <LastRing size={stone + 4} />
        </View>
      ) : null}
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
  tray: { alignSelf: "center", borderRadius: 18, borderWidth: 2.5, overflow: "hidden" },
  row: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  centre: { alignItems: "center", justifyContent: "center" },
  at: { position: "absolute", width: 0, height: 0 },
  woodTop: { position: "absolute", left: 0, right: 0, top: 0, height: "38%", opacity: 0.9 },
  woodMid: { position: "absolute", left: 0, right: 0, top: "38%", height: "24%", opacity: 0.45 },
  fiveInset: { position: "absolute", left: 3, top: 3, right: 3, bottom: 3, borderRadius: 15, overflow: "hidden" },
  column: { borderRadius: 12 },
  slot: { alignItems: "center", justifyContent: "center" },
  well: { borderTopWidth: 2 },
  piece: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pieceTop: { position: "absolute" },
  shine: { position: "absolute", opacity: 0.55 },
  halo: { position: "absolute", left: 0, top: 0, borderWidth: 3 },
  lastRing: { position: "absolute", left: 0, top: 0, borderWidth: 2.2 },
  strokeAnchor: { position: "absolute", width: 0, height: 0, transformOrigin: "0% 50%" },
  stroke: { position: "absolute", left: 0 },
  square: { alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1.5 },
  squareWon: { borderWidth: 2.5 },
  crossBar: { position: "absolute" },
  boxSpot: { position: "absolute", alignItems: "center", justifyContent: "center" },
  box: { borderRadius: 10, alignItems: "center", justifyContent: "center" },
  boxGold: { borderRadius: 10, borderWidth: 2.5 },
  lineHit: { position: "absolute", alignItems: "center", justifyContent: "center" },
  lineSlot: { overflow: "hidden", borderRadius: BAR / 2 },
  lastLine: { position: "absolute", borderRadius: 6, opacity: 0.45 },
  bar: { borderRadius: BAR / 2 },
  peg: { position: "absolute", width: PEG, height: PEG, borderRadius: PEG / 2 },
  glint: { position: "absolute", width: 3, height: 3, borderRadius: 1.5, right: 2, top: 2, opacity: 0.55 },
  gridLine: { position: "absolute" },
  star: { position: "absolute", width: 5.2, height: 5.2, borderRadius: 2.6 },
  point: { position: "absolute", alignItems: "center", justifyContent: "center" },
});
