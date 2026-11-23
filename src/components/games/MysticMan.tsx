import { fixedColours } from "@/theme";
import { StyleSheet, View } from "react-native";

const c = fixedColours.games.runner;

/**
 * Mystic Man: a hooded figure in a purple cloak with a gold star and
 * glowing eyes. `stride` (0 to 1) swings his legs; sliding lays him low.
 */
export const MysticMan = ({ sliding, stride, airborne }: { sliding: boolean; stride: number; airborne: boolean }) => {
  if (sliding) {
    return (
      <View style={styles.slide} pointerEvents="none">
        <View style={[styles.slideCape, styles.rim, { backgroundColor: c.cloakDark }]} />
        <View style={[styles.slideBody, styles.rim, { backgroundColor: c.cloak }]}>
          <View style={[styles.slideTrim, { backgroundColor: c.trim }]} />
        </View>
        <View style={[styles.slideHead, styles.rim, { backgroundColor: c.cloak }]}>
          <View style={[styles.face, styles.slideFace, { backgroundColor: c.face }]}>
            <View style={[styles.eye, { backgroundColor: c.eyes }]} />
            <View style={[styles.eye, { backgroundColor: c.eyes }]} />
          </View>
        </View>
      </View>
    );
  }
  const swing = airborne ? 0.5 : stride;
  const front = Math.round((swing - 0.5) * 10);
  return (
    <View style={styles.stand} pointerEvents="none">
      <View style={[styles.cape, styles.rim, { backgroundColor: c.cloakDark, transform: [{ skewX: `${-12 - front}deg` }] }]} />
      <View style={[styles.leg, { backgroundColor: c.cloakDark, left: 9 + front }]} />
      <View style={[styles.leg, { backgroundColor: c.cloakDark, left: 15 - front }]} />
      <View style={[styles.body, styles.rim, { backgroundColor: c.cloak }]}>
        <View style={[styles.trim, { backgroundColor: c.trim }]} />
        <View style={[styles.star, { backgroundColor: c.trim }]} />
      </View>
      <View style={[styles.hoodTip, { borderBottomColor: c.rim }]} />
      <View style={[styles.hood, styles.rim, { backgroundColor: c.cloak }]}>
        <View style={[styles.face, { backgroundColor: c.face }]}>
          <View style={[styles.eye, { backgroundColor: c.eyes }]} />
          <View style={[styles.eye, { backgroundColor: c.eyes }]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  stand: { width: 28, height: 54 },
  cape: { position: "absolute", left: 0, top: 20, width: 14, height: 26, borderRadius: 4 },
  leg: { position: "absolute", bottom: 0, width: 5, height: 10, borderRadius: 2 },
  body: {
    position: "absolute",
    left: 4,
    top: 20,
    width: 20,
    height: 26,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    alignItems: "center",
  },
  rim: { borderWidth: 1.5, borderColor: c.rim },
  trim: { position: "absolute", bottom: 3, left: 0, right: 0, height: 3 },
  star: { marginTop: 7, width: 6, height: 6, transform: [{ rotate: "45deg" }] },
  hoodTip: {
    position: "absolute",
    left: 7,
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  hood: {
    position: "absolute",
    left: 4,
    top: 6,
    width: 20,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  face: {
    width: 14,
    height: 10,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    marginTop: 3,
  },
  eye: { width: 3, height: 3, borderRadius: 2 },
  slide: { width: 40, height: 26 },
  slideCape: { position: "absolute", left: 0, top: 10, width: 16, height: 10, borderRadius: 4 },
  slideBody: {
    position: "absolute",
    left: 6,
    bottom: 0,
    width: 24,
    height: 16,
    borderRadius: 7,
    overflow: "hidden",
  },
  slideTrim: { position: "absolute", left: 0, right: 0, bottom: 3, height: 3 },
  slideHead: {
    position: "absolute",
    right: 0,
    top: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  slideFace: { marginTop: 2, marginLeft: 4, width: 12 },
});
