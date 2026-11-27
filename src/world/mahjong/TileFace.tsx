import { isDragon, isWind, suitOf, type Suit } from "@shared/mahjong/tiles";
import { StyleSheet, Text, View } from "react-native";
import { mahjong as m } from "../palette";

type Ink = "b" | "g" | "r";
const INK: Record<Ink, string> = { b: m.inkBlue, g: m.inkGreen, r: m.inkRed };

type Spot = readonly [x: number, y: number, ink: Ink];

const DOTS: Record<number, { size: number; spots: readonly Spot[] }> = {
  2: { size: 0.44, spots: [[0.5, 0.27, "b"], [0.5, 0.73, "g"]] },
  3: { size: 0.38, spots: [[0.24, 0.2, "b"], [0.5, 0.5, "r"], [0.76, 0.8, "g"]] },
  4: { size: 0.4, spots: [[0.27, 0.27, "b"], [0.73, 0.27, "g"], [0.27, 0.73, "g"], [0.73, 0.73, "b"]] },
  5: { size: 0.36, spots: [[0.24, 0.2, "b"], [0.76, 0.2, "g"], [0.5, 0.5, "r"], [0.24, 0.8, "g"], [0.76, 0.8, "b"]] },
  6: { size: 0.36, spots: [[0.29, 0.17, "g"], [0.71, 0.17, "g"], [0.29, 0.53, "r"], [0.71, 0.53, "r"], [0.29, 0.83, "r"], [0.71, 0.83, "r"]] },
  7: { size: 0.3, spots: [[0.2, 0.13, "g"], [0.5, 0.23, "g"], [0.8, 0.33, "g"], [0.31, 0.6, "r"], [0.69, 0.6, "r"], [0.31, 0.85, "r"], [0.69, 0.85, "r"]] },
  8: { size: 0.34, spots: [0.13, 0.38, 0.62, 0.87].flatMap((y) => [[0.3, y, "b"], [0.7, y, "b"]] as Spot[]) },
  9: { size: 0.3, spots: ([[0.17, "b"], [0.5, "r"], [0.83, "g"]] as const).flatMap(([y, ink]) => [0.2, 0.5, 0.8].map((x) => [x, y, ink] as Spot)) },
};

type Stick = readonly [x: number, y: number, ink: Ink, length: number, tilt: number];
const STICK = 0.4;
const SHORT = 0.29;
const BAMBOO: Record<number, readonly Stick[]> = {
  2: [[0.5, 0.27, "g", STICK, 0], [0.5, 0.73, "g", STICK, 0]],
  3: [[0.5, 0.27, "g", STICK, 0], [0.27, 0.73, "g", STICK, 0], [0.73, 0.73, "g", STICK, 0]],
  4: [[0.3, 0.27, "g", STICK, 0], [0.7, 0.27, "g", STICK, 0], [0.3, 0.73, "g", STICK, 0], [0.7, 0.73, "g", STICK, 0]],
  5: [[0.22, 0.27, "g", STICK, 0], [0.78, 0.27, "g", STICK, 0], [0.5, 0.5, "r", STICK, 0], [0.22, 0.73, "g", STICK, 0], [0.78, 0.73, "g", STICK, 0]],
  6: [0.27, 0.73].flatMap((y) => [0.2, 0.5, 0.8].map((x) => [x, y, "g", STICK, 0] as Stick)),
  7: [[0.5, 0.15, "r", SHORT, 0], ...[0.5, 0.83].flatMap((y) => [[0.2, y, "g", SHORT, 0], [0.5, y, "b", SHORT, 0], [0.8, y, "g", SHORT, 0]] as Stick[])],
  8: [
    ...[0.16, 0.39, 0.61, 0.84].map((x, i) => [x, 0.27, "g", STICK, i % 2 === 0 ? 22 : -22] as Stick),
    ...[0.16, 0.39, 0.61, 0.84].map((x, i) => [x, 0.73, "g", STICK, i % 2 === 0 ? -22 : 22] as Stick),
  ],
  9: [0.17, 0.5, 0.83].flatMap((y) => [[0.2, y, "g", SHORT, 0], [0.5, y, "r", SHORT, 0], [0.8, y, "g", SHORT, 0]] as Stick[]),
};

const NUMERALS = ["一", "二", "三", "四", "伍", "六", "七", "八", "九"] as const;
const WINDS = ["東", "南", "西", "北"] as const;

const Dot = ({ x, y, d, ink, w, h }: { x: number; y: number; d: number; ink: Ink; w: number; h: number }) => {
  const colour = INK[ink];
  const ring = Math.max(1, d * 0.13);
  const inner = d * 0.5;
  const centre = Math.max(1.5, d * 0.18);
  return (
    <View style={[styles.abs, styles.centred, { left: x * w - d / 2, top: y * h - d / 2, width: d, height: d, borderRadius: d / 2, borderWidth: ring, borderColor: colour }]}>
      {d >= 9 ? <View style={[styles.abs, { width: inner, height: inner, borderRadius: inner / 2, borderWidth: Math.max(0.75, ring * 0.7), borderColor: colour }]} /> : null}
      <View style={{ width: centre, height: centre, borderRadius: centre / 2, backgroundColor: colour }} />
    </View>
  );
};

