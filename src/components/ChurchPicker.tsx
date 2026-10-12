import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { durations, radius, spacing, typography, useAppTheme } from "../theme";
import { Btn, ErrorBanner, errorMessage, Field, OptionSheet, Sheet } from "./ui";

export type Church = {
  _id: Id<"churches">;
  name: string;
  address: string | null;
  serviceTimes: string | null;
};

/** Opens a church's address in the phone's maps app (Apple Maps on iOS,
 *  Google Maps elsewhere and on the web). */
export const openInMaps = (address: string) => {
  const query = encodeURIComponent(address);
  void Linking.openURL(
    Platform.OS === "ios"
      ? `https://maps.apple.com/?q=${query}`
      : `https://www.google.com/maps/search/?api=1&query=${query}`
  );
};

/** Where a church meets (tap for the map) and when. */
export function ChurchDetails({ church, onEdit }: { church: Church; onEdit?: () => void }) {
  const t = useAppTheme();
  return (
    <View style={[styles.details, { backgroundColor: t.inputBackground }]}>
      <Text style={[typography.headline, { color: t.text }]}>{church.name}</Text>
      {church.address ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${church.address}. Open in maps`}
          onPress={() => openInMaps(church.address!)}
          style={({ pressed }) => [styles.detailRow, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="location-outline" size={16} color={t.primary} />
          <Text style={[typography.body, styles.link, { color: t.primary }]}>{church.address}</Text>
        </Pressable>
      ) : (
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={16} color={t.faint} />
          <Text style={[typography.body, { color: t.muted, flex: 1 }]}>No location yet</Text>
        </View>
      )}
      <View style={styles.detailRow}>
        <Ionicons name="time-outline" size={16} color={church.serviceTimes ? t.text : t.faint} />
        <Text style={[typography.body, { color: church.serviceTimes ? t.text : t.muted, flex: 1 }]}>
          {church.serviceTimes ?? "No service times yet"}
        </Text>
      </View>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
          hitSlop={6}
          style={({ pressed }) => [styles.editLink, pressed && { opacity: 0.6 }]}
        >
          <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
            {church.address && church.serviceTimes ? "Edit details" : "Add the missing details"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Add a church to the list, or fix one that's there. */
export function ChurchForm({
  visible,
  church,
  initialName,
  onClose,
  onSaved,
}: {
  visible: boolean;
  church: Church | null;
  initialName?: string;
  onClose: () => void;
  onSaved: (churchId: Id<"churches">) => void;
}) {
  const add = useMutation(api.churches.add);
  const update = useMutation(api.churches.update);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [serviceTimes, setServiceTimes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Fill the form each time it opens.
  const openKey = visible ? (church?._id ?? `new:${initialName ?? ""}`) : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (openKey) {
      setName(church?.name ?? initialName ?? "");
      setAddress(church?.address ?? "");
      setServiceTimes(church?.serviceTimes ?? "");
      setError(null);
    }
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const details = { name, address, serviceTimes };
      if (church) {
        await update({ churchId: church._id, ...details });
        onSaved(church._id);
      } else {
        onSaved(await add(details));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={church ? "Edit church" : "Add a church"}
      footer={<Btn title={church ? "Save" : "Add church"} onPress={() => void save()} disabled={saving || !name.trim()} />}
    >
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Harbour City Church" />
      <Field
        label="Where it meets"
        value={address}
        onChangeText={setAddress}
        placeholder="Street address, suburb"
      />
      <Field
        label="Service times"
        value={serviceTimes}
        onChangeText={setServiceTimes}
        placeholder="e.g. Sunday 10am and 12pm"
      />
      <ErrorBanner message={error} />
    </Sheet>
  );
}

/**
 * A church dropdown over the shared list, with "Add a church" at the bottom
 * (which picks the new one). `onChange(null)` clears it.
 */
export function ChurchSelect({
  label = "Local church",
  churchId,
  onChange,
  addName,
}: {
  label?: string;
  churchId: Id<"churches"> | null;
  onChange: (churchId: Id<"churches"> | null) => void;
  /** A likely name for a church to add (what someone typed before). */
  addName?: string;
}) {
  const t = useAppTheme();
  const churches = useQuery(api.churches.list);
  const [listOpen, setListOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const selected = churches?.find((c) => c._id === churchId) ?? null;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.name ?? "not set"}. Change`}
        onPress={() => setListOpen(true)}
        style={({ pressed }) => [
          styles.face,
          { backgroundColor: t.inputBackground, borderColor: t.separator },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text style={[typography.body, { color: selected ? t.text : t.muted, flex: 1 }]} numberOfLines={1}>
          {selected?.name ?? "Pick a church"}
        </Text>
        <Ionicons name="chevron-down" size={18} color={t.muted} />
      </Pressable>

      <OptionSheet visible={listOpen} title={label} onClose={() => setListOpen(false)}>
        {(churches ?? []).map((option) => {
          const on = option._id === churchId;
          return (
            <Pressable
              key={option._id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setListOpen(false);
                onChange(option._id);
              }}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: on ? t.primarySoft : t.inputBackground },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.headline, { color: t.text }]}>{option.name}</Text>
                {option.serviceTimes ? (
                  <Text style={[typography.caption, { color: t.muted }]}>{option.serviceTimes}</Text>
                ) : null}
                {option.address ? (
                  <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
                    {option.address}
                  </Text>
                ) : null}
              </View>
              {on ? <Ionicons name="checkmark" size={20} color={t.primary} /> : null}
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setListOpen(false);
            // iOS can't show the form while the list is still fading out.
            setTimeout(() => setAdding(true), durations.overlayOut + 80);
          }}
          style={({ pressed }) => [
            styles.option,
            styles.addOption,
            { borderColor: t.separator },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add-circle-outline" size={20} color={t.primary} />
          <Text style={[typography.headline, { color: t.primary, flex: 1 }]}>Add a church</Text>
        </Pressable>
        {churchId ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setListOpen(false);
              onChange(null);
            }}
            style={({ pressed }) => [styles.clear, pressed && { opacity: 0.6 }]}
          >
            <Text style={[typography.caption, { color: t.muted, fontWeight: "600" }]}>Clear</Text>
          </Pressable>
        ) : null}
      </OptionSheet>

      <ChurchForm
        visible={adding}
        church={null}
        initialName={addName}
        onClose={() => setAdding(false)}
        onSaved={(id) => {
          setAdding(false);
          onChange(id);
        }}
      />
    </View>
  );
}

