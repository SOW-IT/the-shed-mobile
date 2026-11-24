import { fixedColours } from "@/theme";
import { Image, StyleSheet, View } from "react-native";

const MARK = require("../../../assets/images/mark-dark.png");
const coin = fixedColours.games.coin;

export const GoldCoin = ({ size }: { size: number }) => (
  <View style={[styles.coin, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(1.5, size * 0.08) }]}>
    <Image source={MARK} style={{ width: size * 0.72, height: size * 0.72, tintColor: coin.mark }} resizeMode="contain" />
  </View>
);

const styles = StyleSheet.create({
  coin: { backgroundColor: coin.face, borderColor: coin.rim, alignItems: "center", justifyContent: "center" },
});
