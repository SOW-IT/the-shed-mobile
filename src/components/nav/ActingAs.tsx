import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import {
  ALL_VIEWS_LABEL,
  departmentHighlights,
  personaHighlights,
  personaLabel,
  samePersona,
  type Persona,
} from "@shared/actingAs";
import type { RoleTitles } from "@shared/flow";
import {
  ErrorBanner,
  errorMessage,
  hapticSelect,
  LoadingState,
  Muted,
  OptionSheet,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type ActingAs = { persona: Persona | null; label: string | null };

const useActingAs = (): { actingAs: ActingAs | null; titles?: RoleTitles } => {
  const me = useQuery(api.directory.me);
  const actingAs = (me && "actingAs" in me ? me.actingAs : null) ?? null;
  return { actingAs, titles: me && "roleTitles" in me ? me.roleTitles : undefined };
};

const useChoose = () => {
  const set = useMutation(api.actingAs.set);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choose = async (persona: Persona | null) => {
    if (busy) return false;
    hapticSelect();
    setBusy(true);
    setError(null);
    try {
      await set({ persona });
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { choose, busy, error };
};

const ChoiceRow = ({
  title,
  caption,
  selected,
  onPress,
  children,
}: {
  title: string;
  caption?: string;
  selected: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) => {
  const t = useAppTheme();
  const body = (
    <>
      <View style={styles.choiceText}>
        <Text
          numberOfLines={1}
          style={[typography.body, { color: t.text }, selected && styles.selectedText]}
        >
          {title}
        </Text>
        {caption ? (
          <Text numberOfLines={2} style={[typography.caption, { color: t.muted }]}>
            {caption}
          </Text>
        ) : null}
      </View>
      {children ?? (
        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={20}
          color={selected ? t.primary : t.faint}
        />
      )}
    </>
  );
  if (!onPress) {
    return (
      <View style={[styles.choiceRow, selected && { backgroundColor: t.primarySoft }]}>{body}</View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={caption ? `${title}, ${caption}` : title}
      style={({ pressed }) => [
        styles.choiceRow,
        selected && { backgroundColor: t.primarySoft },
        pressed && { opacity: 0.7 },
      ]}
    >
      {body}
    </Pressable>
  );
};

const ChoiceChip = ({
  label,
  accessibilityLabel,
  selected,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
}) => {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.choiceChip,
        selected
          ? { backgroundColor: t.primary, borderColor: t.primary }
          : { backgroundColor: t.card, borderColor: t.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.choiceChipText, { color: selected ? t.onPrimary : t.text }]}>
        {label}
      </Text>
    </Pressable>
  );
};

const GroupLabel = ({ children }: { children: string }) => {
  const t = useAppTheme();
  return <Text style={[styles.groupLabel, { color: t.muted }]}>{children}</Text>;
};

export const ActingAsPicker = ({
  visible,
  onClose,
  current,
  titles,
}: {
  visible: boolean;
  onClose: () => void;
  current: Persona | null;
  titles?: RoleTitles;
}) => {
  const options = useQuery(api.actingAs.options, visible ? {} : "skip");
  const { choose, error } = useChoose();
  const pick = (persona: Persona | null) => {
    void choose(persona).then((ok) => {
      if (ok) onClose();
    });
  };
  const roles: Persona[] = [{ role: "director" }, { role: "budgetManager" }];
  return (
    <OptionSheet
      visible={visible}
      title="Acting as"
      onClose={onClose}
      footer={error ? <ErrorBanner message={error} /> : undefined}
    >
      <View style={styles.intro}>
        <Muted>
          See the app the way someone in a role does. You can still only do what your own roles let
          you do.
        </Muted>
      </View>
      <ChoiceRow
        title={ALL_VIEWS_LABEL}
        caption="Every list, queue and form, the default"
        selected={current === null}
        onPress={() => pick(null)}
      />
      <GroupLabel>Roles</GroupLabel>
      {roles.map((persona) => (
        <ChoiceRow
          key={persona.role}
          title={personaLabel(persona, titles)}
          caption={personaHighlights(persona).join(" · ")}
          selected={samePersona(current, persona)}
          onPress={() => pick(persona)}
        />
      ))}
      <GroupLabel>Departments</GroupLabel>
      {options === undefined ? <LoadingState /> : null}
      {(options?.departments ?? []).map((department) => {
        const staff: Persona = { role: "staff", department: department.name };
        const head: Persona = { role: "head", department: department.name };
        const highlights = departmentHighlights(department.name);
        return (
          <ChoiceRow
            key={department.name}
            title={department.name}
            caption={highlights.length > 0 ? highlights.join(" · ") : department.division}
            selected={samePersona(current, staff) || samePersona(current, head)}
          >
            <View style={styles.chips}>
              <ChoiceChip
                label="Staff"
                accessibilityLabel={personaLabel(staff)}
                selected={samePersona(current, staff)}
                onPress={() => pick(staff)}
              />
              <ChoiceChip
                label="Head"
                accessibilityLabel={personaLabel(head)}
                selected={samePersona(current, head)}
                onPress={() => pick(head)}
              />
            </View>
          </ChoiceRow>
        );
      })}
    </OptionSheet>
  );
};

export const ActingAsControl = () => {
  const t = useAppTheme();
  const { actingAs, titles } = useActingAs();
  const { choose } = useChoose();
  const [open, setOpen] = useState(false);
  if (!actingAs) return null;
  const acting = actingAs.persona !== null;
  const label = actingAs.label ?? ALL_VIEWS_LABEL;
  return (
    <View style={styles.controlBlock}>
      <Text style={[styles.controlCaption, { color: t.muted }]}>Acting as</Text>
      <View style={styles.controlRow}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Acting as ${label}. Change who you're acting as`}
          style={({ pressed }) => [
            styles.control,
            { backgroundColor: acting ? t.accentSoft : t.ghost },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name={acting ? "eye" : "eye-outline"}
            size={15}
            color={acting ? t.accent : t.ghostText}
          />
          <Text
            numberOfLines={2}
            style={[styles.controlText, { color: acting ? t.accent : t.ghostText }]}
          >
            {label}
          </Text>
          <Ionicons name="chevron-down" size={14} color={acting ? t.accent : t.muted} />
        </Pressable>
        {acting ? (
          <Pressable
            onPress={() => void choose(null)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Stop acting as ${label} and go back to ${ALL_VIEWS_LABEL}`}
            style={({ pressed }) => [
              styles.reset,
              { backgroundColor: t.accentSoft },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="close" size={15} color={t.accent} />
          </Pressable>
        ) : null}
      </View>
      <ActingAsPicker
        visible={open}
        onClose={() => setOpen(false)}
        current={actingAs.persona}
        titles={titles}
      />
    </View>
  );
};

export const ActingAsChip = () => {
  const t = useAppTheme();
  const { actingAs } = useActingAs();
  const { choose } = useChoose();
  if (!actingAs?.persona) return null;
  const label = actingAs.label ?? "";
  return (
    <Pressable
      onPress={() => void choose(null)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Acting as ${label}. Tap to go back to ${ALL_VIEWS_LABEL}`}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: t.accent },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name="eye" size={12} color={t.onPrimary} />
      <Text numberOfLines={1} style={[styles.chipText, { color: t.onPrimary }]}>
        {label}
      </Text>
      <Ionicons name="close" size={12} color={t.onPrimary} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  intro: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  controlBlock: { gap: spacing.xs, marginTop: spacing.sm },
  controlCaption: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  control: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  controlText: { fontSize: 13, fontWeight: "700", letterSpacing: -0.1, flexShrink: 1 },
  reset: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 170,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  chipText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3, flexShrink: 1 },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  choiceText: { flex: 1, gap: 2 },
  selectedText: { fontWeight: "700" },
  chips: { flexDirection: "row", gap: spacing.xs },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  choiceChipText: { fontSize: 13, fontWeight: "700" },
  groupLabel: {
    ...typography.label,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontSize: 11,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
