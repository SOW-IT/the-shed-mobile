import { SignInPrompt } from "@/components/SignInPrompt";
import { Btn, Card, IconButton, LoadingState, Muted, Screen, Segmented, Toast, type ToastState } from "@/components/ui";
import { KeyboardScrollView, useKeyboardInset } from "@/hooks/useKeyboardInset";
import { useOffline } from "@/hooks/useOffline";
import {
  getLocalDevotional,
  keepLocalDevotional,
  markDevotionalConflict,
  markDevotionalSynced,
  persistLocalDevotionals,
  saveLocalDevotional,
  takeServerDevotional,
  useLocalDevotionals,
} from "@/lib/devotionalStorage";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { parseBibleReference } from "@shared/bible";
import {
  DEVOTIONAL_DEVICE_SAVE_FAILED_TEXT,
  DEVOTIONAL_SHARING_FAILED_TEXT,
  DEVOTIONAL_SHARING_OFFLINE_TEXT,
  devotionalContentChanged,
  devotionalEditorDirty,
  devotionalSaveFeedback,
  pendingSharingLevel,
  savedSharingLevel,
  type DevotionalSaveOutcome,
} from "@shared/devotionalEditor";
import {
  DEVOTIONAL_SHARING_LEVELS,
  SHARING_LEVEL_LABELS,
  type DevotionalSharingLevel,
} from "@shared/devotionalGroups";
import {
  MAX_NOTES_LENGTH,
  MAX_PRAYER_LENGTH,
  pickDisplayDevotional,
  sameDevotionalContent,
  todayDevotionalDate,
  validateDevotionalDate,
  validateDevotionalInput,
} from "@shared/devotionals";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { PassagePicker } from "./PassagePicker";

const PASSAGE_CONTAINER_HEIGHT = 128;

const formatHeadingDate = (key: string, today: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const label = new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return key === today ? `Today · ${label}` : label;
};

