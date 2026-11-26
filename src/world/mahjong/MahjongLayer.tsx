import { worldColours } from "@/worldColours";
import { fonts } from "@/theme";
import type { Look } from "@shared/world";
import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { blurBehind, popStyle, useOverlayClock } from "../Overlays";
import { glass } from "../palette";
import { BotFace } from "./Faces";
import { MahjongLobby } from "./MahjongLobby";
import { botSeatUnder } from "./tap";
import type { Mahjong } from "./useMahjong";
import type { Id } from "../../../convex/_generated/dataModel";

const { hud } = worldColours;

type Person = { memberId: string; isMe: boolean; seat?: string; look: Look };

/** Sitting in a bot's seat during a hand: take over its hand, or just watch. */
const ReplacePrompt = ({
  botName,
  open,
  top,
  onTake,
  onWatch,
  onGetUp,
}: {
  botName: string;
  open: boolean;
  top: number;
  onTake: () => void;
  onWatch: () => void;
  onGetUp: () => void;
}) => {
  const overlay = useOverlayClock(open, 2);
  const { width } = useWindowDimensions();
  if (!overlay.mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.card, blurBehind, { top, width: Math.min(380, width - 28) }, popStyle(overlay)]}
        pointerEvents={open ? "auto" : "none"}
        testID="mahjong-replace"
        accessibilityLiveRegion="polite"
      >
        <View style={styles.cardHead}>
          <BotFace size={40} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle} accessibilityRole="header">{`Take over from ${botName}?`}</Text>
            <Text style={styles.cardNote}>You&apos;ll play its hand from here: its tiles, melds and score.</Text>
          </View>
        </View>
        <View style={styles.buttons}>
          <Pressable onPress={onTake} accessibilityRole="button" testID="mahjong-replace-take" style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}>
            <Text style={[styles.buttonText, styles.primaryText]}>Take over</Text>
          </Pressable>
          <Pressable onPress={onWatch} accessibilityRole="button" testID="mahjong-replace-watch" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Watch</Text>
          </Pressable>
          <Pressable onPress={onGetUp} accessibilityRole="button" testID="mahjong-replace-no" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Get up</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
};

/**
 * Everything mahjong over the World: the lobby while you wait at a table,
 * and the prompt to take over a bot when you sit in its seat mid-hand.
 */
export const MahjongLayer = ({
  mahjong,
  people,
  top,
  bottom,
  nameOf,
  onNote,
  onStart,
  onWatch,
}: {
  mahjong: Mahjong;
  people: readonly Person[];
  top: number;
  bottom: number;
  nameOf: (name: string) => string;
  onNote: (note: string) => void;
  onStart: () => void;
  onWatch: (tableId: Id<"mahjongTables">) => void;
}) => {
  const { mine, tables } = mahjong;
  const me = people.find((p) => p.isMe);
  const lookOf = (memberId: string | null) => (memberId ? (people.find((p) => p.memberId === memberId)?.look ?? null) : null);
  const say = (problem: string | null) => {
    if (problem) onNote(problem);
  };
  const seatedHere = mine !== null && me?.seat === `${mine.table}-${mine.mySeat}`;
  const inLobby = mine !== null && mine.phase === "lobby" && seatedHere;
  const bot = mine === null ? botSeatUnder(tables, me?.seat) : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const botKey = bot ? `${bot.tableId}:${bot.seat}` : null;
  const lastKey = useRef(botKey);
  useEffect(() => {
    if (botKey !== lastKey.current) setDismissed(null);
    lastKey.current = botKey;
  }, [botKey]);
  return (
    <>
      <MahjongLobby
        table={mine}
        open={inLobby}
        top={top}
        bottom={bottom}
        lookOf={lookOf}
        nameOf={nameOf}
        onAddBot={(seat) => void mahjong.addBot(seat).then(say)}
        onRemoveBot={(seat) => void mahjong.removeBot(seat).then(say)}
        onSettings={(settings) => void mahjong.setSettings(settings).then(say)}
        onStart={onStart}
        onLeave={() => void mahjong.leave().then(say)}
      />
      <ReplacePrompt
        botName={bot?.name ?? "the bot"}
        open={bot !== null && dismissed !== botKey}
        top={top}
        onTake={() => {
          if (bot) void mahjong.replaceBot(bot.tableId, bot.seat).then(say);
        }}
        onWatch={() => {
          if (!bot) return;
          setDismissed(botKey);
          onWatch(bot.tableId);
          void mahjong.leave().then(say);
        }}
        onGetUp={() => {
          setDismissed(botKey);
          void mahjong.leave().then(say);
        }}
      />
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
