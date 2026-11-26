import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CLAIM_MS, INTRO_MS, TURN_MS } from "@shared/mahjong/game";
import { isMahjongTable, MAHJONG_TABLE_NAMES } from "@shared/mahjong/table";
import { BUBBLE_MS, EMOTE_MS, EMOTES, isEmote, type Look } from "@shared/world";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Move } from "@shared/mahjong/play";
import type { HandView, MeldView, SeatView as HandSeat } from "@shared/mahjong/view";
import { gradientStyle } from "@/components/ui/Grid";
import { mahjong as m } from "../palette";
import { SeatFace } from "./Faces";
import { claimChoices, coinsWords, faanLine, resultTitle, roundWords, secondsLeft, sideOf, windBadge, windWords, type Side } from "./tableWords";
import { Tile, TILE_RATIO } from "./Tile";
import { Arrive, Punch } from "./Motion";
import { dealtCount, INTRO, Intro } from "./Intro";
import { useBatterySaver } from "../settings";
import type { MahjongSeatView } from "./useMahjong";

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
  onMove: (move: Move) => void;
  onAgain: () => void;
  onLeave: () => void;
};

const seatName = (seat: MahjongSeatView, nameOf: (n: string) => string) => (seat.isMe ? "You" : seat.kind === "empty" ? "Empty" : nameOf(seat.name));

const Bubble = ({ text, emote, side }: { text: string | null; emote: string | null; side: Side }) => (
  <>
    {emote ? (
      <Text style={styles.emote} accessibilityLabel={`Emote ${emote}`} testID={`mahjong-emote-${side}`}>
        {emote}
      </Text>
    ) : null}
    {text ? (
      <View style={[styles.bubble, side === "right" ? styles.bubbleRight : side === "left" ? styles.bubbleLeft : side === "top" ? styles.bubbleTop : styles.bubbleBottom]} testID={`mahjong-said-${side}`}>
        <Text style={styles.bubbleText} numberOfLines={3}>
          {text}
        </Text>
      </View>
    ) : null}
  </>
);

/** A seat's face and name, wind, dealer mark and score, lit while it's their turn. */
const Plate = ({
  seat,
  index,
  hand,
  look,
  side,
  active,
  nameOf,
  said,
  emote,
  compact = false,
}: {
  seat: MahjongSeatView;
  index: number;
  hand: HandView;
  look: Look | null;
  side: Side;
  active: boolean;
  nameOf: (n: string) => string;
  said: string | null;
  emote: string | null;
  compact?: boolean;
}) => {
  const wind = hand.seats[index].wind;
  const name = seatName(seat, nameOf);
  return (
    <View
      style={[styles.plate, compact && styles.plateRow, active && styles.plateActive]}
      accessible
      accessibilityLabel={`${name}, ${windWords(wind)}${index === hand.dealer ? ", dealer" : ""}${seat.away ? ", away, a bot is playing" : ""}, score ${coinsWords(seat.net)}${active ? ", their turn" : ""}`}
      testID={`mahjong-plate-${side}`}
    >
      <View>
        <SeatFace kind={seat.kind === "human" && seat.away ? "bot" : seat.kind} look={look} name={seat.name} size={compact ? 34 : 42} />
        <Bubble text={said} emote={emote} side={side} />
      </View>
      <View style={[styles.plateText, compact && styles.plateTextRow]}>
        <Text style={styles.plateName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.badges}>
          <Text style={[styles.wind, index === hand.dealer && styles.dealer]}>{windBadge(wind)}</Text>
          <Text style={[styles.score, seat.net > 0 ? styles.up : seat.net < 0 ? styles.down : null]}>{coinsWords(seat.net)}</Text>
        </View>
      </View>
    </View>
  );
};

