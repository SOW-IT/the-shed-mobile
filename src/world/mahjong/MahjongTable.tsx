import { fonts } from "@/theme";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { isMahjongTable, MAHJONG_TABLE_NAMES } from "@shared/mahjong/table";
import { BUBBLE_MS, EMOTE_MS, EMOTES, isEmote, type Look } from "@shared/world";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ViewInstance } from "react-native";
import type { Move } from "@shared/mahjong/play";
import type { HandView, MeldView, SeatView as HandSeat } from "@shared/mahjong/view";
import { gradientStyle } from "@/components/ui/Grid";
import { FocusedStatusBar } from "@/components/games/FocusedStatusBar";
import { useHideAppChrome } from "@/components/nav/appChrome";
import { glass, hud, mahjong as m } from "../palette";
import { blurBehind, itemStyle, popStyle, scrimStyle, useOverlayClock } from "../Overlays";
import { Row, Toggle } from "../SettingsPanel";
import { SeatFace } from "./Faces";
import { claimChoices, claimUses, coinsWords, dealtCount, firstClaim, handRows, INTRO, introElapsed, faanLine, leaveQuestion, resultTitle, roundWords, secondsLeft, tileLabel, windBadge, windWords, zoomShown } from "./tableWords";
import { Tile, TILE_RATIO, TileLabels } from "./Tile";
import { pointsOnly } from "@shared/mahjong/coins";
import { Arrive, Glow, Punch, useBeat } from "./Motion";
import type { SharedValue } from "react-native-reanimated";
import { Intro } from "./Intro";
import { handInTwoRows, useBatterySaver, useWorldSetting } from "../settings";
import type { MahjongSeatView } from "./useMahjong";
import { ACROSS_SEAT_HEIGHT, acrossHeightOf, acrossRows, CENTRE, DRAWN_GAP, HAND_GAP, MELD_GAP, meldOrder, meldRun, meldSize, PAD, pileCap, pileSizes, RIVER_GAP, SIDE_COLUMN, sideSpot, TABLE_GAP, tableLayout, type PileCounts } from "./layout";
import { isSlideDown, isSlideUp, slideSoFar, startsScrub, startsSlide, tileUnder, type TileRect } from "./tap";

type Person = { memberId: string; look: Look; say?: { text: string; at: number }; act?: { emote: string; at: number } };
type Settled = { deltas: number[]; fromBank: number[] } | null;

type TableProps = {
  table: string;
  seats: readonly MahjongSeatView[];
  hand: HandView;
  settled: Settled;
  handNo: number;
  /** Your seat, or null when watching. */
  mySeat: number | null;
  people: readonly Person[];
  muted: ReadonlySet<string>;
  now: number;
  nameOf: (name: string) => string;
  top: number;
  /** Room kept at the bottom for the World's chat bar. */
  bottom: number;
  busy: boolean;
  forCoins: boolean;
  minFaan: number;
  turnSeconds: number;
  claimSeconds: number;
  giveUpCost: number;
  chatLog: ReactNode;
  onMove: (move: Move) => void;
  onAgain: () => void;
  onLeave: () => void;
};

const seatName = (seat: MahjongSeatView, nameOf: (n: string) => string) => (seat.isMe ? "You" : seat.kind === "empty" ? "Empty" : nameOf(seat.name));

/** The name on a seat at the table: while someone's away it's the bot playing for them. */
const plateName = (seat: MahjongSeatView, nameOf: (n: string) => string) => (!seat.isMe && seat.away && seat.standIn ? nameOf(seat.standIn) : seatName(seat, nameOf));

const faceKind = (seat: MahjongSeatView) => (seat.kind === "human" && seat.away ? "bot" : seat.kind);

/** A seat's chat line and emote, over their face. On the right-hand seat it grows leftward, so it stays on screen. */
const Bubble = ({ text, emote, inward = "right" }: { text: string | null; emote: string | null; inward?: "left" | "right" }) => (
  <>
    {emote ? (
      <Text style={[styles.emote, inward === "left" && styles.emoteLeft]} accessibilityLabel={`Emote ${emote}`}>
        {emote}
      </Text>
    ) : null}
    {text ? (
      <View style={[styles.bubble, inward === "left" ? styles.bubbleLeft : styles.bubbleRight]} testID="mahjong-bubble">
        <Text style={styles.bubbleText} numberOfLines={3}>
          {text}
        </Text>
      </View>
    ) : null}
  </>
);

const keyedMelds = (melds: readonly MeldView[]) => melds.map((meld, i) => ({ meld, key: `${i}:${meld.tiles.map(String).join("-")}${meld.type}` }));

const keyedTiles = (tiles: readonly number[]) => tiles.map((tile, i) => ({ tile, key: tile >= 0 ? `t${tile}` : `h${i}`, end: i === 0 || i === tiles.length - 1 }));


/** A tile turned to face a side seat: `turn` 90 for the seat on your left, -90 for the one on your right. */
const Turned = ({ tile, width, turn, back, lit, testID }: { tile: number; width: number; turn: number; back?: boolean; lit?: boolean; testID?: string }) =>
  turn === 0 ? (
    <Tile tile={tile} width={width} back={back} lit={lit} testID={testID} />
  ) : (
    <View style={{ width: Math.round(width * TILE_RATIO), height: width, alignItems: "center", justifyContent: "center" }}>
      <View style={{ transform: [{ rotate: `${turn}deg` }] }}>
        <Tile tile={tile} width={width} back={back} lit={lit} testID={testID} />
      </View>
    </View>
  );

type MeldSeat = { owner: number; viewer: number; names: readonly string[] };

const meldWords = (meld: MeldView, names: readonly string[]) =>
  `${meld.concealed ? "Concealed " : ""}${meld.type}${meld.from !== null && !meld.concealed ? ` from ${names[meld.from]}` : ""}: ${meld.tiles.map(tileLabel).join(", ")}`;

/** Which way a meld's tiles sit against the meld's line, so a sideways tile lines up with its owner's edge: yours and B's along a row, A's and C's down a column. */
const MELD_EDGE = ["flex-end", "flex-end", "flex-start", "flex-start"] as const;

/**
 * Melds, face up: yours beside your plate, B's along B's row, A's and C's
 * down their columns with each tile turned to its seat (`turn`). A claimed
 * tile lies across the others, on the side of the seat it came from (see
 * meldOrder).
 */
const SeatMelds = ({ melds, size, turn, calm, seat, wrap = false, onOpen, testID }: { melds: readonly MeldView[]; size: number; turn: number; calm: boolean; seat: MeldSeat; wrap?: boolean; onOpen?: (seat: number) => void; testID: string }) => {
  if (melds.length === 0) return null;
  const across = turn === 0;
  const where = (seat.owner - seat.viewer + 4) % 4;
  const style = across ? (wrap ? styles.melds : styles.meldsAcross) : styles.meldsDown;
  // Tapping another seat's melds opens their tiles; the seat's plate is the same button for a screen reader, so the melds keep their own labels.
  return (
    <Pressable onPress={onOpen ? () => onOpen(seat.owner) : undefined} disabled={!onOpen} accessible={false} style={style} testID={testID}>
      {keyedMelds(melds).map(({ meld, key }) => {
        const { tiles, sideways } = meldOrder(meld, seat.owner, seat.viewer);
        return (
          <Arrive key={key} from={{ x: 0, y: across ? (where === 0 ? 40 : 30) : 0 }} scale={1.3} calm={calm}>
            <View style={[across ? styles.meld : styles.meldDown, { alignItems: MELD_EDGE[where] }]} accessible accessibilityLabel={meldWords(meld, seat.names)} testID={`${testID}-${key}`}>
              {keyedTiles(tiles).map(({ tile, key: tileKey, end }, i) => (
                <Turned key={tileKey} tile={tile} width={size} turn={i === sideways ? (across ? 90 : 0) : turn} back={meld.concealed && end && tile >= 0} testID={i === sideways ? `${testID}-sideways` : undefined} />
              ))}
            </View>
          </Arrive>
        );
      })}
    </Pressable>
  );
};

