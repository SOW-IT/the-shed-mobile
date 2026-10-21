import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { capitalizeMemberName, formatEventRange } from "../../../shared/rollcall";
import { phaseBetween } from "../../../shared/checkInWindow";
import {
  CHECK_IN_YEAR_LEVELS,
  type CheckInDetails,
  type CheckInYearLevel,
  commencementForLevel,
  levelForCommencement,
} from "../../../shared/checkInMatch";
import { useMinuteTick } from "@/hooks/useMinuteTick";
import { forgetCheckInDetails, loadCheckInDetails, loadDeviceKey, saveCheckInDetails } from "@/lib/checkInDevice";
import { Btn, Card, EmptyState, ErrorBanner, errorMessage, Field, LoadingState, Muted, Screen } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type Device = { clientKey: string; details: CheckInDetails | null };

type Done = {
  name: string;
  via: "leader" | "phone" | "form";
  status: "pending" | "confirmed";
  automatic?: boolean;
  alreadySignedIn?: boolean;
  undone?: boolean;
};

type FormValues = { name: string; campus: string | null; level: CheckInYearLevel | null };

const BLANK: FormValues = { name: "", campus: null, level: null };

const cleanName = (raw: string) => capitalizeMemberName(raw.trim().replace(/\s+/g, " "));

