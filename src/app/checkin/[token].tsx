import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { capitalizeMemberName, formatEventRange } from "../../../shared/rollcall";
import { Btn, Card, EmptyState, ErrorBanner, errorMessage, Field, LoadingState, Muted, Screen } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const KEY_STORAGE = "checkInClientKey";

const randomKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

const deviceKey = (): string => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(KEY_STORAGE);
      if (saved) return saved;
      const fresh = randomKey();
      window.localStorage.setItem(KEY_STORAGE, fresh);
      return fresh;
    } catch {
      return randomKey();
    }
  }
  return randomKey();
};

export default function CheckInScreen() {
  const t = useAppTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const page = useQuery(api.checkIn.page, token ? { token } : "skip");
  const submit = useMutation(api.checkIn.submit);
  const [clientKey] = useState(deviceKey);
  const [name, setName] = useState("");
  const [campus, setCampus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; status: "pending" | "confirmed" } | null>(null);

  if (page === undefined) return <LoadingState />;
  if (page === null) {
    return (
      <Screen title="Check in" maxWidth={520}>
        <EmptyState
          icon="qr-code-outline"
          title="This check-in link isn't valid"
          message="Ask a leader for the code on their phone, or let them sign you in."
        />
      </Screen>
    );
  }

  const campusChoice = page.campuses.length === 1 ? page.campuses[0].value : campus;
  const needsCampus = page.campuses.length > 1 && !campusChoice;
  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await submit({
        token: token!,
        name,
        clientKey,
        ...(campusChoice ? { campus: campusChoice } : {}),
      });
      setDone({ name: capitalizeMemberName(name.trim().replace(/\s+/g, " ")), status: result.status });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen title="Check in" maxWidth={520}>
      <View style={{ gap: spacing.md }}>
        <Card>
          <Text style={[typography.title, { color: t.text }]}>{page.name}</Text>
          <Muted>{formatEventRange(page.dateStart, page.dateEnd)}</Muted>
        </Card>
        {done ? (
          <Card>
            <View style={styles.doneRow}>
              <Ionicons name="checkmark-circle" size={28} color={t.success} />
              <Text style={[typography.headline, { color: t.text, flex: 1 }]}>
                {done.status === "confirmed" ? `You're signed in, ${done.name}.` : `Thanks, ${done.name}.`}
              </Text>
            </View>
            <Muted>
              {done.status === "confirmed"
                ? "A leader has already confirmed you. Enjoy the night."
                : "A leader will confirm your check-in shortly. You can close this page."}
            </Muted>
            <Btn title="Check in someone else" variant="ghost" onPress={() => { setDone(null); setName(""); }} />
          </Card>
        ) : !page.open ? (
          <Card>
            <Muted>
              {page.phase === "before"
                ? "Check-in hasn't opened yet. It opens two hours before the event."
                : "Check-in for this event has closed. Ask a leader to sign you in."}
            </Muted>
          </Card>
        ) : (
          <Card>
            <Field
              label="Your full name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              maxLength={80}
              testID="checkin-name"
            />
            {page.campuses.length > 1 ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={[typography.label, { color: t.muted }]}>Your campus</Text>
                <View style={styles.chips}>
                  {page.campuses.map((c) => {
                    const picked = campusChoice === c.value;
                    return (
                      <Pressable
                        key={c.value}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: picked }}
                        onPress={() => setCampus(c.value)}
                        style={[
                          styles.chip,
                          { borderColor: picked ? t.primary : t.border, backgroundColor: picked ? t.primarySoft : t.card },
                        ]}
                      >
                        <Text style={[typography.label, { color: picked ? t.primary : t.text }]}>{c.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <ErrorBanner message={error} />
            <Btn
              title="Check in"
              icon="log-in-outline"
              loading={sending}
              disabled={name.trim().length < 2 || needsCampus}
              onPress={() => void send()}
            />
            <Muted>Only your name and campus are sent. A leader confirms it on their phone.</Muted>
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
});