export const DevotionalEditor = ({ date, onBack }: { date: string; onBack: () => void }) => {
  const t = useAppTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const keyboardInset = useKeyboardInset(scrollRef);
  const offline = useOffline();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.directory.me, isAuthenticated ? {} : "skip");
  const email = me?.email ?? null;
  const today = todayDevotionalDate();
  const dateCheck = validateDevotionalDate(date, today);
  const validDate = dateCheck.ok ? dateCheck.date : null;

  const remote = useQuery(
    api.devotionals.byDate,
    isAuthenticated && validDate ? { date: validDate } : "skip"
  );
  const sharingCtx = useQuery(
    api.devotionalGroups.mySharingContext,
    isAuthenticated && validDate ? { date: validDate } : "skip"
  );
  const drafts = useLocalDevotionals(email);
  const localDraft = validDate ? drafts[validDate] : undefined;
  const saveOnline = useMutation(api.devotionals.save);
  const setPersonalSharing = useMutation(api.devotionalGroups.setPersonalSharingLevel);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenSharing, setChosenSharing] = useState<DevotionalSharingLevel | null>(null);

  const { passage, notes, prayerPoints } = pickDisplayDevotional(localDraft, remote);

  const canEdit = Boolean(email) && (remote !== undefined || offline);
  const baseIfNew =
    remote !== undefined ? (remote?.updatedAt ?? null) : localDraft && !localDraft.dirty ? localDraft.base : null;
  const conflict = localDraft?.conflict === true && remote !== undefined ? { theirs: remote } : null;

  const savedSharing = sharingCtx ? savedSharingLevel(sharingCtx.personalLevel, sharingCtx.defaultGroupLevel) : null;
  const pendingSharing = pendingSharingLevel(chosenSharing, savedSharing);
  const contentChanged = devotionalContentChanged(localDraft, remote);
  const dirty = devotionalEditorDirty({ localDraft, remote, pendingSharing });

  const latestRef = useRef({
    passage,
    notes,
    prayerPoints,
    email,
    validDate,
    offline,
    baseIfNew,
    contentChanged,
    pendingSharing,
  });
  useEffect(() => {
    latestRef.current = {
      passage,
      notes,
      prayerPoints,
      email,
      validDate,
      offline,
      baseIfNew,
      contentChanged,
      pendingSharing,
    };
  });

  const parsedPassage = passage.trim().length > 0 ? parseBibleReference(passage) : null;
  const passageError = parsedPassage && !parsedPassage.ok ? parsedPassage.error : null;
  const formattedPassage = parsedPassage && parsedPassage.ok ? parsedPassage.formatted : "";

  const updateContent = (next: { passage: string; notes: string; prayerPoints: string }) => {
    if (!validDate || !email || !canEdit) return;
    setError(null);
    void saveLocalDevotional(email, validDate, next, baseIfNew);
  };

  const syncContent = useCallback(async (): Promise<DevotionalSaveOutcome> => {
    const latest = latestRef.current;
    if (!latest.email || !latest.validDate) return { kind: "unchanged" };
    const checked = validateDevotionalInput({
      passage: latest.passage,
      notes: latest.notes,
      prayerPoints: latest.prayerPoints,
    });
    if (!checked.ok) return { kind: "error", message: checked.error };
    const content = { passage: latest.passage, notes: latest.notes, prayerPoints: latest.prayerPoints };
    const existingDraft = getLocalDevotional(latest.email, latest.validDate);
    let draft = existingDraft;
    let persisted: boolean;
    if (!draft || !sameDevotionalContent(draft, content)) {
      const stored = await saveLocalDevotional(latest.email, latest.validDate, content, latest.baseIfNew);
      draft = stored.draft;
      persisted = stored.persisted;
    } else {
      persisted = await persistLocalDevotionals(latest.email);
    }
    if (!draft.dirty) return { kind: "unchanged" };
    if (draft.conflict) return { kind: "conflict" };
    const notSavedOnline: DevotionalSaveOutcome = persisted
      ? { kind: "savedOnDevice" }
      : { kind: "error", message: DEVOTIONAL_DEVICE_SAVE_FAILED_TEXT };
    if (latest.offline) return notSavedOnline;

    try {
      const result = await saveOnline({ date: latest.validDate, ...checked.normalized, base: draft.base });
      if (result.status === "conflict") {
        await markDevotionalConflict(latest.email, latest.validDate, draft.base);
        const conflicted = getLocalDevotional(latest.email, latest.validDate)?.conflict === true;
        return conflicted ? { kind: "conflict" } : notSavedOnline;
      }
      await markDevotionalSynced(latest.email, latest.validDate, content, result);
      return { kind: "saved" };
    } catch (caught) {
      return caught instanceof ConvexError ? { kind: "error", message: String(caught.data) } : notSavedOnline;
    }
  }, [saveOnline]);

  const inFlight = useRef<Promise<boolean> | null>(null);
  const leaving = useRef(false);
  const runSync = useCallback(
    async (showFeedback: boolean): Promise<boolean> => {
      const {
        contentChanged: contentNeedsSave,
        pendingSharing: sharingToSave,
        offline: isOffline,
      } = latestRef.current;
      if (!contentNeedsSave && !sharingToSave) return true;
      if (showFeedback) {
        setSaving(true);
        setError(null);
      }
      try {
        const outcome: DevotionalSaveOutcome = contentNeedsSave ? await syncContent() : { kind: "unchanged" };
        let sharingError: string | null = null;
        if (sharingToSave && isOffline) {
          sharingError = DEVOTIONAL_SHARING_OFFLINE_TEXT;
        } else if (sharingToSave) {
          try {
            await setPersonalSharing({ level: sharingToSave });
            setChosenSharing((current) => (current === sharingToSave ? null : current));
          } catch {
            sharingError = DEVOTIONAL_SHARING_FAILED_TEXT;
          }
        }
        if (showFeedback) {
          const feedback = devotionalSaveFeedback(
            sharingError && outcome.kind !== "error" && outcome.kind !== "conflict"
              ? { kind: "error", message: sharingError }
              : outcome
          );
          if (feedback.toast) setToast({ text: feedback.toast });
          setError(feedback.error);
        }
        return sharingError === null;
      } finally {
        if (showFeedback) setSaving(false);
      }
    },
    [setPersonalSharing, syncContent]
  );

  const syncToServer = useCallback(
    (showFeedback: boolean): Promise<boolean> => {
      if (inFlight.current) return inFlight.current;
      const run = runSync(showFeedback).finally(() => {
        inFlight.current = null;
      });
      inFlight.current = run;
      return run;
    },
    [runSync]
  );

  const syncRef = useRef(syncToServer);
  useEffect(() => {
    syncRef.current = syncToServer;
  }, [syncToServer]);

  useEffect(
    () => () => {
      if (!leaving.current) void syncRef.current(false);
    },
    []
  );

  const handleBack = async () => {
    const running = inFlight.current;
    if (running && !(await running)) return;
    if (latestRef.current.pendingSharing) {
      if (!(await syncToServer(true))) return;
    } else {
      void syncToServer(false);
    }
    leaving.current = true;
    onBack();
  };

  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) {
    return (
      <Screen title="Devotionals" onBack={onBack}>
        <SignInPrompt what="page" />
      </Screen>
    );
  }
  if (!validDate) {
    return (
      <Screen title="Devotionals" onBack={onBack}>
        <Card>
          <Muted>{dateCheck.ok ? "Invalid date." : dateCheck.error}</Muted>
        </Card>
      </Screen>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["top"]}>
      <View style={[styles.header, { borderBottomColor: t.separator }]}>
        <Pressable
          onPress={() => void handleBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="devotional-back"
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </Pressable>
        <View style={styles.titleWrap}>
          <View style={styles.titleRow}>
            <Ionicons name="book-outline" size={22} color={t.primary} />
            <Text style={[typography.title, { color: t.text }]} numberOfLines={1}>
              Devotionals
            </Text>
          </View>
          <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
            {formatHeadingDate(validDate, today)}
          </Text>
        </View>
        <Btn
          title={saving ? "Saving…" : "Save"}
          onPress={() => void syncToServer(true)}
          disabled={!dirty || Boolean(passageError) || saving || !canEdit}
        />
      </View>

      <KeyboardScrollView
        ref={scrollRef}
        style={[styles.scroll, keyboardInset]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {canEdit ? null : (
          <Muted>{email ? "Loading..." : "Connect to the internet to open your devotionals."}</Muted>
        )}
        {error ? (
          <View
            style={[styles.errorBar, { backgroundColor: t.errorBackground }]}
            accessibilityRole="alert"
            testID="devotional-error"
          >
            <Ionicons name="alert-circle" size={16} color={t.errorText} />
            <Text style={[typography.caption, styles.errorText, { color: t.errorText }]}>{error}</Text>
            <IconButton
              name="close"
              size={28}
              color={t.errorText}
              accessibilityLabel="Dismiss"
              onPress={() => setError(null)}
            />
          </View>
        ) : null}
        {conflict && email ? (
          <Card style={styles.sectionCard}>
            <Text style={[typography.section, { color: t.text }]}>Changed on another device</Text>
            <Muted>
              {conflict.theirs
                ? "Your other device saved a different version of this day."
                : "Your other device cleared this day."}{" "}
              The text below is the version on this device.
            </Muted>
            {conflict.theirs ? (
              <View style={[styles.otherVersion, { borderColor: t.border }]}>
                {conflict.theirs.passage ? (
                  <Text style={[typography.label, { color: t.text }]}>{conflict.theirs.passage}</Text>
                ) : null}
                {conflict.theirs.notes ? (
                  <Text style={[typography.body, { color: t.muted }]} numberOfLines={4}>
                    {conflict.theirs.notes}
                  </Text>
                ) : null}
                {conflict.theirs.prayerPoints ? (
                  <Text style={[typography.body, { color: t.muted }]} numberOfLines={3}>
                    {conflict.theirs.prayerPoints}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.conflictButtons}>
              <Btn
                title="Keep this version"
                onPress={() => {
                  void keepLocalDevotional(email, validDate, conflict.theirs).then(() => syncToServer(true));
                }}
              />
              <Btn
                title="Use the other version"
                variant="tonal"
                onPress={() => {
                  setError(null);
                  void takeServerDevotional(email, validDate, conflict.theirs);
                }}
              />
            </View>
          </Card>
        ) : null}

        {sharingCtx && sharingCtx.groupCount > 0 ? (
          <Card style={styles.sharingCard}>
            <View style={styles.sharingHeader}>
              <View style={styles.sharingLabelRow}>
                <Ionicons name="people-outline" size={16} color={t.primary} />
                <Text style={[typography.label, { color: t.text }]}>Share with groups</Text>
              </View>
              <Text style={[typography.caption, { color: t.muted }]}>
                {sharingCtx.personalLevel ? "Your default" : "Group default"}
              </Text>
            </View>
            <View testID="devotional-sharing-control">
              <Segmented
                segments={DEVOTIONAL_SHARING_LEVELS.map((level) => ({
                  key: level,
                  label: SHARING_LEVEL_LABELS[level],
                }))}
                active={pendingSharing ?? savedSharing ?? "everything"}
                onChange={(next) => {
                  if (!canEdit || saving) return;
                  setError(null);
                  setChosenSharing(next as DevotionalSharingLevel);
                }}
              />
            </View>
          </Card>
        ) : null}

        <Card style={styles.sectionCard}>
          <Text style={[typography.label, { color: t.muted }]}>Passage</Text>
          <PassagePicker
            passage={passage}
            onChange={(value) => updateContent({ passage: value, notes, prayerPoints })}
            editable={canEdit}
            invalid={Boolean(passageError)}
          />
          {passageError ? (
            <Text style={[typography.caption, { color: t.danger }]} testID="devotional-passage-error">
              {passageError}
            </Text>
          ) : null}
          <View
            style={[
              styles.passageContainer,
              { backgroundColor: t.background, borderColor: t.border },
            ]}
            testID="devotional-passage-container"
          >
            <ScrollView
              nestedScrollEnabled
              contentContainerStyle={styles.passageInner}
              showsVerticalScrollIndicator={false}
            >
              {formattedPassage ? (
                <Text
                  style={[typography.section, { color: t.text }]}
                  testID="devotional-passage-display"
                >
                  {formattedPassage}
                </Text>
              ) : (
                <Text style={[typography.body, { color: t.faint }]}>Passage</Text>
              )}
            </ScrollView>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={[typography.section, { color: t.text }]}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={(value) => updateContent({ passage, notes: value, prayerPoints })}
            placeholder="Notes"
            placeholderTextColor={t.faint}
            multiline
            maxLength={MAX_NOTES_LENGTH}
            textAlignVertical="top"
            editable={canEdit}
            accessibilityLabel="Notes"
            testID="devotional-notes-input"
            style={[
              styles.multiInput,
              styles.notesInput,
              typography.body,
              { color: t.text, backgroundColor: t.inputBackground, borderColor: t.border },
            ]}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={[typography.section, { color: t.text }]}>Prayer</Text>
          <TextInput
            value={prayerPoints}
            onChangeText={(value) => updateContent({ passage, notes, prayerPoints: value })}
            placeholder="Prayer"
            placeholderTextColor={t.faint}
            multiline
            maxLength={MAX_PRAYER_LENGTH}
            textAlignVertical="top"
            editable={canEdit}
            accessibilityLabel="Prayer"
            testID="devotional-prayer-input"
            style={[
              styles.multiInput,
              styles.prayerInput,
              typography.body,
              { color: t.text, backgroundColor: t.inputBackground, borderColor: t.border },
            ]}
          />
        </Card>

      </KeyboardScrollView>
      <Toast toast={toast} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  titleWrap: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    paddingBottom: spacing.xxxl,
  },
  sectionCard: { gap: spacing.sm },
  sharingCard: { gap: spacing.xs, paddingVertical: spacing.md },
  sharingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sharingLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  otherVersion: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  conflictButtons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  passageContainer: {
    height: PASSAGE_CONTAINER_HEIGHT,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  passageInner: {
    padding: spacing.md,
    flexGrow: 1,
  },
  multiInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  notesInput: { minHeight: 150 },
  prayerInput: { minHeight: 120 },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  errorText: { flex: 1 },
});
