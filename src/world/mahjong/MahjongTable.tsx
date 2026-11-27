import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { isMahjongTable, MAHJONG_TABLE_NAMES } from "@shared/mahjong/table";
import { BUBBLE_MS, EMOTE_MS, EMOTES, isEmote, type Look } from "@shared/world";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Move } from "@shared/mahjong/play";
import type { HandView, MeldView, SeatView as HandSeat } from "@shared/mahjong/view";
import { gradientStyle } from "@/components/ui/Grid";
import { mahjong as m } from "../palette";
import { SeatFace } from "./Faces";
import { claimChoices, coinsWords, dealtCount, handRows, INTRO, introElapsed, faanLine, leaveQuestion, resultTitle, roundWords, secondsLeft, tileLabel, windBadge, windWords, zoomShown } from "./tableWords";
import { Tile, TILE_RATIO, TileLabels } from "./Tile";
import { pointsOnly } from "@shared/mahjong/coins";
import { Arrive, Punch } from "./Motion";
import { Intro } from "./Intro";
import { useBatterySaver, useWorldSetting } from "../settings";
import type { MahjongSeatView } from "./useMahjong";
import { ACROSS_SEAT_HEIGHT, ACTION_HEIGHT, CENTRE, DRAWN_GAP, HAND_GAP, PAD, RIVER_GAP, riverFit, SIDE_COLUMN, TABLE_GAP, tableLayout, zoneHeight, zonesFor, type Zone } from "./layout";
import { isSlideUp, startsSlideUp } from "./tap";

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

const Bubble = ({ text, emote }: { text: string | null; emote: string | null }) => (
  <>
    {emote ? (
      <Text style={styles.emote} accessibilityLabel={`Emote ${emote}`}>
        {emote}
      </Text>
    ) : null}
    {text ? (
      <View style={styles.bubble}>
        <Text style={styles.bubbleText} numberOfLines={3}>
          {text}
        </Text>
      </View>
    ) : null}
  </>
);

const keyedMelds = (melds: readonly MeldView[]) => melds.map((meld, i) => ({ meld, key: `${i}:${meld.tiles.map(String).join("-")}${meld.type}` }));

const keyedTiles = (tiles: readonly number[]) => tiles.map((tile, i) => ({ tile, key: tile >= 0 ? `t${tile}` : `h${i}`, end: i === 0 || i === tiles.length - 1 }));

const Melds = ({ melds, width, calm, vertical = false, testID }: { melds: readonly MeldView[]; width: number; calm: boolean; vertical?: boolean; testID: string }) => {
  if (melds.length === 0) return null;
  return (
    <View style={[styles.melds, vertical && styles.meldsColumn]} testID={testID}>
      {keyedMelds(melds).map(({ meld, key }) => (
        <Arrive key={key} from={{ x: 0, y: 40 }} scale={1.3} calm={calm}>
          <View style={styles.meld} accessibilityLabel={`${meld.concealed ? "Concealed " : ""}${meld.type}`}>
            {keyedTiles(meld.tiles).map(({ tile, key: tileKey, end }) => (
              <Tile key={tileKey} tile={tile} width={width} back={meld.concealed && end && tile >= 0} lit={tile === meld.claimed} />
            ))}
          </View>
        </Arrive>
      ))}
    </View>
  );
};

type SeatProps = {
  seat: MahjongSeatView;
  index: number;
  hand: HandView;
  look: Look | null;
  active: boolean;
  deadline: number | null;
  now: number;
  concealed: number;
  nameOf: (n: string) => string;
  said: string | null;
  emote: string | null;
  most: number;
  forCoins: boolean;
  vertical: boolean;
  turn: number;
  across: number;
};

type StackItem = { key: string; tile: number; back: boolean; lit: boolean; gap: boolean };

const stackItems = (concealed: number, melds: readonly MeldView[]): StackItem[] => [
  ...Array.from({ length: concealed }, (_, i) => ({ key: `b${i}`, tile: -1, back: true, lit: false, gap: false })),
  ...keyedMelds(melds).flatMap(({ meld, key }) =>
    keyedTiles(meld.tiles).map(({ tile, key: tileKey, end }, j) => ({ key: `${key}:${tileKey}`, tile, back: meld.concealed && end && tile >= 0, lit: tile === meld.claimed, gap: j === 0 }))
  ),
];

