import { SignInPrompt } from "@/components/SignInPrompt";
import { Btn, Card, LoadingState, Muted, Screen, type ToastState } from "@/components/ui";
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
  MAX_NOTES_LENGTH,
  MAX_PASSAGE_LENGTH,
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
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";

const PASSAGE_CONTAINER_HEIGHT = 128;
const CONFLICT_TEXT = "This day was changed on another device. Choose which version to keep.";

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
  const drafts = useLocalDevotionals(email);
  const localDraft = validDate ? drafts[validDate] : undefined;
  const saveOnline = useMutation(api.devotionals.save);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const { passage, notes, prayerPoints } = pickDisplayDevotional(localDraft, remote);

  const canEdit = Boolean(email) && (remote !== undefined || offline);
  const baseIfNew =
    remote !== undefined ? (remote?.updatedAt ?? null) : localDraft && !localDraft.dirty ? localDraft.base : null;
  const conflict = localDraft?.conflict === true && remote !== undefined ? { theirs: remote } : null;

  const dirtyOnEdit = useRef(false);
  const latestRef = useRef({ passage, notes, prayerPoints, email, validDate, offline, baseIfNew });
  useEffect(() => {
    latestRef.current = { passage, notes, prayerPoints, email, validDate, offline, baseIfNew };
  });

  const parsedPassage = passage.trim().length > 0 ? parseBibleReference(passage) : null;
  const passageError = parsedPassage && !parsedPassage.ok ? parsedPassage.error : null;
  const formattedPassage = parsedPassage && parsedPassage.ok ? parsedPassage.formatted : "";

  const updateContent = (next: { passage: string; notes: string; prayerPoints: string }) => {
    if (!validDate || !email || !canEdit) return;
    dirtyOnEdit.current = true;
    void saveLocalDevotional(email, validDate, next, baseIfNew);
  };

  const syncToServer = useCallback(
    async (showFeedback: boolean) => {
      const latest = latestRef.current;
      if (!latest.email || !latest.validDate) return;
      const checked = validateDevotionalInput({
        passage: latest.passage,
        notes: latest.notes,
        prayerPoints: latest.prayerPoints,
      });
      if (!checked.ok) {
        if (showFeedback) setToast({ text: checked.error });
        return;
      }
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
      if (!draft.dirty) {
        if (showFeedback) setToast({ text: "Saved" });
        return;
      }
      if (draft.conflict) {
        if (showFeedback) setToast({ text: CONFLICT_TEXT });
        return;
      }
      const notSavedOnline = persisted ? "Saved on this device." : "Couldn't save on this device. Try again.";
      if (latest.offline) {
        if (showFeedback) setToast({ text: notSavedOnline });
        return;
      }

      if (showFeedback) setSaving(true);
      try {
        const result = await saveOnline({ date: latest.validDate, ...checked.normalized, base: draft.base });
        if (result.status === "conflict") {
          await markDevotionalConflict(latest.email, latest.validDate);
          if (showFeedback) setToast({ text: CONFLICT_TEXT });
          return;
        }
        await markDevotionalSynced(latest.email, latest.validDate, content, result);
        const now = latestRef.current;
        if (now.validDate === latest.validDate && sameDevotionalContent(now, content)) {
          dirtyOnEdit.current = false;
        }
        if (showFeedback) setToast({ text: "Saved" });
      } catch (error) {
        if (showFeedback) setToast({ text: error instanceof ConvexError ? String(error.data) : notSavedOnline });
      } finally {
        if (showFeedback) setSaving(false);
      }
    },
    [saveOnline]
  );

  const syncRef = useRef(syncToServer);
  useEffect(() => {
    syncRef.current = syncToServer;
  }, [syncToServer]);

  useEffect(
    () => () => {
      if (dirtyOnEdit.current) void syncRef.current(false);
    },
    []
  );

  const handleBack = () => {
    if (dirtyOnEdit.current || localDraft?.dirty) {
      dirtyOnEdit.current = false;
      void syncToServer(false);
    }
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
          onPress={handleBack}
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
          disabled={Boolean(passageError) || saving || !canEdit}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {canEdit ? null : (
          <Muted>{email ? "Loading..." : "Connect to the internet to open your devotionals."}</Muted>
        )}
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
                  dirtyOnEdit.current = false;
                  void takeServerDevotional(email, validDate, conflict.theirs);
                }}
              />
            </View>
          </Card>
        ) : null}

        <Card style={styles.sectionCard}>
          <Text style={[typography.label, { color: t.muted }]}>Passage</Text>
          <TextInput
            value={passage}
            onChangeText={(value) => updateContent({ passage: value, notes, prayerPoints })}
            placeholder="Psalm 23 or John 15:1-17"
            placeholderTextColor={t.faint}
            maxLength={MAX_PASSAGE_LENGTH}
            autoCorrect={false}
            editable={canEdit}
            accessibilityLabel="Passage reference"
            testID="devotional-passage-input"
            style={[
              styles.singleInput,
              typography.body,
              {
                color: t.text,
                backgroundColor: t.inputBackground,
                borderColor: passageError ? t.danger : t.border,
              },
            ]}
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
          <Text style={[typography.section, { color: t.text }]}>Prayer points</Text>
          <TextInput
            value={prayerPoints}
            onChangeText={(value) => updateContent({ passage, notes, prayerPoints: value })}
            placeholder="Prayer points"
            placeholderTextColor={t.faint}
            multiline
            maxLength={MAX_PRAYER_LENGTH}
            textAlignVertical="top"
            editable={canEdit}
            accessibilityLabel="Prayer points"
            testID="devotional-prayer-input"
            style={[
              styles.multiInput,
              styles.prayerInput,
              typography.body,
              { color: t.text, backgroundColor: t.inputBackground, borderColor: t.border },
            ]}
          />
        </Card>

        {toast ? (
          <View style={[styles.toastBar, { backgroundColor: t.primarySoft }]} testID="devotional-status">
            <Text style={[typography.caption, { color: t.text, fontWeight: "700" }]}>
              {toast.text}
            </Text>
          </View>
        ) : null}
      </ScrollView>
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
  otherVersion: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  conflictButtons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  singleInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
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
  toastBar: {
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
});
