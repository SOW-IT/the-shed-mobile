import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { appLinkFor } from "../../../shared/appLinks";
import { compactAgo } from "@shared/datetime";
import { sydneyDateTime } from "@/lib/sydneyTime";
import { Btn, ErrorBanner, errorMessage, Muted, Sheet } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { QrCode } from "./QrCode";

const webOrigin = (): string =>
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : appLinkFor(process.env.EXPO_PUBLIC_APP_VARIANT).web;

export const checkInUrl = (token: string) => `${webOrigin()}/checkin/${token}`;

export function useCheckInPending(eventId: Id<"events">) {
  return useQuery(api.checkIn.pending, { eventId });
}

export function CheckInSheet({
  eventId,
  visible,
  onClose,
}: {
  eventId: Id<"events">;
  visible: boolean;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const status = useQuery(api.checkIn.status, visible ? { eventId } : "skip");
  const pending = useCheckInPending(eventId);
  const enable = useMutation(api.checkIn.enable);
  const disable = useMutation(api.checkIn.disable);
  const confirm = useMutation(api.checkIn.confirm);
  const dismiss = useMutation(api.checkIn.dismiss);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
  const share = () => {
    if (!url) return;
    if (Platform.OS === "web") {
      void navigator.clipboard?.writeText(url).then(
        () => setCopied(true),
        () => setCopied(false)
      );
      return;
    }
    void Share.share({ message: url, url }).catch(() => {});
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Self check-in">
      <View style={{ gap: spacing.md }}>
        <ErrorBanner message={error} />
        {status === undefined ? null : status === null ? (
          <Muted>Sign in to use self check-in.</Muted>
        ) : !status.token ? (
          <>
            <Muted>
              People scan a code, type their name and pick their campus. Nobody can see the member
              list from the page. Each check-in waits here until you confirm it.
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
            <Text style={[typography.caption, { color: status.phase === "open" ? t.success : t.warning, textAlign: "center" }]}>
              {status.phase === "open"
                ? `Open until ${sydneyDateTime(status.closesAt)}`
                : status.phase === "before"
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
                onPress={() => void act("disable", () => disable({ eventId }))}
              />
            </View>
          </>
        )}

        <Text style={[typography.label, { color: t.muted, marginTop: spacing.sm }]}>
          Waiting{pending && pending.length > 0 ? ` · ${pending.length}` : ""}
        </Text>
        {!pending || pending.length === 0 ? (
          <Muted>No one is waiting.</Muted>
        ) : (
          pending.map((row) => (
            <View key={row.id} style={[styles.request, { backgroundColor: t.inputBackground }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.body, { color: t.text, fontWeight: "700" }]}>{row.name}</Text>
                <Text style={[typography.caption, { color: t.muted }]}>
                  {[row.campus, compactAgo(row.requestedAt)].filter(Boolean).join(" · ")}
                </Text>
                <Text style={[typography.caption, { color: row.match ? t.success : t.accent }]}>
                  {row.match
                    ? row.match.alreadySignedIn
                      ? `Already signed in as ${row.match.name}`
                      : `Matches ${row.match.name}${row.match.campus ? ` (${row.match.campus})` : ""}`
                    : "No exact match. Confirming adds them as a new member."}
                </Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm ${row.name}`}
                  disabled={busy !== null}
                  onPress={() => void act(row.id, () => confirm({ requestId: row.id }))}
                  style={({ pressed }) => [
                    styles.round,
                    { backgroundColor: t.success },
                    (pressed || busy === row.id) && { opacity: 0.6 },
                  ]}
                >
                  <Ionicons name="checkmark" size={18} color={t.dark ? t.background : "#ffffff"} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss ${row.name}`}
                  disabled={busy !== null}
                  onPress={() => void act(`x${row.id}`, () => dismiss({ requestId: row.id }))}
                  style={({ pressed }) => [
                    styles.round,
                    { backgroundColor: t.ghost },
                    (pressed || busy === `x${row.id}`) && { opacity: 0.6 },
                  ]}
                >
                  <Ionicons name="close" size={18} color={t.ghostText} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  qrWrap: { alignItems: "center", paddingTop: spacing.sm },
  url: { textAlign: "center" },
  row: { flexDirection: "row", gap: spacing.sm, justifyContent: "center", flexWrap: "wrap" },
  request: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
