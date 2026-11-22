import { Btn, Muted, OptionSheet, Row } from "@/components/ui";

/**
 * Asked when you go back in the middle of a run. Continue is the default:
 * it's the main button, and closing the dialog any other way (the backdrop,
 * Escape on web) carries on too.
 */
export const LeaveGameDialog = ({
  visible,
  onLeave,
  onContinue,
}: {
  visible: boolean;
  onLeave: () => void;
  onContinue: () => void;
}) => (
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
    <Muted>The game is paused. If you leave, this run ends and its score isn&apos;t saved.</Muted>
  </OptionSheet>
);
