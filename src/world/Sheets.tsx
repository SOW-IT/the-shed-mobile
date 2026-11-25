import { Btn, Field, Muted, Sheet } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { WorldMember } from "./useWorld";
import { shortName } from "@shared/names";
import { CafeRecord } from "./CafeGames";

export const problem = (e: unknown) => (e instanceof ConvexError ? String(e.data) : "That didn't work. Try again.");

/**
 * Someone you tapped: wave, mute their bubbles for this visit, block them
 * for good, or report them to the leaders.
 */
export const PersonSheet = ({
  person,
  safetyOnly = false,
  muted,
  onToggleMute,
  onWave,
  onHighFive,
  onDuel,
  onPlay,
  onClose,
  onDone,
}: {
  person: Pick<WorldMember, "memberId" | "name"> | null;
  safetyOnly?: boolean;
  muted: boolean;
  onToggleMute: (memberId: string) => void;
  onWave: () => void;
  onHighFive: (to: Id<"worldMembers">) => void;
  onDuel: (to: Id<"worldMembers">) => void;
  onPlay?: (to: Id<"worldMembers">) => void;
  onClose: () => void;
  onDone: (note: string) => void;
}) => {
  const t = useAppTheme();
  const block = useMutation(api.world.block);
  const report = useMutation(api.world.report);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setReporting(false);
    setReason("");
    setError(null);
    onClose();
  };
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
      onDone(done);
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  };
  const visible = person !== null;
  const name = person ? shortName(person.name) : "";
  return (
    <Sheet visible={visible} onClose={close} title={name}>
      {reporting ? (
        <View style={styles.stack}>
          <Muted>
            Tell the leaders what happened. Your report keeps the garden&apos;s last few lines, so they can see them
            after the chat is cleared. {name} won&apos;t see who reported them.
          </Muted>
          <Field label="What happened" value={reason} onChangeText={setReason} multiline maxLength={500} autoCapitalize="sentences" testID="world-report-reason" />
          {error ? <Text style={[typography.caption, { color: t.danger }]}>{error}</Text> : null}
          <Btn
            title="Send report"
            variant="danger"
            loading={busy}
            disabled={!reason.trim()}
            onPress={() => void run(() => report({ memberId: person!.memberId, reason }), "Report sent. Thank you.")}
          />
          <Btn title="Cancel" variant="ghost" onPress={() => setReporting(false)} />
        </View>
      ) : (
        <View style={styles.stack}>
          {person ? <CafeRecord memberId={person.memberId} testID="world-person-record" /> : null}
          {onPlay ? (
            <Btn
              title="Play a game"
              icon="dice-outline"
              onPress={() => onPlay(person!.memberId)}
            />
          ) : null}
          {safetyOnly ? null : (
            <>
            <Btn
              title="High five"
              icon="hand-right-outline"
              onPress={() => {
                onHighFive(person!.memberId);
                close();
              }}
            />
            <Btn
              title="Rock paper scissors"
              icon="game-controller-outline"
              variant="tonal"
              onPress={() => {
                onDuel(person!.memberId);
                close();
              }}
            />
            <Muted>If they&apos;re not beside you, you walk over first.</Muted>
            <Btn
              title={`Wave at ${name.split(" ")[0]}`}
              icon="hand-left-outline"
              variant="tonal"
              onPress={() => {
                onWave();
                close();
              }}
            />
            </>
          )}
          <Btn
            title={muted ? "Unmute" : "Mute"}
            icon={muted ? "volume-high-outline" : "volume-mute-outline"}
            variant="tonal"
            onPress={() => {
              onToggleMute(person!.memberId);
              close();
            }}
          />
          <Muted>Muting hides their bubbles until you leave the garden.</Muted>
          <Btn
            title="Block"
            icon="ban-outline"
            variant="danger"
            loading={busy}
            onPress={() => void run(() => block({ memberId: person!.memberId }), `${name} is blocked.`)}
          />
          <Muted>Blocking hides you from each other in the garden, every visit. You can unblock from People here.</Muted>
          <Btn title="Report" icon="flag-outline" variant="danger" onPress={() => setReporting(true)} />
          {error ? <Text style={[typography.caption, { color: t.danger }]}>{error}</Text> : null}
        </View>
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  stack: { gap: spacing.md, paddingBottom: spacing.lg },
});
