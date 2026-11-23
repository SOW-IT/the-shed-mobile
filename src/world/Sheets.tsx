import { Btn, Field, Muted, Sheet } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { timeAgo } from "@shared/datetime";
import { MAX_POKE_LENGTH, tagName } from "@shared/world";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
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
              onPress={() => {
                onHighFive(person!.memberId);
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

const OfflineList = () => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const list = useQuery(api.world.offline, open ? {} : "skip");
  const poke = useMutation(api.world.poke);
  const [writingTo, setWritingTo] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const waitMs = list ? list.pokeAgainAt - now : 0;
  const pokeAgainAt = list?.pokeAgainAt;
  useEffect(() => {
    if (!open || pokeAgainAt === undefined) return;
    const refresh = () => setNow(Date.now());
    const soon = setTimeout(refresh, 0);
    const whenAllowed = setTimeout(refresh, Math.max(0, pokeAgainAt - Date.now()) + 250);
    return () => {
      clearTimeout(soon);
      clearTimeout(whenAllowed);
    };
  }, [open, pokeAgainAt]);
  const send = async (visitorId: Id<"worldVisitors">, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const reply = await poke({ visitorId, message: message.trim() || undefined });
      if (!reply.ok) return setError(`You can poke again in ${Math.ceil(reply.retryInMs / 60_000)} min.`);
      setWritingTo(null);
      setMessage("");
      setSent(`Poked ${tagName(name)}. They'll get a notification.`);
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.offline}>
      <Pressable
        onPress={() => {
          setNow(Date.now());
          setOpen((was) => !was);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Not here right now"
        testID="world-offline-toggle"
        style={({ pressed }) => [styles.row, { borderColor: t.border }, pressed && { opacity: 0.7 }]}
      >
        <Text style={[typography.label, { color: t.muted, flex: 1 }]}>Not here right now</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={t.muted} />
      </Pressable>
      {open && list === undefined ? <Muted>Loading…</Muted> : null}
      {open && list?.people.length === 0 ? <Muted>Nobody else has been in the garden yet.</Muted> : null}
      {open && list && list.people.length > 0 ? (
        <Muted>
          {waitMs > 0
            ? `You can poke again in ${Math.min(60, Math.ceil(waitMs / 60_000))} min.`
            : "Poke someone to invite them in. One poke an hour."}
        </Muted>
      ) : null}
      {open && sent ? <Text style={[typography.caption, { color: t.text }]}>{sent}</Text> : null}
      {open
        ? list?.people.map((p) => (
            <View key={p.id} style={[styles.offlineRow, { borderColor: t.border }]}>
              <View style={styles.offlineHead}>
                <Text style={[typography.body, { color: t.text, flex: 1 }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[typography.caption, { color: t.muted }]}>{timeAgo(p.lastSeenAt, now)}</Text>
                {writingTo === p.id ? null : (
                  <Btn
                    title="Poke"
                    variant="ghost"
                    disabled={waitMs > 0}
                    onPress={() => {
                      setError(null);
                      setSent(null);
                      setMessage("");
                      setWritingTo(p.id);
                    }}
                  />
                )}
              </View>
              {writingTo === p.id ? (
                <View style={styles.stack}>
                  <Field
                    label="Message (optional)"
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Come and join me in the Garden."
                    maxLength={MAX_POKE_LENGTH}
                    autoCapitalize="sentences"
                    testID="world-poke-message"
                  />
                  {error ? <Text style={[typography.caption, { color: t.danger }]}>{error}</Text> : null}
                  <View style={styles.pokeButtons}>
                    <View style={styles.grow}>
                      <Btn title="Cancel" variant="ghost" onPress={() => setWritingTo(null)} />
                    </View>
                    <View style={styles.grow}>
                      <Btn title="Send poke" icon="notifications-outline" loading={busy} onPress={() => void send(p.id, p.name)} />
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          ))
        : null}
    </View>
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
        <OfflineList />
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
  offline: { gap: spacing.sm },
  offlineRow: { paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  offlineHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pokeButtons: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
