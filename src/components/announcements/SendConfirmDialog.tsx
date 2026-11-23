import { type EmailChoice, missesSomeone } from "@shared/announcements";
import { Btn, Muted, OptionSheet, Row, styles as ui } from "@/components/ui";
import { NoPushList, type NoPushPerson } from "./NoPushList";

/**
 * The confirmation every send and schedule goes through. It always opens, and
 * lists anyone a push can't reach with a one-tap way to email them or everyone.
 * When someone would get neither, it says so in the title and the button.
 */
export const SendConfirmDialog = ({
  visible,
  action,
  summary,
  withoutApp,
  email,
  onEmailThem,
  onEmailEveryone,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  action: "Send" | "Schedule";
  summary: string | undefined;
  withoutApp: readonly NoPushPerson[];
  email: EmailChoice;
  onEmailThem: () => void;
  onEmailEveryone: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const warn = missesSomeone(withoutApp.length, email);
  const n = withoutApp.length;
  return (
    <OptionSheet
      visible={visible}
      title={
        warn
          ? `${n === 1 ? "1 person" : `${n} people`} won't get a push`
          : `${action} this announcement?`
      }
      onClose={onClose}
      contentStyle={ui.confirmContent}
      footer={
        <Row spread>
          <Btn title={warn ? "Go back" : "Cancel"} variant="ghost" onPress={onClose} />
          <Btn
            title={warn ? `${action} anyway` : action}
            variant={warn ? "danger" : "primary"}
            onPress={() => {
              onConfirm();
              onClose();
            }}
          />
        </Row>
      }
    >
      {summary ? <Muted>{summary}</Muted> : null}
      {warn ? (
        <Muted>
          {n === 1 ? "They" : "These people"} won&apos;t get a push or an email, so they&apos;ll only
          see it if they open THE SHED.
        </Muted>
      ) : null}
      <NoPushList
        withoutApp={withoutApp}
        email={email}
        onEmailThem={onEmailThem}
        onEmailEveryone={onEmailEveryone}
      />
    </OptionSheet>
  );
};