/** Your local church in your Profile: picked from the list, with its details. */
export function ChurchPicker({
  church,
  typedChurch,
}: {
  church: Church | null;
  /** What they typed before churches were a list. */
  typedChurch: string | null;
}) {
  const t = useAppTheme();
  const setChurch = useMutation(api.profile.setChurch);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (churchId: Id<"churches"> | null) => {
    setError(null);
    try {
      await setChurch({ churchId });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <ChurchSelect
        churchId={church?._id ?? null}
        onChange={(id) => void choose(id)}
        addName={typedChurch ?? undefined}
      />
      {!church && typedChurch ? (
        <Text style={[typography.caption, { color: t.muted }]}>
          You wrote “{typedChurch}”. Pick it from the list, or add it with where it meets and when.
        </Text>
      ) : null}
      {church ? <ChurchDetails church={church} onEdit={() => setEditing(true)} /> : null}
      <ErrorBanner message={error} />
      <ChurchForm
        visible={editing}
        church={church}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  details: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  link: { flex: 1, textDecorationLine: "underline" },
  editLink: { alignSelf: "flex-start", paddingTop: spacing.xs },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  addOption: { borderWidth: 1, borderStyle: "dashed" },
  clear: { alignSelf: "center", paddingVertical: spacing.sm },
});
