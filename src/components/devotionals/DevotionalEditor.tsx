import { SignInPrompt } from "@/components/SignInPrompt";
import { Btn, Card, LoadingState, Muted, Screen, type ToastState } from "@/components/ui";
import { useOffline } from "@/hooks/useOffline";
import {
  getLocalDevotional,
  markDevotionalSynced,
  saveLocalDevotional,
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
  todayDevotionalDate,
  validateDevotionalDate,
  validateDevotionalInput,
} from "@shared/devotionals";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";

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

  const [override, setOverride] = useState<{
    date: string;
    passage: string;
    notes: string;
    prayerPoints: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const seeded = pickDisplayDevotional(localDraft, remote);
  const current = override && override.date === validDate ? override : seeded;
  const { passage, notes, prayerPoints } = current;

  const dirtyOnEdit = useRef(false);
  const latestRef = useRef({ passage, notes, prayerPoints, email, validDate, offline });
  useEffect(() => {
    latestRef.current = { passage, notes, prayerPoints, email, validDate, offline };
  });

  const parsedPassage = passage.trim().length > 0 ? parseBibleReference(passage) : null;
  const passageError = parsedPassage && !parsedPassage.ok ? parsedPassage.error : null;
  const formattedPassage = parsedPassage && parsedPassage.ok ? parsedPassage.formatted : "";

  const updateContent = (next: { passage: string; notes: string; prayerPoints: string }) => {
    if (!validDate) return;
    dirtyOnEdit.current = true;
    setOverride({ date: validDate, ...next });
    if (email) void saveLocalDevotional(email, validDate, next, Date.now());
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
      const existingDraft = getLocalDevotional(latest.email, latest.validDate);
      const savedDraft =
        existingDraft &&
        existingDraft.passage === latest.passage &&
        existingDraft.notes === latest.notes &&
        existingDraft.prayerPoints === latest.prayerPoints
          ? existingDraft
          : await saveLocalDevotional(
              latest.email,
              latest.validDate,
              {
                passage: latest.passage,
                notes: latest.notes,
                prayerPoints: latest.prayerPoints,
              },
              Date.now()
            );

      if (latest.offline) {
        if (showFeedback) setToast({ text: "Saved on this device." });
        return;
      }

      if (showFeedback) setSaving(true);
      try {
        const result = await saveOnline({
          date: latest.validDate,
          passage: checked.normalized.passage,
          notes: checked.normalized.notes,
          prayerPoints: checked.normalized.prayerPoints,
        });
        dirtyOnEdit.current = false;
        await markDevotionalSynced(
          latest.email,
          latest.validDate,
          result.passage,
          savedDraft.updatedAt,
          result.updatedAt
        );
        if (checked.normalized.passage !== latest.passage) {
          setOverride({
            date: latest.validDate,
            passage: checked.normalized.passage,
            notes: latest.notes,
            prayerPoints: latest.prayerPoints,
          });
        }
        if (showFeedback) setToast({ text: "Saved" });
      } catch {
        if (showFeedback) setToast({ text: "Saved on this device." });
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
          disabled={Boolean(passageError) || saving}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.sectionCard}>
          <Text style={[typography.label, { color: t.muted }]}>Passage</Text>
          <TextInput
            value={passage}
            onChangeText={(value) => updateContent({ passage: value, notes, prayerPoints })}
            placeholder="Psalm 23 or John 15:1-17"
            placeholderTextColor={t.faint}
            maxLength={MAX_PASSAGE_LENGTH}
            autoCorrect={false}
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
