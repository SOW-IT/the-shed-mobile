import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CLAIM_MS, TURN_MS } from "@shared/mahjong/game";
import { isMahjongTable, MAHJONG_TABLE_NAMES } from "@shared/mahjong/table";
import { BUBBLE_MS, EMOTE_MS, EMOTES, isEmote, type Look } from "@shared/world";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Move } from "@shared/mahjong/play";
import type { HandView, MeldView, SeatView as HandSeat } from "@shared/mahjong/view";
import { gradientStyle } from "@/components/ui/Grid";
import { mahjong as m } from "../palette";
import { SeatFace } from "./Faces";
import { claimChoices, coinsWords, dealtCount, INTRO, introElapsed, faanLine, resultTitle, roundWords, secondsLeft, windBadge, windWords } from "./tableWords";
import { Tile, TILE_RATIO } from "./Tile";
import { Arrive, Punch } from "./Motion";
import { Intro } from "./Intro";
import { useBatterySaver } from "../settings";
import type { MahjongSeatView } from "./useMahjong";
import { DRAWN_GAP, HAND_GAP, PAD, RIVER_GAP, RIVER_LABEL, STRIP_GAP, tableLayout } from "./layout";
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
  stake: number;
  giveUpCost: number;
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

const Melds = ({ melds, width, calm, testID }: { melds: readonly MeldView[]; width: number; calm: boolean; testID: string }) => {
  if (melds.length === 0) return null;
  return (
    <View style={styles.melds} testID={testID}>
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

const OpponentCard = ({
  seat,
  index,
  hand,
  look,
  active,
  deadline,
  now,
  meld,
  width,
  concealed,
  nameOf,
  said,
  emote,
  calm,
}: {
  seat: MahjongSeatView;
  index: number;
  hand: HandView;
  look: Look | null;
  active: boolean;
  deadline: number | null;
  now: number;
  meld: number;
  width: number;
  concealed: number;
  nameOf: (n: string) => string;
  said: string | null;
  emote: string | null;
  calm: boolean;
}) => {
  const wind = hand.seats[index].wind;
  const name = seatName(seat, nameOf);
  const dealer = index === hand.dealer;
  return (
    <View
      style={[styles.card, { width }, active && styles.cardActive]}
      accessible
      accessibilityLabel={`${name}, ${windWords(wind)}${dealer ? ", dealer" : ""}${seat.away ? ", away, a bot is playing" : ""}, ${concealed} tiles in hand, score ${coinsWords(seat.net)}${active ? ", their turn" : ""}`}
      testID={`mahjong-player-${index}`}
    >
      <View style={styles.cardHead}>
        <View>
          <SeatFace kind={seat.kind === "human" && seat.away ? "bot" : seat.kind} look={look} name={seat.name} size={30} />
          <Bubble text={said} emote={emote} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardName} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.badges}>
            <Text style={[styles.wind, dealer && styles.dealer]}>{windBadge(wind)}</Text>
            <Text style={[styles.score, seat.net > 0 ? styles.up : seat.net < 0 ? styles.down : null]}>{coinsWords(seat.net)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardRow}>
        <View style={styles.count}>
          <Tile tile={-1} width={11} back />
          <Text style={styles.countText}>{`×${concealed}`}</Text>
        </View>
        {active && deadline !== null ? <Text style={styles.cardTime}>{`${secondsLeft(deadline, now)}s`}</Text> : null}
      </View>
      <Melds melds={hand.seats[index].melds} width={meld} calm={calm} testID={`mahjong-melds-${index}`} />
    </View>
  );
};

