import type { Look } from "@shared/world";
import { StyleSheet, Text, View } from "react-native";
import { Bust } from "../Overlays";
import { botFace as BOT, glass } from "../palette";

/** A bot's face at the table: a round-cornered screen with two glowing eyes and an antenna. */
export const BotFace = ({ size }: { size: number }) => {
  const head = size * 0.78;
  const eye = Math.max(3, size * 0.12);
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: size / 2, backgroundColor: BOT.face }]} accessible={false}>
      <View style={[styles.antenna, { top: size * 0.06, height: size * 0.16, backgroundColor: BOT.antenna }]} />
      <View style={[styles.bulb, { top: size * 0.02, width: size * 0.12, height: size * 0.12, borderRadius: size, backgroundColor: BOT.antenna }]} />
      <View style={[styles.head, { width: head, height: head * 0.72, borderRadius: head * 0.22, marginTop: size * 0.14, backgroundColor: BOT.head }]}>
        <View style={[styles.screen, { borderRadius: head * 0.16, backgroundColor: BOT.face }]}>
          <View style={[styles.eye, { width: eye, height: eye, borderRadius: eye, backgroundColor: BOT.eye }]} />
          <View style={[styles.eye, { width: eye, height: eye, borderRadius: eye, backgroundColor: BOT.eye }]} />
        </View>
      </View>
    </View>
  );
};

/** Someone at the table: their World character's head, a bot's face, or an empty seat. */
export const SeatFace = ({ kind, look, name, size }: { kind: "human" | "bot" | "empty"; look: Look | null; name: string; size: number }) => {
  if (kind === "bot") return <BotFace size={size} />;
  if (kind === "human" && look) return <Bust look={look} size={size} />;
  return (
    <View style={[styles.frame, styles.empty, { width: size, height: size, borderRadius: size / 2 }]}>
      {kind === "human" ? <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{Array.from(name)[0] ?? "?"}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: { alignItems: "center", overflow: "hidden" },
  empty: { justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: glass.muted, backgroundColor: glass.row },
  initial: { color: glass.text, fontWeight: "800" },
  antenna: { position: "absolute", width: 2, alignSelf: "center" },
  bulb: { position: "absolute", alignSelf: "center" },
  head: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: BOT.edge },
  screen: { flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center", width: "78%", height: "62%" },
  eye: {},
});
