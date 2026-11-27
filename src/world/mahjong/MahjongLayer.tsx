import { worldColours } from "@/worldColours";
import { fonts } from "@/theme";
import type { Move } from "@shared/mahjong/play";
import { CLAIM_SECONDS, mahjongSeatId, TURN_SECONDS, type MahjongTableId } from "@shared/mahjong/table";
import type { Look } from "@shared/world";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { blurBehind, popStyle, useOverlayClock } from "../Overlays";
import { glass } from "../palette";
import { BotFace } from "./Faces";
import { MahjongLobby } from "./MahjongLobby";
import { MahjongTable } from "./MahjongTable";
import { botSeatUnder } from "./tap";
import type { Mahjong, MahjongMine } from "./useMahjong";

const { hud } = worldColours;
const TICK_MS = 250;

type Person = { memberId: string; isMe: boolean; seat?: string; look: Look; say?: { text: string; at: number }; act?: { emote: string; at: number } };

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

export const playingAtTable = (mine: MahjongMine | null, mySeat: string | undefined) => {
  if (mine === null || mine.phase === "lobby" || mine.hand === null) return false;
  return mine.phase === "ended" || mySeat === mahjongSeatId(mine.table as MahjongTableId, mine.mySeat);
};

/** A glass card over the World, like the arcade's panel: a face, a line, and buttons. */
const Card = ({
  open,
  top,
  face,
  title,
  note,
  buttons,
  testID,
}: {
  open: boolean;
  top: number;
  face: React.ReactNode;
  title: string;
  note: string;
  buttons: { label: string; onPress: () => void; primary?: boolean; testID: string }[];
  testID: string;
}) => {
  const overlay = useOverlayClock(open, 2);
  const { width } = useWindowDimensions();
  if (!overlay.mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.card, blurBehind, { top, width: Math.min(380, width - 28) }, popStyle(overlay)]} pointerEvents={open ? "auto" : "none"} testID={testID} accessibilityLiveRegion="polite">
        <View style={styles.cardHead}>
          {face}
          <View style={styles.cardText}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.cardNote}>{note}</Text>
          </View>
        </View>
        <View style={styles.buttons}>
          {buttons.map((b) => (
            <Pressable key={b.testID} onPress={b.onPress} accessibilityRole="button" testID={b.testID} style={({ pressed }) => [styles.button, b.primary && styles.primary, pressed && styles.pressed]}>
              <Text style={[styles.buttonText, b.primary && styles.primaryText]}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

/**
 * Everything mahjong over the World: the lobby while you wait at a table,
 * the full-screen table during a hand and its breakdown after, the same
 * table read-only for anyone watching, the prompt to take over a bot when
 * you sit in its seat mid-hand, and a way back to your seat if you got up.
 */
export const MahjongLayer = ({
  mahjong,
  people,
  muted,
  serverNow,
  top,
  lobbyTop,
  safeTop,
  bottom,
  nameOf,
  watch,
  onNote,
  onWatch,
  onStopWatching,
  onSitBack,
  keyboardOpen,
  chatLog,
}: {
  mahjong: Mahjong;
  people: readonly Person[];
  muted: ReadonlySet<string>;
  serverNow: () => number;
  top: number;
  /** Where the lobby opens: under the World's chat log, so the log stays readable. */
  lobbyTop?: number;
  safeTop: number;
  bottom: number;
  nameOf: (name: string) => string;
  watch: Id<"mahjongTables"> | null;
  onNote: (note: string) => void;
  onWatch: (tableId: Id<"mahjongTables">) => void;
  onStopWatching: () => void;
  onSitBack: (seatId: string) => void;
  keyboardOpen: boolean;
  chatLog: React.ReactNode;
}) => {
  const { mine, tables } = mahjong;
  const me = people.find((p) => p.isMe);
  const lookOf = (memberId: string | null) => (memberId ? (people.find((p) => p.memberId === memberId)?.look ?? null) : null);
  const say = (problem: string | null) => {
    if (problem) onNote(problem);
  };
  const [busy, setBusy] = useState(false);
  const playM = useMutation(api.mahjong.play);
  const againM = useMutation(api.mahjong.again);
  const mySeatId = mine ? mahjongSeatId(mine.table as MahjongTableId, mine.mySeat) : null;
  const seatedHere = mine !== null && me?.seat === mySeatId;
  const inLobby = mine !== null && mine.phase === "lobby" && seatedHere;
  const playing = playingAtTable(mine, me?.seat);
  const gotUp = mine !== null && mine.phase === "playing" && !seatedHere && mahjong.inCafe;
  const watched = useQuery(api.mahjong.watching, watch && !playing ? { tableId: watch } : "skip");
  const watching = !playing && watch !== null && watched ? watched : null;
  const goneNoted = useRef<string | null>(null);
  useEffect(() => {
    if (watched) goneNoted.current = null;
    else if (watch && watched === null && goneNoted.current !== watch) {
      goneNoted.current = watch;
      onStopWatching();
      onNote("That game's over.");
    }
  }, [watch, watched, onStopWatching, onNote]);
  const counting = inLobby && mine?.startsAt != null;
  const now = useClock(serverNow, playing || watching !== null || counting);
  const stage = playing ? mine?.hand?.stage : undefined;
  const needsMe = playing && mine !== null && ((stage?.kind === "turn" && stage.seat === mine.mySeat) || (stage?.kind === "claim" && mine.hand?.mine?.offer != null && !mine.hand.mine.answered));
  const typing = useRef(keyboardOpen);
  useEffect(() => {
    typing.current = keyboardOpen;
  }, [keyboardOpen]);
  useEffect(() => {
    if (needsMe && typing.current) Keyboard.dismiss();
  }, [needsMe]);
  const bot = mine === null ? botSeatUnder(tables, me?.seat) : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const botKey = bot ? `${bot.tableId}:${bot.seat}` : null;
  if (botKey === null && dismissed !== null) setDismissed(null);
  const move = (m: Move) => {
    if (busy) return;
    setBusy(true);
    void playM({ move: m })
      .then((reply) => say(reply.ok ? null : reply.reason))
      .catch(() => onNote("That didn't send."))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <MahjongLobby
        table={mine}
        open={inLobby}
        top={lobbyTop ?? top}
        bottom={bottom}
        lookOf={lookOf}
        nameOf={nameOf}
        onAddBot={(seat) => void mahjong.addBot(seat).then(say)}
        onRemoveBot={(seat) => void mahjong.removeBot(seat).then(say)}
        onSettings={(settings) => void mahjong.setSettings(settings).then(say)}
        onStart={(anyway) => void mahjong.start(anyway).then(say)}
        onCancelStart={() => void mahjong.cancelStart().then(say)}
        onReady={(ready) => void mahjong.setReady(ready).then(say)}
        onRemovePlayer={(seat) => void mahjong.removePlayer(seat).then(say)}
        onLeave={() => void mahjong.leave().then(say)}
        now={now}
      />
      <Card
        open={bot !== null && dismissed !== botKey}
        top={top}
        face={<BotFace size={40} />}
        title={`Take over from ${bot?.name ?? "the bot"}?`}
        note="You'll play its hand from here: its tiles, melds and score."
        testID="mahjong-replace"
        buttons={[
          { label: "Take over", primary: true, testID: "mahjong-replace-take", onPress: () => bot && void mahjong.replaceBot(bot.tableId, bot.seat).then(say) },
          {
            label: "Watch",
            testID: "mahjong-replace-watch",
            onPress: () => {
              if (!bot) return;
              setDismissed(botKey);
              onWatch(bot.tableId);
              void mahjong.leave().then((problem) => {
                if (problem) setDismissed(null);
                say(problem);
              });
            },
          },
          {
            label: "Get up",
            testID: "mahjong-replace-no",
            onPress: () => {
              setDismissed(botKey);
              void mahjong.leave().then((problem) => {
                if (problem) setDismissed(null);
                say(problem);
              });
            },
          },
        ]}
      />
      <Card
        open={gotUp && !playing}
        top={top}
        face={<BotFace size={40} />}
        title="A bot is playing your seat"
        note="Sit back down to carry on with your hand."
        testID="mahjong-sit-back"
        buttons={[{ label: "Sit back down", primary: true, testID: "mahjong-sit-back-go", onPress: () => mySeatId && onSitBack(mySeatId) }]}
      />
      {playing && mine?.hand ? (
        <MahjongTable
          table={mine.table}
          seats={mine.seats}
          hand={mine.hand}
          settled={mine.settled}
          handNo={mine.handNo}
          mySeat={mine.mySeat}
          people={people}
          muted={muted}
          now={now}
          nameOf={nameOf}
          top={safeTop + 6}
          bottom={bottom}
          busy={busy}
          forCoins={mine.settings.coins === true}
          minFaan={mine.settings.minFaan}
          turnSeconds={mine.settings.turnSeconds ?? TURN_SECONDS.fallback}
          claimSeconds={mine.settings.claimSeconds ?? CLAIM_SECONDS.fallback}
          giveUpCost={mine.giveUpCost}
          chatLog={chatLog}
          onMove={move}
          onAgain={() =>
            void againM({})
              .then((r) => say(r.ok ? null : r.reason))
              .catch(() => onNote("That didn't send."))
          }
          onLeave={() => void mahjong.leave(mine.giveUpCost).then(say)}
        />
      ) : watching?.hand ? (
        <MahjongTable
          table={watching.table}
          seats={watching.seats}
          hand={watching.hand}
          settled={watching.settled}
          handNo={watching.handNo}
          mySeat={null}
          people={people}
          muted={muted}
          now={now}
          nameOf={nameOf}
          top={safeTop + 6}
          bottom={bottom}
          busy={false}
          forCoins={watching.settings.coins === true}
          minFaan={watching.settings.minFaan}
          turnSeconds={watching.settings.turnSeconds ?? TURN_SECONDS.fallback}
          claimSeconds={watching.settings.claimSeconds ?? CLAIM_SECONDS.fallback}
          giveUpCost={0}
          chatLog={chatLog}
          onMove={() => undefined}
          onAgain={() => undefined}
          onLeave={onStopWatching}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 14,
    borderRadius: 24,
    backgroundColor: Platform.OS === "web" ? glass.panel : glass.panelSolid,
    borderWidth: 1.5,
    borderColor: glass.edge,
    padding: 14,
    gap: 12,
    transformOrigin: "top left",
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { fontFamily: fonts.display, fontSize: 17, color: glass.text },
  cardNote: { fontSize: 12.5, fontWeight: "600", color: glass.muted },
  buttons: { flexDirection: "row", gap: 8 },
  button: { flex: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: glass.rowPressed },
  primary: { backgroundColor: hud.accent },
  buttonText: { fontFamily: fonts.display, fontSize: 15, color: glass.text },
  primaryText: { color: hud.onAccent },
  pressed: { opacity: 0.7 },
});
