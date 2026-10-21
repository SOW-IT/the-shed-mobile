import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import Constants from "expo-constants";
import { appLinkForScheme } from "../../../shared/appLinks";
import { type MemberChoice, searchMembers, suggestMembers, yearLevelLabel } from "../../../shared/checkInMatch";
import { subgroupLabel } from "../../../shared/rollcall";
import { sydneyDateTime, sydneyTime } from "@/lib/sydneyTime";
import { Btn, ConfirmDialog, ErrorBanner, errorMessage, Muted, OptionSheet, SearchField, Sheet } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { QrCode } from "./QrCode";
import { phaseBetween } from "../../../shared/checkInWindow";
import { useMinuteTick } from "@/hooks/useMinuteTick";

const appScheme = (): string | undefined => {
  const scheme = Constants.expoConfig?.scheme;
  return Array.isArray(scheme) ? scheme[0] : scheme;
};

const webOrigin = (): string =>
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : appLinkForScheme(appScheme()).web;

export const checkInUrl = (token: string) => `${webOrigin()}/checkin/${token}`;

export function useCheckInPending(eventId: Id<"events">) {
  return useQuery(api.checkIn.pending, { eventId });
}

export type CheckInMember = MemberChoice & { subtitle?: string };

type PendingRow = NonNullable<ReturnType<typeof useCheckInPending>>[number];

