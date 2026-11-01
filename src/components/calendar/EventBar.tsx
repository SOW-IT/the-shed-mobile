import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import type { CalendarCategory, Due } from "@shared/calendar";
import { eventColour } from "@/components/calendar/categoryColours";
import { useAppTheme } from "@/theme";

// One row of bars in the month, or in the week view's strip of longer events.
export const BAR_ROW = 17;

// Where a bar sits across a week's seven columns.
export const barColumn = (col: number, span = 1) => ({
  left: `${(col / 7) * 100}%` as const,
  width: `${(span / 7) * 100}%` as const,
});

// Flat at an end where the event carries on into the week before or after.
export const EventBar = ({
  event,
  fromBefore,
  toAfter,
}: {
  event: { name: string; category: CalendarCategory; subgroups: string[]; due: Due | null };
  fromBefore: boolean;
  toAfter: boolean;
}) => {
  const t = useAppTheme();
  const colour = eventColour(event);
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: `${colour}26`, borderLeftColor: colour },
        fromBefore && styles.fromBefore,
        toAfter && styles.toAfter,
      ]}
    >
      <Text numberOfLines={1} style={[styles.text, { color: t.text }]}>
        {event.due ? <Ionicons name="flag" size={9} color={colour} /> : null}
        {event.due ? " " : ""}
        {event.name}
      </Text>
    </View>
  );
};

export const MoreLabel = ({ count }: { count: number }) => {
  const t = useAppTheme();
  return (
    <Text numberOfLines={1} style={[styles.text, { color: t.muted }]}>
      +{count} more
    </Text>
  );
};

const styles = StyleSheet.create({
  bar: {
    height: BAR_ROW - 2,
    borderLeftWidth: 3,
    borderRadius: 3,
    paddingHorizontal: 3,
    justifyContent: "center",
    overflow: "hidden",
  },
  fromBefore: { borderLeftWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  toAfter: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  text: { fontSize: 10, lineHeight: 13, fontWeight: "600" },
});
