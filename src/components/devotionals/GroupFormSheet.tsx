import { DateInput } from "@/components/DateInputs";
import { Btn, ErrorBanner, Field, Muted, Sheet, errorMessage } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { shiftDay } from "@shared/calendar";
import {
  DEVOTIONAL_SHARING_LEVELS,
  MAX_GROUP_NAME_LENGTH,
  SHARING_LEVEL_DESCRIPTIONS,
  SHARING_LEVEL_LABELS,
  validateGroupInput,
  type DevotionalSharingLevel,
} from "@shared/devotionalGroups";
import { todayDevotionalDate } from "@shared/devotionals";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type GroupFormValues = {
  name: string;
  startDate: string;
  endDate: string;
  sharingLevel: DevotionalSharingLevel;
};

const GroupFormBody = ({
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  initial?: GroupFormValues;
  submitLabel: string;
  onSubmit: (values: GroupFormValues) => Promise<void>;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const today = todayDevotionalDate();
  const defaultEnd = shiftDay(today, 29);

  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [endDate, setEndDate] = useState(initial?.endDate ?? defaultEnd);
  const [sharingLevel, setSharingLevel] = useState<DevotionalSharingLevel>(
    initial?.sharingLevel ?? "passage"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const checked = validateGroupInput({ name, startDate, endDate, sharingLevel });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(checked.normalized);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <Field
        label="Group name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Term 1 Devotionals"
        autoCapitalize="words"
        maxLength={MAX_GROUP_NAME_LENGTH}
        testID="group-name-input"
      />

      <View style={styles.datesRow}>
        <DateInput
          label="Start date"
          value={startDate}
          onChange={(next) => {
            setStartDate(next);
            if (endDate && next > endDate) setEndDate(next);
          }}
        />
        <DateInput
          label="End date"
          value={endDate}
          min={startDate}
          onChange={setEndDate}
        />
      </View>

      <View style={styles.levelBlock}>
        <Text style={[typography.label, { color: t.muted }]}>Group sharing level</Text>
        <Muted>Members can always choose to share less.</Muted>
        <View style={styles.levelList}>
          {DEVOTIONAL_SHARING_LEVELS.map((level) => {
            const selected = sharingLevel === level;
            return (
              <Pressable
                key={level}
                onPress={() => setSharingLevel(level)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                testID={`group-level-${level}`}
                style={({ pressed }) => [
                  styles.levelRow,
                  {
                    backgroundColor: selected ? t.primarySoft : t.inputBackground,
                    borderColor: selected ? t.primary : t.border,
                  },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={styles.levelText}>
                  <Text
                    style={[
                      typography.body,
                      { color: t.text, fontWeight: selected ? "700" : "600" },
                    ]}
                  >
                    {SHARING_LEVEL_LABELS[level]}
                  </Text>
                  <Text style={[typography.caption, { color: t.muted }]}>
                    {SHARING_LEVEL_DESCRIPTIONS[level]}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={selected ? t.primary : t.faint}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      <ErrorBanner message={error} />

      <View style={styles.submitWrap}>
        <Btn
          title={submitLabel}
          loading={saving}
          onPress={() => void handleSave()}
        />
      </View>
    </View>
  );
};

export const GroupFormSheet = ({
  visible,
  title,
  submitLabel,
  initial,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  submitLabel: string;
  initial?: GroupFormValues;
  onSubmit: (values: GroupFormValues) => Promise<void>;
  onClose: () => void;
}) => (
  <Sheet visible={visible} title={title} onClose={onClose}>
    {visible ? (
      <GroupFormBody
        initial={initial}
        submitLabel={submitLabel}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    ) : null}
  </Sheet>
);

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  datesRow: { flexDirection: "row", gap: spacing.sm },
  levelBlock: { gap: spacing.xs },
  levelList: { gap: spacing.xs, marginTop: spacing.xs },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  levelText: { flex: 1, gap: 2 },
  submitWrap: { paddingTop: spacing.xs },
});
