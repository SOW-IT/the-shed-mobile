import { Pressable, Text, View } from "react-native";
import { tagColourHex } from "../../../shared/attendanceTags";
import { radius, typography } from "@/theme";

export const AttendanceTagPill = ({
  name,
  colour,
  selected,
  onPress,
  small,
}: {
  name: string;
  colour?: string;
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
}) => {
  const hex = tagColourHex(colour);
  const content = (
    <View
      style={{
        backgroundColor: selected ? hex : `${hex}22`,
        borderColor: hex,
        borderWidth: 2,
        borderRadius: radius.full,
        paddingHorizontal: small ? 8 : 12,
        paddingVertical: small ? 3 : 5,
      }}
    >
      <Text
        style={[
          typography.caption,
          {
            color: selected ? "#fff" : hex,
            fontWeight: "600",
            fontSize: small ? 11 : 12,
          },
        ]}
      >
        {name}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {content}
    </Pressable>
  );
};