const useCheckInDevice = () => {
  const [device, setDevice] = useState<Device | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([loadDeviceKey(), loadCheckInDetails()]).then(([clientKey, details]) => {
      if (live) setDevice({ clientKey, details });
    });
    return () => {
      live = false;
    };
  }, []);
  return [device, setDevice] as const;
};

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  const t = useAppTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const picked = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked }}
              accessibilityLabel={option.label}
              onPress={() => onChange(picked ? null : option.value)}
              style={[
                styles.chip,
                { borderColor: picked ? t.primary : t.border, backgroundColor: picked ? t.primarySoft : t.card },
              ]}
            >
              <Text style={[typography.label, { color: picked ? t.primary : t.text }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const YEAR_OPTIONS = CHECK_IN_YEAR_LEVELS.map((level) => ({ value: level, label: level }));

export default function CheckInScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <CheckInBody key={token ?? ""} token={token} />;
}

function CheckInBody({ token }: { token: string | undefined }) {
  const t = useAppTheme();
  const router = useRouter();
  useMinuteTick();
  const page = useQuery(api.checkIn.page, token ? { token } : "skip");
  const [device, setDevice] = useCheckInDevice();
  const remembered = device?.details ?? null;
  const [done, setDone] = useState<Done | null>(null);
  const [autoSettled, setAutoSettled] = useState(false);
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const returning = useQuery(
    api.checkIn.returning,
    token && device && remembered && !done && !autoSettled && !forSomeoneElse
      ? { token, clientKey: device.clientKey, name: remembered.name }
      : "skip"
  );
  const liveStatus = useQuery(
    api.checkIn.mine,
    token && device && done && done.via !== "leader" ? { token, clientKey: device.clientKey, name: done.name } : "skip"
  );
  const submit = useMutation(api.checkIn.submit);
  const signInLeader = useMutation(api.checkIn.signInLeader);
  const signOutLeader = useMutation(api.checkIn.signOutLeader);
  const undoMine = useMutation(api.checkIn.undoMine);
  const [form, setForm] = useState<FormValues | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  const phase = page ? phaseBetween(page) : null;
  const leader = page?.viewer?.leader ? page.viewer : null;
  const autoMode: "leader" | "phone" | null =
    !page || !device || phase !== "open" || done || forSomeoneElse || autoSettled
      ? null
      : leader
        ? "leader"
        : remembered && returning !== false
          ? "phone"
          : null;

  const leaderSignIn = async () => {
    try {
      const result = await signInLeader({ token: token! });
      setDone({ name: result.name, via: "leader", status: "confirmed", alreadySignedIn: result.alreadySignedIn });
    } catch (e) {
      setError(errorMessage(e));
    }
    setAutoSettled(true);
  };

  const submitDetails = async (values: FormValues, via: "phone" | "form", remember: boolean) => {
    if (!token || !device || !page) return;
    const campus = page.universities.length === 1 ? page.universities[0].value : values.campus;
    try {
      const result = await submit({
        token,
        name: values.name,
        clientKey: device.clientKey,
        ...(campus ? { campus } : {}),
        ...(values.level ? { yearLevel: values.level } : {}),
        ...(remember ? {} : { forSomeoneElse: true }),
      });
      const name = cleanName(values.name);
      if (remember) {
        const rememberedYear = remembered?.commencementYear ?? null;
        const sameLevel =
          rememberedYear !== null && values.level === levelForCommencement(rememberedYear, page.calendarYear);
        const details: CheckInDetails = {
          name,
          campus: campus ?? null,
          commencementYear: values.level
            ? sameLevel
              ? rememberedYear
              : commencementForLevel(values.level, page.calendarYear)
            : null,
        };
        void saveCheckInDetails(details);
        setDevice({ clientKey: device.clientKey, details });
      }
      setDone({
        name,
        via,
        status: result.status,
        automatic: result.automatic,
        alreadySignedIn: result.status === "confirmed" && !result.automatic,
      });
    } catch (e) {
      setError(errorMessage(e));
    }
    setAutoSettled(true);
  };

  const withSpinner = async (run: () => Promise<void>) => {
    setSending(true);
    setError(null);
    await run();
    setSending(false);
  };
  const signInAsLeader = () => withSpinner(leaderSignIn);
  const sendDetails = (values: FormValues, via: "phone" | "form", remember: boolean) =>
    withSpinner(() => submitDetails(values, via, remember));

  const rememberedValues = (): FormValues => {
    if (!page) return BLANK;
    const campus =
      remembered?.campus && page.universities.some((c) => c.value === remembered.campus) ? remembered.campus : null;
    const level =
      remembered?.commencementYear != null
        ? levelForCommencement(remembered.commencementYear, page.calendarYear)
        : null;
    return { name: remembered?.name ?? page.viewer?.name ?? "", campus, level };
  };

  useEffect(() => {
    if (!autoMode || autoTried.current) return;
    if (autoMode === "phone" && returning !== true) return;
    autoTried.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoMode === "leader") void leaderSignIn();
    else void submitDetails(rememberedValues(), "phone", true);
  });

  if (page === undefined || !device || autoMode) return <LoadingState />;
  const onBack =
    Platform.OS === "web" ? undefined : () => (router.canGoBack() ? router.back() : router.replace("/home"));
  if (page === null) {
    return (
      <Screen title="Check in" maxWidth={520} onBack={onBack}>
        <EmptyState
          icon="qr-code-outline"
          title="This check-in link isn't valid"
          message="Ask a leader for the code on their phone, or let them sign you in."
        />
      </Screen>
    );
  }

  const values = form ?? (forSomeoneElse ? BLANK : rememberedValues());
  const prefilled = !forSomeoneElse && form === null && !!remembered;
  const update = (patch: Partial<FormValues>) => setForm((prev) => ({ ...(prev ?? values), ...patch }));
  const startFresh = () => {
    void forgetCheckInDetails();
    setDevice({ clientKey: device.clientKey, details: null });
    setForm(BLANK);
  };
  const someoneElse = () => {
    setForSomeoneElse(true);
    setDone(null);
    setError(null);
    setForm(BLANK);
  };
  const checkInAsMe = () => {
    setForSomeoneElse(false);
    setDone(null);
    setError(null);
    setForm(BLANK);
  };
  const status = done?.via === "leader" ? "confirmed" : (liveStatus ?? done?.status);
  const canUndo =
    status === "confirmed" && !!done && (done.via === "leader" ? !done.alreadySignedIn : !!done.automatic);

  const undo = async () => {
    if (!done || !token) return;
    setSending(true);
    setError(null);
    try {
      const undone =
        done.via === "leader"
          ? await signOutLeader({ token })
          : await undoMine({ token, clientKey: device.clientKey, name: done.name });
      if (!undone) {
        setError("That sign-in can't be undone here. Please see a leader.");
      } else {
        if (done.via !== "leader") {
          void forgetCheckInDetails();
          setDevice({ clientKey: device.clientKey, details: null });
        }
        setDone({ ...done, undone: true });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const doneCard = done ? (
    <Card>
      {done.undone ? (
        <>
          <Text style={[typography.headline, { color: t.text }]}>
            {done.via === "leader" ? "You're not signed in." : `${done.name} isn't signed in.`}
          </Text>
          <Muted>
            {done.via === "leader"
              ? "Your sign-in was undone."
              : "The sign-in was undone, and this phone won't sign them in by itself again."}
          </Muted>
          <Btn
            title={done.via === "leader" ? "Sign me in again" : "Check in with my name"}
            icon="log-in-outline"
            loading={sending}
            onPress={() => (done.via === "leader" ? void signInAsLeader() : checkInAsMe())}
          />
        </>
      ) : (
        <>
          <View style={styles.doneRow}>
            <Ionicons
              name={status === "dismissed" ? "alert-circle" : status === "confirmed" ? "checkmark-circle" : "time"}
              size={28}
              color={status === "dismissed" ? t.warning : status === "confirmed" ? t.success : t.primary}
            />
            <Text style={[typography.headline, { color: t.text, flex: 1 }]}>
              {status === "confirmed"
                ? done.alreadySignedIn
                  ? `You're already signed in, ${done.name}.`
                  : `You're signed in, ${done.name}.`
                : status === "dismissed"
                  ? "A leader couldn't confirm this."
                  : `Thanks, ${done.name}.`}
            </Text>
          </View>
          <Muted>
            {status === "confirmed"
              ? done.via === "leader"
                ? "Signed in as a leader. Enjoy the night."
                : done.automatic
                  ? "This phone remembered you, so you're in. Enjoy the night."
                  : "Enjoy the night."
              : status === "dismissed"
                ? "Please see a leader to be signed in."
                : "A leader will confirm your check-in shortly. You can close this page."}
          </Muted>
          {done.via === "leader" && page.viewer?.eventId && Platform.OS !== "web" ? (
            <Btn
              title="Open roll call"
              icon="people-outline"
              variant="tonal"
              onPress={() => router.push(`/attendance/event/${page.viewer!.eventId}`)}
            />
          ) : null}
          {canUndo ? (
            <Btn
              title={done.via === "leader" ? "Undo" : `Not ${done.name}? Undo`}
              variant="ghost"
              loading={sending}
              onPress={() => void undo()}
            />
          ) : null}
        </>
      )}
      <Btn title="Check in someone else" variant="ghost" onPress={someoneElse} />
    </Card>
  ) : null;

  return (
    <Screen title="Check in" maxWidth={520} onBack={onBack}>
      <View style={{ gap: spacing.md }}>
        <Card>
          <Text style={[typography.title, { color: t.text }]}>{page.name}</Text>
          <Muted>{formatEventRange(page.dateStart, page.dateEnd)}</Muted>
        </Card>
        <ErrorBanner message={error} />
        {doneCard ??
          (phase !== "open" ? (
            <Card>
              <Muted>
                {phase === "before"
                  ? "Check-in hasn't opened yet. It opens two hours before the event."
                  : "Check-in for this event has closed. Ask a leader to sign you in."}
              </Muted>
            </Card>
          ) : (
            <Card>
              {forSomeoneElse ? <Muted>Checking in someone else. This phone won&apos;t remember them.</Muted> : null}
              <Field
                label="Full name"
                value={values.name}
                onChangeText={(name) => update({ name })}
                autoCapitalize="words"
                maxLength={80}
                testID="checkin-name"
              />
              {prefilled ? (
                <Pressable accessibilityRole="button" onPress={startFresh} hitSlop={8}>
                  <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
                    Not {remembered!.name}? Start fresh
                  </Text>
                </Pressable>
              ) : null}
              {page.universities.length > 1 ? (
                <Chips
                  label="University (optional)"
                  options={page.universities}
                  value={values.campus}
                  onChange={(campus) => update({ campus })}
                />
              ) : null}
              <Chips
                label="Year at uni (optional)"
                options={YEAR_OPTIONS}
                value={values.level}
                onChange={(level) => update({ level })}
              />
              <Btn
                title="Check in"
                icon="log-in-outline"
                loading={sending}
                disabled={values.name.trim().length < 2}
                onPress={() => void sendDetails(values, "form", !forSomeoneElse)}
              />
              <Muted>
                {forSomeoneElse
                  ? "Only their name, university and year are sent. A leader confirms it on their phone."
                  : "Only your name, university and year are sent, and this phone remembers them for next time. A leader confirms your first check-in."}
              </Muted>
            </Card>
          ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
});
