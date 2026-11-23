import { Btn, Field, Muted, Sheet } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { WorldMember } from "./useWorld";
import type { WorldView } from "./view";

const problem = (e: unknown) => (e instanceof ConvexError ? String(e.data) : "That didn't work. Try again.");

/**
 * Someone you tapped: wave, mute their bubbles for this visit, block them
 * for good, or report them to the leaders.
 */
export const PersonSheet = ({
  person,
  safetyOnly = false,
  muted,
  near,
  onToggleMute,
  onWave,
  onHighFive,
  onCustomize,
  onClose,
  onDone,
}: {
  person: WorldMember | null;
  safetyOnly?: boolean;
  muted: boolean;
  /** Close enough for a high five. */
  near: boolean;
  onToggleMute: (memberId: string) => void;
  onWave: () => void;
  onHighFive: (to: Id<"worldMembers">) => void;
  /** Your own sheet's way into the character editor. */
  onCustomize: () => void;
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
  const name = person?.name ?? "";
  if (person?.isMe) {
    return (
      <Sheet visible={visible} onClose={close} title="You">
        <View style={styles.stack}>
          <Btn title="Customize your character" icon="shirt-outline" variant="tonal" onPress={onCustomize} />
          <Muted>Change your skin, hair, shirt, hat and extras. Everyone here sees it when you save.</Muted>
        </View>
      </Sheet>
    );
  }
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
          {safetyOnly ? null : (
            <>
            <Btn
              title="High five"
              icon="hand-right-outline"
              disabled={!near}
              onPress={() => {
                onHighFive(person!.memberId);
                close();
              }}
            />
            {near ? null : <Muted>Walk a bit closer to high five.</Muted>}
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

/** Who's here, the people you've blocked, and the garden or list view. */
export const PeopleSheet = ({
  visible,
  people,
  view,
  onView,
  onPerson,
  onCustomize,
  onClose,
}: {
  visible: boolean;
  people: WorldMember[];
  view: WorldView;
  onView: (view: WorldView) => void;
  onPerson: (memberId: string) => void;
  onCustomize: () => void;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const blocked = useQuery(api.world.myBlocks, visible ? {} : "skip");
  const unblock = useMutation(api.world.unblock);
  return (
    <Sheet visible={visible} onClose={onClose} title="People here">
      <View style={styles.stack}>
        {people.length === 0 ? <Muted>Nobody else is here right now.</Muted> : null}
        {people.map((p) => (
          <Pressable
            key={p.memberId}
            disabled={p.isMe}
            onPress={() => onPerson(p.memberId)}
            accessibilityRole="button"
            accessibilityLabel={p.isMe ? `${p.name} (you)` : p.name}
            style={({ pressed }) => [styles.row, { borderColor: t.border }, pressed && { opacity: 0.7 }]}
          >
            <Text style={[typography.body, { color: t.text, flex: 1 }]}>{p.isMe ? `${p.name} (you)` : p.name}</Text>
          </Pressable>
        ))}
        <Btn title="Customize your character" icon="shirt-outline" variant="tonal" onPress={onCustomize} />
        {Platform.OS === "android" ? null : (
        <Btn
          title={view === "garden" ? "Show as a list" : "Show the garden"}
          icon={view === "garden" ? "list-outline" : "leaf-outline"}
          variant="tonal"
          onPress={() => onView(view === "garden" ? "list" : "garden")}
        />
        )}
        {blocked && blocked.length > 0 ? (
          <>
            <Text style={[typography.label, { color: t.muted }]}>Blocked</Text>
            {blocked.map((b) => (
              <View key={b.id} style={[styles.row, { borderColor: t.border }]}>
                <Text style={[typography.body, { color: t.text, flex: 1 }]}>{b.name}</Text>
                <Btn title="Unblock" variant="ghost" onPress={() => void unblock({ blockId: b.id as Id<"worldBlocks"> })} />
              </View>
            ))}
          </>
        ) : null}
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  stack: { gap: spacing.md, paddingBottom: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