const requestDetails = (row: PendingRow) =>
  [
    row.campus ? subgroupLabel(row.campus) : null,
    row.yearLevel ? yearLevelLabel(row.yearLevel) : null,
    `checked in ${sydneyTime(row.requestedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

const memberLabel = (member: MemberChoice) =>
  [member.name, member.university ? subgroupLabel(member.university) : null].filter(Boolean).join(" · ");

function Pill({
  label,
  onPress,
  disabled,
  tone = "neutral",
  icon,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "neutral";
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
}) {
  const t = useAppTheme();
  const colour = tone === "primary" ? t.primary : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: tone === "primary" ? t.primary : t.border },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={colour} /> : null}
      <Text style={[typography.caption, { color: colour, fontWeight: "700" }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  disabled,
  dimmed,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled: boolean;
  dimmed: boolean;
  tone: "success" | "ghost";
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: tone === "success" ? t.success : t.ghost },
        (pressed || dimmed) && { opacity: 0.6 },
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={tone === "success" ? (t.dark ? t.background : "#ffffff") : t.ghostText}
      />
    </Pressable>
  );
}

function MemberPicker({
  row,
  members,
  signedIn,
  onPick,
  onNew,
  onClose,
}: {
  row: PendingRow | null;
  members: readonly CheckInMember[] | undefined;
  signedIn: ReadonlySet<string>;
  onPick: (row: PendingRow, memberId: Id<"attendanceMembers">) => void;
  onNew: (row: PendingRow) => void;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const [query, setQuery] = useState("");
  const close = () => {
    setQuery("");
    onClose();
  };
  const searching = query.trim().length > 0;
  const shown = row
    ? searching
      ? searchMembers(query, members ?? [])
      : suggestMembers(row.name, row.campus, members ?? [], 8)
    : [];
  return (
    <OptionSheet
      visible={row !== null}
      title={row ? `Who is ${row.name}?` : ""}
      onClose={close}
      footer={
        row ? (
          <Btn
            title={`Add ${row.name} as a new member`}
            icon="person-add-outline"
            variant="tonal"
            onPress={() => {
              close();
              onNew(row);
            }}
          />
        ) : null
      }
    >
      <SearchField value={query} onChangeText={setQuery} placeholder="Search the member list" />
      {!searching && shown.length > 0 ? (
        <Text style={[typography.label, { color: t.muted }]}>Similar names</Text>
      ) : null}
      {shown.length === 0 ? (
        <Muted>
          {searching
            ? "No one on the member list by that name."
            : members
              ? "No one with a similar name. Search for them, or add them as a new member."
              : "Loading the member list…"}
        </Muted>
      ) : (
        shown.map((member) => {
          const current = row?.match?.memberId === member.memberId;
          return (
            <Pressable
              key={member.memberId}
              accessibilityRole="button"
              accessibilityLabel={`${row?.name} is ${memberLabel(member)}`}
              onPress={() => {
                close();
                if (row) onPick(row, member.memberId as Id<"attendanceMembers">);
              }}
              style={({ pressed }) => [
                styles.pickRow,
                { backgroundColor: current ? t.primarySoft : t.inputBackground },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.body, { color: t.text, fontWeight: "700" }]} numberOfLines={1}>
                  {member.name}
                </Text>
                <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
                  {[
                    current ? "Matched now" : null,
                    signedIn.has(member.memberId) ? "Already signed in" : null,
                    member.university ? subgroupLabel(member.university) : "No campus",
                    member.subtitle,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.faint} />
            </Pressable>
          );
        })
      )}
    </OptionSheet>
  );
}

export function CheckInSheet({
  eventId,
  visible,
  onClose,
  members,
  signedInMemberIds,
}: {
  eventId: Id<"events">;
  visible: boolean;
  onClose: () => void;
  members?: readonly CheckInMember[];
  signedInMemberIds?: ReadonlySet<string>;
}) {
  const t = useAppTheme();
  useMinuteTick();
  const status = useQuery(api.checkIn.status, visible ? { eventId } : "skip");
  const pending = useCheckInPending(eventId);
  const enable = useMutation(api.checkIn.enable);
  const disable = useMutation(api.checkIn.disable);
  const confirm = useMutation(api.checkIn.confirm);
  const confirmMatched = useMutation(api.checkIn.confirmMatched);
  const dismiss = useMutation(api.checkIn.dismiss);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [picking, setPicking] = useState<PendingRow | null>(null);
  const signedIn = signedInMemberIds ?? new Set<string>();

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const url = status?.token ? checkInUrl(status.token) : null;
  const phase = status ? phaseBetween(status) : null;
  const share = () => {
    if (!url) return;
    if (Platform.OS === "web") {
      void navigator.clipboard?.writeText(url).then(
        () => setCopied(true),
        () => setCopied(false)
      );
      return;
    }
    void Share.share(Platform.OS === "ios" ? { url } : { message: url }).catch(() => {});
  };

  const matched = (pending ?? []).filter((row) => row.match);
  const unmatched = (pending ?? []).filter((row) => !row.match);
  const suggestions = useMemo(
    () =>
      new Map(
        (pending ?? [])
          .filter((row) => !row.match)
          .map((row) => [
            row.id,
            members
              ? suggestMembers(row.name, row.campus, members)
              : row.choices.map((choice) => ({ memberId: choice.memberId, name: row.name, university: choice.campus })),
          ])
      ),
    [pending, members]
  );
  const signIn = (row: PendingRow, memberId?: Id<"attendanceMembers">) =>
    void act(row.id, () => confirm({ requestId: row.id, ...(memberId ? { memberId } : {}) }));
  const addAsNew = (row: PendingRow) => void act(row.id, () => confirm({ requestId: row.id, asNew: true }));
  const dismissRow = (row: PendingRow) => void act(`x${row.id}`, () => dismiss({ requestId: row.id }));

  return (
    <Sheet visible={visible} onClose={onClose} title="Self check-in">
      <View style={{ gap: spacing.md }}>
        <ErrorBanner message={error} />
        {status === undefined ? null : status === null ? (
          <Muted>Sign in to use self check-in.</Muted>
        ) : !status.token ? (
          <>
            <Muted>
              People scan a code and type their name, and can add their university and year. Nobody
              can see the member list from the page. A first check-in waits here for you to match it
              to a member; after that, the same phone signs them straight in. Leaders who open the
              link while signed in are signed in at once.
            </Muted>
            <Muted>
              The code works from two hours before the event until ten minutes after it ends.
            </Muted>
            <Btn
              title="Turn on self check-in"
              icon="qr-code-outline"
              loading={busy === "enable"}
              onPress={() => void act("enable", () => enable({ eventId }))}
            />
          </>
        ) : (
          <>
            <View style={styles.qrWrap}>
              <QrCode value={url!} size={232} />
            </View>
            <Text selectable style={[typography.caption, styles.url, { color: t.muted }]}>
              {url}
            </Text>
            <Text style={[typography.caption, { color: phase === "open" ? t.success : t.warning, textAlign: "center" }]}>
              {phase === "open"
                ? `Open until ${sydneyDateTime(status.closesAt)}`
                : phase === "before"
                  ? `Opens ${sydneyDateTime(status.opensAt)}`
                  : "Closed. The event has ended."}
            </Text>
            <View style={styles.row}>
              <Btn
                title={Platform.OS === "web" ? (copied ? "Copied" : "Copy link") : "Share link"}
                icon={Platform.OS === "web" ? "copy-outline" : "share-outline"}
                variant="tonal"
                onPress={share}
              />
              <Btn
                title="Turn off"
                variant="ghost"
                loading={busy === "disable"}
                onPress={() => setConfirmOff(true)}
              />
            </View>
          </>
        )}

        <Text style={[typography.label, { color: t.muted, marginTop: spacing.sm }]}>
          Waiting{pending && pending.length > 0 ? ` · ${pending.length}` : ""}
        </Text>
        {!pending || pending.length === 0 ? (
          <Muted>No one is waiting.</Muted>
        ) : null}

        {matched.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <View style={styles.sectionHead}>
              <Text style={[typography.headline, { color: t.text, flex: 1 }]}>Matched · {matched.length}</Text>
              <Btn
                title={matched.length === 1 ? "Sign in" : `Sign in all ${matched.length}`}
                icon="checkmark-done-outline"
                variant="success"
                loading={busy === "all"}
                disabled={busy !== null && busy !== "all"}
                onPress={() =>
                  void act("all", () => confirmMatched({ requestIds: matched.map((row) => row.id) }))
                }
              />
            </View>
            {matched.map((row) => (
              <View key={row.id} style={[styles.request, { backgroundColor: t.inputBackground }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.body, { color: t.text, fontWeight: "700" }]}>{row.name}</Text>
                  <Text style={[typography.caption, { color: t.muted }]}>{requestDetails(row)}</Text>
                  <Text style={[typography.caption, { color: t.success }]}>
                    {row.match!.alreadySignedIn
                      ? `Already signed in as ${row.match!.name}`
                      : `Matches ${row.match!.name}${row.match!.campus ? ` (${subgroupLabel(row.match!.campus)})` : ""}`}
                  </Text>
                  <View style={styles.pills}>
                    <Pill
                      label="Someone else"
                      icon="swap-horizontal-outline"
                      accessibilityLabel={`${row.name} is someone else`}
                      disabled={busy !== null}
                      onPress={() => setPicking(row)}
                    />
                  </View>
                </View>
                <View style={styles.actions}>
                  <RoundButton
                    icon="checkmark"
                    label={`Sign in ${row.name}`}
                    tone="success"
                    disabled={busy !== null}
                    dimmed={busy === row.id}
                    onPress={() => signIn(row)}
                  />
                  <RoundButton
                    icon="close"
                    label={`Dismiss ${row.name}`}
                    tone="ghost"
                    disabled={busy !== null}
                    dimmed={busy === `x${row.id}`}
                    onPress={() => dismissRow(row)}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {unmatched.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.headline, { color: t.text }]}>Needs a member · {unmatched.length}</Text>
            {unmatched.map((row) => {
              const rowSuggestions: MemberChoice[] = suggestions.get(row.id) ?? [];
              return (
                <View key={row.id} style={[styles.request, { backgroundColor: t.inputBackground }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[typography.body, { color: t.text, fontWeight: "700" }]}>{row.name}</Text>
                    <Text style={[typography.caption, { color: t.muted }]}>{requestDetails(row)}</Text>
                    <Text style={[typography.caption, { color: t.accent }]}>
                      {rowSuggestions.length > 0
                        ? "Is it one of these? Tap to sign them in, or add a new member."
                        : "Not on the member list. Find them, or add a new member."}
                    </Text>
                    {rowSuggestions.length > 0 ? (
                      <View style={styles.pills}>
                        {rowSuggestions.map((member) => (
                          <Pill
                            key={member.memberId}
                            tone="primary"
                            icon="person-outline"
                            label={`${memberLabel(member)}${signedIn.has(member.memberId) ? " · signed in" : ""}`}
                            accessibilityLabel={`Sign in ${row.name} as ${memberLabel(member)}`}
                            disabled={busy !== null}
                            onPress={() => signIn(row, member.memberId as Id<"attendanceMembers">)}
                          />
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.pills}>
                      <Pill
                        label="Find member"
                        icon="search-outline"
                        accessibilityLabel={`Find ${row.name} on the member list`}
                        disabled={busy !== null}
                        onPress={() => setPicking(row)}
                      />
                      <Pill
                        label="New member"
                        icon="person-add-outline"
                        accessibilityLabel={`Add ${row.name} as a new member`}
                        disabled={busy !== null}
                        onPress={() => addAsNew(row)}
                      />
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <RoundButton
                      icon="close"
                      label={`Dismiss ${row.name}`}
                      tone="ghost"
                      disabled={busy !== null}
                      dimmed={busy === `x${row.id}` || busy === row.id}
                      onPress={() => dismissRow(row)}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
      <MemberPicker
        row={picking}
        members={members}
        signedIn={signedIn}
        onPick={(row, memberId) => signIn(row, memberId)}
        onNew={addAsNew}
        onClose={() => setPicking(null)}
      />
      <ConfirmDialog
        visible={confirmOff}
        title="Turn off self check-in?"
        message="The code and link stop working straight away. Turning it on again makes a new code, so anything you printed or shared won't work. People already waiting stay on the list."
        confirmLabel="Turn off"
        onConfirm={() => void act("disable", () => disable({ eventId }))}
        onClose={() => setConfirmOff(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  qrWrap: { alignItems: "center", paddingTop: spacing.sm },
  url: { textAlign: "center" },
  row: { flexDirection: "row", gap: spacing.sm, justifyContent: "center", flexWrap: "wrap" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  request: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "100%",
  },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
