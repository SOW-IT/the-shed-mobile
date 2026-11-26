import { Btn, ErrorBanner, Field, Muted, Sheet, errorMessage } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";
import {
  cleanPokeMessage,
  DEFAULT_POKE_MESSAGE,
  MAX_POKE_MESSAGE_LENGTH,
  pokeCooldownLabel,
} from "@shared/devotionalGroups";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type PokeResult =
  | { ok: true; pokedCount: number }
  | { ok: false; retryInMs: number };

const PokeGroupBody = ({
  groupName,
  unfinishedCount,
  onSubmit,
  onClose,
}: {
  groupName: string;
  unfinishedCount: number;
  onSubmit: (message?: string) => Promise<PokeResult>;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = Array.from(message).length;

  const handleSend = async () => {
    const checked = cleanPokeMessage(message);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    setSending(true);
    try {
      const result = await onSubmit(checked.message ?? undefined);
      if (!result.ok) {
        setError(`This group was poked recently. Try again in ${pokeCooldownLabel(result.retryInMs)}.`);
        return;
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.form}>
      <Muted>
        {unfinishedCount <= 0
          ? "Everyone has already done today's devotional."
          : unfinishedCount === 1
            ? `Send a notification to the 1 member of ${groupName} who hasn't done today's devotional yet.`
            : `Send a notification to the ${unfinishedCount} members of ${groupName} who haven't done today's devotional yet.`}
      </Muted>

      <Field
        label="Message (optional)"
        value={message}
        onChangeText={setMessage}
        placeholder={DEFAULT_POKE_MESSAGE}
        autoCapitalize="sentences"
        multiline
        maxLength={MAX_POKE_MESSAGE_LENGTH}
        testID="poke-message-input"
      />

      <View style={styles.hintRow}>
        <Text style={[typography.caption, styles.hintText, { color: t.muted }]}>
          Leave blank to send the default nudge.
        </Text>
        <Text style={[typography.caption, { color: t.faint }]}>
          {charCount}/{MAX_POKE_MESSAGE_LENGTH}
        </Text>
      </View>

      <ErrorBanner message={error} />

      <View style={styles.submitWrap}>
        <Btn
          title="Send poke"
          icon="notifications-outline"
          loading={sending}
          disabled={unfinishedCount <= 0}
          onPress={() => void handleSend()}
        />
      </View>
    </View>
  );
};

export const PokeGroupSheet = ({
  visible,
  groupName,
  unfinishedCount,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  groupName: string;
  unfinishedCount: number;
  onSubmit: (message?: string) => Promise<PokeResult>;
  onClose: () => void;
}) => (
  <Sheet visible={visible} title="Poke group" onClose={onClose}>
    {visible ? (
      <PokeGroupBody
        groupName={groupName}
        unfinishedCount={unfinishedCount}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    ) : null}
  </Sheet>
);

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: -spacing.xs,
  },
  hintText: { flex: 1 },
  submitWrap: { paddingTop: spacing.xs },
});
