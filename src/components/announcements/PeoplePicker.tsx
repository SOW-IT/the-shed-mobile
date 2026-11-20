import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  nameList,
  personMatches,
  type PersonOption,
  withAll,
  withoutAll,
} from "@shared/announcements";
import { Btn, Muted, OptionRow, OptionSheet, SearchField } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

export const PeoplePicker = ({
  people,
  values,
  onChange,
}: {
  people: readonly PersonOption[] | undefined;
  values: string[];
  onChange: (values: string[]) => void;
}) => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const everyone = people ?? [];
  const byEmail = new Map(everyone.map((person) => [person.email, person]));
  const chosen = new Set(values);
  const shown = everyone.filter((person) => personMatches(person, search));
  const allShownChosen = shown.length > 0 && shown.every((person) => chosen.has(person.email));
  const searching = search.trim() !== "";
  const display =
    values.length === 0
      ? "Pick people"
      : nameList(
          values.slice(0, 3).map((email) => byEmail.get(email)?.name ?? email),
          values.length
        );
  const toggle = (email: string) =>
    onChange(chosen.has(email) ? values.filter((v) => v !== email) : [...values, email]);
  const close = () => {
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <View style={styles.field}>
        <Text style={[typography.label, { color: t.muted }]}>People</Text>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`People: ${display}`}
          testID="announcement-people"
          style={({ pressed }) => [
            styles.face,
            { backgroundColor: t.inputBackground },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="person-add-outline" size={18} color={t.text} />
          <Text
            numberOfLines={1}
            style={[typography.body, { color: values.length ? t.text : t.faint, flex: 1 }]}
          >
            {display}
          </Text>
          <Ionicons name="chevron-down" size={16} color={t.faint} />
        </Pressable>
      </View>
      <OptionSheet
        visible={open}
        title={values.length ? `Choose people (${values.length})` : "Choose people"}
        onClose={close}
        footer={<Btn title="Done" onPress={close} />}
      >
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email or department"
        />
        <View style={styles.bulk}>
          <Btn
            title={
              allShownChosen
                ? searching
                  ? "Deselect these"
                  : "Deselect all"
                : searching
                  ? `Select these ${shown.length}`
                  : `Select all ${shown.length}`
            }
            icon={allShownChosen ? "square-outline" : "checkbox-outline"}
            variant="tonal"
            disabled={shown.length === 0}
            onPress={() => onChange(allShownChosen ? withoutAll(values, shown) : withAll(values, shown))}
          />
        </View>
        {people === undefined ? <Muted>Loading…</Muted> : null}
        {shown.map((person) => (
          <OptionRow
            key={person.email}
            label={person.name}
            detail={person.detail || (person.name === person.email ? undefined : person.email)}
            selected={chosen.has(person.email)}
            multi
            onPress={() => toggle(person.email)}
          />
        ))}
        {people !== undefined && shown.length === 0 ? (
          <Muted>{searching ? "No one matches." : "No leaders this year yet."}</Muted>
        ) : null}
      </OptionSheet>
    </>
  );
};

const styles = StyleSheet.create({
  field: { gap: 6 },
  face: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 46,
  },
  bulk: { paddingVertical: spacing.xs },
});
