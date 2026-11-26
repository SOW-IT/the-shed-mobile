import { Btn, Field } from "@/components/ui";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { timeAgo } from "@shared/datetime";
import { playingLabel } from "@shared/games";
import { IN_APP_TICK_MS, inAppTick } from "@shared/appPresence";
import { isPlace, MAX_POKE_LENGTH, OFFLINE_ALL_MAX, OFFLINE_FIRST, whereIs, type Look, type Place } from "@shared/world";
import { useMutation, useQuery } from "convex/react";
import { memo, useEffect, useState, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { blurBehind, Bust, connectionLabel, elsewhereLabel, GlassPill, itemStyle, placeLabel, popStyle, scrimStyle, SignalBars, useOverlayClock } from "./Overlays";
import { glass, signal } from "./palette";
import { useWorldName } from "./settings";
import { problem } from "./Sheets";
import type { WorldMember } from "./useWorld";

const PersonRow = memo(function PersonRow({
  look,
  name,
  where,
  ping,
  onPress,
  label,
  action,
  testID,
}: {
  look: Look;
  name: string;
  where: string;
  ping?: number;
  onPress?: () => void;
  label: string;
  action?: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={`${label}. ${connectionLabel(ping)}`}
        testID={testID}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <Bust look={look} size={40} />
        <View style={styles.grow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.where} numberOfLines={1}>
            {where}
          </Text>
        </View>
      </Pressable>
      {action}
      <SignalBars bars={ping} />
    </View>
  );
});

const Section = ({ children }: { children: string }) => <Text style={styles.section}>{children}</Text>;


const useInAppTick = (active: boolean) => {
  const [tick, setTick] = useState(() => inAppTick(Date.now()));
  useEffect(() => {
    if (!active) return;
    const refresh = () => setTick(inAppTick(Date.now()));
    const soon = setTimeout(refresh, 0);
    const id = setInterval(refresh, IN_APP_TICK_MS);
    return () => {
      clearTimeout(soon);
      clearInterval(id);
    };
  }, [active]);
  return tick;
};

const usePokes = (active: boolean) => {
  const [now, setNow] = useState(0);
  const wait = useQuery(api.world.pokeWait, active ? {} : "skip");
  const poke = useMutation(api.world.pokeStaff);
  const inviteHome = useMutation(api.world.inviteStaff);
  const [writingTo, setWritingTo] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const worldName = useWorldName();
  const pokeAgainAt = wait?.pokeAgainAt;
  const waitMs = pokeAgainAt === undefined ? 0 : pokeAgainAt - now;
  useEffect(() => {
    if (!active || pokeAgainAt === undefined) return;
    const refresh = () => setNow(Date.now());
    const soon = setTimeout(refresh, 0);
    const whenAllowed = setTimeout(refresh, Math.max(0, pokeAgainAt - Date.now()) + 250);
    return () => {
      clearTimeout(soon);
      clearTimeout(whenAllowed);
    };
  }, [active, pokeAgainAt]);
  const write = (to: string, invite: boolean) => {
    setError(null);
    setSent(null);
    setMessage("");
    setInviting(invite);
    setWritingTo(to);
  };
  const send = async (profileId: Id<"staffProfiles">, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const args = { profileId, message: message.trim() || undefined };
      const reply = await (inviting ? inviteHome(args) : poke(args));
      if (!reply.ok) return setError(`You can poke again in ${Math.ceil(reply.retryInMs / 60_000)} min.`);
      setWritingTo(null);
      setMessage("");
      setSent(inviting ? `Invited ${worldName(name)} home.` : `Poked ${worldName(name)}. They'll get a notification.`);
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  };
  return {
    now,
    setNow,
    loaded: wait !== undefined,
    waitMs,
    writingTo,
    inviting,
    message,
    setMessage,
    busy,
    error,
    sent,
    write,
    cancel: () => setWritingTo(null),
    send,
  };
};

type Pokes = ReturnType<typeof usePokes>;

const AwayRow = ({
  person,
  status,
  pokes,
  testID,
}: {
  person: { id: Id<"staffProfiles">; name: string; look: Look };
  status: ReactNode;
  pokes: Pokes;
  testID?: string;
}) => {
  const worldName = useWorldName();
  const writing = pokes.writingTo === person.id;
  return (
    <View style={styles.offlineRow} testID={testID}>
      <View style={styles.offlineHead}>
        <Bust look={person.look} size={32} />
        <View style={styles.grow}>
          <Text style={styles.name} numberOfLines={1}>
            {worldName(person.name)}
          </Text>
          {status}
        </View>
        {writing ? null : (
          <>
            <GlassPill
              icon="mail"
              disabled={pokes.waitMs > 0}
              accessibilityLabel={`Invite ${worldName(person.name)} to your home`}
              testID={`world-invite-offline-${person.id}`}
              onPress={() => pokes.write(person.id, true)}
            />
            <GlassPill
              label="Poke"
              icon="notifications-outline"
              disabled={pokes.waitMs > 0}
              accessibilityLabel={`Poke ${worldName(person.name)}`}
              onPress={() => pokes.write(person.id, false)}
            />
          </>
        )}
      </View>
      {writing ? (
        <View style={styles.compose}>
          <Field
            label="Message (optional)"
            value={pokes.message}
            onChangeText={pokes.setMessage}
            placeholder={pokes.inviting ? "Come over to my home." : "Come and join me here."}
            maxLength={MAX_POKE_LENGTH}
            autoCapitalize="sentences"
            testID="world-poke-message"
          />
          {pokes.error ? <Text style={styles.error}>{pokes.error}</Text> : null}
          <View style={styles.pokeButtons}>
            <View style={styles.grow}>
              <Btn title="Cancel" variant="tonal" onPress={pokes.cancel} />
            </View>
            <View style={styles.grow}>
              <Btn
                title={pokes.inviting ? "Send invite" : "Send poke"}
                icon={pokes.inviting ? "mail-outline" : "notifications-outline"}
                loading={pokes.busy}
                onPress={() => void pokes.send(person.id, person.name)}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const pokeWaitNote = (waitMs: number) => `You can poke again in ${Math.min(60, Math.ceil(waitMs / 60_000))} min.`;

const ShowMore = ({ testID, onPress }: { testID: string; onPress: () => void }) => (
  <View testID={testID} style={styles.more}>
    <GlassPill label="Show more" icon="chevron-down" onPress={onPress} />
  </View>
);

const InAppList = ({ visible }: { visible: boolean }) => {
  const [limit, setLimit] = useState(OFFLINE_FIRST);
  const tick = useInAppTick(visible);
  const fetched = useQuery(api.world.inApp, visible ? { limit, tick } : "skip");
  const [kept, setKept] = useState(fetched);
  if (fetched !== undefined && fetched !== kept) setKept(fetched);
  const list = visible ? (fetched ?? kept) : undefined;
  const shown = !!list && list.people.length > 0;
  const pokes = usePokes(shown);
  if (!list || !shown) return null;
  const more = list.more && limit < OFFLINE_ALL_MAX && fetched !== undefined;
  return (
    <View style={styles.offline} testID="world-in-app">
      <View style={styles.toggle}>
        <Ionicons name="phone-portrait-outline" size={16} color={glass.muted} />
        <Text style={[styles.section, styles.grow]}>In the app</Text>
      </View>
      {pokes.waitMs > 0 ? <Text style={styles.note}>{pokeWaitNote(pokes.waitMs)}</Text> : null}
      {pokes.sent ? <Text style={styles.sent}>{pokes.sent}</Text> : null}
      {list.people.map((p) => (
        <AwayRow
          key={p.id}
          person={p}
          pokes={pokes}
          testID={`world-in-app-${p.id}`}
          status={
            <View style={styles.status}>
              <View style={styles.inAppDot} />
              <Text style={styles.where}>In the app</Text>
            </View>
          }
        />
      ))}
      {fetched === undefined ? <Text style={styles.note}>Loading…</Text> : null}
      {more ? <ShowMore testID="world-in-app-more" onPress={() => setLimit((was) => Math.min(OFFLINE_ALL_MAX, was + OFFLINE_FIRST))} /> : null}
    </View>
  );
};

const OfflineList = ({ startOpen = false }: { startOpen?: boolean }) => {
  const [open, setOpen] = useState(startOpen);
  const [asked, setAsked] = useState(startOpen);
  if (startOpen !== asked) {
    setAsked(startOpen);
    if (startOpen) setOpen(true);
  }
  const [limit, setLimit] = useState(OFFLINE_FIRST);
  const tick = useInAppTick(open);
  const fetched = useQuery(api.world.offlineRecent, open ? { limit, skipInApp: true, tick } : "skip");
  const [kept, setKept] = useState(fetched);
  if (fetched !== undefined && fetched !== kept) setKept(fetched);
  const offline = fetched ?? (open ? kept : undefined);
  const pokes = usePokes(open);
  const list = pokes.loaded && offline ? { people: offline.people, more: offline.more && limit < OFFLINE_ALL_MAX, loading: fetched === undefined } : undefined;
  const { now, waitMs } = pokes;
  return (
    <View style={styles.offline}>
      <Pressable
        onPress={() => {
          pokes.setNow(Date.now());
          if (open) setLimit(OFFLINE_FIRST);
          setOpen((was) => !was);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Not here right now"
        testID="world-offline-toggle"
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <Ionicons name="moon-outline" size={16} color={glass.muted} />
        <Text style={[styles.section, styles.grow]}>Not here right now</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={glass.muted} />
      </Pressable>
      {open && list === undefined ? <Text style={styles.note}>Loading…</Text> : null}
      {open && list?.people.length === 0 ? <Text style={styles.note}>Nobody else right now.</Text> : null}
      {open && list && list.people.length > 0 ? (
        <Text style={styles.note}>{waitMs > 0 ? pokeWaitNote(waitMs) : "Poke someone to invite them in. One poke an hour."}</Text>
      ) : null}
      {open && pokes.sent ? <Text style={styles.sent}>{pokes.sent}</Text> : null}
      {open
        ? list?.people.map((p) => (
            <AwayRow
              key={p.id}
              person={p}
              pokes={pokes}
              status={<Text style={styles.where}>{p.lastOnlineAt === null ? "Not seen yet" : `Seen ${timeAgo(p.lastOnlineAt, now)}`}</Text>}
            />
          ))
        : null}
      {open && list?.loading ? <Text style={styles.note}>Loading…</Text> : null}
      {open && list?.more && !list.loading ? (
        <ShowMore testID="world-offline-more" onPress={() => setLimit((was) => Math.min(OFFLINE_ALL_MAX, was + OFFLINE_FIRST))} />
      ) : null}
    </View>
  );
};

export const PeoplePanel = ({
  open,
  top,
  roomId,
  people,
  place,
  online,
  onPerson,
  onWalkOver,
  onInvite,
  onClose,
  pokeListOpen = false,
  playing,
}: {
  open: boolean;
  top: number;
  roomId: Id<"worldRooms"> | null;
  people: WorldMember[];
  place: Place;
  online: number;
  onPerson: (memberId: string) => void;
  onWalkOver: (memberId: string) => void;
  onInvite: (memberId: Id<"worldMembers">, name: string) => void;
  onClose: () => void;
  pokeListOpen?: boolean;
  playing?: ReadonlyMap<string, string>;
}) => {
  const overlay = useOverlayClock(open);
  const { width, height } = useWindowDimensions();
  const worldName = useWorldName();
  const blocked = useQuery(api.world.myBlocks, overlay.mounted ? {} : "skip");
  const elsewhere = useQuery(api.world.elsewhere, overlay.mounted ? {} : "skip");
  const pings = useQuery(api.world.pings, overlay.mounted && roomId ? { roomId } : "skip");
  const unblock = useMutation(api.world.unblock);
  if (!overlay.mounted) return null;
  const barsOf = new Map(pings?.map((row) => [row.memberId, row.bars]));
  const others = (elsewhere ?? []).flatMap((spot) => {
    const at = isPlace(spot.place) ? spot.place : null;
    const rows = (spot.people ?? []).map((p, i) => ({ key: `${spot.place}${i}`, at, ...p }));
    const more = spot.count - rows.length;
    return more > 0 ? [...rows, { key: `${spot.place}more`, at, more }] : rows;
  });
  let index = 2;
  const next = () => index++;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close people" testID="world-people-close">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle(overlay)]} />
      </Pressable>
      <Animated.View style={[styles.panel, blurBehind, { top, width: Math.min(440, width - 28), maxHeight: Math.max(260, height - top - 24) }, popStyle(overlay)]} testID="world-people-panel">
        <Animated.View style={[styles.header, itemStyle(overlay, 0)]}>
          <Ionicons name="people" size={20} color={glass.text} />
          <Text style={styles.title} accessibilityRole="header">
            People
          </Text>
          <View style={styles.online}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{online} online</Text>
          </View>
          <View style={styles.grow} />
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" testID="world-people-x" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={glass.text} />
          </Pressable>
        </Animated.View>
        <SharpScrollView style={styles.scroll} contentContainerStyle={styles.stack}>
          <Animated.View style={itemStyle(overlay, 1)}>
            <Section>{`Here · ${placeLabel(place)}`}</Section>
          </Animated.View>
          {people.length === 0 ? <Text style={styles.note}>Nobody else is here right now.</Text> : null}
          {people.map((p) => (
            <Animated.View key={p.memberId} style={itemStyle(overlay, next())}>
              <PersonRow
                look={p.look}
                name={p.isMe ? `${worldName(p.name)} (you)` : worldName(p.name)}
                where={p.away ? `🕹️ ${playingLabel(p.playing) ?? "At the arcade"}` : (playing?.get(p.memberId) ?? placeLabel(place))}
                ping={p.isMe ? p.ping : barsOf.get(p.memberId)}
                label={p.isMe ? `${worldName(p.name)} (you)` : worldName(p.name)}
                onPress={p.isMe ? undefined : () => onPerson(p.memberId)}
                action={
                  p.isMe ? null : (
                    <>
                      <GlassPill icon="mail" onPress={() => onInvite(p.memberId, p.name)} accessibilityLabel={`Invite ${worldName(p.name)} to your home`} testID={`world-invite-${p.memberId}`} />
                      <GlassPill
                        icon="walk"
                        tone="accent"
                        onPress={() => onWalkOver(p.memberId)}
                        accessibilityLabel={`Walk over to ${worldName(p.name)}`}
                        testID={`world-walk-${p.memberId}`}
                      />
                    </>
                  )
                }
                testID={`world-person-${p.isMe ? "me" : p.memberId}`}
              />
            </Animated.View>
          ))}
          <Animated.View style={itemStyle(overlay, next())}>
            <Section>Elsewhere</Section>
          </Animated.View>
          {elsewhere && others.length === 0 ? <Text style={styles.note}>Nobody is anywhere else right now.</Text> : null}
          {others.map((row) => (
            <Animated.View key={row.key} style={itemStyle(overlay, next())} testID={row.at ? `world-elsewhere-${row.at}` : undefined}>
              {"more" in row ? (
                <Text style={styles.note}>{`and ${row.more} more ${row.at ? whereIs(row.at) : "in other places"}`}</Text>
              ) : (
                <PersonRow
                  look={row.look}
                  name={worldName(row.name)}
                  where={row.at ? elsewhereLabel(row.at) : "Somewhere else"}
                  ping={row.ping}
                  label={row.at ? `${worldName(row.name)}, ${whereIs(row.at)}` : worldName(row.name)}
                  action={
                    row.at ? (
                      <GlassPill icon="mail" onPress={() => onInvite(row.memberId, row.name)} accessibilityLabel={`Invite ${worldName(row.name)} to your home`} testID={`world-invite-${row.memberId}`} />
                    ) : null
                  }
                />
              )}
            </Animated.View>
          ))}
          <Animated.View style={itemStyle(overlay, next())}>
            <InAppList visible={overlay.mounted} />
          </Animated.View>
          <Animated.View style={itemStyle(overlay, next())}>
            <OfflineList startOpen={pokeListOpen} />
          </Animated.View>
          {blocked && blocked.length > 0 ? (
            <Animated.View style={[styles.stack, itemStyle(overlay, next())]}>
              <Section>Blocked</Section>
              {blocked.map((b) => (
                <View key={b.id} style={styles.offlineHead}>
                  <Text style={[styles.name, styles.grow]}>{worldName(b.name)}</Text>
                  <GlassPill label="Unblock" onPress={() => void unblock({ blockId: b.id as Id<"worldBlocks"> })} />
                </View>
              ))}
            </Animated.View>
          ) : null}
        </SharpScrollView>
      </Animated.View>
    </View>
  );
};


const styles = StyleSheet.create({
  scrim: { backgroundColor: glass.scrim },
  panel: {
    position: "absolute",
    right: 14,
    borderRadius: 24,
    backgroundColor: glass.panel,
    borderWidth: 1.5,
    borderColor: glass.edge,
    paddingTop: 12,
    overflow: "hidden",
    transformOrigin: "top right",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  title: { fontFamily: fonts.display, fontSize: 20, color: glass.text, letterSpacing: -0.3 },
  online: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: glass.row },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: signal.good },
  onlineText: { color: glass.text, fontSize: 12, fontWeight: "700" },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  scroll: { flexGrow: 0 },
  stack: { gap: 8, paddingHorizontal: 12, paddingBottom: 14 },
  section: { color: glass.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 16, backgroundColor: glass.row },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  pressed: { opacity: 0.7 },
  grow: { flex: 1 },
  name: { color: glass.text, fontFamily: fonts.display, fontSize: 15 },
  where: { color: glass.muted, fontSize: 12, marginTop: 1 },
  note: { color: glass.muted, fontSize: 13, paddingHorizontal: 4 },
  sent: { color: glass.text, fontSize: 13, fontWeight: "600", paddingHorizontal: 4 },
  error: { color: glass.error, fontSize: 13 },
  offline: { gap: 8 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  offlineRow: { gap: 8, padding: 8, borderRadius: 16, backgroundColor: glass.row },
  offlineHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  compose: { gap: 8 },
  pokeButtons: { flexDirection: "row", gap: 8 },
  more: { alignItems: "center" },
  status: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  inAppDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: signal.fair },
});