/** Which way the middle of the table is from a seat, for things that fly between them. */
const TOWARD_MIDDLE: Record<Side, { x: number; y: number }> = { bottom: { x: 0, y: -1 }, top: { x: 0, y: 1 }, left: { x: 1, y: 0 }, right: { x: -1, y: 0 } };
const fromMiddle = (side: Side, distance: number) => ({ x: TOWARD_MIDDLE[side].x * distance, y: TOWARD_MIDDLE[side].y * distance });

const Melds = ({ melds, flowers, width, side, calm, vertical = false, testID }: { melds: readonly MeldView[]; flowers: readonly number[]; width: number; side: Side; calm: boolean; vertical?: boolean; testID: string }) => {
  if (melds.length === 0 && flowers.length === 0) return null;
  return (
    <View style={[styles.melds, vertical && styles.meldsColumn]} testID={testID}>
      {melds.map((meld) => (
        // A claimed tile moves out of the river into the meld: the meld comes in from the middle.
        <Arrive key={meld.tiles.map(String).join("-") + meld.type} from={fromMiddle(side, 70)} scale={1.3} calm={calm}>
          <View style={styles.meld} accessibilityLabel={`${meld.concealed ? "Concealed " : ""}${meld.type}`}>
            {keyedTiles(meld.tiles).map(({ tile, key, end }) => (
              <Tile key={key} tile={tile} width={width} back={meld.concealed && end && tile >= 0} lit={tile === meld.claimed} />
            ))}
          </View>
        </Arrive>
      ))}
      {flowers.length > 0 ? (
        <View style={styles.meld}>
          {flowers.map((tile) => (
            <Tile key={tile} tile={tile} width={width * 0.85} />
          ))}
        </View>
      ) : null}
    </View>
  );
};

/** Each tile of a meld with a key, and whether it's an end (a concealed kong shows its ends face down). */
const keyedTiles = (tiles: readonly number[]) => tiles.map((tile, i) => ({ tile, key: tile >= 0 ? `t${tile}` : `h${i}`, end: i === 0 || i === tiles.length - 1 }));

const backKeys = (count: number) => Array.from({ length: count }, (_, i) => ({ key: `b${i}`, first: i === 0 }));

const Backs = ({ count, width, vertical }: { count: number; width: number; vertical?: boolean }) => (
  <View style={[styles.backs, vertical && styles.backsColumn]} accessible accessibilityLabel={`${count} tiles in hand`}>
    {backKeys(count).map(({ key, first }) => (
      <View key={key} style={vertical ? { marginTop: first ? 0 : -width * 0.95 } : { marginLeft: first ? 0 : -width * 0.25 }}>
        <Tile tile={-1} width={width} back />
      </View>
    ))}
  </View>
);

/** A seat's discards in the order they were let go, the newest lit. */
const River = ({ seat, last, width, columns, side, calm }: { seat: HandSeat; last: number | null; width: number; columns: number; side: Side; calm: boolean }) => {
  const shown = seat.discards.filter((d) => !d.taken);
  return (
    <View style={[styles.river, { width: columns * (width + 2) }]} testID={`mahjong-river-${side}`}>
      {shown.map((d) =>
        d.tile === last ? (
          // Thrown in from the discarder's side, on a little arc, landing lit.
          <Arrive key={d.tile} from={fromMiddle(side, -110)} scale={1.8} arc={28} duration={340} calm={calm}>
            <Tile tile={d.tile} width={width} lit testID="mahjong-last-discard" />
          </Arrive>
        ) : (
          <Tile key={d.tile} tile={d.tile} width={width} />
        )
      )}
    </View>
  );
};

