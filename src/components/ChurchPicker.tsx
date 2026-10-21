import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  instagramUrl,
  MAX_SERVICES,
  type ServiceTime,
  WEEKDAYS,
  websiteLabel,
} from "../../shared/churches";
import { durations, radius, spacing, typography, useAppTheme } from "../theme";
import { NativeTimeInput } from "./NativeDateTimeField";
import { Btn, ErrorBanner, errorMessage, Field, OptionSheet, Select, Sheet } from "./ui";
import { WebTimeInput } from "./WebDateTimeInput";

export type Church = {
  _id: Id<"churches">;
  name: string;
  address: string | null;
  serviceTimes: string | null;
  services: ServiceTime[];
  website: string | null;
  instagram: string | null;
  location: { lat: number; lng: number } | null;
};

export const useCanEditChurches = () => Boolean(useQuery(api.directory.me)?.profile);

/** Opens a church's address in the phone's maps app (Apple Maps on iOS,
 *  Google Maps elsewhere and on the web). */
const openInMaps = (address: string) => {
  const query = encodeURIComponent(address);
  void Linking.openURL(
    Platform.OS === "ios"
      ? `https://maps.apple.com/?q=${query}`
      : `https://www.google.com/maps/search/?api=1&query=${query}`
  );
};

/** Where a church meets (tap for the map) and when. `bare` drops the tinted box, for a card of its own. */
export function ChurchDetails({ church, onEdit, bare }: { church: Church; onEdit?: () => void; bare?: boolean }) {
  const t = useAppTheme();
  return (
    <View style={[styles.details, bare ? styles.bare : { backgroundColor: t.inputBackground }]}>
      <Text style={[bare ? typography.title : typography.headline, { color: t.text }, bare && styles.bareTitle]}>
        {church.name}
      </Text>
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
      {church.website ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${church.name} website`}
          onPress={() => void Linking.openURL(church.website!)}
          style={({ pressed }) => [styles.detailRow, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="globe-outline" size={16} color={t.primary} />
          <Text style={[typography.body, styles.link, { color: t.primary }]} numberOfLines={1}>
            {websiteLabel(church.website)}
          </Text>
        </Pressable>
      ) : null}
      {church.instagram ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${church.name} on Instagram`}
          onPress={() => void Linking.openURL(instagramUrl(church.instagram!))}
          style={({ pressed }) => [styles.detailRow, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="logo-instagram" size={16} color={t.primary} />
          <Text style={[typography.body, styles.link, { color: t.primary }]} numberOfLines={1}>
            @{church.instagram}
          </Text>
        </Pressable>
      ) : null}
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

const DAY_OPTIONS = WEEKDAYS.map((day, index) => ({ label: day, value: String(index) }));
const TimeInput = Platform.OS === "web" ? WebTimeInput : NativeTimeInput;

function ServiceTimesField({
  services,
  onChange,
}: {
  services: ServiceTime[];
  onChange: (services: ServiceTime[]) => void;
}) {
  const t = useAppTheme();
  const change = (index: number, patch: Partial<ServiceTime>) =>
    onChange(services.map((service, i) => (i === index ? { ...service, ...patch } : service)));
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.label, { color: t.muted }]}>Service times</Text>
      {services.length === 0 ? (
        <Text style={[typography.caption, { color: t.muted }]}>None yet. Add the day and time each service starts.</Text>
      ) : null}
      {services.map((service, index) => (
        <View key={index} style={styles.serviceRow}>
          <View style={{ flex: 1 }}>
            <Select
              label="Day"
              value={String(service.day)}
              options={DAY_OPTIONS}
              onSelect={(day) => change(index, { day: Number(day) })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeInput label="Time" value={service.time} onChange={(time) => change(index, { time })} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove the ${WEEKDAYS[service.day]} service`}
            hitSlop={8}
            onPress={() => onChange(services.filter((_, i) => i !== index))}
            style={({ pressed }) => [styles.removeService, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close-circle" size={22} color={t.faint} />
          </Pressable>
        </View>
      ))}
      {services.length < MAX_SERVICES ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            onChange([...services, { day: services[services.length - 1]?.day ?? 0, time: services.length ? "" : "10:00" }])
          }
          style={({ pressed }) => [styles.addService, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="add-circle-outline" size={18} color={t.primary} />
          <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
            {services.length ? "Add another service" : "Add a service time"}
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
  onClose,
  onSaved,
}: {
  visible: boolean;
  church: Church | null;
  onClose: () => void;
  onSaved: (churchId: Id<"churches">) => void;
}) {
  const t = useAppTheme();
  const add = useMutation(api.churches.add);
  const update = useMutation(api.churches.update);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [services, setServices] = useState<ServiceTime[]>([]);
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Fill the form each time it opens.
  const openKey = visible ? (church?._id ?? "new") : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (openKey) {
      setName(church?.name ?? "");
      setAddress(church?.address ?? "");
      setServices(church?.services ?? []);
      setWebsite(church?.website ?? "");
      setInstagram(church?.instagram ? `@${church.instagram}` : "");
      setError(null);
    }
  }

  const missingTime = services.some((service) => !service.time);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const details = { name, address, services, website, instagram };
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
      footer={
        <Btn
          title={church ? "Save" : "Add church"}
          onPress={() => void save()}
          disabled={saving || !name.trim() || missingTime}
        />
      }
    >
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Harbour City Church" />
      <Field
        label="Where it meets"
        value={address}
        onChangeText={setAddress}
        placeholder="Street address, suburb"
      />
      <ServiceTimesField services={services} onChange={setServices} />
      {missingTime ? (
        <Text style={[typography.caption, { color: t.muted }]}>Pick a time for each service, or remove it.</Text>
      ) : null}
      <Field
        label="Website (optional)"
        value={website}
        onChangeText={setWebsite}
        placeholder="e.g. harbourcitychurch.com"
        keyboardType="url"
        autoCorrect={false}
      />
      <Field
        label="Instagram (optional)"
        value={instagram}
        onChangeText={setInstagram}
        placeholder="e.g. @harbourcitychurch"
        autoCorrect={false}
      />
      <ErrorBanner message={error} />
    </Sheet>
  );
}

/**
 * Who sees a church once it's set: a staff member's own church is on the
 * Churches page for anyone; a member's only for staff and campus leaders.
 */
export type ChurchVisibility = "yours-public" | "yours-leaders" | "member" | "staff-record";

const VISIBILITY_NOTES: Record<ChurchVisibility, string> = {
  "yours-public": "Anyone using The SHED can see your church, with your name, on the Churches page.",
  "yours-leaders": "Only staff and campus leaders can see your church.",
  member: "Only staff and campus leaders can see a member's church.",
  "staff-record": "They're on staff this year, so their church shows with their name on the Churches page for anyone using The SHED.",
};

/** Says who will see the church, shown under the picker and while picking. */
export function ChurchVisibilityNote({ visibility }: { visibility: ChurchVisibility }) {
  const t = useAppTheme();
  const open = visibility === "yours-public" || visibility === "staff-record";
  return (
    <View
      accessibilityRole="text"
      style={[
        styles.note,
        open ? { backgroundColor: t.warningSoft } : { backgroundColor: t.inputBackground },
      ]}
    >
      <Ionicons
        name={open ? "eye-outline" : "lock-closed-outline"}
        size={16}
        color={open ? t.warning : t.muted}
        style={{ marginTop: 1 }}
      />
      <Text style={[typography.caption, { color: open ? t.warning : t.muted, flex: 1 }, open && { fontWeight: "600" }]}>
        {VISIBILITY_NOTES[visibility]}
      </Text>
    </View>
  );
}

const VISIBILITY_TAGS: Record<ChurchVisibility, string> = {
  "yours-public": "Visible to everyone",
  "yours-leaders": "Staff and leaders only",
  member: "Staff and leaders only",
  "staff-record": "Visible to everyone",
};

function ChurchVisibilityTag({ visibility }: { visibility: ChurchVisibility }) {
  const t = useAppTheme();
  const open = visibility === "yours-public" || visibility === "staff-record";
  return (
    <View
      accessible
      accessibilityLabel={VISIBILITY_NOTES[visibility]}
      style={[styles.tag, { backgroundColor: open ? t.warningSoft : t.inputBackground }]}
    >
      <Ionicons name={open ? "eye-outline" : "lock-closed-outline"} size={13} color={open ? t.warning : t.muted} />
      <Text style={[typography.caption, { color: open ? t.warning : t.muted, fontWeight: "600" }]}>
        {VISIBILITY_TAGS[visibility]}
      </Text>
    </View>
  );
}

/**
 * A church dropdown over the shared list, with "Add a church" at the bottom
 * (which picks the new one). `onChange(null)` clears it. `visibility` says
 * who will see it, under the field and at the top of the list.
 */
export function ChurchSelect({
  label = "Local church",
  churchId,
  onChange,
  visibility,
}: {
  label?: string;
  churchId: Id<"churches"> | null;
  onChange: (churchId: Id<"churches"> | null) => void;
  visibility: ChurchVisibility;
}) {
  const t = useAppTheme();
  const churches = useQuery(api.churches.list);
  const canAdd = useCanEditChurches();
  const [listOpen, setListOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const selected = churches?.find((c) => c._id === churchId) ?? null;
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.labelRow}>
        <Text style={[typography.label, { color: t.muted, flex: 1 }]}>{label}</Text>
        <ChurchVisibilityTag visibility={visibility} />
      </View>
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
        <View style={styles.sheetNote}>
          <ChurchVisibilityNote visibility={visibility} />
        </View>
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
        {canAdd ? (
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
        ) : null}
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
export function ChurchPicker({ church }: { church: Church | null }) {
  const setChurch = useMutation(api.profile.setChurch);
  // Staff (campus leaders too) can edit churches, and theirs is on the Churches page for anyone.
  const canEdit = useCanEditChurches();
  const listed = useQuery(api.directory.me)?.listsChurch === true;
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
        visibility={listed ? "yours-public" : "yours-leaders"}
      />
      {church ? <ChurchDetails church={church} onEdit={canEdit ? () => setEditing(true) : undefined} /> : null}
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
  bare: { padding: 0, borderRadius: 0, paddingRight: spacing.xxl },
  bareTitle: { marginBottom: 2 },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  sheetNote: { marginBottom: spacing.sm },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
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
  serviceRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  removeService: { height: 44, justifyContent: "center" },
  addService: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", paddingVertical: 4 },
});
