import { GamesPanelHeader, MenuRow } from "@/components/games/GamesMenu";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import { fonts } from "@/theme";
import { worldColours } from "@/worldColours";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CLAIM_SECONDS, FAAN_LIMITS, MIN_FAAN_CHOICES, TURN_SECONDS, type Settings } from "@shared/mahjong/table";
import { isMahjongTable, MAHJONG_TABLE_NAMES, seatPlace } from "@shared/mahjong/table";
import type { Look } from "@shared/world";
import { useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from "react-native";
import { blurBehind, itemStyle, popStyle, useOverlayClock } from "../Overlays";
import { glass } from "../palette";
import { SeatFace } from "./Faces";
import type { MahjongMine, MahjongSeatView } from "./useMahjong";

const { hud } = worldColours;
const ROWS = 8;

const minWords = (min: number) => (min === 0 ? "0 faan (chicken hand)" : `${min} faan`);
const turnOf = (s: Settings) => s.turnSeconds ?? TURN_SECONDS.fallback;
const claimOf = (s: Settings) => s.claimSeconds ?? CLAIM_SECONDS.fallback;
const nextOf = (choices: readonly number[], value: number) => choices[(choices.indexOf(value) + 1) % choices.length];
const rulesWords = (s: Settings) => `${minWords(s.minFaan)} to win, ${s.maxFaan} faan cap · ${turnOf(s)} s a turn, ${claimOf(s)} s to claim · ${s.coins === true ? "For SOW coins, 8 points a coin" : "For points, no coins"}`;

const Pill = ({ label, onPress, primary = false, disabled = false, testID, a11y }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; testID: string; a11y?: string }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={a11y ?? label}
    accessibilityState={{ disabled }}
    testID={testID}
    style={({ pressed }) => [styles.pill, primary && styles.pillPrimary, disabled && styles.pillOff, pressed && styles.pressed]}
  >
    <Text style={[styles.pillText, primary && styles.pillTextPrimary]}>{label}</Text>
  </Pressable>
);