/** A seat's discards in the order they were let go, the newest lit. */
const River = ({ seat, index, hand, nameOf, seats, lastDiscard, width, perRow, from, calm }: { seat: HandSeat; index: number; hand: HandView; nameOf: (n: string) => string; seats: readonly MahjongSeatView[]; lastDiscard: { seat: number; tile: number } | null; width: number; perRow: number; from: boolean; calm: boolean }) => {
  const shown = seat.discards.filter((d) => !d.taken);
  const name = seatName(seats[index], nameOf);
  return (
    <View style={[styles.riverRow, from && styles.riverFrom]} testID={`mahjong-river-${index}`} accessibilityLabel={`${name}'s discards`}>
      <View style={[styles.riverLabel, { width: RIVER_LABEL }]}>
        <Text style={[styles.wind, index === hand.dealer && styles.dealer]}>{windBadge(seat.wind)}</Text>
        <Text style={styles.riverName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View style={[styles.river, { width: perRow * (width + RIVER_GAP) }]}>
        {shown.map((d) =>
          lastDiscard && lastDiscard.seat === index && d.tile === lastDiscard.tile ? (
            <Arrive key={d.tile} from={{ x: 0, y: -60 }} scale={1.6} arc={20} duration={320} calm={calm}>
              <Tile tile={d.tile} width={width} lit testID="mahjong-last-discard" />
            </Arrive>
          ) : (
            <Tile key={d.tile} tile={d.tile} width={width} />
          )
        )}
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

const InfoBar = ({ hand, names, now, forCoins, stake }: { hand: HandView; names: readonly string[]; now: number; forCoins: boolean; stake: number }) => {
  const stage = hand.stage;
  const who = stage.kind === "turn" ? (names[stage.seat] === "You" ? "Your turn" : `${names[stage.seat]}'s turn`) : stage.kind === "claim" ? `${names[stage.from]} let go` : "";
  const deadline = stage.kind === "turn" || stage.kind === "claim" ? stage.deadline : null;
  return (
    <View style={styles.info} testID="mahjong-compass">
      <Text style={styles.infoText}>{roundWords(hand.roundWind)}</Text>
      <Text style={styles.infoText} accessibilityLabel={`${hand.wallLeft} tiles left in the wall`} testID="mahjong-wall-left">{`${hand.wallLeft} left`}</Text>
      <Text style={[styles.infoText, styles.infoWho]} numberOfLines={1}>
        {who}
      </Text>
      {deadline !== null ? <Text style={styles.infoTime}>{`${secondsLeft(deadline, now)}s`}</Text> : null}
      <View style={[styles.stakePill, forCoins && styles.stakeCoins]} testID="mahjong-stakes">
        <Text style={styles.stakeText}>{forCoins ? `🪙 ${stake}/pt` : "Points"}</Text>
      </View>
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
                    <Tile key={tile} tile={tile} width={20} lit={tile === stage.tile} />
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
                <Tile tile={kind * 4} width={20} />
              </View>
            </Chip>
          ))}
          <Text style={styles.hint}>{selected === null ? "Your turn: tap a tile, or slide one up to discard" : "Tap it again (or slide it up) to discard"}</Text>
        </View>
        <Bar deadline={stage.deadline} total={TURN_MS} now={now} />
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

const LeaveConfirm = ({ cost, onLeave, onStay }: { cost: number; onLeave: () => void; onStay: () => void }) => (
  <View style={styles.resultWrap} testID="mahjong-give-up">
    <View style={[styles.result, styles.resultBody]}>
      <Text style={styles.resultTitle} accessibilityRole="header">
        Give up this hand?
      </Text>
      <Text style={styles.confirmText}>
        {cost > 0 ? `You'll lose ${cost} SOW coin${cost === 1 ? "" : "s"}, shared between the other players, and a bot plays your seat for the rest of the hand.` : "Nobody else here is playing for coins, so you won't lose any. A bot plays your seat for the rest of the hand."}
      </Text>
      <View style={styles.resultButtons}>
        <Chip label={cost > 0 ? `Give up (−${cost})` : "Give up"} onPress={onLeave} testID="mahjong-give-up-confirm" />
        <Chip label="Stay" primary onPress={onStay} testID="mahjong-give-up-stay" />
      </View>
    </View>
  </View>
);

const ResultCard = ({
  hand,
  seats,
  settled,
  mySeat,
  forCoins,
  nameOf,
  onAgain,
  onLeave,
}: {
  hand: HandView;
  seats: readonly MahjongSeatView[];
  settled: Settled;
  mySeat: number | null;
  forCoins: boolean;
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
                <Text style={styles.faanEn}>{`${result.faan} faan · ${result.points} points`}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.resultNote}>The wall ran out (流局). Nobody scores, and the deal passes on.</Text>
        )}
        {settled ? (
          <View style={styles.transfers} testID="mahjong-transfers">
            <Text style={styles.transferHead}>{forCoins ? "SOW coins (bots never pay or collect)" : "Points (no coins on this table)"}</Text>
            {seats.map((seat, i) => (
              <View key={windBadge(hand.seats[i].wind)} style={styles.transfer}>
                <Text style={styles.transferName} numberOfLines={1}>
                  {names[i]}
                </Text>
                <Text style={[styles.transferCoins, settled.deltas[i] > 0 ? styles.up : settled.deltas[i] < 0 ? styles.down : null]}>{coinsWords(settled.deltas[i])}</Text>
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
export const MahjongTable = ({ table, seats, hand, settled, handNo, mySeat, people, muted, now, nameOf, top, bottom, busy, forCoins, stake, giveUpCost, onMove, onAgain, onLeave }: TableProps) => {
  const { width: screenWidth } = useWindowDimensions();
  const layout = tableLayout(screenWidth);
  const calm = useBatterySaver();
  const viewer = mySeat ?? 0;
  const [chosen, setSelected] = useState<{ tile: number; step: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
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
  const others = [1, 2, 3].map((d) => (viewer + d) % 4);
  const riverOrder = [...others, viewer];
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
  const leave = () => {
    if (mySeat !== null && forCoins && stage.kind !== "over") setConfirming(true);
    else onLeave();
  };
  const title = `${isMahjongTable(table) ? MAHJONG_TABLE_NAMES[table] : "Mahjong"} · Hand ${handNo}`;
  return (
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
          <Pressable onPress={leave} hitSlop={8} accessibilityRole="button" accessibilityLabel={mySeat === null ? "Stop watching" : "Leave the table"} testID="mahjong-leave" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={m.text} />
          </Pressable>
        </View>
        <View style={styles.strip}>
          {others.map((i) => (
            <OpponentCard
              key={i}
              seat={seats[i]}
              index={i}
              hand={hand}
              look={lookOf(seats[i])}
              active={active === i}
              deadline={deadline}
              now={now}
              meld={layout.meld}
              width={layout.card}
              concealed={concealedOf(i)}
              nameOf={nameOf}
              said={saidOf(seats[i])}
              emote={actOf(seats[i])}
              calm={calm}
            />
          ))}
        </View>
        <InfoBar hand={hand} names={names} now={now} forCoins={forCoins} stake={stake} />
        <ScrollView style={styles.rivers} contentContainerStyle={styles.riversBody}>
          {stage.kind === "intro" ? (
            <View style={styles.introBox}>
              <Intro dice={hand.dice} breakAt={hand.breakAt} dealer={hand.dealer} dealerName={names[hand.dealer]} until={stage.until} now={now} calm={calm} />
            </View>
          ) : (
            riverOrder.map((i) => (
              <River key={i} seat={hand.seats[i]} index={i} hand={hand} nameOf={nameOf} seats={seats} lastDiscard={lastDiscard} width={layout.river} perRow={layout.riverPerRow} from={stage.kind === "claim" && stage.from === i} calm={calm} />
            ))
          )}
        </ScrollView>
        <View style={[styles.mine, { paddingBottom: bottom }]}>
          <View style={styles.mineTop}>
            <View style={[styles.myPlate, active === viewer && styles.cardActive]} accessible accessibilityLabel={`${names[viewer]}, ${windWords(hand.seats[viewer].wind)}${viewer === hand.dealer ? ", dealer" : ""}, score ${coinsWords(seats[viewer].net)}`} testID="mahjong-plate-bottom">
              <View>
                <SeatFace kind={seats[viewer].kind} look={lookOf(seats[viewer])} name={seats[viewer].name} size={30} />
                <Bubble text={saidOf(seats[viewer])} emote={actOf(seats[viewer])} />
              </View>
              <Text style={styles.cardName}>{names[viewer]}</Text>
              <Text style={[styles.wind, viewer === hand.dealer && styles.dealer]}>{windBadge(hand.seats[viewer].wind)}</Text>
              <Text style={[styles.score, seats[viewer].net > 0 ? styles.up : seats[viewer].net < 0 ? styles.down : null]}>{coinsWords(seats[viewer].net)}</Text>
            </View>
            <Melds melds={hand.seats[viewer].melds} width={layout.myMeld} calm={calm} testID="mahjong-melds-bottom" />
          </View>
          {mySeat !== null ? <ActionBar hand={hand} mySeat={mySeat} selected={selected} now={now} busy={busy} onMove={onMove} /> : null}
          <View style={[styles.hand, { minHeight: layout.hand * TILE_RATIO + layout.hand * 0.5, gap: HAND_GAP }]} testID="mahjong-hand">
            {mySeat === null ? (
              <View style={styles.backs}>
                {Array.from({ length: concealedOf(viewer) }, (_, i) => `b${i}`).map((key) => (
                  <Tile key={key} tile={-1} width={Math.round(layout.hand * 0.8)} back />
                ))}
              </View>
            ) : (
              handTiles.map((tile) => (
                <HandTile key={tile} tile={tile} width={layout.hand} lifted={selected === tile} enabled={myTurn} drawn={tile === drawn} dealing={dealing} calm={calm} onTap={() => pick(tile)} onSlide={() => discard(tile)} />
              ))
            )}
          </View>
        </View>
      </View>
      <Callout hand={hand} names={names} calm={calm} />
      <ResultCard hand={hand} seats={seats} settled={settled} mySeat={mySeat} forCoins={forCoins} nameOf={nameOf} onAgain={onAgain} onLeave={onLeave} />
      {confirming ? (
        <LeaveConfirm
          cost={giveUpCost}
          onStay={() => setConfirming(false)}
          onLeave={() => {
            setConfirming(false);
            onLeave();
          }}
        />
      ) : null}
    </View>
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
  strip: { flexDirection: "row", gap: STRIP_GAP, paddingHorizontal: PAD, alignItems: "flex-start" },
  card: { gap: 4, padding: 5, borderRadius: 12, borderWidth: 2, borderColor: m.chip, backgroundColor: m.chip },
  cardActive: { borderColor: m.lit, backgroundColor: m.litSoft },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardText: { flex: 1 },
  cardName: { fontFamily: fonts.display, fontSize: 12.5, color: m.text },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  count: { flexDirection: "row", alignItems: "center", gap: 3 },
  countText: { fontSize: 12, fontWeight: "800", color: m.muted, fontVariant: ["tabular-nums"] },
  cardTime: { fontSize: 12, fontWeight: "800", color: m.lit, fontVariant: ["tabular-nums"] },
  badges: { flexDirection: "row", alignItems: "center", gap: 5 },
  wind: { fontSize: 12, fontWeight: "800", color: m.text, paddingHorizontal: 4, borderRadius: 4, backgroundColor: m.chip, overflow: "hidden" },
  dealer: { backgroundColor: m.characters },
  score: { fontSize: 12, fontWeight: "800", color: m.muted, fontVariant: ["tabular-nums"] },
  up: { color: m.gain },
  down: { color: m.lose },
  emote: { position: "absolute", right: -10, top: -10, fontSize: 20 },
  bubble: { position: "absolute", zIndex: 5, left: 26, top: 22, maxWidth: 150, minWidth: 60, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: m.tile },
  bubbleText: { fontSize: 12.5, fontWeight: "600", color: m.honour },
  melds: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  meld: { flexDirection: "row", gap: 1 },
  info: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: PAD + 4, paddingVertical: 6 },
  infoText: { fontSize: 12.5, fontWeight: "700", color: m.muted },
  infoWho: { flex: 1, color: m.text },
  infoTime: { fontSize: 13, fontWeight: "800", color: m.lit, fontVariant: ["tabular-nums"] },
  stakePill: { paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: "center", backgroundColor: m.chip },
  stakeCoins: { backgroundColor: m.shoutEdge },
  stakeText: { fontSize: 12, fontWeight: "800", color: m.text },
  rivers: { flex: 1 },
  riversBody: { gap: 4, paddingHorizontal: PAD },
  riverRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 3, borderRadius: 8 },
  riverFrom: { backgroundColor: m.litSoft },
  riverLabel: { alignItems: "center", gap: 2, paddingTop: 2 },
  riverName: { fontSize: 9.5, fontWeight: "700", color: m.muted, maxWidth: RIVER_LABEL },
  river: { flexDirection: "row", flexWrap: "wrap", gap: RIVER_GAP, alignContent: "flex-start", minHeight: 20 },
  introBox: { alignItems: "center", paddingTop: 30 },
  mine: { gap: 6, paddingHorizontal: PAD },
  mineTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  myPlate: { flexDirection: "row", alignItems: "center", gap: 6, padding: 4, borderRadius: 12, borderWidth: 2, borderColor: m.chip },
  hand: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center" },
  backs: { flexDirection: "row", gap: 1 },
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
