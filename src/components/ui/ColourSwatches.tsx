import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TAG_COLOUR_NAMES, tagColourHex, type TagColourName } from "@shared/attendanceTags";
import { typography, useAppTheme, fixedColours } from "@/theme";

const SWATCH = 32;

// The palette as a grid of dots, with the chosen one's name under it. With
// `none`, a first dot stands for no colour of its own (its hex is the colour
// that's worn instead).
export const ColourSwatches = ({
  value,
  onChange,
  none,
}: {
  value: TagColourName | null;
  onChange: (colour: TagColourName | null) => void;
  none?: { label: string; hex: string };
}) => {
  const t = useAppTheme();
  const dot = (key: string, hex: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={2}
      style={({ pressed }) => [
        styles.ring,
        { borderColor: selected ? t.text : "transparent" },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: hex }]}>
        {selected ? <Ionicons name="checkmark" size={18} color={fixedColours.onColour} /> : null}
      </View>
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.grid}>
        {none ? dot("none", none.hex, none.label, value === null, () => onChange(null)) : null}
        {TAG_COLOUR_NAMES.map((colour) =>
          dot(colour, tagColourHex(colour), colour, value === colour, () => onChange(colour))
        )}
      </View>
      <Text style={[typography.caption, { color: t.muted }]}>
        {value === null ? (none?.label ?? "") : value[0].toUpperCase() + value.slice(1)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  ring: {
    width: SWATCH + 8,
    height: SWATCH + 8,
    borderRadius: (SWATCH + 8) / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