const Stepper = ({ value, min, max, onChange, label, testID }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string; testID: string }) => (
  <View style={styles.stepper}>
    <Pressable onPress={() => onChange(value - 1)} disabled={value <= min} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Less ${label}`} testID={`${testID}-less`} style={({ pressed }) => [styles.step, value <= min && styles.pillOff, pressed && styles.pressed]}>
      <Ionicons name="remove" size={16} color={glass.text} />
    </Pressable>
    <Text style={styles.stepValue} accessibilityLabel={`${label} ${value}`} testID={`${testID}-value`}>
      {value}
    </Text>
    <Pressable onPress={() => onChange(value + 1)} disabled={value >= max} hitSlop={6} accessibilityRole="button" accessibilityLabel={`More ${label}`} testID={`${testID}-more`} style={({ pressed }) => [styles.step, value >= max && styles.pillOff, pressed && styles.pressed]}>
      <Ionicons name="add" size={16} color={glass.text} />
    </Pressable>
  </View>
);

const seatDetail = (seat: MahjongSeatView, index: number, hostSeat: number) => {
  const place = `${seatPlace(index)} seat`;
  const host = index === hostSeat ? " · Host" : "";
  if (seat.kind === "empty") return `${place} · Free`;
  if (seat.kind === "bot") return `${place} · Bot`;
  return `${place}${host}`;
};

/**
 * The table's waiting room, built like the arcade's games list: the same
 * glass panel, header, rows and entrance. Four seats (with the host's Add
 * bot and Remove), the rules, and Start game once every seat is filled.
 */
export const MahjongLobby = ({
  table,
  open,
  top,
  bottom,
  lookOf,
  nameOf,
  onAddBot,
  onRemoveBot,
  onSettings,
  onStart,
  onLeave,
}: {
  table: MahjongMine | null;
  open: boolean;
  top: number;
  bottom: number;
  lookOf: (memberId: string | null) => Look | null;
  nameOf: (name: string) => string;
  onAddBot: (seat: number) => void;
  onRemoveBot: (seat: number) => void;
  onSettings: (settings: Settings) => void;
  onStart: () => void;
  onLeave: () => void;
}) => {
  const overlay = useOverlayClock(open && table !== null, ROWS);
  const { width, height } = useWindowDimensions();
  const [kept, setKept] = useState(table);
  const [editing, setEditing] = useState(false);
  if (table && table !== kept) setKept(table);
  if (!overlay.mounted || !kept) return null;
  const t = kept;
  const settings = t.settings;
  const change = (next: Partial<Settings>) => onSettings({ ...settings, ...next });
  const hostName = t.hostSeat >= 0 ? nameOf(t.seats[t.hostSeat].name) : "the host";
  const short = t.seats.filter((s) => s.short).map((s) => (s.isMe ? "You" : nameOf(s.name)));
  const title = `Mahjong · ${isMahjongTable(t.table) ? MAHJONG_TABLE_NAMES[t.table] : "Table"}`;
  const rows: ReactNode[] = t.seats.map((seat, i) => (
    <MenuRow
      key={seatPlace(i)}
      face={<SeatFace kind={seat.kind} look={lookOf(seat.member)} name={seat.name} size={38} />}
      title={seat.kind === "empty" ? "Empty seat" : seat.isMe ? `${nameOf(seat.name)} (you)` : nameOf(seat.name)}
      detail={`${seatDetail(seat, i, t.hostSeat)}${seat.short ? ` · Needs ${t.coinsToSit} coins` : ""}`}
      label={`${seatPlace(i)} seat: ${seat.kind === "empty" ? "empty" : nameOf(seat.name)}${seat.kind === "bot" ? ", a bot" : ""}${i === t.hostSeat ? ", host" : ""}`}
      trailing={
        t.isHost && seat.kind === "empty" ? (
          <Pill label="Add bot" onPress={() => onAddBot(i)} testID={`mahjong-add-bot-${i}`} a11y={`Add a bot in the ${seatPlace(i)} seat`} />
        ) : t.isHost && seat.kind === "bot" ? (
          <Pill label="Remove" onPress={() => onRemoveBot(i)} testID={`mahjong-remove-bot-${i}`} a11y={`Take the bot out of the ${seatPlace(i)} seat`} />
        ) : i === t.hostSeat ? (
          <Ionicons name="star" size={16} color={worldColours.gold.light} accessibilityElementsHidden />
        ) : (
          <View />
        )
      }
      testID={`mahjong-seat-${i}`}
      style={itemStyle(overlay, i + 1)}
    />
  ));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.panel, blurBehind, { top, width: Math.min(380, width - 28), maxHeight: Math.max(0, height - top - bottom) }, popStyle(overlay)]}
        pointerEvents={open ? "auto" : "none"}
        testID="mahjong-lobby"
      >
        <GamesPanelHeader title={title} icon="grid" style={itemStyle(overlay, 0)}>
          <Pressable onPress={onLeave} hitSlop={8} accessibilityRole="button" accessibilityLabel="Leave the table" testID="mahjong-lobby-leave" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={glass.text} />
          </Pressable>
        </GamesPanelHeader>
        <SharpScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          {rows}
          <MenuRow
            icon="options"
            title="Rules"
            detail={rulesWords(settings)}
            label={`Rules: ${rulesWords(settings)}${t.isHost ? (editing ? ", open" : ", tap to change") : ""}`}
            onPress={t.isHost ? () => setEditing((was) => !was) : undefined}
            trailing={t.isHost ? <Ionicons name={editing ? "chevron-up" : "chevron-down"} size={18} color={glass.muted} /> : undefined}
            testID="mahjong-rules"
            style={itemStyle(overlay, 5)}
          />
          {t.isHost && editing ? (
            <View style={styles.settings} testID="mahjong-settings">
              <View style={styles.setting}>
                <Text style={styles.settingName}>Minimum faan</Text>
                <Pill
                  label={minWords(settings.minFaan)}
                  onPress={() => {
                    const at = MIN_FAAN_CHOICES.indexOf(settings.minFaan as (typeof MIN_FAAN_CHOICES)[number]);
                    const next = MIN_FAAN_CHOICES[(at + 1) % MIN_FAAN_CHOICES.length];
                    change({ minFaan: next, maxFaan: Math.max(settings.maxFaan, next) });
                  }}
                  testID="mahjong-min-faan"
                  a11y={`Minimum faan to win: ${minWords(settings.minFaan)}. Tap to change`}
                />
              </View>
              <View style={styles.setting}>
                <Text style={styles.settingName}>Faan cap</Text>
                <Stepper value={settings.maxFaan} min={settings.minFaan} max={FAAN_LIMITS.max} label="faan cap" onChange={(maxFaan) => change({ maxFaan })} testID="mahjong-max-faan" />
              </View>
              <View style={styles.setting}>
                <Text style={styles.settingName}>Seconds a turn</Text>
                <Pill label={`${turnOf(settings)} s`} onPress={() => change({ turnSeconds: nextOf(TURN_SECONDS.choices, turnOf(settings)) })} testID="mahjong-turn-seconds" a11y={`Seconds a turn: ${turnOf(settings)}. Tap to change`} />
              </View>
              <View style={styles.setting}>
                <Text style={styles.settingName}>Seconds to chow, pong or win</Text>
                <Pill label={`${claimOf(settings)} s`} onPress={() => change({ claimSeconds: nextOf(CLAIM_SECONDS.choices, claimOf(settings)) })} testID="mahjong-claim-seconds" a11y={`Seconds to claim a discard: ${claimOf(settings)}. Tap to change`} />
              </View>
              <View style={styles.setting}>
                <Text style={styles.settingName}>Play for SOW coins</Text>
                <Switch
                  value={settings.coins === true}
                  onValueChange={(on) => change({ coins: on })}
                  trackColor={{ false: glass.rowPressed, true: hud.accent }}
                  accessibilityRole="switch"
                  accessibilityLabel="Play for SOW coins"
                  accessibilityState={{ checked: settings.coins === true }}
                  testID="mahjong-coins"
                />
              </View>

            </View>
          ) : null}
          <Animated.View style={[styles.startRow, itemStyle(overlay, 6)]}>
            <Text style={[styles.note, settings.coins === true && styles.coinsNote]} testID="mahjong-coins-note">
              {settings.coins === true
                ? `SOW coins on the line: everyone needs ${t.coinsToSit} coins to sit, the most one hand can cost. Coins only move between people, never to or from a bot.`
                : "For points: no SOW coins move at this table."}
            </Text>
            {t.isHost ? (
              <>
                <Pill label="Start game" primary disabled={!t.full || short.length > 0} onPress={onStart} testID="mahjong-start" />
                {t.full ? null : <Text style={styles.note}>Fill every seat to start: add bots, or wait for people to sit down.</Text>}
                {short.length > 0 ? <Text style={[styles.note, styles.coinsNote]}>{`${short.join(", ")} ${short.length === 1 && short[0] !== "You" ? "hasn't" : "haven't"} enough coins. Turn coins off, lower the faan cap or the stake, or wait for them to get up.`}</Text> : null}
              </>
            ) : (
              <Text style={styles.note} testID="mahjong-waiting">{`Waiting for ${hostName} to start.`}</Text>
            )}
          </Animated.View>
        </SharpScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 14,
    borderRadius: 24,
    backgroundColor: Platform.OS === "web" ? glass.panel : glass.panelSolid,
    borderWidth: 1.5,
    borderColor: glass.edge,
    paddingTop: 12,
    overflow: "hidden",
    transformOrigin: "top left",
  },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  pressed: { opacity: 0.7 },
  scroll: { flexGrow: 0 },
  rows: { gap: 6, paddingHorizontal: 8, paddingBottom: 12 },
  pill: { height: 30, paddingHorizontal: 12, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.rowPressed },
  pillPrimary: { height: 40, paddingHorizontal: 22, borderRadius: 20, backgroundColor: hud.accent },
  pillOff: { opacity: 0.4 },
  pillText: { fontFamily: fonts.display, fontSize: 13.5, color: glass.text },
  pillTextPrimary: { fontSize: 16, color: hud.onAccent },
  settings: { gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: glass.row },
  setting: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 34 },
  settingName: { flexShrink: 1, fontSize: 13.5, fontWeight: "700", color: glass.text },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  step: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.rowPressed },
  stepValue: { minWidth: 22, textAlign: "center", fontFamily: fonts.display, fontSize: 16, color: glass.text, fontVariant: ["tabular-nums"] },
  startRow: { alignItems: "center", gap: 8, paddingTop: 6 },
  note: { fontSize: 12.5, fontWeight: "600", color: glass.muted, textAlign: "center", paddingHorizontal: 12 },
  coinsNote: { color: glass.text },
});