/** PONG!, KONG!, CHOW! and HU!, shouted from the seat that claimed. */
const CALLOUTS = { chow: "CHOW!", pong: "PONG!", kong: "KONG!", hu: "HU!" } as const;
const Callout = ({ hand, viewer, calm }: { hand: HandView; viewer: number; calm: boolean }) => {
  const last = hand.last;
  if (!last || !(last.kind in CALLOUTS)) return null;
  // A concealed kong (no tile) still shouts, from the seat that made it.
  const word = CALLOUTS[last.kind as keyof typeof CALLOUTS];
  const side = sideOf(last.seat, viewer);
  return (
    <View style={[styles.calloutWrap, styles[`callout_${side}`]]} pointerEvents="none">
      <Punch key={last.step} calm={calm}>
        <Text style={[styles.callout, last.kind === "hu" && styles.calloutHu]} testID="mahjong-callout" accessibilityLiveRegion="assertive">
          {word}
        </Text>
      </Punch>
    </View>
  );
};

const Compass = ({ hand, viewer, now }: { hand: HandView; viewer: number; now: number }) => {
  const stage = hand.stage;
  const active = stage.kind === "turn" ? stage.seat : stage.kind === "claim" ? stage.from : null;
  const deadline = stage.kind === "turn" || stage.kind === "claim" ? stage.deadline : null;
  const at = (seat: number) => sideOf(seat, viewer);
  return (
    <View style={styles.compass} testID="mahjong-compass">
      {[0, 1, 2, 3].map((seat) => (
        <Text key={seat} style={[styles.compassWind, styles[`compass_${at(seat)}`], active === seat && styles.compassLit]}>
          {windBadge(hand.seats[seat].wind)}
        </Text>
      ))}
      <Text style={styles.wallLeft} accessibilityLabel={`${hand.wallLeft} tiles left in the wall`} testID="mahjong-wall-left">
        {hand.wallLeft}
      </Text>
      {deadline !== null ? <Text style={styles.compassTime}>{secondsLeft(deadline, now)}</Text> : null}
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
const ActionBar = ({ hand, mySeat, selected, now, busy, onMove }: { hand: HandView; mySeat: number; selected: number | null; now: number; busy: boolean; onMove: (move: Move) => void }) => {
  const mine = hand.mine;
  const stage = hand.stage;
  if (!mine || busy) return <View style={styles.actionBar} />;
  if (stage.kind === "claim" && mine.offer && !mine.answered) {
    const choices = claimChoices(mine.offer, stage.tile);
    return (
      <View style={styles.claim} testID="mahjong-claim" accessibilityLiveRegion="polite">
        <View style={styles.actionRow}>
          {choices.map((c) => (
            <Chip key={c.key} label={c.tiles ? undefined : c.label} primary={c.answer.kind === "hu"} onPress={() => onMove({ kind: "answer", answer: c.answer })} testID={`mahjong-claim-${c.key}`} a11y={c.tiles ? `Chow with ${c.tiles.length} tiles` : c.label}>
              {c.tiles ? (
                <View style={styles.chowTiles}>
                  <Text style={styles.actionText}>Chow</Text>
                  {c.tiles.map((tile) => (
                    <Tile key={tile} tile={tile} width={16} lit={tile === stage.tile} />
                  ))}
                </View>
              ) : null}
            </Chip>
          ))}
        </View>
        <Bar deadline={stage.deadline} total={CLAIM_MS} now={now} />
      </View>
    );
  }
  if (stage.kind === "turn" && stage.seat === mySeat) {
    return (
      <View style={styles.claim} testID="mahjong-turn">
        <View style={styles.actionRow}>
          {mine.win ? <Chip label={`Hu · ${mine.win.faan} faan`} primary onPress={() => onMove({ kind: "win" })} testID="mahjong-self-win" /> : null}
          {mine.kongs.map((kind) => (
            <Chip key={kind} onPress={() => onMove({ kind: "kong", tileKind: kind })} testID={`mahjong-kong-${kind}`} a11y="Kong">
              <View style={styles.chowTiles}>
                <Text style={styles.actionText}>Kong</Text>
                <Tile tile={kind * 4} width={16} />
              </View>
            </Chip>
          ))}
          <Text style={styles.hint}>{selected === null ? "Your turn: tap a tile to discard" : "Tap it again to discard"}</Text>
        </View>
        <Bar deadline={stage.deadline} total={TURN_MS} now={now} />
      </View>
    );
  }
  return <View style={styles.actionBar} />;
};

const ResultCard = ({
  hand,
  seats,
  settled,
  mySeat,
  nameOf,
  onAgain,
  onLeave,
}: {
  hand: HandView;
  seats: readonly MahjongSeatView[];
  settled: Settled;
  mySeat: number | null;
  nameOf: (n: string) => string;
  onAgain: () => void;
  onLeave: () => void;
}) => {
  if (hand.stage.kind !== "over") return null;
  const result = hand.stage.result;
  const names = seats.map((s) => seatName(s, nameOf));
  const me = mySeat === null ? null : seats[mySeat];
  const waiting = seats.filter((s) => s.kind === "human" && !s.ready && !s.isMe && !s.away).map((s) => nameOf(s.name));
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
                <Tile key={tile} tile={tile} width={20} lit={tile === result.tile} />
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
                <Text style={styles.faanEn}>{`${result.faan} faan · ${result.points} points`}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.resultNote}>The wall ran out (流局). No coins change hands, and the dealer stays.</Text>
        )}
        {settled ? (
          <View style={styles.transfers} testID="mahjong-transfers">
            {seats.map((seat, i) => (
              <View key={windBadge(hand.seats[i].wind)} style={styles.transfer}>
                <Text style={styles.transferName} numberOfLines={1}>
                  {names[i]}
                </Text>
                <Text style={[styles.transferCoins, settled.deltas[i] > 0 ? styles.up : settled.deltas[i] < 0 ? styles.down : null]}>
                  {`${coinsWords(settled.deltas[i])}${settled.fromBank[i] > 0 ? " (bank)" : ""}`}
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
export const MahjongTable = ({ table, seats, hand, settled, handNo, mySeat, people, muted, now, nameOf, top, bottom, busy, onMove, onAgain, onLeave }: TableProps) => {
  const { width } = useWindowDimensions();
  const calm = useBatterySaver();
  const viewer = mySeat ?? 0;
  const [chosen, setSelected] = useState<{ tile: number; step: number } | null>(null);
  const stage = hand.stage;
  const myTurn = mySeat !== null && stage.kind === "turn" && stage.seat === mySeat && !busy;
  // A pick lasts for the turn it was made in.
  const selected = myTurn && chosen?.step === hand.step ? chosen.tile : null;
  const at = (side: Side) => [0, 1, 2, 3].find((s) => sideOf(s, viewer) === side)!;
  const person = (seat: MahjongSeatView) => (seat.member ? people.find((p) => p.memberId === seat.member) : undefined);
  const lookOf = (seat: MahjongSeatView) => person(seat)?.look ?? null;
  const saidOf = (seat: MahjongSeatView) => (seat.member && !muted.has(seat.member) ? freshSay(person(seat)?.say, now) : null);
  const actOf = (seat: MahjongSeatView) => freshAct(person(seat)?.act, now);
  const active = stage.kind === "turn" ? stage.seat : null;
  const lastDiscard = hand.last?.kind === "discard" ? (hand.last.tile ?? null) : null;
  const myHand = mySeat === null ? null : hand.seats[mySeat].hand;
  const drawn = hand.mine?.drawn ?? null;
  const sorted = myHand ? [...myHand.filter((t) => t !== drawn), ...(drawn !== null && myHand.includes(drawn) ? [drawn] : [])] : [];
  // During the deal the hand fills in fours, in the order dealt, then sorts itself.
  const intro = stage.kind === "intro" ? INTRO_MS - Math.max(0, stage.until - now) : null;
  const dealing = intro !== null && !calm && intro < INTRO.dealt;
  const handTiles = dealing ? [...sorted].sort((a, b) => ((a * 37) % 144) - ((b * 37) % 144)).slice(0, dealtCount(intro, sorted.length, calm)) : sorted;
  const concealedOf = (seat: number) => (intro === null ? hand.seats[seat].concealed : dealtCount(intro, hand.seats[seat].concealed, calm));
  const dealerName = seatName(seats[hand.dealer], nameOf);
  const tileWidth = Math.min(32, Math.floor((width - 28) / 14.8));
  const small = Math.max(13, Math.min(18, Math.floor(width / 26)));
  const side = Math.max(11, Math.floor(small * 0.8));
  const pick = (tile: number) => {
    if (!myTurn) return;
    if (selected === tile) {
      setSelected(null);
      onMove({ kind: "discard", tile });
    } else setSelected({ tile, step: hand.step });
  };
  const plate = (seatIndex: number, where: Side, compact = false) => (
    <Plate
      seat={seats[seatIndex]}
      index={seatIndex}
      hand={hand}
      look={lookOf(seats[seatIndex])}
      side={where}
      active={active === seatIndex}
      nameOf={nameOf}
      said={saidOf(seats[seatIndex])}
      emote={actOf(seats[seatIndex])}
      compact={compact}
    />
  );
  const topSeat = at("top");
  const leftSeat = at("left");
  const rightSeat = at("right");
  const title = `${isMahjongTable(table) ? MAHJONG_TABLE_NAMES[table] : "Mahjong"} · ${roundWords(hand.roundWind)} · Hand ${handNo}`;
  return (
    <View style={[StyleSheet.absoluteFill, styles.screen, gradientStyle(`radial-gradient(circle at 50% 45%, ${m.feltLight} 0%, ${m.felt} 55%, ${m.feltDark} 100%)`)]} testID={mySeat === null ? "mahjong-watching" : "mahjong-table"} accessibilityViewIsModal>
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
        <Pressable onPress={onLeave} hitSlop={8} accessibilityRole="button" accessibilityLabel={mySeat === null ? "Stop watching" : "Leave the table"} testID="mahjong-leave" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Ionicons name="close" size={18} color={m.text} />
        </Pressable>
      </View>
      <View style={styles.topSeat}>
        {plate(topSeat, "top", true)}
        <Backs count={concealedOf(topSeat)} width={side} />
        <Melds melds={hand.seats[topSeat].melds} flowers={hand.seats[topSeat].flowers} width={side} side="top" calm={calm} testID="mahjong-melds-top" />
      </View>
      <View style={styles.middle}>
        <View style={styles.sideSeat}>
          {plate(leftSeat, "left")}
          <Backs count={concealedOf(leftSeat)} width={side} vertical />
          <Melds melds={hand.seats[leftSeat].melds} flowers={hand.seats[leftSeat].flowers} width={side} side="left" calm={calm} vertical testID="mahjong-melds-left" />
        </View>
        <View style={styles.centre}>
          <River seat={hand.seats[topSeat]} last={lastDiscard} width={small} columns={6} side="top" calm={calm} />
          <View style={styles.centreRow}>
            <River seat={hand.seats[leftSeat]} last={lastDiscard} width={small} columns={3} side="left" calm={calm} />
            {stage.kind === "intro" ? (
              <Intro dice={hand.dice} breakAt={hand.breakAt} dealer={hand.dealer} dealerName={dealerName} until={stage.until} now={now} calm={calm} />
            ) : (
              <Compass hand={hand} viewer={viewer} now={now} />
            )}
            <River seat={hand.seats[rightSeat]} last={lastDiscard} width={small} columns={3} side="right" calm={calm} />
          </View>
          <River seat={hand.seats[viewer]} last={lastDiscard} width={small} columns={6} side="bottom" calm={calm} />
        </View>
        <View style={styles.sideSeat}>
          {plate(rightSeat, "right")}
          <Backs count={concealedOf(rightSeat)} width={side} vertical />
          <Melds melds={hand.seats[rightSeat].melds} flowers={hand.seats[rightSeat].flowers} width={side} side="right" calm={calm} vertical testID="mahjong-melds-right" />
        </View>
      </View>
      <View style={[styles.mine, { paddingBottom: bottom }]}>
        <View style={styles.mineTop}>
          {plate(viewer, "bottom", true)}
          <Melds melds={hand.seats[viewer].melds} flowers={hand.seats[viewer].flowers} width={Math.round(tileWidth * 0.75)} side="bottom" calm={calm} testID="mahjong-melds-bottom" />
        </View>
        {mySeat !== null ? <ActionBar hand={hand} mySeat={mySeat} selected={selected} now={now} busy={busy} onMove={onMove} /> : null}
        <View style={[styles.hand, { minHeight: tileWidth * TILE_RATIO + tileWidth * 0.4 }]} testID="mahjong-hand">
          {mySeat === null ? (
            <Backs count={concealedOf(viewer)} width={tileWidth * 0.8} />
          ) : (
            handTiles.map((tile) => (
              // A tile drawn from the wall slides in on the right, a little apart; dealt tiles drop in from the middle.
              <Arrive key={tile} from={tile === drawn ? { x: 60, y: -70 } : dealing ? { x: 0, y: -90 } : { x: 0, y: 0 }} scale={tile === drawn ? 1.25 : 1} duration={tile === drawn ? 360 : 240} calm={calm || (tile !== drawn && !dealing)} style={tile === drawn ? styles.drawn : undefined}>
                <Tile tile={tile} width={tileWidth} lifted={selected === tile} onPress={myTurn ? () => pick(tile) : undefined} testID={`mahjong-tile-${tile}`} />
              </Arrive>
            ))
          )}
        </View>
      </View>
      <Callout hand={hand} viewer={viewer} calm={calm} />
      <ResultCard hand={hand} seats={seats} settled={settled} mySeat={mySeat} nameOf={nameOf} onAgain={onAgain} onLeave={onLeave} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { backgroundColor: m.felt },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 15, color: m.text },
  watchPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: m.chip },
  watchText: { fontFamily: fonts.display, fontSize: 13, color: m.text },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: m.chip },
  pressed: { opacity: 0.7 },
  topSeat: { alignItems: "center", gap: 4, paddingHorizontal: 12 },
  middle: { flex: 1, flexDirection: "row", alignItems: "stretch", paddingHorizontal: 6, gap: 4 },
  sideSeat: { width: 66, alignItems: "center", gap: 6, paddingTop: 6 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  centreRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  plate: { alignItems: "center", gap: 3, padding: 4, borderRadius: 14, borderWidth: 2, borderColor: "transparent" },
  plateRow: { flexDirection: "row", gap: 8, paddingHorizontal: 8 },
  plateActive: { borderColor: m.lit, backgroundColor: m.litSoft },
  plateText: { alignItems: "center", maxWidth: 64 },
  plateTextRow: { alignItems: "flex-start", maxWidth: 150 },
  plateName: { fontFamily: fonts.display, fontSize: 12.5, color: m.text },
  badges: { flexDirection: "row", alignItems: "center", gap: 5 },
  wind: { fontSize: 12, fontWeight: "800", color: m.text, paddingHorizontal: 4, borderRadius: 4, backgroundColor: m.chip, overflow: "hidden" },
  dealer: { backgroundColor: m.characters },
  score: { fontSize: 12, fontWeight: "800", color: m.muted, fontVariant: ["tabular-nums"] },
  up: { color: m.gain },
  down: { color: m.lose },
  emote: { position: "absolute", right: -10, top: -10, fontSize: 22 },
  bubble: { position: "absolute", zIndex: 5, maxWidth: 150, minWidth: 60, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: m.tile },
  bubbleTop: { left: 46, top: 0 },
  bubbleBottom: { left: 40, bottom: 34 },
  bubbleLeft: { left: 30, top: 42 },
  bubbleRight: { right: 30, top: 42 },
  bubbleText: { fontSize: 12.5, fontWeight: "600", color: m.honour },
  melds: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 5 },
  meldsColumn: { flexDirection: "column", alignItems: "center", gap: 4 },
  meld: { flexDirection: "row", gap: 1 },
  backs: { flexDirection: "row" },
  backsColumn: { flexDirection: "column", alignItems: "center" },
  river: { flexDirection: "row", flexWrap: "wrap", gap: 2, alignContent: "flex-start" },
  compass: { width: 86, height: 86, borderRadius: 16, backgroundColor: m.chip, alignItems: "center", justifyContent: "center" },
  compassWind: { position: "absolute", fontSize: 15, fontWeight: "800", color: m.muted },
  compass_bottom: { bottom: 4 },
  compass_top: { top: 4 },
  compass_left: { left: 7 },
  compass_right: { right: 7 },
  compassLit: { color: m.lit },
  wallLeft: { fontFamily: fonts.display, fontSize: 20, color: m.text, fontVariant: ["tabular-nums"] },
  compassTime: { fontSize: 11, fontWeight: "800", color: m.lit, fontVariant: ["tabular-nums"] },
  mine: { gap: 6, paddingHorizontal: 10 },
  mineTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  hand: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 1 },
  drawn: { marginLeft: 8 },
  actionBar: { minHeight: 8 },
  claim: { gap: 6 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6 },
  action: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: m.chip, borderWidth: 1.5, borderColor: m.muted },
  actionPrimary: { backgroundColor: m.shoutEdge, borderColor: m.lit },
  actionText: { fontFamily: fonts.display, fontSize: 15, color: m.text },
  actionTextPrimary: { color: m.shout },
  chowTiles: { flexDirection: "row", alignItems: "center", gap: 2 },
  hint: { fontSize: 12.5, fontWeight: "700", color: m.muted },
  track: { height: 5, borderRadius: 3, backgroundColor: m.chip, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3, backgroundColor: m.lit },
  calloutWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  callout_bottom: { bottom: "30%" },
  callout_top: { top: "22%" },
  callout_left: { top: "45%", alignItems: "flex-start", paddingLeft: 40 },
  callout_right: { top: "45%", alignItems: "flex-end", paddingRight: 40 },
  callout: {
    fontFamily: fonts.display,
    fontSize: 44,
    color: m.shout,
    textShadowColor: m.shoutEdge,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
    letterSpacing: 1,
  },
  calloutHu: { fontSize: 60, color: m.win },
  resultWrap: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 16 },
  result: { flexGrow: 0, width: "100%", maxWidth: 400, maxHeight: "80%", borderRadius: 22, backgroundColor: m.feltDark, borderWidth: 2, borderColor: m.lit },
  resultBody: { padding: 16, gap: 12 },
  resultTitle: { fontFamily: fonts.display, fontSize: 21, color: m.win, textAlign: "center" },
  resultNote: { fontSize: 13, fontWeight: "600", color: m.muted, textAlign: "center" },
  winHand: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 1 },
  faanList: { gap: 4 },
  faanRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  faanTotal: { justifyContent: "center", paddingTop: 4, borderTopWidth: 1, borderTopColor: m.muted },
  faanZh: { width: 56, fontSize: 15, fontWeight: "800", color: m.text },
  faanEn: { flex: 1, fontSize: 14, fontWeight: "600", color: m.text },
  faanValue: { fontFamily: fonts.display, fontSize: 15, color: m.win },
  transfers: { gap: 4, padding: 10, borderRadius: 14, backgroundColor: m.chip },
  transfer: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  transferName: { flex: 1, fontSize: 14, fontWeight: "700", color: m.text },
  transferCoins: { fontFamily: fonts.display, fontSize: 15, color: m.muted, fontVariant: ["tabular-nums"] },
  resultButtons: { flexDirection: "row", gap: 8, justifyContent: "center", flexWrap: "wrap" },
});
