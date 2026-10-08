import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  type Audience,
  audienceSummary,
  EVERYONE,
  isEveryone,
  MESSAGE_MAX,
  rateLimitError,
  scheduleError,
  TITLE_MAX,
} from "@shared/announcements";
import { parseDateTimeInputValues, toDateInputValue, toTimeInputValue } from "@shared/datetime";
import { acronym } from "@shared/flow";
import { PushPreview } from "@/components/announcements/PushPreview";
import { NativeDateInput, NativeTimeInput } from "@/components/NativeDateTimeField";
import { WebDateInput, WebTimeInput } from "@/components/WebDateTimeInput";
import {
  Btn,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  Field,
  LoadingState,
  Muted,
  MultiSelect,
  Screen,
  SectionTitle,
  Segmented,
  type ToastState,
  Txt,
  WarningBanner,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type Reach = "everyone" | "groups";
type When = "now" | "later";

/** "Fri 9 Oct, 3:00 pm" in the viewer's time. */
const whenText = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** The next whole hour, at least half an hour away: a sensible first pick. */
const defaultSendAt = () => {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
};

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** The time right now, for event handlers (render uses `useNow`). */
const currentTime = () => Date.now();

/** The current time, refreshed every 15 seconds so time limits stay true while the page is open. */
const useNow = () => {
  const [now, setNow] = useState(currentTime);
  useEffect(() => {
    const timer = setInterval(() => setNow(currentTime()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

const Counter = ({ value, max }: { value: string; max: number }) => {
  const t = useAppTheme();
  return (
    <Text
      style={[
        typography.caption,
        styles.counter,
        { color: value.length >= max ? t.warning : t.faint },
      ]}
    >
      {value.length}/{max}
    </Text>
  );
};

const Checkbox = ({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) => {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.7 }]}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={24}
        color={checked ? t.primary : t.faint}
      />
      <Txt style={{ flex: 1, fontWeight: "600" }}>{label}</Txt>
    </Pressable>
  );
};

export default function AnnouncementsScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const isAdmin = !!me?.isAdmin;
  const options = useQuery(api.announcements.options, isAdmin ? {} : "skip");
  const history = useQuery(api.announcements.list, isAdmin ? {} : "skip");
  const send = useMutation(api.announcements.send);
  const cancel = useMutation(api.announcements.cancel);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [reach, setReach] = useState<Reach>("everyone");
  const [groups, setGroups] = useState<Audience>(EVERYONE);
  const [sendEmail, setSendEmail] = useState(false);
  const [when, setWhen] = useState<When>("now");
  const [date, setDate] = useState(() => toDateInputValue(defaultSendAt()));
  const [time, setTime] = useState(() => toTimeInputValue(defaultSendAt()));
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [cancelTarget, setCancelTarget] = useState<{
    id: Id<"announcements">;
    title: string;
  } | null>(null);

  const audience = reach === "everyone" ? EVERYONE : groups;
  // "Choose groups" with nothing picked would quietly mean everyone.
  const nothingPicked = reach === "groups" && isEveryone(groups);
  const size = useQuery(api.announcements.audienceSize, isAdmin ? { audience } : "skip");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));
  const now = useNow();

  if (me === undefined) return <LoadingState />;
  if (!isAdmin) {
    return (
      <Screen title="Announcements" onBack={back}>
        <EmptyState icon="lock-closed-outline" title="Only admins can send announcements" />
      </Screen>
    );
  }

  const sendAt = when === "later" ? parseDateTimeInputValues(date, time) : null;
  // Checked here first, so the button explains itself rather than the server
  // refusing the send; the server checks the same rules again.
  const problemAt = (at: number) => {
    if (when === "later") {
      const late = sendAt === null ? "Pick a date and time." : scheduleError(sendAt, at);
      if (late) return { schedule: late, limit: null };
    }
    const limit =
      history && title.trim() && message.trim()
        ? rateLimitError({ ...history.mine, draft: { title, message }, now: at })
        : null;
    return { schedule: null, limit };
  };
  const problem = problemAt(now);
  const count = nothingPicked ? null : (size?.people ?? null);
  const ready =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    !!count &&
    !nothingPicked &&
    !problem.schedule &&
    !problem.limit &&
    !sending;
  const action = when === "now" ? "Send" : "Schedule";
  const buttonTitle = !count
    ? `${action} announcement`
    : when === "now"
      ? `Send to ${people(count)}`
      : `Schedule for ${people(count)}`;
  const setGroup = (key: keyof Audience) => (values: string[]) =>
    setGroups((current) => ({ ...current, [key]: values }));

  const showToast = (text: string) => setToast({ text });

  const submit = async () => {
    if (sending) return;
    // Time may have moved on while the confirmation was open.
    const late = problemAt(currentTime());
    if (late.schedule || late.limit) {
      setError(late.schedule ?? late.limit);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await send({
        title,
        message,
        audience,
        sendEmail,
        ...(when === "later" && sendAt !== null ? { sendAt } : {}),
      });
      showToast(
        when === "now"
          ? `Sending to ${people(result.people)}`
          : `Scheduled for ${whenText(result.sendAt)}`
      );
      setTitle("");
      setMessage("");
      setSendEmail(false);
      setWhen("now");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const confirmMessage = () => {
    if (!size) return undefined;
    const whenPart = when === "now" ? "now" : sendAt ? `on ${whenText(sendAt)}` : "";
    const email = sendEmail ? "; all get an email" : "";
    return `"${title.trim()}" goes to ${people(size.people)} (${audienceSummary(audience)}) ${whenPart}. ${size.withApp} by push${email}.`;
  };

  return (
    <Screen title="Announcements" onBack={back} maxWidth={720} toast={toast}>
      <View style={{ gap: spacing.md }}>
        <SectionTitle>New announcement</SectionTitle>
        <Card>
          <View>
            <Field
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Staff meeting moved to Thursday"
              autoCapitalize="sentences"
              maxLength={TITLE_MAX}
              testID="announcement-title"
            />
            <Counter value={title} max={TITLE_MAX} />
          </View>
          <View>
            <Field
              label="Message"
              value={message}
              onChangeText={setMessage}
              placeholder="What do leaders need to know?"
              autoCapitalize="sentences"
              multiline
              maxLength={MESSAGE_MAX}
              testID="announcement-message"
            />
            <Counter value={message} max={MESSAGE_MAX} />
          </View>
        </Card>

        <SectionTitle>Send to</SectionTitle>
        <Card>
          <Segmented
            segments={[
              { key: "everyone", label: "All leaders" },
              { key: "groups", label: "Choose groups" },
            ]}
            active={reach}
            onChange={(key) => setReach(key as Reach)}
          />
          {reach === "groups" ? (
            <>
              <MultiSelect
                label="Campuses"
                values={groups.campuses}
                options={(options?.campuses ?? []).map((c) => ({ label: acronym(c), value: c }))}
                onSelect={setGroup("campuses")}
                placeholder="Any campus"
              />
              <MultiSelect
                label="Divisions"
                values={groups.divisions}
                options={options?.divisions ?? []}
                onSelect={setGroup("divisions")}
                placeholder="Any division"
              />
              <MultiSelect
                label="Departments"
                values={groups.departments}
                options={(options?.departments ?? []).map((d) => d.name)}
                onSelect={setGroup("departments")}
                placeholder="Any department"
              />
              <MultiSelect
                label="Roles"
                values={groups.roles}
                options={options?.roles ?? []}
                onSelect={setGroup("roles")}
                placeholder="Any role"
              />
            </>
          ) : null}
          <View style={[styles.reach, { backgroundColor: t.primarySoft }]}>
            <Ionicons name="people" size={18} color={t.dark ? t.text : t.primary} />
            <Text style={[typography.body, { color: t.text, flex: 1 }]} testID="announcement-count">
              {nothingPicked
                ? "Pick a campus, division, department or role."
                : size === undefined || size === null
                ? "Counting…"
                : size.people === 0
                  ? "No one matches who you chose."
                  : `${people(size.people)} · ${size.withApp} with the app get a push`}
            </Text>
          </View>
          <Checkbox
            checked={sendEmail}
            onToggle={() => setSendEmail((v) => !v)}
            label="Also send as an email"
          />
        </Card>

        <SectionTitle>When</SectionTitle>
        <Card>
          <Segmented
            segments={[
              { key: "now", label: "Send now" },
              { key: "later", label: "Schedule" },
            ]}
            active={when}
            onChange={(key) => setWhen(key as When)}
          />
          {when === "later" ? (
            <View style={styles.dateRow}>
              {Platform.OS === "web" ? (
                <>
                  <WebDateInput
                    label="Date"
                    value={date}
                    min={toDateInputValue(new Date())}
                    onChange={setDate}
                  />
                  <WebTimeInput label="Time" value={time} onChange={setTime} />
                </>
              ) : (
                <>
                  <NativeDateInput
                    label="Date"
                    value={date}
                    min={toDateInputValue(new Date())}
                    onChange={setDate}
                  />
                  <NativeTimeInput label="Time" value={time} onChange={setTime} />
                </>
              )}
            </View>
          ) : null}
          <WarningBanner message={problem.schedule} />
        </Card>

        <SectionTitle>Preview</SectionTitle>
        <PushPreview title={title} message={message} />

        <WarningBanner message={problem.limit} />
        <ErrorBanner message={error} />
        <Btn
          title={buttonTitle}
          icon={when === "now" ? "paper-plane-outline" : "time-outline"}
          disabled={!ready}
          loading={sending}
          onPress={() => {
            setError(null);
            setConfirming(true);
          }}
        />

        <SectionTitle>Scheduled</SectionTitle>
        {history === undefined ? (
          <LoadingState />
        ) : !history || history.scheduled.length === 0 ? (
          <Muted>Nothing scheduled.</Muted>
        ) : (
          history.scheduled.map((a) => (
            <Card key={a.id}>
              <View style={styles.rowTop}>
                <Ionicons name="time-outline" size={18} color={t.warning} />
                <Txt style={{ fontWeight: "700", flex: 1 }}>{a.title}</Txt>
              </View>
              <Text numberOfLines={2} style={[typography.caption, { color: t.muted }]}>
                {a.message}
              </Text>
              <Muted>
                {whenText(a.sendAt)} · {a.audience}
                {a.sendEmail ? " · with email" : ""} · by {a.senderName}
              </Muted>
              <Btn
                title="Cancel"
                variant="danger"
                icon="close-circle-outline"
                onPress={() => setCancelTarget({ id: a.id, title: a.title })}
              />
            </Card>
          ))
        )}

        <SectionTitle>Sent</SectionTitle>
        {history && history.sent.length === 0 ? <Muted>Nothing sent yet.</Muted> : null}
        {(history?.sent ?? []).map((a) => (
          <Pressable
            key={a.id}
            onPress={() => router.push(`/announcements/${a.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.sentRow,
              t.shadowCard,
              { backgroundColor: t.card },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.sentIcon, { backgroundColor: t.primarySoft }]}>
              <Ionicons name="megaphone" size={16} color={t.dark ? t.text : t.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt style={{ fontWeight: "700" }}>{a.title}</Txt>
              <Muted>
                {whenText(a.sentAt ?? a.sendAt)} · {a.audience} · {people(a.people ?? 0)}
                {a.sendEmail ? " · emailed" : ""}
              </Muted>
              <Muted>by {a.senderName}</Muted>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.faint} />
          </Pressable>
        ))}
      </View>

      <ConfirmDialog
        visible={confirming}
        title={`${action} this announcement?`}
        message={confirmMessage()}
        confirmLabel={action}
        destructive={false}
        onConfirm={() => void submit()}
        onClose={() => setConfirming(false)}
      />
      <ConfirmDialog
        visible={cancelTarget !== null}
        title="Cancel this announcement?"
        message={cancelTarget ? `"${cancelTarget.title}" won't go out.` : undefined}
        confirmLabel="Cancel it"
        cancelLabel="Keep it"
        onConfirm={() => {
          if (!cancelTarget) return;
          void cancel({ id: cancelTarget.id })
            .then(() => showToast("Cancelled"))
            .catch((e: unknown) => setError(errorMessage(e)));
        }}
        onClose={() => setCancelTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  counter: { alignSelf: "flex-end", marginTop: 4 },
  reach: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dateRow: { flexDirection: "row", gap: spacing.sm },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
  },
  sentIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