const STACK_GAP = 4;

const TileStack = ({ items, length, most, vertical, turn }: { items: readonly StackItem[]; length: number; most: number; vertical: boolean; turn: number }) => {
  const gaps = items.filter((item) => item.gap).length;
  const size = Math.max(6, Math.min(most, Math.floor((length - gaps * STACK_GAP) / Math.max(1, items.length)) - 1));
  return (
    <View style={vertical ? styles.stackDown : styles.stackAcross} accessible accessibilityLabel={`${items.filter((i) => i.tile < 0 && i.back).length} tiles in hand`}>
      {items.map((item) =>
        vertical ? (
          <View key={item.key} style={[{ width: Math.round(size * TILE_RATIO), height: size, alignItems: "center", justifyContent: "center" }, item.gap && { marginTop: STACK_GAP }]}>
            <View style={{ transform: [{ rotate: `${turn}deg` }] }}>
              <Tile tile={item.tile} width={size} back={item.back} lit={item.lit} />
            </View>
          </View>
        ) : (
          <View key={item.key} style={item.gap ? { marginLeft: STACK_GAP } : null}>
            <Tile tile={item.tile} width={size} back={item.back} lit={item.lit} />
          </View>
        )
      )}
    </View>
  );
};

const SeatBlock = ({ seat, index, hand, look, active, deadline, now, concealed, nameOf, said, emote, most, forCoins, vertical, turn, across }: SeatProps) => {
  const wind = hand.seats[index].wind;
  const name = seatName(seat, nameOf);
  const dealer = index === hand.dealer;
  const [length, setLength] = useState(0);
  const items = stackItems(concealed, hand.seats[index].melds);
  return (
    <View style={vertical ? styles.sideSeat : styles.acrossSeat} testID={`mahjong-player-${index}`}>
      <View
        style={[vertical ? styles.sideHead : styles.acrossHead, active && styles.seatActive]}
        accessible
        accessibilityLabel={`${name}, ${windWords(wind)}${dealer ? ", dealer" : ""}${seat.away ? ", away, a bot is playing" : ""}, ${concealed} tiles in hand, ${forCoins ? "coins" : "points"} ${coinsWords(seat.net)}${active ? ", their turn" : ""}`}
      >
        <View>
          <SeatFace kind={seat.kind === "human" && seat.away ? "bot" : seat.kind} look={look} name={seat.name} size={vertical ? 26 : 28} />
          <Bubble text={said} emote={emote} />
        </View>
        <View style={vertical ? styles.sideText : null}>
          <Text style={styles.seatName} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.badges}>
            <Text style={[styles.wind, dealer && styles.dealer]}>{windBadge(wind)}</Text>
            <Text style={[styles.score, seat.net > 0 ? styles.up : seat.net < 0 ? styles.down : null]}>{coinsWords(seat.net)}</Text>
            {active && deadline !== null ? <Text style={styles.seatTime}>{`${secondsLeft(deadline, now)}s`}</Text> : null}
          </View>
        </View>
      </View>
      {vertical ? (
        <View style={styles.stackArea} onLayout={(e) => setLength(Math.floor(e.nativeEvent.layout.height))} testID={`mahjong-melds-${index}`}>
          {length > 0 ? <TileStack items={items} length={length} most={most} vertical turn={turn} /> : null}
        </View>
      ) : (
        <View testID={`mahjong-melds-${index}`}>
          <TileStack items={items} length={across} most={most} vertical={false} turn={0} />
        </View>
      )}
    </View>
  );
};

const Upright = ({ tile, width, sideways, lit, testID }: { tile: number; width: number; sideways: boolean; lit?: boolean; testID?: string }) =>
  sideways ? (
    <View style={{ width: Math.round(width * TILE_RATIO), height: width, alignItems: "center", justifyContent: "center" }}>
      <View style={{ transform: [{ rotate: "90deg" }] }}>
        <Tile tile={tile} width={width} lit={lit} testID={testID} />
      </View>
    </View>
  ) : (
    <Tile tile={tile} width={width} lit={lit} testID={testID} />
  );

