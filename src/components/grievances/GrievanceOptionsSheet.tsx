import { useMutation } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { MAX_GRIEVANCE_OPTION, MAX_GRIEVANCE_OPTIONS } from "@shared/grievances";
import { Btn, ErrorBanner, Field, IconButton, Muted, runBusy, Sheet } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type Option = { key: number; text: string };

const toOptions = (categories: string[]): Option[] =>
  categories.map((text, key) => ({ key, text }));

// The team's "What is it about?" options: one card each, in the order they're shown.
export const GrievanceOptionsSheet = ({
  visible,
  categories,
  onClose,
}: {
  visible: boolean;
  categories: string[];
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const save = useMutation(api.grievances.setCategories);
  const [edited, setEdited] = useState<Option[] | null>(null);
  // What the options were when editing began, so a save can't undo someone else's change.
  const [base, setBase] = useState<string[] | null>(null);
  const [nextKey, setNextKey] = useState(categories.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = edited ?? toOptions(categories);
  const texts = options.map((o) => o.text);
  const unchanged = texts.join("\n") === categories.join("\n");

  const change = (next: Option[]) => {
    setEdited(next);
    if (base === null) setBase(categories);
    if (error) setError(null);
  };
  const move = (index: number, by: number) => {
    const next = [...options];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    change(next);
  };
  const add = () => {
    change([...options, { key: Math.max(nextKey, options.length), text: "" }]);
    setNextKey((k) => Math.max(k, options.length) + 1);
  };
  const close = () => {
    setEdited(null);
    setBase(null);
    setError(null);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Form options"
      footer={
        <View style={{ gap: spacing.sm }}>
          <ErrorBanner message={error} />
          <Btn
            title="Save Options"
            loading={busy}
            disabled={unchanged}
            onPress={() =>
              void runBusy(busy, setBusy, setError, () => save({ categories: texts, expected: base ?? categories }), close)
            }
          />
          <Btn title="Back" variant="ghost" onPress={close} />
        </View>
      }
    >
      <Muted>
        The choices people pick from for &quot;What is it about?&quot;, in the order they&apos;re
        shown. Grievances already raised keep the wording they were raised with.
      </Muted>
      {options.map((option, index) => (
        <View
          key={option.key}
          style={[styles.card, t.surfaceEdge, { backgroundColor: t.card }]}
        >
          <View style={styles.header}>
            <Text style={[typography.label, { color: t.muted, flex: 1 }]}>Option {index + 1}</Text>
            <IconButton
              name="chevron-up"
              size={30}
              accessibilityLabel={`Move option ${index + 1} up`}
              disabled={index === 0}
              onPress={() => move(index, -1)}
            />
            <IconButton
              name="chevron-down"
              size={30}
              accessibilityLabel={`Move option ${index + 1} down`}
              disabled={index === options.length - 1}
              onPress={() => move(index, 1)}
            />
            <IconButton
              name="trash-outline"
              size={30}
              color={t.danger}
              accessibilityLabel={`Remove option ${index + 1}`}
              disabled={options.length === 1}
              onPress={() => change(options.filter((o) => o.key !== option.key))}
            />
          </View>
          <Field
            value={option.text}
            onChangeText={(text) =>
              change(options.map((o) => (o.key === option.key ? { ...o, text } : o)))
            }
            placeholder="e.g. Safety or wellbeing"
            autoCapitalize="sentences"
            maxLength={MAX_GRIEVANCE_OPTION}
            accessibilityLabel={`Option ${index + 1}`}
          />
        </View>
      ))}
      <View style={{ flexDirection: "row" }}>
        <Btn
          title="Add Option"
          variant="tonal"
          icon="add"
          disabled={options.length >= MAX_GRIEVANCE_OPTIONS}
          onPress={add}
        />
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
});
