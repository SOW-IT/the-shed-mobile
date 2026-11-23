import { Btn, Muted, OptionSheet, Row } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * Asked when you go back in the middle of a run. Continue is the default:
 * it's the main button, and closing the dialog any other way (the backdrop,
 * Escape on web) carries on too.
 */
export const LeaveGameDialog = ({
  visible,
  onLeave,
  onContinue,
  inline = false,
}: {
  visible: boolean;
  onLeave: () => void;
  onContinue: () => void;
  /**
   * Drawn in place over the game instead of in a modal: a modal is its own
   * window, upright in portrait, which is wrong over a game turned sideways.
   */
  inline?: boolean;
}) =>
  inline ? (
    visible ? <InlineDialog onLeave={onLeave} onContinue={onContinue} /> : null
  ) : (
  <OptionSheet
    visible={visible}
    title="Leave this game?"
    onClose={onContinue}
    footer={
      <Row spread>
        <Btn title="Leave game" variant="danger" onPress={onLeave} />
        <Btn title="Continue" onPress={onContinue} />
      </Row>
    }
  >
    <Muted>{MESSAGE}</Muted>
  </OptionSheet>
  );

const MESSAGE = "The game is paused. If you leave, this run ends and its score isn't saved.";

const InlineDialog = ({ onLeave, onContinue }: { onLeave: () => void; onContinue: () => void }) => {
  const t = useAppTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} accessibilityViewIsModal>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]}
        onPress={onContinue}
        accessibilityLabel="Continue"
      />
      <View style={[styles.card, { backgroundColor: t.card }]} accessibilityRole="alert">
        <Text style={[typography.headline, { color: t.text }]}>Leave this game?</Text>
        <Muted>{MESSAGE}</Muted>
        <Row spread>
          <Btn title="Leave game" variant="danger" onPress={onLeave} />
          <Btn title="Continue" onPress={onContinue} />
        </Row>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl, zIndex: 20 },
  card: { width: "100%", maxWidth: 420, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
});