type PlateProps = {
  seat: MahjongSeatView;
  index: number;
  hand: HandView;
  look: Look | null;
  active: boolean;
  concealed: number;
  nameOf: (n: string) => string;
  said: string | null;
  emote: string | null;
  forCoins: boolean;
  vertical: boolean;
  /** Which way the seat's bubble grows: away from the screen's edge. */
  inward?: "left" | "right";  /** Opens this seat's tiles (shown and let go). */
  onOpen: (seat: number) => void;
};

/** A seat's face, name, wind and score, and how many tiles they hold (which the table no longer draws). */
const SeatPlate = ({ seat, index, hand, look, active, concealed, nameOf, said, emote, forCoins, vertical, inward, onOpen }: PlateProps) => {
  const wind = hand.seats[index].wind;
  const name = plateName(seat, nameOf);
  const dealer = index === hand.dealer;
  const away = seat.away ? `, away, ${seat.standIn ? nameOf(seat.standIn) : "a bot"} is playing for ${nameOf(seat.name)}` : "";
  return (
    <Pressable
      onPress={() => onOpen(index)}
      style={({ pressed }) => [vertical ? styles.sideHead : styles.acrossHead, active && styles.seatActive, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${windWords(wind)}${dealer ? ", dealer" : ""}${away}, ${concealed} tiles in hand, ${forCoins ? "coins" : "points"} ${coinsWords(seat.net)}${active ? ", their turn" : ""}. Show their tiles`}
      testID={`mahjong-plate-${index}`}
    >
      <View>
        <SeatFace kind={faceKind(seat)} look={look} name={seat.name} size={vertical ? 26 : 28} />
        <Bubble text={said} emote={emote} inward={inward} />
      </View>
      <View style={vertical ? styles.sideText : null}>
        <Text style={styles.seatName} numberOfLines={1}>
          {name}
        </Text>
        <View style={[styles.badges, vertical && styles.badgesWrap]}>
          <Text style={[styles.wind, dealer && styles.dealer]}>{windBadge(wind)}</Text>
          <Text style={styles.concealed} testID={`mahjong-concealed-${index}`}>{`×${concealed}`}</Text>
          <Text style={[styles.score, seat.net > 0 ? styles.up : seat.net < 0 ? styles.down : null]}>{coinsWords(seat.net)}</Text>
        </View>
      </View>
    </Pressable>
  );
};

/** A tile on its side for A's and C's discards, turned to face them. */
const Upright = ({ tile, width, turn, lit, testID }: { tile: number; width: number; turn: number; lit?: boolean; testID?: string }) => <Turned tile={tile} width={width} turn={turn} lit={lit} testID={testID} />;

type RiverProps = { seat: HandSeat; index: number; name: string; lastDiscard: { seat: number; tile: number } | null; from: boolean; calm: boolean; onOpen: (seat: number) => void };

/** How long a tile takes to fly: drawn into your hand, or thrown into a pile. */
const FLY_MS = 300;
/** Between your plate and melds and your hand, now the action row is gone. */
const HAND_SPACER = 8;

const riverLabel = (name: string, count: number) => `${name === "You" ? "Your" : `${name}'s`} discards, ${count} ${count === 1 ? "tile" : "tiles"}. Show them bigger`;

const isLast = (lastDiscard: RiverProps["lastDiscard"], index: number, tile: number) => lastDiscard !== null && lastDiscard.seat === index && lastDiscard.tile === tile;

/** B's or your discards in the order they were let go, in two rows, the newest lit. */
const AcrossRiver = ({ seat, index, name, lastDiscard, from, calm, onOpen, size, width, height, thrownFrom }: RiverProps & { size: number; width: number; height: number; thrownFrom: { x: number; y: number } }) => {
  const shown = seat.discards.filter((d) => !d.taken);
  const { perRow } = acrossRows(shown.length);
  const rows = [shown.slice(0, perRow), shown.slice(perRow)].filter((row) => row.length > 0);
  return (
    <Pressable onPress={() => onOpen(index)} accessibilityRole="button" accessibilityLabel={riverLabel(name, shown.length)} testID={`mahjong-river-${index}`} style={[styles.river, { width, height }, from && styles.riverFrom]}>
      {rows.map((row, r) => (
        <View key={r === 0 ? "first" : "second"} style={styles.riverRow}>
          {row.map((d) =>
            isLast(lastDiscard, index, d.tile) ? (
              <Arrive key={d.tile} from={thrownFrom} scale={1.4} arc={20} duration={FLY_MS} calm={calm}>
                <Tile tile={d.tile} width={size} lit testID="mahjong-last-discard" />
              </Arrive>
            ) : (
              <Tile key={d.tile} tile={d.tile} width={size} />
            )
          )}
        </View>
      ))}
    </Pressable>
  );
};

/** A's discards running down their columns (from the top), or C's running up (from the bottom), the newest lit. */
const SideRiver = ({ seat, index, name, lastDiscard, from, calm, onOpen, size, width, height, side }: RiverProps & { size: number; width: number; height: number; side: "left" | "right" }) => {
  const shown = seat.discards.filter((d) => !d.taken);
  const turn = side === "left" ? 90 : -90;
  return (
    <Pressable onPress={() => onOpen(index)} accessibilityRole="button" accessibilityLabel={riverLabel(name, shown.length)} testID={`mahjong-river-${index}`} style={[styles.sideRiver, { width, height }, from && styles.riverFrom]}>
      {shown.map((d, i) => {
        const at = sideSpot(i, size, { width, height }, side);
        return (
          <View key={d.tile} style={[styles.spot, { left: at.x, top: at.y }]}>
            {isLast(lastDiscard, index, d.tile) ? (
              <Arrive from={{ x: side === "left" ? -70 : 70, y: 0 }} scale={1.4} arc={20} duration={FLY_MS} calm={calm}>
                <Upright tile={d.tile} width={size} turn={turn} lit testID="mahjong-last-discard" />
              </Arrive>
            ) : (
              <Upright tile={d.tile} width={size} turn={turn} />
            )}
          </View>
        );
      })}
    </Pressable>
  );
};

const Zoom = ({ seat, index, name, hand, lastDiscard, width, concealed, meldSeat, onClose }: { seat: HandSeat; meldSeat: MeldSeat; index: number; name: string; hand: HandView; lastDiscard: { seat: number; tile: number } | null; width: number; concealed: number; onClose: () => void }) => {
  const shown = seat.discards.filter((d) => !d.taken);
  useEscape(onClose);
  return (
    <View style={styles.resultWrap} testID="mahjong-zoom">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" testID="mahjong-zoom-backdrop" />
      <View style={styles.result}>
        <View style={[styles.zoomHead, styles.zoomHeadPad]}>
          <Text style={[styles.resultTitle, styles.zoomTitle]} accessibilityRole="header" numberOfLines={1}>
            {`${name} · ${windBadge(seat.wind)}${index === hand.dealer ? " · dealer" : ""}`}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" testID="mahjong-zoom-close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={m.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.zoomScroll} contentContainerStyle={styles.zoomBody}>
          <Text style={styles.resultNote}>{`${concealed} ${concealed === 1 ? "tile" : "tiles"} in hand · ${seat.melds.length === 0 ? "nothing shown" : `${seat.melds.length} shown`} · ${shown.length} let go`}</Text>
          {seat.melds.length > 0 ? <Text style={styles.zoomLabel}>Shown</Text> : null}
          <SeatMelds melds={seat.melds} size={Math.round(width * 0.8)} turn={0} calm seat={meldSeat} wrap testID="mahjong-zoom-melds" />
          <Text style={styles.zoomLabel}>Let go</Text>
          <View style={styles.zoomTiles} testID="mahjong-zoom-discards">
            {shown.map((d) => (
              <Tile key={d.tile} tile={d.tile} width={width} lit={isLast(lastDiscard, index, d.tile)} />
            ))}
          </View>
          {shown.length === 0 ? <Text style={styles.resultNote}>Nothing let go yet.</Text> : null}
        </ScrollView>
      </View>
    </View>
  );
};

/** PONG!, KONG!, CHOW! and HU!, shouted from the seat that claimed. */
const CALLOUTS = { chow: "CHOW!", pong: "PONG!", kong: "KONG!", hu: "HU!" } as const;
const Callout = ({ hand, names, calm }: { hand: HandView; names: readonly string[]; calm: boolean }) => {
  const last = hand.last;
  if (!last || !(last.kind in CALLOUTS)) return null;
  const word = CALLOUTS[last.kind as keyof typeof CALLOUTS];
  return (
    <View style={styles.calloutWrap} pointerEvents="none">
      <Punch key={last.step} calm={calm}>
        <Text style={[styles.callout, last.kind === "hu" && styles.calloutHu]} testID="mahjong-callout" accessibilityLiveRegion="assertive">
          {word}
        </Text>
        <Text style={styles.calloutWho}>{names[last.seat]}</Text>
      </Punch>
    </View>
  );
};

const Centre = ({ hand, forCoins }: { hand: HandView & { minFaan: number }; forCoins: boolean }) => (
  <View style={[styles.centre, { width: CENTRE }]} testID="mahjong-compass">
    <Text style={styles.centreWind}>{windBadge(hand.roundWind)}</Text>
    <Text style={styles.centreLeft} accessibilityLabel={`${hand.wallLeft} tiles left in the wall`} testID="mahjong-wall-left">
      {hand.wallLeft}
    </Text>
    <Text style={[styles.centreStake, forCoins && styles.centreCoins]} testID="mahjong-stakes" accessibilityLabel={`${forCoins ? "For SOW coins" : "For points"}, ${hand.minFaan} faan to win`}>
      {forCoins ? "🪙" : "pts"}
    </Text>
    <Text style={styles.centreStake}>{`≥${hand.minFaan}`}</Text>
  </View>
);

/**
 * The clock, lying over the top of the chat log rather than taking a row of
 * its own: a bar across the log's top edge that runs down from the right,
 * and the seconds in a small tag at its right end, over the end of the
 * oldest line (the newest is at the log's foot). Whose clock it is shows on
 * the table (the lit seat, or your claim chips) and is read out with it.
 */
const Timer = ({ deadline, total, now, who, mine }: { deadline: number; total: number; now: number; who: string; mine: boolean }) => {
  const left = Math.max(0, Math.min(1, (deadline - now) / total));
  const seconds = secondsLeft(deadline, now);
  return (
    <View style={styles.timer} pointerEvents="none" accessible accessibilityLabel={`${seconds} seconds left, ${who}`} accessibilityLiveRegion={mine && seconds <= 3 ? "polite" : "none"} testID="mahjong-timer">
      <View style={styles.timerTrack}>
        <View style={[styles.timerFill, mine && styles.timerFillMine, { width: `${left * 100}%` }]} />
      </View>
      <View style={styles.timerTag}>
        <Text style={[styles.timerSeconds, mine && styles.timerMine]} testID="mahjong-timer-seconds">{`${seconds}s`}</Text>
      </View>
    </View>
  );
};

const Chip = ({ label, onPress, onFocus, primary = false, lit = false, children, testID, a11y }: { label?: string; onPress: () => void; onFocus?: () => void; primary?: boolean; lit?: boolean; children?: ReactNode; testID: string; a11y?: string }) => (
  <Pressable
    onPress={onPress}
    onPressIn={onFocus}
    onHoverIn={onFocus}
    onFocus={onFocus}
    accessibilityRole="button"
    accessibilityLabel={a11y ?? label}
    testID={testID}
    style={({ pressed }) => [styles.action, primary && styles.actionPrimary, lit && styles.actionLit, pressed && styles.pressed]}
  >
    {label ? <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text> : null}
    {children}
  </Pressable>
);

type Choices = ReturnType<typeof claimChoices>;

/**
 * What you can do right now besides discarding: claim a discard (Chow,
 * Pong, Kong, Hu or Pass, or let the clock run out), or win or kong on your
 * turn. The chips float, see-through, over your own discards (never the
 * pile the claimed tile is in), so they take no row of their own.
 */
const Actions = ({ hand, mySeat, choices, focus, busy, onFocus, onMove }: { hand: HandView; mySeat: number; choices: Choices | null; focus: string | null; busy: boolean; onFocus: (key: string) => void; onMove: (move: Move) => void }) => {
  const mine = hand.mine;
  const stage = hand.stage;
  if (!mine || busy) return null;
  if (stage.kind === "claim" && choices) {
    return (
      <View style={styles.actionRow} testID="mahjong-claim" accessibilityLiveRegion="polite">
        {choices.map((c) => (
          <Chip
            key={c.key}
            label={c.tiles ? undefined : c.label}
            primary={c.answer.kind === "hu"}
            lit={focus === c.key}
            onFocus={() => onFocus(c.key)}
            onPress={() => onMove({ kind: "answer", answer: c.answer })}
            testID={`mahjong-claim-${c.key}`}
            a11y={c.tiles ? `Chow with ${c.tiles.map(tileLabel).join(", ")}` : c.label}
          >
            {c.tiles ? (
              <View style={styles.chowTiles}>
                <Text style={styles.actionText}>Chow</Text>
                {c.tiles.map((tile) => (
                  <Tile key={tile} tile={tile} width={14} lit={tile === stage.tile} />
                ))}
              </View>
            ) : null}
          </Chip>
        ))}
      </View>
    );
  }
  if (stage.kind === "turn" && stage.seat === mySeat && (mine.win || mine.kongs.length > 0)) {
    return (
      <View style={styles.actionRow} testID="mahjong-turn-actions">
        {mine.win ? <Chip label={`Hu · ${mine.win.faan} faan`} primary onPress={() => onMove({ kind: "win" })} testID="mahjong-self-win" /> : null}
        {mine.kongs.map((kind) => (
          <Chip key={kind} onPress={() => onMove({ kind: "kong", tileKind: kind })} testID={`mahjong-kong-${kind}`} a11y={`Kong ${tileLabel(kind * 4)}`}>
            <View style={styles.chowTiles}>
              <Text style={styles.actionText}>Kong</Text>
              <Tile tile={kind * 4} width={14} />
            </View>
          </Chip>
        ))}
      </View>
    );
  }
  return null;
};

/**
 * One tile of your hand. On your turn (`beat`) each tile glows, flashing
 * with the beat, so the whole hand says it's your go; the drawn tile keeps
 * its lit edge on top of that, and the picked one its own bigger glow.
 */
const HandTile = ({ tile, width, lifted, lit, enabled, drawn, drawnFrom, dealing, calm, onTap, onSlide, onSlideDown, beat }: { tile: number; width: number; lifted: boolean; lit: boolean; enabled: boolean; drawn: boolean; drawnFrom: { x: number; y: number }; dealing: boolean; calm: boolean; onTap: () => void; onSlide: () => void; onSlideDown: () => void; beat: SharedValue<number> | null }) => {
  const [lift] = useState(() => new Animated.Value(0));
  const taken = useRef({ dx: 0, dy: 0 });
  const live = useRef({ enabled, onSlide, onSlideDown });
  useEffect(() => {
    live.current = { enabled, onSlide, onSlideDown };
  });
  // eslint-disable-next-line react-hooks/refs -- the ref is read only inside the gesture callbacks, never while rendering
  const [responder] = useState(() =>
    PanResponder.create({
      // Up or down, a slide is the tile's: a slide down must never end as a tap, which on a picked tile would discard it.
      onMoveShouldSetPanResponderCapture: (_, g) => {
        const takes = live.current.enabled && startsSlide(g.dx, g.dy);
        // The responder counts from here once it has the touch; keep how far the slide had already gone.
        if (takes) taken.current = { dx: g.dx, dy: g.dy };
        return takes;
      },
      onPanResponderMove: (_, g) => lift.setValue(Math.min(0, slideSoFar(taken.current, g).dy)),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        lift.setValue(0);
        if (!live.current.enabled) return;
        const { dx, dy } = slideSoFar(taken.current, g);
        if (isSlideUp(dx, dy)) live.current.onSlide();
        else if (isSlideDown(dx, dy)) live.current.onSlideDown();
      },
      onPanResponderTerminate: () => lift.setValue(0),
    })
  );
  return (
    <Arrive from={drawn ? drawnFrom : dealing ? { x: 0, y: -90 } : { x: 0, y: 0 }} scale={drawn ? 0.7 : 1} duration={drawn ? FLY_MS : 240} calm={calm || (!drawn && !dealing)} style={{ ...(drawn ? { marginLeft: DRAWN_GAP } : {}), ...(lifted ? { zIndex: 2 } : {}) }}>
      <Animated.View style={{ transform: [{ translateY: lift }] }} {...responder.panHandlers}>
        {beat && !lifted ? <Glow beat={beat} style={{ ...styles.turnGlow, borderRadius: Math.max(3, width * 0.2) }} testID="mahjong-turn-glow" /> : null}
        <Tile tile={tile} width={width} lifted={lifted} lit={lit} onPress={enabled ? onTap : undefined} testID={`mahjong-tile-${tile}`} />
      </Animated.View>
    </Arrive>
  );
};

type Box = { x: number; y: number; width: number; height: number };
type HandShape = { rows: readonly (readonly number[])[]; size: number; drawn: number | null };

/**
 * Scrubbing along your hand: a sideways drag owns the touch (a tile's own
 * up or down slide never starts), and picks whichever tile is under the
 * finger as it goes, one at a time. Lifting keeps that tile picked, as a tap
 * would; lifting off the hand keeps the last tile the finger was on.
 *
 * Each row is measured on screen when a drag starts, and its tiles are laid
 * out the way the row lays them (centred, a point apart, the drawn tile set
 * off), since on the web a tile's onLayout doesn't fire when it only moves.
 * The measurement comes back later, so the tile under the finger is picked
 * again once it's in, in case the hand had moved since the last one.
 */
const useScrub = (shape: HandShape, onPick: (tile: number) => void, enabled: boolean) => {
  const rowViews = useRef<(ViewInstance | null)[]>([]);
  const rowBoxes = useRef<Box[]>([]);
  const live = useRef({ shape, onPick, enabled });
  const finger = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    live.current = { shape, onPick, enabled };
  });
  const measure = () =>
    rowViews.current.forEach((view, r) =>
      view?.measureInWindow((x, y, width, height) => {
        rowBoxes.current[r] = { x, y, width, height };
        if (finger.current) pickAt(finger.current.x, finger.current.y);
      })
    );
  const rects = (): TileRect[] => {
    const { rows, size, drawn } = live.current.shape;
    const height = Math.round(size * TILE_RATIO);
    return rows.flatMap((row, r) => {
      const box = rowBoxes.current[r];
      if (!box) return [];
      const lead = (tile: number) => (tile === drawn ? DRAWN_GAP : 0);
      const content = row.reduce((sum, tile) => sum + size + lead(tile), 0) + Math.max(0, row.length - 1) * HAND_GAP;
      let x = box.x + (box.width - content) / 2;
      return row.map((tile) => {
        x += lead(tile);
        const rect = { tile, x, y: box.y + box.height - height, width: size, height };
        x += size + HAND_GAP;
        return rect;
      });
    });
  };
  const pickAt = (pageX: number, pageY: number) => {
    finger.current = { x: pageX, y: pageY };
    const tile = tileUnder(rects(), pageX, pageY);
    if (tile !== null) live.current.onPick(tile);
  };
  // eslint-disable-next-line react-hooks/refs -- the refs are read only inside the gesture callbacks, never while rendering
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => live.current.enabled && startsScrub(g.dx, g.dy),
      onPanResponderGrant: (_, g) => {
        measure();
        pickAt(g.x0, g.y0);
      },
      onPanResponderMove: (_, g) => pickAt(g.moveX, g.moveY),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        finger.current = null;
      },
      onPanResponderTerminate: () => {
        finger.current = null;
      },
    })
  );
  return {
    handlers: responder.panHandlers,
    measure,
    rowRef: (r: number) => (view: ViewInstance | null) => {
      rowViews.current[r] = view;
    },
  };
};

/** Your own concealed tiles while watching: face down, in a row. */
const Backs = ({ count, width, room }: { count: number; width: number; room: number }) => {
  const size = Math.max(6, Math.min(width, Math.floor(room / Math.max(1, count)) - 1));
  return (
    <View style={styles.backs} accessible accessibilityLabel={`${count} tiles in hand`}>
      {Array.from({ length: count }, (_, i) => (
        <Tile key={i} tile={-1} width={size} back />
      ))}
    </View>
  );
};

const useEscape = (onEscape: () => void) => {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape]);
};

/** The table's options, built like the World's settings: a glass card of rows with switches. */
const TableOptions = ({ open, top, twoRows, rowsMatter, labels, onRows, onLabels, onClose }: { open: boolean; top: number; twoRows: boolean; rowsMatter: boolean; labels: boolean; onRows: (on: boolean) => void; onLabels: (on: boolean) => void; onClose: () => void }) => {
  const overlay = useOverlayClock(open, 3);
  const { width } = useWindowDimensions();
  useEscape(onClose);
  if (!overlay.mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close table options" testID="mahjong-options-close">
        <Animated.View style={[StyleSheet.absoluteFill, styles.optionsScrim, scrimStyle(overlay)]} />
      </Pressable>
      <Animated.View style={[styles.optionsPanel, blurBehind, { top, right: 14, width: Math.min(360, width - 28) }, popStyle(overlay)]} testID="mahjong-options-panel">
        <Animated.View style={[styles.optionsHeader, itemStyle(overlay, 0)]}>
          <View style={styles.optionsGear}>
            <Ionicons name="options" size={18} color={hud.onAccent} />
          </View>
          <Text style={styles.optionsTitle} accessibilityRole="header">
            Table options
          </Text>
          <View style={styles.grow} />
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.optionsClose, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={glass.text} />
          </Pressable>
        </Animated.View>
        <View style={styles.optionsRows}>
          {/* Where a whole hand fits in one row at the bigger size (a tablet, a desktop window), there's nothing to choose. */}
          {rowsMatter ? (
            <Row icon="🀄" title="Bigger hand" note="Your tiles in two rows" style={itemStyle(overlay, 1)}>
              <Toggle on={twoRows} label="Bigger hand in two rows" onChange={onRows} testID="mahjong-option-rows" />
            </Row>
          ) : null}
          <Row icon="🔢" title="Numbers on tiles" note="1–9, E S W N, C F P" style={itemStyle(overlay, 2)}>
            <Toggle on={labels} label="Numbers and letters on tiles" onChange={onLabels} testID="mahjong-option-labels" />
          </Row>
        </View>
      </Animated.View>
    </View>
  );
};

const LeaveConfirm = ({ question, onLeave, onStay }: { question: NonNullable<ReturnType<typeof leaveQuestion>>; onLeave: () => void; onStay: () => void }) => {
  useEscape(onStay);
  return (
    <View style={styles.resultWrap} testID="mahjong-give-up">
      <Pressable style={StyleSheet.absoluteFill} onPress={onStay} accessibilityRole="button" accessibilityLabel="Stay" testID="mahjong-give-up-backdrop" />
      <View style={[styles.result, styles.resultBody]} accessibilityViewIsModal>
        <Text style={styles.resultTitle} accessibilityRole="header">
          {question.title}
        </Text>
        {question.lines.map((line) => (
          <Text key={line} style={styles.confirmText}>
            {line}
          </Text>
        ))}
        <View style={styles.resultButtons}>
          <Chip label={question.leave} onPress={onLeave} testID="mahjong-give-up-confirm" />
          <Chip label="Stay" primary onPress={onStay} testID="mahjong-give-up-stay" />
        </View>
      </View>
    </View>
  );
};

const ResultCard = ({
  hand,
  seats,
  settled,
  mySeat,
  forCoins,
  minFaan,
  nameOf,
  onAgain,
  onLeave,
}: {
  hand: HandView;
  seats: readonly MahjongSeatView[];
  settled: Settled;
  mySeat: number | null;
  forCoins: boolean;
  minFaan: number;
  nameOf: (n: string) => string;
  onAgain: () => void;
  onLeave: () => void;
}) => {
  if (hand.stage.kind !== "over") return null;
  const result = hand.stage.result;
  const names = seats.map((s) => seatName(s, nameOf));
  const me = mySeat === null ? null : seats[mySeat];
  const waiting = seats.filter((s) => s.kind === "human" && !s.ready && !s.isMe && !s.away).map((s) => nameOf(s.name));
  const points = result.kind === "win" ? pointsOnly(result.pays).deltas : [0, 0, 0, 0];
  return (
    <View style={styles.resultWrap} pointerEvents="box-none">
      <ScrollView style={styles.result} contentContainerStyle={styles.resultBody} testID="mahjong-result">
        <Text style={styles.resultTitle} accessibilityRole="header">
          {resultTitle(result, names, mySeat)}
        </Text>
        {result.kind === "win" ? (
          <>
            <View style={styles.winHand}>
              {result.hand.map((tile) => (
                <Tile key={tile} tile={tile} width={22} lit={tile === result.tile} />
              ))}
            </View>
            <View style={styles.faanList}>
              {result.lines.map((line) => {
                const info = faanLine(line.id);
                return (
                  <View key={line.id} style={styles.faanRow} testID={`mahjong-faan-${line.id}`}>
                    <Text style={styles.faanZh}>{info.zh}</Text>
                    <Text style={styles.faanEn}>{info.en}</Text>
                    <Text style={styles.faanValue}>{`${line.faan}`}</Text>
                  </View>
                );
              })}
              <View style={[styles.faanRow, styles.faanTotal]}>
                <Text style={styles.faanEn}>{`${result.faan} faan · ${result.points} points · ${minFaan === 0 ? "chicken hands win here" : `${minFaan} faan to win`}`}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.resultNote}>The wall ran out (流局). Nobody scores, and the deal passes on.</Text>
        )}
        {settled ? (
          <View style={styles.transfers} testID="mahjong-transfers">
            <Text style={styles.transferHead}>{forCoins ? "Points, and SOW coins at 8 points a coin (bots never pay or collect)" : "Points (no coins on this table)"}</Text>
            {seats.map((seat, i) => (
              <View key={windBadge(hand.seats[i].wind)} style={styles.transfer}>
                <Text style={styles.transferName} numberOfLines={1}>
                  {names[i]}
                </Text>
                <Text style={[styles.transferCoins, settled.deltas[i] > 0 ? styles.up : settled.deltas[i] < 0 ? styles.down : null]}>
                  {forCoins ? `${coinsWords(points[i])} pts · ${coinsWords(settled.deltas[i])} 🪙` : coinsWords(settled.deltas[i])}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {mySeat !== null ? (
          <View style={styles.resultButtons}>
            <Chip label={me?.ready ? "Waiting…" : "Play another round"} primary={!me?.ready} onPress={onAgain} testID="mahjong-again" />
            <Chip label="Leave table" onPress={onLeave} testID="mahjong-result-leave" />
          </View>
        ) : null}
        {mySeat !== null && me?.ready && waiting.length > 0 ? <Text style={styles.resultNote}>{`Waiting for ${waiting.join(", ")}`}</Text> : null}
      </ScrollView>
    </View>
  );
};

const freshSay = (say: Person["say"], now: number) => (say && now - say.at < BUBBLE_MS ? say.text : null);
const freshAct = (act: Person["act"], now: number) => (act && now - act.at < EMOTE_MS && isEmote(act.emote) ? EMOTES[act.emote].icon : null);

type Sizes = { key: string; across: number; side: number };

/**
 * The game, full screen over the World: you at the bottom with your hand,
 * B across with their melds along the top, A on your left and C on your
 * right down the sides with their melds (everyone's concealed tiles are a
 * count on their plate), and the four discard piles round the compass. The
 * World's chat log sits under the header with the clock beside it, under ✕.
 * Each seat's bubble and emote show beside them. Watching (no seat), East
 * sits at the bottom and every hand is face down.
 */
export const MahjongTable = ({ table, seats, hand, settled, handNo, mySeat, people, muted, now, nameOf, top, bottom, busy, forCoins, minFaan, turnSeconds, claimSeconds, giveUpCost, chatLog, onMove, onAgain, onLeave }: TableProps) => {
  // The space the table really has (on the web the World sits beside the app's menu), the window's until it's measured.
  const window_ = useWindowDimensions();
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null);
  const screenWidth = space?.width ?? window_.width;
  const screenHeight = space?.height ?? window_.height;
  const [rows, setRows] = useWorldSetting("mahjongRows");
  const [labels, setLabels] = useWorldSetting("mahjongLabels");
  const [options, setOptions] = useState(false);
  const layout = tableLayout(screenWidth, screenHeight);
  // One row whenever the whole hand fits in one at the bigger size; otherwise your choice (two rows by default, but one on a short screen).
  const twoRows = !layout.oneRow && handInTwoRows(rows, screenHeight);
  const handSize = twoRows ? layout.handTwo : layout.hand;
  // Watching, your seat's tiles are a row of backs this wide (or smaller), and the hand keeps only their room.
  const backsSize = Math.round(layout.hand * 0.8);
  const [tableHeight, setTableHeight] = useState(0);
  const calm = useBatterySaver();
  // The table is full screen while it's open: no app sidebar or drawer, and on iPhone no status bar (the layout keeps to the safe area).
  useHideAppChrome(true);
  const viewer = mySeat ?? 0;
  const [chosen, setSelected] = useState<{ tile: number; step: number } | null>(null);
  const [focused, setFocused] = useState<{ key: string; step: number } | null>(null);
  const [confirmingHand, setConfirmingHand] = useState<number | null>(null);
  const [zoom, setZoom] = useState<{ seat: number; hand: number } | null>(null);
  const zoomed = zoom?.hand === handNo ? zoom.seat : null;
  const confirming = confirmingHand === handNo;
  const setConfirming = (on: boolean) => setConfirmingHand(on ? handNo : null);
  const setZoomed = (seat: number | null) => setZoom(seat === null ? null : { seat, hand: handNo });
  const [mineHeight, setMineHeight] = useState(0);
  const stage = hand.stage;
  const myTurn = mySeat !== null && stage.kind === "turn" && stage.seat === mySeat && !busy;
  // Your turn flashes your tiles' glow (steady with battery saver or reduce-motion).
  const beat = useBeat(myTurn, calm);
  const selected = myTurn && chosen?.step === hand.step ? chosen.tile : null;
  const person = (seat: MahjongSeatView) => (seat.member ? people.find((p) => p.memberId === seat.member) : undefined);
  const lookOf = (seat: MahjongSeatView) => person(seat)?.look ?? null;
  const saidOf = (seat: MahjongSeatView) => (seat.member && !muted.has(seat.member) ? freshSay(person(seat)?.say, now) : null);
  const actOf = (seat: MahjongSeatView) => freshAct(person(seat)?.act, now);
  const active = stage.kind === "turn" ? stage.seat : null;
  const deadline = stage.kind === "turn" || stage.kind === "claim" ? stage.deadline : null;
  const lastDiscard = hand.last?.kind === "discard" && hand.last.tile !== undefined ? { seat: hand.last.seat, tile: hand.last.tile } : null;
  const myHand = mySeat === null ? null : hand.seats[mySeat].hand;
  const drawn = hand.mine?.drawn ?? null;
  const sorted = myHand ? [...myHand.filter((t) => t !== drawn), ...(drawn !== null && myHand.includes(drawn) ? [drawn] : [])] : [];
  const intro = stage.kind === "intro" ? introElapsed(stage.until, now) : null;
  const dealing = intro !== null && !calm && intro < INTRO.dealt;
  const handTiles = dealing ? [...sorted].sort((a, b) => ((a * 37) % 136) - ((b * 37) % 136)).slice(0, dealtCount(intro, sorted.length, calm)) : sorted;
  const concealedOf = (seat: number) => (intro === null ? hand.seats[seat].concealed : dealtCount(intro, hand.seats[seat].concealed, calm));
  const names = seats.map((s) => plateName(s, nameOf));
  const right = (viewer + 1) % 4;
  const across = (viewer + 2) % 4;
  const left = (viewer + 3) % 4;
  // A claim offered to you: its buttons, and which one is lit (with the tiles it would take from your hand).
  const choices = mySeat !== null && stage.kind === "claim" && hand.mine?.offer && !hand.mine.answered ? claimChoices(hand.mine.offer, stage.tile) : null;
  const focusKey = focused?.step === hand.step && choices?.some((c) => c.key === focused.key) ? focused.key : (choices && firstClaim(choices)?.key) ?? null;
  const focusChoice = choices?.find((c) => c.key === focusKey) ?? null;
  const claimLit = new Set(focusChoice && stage.kind === "claim" && myHand ? claimUses(focusChoice, myHand, stage.tile) : []);
  const shapeRows = handRows(handTiles, drawn, twoRows);
  const scrub = useScrub(
    { rows: shapeRows, size: handSize, drawn },
    (tile) => {
      if (myTurn && (chosen?.tile !== tile || chosen.step !== hand.step)) setSelected({ tile, step: hand.step });
    },
    myTurn
  );
  const discard = (tile: number) => {
    if (!myTurn) return;
    setSelected(null);
    onMove({ kind: "discard", tile });
  };
  const pick = (tile: number) => {
    if (!myTurn) return;
    if (selected === tile) discard(tile);
    else setSelected({ tile, step: hand.step });
  };
  const question = leaveQuestion(stage.kind, mySeat !== null, forCoins, giveUpCost);
  const leave = () => {
    if (question) setConfirming(true);
    else onLeave();
  };
  const shownZoom = zoomShown(zoomed, stage.kind);
  // Below the across seat: A's and C's columns, and between them B's pile, the middle and yours.
  const region = Math.max(0, tableHeight - ACROSS_SEAT_HEIGHT - TABLE_GAP);
  const shown = (i: number) => hand.seats[i].discards.filter((d) => !d.taken).length;
  const counts: PileCounts = { mine: shown(viewer), across: shown(across), left: shown(left), right: shown(right) };
  const piles = pileSizes({ layout, height: region, counts, cap: pileCap(layout, handSize) });
  // Within a hand the discards only ever shrink, so a claimed tile leaving a pile never makes the rest jump bigger.
  const sizesKey = `${handNo}:${layout.width}:${region}`;
  const [kept, setKept] = useState<Sizes | null>(null);
  const floor = kept?.key === sizesKey ? kept : null;
  const sizes = { across: Math.min(piles.across, floor?.across ?? Infinity), side: Math.min(piles.side, floor?.side ?? Infinity) };
  if (region > 0 && (floor === null || sizes.across < floor.across || sizes.side < floor.side)) setKept({ key: sizesKey, ...sizes });
  const runOf = (i: number) => meldRun(hand.seats[i].melds, i, viewer);
  const melds = meldSize({ layout, height: region, across: runOf(across), left: runOf(left), right: runOf(right) });
  const meldSeat = (owner: number): MeldSeat => ({ owner, viewer, names });
  // Your turn: a light tap on iOS as it starts (once a turn), besides the glow, the pill and the lit drawn tile.
  const turnKey = myTurn ? `${handNo}:${hand.step}` : null;
  useEffect(() => {
    if (turnKey !== null && Platform.OS === "ios") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [turnKey]);
  // B's pile and yours take the height of the size they're drawn at (it may be kept smaller than this split's), and the middle the rest.
  const acrossHeight = acrossHeightOf(sizes.across);
  const middle = Math.max(0, region - 2 * acrossHeight - 2 * TABLE_GAP);
  // Where tiles fly from, roughly: the wall (the compass) for your draw, and each seat for its discard.
  const mineTopHeight = Math.max(44, layout.myMeld * TILE_RATIO + 8);
  const handTop = mineTopHeight + 6 + HAND_SPACER;
  const compassAbove = handTop + acrossHeight + TABLE_GAP + middle / 2 + handSize * 0.5 + (twoRows ? handSize * TILE_RATIO + 4 : 0);
  const lastRow = handRows(handTiles, drawn, twoRows).at(-1) ?? [];
  const lastRowWidth = lastRow.length * (handSize + HAND_GAP) + DRAWN_GAP;
  const drawnFrom = { x: -(lastRowWidth / 2 - handSize / 2), y: -compassAbove };
  const fromSeat = { mine: { x: 0, y: handTop + acrossHeight / 2 }, across: { x: 0, y: -(ACROSS_SEAT_HEIGHT / 2 + acrossHeight / 2) } };
  const plate = (i: number, vertical: boolean) => (
    <SeatPlate seat={seats[i]} index={i} hand={hand} look={lookOf(seats[i])} active={active === i} concealed={concealedOf(i)} nameOf={nameOf} said={saidOf(seats[i])} emote={actOf(seats[i])} forCoins={forCoins} vertical={vertical} inward={i === right ? "left" : "right"} onOpen={setZoomed} />
  );
  const sideSeat = (i: number, turn: number) => (
    <View style={[styles.sideSeat, { height: region }]} testID={`mahjong-player-${i}`}>
      {plate(i, true)}
      <SeatMelds melds={hand.seats[i].melds} size={melds} turn={turn} calm={calm} seat={meldSeat(i)} onOpen={setZoomed} testID={`mahjong-melds-${i}`} />
    </View>
  );
  const riverProps = (i: number) => ({ seat: hand.seats[i], index: i, name: names[i], lastDiscard, from: stage.kind === "claim" && stage.from === i, calm, onOpen: setZoomed });
  const intro_ = stage.kind === "intro";
  const title = `${isMahjongTable(table) ? MAHJONG_TABLE_NAMES[table] : "Mahjong"} · ${roundWords(hand.roundWind)} · Hand ${handNo} · ${turnSeconds}s/${claimSeconds}s`;
  const timerWho = stage.kind === "claim" ? (choices ? "Claim?" : "Claims") : active === null ? "" : active === mySeat ? "You" : names[active];
  const headerBottom = top + 38;
  return (
    <TileLabels.Provider value={labels === "on"}>
    <View
      style={[StyleSheet.absoluteFill, styles.screen, gradientStyle(`radial-gradient(circle at 50% 45%, ${m.feltLight} 0%, ${m.felt} 55%, ${m.feltDark} 100%)`)]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== space?.width || height !== space?.height) setSpace({ width, height });
      }}
      testID={mySeat === null ? "mahjong-watching" : "mahjong-table"}
      accessibilityViewIsModal
    >
      <FocusedStatusBar hidden style="light" animated />
      <View style={[styles.column, { width: layout.width }]}>
        <View style={[styles.header, { paddingTop: top }]}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {mySeat === null ? (
            <View style={styles.watchPill} testID="mahjong-watch-pill">
              <Ionicons name="eye" size={13} color={m.text} />
              <Text style={styles.watchText}>Watching</Text>
            </View>
          ) : null}
          <Pressable onPress={() => setOptions((was) => !was)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Table options" aria-expanded={options} testID="mahjong-options" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="options" size={18} color={m.text} />
          </Pressable>
          <Pressable onPress={leave} hitSlop={8} accessibilityRole="button" accessibilityLabel={mySeat === null ? "Stop watching" : "Leave the table"} testID="mahjong-leave" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={m.text} />
          </Pressable>
        </View>
        <View style={styles.chatLog} pointerEvents="box-none">
          {chatLog}
        </View>
        <View style={styles.table} onLayout={(e) => setTableHeight(Math.floor(e.nativeEvent.layout.height))}>
          <View style={styles.acrossSeat} testID={`mahjong-player-${across}`}>
            {plate(across, false)}
            <SeatMelds melds={hand.seats[across].melds} size={melds} turn={0} calm={calm} seat={meldSeat(across)} onOpen={setZoomed} testID={`mahjong-melds-${across}`} />
          </View>
          {region > 0 ? (
            <View style={[styles.region, { height: region }]}>
              {sideSeat(left, 90)}
              <View style={[styles.centreColumn, { width: layout.centre }]}>
                {intro_ ? <View style={{ height: acrossHeight }} /> : <AcrossRiver {...riverProps(across)} size={sizes.across} width={layout.centre} height={acrossHeight} thrownFrom={fromSeat.across} />}
                <View style={[styles.middle, { height: middle }]}>
                  {intro_ ? <View style={{ width: layout.sideWidth }} /> : <SideRiver {...riverProps(left)} size={sizes.side} width={layout.sideWidth} height={middle} side="left" />}
                  <View style={[styles.centreBox, { width: CENTRE }]}>{intro_ ? null : <Centre hand={{ ...hand, minFaan }} forCoins={forCoins} />}</View>
                  {intro_ ? <View style={{ width: layout.sideWidth }} /> : <SideRiver {...riverProps(right)} size={sizes.side} width={layout.sideWidth} height={middle} side="right" />}
                </View>
                {intro_ ? <View style={{ height: acrossHeight }} /> : <AcrossRiver {...riverProps(viewer)} size={sizes.across} width={layout.centre} height={acrossHeight} thrownFrom={fromSeat.mine} />}
                {mySeat !== null && !intro_ ? (
                  <View style={[styles.actionsOver, { minHeight: acrossHeight }]} pointerEvents="box-none">
                    <Actions hand={hand} mySeat={mySeat} choices={choices} focus={focusKey} busy={busy} onFocus={(key) => setFocused({ key, step: hand.step })} onMove={onMove} />
                  </View>
                ) : null}
              </View>
              {sideSeat(right, -90)}
            </View>
          ) : null}
          {intro_ ? (
            <View style={styles.introOver} pointerEvents="none">
              <Intro dice={hand.dice} breakAt={hand.breakAt} dealer={hand.dealer} dealerName={names[hand.dealer]} until={stage.until} now={now} calm={calm} />
            </View>
          ) : null}
        </View>
        {deadline !== null ? (
          <View style={[styles.timerAt, { top: headerBottom }]} pointerEvents="none">
            <Timer deadline={deadline} total={(stage.kind === "claim" ? claimSeconds : turnSeconds) * 1000} now={now} who={timerWho} mine={myTurn || choices !== null} />
          </View>
        ) : null}
        <View style={[styles.mine, { paddingBottom: bottom }]} onLayout={(e) => setMineHeight(Math.ceil(e.nativeEvent.layout.height))}>
          <View style={[styles.mineTop, { minHeight: Math.max(44, layout.myMeld * TILE_RATIO + 8) }]}>
            <View style={[styles.myPlate, active === viewer && styles.seatActive]} accessible accessibilityLabel={`${names[viewer]}, ${windWords(hand.seats[viewer].wind)}${viewer === hand.dealer ? ", dealer" : ""}, ${forCoins ? "coins" : "points"} ${coinsWords(seats[viewer].net)}`} testID="mahjong-plate-bottom">
              <View>
                <SeatFace kind={faceKind(seats[viewer])} look={lookOf(seats[viewer])} name={seats[viewer].name} size={28} />
                <Bubble text={saidOf(seats[viewer])} emote={actOf(seats[viewer])} />
              </View>
              <Text style={styles.seatName}>{names[viewer]}</Text>
              <Text style={[styles.wind, viewer === hand.dealer && styles.dealer]}>{windBadge(hand.seats[viewer].wind)}</Text>
              <Text style={[styles.score, seats[viewer].net > 0 ? styles.up : seats[viewer].net < 0 ? styles.down : null]}>{coinsWords(seats[viewer].net)}</Text>
            </View>
            <SeatMelds melds={hand.seats[viewer].melds} size={layout.myMeld} turn={0} calm={calm} seat={meldSeat(viewer)} wrap testID="mahjong-melds-bottom" />
          </View>
          <View style={{ height: HAND_SPACER }} />
          {/* Your turn lights your tiles (see HandTile); this wrapper only names it, and is always here so the tiles never remount when it starts. */}
          <View testID={myTurn ? "mahjong-turn" : undefined} accessibilityLabel={myTurn ? "Your turn: tap a tile to pick it, then tap it again or slide it up to discard" : undefined}>
          <View
            onLayout={scrub.measure}
            {...scrub.handlers}
            style={[styles.handRows, { minHeight: mySeat === null ? backsSize * TILE_RATIO + 8 : (twoRows ? 2 : 1) * (handSize * TILE_RATIO + 4) + handSize * 0.5 }]}
            testID="mahjong-hand"
          >
            {mySeat === null ? (
              <View style={styles.hand}>
                <Backs count={concealedOf(viewer)} width={backsSize} room={layout.inner} />
              </View>
            ) : (
              shapeRows.map((row, r) => (
                <View key={r === 0 ? "first" : "second"} ref={scrub.rowRef(r)} style={[styles.hand, { gap: HAND_GAP }]}>
                  {row.map((tile) => (
                    <HandTile
                      key={tile}
                      tile={tile}
                      width={handSize}
                      lifted={selected === tile}
                      lit={claimLit.has(tile) || (myTurn && tile === drawn && selected !== tile)}
                      enabled={myTurn}
                      drawn={tile === drawn}
                      drawnFrom={drawnFrom}
                      dealing={dealing}
                      calm={calm}
                      onTap={() => pick(tile)}
                      onSlide={() => discard(tile)}
                      onSlideDown={() => setSelected(null)}
                      beat={myTurn ? beat : null}
                    />
                  ))}
                </View>
              ))
            )}
          </View>
          </View>
        </View>
      </View>
      <Callout hand={hand} names={names} calm={calm} />
      {shownZoom !== null ? (
        // Above your own pile, never over it: the claim chips float there, and your hand is below, so a popup never gets in the way of claiming or of your turn.
        <View style={[styles.zoomArea, { bottom: mineHeight + acrossHeight + TABLE_GAP }]} pointerEvents="box-none">
          <Zoom seat={hand.seats[shownZoom]} index={shownZoom} name={names[shownZoom]} hand={hand} lastDiscard={lastDiscard} width={layout.zoom} concealed={concealedOf(shownZoom)} meldSeat={meldSeat(shownZoom)} onClose={() => setZoomed(null)} />
        </View>
      ) : null}
      <ResultCard hand={hand} seats={seats} settled={settled} mySeat={mySeat} forCoins={forCoins} minFaan={minFaan} nameOf={nameOf} onAgain={onAgain} onLeave={onLeave} />
      {confirming && question ? (
        <LeaveConfirm
          question={question}
          onStay={() => setConfirming(false)}
          onLeave={() => {
            setConfirming(false);
            onLeave();
          }}
        />
      ) : null}
      <TableOptions open={options} top={headerBottom} twoRows={twoRows} rowsMatter={!layout.oneRow} labels={labels === "on"} onRows={(on) => setRows(on ? "two" : "one")} onLabels={(on) => setLabels(on ? "on" : "off")} onClose={() => setOptions(false)} />
    </View>
    </TileLabels.Provider>
  );
};

const styles = StyleSheet.create({
  screen: { backgroundColor: m.felt, alignItems: "center" },
  column: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: PAD + 4, paddingBottom: 6 },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 15, color: m.text },
  watchPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: m.chip },
  watchText: { fontFamily: fonts.display, fontSize: 13, color: m.text },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: m.chip },
  pressed: { opacity: 0.7 },
  table: { flex: 1, paddingHorizontal: PAD },
  acrossSeat: { height: ACROSS_SEAT_HEIGHT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  acrossHead: { flexDirection: "row", alignItems: "center", gap: 6, padding: 3, borderRadius: 10 },
  region: { marginTop: TABLE_GAP, flexDirection: "row", gap: TABLE_GAP },
  sideSeat: { width: SIDE_COLUMN, alignItems: "center", gap: 6 },
  centreColumn: { gap: TABLE_GAP },
  turnGlow: { position: "absolute", top: -3, left: -3, right: -3, bottom: -3, backgroundColor: m.litSoft, borderWidth: 2, borderColor: m.lit, boxShadow: `0 0 12px 3px ${m.lit}` },
  chatLog: { paddingHorizontal: PAD, minHeight: 8 },
  handRows: { gap: 4, justifyContent: "flex-end", borderRadius: 14, borderWidth: 2, borderColor: "transparent", marginHorizontal: -4, paddingHorizontal: 2, paddingBottom: 2 },
  sideHead: { alignItems: "center", gap: 2, padding: 3, borderRadius: 10, alignSelf: "stretch" },
  sideText: { alignItems: "center" },
  seatActive: { borderColor: m.lit, backgroundColor: m.litSoft },
  seatName: { fontFamily: fonts.display, fontSize: 12, color: m.text, maxWidth: 120 },
  badges: { flexDirection: "row", alignItems: "center", gap: 4 },
  badgesWrap: { flexWrap: "wrap", justifyContent: "center", maxWidth: SIDE_COLUMN - 4 },
  wind: { fontSize: 12, fontWeight: "800", color: m.text, paddingHorizontal: 4, borderRadius: 4, backgroundColor: m.chip, overflow: "hidden" },
  dealer: { backgroundColor: m.characters },
  concealed: { fontSize: 11, fontWeight: "900", color: m.shout, paddingHorizontal: 4, borderRadius: 4, backgroundColor: m.backOrange, overflow: "hidden", fontVariant: ["tabular-nums"] },
  score: { fontSize: 12, fontWeight: "800", color: m.muted, fontVariant: ["tabular-nums"] },
  up: { color: m.gain },
  down: { color: m.lose },
  emote: { position: "absolute", right: -10, top: -10, fontSize: 20 },
  bubble: { position: "absolute", zIndex: 5, bottom: "100%", marginBottom: 4, width: 150, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: m.tile },
  bubbleRight: { left: -6 },
  bubbleLeft: { right: -6 },
  emoteLeft: { right: undefined, left: -10 },
  bubbleText: { fontSize: 12.5, fontWeight: "600", color: m.honour },
  melds: { flexDirection: "row", flexWrap: "wrap", gap: MELD_GAP, justifyContent: "center" },
  meldsAcross: { flexDirection: "row", gap: MELD_GAP, alignItems: "center" },
  meldsDown: { alignItems: "center", gap: MELD_GAP },
  meld: { flexDirection: "row", gap: 1 },
  meldDown: { alignItems: "center", gap: 1 },
  middle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: TABLE_GAP },
  centreBox: { alignItems: "center" },
  introOver: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  river: { gap: RIVER_GAP, justifyContent: "center", borderRadius: 6, alignItems: "center" },
  riverRow: { flexDirection: "row", gap: RIVER_GAP, justifyContent: "center" },
  sideRiver: { borderRadius: 6 },
  spot: { position: "absolute" },
  riverFrom: { backgroundColor: m.litSoft },
  centre: { alignItems: "center", gap: 2, paddingVertical: 6, borderRadius: 12, backgroundColor: m.chip },
  centreWind: { fontSize: 14, fontWeight: "800", color: m.muted },
  centreLeft: { fontFamily: fonts.display, fontSize: 18, color: m.text, fontVariant: ["tabular-nums"] },
  centreStake: { fontSize: 11, fontWeight: "800", color: m.muted },
  centreCoins: { color: m.win },
  timerAt: { position: "absolute", left: PAD, right: PAD },
  timer: { alignItems: "flex-end" },
  timerTrack: { alignSelf: "stretch", height: 4, borderRadius: 2, backgroundColor: m.timerBacking, overflow: "hidden", alignItems: "flex-end" },
  timerFill: { height: 4, borderRadius: 2, backgroundColor: m.muted },
  timerFillMine: { backgroundColor: m.lit },
  timerTag: { marginTop: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, backgroundColor: m.timerBacking },
  timerSeconds: { fontFamily: fonts.display, fontSize: 13, color: m.text, fontVariant: ["tabular-nums"] },
  timerMine: { color: m.lit },
  zoomArea: { position: "absolute", left: 0, right: 0, top: 0 },
  zoomHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  zoomHeadPad: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  zoomScroll: { flexGrow: 0 },
  zoomBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  zoomLabel: { fontSize: 12, fontWeight: "800", color: m.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  zoomTitle: { flex: 1, textAlign: "left" },
  zoomTiles: { flexDirection: "row", flexWrap: "wrap", gap: RIVER_GAP, justifyContent: "center" },
  mine: { gap: 6, paddingHorizontal: PAD },
  mineTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  myPlate: { flexDirection: "row", alignItems: "center", gap: 6, padding: 4, borderRadius: 12, borderWidth: 2, borderColor: m.chip },
  hand: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center" },
  backs: { flexDirection: "row", gap: 1 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6 },
  actionsOver: { position: "absolute", left: 0, right: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 4 },
  action: { height: 30, paddingHorizontal: 10, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: m.overlayChip, borderWidth: 1.5, borderColor: m.muted },
  actionPrimary: { backgroundColor: m.shoutEdge, borderColor: m.lit },
  actionLit: { borderColor: m.lit, backgroundColor: m.litSoft },
  actionText: { fontFamily: fonts.display, fontSize: 13.5, color: m.text },
  actionTextPrimary: { color: m.shout },
  chowTiles: { flexDirection: "row", alignItems: "center", gap: 2 },
  calloutWrap: { position: "absolute", left: 0, right: 0, top: "38%", alignItems: "center" },
  callout: {
    fontFamily: fonts.display,
    fontSize: 44,
    color: m.shout,
    textShadowColor: m.shoutEdge,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
    letterSpacing: 1,
    textAlign: "center",
  },
  calloutHu: { fontSize: 60, color: m.win },
  calloutWho: { fontFamily: fonts.display, fontSize: 16, color: m.text, textAlign: "center" },
  resultWrap: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 16 },
  result: { flexGrow: 0, width: "100%", maxWidth: 400, maxHeight: "80%", borderRadius: 22, backgroundColor: m.feltDark, borderWidth: 2, borderColor: m.lit },
  resultBody: { padding: 16, gap: 12 },
  resultTitle: { fontFamily: fonts.display, fontSize: 21, color: m.win, textAlign: "center" },
  resultNote: { fontSize: 13, fontWeight: "600", color: m.muted, textAlign: "center" },
  confirmText: { fontSize: 14.5, fontWeight: "600", color: m.text, textAlign: "center" },
  winHand: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 1 },
  faanList: { gap: 4 },
  faanRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  faanTotal: { justifyContent: "center", paddingTop: 4, borderTopWidth: 1, borderTopColor: m.muted },
  faanZh: { width: 56, fontSize: 15, fontWeight: "800", color: m.text },
  faanEn: { flex: 1, fontSize: 14, fontWeight: "600", color: m.text },
  faanValue: { fontFamily: fonts.display, fontSize: 15, color: m.win },
  transfers: { gap: 4, padding: 10, borderRadius: 14, backgroundColor: m.chip },
  transferHead: { fontSize: 12, fontWeight: "700", color: m.muted },
  transfer: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  transferName: { flex: 1, fontSize: 14, fontWeight: "700", color: m.text },
  transferCoins: { fontFamily: fonts.display, fontSize: 15, color: m.muted, fontVariant: ["tabular-nums"] },
  resultButtons: { flexDirection: "row", gap: 8, justifyContent: "center", flexWrap: "wrap" },
  optionsScrim: { backgroundColor: glass.scrim },
  optionsPanel: { position: "absolute", borderRadius: 24, backgroundColor: Platform.OS === "web" ? glass.panel : glass.panelSolid, borderWidth: 1.5, borderColor: glass.edge, paddingTop: 12, overflow: "hidden", transformOrigin: "top right" },
  optionsHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 10 },
  optionsGear: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
  optionsTitle: { fontFamily: fonts.display, fontSize: 19, color: glass.text },
  optionsClose: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  optionsRows: { gap: 6, paddingHorizontal: 8, paddingBottom: 10 },
  grow: { flex: 1 },
});
