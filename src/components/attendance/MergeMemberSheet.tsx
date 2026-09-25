import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { formatMetadataFieldValue } from "../../../shared/attendanceMemberMeta";
import { SYDNEY_TIME_ZONE } from "../../../shared/flow";
import type { MergeResolutions, MergeSide } from "../../../shared/memberMerge";
import {
  Btn,
  CannotUndo,
  dismissKeyboard,
  ErrorBanner,
  errorMessage,
  Field,
  LoadingState,
  OptionRow,
  Sheet,
  Txt,
  WarningBanner,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type Picked = {
  key: string;
  name: string;
  isStaff: boolean;
  email?: string;
  memberId?: Id<"attendanceMembers">;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type History = { events: number; lastAttended: number | null };

const historyLine = (h: History) =>
  h.events === 0
    ? "Not signed in to any events"
    : `${plural(h.events, "event")} · last ${new Date(h.lastAttended!).toLocaleDateString(
        "en-AU",
        { timeZone: SYDNEY_TIME_ZONE, day: "numeric", month: "short", year: "numeric" }
      )}`;

const sameTypedName = (typed: string, name: string) =>
  typed.trim().replace(/\s+/g, " ").toLowerCase() ===
  name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Merge a duplicate into the member (or staff person) being edited. Only a
 * plain member can be merged away: picking a staff person keeps them and
 * merges this member in, and a staff person can only take in members.
 */
export function MergeMemberSheet({
  visible,
  onClose,
  onMerged,
  memberId,
  memberEmail,
  isStaff,
  year,
  staffYear,
  removeViewedByDefault = false,
  initialStaff,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called with a one-line summary once the merge has succeeded. */
  onMerged: (summary: string) => void;
  memberId: Id<"attendanceMembers">;
  memberEmail?: string;
  isStaff: boolean;
  year: number;
  staffYear: number;
  /** Opened from "delete": the member being viewed is the one to get rid of. */
  removeViewedByDefault?: boolean;
  /** Opened from the Email field: go straight to merging into this staff person. */
  initialStaff?: { email: string; name: string } | null;
}) {
  const t = useAppTheme();
  const merge = useMutation(api.attendanceMembers.merge);
  // Every field, not just the event's groups: a merge carries them all, and a
  // conflict on another group's select field should still show its labels.
  const metadataFields = useQuery(api.attendanceMetadata.list, visible ? {} : "skip") ?? [];
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [removeViewed, setRemoveViewed] = useState(removeViewedByDefault);
  // Which pick has had its default direction settled (see the effect below).
  const [orientedFor, setOrientedFor] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<MergeResolutions>({});
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Once merged, the removed person is gone and a live preview would flash
  // "no longer exists" while the sheet closes.
  const [merged, setMerged] = useState(false);

  useEffect(() => {
    if (visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the sheet closes
    setSearch("");
    setDebouncedSearch("");
    setPicked(null);
    setMerged(false);
    setRemoveViewed(removeViewedByDefault);
    setOrientedFor(null);
    setResolutions({});
    setConfirmText("");
    setError(null);
  }, [visible, removeViewedByDefault]);

  useEffect(() => {
    if (!visible || !initialStaff) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preselect when opened for a staff email
    setPicked({
      key: `staff:${initialStaff.email}`,
      name: initialStaff.name,
      isStaff: true,
      email: initialStaff.email,
    });
  }, [visible, initialStaff]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const results = useQuery(
    api.attendanceMembers.list,
    visible && !picked && debouncedSearch
      ? {
          year: staffYear,
          search: debouncedSearch,
          paginationOpts: { numItems: 25, cursor: null },
        }
      : "skip"
  );
  const candidates = (results?.page ?? []).filter((row) => {
    if (row.memberId === memberId) return false;
    if (memberEmail && row.email?.toLowerCase() === memberEmail.toLowerCase()) {
      return false;
    }
    // Staff can only take in members, never another staff person.
    return !(isStaff && row.key.startsWith("staff:"));
  });

  // Staff are always the one kept. Between two members either can be kept,
  // and staff being edited always keep the member they pick.
  const canSwap = Boolean(picked && !picked.isStaff && !isStaff && picked.memberId);
  const mergeArgs = picked
    ? picked.isStaff && picked.email
      ? { removeId: memberId, keep: { staffEmail: picked.email }, staffYear }
      : picked.memberId
        ? canSwap && removeViewed
          ? { removeId: memberId, keep: { memberId: picked.memberId }, staffYear }
          : { removeId: picked.memberId, keep: { memberId }, staffYear }
        : null
    : null;
  const preview = useQuery(
    api.attendanceMembers.mergePreview,
    visible && mergeArgs && !merged ? mergeArgs : "skip"
  );
  const previewReady = preview && !("blocked" in preview) ? preview : null;
  // Between two members, keep whoever has more history by default, whichever
  // way the sheet was opened. Staff are always kept, so there's nothing to pick.
  const orienting = Boolean(canSwap && picked && orientedFor !== picked.key);
  useEffect(() => {
    if (!orienting || !previewReady || !picked) return;
    if (previewReady.remove.history.events > previewReady.keep.history.events) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- settle the default side once per pick
      setRemoveViewed((v) => !v);
    }
    setOrientedFor(picked.key);
  }, [orienting, previewReady, picked]);
  const ready = orienting ? null : previewReady;
  const blocked = preview && "blocked" in preview ? preview.blocked : null;

  const displayValue = (fieldId: string | undefined, value: string) => {
    const field = metadataFields.find((f) => f._id === fieldId);
    if (!field) return value;
    return formatMetadataFieldValue(field.key, value, year, field.values) || value;
  };

  const summary = (side: MergeSide) =>
    metadataFields
      .map((f) =>
        formatMetadataFieldValue(f.key, side.metadata[f._id] ?? "", year, f.values)
      )
      .filter(Boolean)
      .join(" · ");

  const onMerge = async () => {
    if (!mergeArgs || !ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await merge({ ...mergeArgs, resolutions });
      setMerged(true);
      await dismissKeyboard();
      onClose();
      onMerged(`Merged ${ready.remove.name} into ${ready.keep.name}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const personCard = (
    label: string,
    side: MergeSide & { history: History },
    tone: "keep" | "remove",
    staff: boolean
  ) => {
    const colour = tone === "keep" ? t.success : t.danger;
    const detail = summary(side);
    return (
      <View
        style={[
          styles.personCard,
          {
            borderColor: colour,
            backgroundColor: tone === "keep" ? t.successSoft : t.dangerSoft,
          },
        ]}
      >
        <Text style={[typography.label, { color: colour }]}>{label}</Text>
        <View style={styles.personNameRow}>
          <Txt style={[typography.headline, { color: t.text, flexShrink: 1 }]}>
            {side.name}
          </Txt>
          {staff ? (
            <View style={[styles.staffChip, { backgroundColor: t.card }]}>
              <Text style={[styles.staffChipText, { color: t.muted }]}>STAFF</Text>
            </View>
          ) : null}
        </View>
        {side.email ? (
          <Txt style={[typography.caption, { color: t.muted }]}>{side.email}</Txt>
        ) : null}
        {detail ? (
          <Txt style={[typography.caption, { color: t.muted }]}>{detail}</Txt>
        ) : null}
        <View style={styles.historyRow}>
          <Ionicons name="calendar-outline" size={14} color={t.text} />
          <Txt style={[typography.caption, { color: t.text, fontWeight: "700" }]}>
            {historyLine(side.history)}
          </Txt>
        </View>
      </View>
    );
  };

  const removeName = ready?.remove.name.trim() ?? "";

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={picked ? "Review merge" : "Merge duplicate"}
      footer={
        picked && ready ? (
          <View style={{ gap: spacing.sm }}>
            <Btn
              title="Merge"
              icon="git-merge-outline"
              loading={submitting}
              disabled={!removeName || !sameTypedName(confirmText, removeName)}
              onPress={() => void onMerge()}
            />
            <Btn
              title="Choose someone else"
              variant="ghost"
              onPress={() => {
                setPicked(null);
                setRemoveViewed(removeViewedByDefault);
                setOrientedFor(null);
                setResolutions({});
                setConfirmText("");
                setError(null);
              }}
            />
          </View>
        ) : picked ? (
          <Btn
            title="Choose someone else"
            variant="ghost"
            onPress={() => {
              setPicked(null);
              setRemoveViewed(removeViewedByDefault);
              setOrientedFor(null);
            }}
          />
        ) : null
      }
    >
      {!picked ? (
        <>
          <Txt style={[typography.body, { color: t.text }]}>
            Search for the duplicate. Their attendance moves across.{" "}
            {isStaff
              ? "Only members can be merged into staff."
              : "Picking staff merges this member into them."}
          </Txt>
          <View style={[styles.search, { backgroundColor: t.inputBackground }]}>
            <Ionicons name="search-outline" size={18} color={t.faint} />
            <TextInput
              style={[styles.searchInput, { color: t.text }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or email…"
              placeholderTextColor={t.faint}
              autoFocus
            />
          </View>
          {debouncedSearch && results === undefined ? (
            <LoadingState />
          ) : debouncedSearch && candidates.length === 0 ? (
            <Txt style={[typography.caption, { color: t.muted }]}>
              No one else matches “{debouncedSearch}”.
            </Txt>
          ) : (
            candidates.map((row) => {
              const rowIsStaff = row.key.startsWith("staff:");
              return (
                <Pressable
                  key={row.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Merge with ${row.name}`}
                  onPress={() => {
                    // Start the review at the top, not scrolled for the keyboard.
                    Keyboard.dismiss();
                    setPicked({
                      key: row.key,
                      name: row.name,
                      isStaff: rowIsStaff,
                      email: row.email,
                      memberId: row.memberId as Id<"attendanceMembers"> | undefined,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.candidate,
                    { backgroundColor: t.card, borderColor: t.separator },
                    pressed && { opacity: 0.66 },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt style={[typography.headline, { color: t.text }]} numberOfLines={1}>
                      {row.name}
                    </Txt>
                    {row.subtitle || row.email ? (
                      <Txt
                        style={[typography.caption, { color: t.muted }]}
                        numberOfLines={1}
                      >
                        {row.subtitle || row.email}
                      </Txt>
                    ) : null}
                  </View>
                  {rowIsStaff ? (
                    <View style={[styles.staffChip, { backgroundColor: t.ghost }]}>
                      <Text style={[styles.staffChipText, { color: t.ghostText }]}>
                        STAFF
                      </Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={18} color={t.faint} />
                </Pressable>
              );
            })
          )}
        </>
      ) : blocked ? (
        <ErrorBanner message={blocked} />
      ) : !ready ? (
        <LoadingState />
      ) : (
        <>
          {personCard("KEEPING", ready.keep, "keep", ready.keep.kind === "staff")}
          <View style={{ alignItems: "center" }}>
            <Ionicons name="arrow-up" size={20} color={t.muted} />
          </View>
          {personCard("MERGING IN, THEN REMOVING", ready.remove, "remove", false)}
          {canSwap && ready.remove.history.events > ready.keep.history.events ? (
            <WarningBanner
              message={`${ready.remove.name} has more history (${ready.remove.history.events} vs ${ready.keep.history.events} events). Swap to keep them?`}
            />
          ) : null}
          {canSwap ? (
            <Btn
              title="Swap which one is kept"
              icon="swap-vertical"
              variant="ghost"
              onPress={() => {
                setRemoveViewed((v) => !v);
                setResolutions({});
                setConfirmText("");
              }}
            />
          ) : null}
          <Txt style={[typography.body, { color: t.text }]}>
            {ready.attendance.total === 0
              ? "No attendance to move."
              : [
                  ready.attendance.moved > 0
                    ? `${plural(ready.attendance.moved, "record")} ${
                        ready.attendance.moved === 1 ? "moves" : "move"
                      } to ${ready.keep.name}.`
                    : "",
                  ready.attendance.shared > 0
                    ? `${plural(ready.attendance.shared, "shared event")} become${
                        ready.attendance.shared === 1 ? "s" : ""
                      } one record.`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
          </Txt>
          {ready.keep.kind === "staff" ? (
            <Txt style={[typography.caption, { color: t.muted }]}>
              Name, email, campus and role stay from the staff profile.
            </Txt>
          ) : null}
          <CannotUndo text={`${ready.remove.name} will be removed. This can't be undone.`} />
          {ready.conflicts.length > 0 ? (
            <>
              <Text style={[typography.label, { color: t.muted, marginTop: spacing.sm }]}>
                CHOOSE WHAT TO KEEP
              </Text>
              {ready.conflicts.map((conflict) => (
                <View key={conflict.field} style={{ gap: 2 }}>
                  <Txt style={[typography.headline, { color: t.text }]}>
                    {conflict.label}
                  </Txt>
                  <OptionRow
                    label={displayValue(conflict.metadataFieldId, conflict.keepValue)}
                    selected={resolutions[conflict.field] !== "remove"}
                    onPress={() =>
                      setResolutions((prev) => ({ ...prev, [conflict.field]: "keep" }))
                    }
                  />
                  <OptionRow
                    label={displayValue(conflict.metadataFieldId, conflict.removeValue)}
                    selected={resolutions[conflict.field] === "remove"}
                    onPress={() =>
                      setResolutions((prev) => ({ ...prev, [conflict.field]: "remove" }))
                    }
                  />
                </View>
              ))}
            </>
          ) : null}
          <Txt style={[typography.body, { color: t.text, marginTop: spacing.sm }]}>
            Type <Txt style={{ fontWeight: "800" }}>{removeName}</Txt> to confirm.
          </Txt>
          <Field
            label="Confirm name"
            testID="merge-confirm-name"
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={removeName}
          />
          <ErrorBanner message={error} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15 },
  candidate: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  personCard: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  personNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  staffChip: {
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  staffChipText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.2 },
});