const OneDot = ({ w, h }: { w: number; h: number }) => {
  const rings: [number, Ink][] = [[0.86, "b"], [0.66, "g"], [0.42, "r"]];
  return (
    <>
      {rings.map(([scale, ink]) => {
        const d = w * scale;
        return <View key={ink} style={[styles.abs, { left: (w - d) / 2, top: (h - d) / 2, width: d, height: d, borderRadius: d / 2, borderWidth: Math.max(1, w * 0.06), borderColor: INK[ink] }]} />;
      })}
    </>
  );
};

const StickView = ({ x, y, ink, length, tilt, w, h }: { x: number; y: number; ink: Ink; length: number; tilt: number; w: number; h: number }) => {
  const sw = Math.max(2, w * 0.15);
  const sh = length * h;
  const node = Math.max(1, sw * 0.28);
  return (
    <View style={[styles.abs, styles.centred, { left: x * w - sw / 2, top: y * h - sh / 2, width: sw, height: sh, borderRadius: sw / 2, backgroundColor: INK[ink], transform: [{ rotate: `${tilt}deg` }] }]}>
      <View style={{ width: sw * 0.75, height: node, backgroundColor: m.face, opacity: 0.85 }} />
    </View>
  );
};

const Bird = ({ w, h }: { w: number; h: number }) => {
  const body = w * 0.42;
  return (
    <>
      <View style={[styles.abs, { left: w * 0.42, top: h * 0.36, width: w * 0.16, height: h * 0.5, borderRadius: w * 0.08, backgroundColor: INK.r, transform: [{ rotate: "18deg" }] }]} />
      <View style={[styles.abs, { left: w * 0.3, top: h * 0.4, width: w * 0.1, height: h * 0.44, borderRadius: w * 0.05, backgroundColor: INK.g, transform: [{ rotate: "-8deg" }] }]} />
      <View style={[styles.abs, { left: (w - body) / 2, top: h * 0.2, width: body, height: body * 0.9, borderRadius: body / 2, backgroundColor: INK.g }]} />
      <View style={[styles.abs, { left: w * 0.44, top: h * 0.1, width: w * 0.24, height: w * 0.24, borderRadius: w * 0.12, backgroundColor: INK.b }]} />
      <View style={[styles.abs, { left: w * 0.52, top: h * 0.14, width: w * 0.08, height: w * 0.08, borderRadius: w * 0.04, backgroundColor: m.face }]} />
      <View style={[styles.abs, { left: w * 0.66, top: h * 0.17, width: w * 0.14, height: w * 0.05, backgroundColor: INK.r, transform: [{ rotate: "12deg" }] }]} />
    </>
  );
};

const Glyph = ({ text, ink, size, top }: { text: string; ink: Ink; size: number; top?: number }) => (
  <Text style={[styles.glyph, { color: INK[ink], fontSize: size, lineHeight: size * 1.12 }, top === undefined ? null : { marginTop: top }]} allowFontScaling={false}>
    {text}
  </Text>
);

export const TileFace = ({ kind, w, h }: { kind: number; w: number; h: number }) => {
  if (isWind(kind)) return <Glyph text={WINDS[kind - 27]} ink="b" size={w * 0.74} />;
  if (isDragon(kind)) {
    if (kind === 31) return <Glyph text="中" ink="r" size={w * 0.78} />;
    if (kind === 32) return <Glyph text="發" ink="g" size={w * 0.74} />;
    const fw = w * 0.66;
    const fh = h * 0.78;
    const edge = Math.max(1, w * 0.07);
    return (
      <View style={[styles.centred, { width: fw, height: fh, borderWidth: edge, borderColor: INK.b, borderRadius: w * 0.06 }]}>
        <View style={{ width: fw - edge * 4, height: fh - edge * 4, borderWidth: Math.max(0.75, edge * 0.5), borderColor: INK.b }} />
      </View>
    );
  }
  const suit: Suit = suitOf(kind);
  const rank = (kind % 9) + 1;
  if (suit === 2) {
    return (
      <View style={styles.centred}>
        <Glyph text={NUMERALS[rank - 1]} ink="b" size={w * 0.46} />
        <Glyph text="萬" ink="r" size={w * 0.52} top={-w * 0.08} />
      </View>
    );
  }
  return (
    <View style={{ width: w, height: h }}>
      {suit === 0
        ? rank === 1
          ? <OneDot w={w} h={h} />
          : DOTS[rank].spots.map(([x, y, ink]) => <Dot key={`${x}:${y}`} x={x} y={y} ink={ink} d={DOTS[rank].size * w} w={w} h={h} />)
        : rank === 1
          ? <Bird w={w} h={h} />
          : BAMBOO[rank].map(([x, y, ink, length, tilt]) => <StickView key={`${x}:${y}`} x={x} y={y} ink={ink} length={length} tilt={tilt} w={w} h={h} />)}
    </View>
  );
};

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  centred: { alignItems: "center", justifyContent: "center" },
  glyph: { fontWeight: "800", textAlign: "center" },
});
