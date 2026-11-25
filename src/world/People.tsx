import { Btn, Field } from "@/components/ui";
import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { timeAgo } from "@shared/datetime";
import { isPlace, MAX_POKE_LENGTH, PLACE_TITLES, PLACES, type Look, type Place } from "@shared/world";
import { shortName } from "@shared/names";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { memo, useEffect, useState, type ReactNode } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { blurBehind, Bust, connectionLabel, GlassPill, itemStyle, placeLabel, popStyle, scrimStyle, SignalBars, useOverlayClock } from "./Overlays";
import { glass, signal } from "./palette";
import { useCardName } from "./settings";
import { problem } from "./Sheets";
import type { WorldMember } from "./useWorld";

const OFFLINE_PAGE = 25;

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

const OfflineList = ({ startOpen = false }: { startOpen?: boolean }) => {
  const [open, setOpen] = useState(startOpen);
  const [now, setNow] = useState(0);
  const people = usePaginatedQuery(api.world.offlineStaff, open ? {} : "skip", { initialNumItems: OFFLINE_PAGE });
  const wait = useQuery(api.world.pokeWait, open ? {} : "skip");
  const list = wait && people.status !== "LoadingFirstPage" ? { people: people.results, pokeAgainAt: wait.pokeAgainAt } : undefined;
  const poke = useMutation(api.world.pokeStaff);
  const inviteHome = useMutation(api.world.inviteStaff);
  const [writingTo, setWritingTo] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const cardName = useCardName();
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
  const send = async (profileId: Id<"staffProfiles">, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const args = { profileId, message: message.trim() || undefined };
      const reply = await (inviting ? inviteHome(args) : poke(args));
      if (!reply.ok) return setError(`You can poke again in ${Math.ceil(reply.retryInMs / 60_000)} min.`);
      setWritingTo(null);
      setMessage("");
      setSent(inviting ? `Invited ${shortName(name)} home.` : `Poked ${shortName(name)}. They'll get a notification.`);
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
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <Ionicons name="moon-outline" size={16} color={glass.muted} />
        <Text style={[styles.section, styles.grow]}>Not here right now</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={glass.muted} />
      </Pressable>
      {open && list === undefined ? <Text style={styles.note}>Loading…</Text> : null}
      {open && list?.people.length === 0 && people.status === "Exhausted" ? <Text style={styles.note}>Everyone on staff is here right now.</Text> : null}
      {open && list && list.people.length > 0 ? (
        <Text style={styles.note}>
          {waitMs > 0 ? `You can poke again in ${Math.min(60, Math.ceil(waitMs / 60_000))} min.` : "Poke someone to invite them in. One poke an hour."}
        </Text>
      ) : null}
      {open && sent ? <Text style={styles.sent}>{sent}</Text> : null}
      {open
        ? list?.people.map((p) => (
            <View key={p.id} style={styles.offlineRow}>
              <View style={styles.offlineHead}>
                <View style={styles.sleeper}>
                  <Ionicons name="person" size={16} color={glass.muted} />
                </View>
                <View style={styles.grow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {cardName(p.name)}
                  </Text>
                  <Text style={styles.where}>{p.lastSeenAt === null ? "Not been yet" : timeAgo(p.lastSeenAt, now)}</Text>
                </View>
                {writingTo === p.id ? null : (
                  <>
                    <GlassPill
                      icon="mail"
                      disabled={waitMs > 0}
                      accessibilityLabel={`Invite ${shortName(p.name)} to your home`}
                      testID={`world-invite-offline-${p.id}`}
                      onPress={() => {
                        setError(null);
                        setSent(null);
                        setMessage("");
                        setInviting(true);
                        setWritingTo(p.id);
                      }}
                    />
                    <GlassPill
                      label="Poke"
                      icon="notifications-outline"
                      disabled={waitMs > 0}
                      accessibilityLabel={`Poke ${shortName(p.name)}`}
                      onPress={() => {
                        setError(null);
                        setSent(null);
                        setMessage("");
                        setInviting(false);
                        setWritingTo(p.id);
                      }}
                    />
                  </>
                )}
              </View>
              {writingTo === p.id ? (
                <View style={styles.compose}>
                  <Field
                    label="Message (optional)"
                    value={message}
                    onChangeText={setMessage}
                    placeholder={inviting ? "Come over to my home." : "Come and join me here."}
                    maxLength={MAX_POKE_LENGTH}
                    autoCapitalize="sentences"
                    testID="world-poke-message"
                  />
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  <View style={styles.pokeButtons}>
                    <View style={styles.grow}>
                      <Btn title="Cancel" variant="tonal" onPress={() => setWritingTo(null)} />
                    </View>
                    <View style={styles.grow}>
                      <Btn title={inviting ? "Send invite" : "Send poke"} icon={inviting ? "mail-outline" : "notifications-outline"} loading={busy} onPress={() => void send(p.id, p.name)} />
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          ))
        : null}
      {open && people.status === "CanLoadMore" ? (
        <View testID="world-offline-more" style={styles.more}>
          <GlassPill label="Load more" icon="chevron-down" onPress={() => people.loadMore(OFFLINE_PAGE)} />
        </View>
      ) : null}
      {open && people.status === "LoadingMore" ? <Text style={styles.note}>Loading more…</Text> : null}
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
  onGo,
  onWalkOver,
  onFollow,
  onHome,
  onInvite,
  onClose,
  pokeListOpen = false,
  showPlaces = false,
}: {
  open: boolean;
  top: number;
  roomId: Id<"worldRooms"> | null;
  people: WorldMember[];
  place: Place;
  online: number;
  onPerson: (memberId: string) => void;
  onGo: (to: Place) => void;
  onWalkOver: (memberId: string) => void;
  onFollow: (to: Place, memberId: string) => void;
  onHome: () => void;
  onInvite: (memberId: Id<"worldMembers">, name: string) => void;
  onClose: () => void;
  pokeListOpen?: boolean;
  showPlaces?: boolean;
}) => {
  const overlay = useOverlayClock(open);
  const { width, height } = useWindowDimensions();
  const cardName = useCardName();
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
        <ScrollView style={styles.scroll} contentContainerStyle={styles.stack}>
          <Animated.View style={itemStyle(overlay, 1)}>
            <Section>{`Here · ${placeLabel(place)}`}</Section>
          </Animated.View>
          {people.length === 0 ? <Text style={styles.note}>Nobody else is here right now.</Text> : null}
          {people.map((p) => (
            <Animated.View key={p.memberId} style={itemStyle(overlay, next())}>
              <PersonRow
                look={p.look}
                name={p.isMe ? `${cardName(p.name)} (you)` : cardName(p.name)}
                where={p.away ? "🕹️ At the arcade" : placeLabel(place)}
                ping={p.isMe ? p.ping : barsOf.get(p.memberId)}
                label={p.isMe ? `${shortName(p.name)} (you)` : shortName(p.name)}
                onPress={p.isMe ? undefined : () => onPerson(p.memberId)}
                action={
                  p.isMe ? null : (
                    <>
                      <GlassPill icon="mail" onPress={() => onInvite(p.memberId, p.name)} accessibilityLabel={`Invite ${shortName(p.name)} to your home`} testID={`world-invite-${p.memberId}`} />
                      <GlassPill
                        icon="walk"
                        tone="accent"
                        onPress={() => onWalkOver(p.memberId)}
                        accessibilityLabel={`Walk over to ${shortName(p.name)}`}
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
                <Text style={styles.note}>{`and ${row.more} more in ${row.at ? PLACE_TITLES[row.at] : "other places"}`}</Text>
              ) : (
                <PersonRow
                  look={row.look}
                  name={cardName(row.name)}
                  where={row.at ? placeLabel(row.at) : "Somewhere else"}
                  ping={row.ping}
                  label={row.at ? `${shortName(row.name)}, in ${PLACE_TITLES[row.at]}` : shortName(row.name)}
                  onPress={row.at ? () => onFollow(row.at!, row.memberId) : undefined}
                  action={
                    row.at ? (
                      <>
                      <GlassPill icon="mail" onPress={() => onInvite(row.memberId, row.name)} accessibilityLabel={`Invite ${shortName(row.name)} to your home`} testID={`world-invite-${row.memberId}`} />
                      <GlassPill
                        icon="navigate"
                        tone="accent"
                        onPress={() => onFollow(row.at!, row.memberId)}
                        accessibilityLabel={`Go to ${shortName(row.name)} in ${PLACE_TITLES[row.at]}`}
                        testID={`world-follow-${row.memberId}`}
                      />
                      </>
                    ) : null
                  }
                />
              )}
            </Animated.View>
          ))}
          {showPlaces ? (
            <Animated.View style={[styles.places, itemStyle(overlay, next())]}>
              {PLACES.filter((to) => to !== place).map((to) => (
                <GlassPill key={to} label={placeLabel(to)} onPress={() => onGo(to)} accessibilityLabel={`Go to ${PLACE_TITLES[to]}`} testID={`world-go-${to}`} />
              ))}
              <GlassPill label="🏠 Your home" onPress={onHome} accessibilityLabel="Go to your home" testID="world-go-home" />
            </Animated.View>
          ) : null}
          <Animated.View style={itemStyle(overlay, next())}>
            <OfflineList startOpen={pokeListOpen} />
          </Animated.View>
          {blocked && blocked.length > 0 ? (
            <Animated.View style={[styles.stack, itemStyle(overlay, next())]}>
              <Section>Blocked</Section>
              {blocked.map((b) => (
                <View key={b.id} style={styles.offlineHead}>
                  <Text style={[styles.name, styles.grow]}>{shortName(b.name)}</Text>
                  <GlassPill label="Unblock" onPress={() => void unblock({ blockId: b.id as Id<"worldBlocks"> })} />
                </View>
              ))}
            </Animated.View>
          ) : null}
        </ScrollView>
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
  places: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  offline: { gap: 8 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  offlineRow: { gap: 8, padding: 8, borderRadius: 16, backgroundColor: glass.row },
  offlineHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sleeper: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  compose: { gap: 8 },
  pokeButtons: { flexDirection: "row", gap: 8 },
  more: { alignItems: "center" },
});