/** A seat's discards in the order they were let go, the newest lit. */
const River = ({ seat, index, name, lastDiscard, zone, from, calm, onOpen }: { seat: HandSeat; index: number; name: string; lastDiscard: { seat: number; tile: number } | null; zone: Zone; from: boolean; calm: boolean; onOpen: (seat: number) => void }) => {
  const shown = seat.discards.filter((d) => !d.taken);
  const fit = riverFit(shown.length, zone);
  return (
    <Pressable
      onPress={() => onOpen(index)}
      accessibilityRole="button"
      accessibilityLabel={`${name === "You" ? "Your" : `${name}'s`} discards, ${shown.length} ${shown.length === 1 ? "tile" : "tiles"}. Show them bigger`}
      testID={`mahjong-river-${index}`}
      style={[styles.river, { width: zone.width, height: zoneHeight(zone) }, from && styles.riverFrom]}
    >
      {shown.map((d) =>
        lastDiscard && lastDiscard.seat === index && d.tile === lastDiscard.tile ? (
          <Arrive key={d.tile} from={{ x: 0, y: -40 }} scale={1.6} arc={20} duration={320} calm={calm}>
            <Upright tile={d.tile} width={fit.tile} sideways={zone.sideways} lit testID="mahjong-last-discard" />
          </Arrive>
        ) : (
          <Upright key={d.tile} tile={d.tile} width={fit.tile} sideways={zone.sideways} />
        )
      )}
    </Pressable>
  );
};

const Zoom = ({ seat, index, name, hand, lastDiscard, width, concealed, onClose }: { seat: HandSeat; index: number; name: string; hand: HandView; lastDiscard: { seat: number; tile: number } | null; width: number; concealed: number; onClose: () => void }) => {
  const shown = seat.discards.filter((d) => !d.taken);
  useEscape(onClose);
  return (
    <View style={styles.resultWrap} testID="mahjong-zoom">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" testID="mahjong-zoom-backdrop" />
      <View style={[styles.result, styles.resultBody]}>
        <View style={styles.zoomHead}>
          <Text style={[styles.resultTitle, styles.zoomTitle]} accessibilityRole="header" numberOfLines={1}>
            {`${name} · ${windBadge(seat.wind)}${index === hand.dealer ? " · dealer" : ""}`}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" testID="mahjong-zoom-close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={m.text} />
          </Pressable>
        </View>
        <Text style={styles.resultNote}>{`${concealed} tiles in hand · ${shown.length} let go`}</Text>
        {seat.melds.length > 0 ? <Melds melds={seat.melds} width={Math.round(width * 0.8)} calm testID="mahjong-zoom-melds" /> : null}
        <View style={styles.zoomTiles}>
          {shown.map((d) => (
            <Tile key={d.tile} tile={d.tile} width={width} lit={lastDiscard !== null && lastDiscard.seat === index && d.tile === lastDiscard.tile} />
          ))}
        </View>
        {shown.length === 0 ? <Text style={styles.resultNote}>Nothing let go yet.</Text> : null}
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

const Centre = ({ hand, now, forCoins }: { hand: HandView & { minFaan: number }; now: number; forCoins: boolean }) => {
  const stage = hand.stage;
  const deadline = stage.kind === "turn" || stage.kind === "claim" ? stage.deadline : null;
  return (
    <View style={[styles.centre, { width: CENTRE }]} testID="mahjong-compass">
      <Text style={styles.centreWind}>{windBadge(hand.roundWind)}</Text>
      <Text style={styles.centreLeft} accessibilityLabel={`${hand.wallLeft} tiles left in the wall`} testID="mahjong-wall-left">
        {hand.wallLeft}
      </Text>
      {deadline !== null ? <Text style={styles.centreTime}>{`${secondsLeft(deadline, now)}s`}</Text> : null}
      <Text style={[styles.centreStake, forCoins && styles.centreCoins]} testID="mahjong-stakes" accessibilityLabel={`${forCoins ? "For SOW coins" : "For points"}, ${hand.minFaan} faan to win`}>
        {forCoins ? "🪙" : "pts"}
      </Text>
      <Text style={styles.centreStake}>{`≥${hand.minFaan}`}</Text>
    </View>
  );
};

const Bar = ({ deadline, total, now }: { deadline: number; total: number; now: number }) => (
  <View style={styles.track}>
    <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, (deadline - now) / total)) * 100}%` }]} />
  </View>
);

const Chip = ({ label, onPress, primary = false, children, testID, a11y }: { label?: string; onPress: () => void; primary?: boolean; children?: ReactNode; testID: string; a11y?: string }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={a11y ?? label}
    testID={testID}
    style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && styles.pressed]}
  >
    {label ? <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text> : null}
    {children}
  </Pressable>
);

/** What you can do right now, above your hand: claim a discard (5 seconds, and Pass), or win, kong or discard on your turn. */
const ActionBar = ({ hand, mySeat, selected, now, busy, turnMs, claimMs, onMove }: { hand: HandView; mySeat: number; selected: number | null; now: number; busy: boolean; turnMs: number; claimMs: number; onMove: (move: Move) => void }) => {
  const mine = hand.mine;
  const stage = hand.stage;
  if (!mine || busy) return <View style={styles.actionBar} />;
  if (stage.kind === "claim" && mine.offer && !mine.answered) {
    const choices = claimChoices(mine.offer, stage.tile);
    return (
      <View style={styles.claim} testID="mahjong-claim" accessibilityLiveRegion="polite">
        <View style={styles.actionRow}>
          {choices.map((c) => (
            <Chip key={c.key} label={c.tiles ? undefined : c.label} primary={c.answer.kind === "hu"} onPress={() => onMove({ kind: "answer", answer: c.answer })} testID={`mahjong-claim-${c.key}`} a11y={c.tiles ? `Chow with ${c.tiles.map(tileLabel).join(", ")}` : c.label}>
              {c.tiles ? (
                <View style={styles.chowTiles}>
                  <Text style={styles.actionText}>Chow</Text>
                  {c.tiles.map((tile) => (
                    <Tile key={tile} tile={tile} width={20} lit={tile === stage.tile} />
                  ))}
                </View>
              ) : null}
            </Chip>
          ))}
        </View>
        <Bar deadline={stage.deadline} total={claimMs} now={now} />
      </View>
    );
  }
  if (stage.kind === "turn" && stage.seat === mySeat) {
    return (
      <View style={styles.claim} testID="mahjong-turn">
        <View style={styles.actionRow}>
          {mine.win ? <Chip label={`Hu · ${mine.win.faan} faan`} primary onPress={() => onMove({ kind: "win" })} testID="mahjong-self-win" /> : null}
          {mine.kongs.map((kind) => (
            <Chip key={kind} onPress={() => onMove({ kind: "kong", tileKind: kind })} testID={`mahjong-kong-${kind}`} a11y={`Kong ${tileLabel(kind * 4)}`}>
              <View style={styles.chowTiles}>
                <Text style={styles.actionText}>Kong</Text>
                <Tile tile={kind * 4} width={20} />
              </View>
            </Chip>
          ))}
          <Text style={styles.hint}>{selected === null ? "Your turn: tap a tile, or slide one up to discard" : "Tap it again (or slide it up) to discard"}</Text>
        </View>
        <Bar deadline={stage.deadline} total={turnMs} now={now} />
      </View>
    );
  }
  return <View style={styles.actionBar} />;
};

const HandTile = ({ tile, width, lifted, enabled, drawn, dealing, calm, onTap, onSlide }: { tile: number; width: number; lifted: boolean; enabled: boolean; drawn: boolean; dealing: boolean; calm: boolean; onTap: () => void; onSlide: () => void }) => {
  const [lift] = useState(() => new Animated.Value(0));
  const live = useRef({ enabled, onSlide });
  useEffect(() => {
    live.current = { enabled, onSlide };
  });
  // eslint-disable-next-line react-hooks/refs -- the ref is read only inside the gesture callbacks, never while rendering
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => live.current.enabled && startsSlideUp(g.dx, g.dy),
      onPanResponderMove: (_, g) => lift.setValue(Math.min(0, g.dy)),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        lift.setValue(0);
        if (live.current.enabled && isSlideUp(g.dx, g.dy)) live.current.onSlide();
      },
      onPanResponderTerminate: () => lift.setValue(0),
    })
  );
  return (
    <Arrive from={drawn ? { x: 60, y: -70 } : dealing ? { x: 0, y: -90 } : { x: 0, y: 0 }} scale={drawn ? 1.25 : 1} duration={drawn ? 360 : 240} calm={calm || (!drawn && !dealing)} style={drawn ? { marginLeft: DRAWN_GAP } : undefined}>
      <Animated.View style={{ transform: [{ translateY: lift }] }} {...responder.panHandlers}>
        <Tile tile={tile} width={width} lifted={lifted} onPress={enabled ? onTap : undefined} testID={`mahjong-tile-${tile}`} />
      </Animated.View>
    </Arrive>
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

/**
 * The game, full screen over the World: you at the bottom with your hand,
 * the other three around the table with their World characters (bots with
 * a bot's face), the four discard rivers and the compass in the middle.
 * The World's chat bar stays on top, so chat and emotes work as ever, and
 * each seat's bubble and emote show beside them. Watching (no seat), East
 * sits at the bottom and every hand is face down.
 */
export const MahjongTable = ({ table, seats, hand, settled, handNo, mySeat, people, muted, now, nameOf, top, bottom, busy, forCoins, minFaan, turnSeconds, claimSeconds, giveUpCost, chatLog, onMove, onAgain, onLeave }: TableProps) => {
  const { width: screenWidth } = useWindowDimensions();
  const [rows, setRows] = useWorldSetting("mahjongRows");
  const [labels, setLabels] = useWorldSetting("mahjongLabels");
  const [options, setOptions] = useState(false);
  const twoRows = rows === "two";
  const layout = tableLayout(screenWidth);
  const handSize = rows === "two" ? layout.handTwo : layout.hand;
  const [tableHeight, setTableHeight] = useState(0);
  const zones = zonesFor(layout.across, layout.side, tableHeight);
  const calm = useBatterySaver();
  const viewer = mySeat ?? 0;
  const [chosen, setSelected] = useState<{ tile: number; step: number } | null>(null);
  const [confirmingHand, setConfirmingHand] = useState<number | null>(null);
  const [zoom, setZoom] = useState<{ seat: number; hand: number } | null>(null);
  const zoomed = zoom?.hand === handNo ? zoom.seat : null;
  const confirming = confirmingHand === handNo;
  const setConfirming = (on: boolean) => setConfirmingHand(on ? handNo : null);
  const setZoomed = (seat: number | null) => setZoom(seat === null ? null : { seat, hand: handNo });
  const [mineHeight, setMineHeight] = useState(0);
  const stage = hand.stage;
  const myTurn = mySeat !== null && stage.kind === "turn" && stage.seat === mySeat && !busy;
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
  const names = seats.map((s) => seatName(s, nameOf));
  const right = (viewer + 1) % 4;
  const across = (viewer + 2) % 4;
  const left = (viewer + 3) % 4;
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
  const seatBlock = (i: number, vertical: boolean, turn = 0) => (
    <SeatBlock
      seat={seats[i]}
      index={i}
      hand={hand}
      look={lookOf(seats[i])}
      active={active === i}
      deadline={deadline}
      now={now}
      concealed={concealedOf(i)}
      nameOf={nameOf}
      said={saidOf(seats[i])}
      emote={actOf(seats[i])}
      most={vertical ? layout.sideStack : layout.myMeld}
      forCoins={forCoins}
      vertical={vertical}
      turn={turn}
      across={layout.width - PAD * 2 - 130}
    />
  );
  const river = (i: number, zone: Zone) =>
    stage.kind === "intro" ? (
      <View style={{ width: zone.width, height: zoneHeight(zone) }} />
    ) : (
      <River seat={hand.seats[i]} index={i} name={names[i]} lastDiscard={lastDiscard} zone={zone} from={stage.kind === "claim" && stage.from === i} calm={calm} onOpen={setZoomed} />
    );
  const title = `${isMahjongTable(table) ? MAHJONG_TABLE_NAMES[table] : "Mahjong"} · ${roundWords(hand.roundWind)} · Hand ${handNo} · ${turnSeconds}s/${claimSeconds}s`;
  return (
    <TileLabels.Provider value={labels === "on"}>
    <View style={[StyleSheet.absoluteFill, styles.screen, gradientStyle(`radial-gradient(circle at 50% 45%, ${m.feltLight} 0%, ${m.felt} 55%, ${m.feltDark} 100%)`)]} testID={mySeat === null ? "mahjong-watching" : "mahjong-table"} accessibilityViewIsModal>
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
          <Pressable onPress={() => setOptions((was) => !was)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Table options" accessibilityState={{ expanded: options }} testID="mahjong-options" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="options" size={18} color={m.text} />
          </Pressable>
          <Pressable onPress={leave} hitSlop={8} accessibilityRole="button" accessibilityLabel={mySeat === null ? "Stop watching" : "Leave the table"} testID="mahjong-leave" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={m.text} />
          </Pressable>
        </View>
        {options ? (
          <View style={styles.options} testID="mahjong-options-panel">
            <Pressable onPress={() => setRows(twoRows ? "one" : "two")} accessibilityRole="switch" accessibilityState={{ checked: twoRows }} accessibilityLabel="Bigger hand in two rows" testID="mahjong-option-rows" style={styles.option}>
              <Text style={styles.optionText}>Bigger hand in two rows</Text>
              <Text style={[styles.optionValue, twoRows && styles.optionOn]}>{twoRows ? "On" : "Off"}</Text>
            </Pressable>
            <Pressable onPress={() => setLabels(labels === "on" ? "off" : "on")} accessibilityRole="switch" accessibilityState={{ checked: labels === "on" }} accessibilityLabel="Numbers and letters on tiles" testID="mahjong-option-labels" style={styles.option}>
              <Text style={styles.optionText}>Numbers and letters on tiles (1–9, E S W N, C F P)</Text>
              <Text style={[styles.optionValue, labels === "on" && styles.optionOn]}>{labels === "on" ? "On" : "Off"}</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.chatLog} pointerEvents="box-none">
          {chatLog}
        </View>
        <View style={styles.table} onLayout={(e) => setTableHeight(Math.floor(e.nativeEvent.layout.height))}>
          <View style={{ height: ACROSS_SEAT_HEIGHT }}>{seatBlock(across, false)}</View>
          {river(across, zones.across)}
          <View style={styles.middle}>
            {seatBlock(left, true, 90)}
            {river(left, zones.side)}
            <View style={[styles.centreBox, { width: CENTRE }]}>
              {stage.kind === "intro" ? null : <Centre hand={{ ...hand, minFaan }} now={now} forCoins={forCoins} />}
            </View>
            {river(right, zones.side)}
            {seatBlock(right, true, -90)}
          </View>
          {river(viewer, zones.across)}
          {stage.kind === "intro" ? (
            <View style={styles.introOver} pointerEvents="none">
              <Intro dice={hand.dice} breakAt={hand.breakAt} dealer={hand.dealer} dealerName={names[hand.dealer]} until={stage.until} now={now} calm={calm} />
            </View>
          ) : null}
        </View>
        <View style={[styles.mine, { paddingBottom: bottom }]} onLayout={(e) => setMineHeight(Math.ceil(e.nativeEvent.layout.height))}>
          <View style={[styles.mineTop, { height: 2 * (layout.myMeld * TILE_RATIO + 4) + 4 }]}>
            <View style={[styles.myPlate, active === viewer && styles.seatActive]} accessible accessibilityLabel={`${names[viewer]}, ${windWords(hand.seats[viewer].wind)}${viewer === hand.dealer ? ", dealer" : ""}, ${forCoins ? "coins" : "points"} ${coinsWords(seats[viewer].net)}`} testID="mahjong-plate-bottom">
              <View>
                <SeatFace kind={seats[viewer].kind === "human" && seats[viewer].away ? "bot" : seats[viewer].kind} look={lookOf(seats[viewer])} name={seats[viewer].name} size={28} />
                <Bubble text={saidOf(seats[viewer])} emote={actOf(seats[viewer])} />
              </View>
              <Text style={styles.seatName}>{names[viewer]}</Text>
              <Text style={[styles.wind, viewer === hand.dealer && styles.dealer]}>{windBadge(hand.seats[viewer].wind)}</Text>
              <Text style={[styles.score, seats[viewer].net > 0 ? styles.up : seats[viewer].net < 0 ? styles.down : null]}>{coinsWords(seats[viewer].net)}</Text>
              {active === viewer && deadline !== null ? <Text style={styles.seatTime}>{`${secondsLeft(deadline, now)}s`}</Text> : null}
            </View>
            <Melds melds={hand.seats[viewer].melds} width={layout.myMeld} calm={calm} testID="mahjong-melds-bottom" />
          </View>
          <View style={{ height: mySeat === null ? 8 : ACTION_HEIGHT, justifyContent: "flex-end" }}>{mySeat !== null ? <ActionBar hand={hand} mySeat={mySeat} selected={selected} now={now} busy={busy} turnMs={turnSeconds * 1000} claimMs={claimSeconds * 1000} onMove={onMove} /> : null}</View>
          <View style={[styles.handRows, { minHeight: (twoRows ? 2 : 1) * (handSize * TILE_RATIO + 4) + handSize * 0.4 }]} testID="mahjong-hand">
            {mySeat === null ? (
              <View style={styles.hand}>
                <TileStack items={stackItems(concealedOf(viewer), [])} length={layout.width - PAD * 2} most={Math.round(layout.hand * 0.8)} vertical={false} turn={0} />
              </View>
            ) : (
              handRows(handTiles, drawn, twoRows).map((row) => (
                <View key={row[0] ?? "empty"} style={[styles.hand, { gap: HAND_GAP }]}>
                  {row.map((tile) => (
                    <HandTile key={tile} tile={tile} width={handSize} lifted={selected === tile} enabled={myTurn} drawn={tile === drawn} dealing={dealing} calm={calm} onTap={() => pick(tile)} onSlide={() => discard(tile)} />
                  ))}
                </View>
              ))
            )}
          </View>
        </View>
      </View>
      <Callout hand={hand} names={names} calm={calm} />
      {shownZoom !== null ? (
        <View style={[styles.zoomArea, { bottom: mineHeight }]} pointerEvents="box-none">
          <Zoom seat={hand.seats[shownZoom]} index={shownZoom} name={names[shownZoom]} hand={hand} lastDiscard={lastDiscard} width={layout.zoom} concealed={concealedOf(shownZoom)} onClose={() => setZoomed(null)} />
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
  table: { flex: 1, paddingHorizontal: PAD, gap: TABLE_GAP, justifyContent: "space-between" },
  acrossSeat: { alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, maxHeight: ACROSS_SEAT_HEIGHT },
  acrossHead: { flexDirection: "row", alignItems: "center", gap: 6, padding: 3, borderRadius: 10 },
  sideSeat: { width: SIDE_COLUMN, alignSelf: "stretch", alignItems: "center", gap: 4 },
  stackArea: { flex: 1, alignSelf: "stretch", alignItems: "center" },
  stackDown: { alignItems: "center", gap: 1 },
  stackAcross: { flexDirection: "row", alignItems: "flex-end", gap: 1 },
  options: { marginHorizontal: PAD, marginBottom: 6, padding: 8, gap: 6, borderRadius: 14, backgroundColor: m.feltDark, borderWidth: 1.5, borderColor: m.muted },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 36 },
  optionText: { flex: 1, fontSize: 13.5, fontWeight: "700", color: m.text },
  optionValue: { fontFamily: fonts.display, fontSize: 14, color: m.muted },
  optionOn: { color: m.win },
  chatLog: { paddingHorizontal: PAD, minHeight: 4 },
  handRows: { gap: 4, justifyContent: "flex-end" },
  sideHead: { alignItems: "center", gap: 2, padding: 3, borderRadius: 10 },
  sideText: { alignItems: "center" },
  seatActive: { borderColor: m.lit, backgroundColor: m.litSoft },
  seatName: { fontFamily: fonts.display, fontSize: 12, color: m.text, maxWidth: 120 },
  seatTime: { fontSize: 12, fontWeight: "800", color: m.lit, fontVariant: ["tabular-nums"] },
  backs: { flexDirection: "row", gap: 1 },
  backsWrap: { flexWrap: "wrap", justifyContent: "center", maxWidth: SIDE_COLUMN - 6 },
  badges: { flexDirection: "row", alignItems: "center", gap: 5 },
  wind: { fontSize: 12, fontWeight: "800", color: m.text, paddingHorizontal: 4, borderRadius: 4, backgroundColor: m.chip, overflow: "hidden" },
  dealer: { backgroundColor: m.characters },
  score: { fontSize: 12, fontWeight: "800", color: m.muted, fontVariant: ["tabular-nums"] },
  up: { color: m.gain },
  down: { color: m.lose },
  emote: { position: "absolute", right: -10, top: -10, fontSize: 20 },
  bubble: { position: "absolute", zIndex: 5, left: -6, bottom: "100%", marginBottom: 4, width: 150, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: m.tile },
  bubbleText: { fontSize: 12.5, fontWeight: "600", color: m.honour },
  melds: { flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "center" },
  meldsColumn: { flexDirection: "column", alignItems: "center", gap: 3 },
  meld: { flexDirection: "row", gap: 1 },
  middle: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: TABLE_GAP },
  centreBox: { alignItems: "center" },
  introOver: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  river: { flexDirection: "row", flexWrap: "wrap", gap: RIVER_GAP, alignContent: "flex-start", justifyContent: "center", borderRadius: 6, alignSelf: "center" },
  riverFrom: { backgroundColor: m.litSoft },
  centre: { alignItems: "center", gap: 2, paddingVertical: 6, borderRadius: 12, backgroundColor: m.chip },
  centreWind: { fontSize: 14, fontWeight: "800", color: m.muted },
  centreLeft: { fontFamily: fonts.display, fontSize: 18, color: m.text, fontVariant: ["tabular-nums"] },
  centreTime: { fontSize: 12, fontWeight: "800", color: m.lit, fontVariant: ["tabular-nums"] },
  centreStake: { fontSize: 11, fontWeight: "800", color: m.muted },
  centreCoins: { color: m.win },
  introBox: { alignItems: "center", justifyContent: "center" },
  zoomArea: { position: "absolute", left: 0, right: 0, top: 0 },
  zoomHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  zoomTitle: { flex: 1, textAlign: "left" },
  zoomTiles: { flexDirection: "row", flexWrap: "wrap", gap: RIVER_GAP, justifyContent: "center" },
  mine: { gap: 6, paddingHorizontal: PAD },
  mineTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  myPlate: { flexDirection: "row", alignItems: "center", gap: 6, padding: 4, borderRadius: 12, borderWidth: 2, borderColor: m.chip },
  hand: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center" },
  actionBar: { minHeight: 8 },
  claim: { gap: 6 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6 },
  action: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: m.chip, borderWidth: 1.5, borderColor: m.muted },
  actionPrimary: { backgroundColor: m.shoutEdge, borderColor: m.lit },
  actionText: { fontFamily: fonts.display, fontSize: 15, color: m.text },
  actionTextPrimary: { color: m.shout },
  chowTiles: { flexDirection: "row", alignItems: "center", gap: 2 },
  hint: { fontSize: 12.5, fontWeight: "700", color: m.muted },
  track: { height: 5, borderRadius: 3, backgroundColor: m.chip, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3, backgroundColor: m.lit },
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
});
